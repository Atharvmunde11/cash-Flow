const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const net = require("net");
const path = require("path");
const { runPackagedMigrations } = require("./apply-sql-migrations");
const {
  checkForUpdates,
  downloadUpdate,
  getAppVersion,
  isPackagedApp,
  quitAndInstall,
  setAutoUpdaterContext,
  setupAutoUpdater,
} = require("./auto-updater");

let nextServerProcess = null;
let nextServerPort = null;
let packagedServerPort = null;
/** @type {import("electron").BrowserWindow | null} */
let mainBrowserWindow = null;
let autoUpdaterStarted = false;

function ensureAutoUpdater() {
  if (autoUpdaterStarted || !app.isPackaged) return;
  autoUpdaterStarted = true;
  setupAutoUpdater();
}

function getNodeExecutablePath() {
  // process.execPath is the running binary — most reliable on Windows (incl. arm64).
  const candidates = [process.execPath];
  try {
    const exe = app.getPath("exe");
    if (exe) candidates.push(exe);
  } catch {
    /* ignore */
  }

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "string") continue;
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      /* ignore */
    }
  }

  return process.execPath;
}

/** Standalone Next server lives in resources/standalone (outside app.asar). */
function getStandaloneDir() {
  if (!app.isPackaged) {
    return path.join(process.cwd(), ".next", "standalone");
  }

  const fromResources = path.join(process.resourcesPath, "standalone");
  if (fs.existsSync(path.join(fromResources, "server.js"))) {
    return fromResources;
  }

  // Legacy layouts from older installers
  const asarPath = app.getAppPath();
  const unpackedRoot = asarPath.endsWith(".asar")
    ? `${asarPath.slice(0, -".asar".length)}.unpacked`
    : asarPath;
  const legacyUnpacked = path.join(unpackedRoot, ".next", "standalone");
  if (fs.existsSync(path.join(legacyUnpacked, "server.js"))) {
    return legacyUnpacked;
  }

  return path.join(asarPath, ".next", "standalone");
}

function startupLogPath() {
  return path.join(app.getPath("userData"), "cashflow-startup.log");
}

function logStartup(message, detail) {
  try {
    const line = `[${new Date().toISOString()}] ${message}${detail != null ? `\n${typeof detail === "string" ? detail : detail.stack || String(detail)}` : ""}\n\n`;
    fs.appendFileSync(startupLogPath(), line, "utf8");
  } catch {
    /* ignore */
  }
}

function loadBundledEnv() {
  const standaloneDir = app.isPackaged ? getStandaloneDir() : null;
  const envFiles = [
    standaloneDir ? path.join(standaloneDir, ".env") : null,
    path.join(process.resourcesPath, "standalone", ".env"),
    path.join(process.cwd(), ".env"),
  ].filter(Boolean);

  for (const envFile of envFiles) {
    if (!fs.existsSync(envFile)) continue;

    const lines = fs.readFileSync(envFile, "utf8").split(/\r?\n/);

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;

      const separatorIndex = line.indexOf("=");
      if (separatorIndex === -1) continue;

      const key = line.slice(0, separatorIndex).trim();
      if (!key || process.env[key]) continue;

      let value = line.slice(separatorIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      process.env[key] = value;
    }

    return;
  }
}

/**
 * Packaged app: use a writable SQLite file in userData (not the read-only app folder).
 * Must run before the Next standalone server loads so Prisma resolves the same path.
 * Returns the URL string so the spawn env can set DATABASE_URL last (wins over .env).
 */
function setPackagedDatabaseUrl() {
  const dbPath = path.join(app.getPath("userData"), "cashflow.db");
  // Prisma SQLite URLs are **not** standard file:// URLs on Windows.
  // `pathToFileURL()` produces `file:///C:/...` which can trip Prisma with:
  // "The specified path is invalid (os error 161)".
  // Prisma expects: `file:C:/path/to/db` (note: no `//`).
  const prismaFileUrl = `file:${dbPath.replace(/\\\\/g, "/")}`;
  process.env.DATABASE_URL = prismaFileUrl;
  return prismaFileUrl;
}

/**
 * Apply SQL migrations to the packaged userData database.
 * Uses better-sqlite3 directly — the Prisma CLI bundle is often incomplete in installers.
 * @returns {boolean} true when migrations succeeded
 */
function runDatabaseMigrations(standaloneDir, databaseUrl) {
  try {
    const result = runPackagedMigrations({ databaseUrl, standaloneDir });
    logStartup(
      `SQL migrations completed (applied=${result.applied.length}, skipped=${result.skipped.length})`,
      result.applied.length ? result.applied.join(", ") : undefined,
    );
    return true;
  } catch (error) {
    logStartup("SQL migrations failed", error);
    return false;
  }
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port =
        address && typeof address === "object" ? address.port : undefined;

      server.close(() => {
        if (port) {
          resolve(port);
        } else {
          reject(new Error("Could not determine a free port for Electron."));
        }
      });
    });

    server.on("error", reject);
  });
}

function waitForServer(port, timeoutMs = 30000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const socket = net.createConnection({ port, host: "127.0.0.1" });

      socket.once("connect", () => {
        socket.end();
        resolve();
      });

      socket.once("error", () => {
        socket.destroy();
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error("Timed out waiting for the packaged app server."));
          return;
        }
        setTimeout(tryConnect, 250);
      });
    };

    tryConnect();
  });
}

/**
 * Run the Next standalone server in a separate process (Electron as Node via
 * ELECTRON_RUN_AS_NODE). Avoids loading native addons in the main process, which
 * can hard-crash the whole app on ABI mismatch or load failures.
 */
function spawnPackagedNextServer(standaloneDir, serverPath, port, databaseUrl) {
  const child = spawn(getNodeExecutablePath(), [serverPath], {
    cwd: standaloneDir,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
      // Must win over any DATABASE_URL read from standalone/.env by Next at startup
      ...(databaseUrl ? { DATABASE_URL: databaseUrl } : {}),
    },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout?.on("data", (chunk) => {
    logStartup("[next stdout]", chunk.toString());
  });
  child.stderr?.on("data", (chunk) => {
    logStartup("[next stderr]", chunk.toString());
  });

  return child;
}

async function startPackagedNextServer() {
  if (nextServerProcess && !nextServerProcess.killed && packagedServerPort != null) {
    return packagedServerPort;
  }

  loadBundledEnv();

  let packagedDatabaseUrl = null;
  if (app.isPackaged) {
    packagedDatabaseUrl = setPackagedDatabaseUrl();
    const migrationsOk = runDatabaseMigrations(getStandaloneDir(), packagedDatabaseUrl);
    if (!migrationsOk) {
      throw new Error(
        `Database setup failed. See log:\n${startupLogPath()}`,
      );
    }
  }

  const port = await getFreePort();
  const standaloneDir = getStandaloneDir();
  const serverPath = path.join(standaloneDir, "server.js");

  process.env.HOSTNAME = "127.0.0.1";
  process.env.PORT = String(port);
  process.env.NODE_ENV = "production";

  if (!fs.existsSync(serverPath)) {
    throw new Error(
      `Missing packaged server at ${serverPath}. Rebuild the desktop app.`,
    );
  }

  logStartup(`Starting Next server from ${serverPath}`);

  const child = spawnPackagedNextServer(
    standaloneDir,
    serverPath,
    port,
    packagedDatabaseUrl,
  );

  child.on("error", (err) => {
    logStartup("Next server spawn error", err);
  });

  nextServerProcess = child;
  packagedServerPort = port;

  const serverReady = waitForServer(port);
  const processDied = new Promise((_, reject) => {
    child.once("exit", (code, signal) => {
      if (code !== 0 && code !== null) {
        reject(
          new Error(
            `Next server exited before listening (code ${code}, signal ${signal || "none"}). See log: ${startupLogPath()}`,
          ),
        );
      }
    });
  });

  try {
    await Promise.race([serverReady, processDied]);
  } catch (e) {
    try {
      child.kill();
    } catch {
      /* ignore */
    }
    nextServerProcess = null;
    packagedServerPort = null;
    throw e;
  }

  return port;
}

function getAppIconPath() {
  const candidates = [
    path.join(process.resourcesPath, "standalone", "public", "icon.png"),
    path.join(__dirname, "..", "public", "icon.png"),
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      /* ignore */
    }
  }
  return undefined;
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1200,
    minHeight: 720,
    autoHideMenuBar: true,
    icon: getAppIconPath(),
    webPreferences: {
      preload: path.join(__dirname, "main", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (app.isPackaged) {
    try {
      const port = await startPackagedNextServer();
      nextServerPort = port;
      await win.loadURL(`http://localhost:${port}`);
    } catch (error) {
      const logFile = startupLogPath();
      logStartup("createWindow / packaged server failed", error);
      dialog.showErrorBox(
        "CashFlow — startup failed",
        `${error instanceof Error ? error.message : String(error)}\n\nLog file:\n${logFile}`,
      );
      app.quit();
      return;
    }
  } else {
    const devUrl = process.env.ELECTRON_START_URL || "http://localhost:3000";
    try {
      const u = new URL(devUrl);
      nextServerPort = u.port ? Number(u.port) : 3000;
    } catch {
      nextServerPort = 3000;
    }
    await win.loadURL(devUrl);
    win.webContents.openDevTools();
    win.webContents.on("did-fail-load", (e, code) => {
      if (code !== -102) {
        win.webContents.reloadIgnoringCache();
      }
    });
  }

  mainBrowserWindow = win;
  setAutoUpdaterContext({ log: logStartup, window: win });
  ensureAutoUpdater();
}

function sanitizeFilename(name) {
  return String(name || "bill")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function isValidBillId(id) {
  return typeof id === "string" && /^[a-z0-9]{20,32}$/i.test(id);
}

ipcMain.handle("cashflow:get-app-version", () => getAppVersion());
ipcMain.handle("cashflow:check-for-updates", () => checkForUpdates());
ipcMain.handle("cashflow:download-update", () => downloadUpdate());
ipcMain.handle("cashflow:quit-and-install", () => {
  quitAndInstall();
  return { ok: true };
});

ipcMain.handle("cashflow:save-bill-pdf", async (_event, payload) => {
  const billId =
    payload && typeof payload.billId === "string" ? payload.billId : "";
  const billNumber =
    payload && typeof payload.billNumber === "string"
      ? payload.billNumber
      : "bill";

  if (!isValidBillId(billId)) throw new Error("Invalid billId");
  const port = nextServerPort || Number(process.env.PORT) || 3000;

  const url = `http://127.0.0.1:${port}/api/bills/${encodeURIComponent(billId)}/pdf`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || "Failed to download PDF");
  }

  const arr = new Uint8Array(await res.arrayBuffer());
  const documentsDir = app.getPath("documents");
  const targetDir = path.join(documentsDir, "cashFlow");
  fs.mkdirSync(targetDir, { recursive: true });

  const filePath = path.join(targetDir, `${sanitizeFilename(billNumber)}.pdf`);
  fs.writeFileSync(filePath, Buffer.from(arr));

  return {
    ok: true,
    filePath,
    folder: targetDir,
  };
});

process.on("uncaughtException", (error) => {
  logStartup("uncaughtException", error);
  try {
    dialog.showErrorBox("CashFlow — error", error.stack || String(error));
  } catch {
    /* ignore */
  }
});

process.on("unhandledRejection", (reason) => {
  logStartup("unhandledRejection", reason);
});

app.on("ready", () => {
  logStartup(`app ready (packaged=${app.isPackaged}) appPath=${app.getAppPath()}`);
  createWindow().catch((error) => {
    logStartup("Failed to create Electron window", error);
    console.error("Failed to create Electron window:", error);
    try {
      dialog.showErrorBox(
        "CashFlow — startup failed",
        `${error instanceof Error ? error.message : String(error)}\n\nLog:\n${startupLogPath()}`,
      );
    } catch {
      /* ignore */
    }
    app.quit();
  });
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow().catch((error) => {
      logStartup("Failed to recreate Electron window", error);
      console.error("Failed to recreate Electron window:", error);
      app.quit();
    });
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (nextServerProcess) {
    try {
      nextServerProcess.kill();
    } catch {
      /* ignore */
    }
    nextServerProcess = null;
  }
});
