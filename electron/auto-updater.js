const { app, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");

/** @type {((message: string, detail?: unknown) => void) | null} */
let logFn = null;

/** @type {import("electron").BrowserWindow | null} */
let mainWindow = null;

/** @type {Promise<{ status: string; version?: string; message?: string }> | null} */
let pendingCheck = null;

function setAutoUpdaterContext({ log, window }) {
  logFn = log;
  mainWindow = window;
}

function log(message, detail) {
  if (logFn) logFn(message, detail);
}

/** Turn raw electron-updater HTTP errors into short user-facing text. */
function formatUpdateError(error) {
  const raw = error instanceof Error ? error.message : String(error);

  if (raw.includes("latest.yml") && raw.includes("404")) {
    return (
      "Update metadata missing on GitHub Releases. The release needs latest.yml " +
      "(x64) and latest-arm64.yml (arm64) uploaded alongside the .exe installers."
    );
  }
  if (raw.includes("latest-arm64.yml") && raw.includes("404")) {
    return (
      "ARM64 update metadata missing on GitHub Releases. Upload latest-arm64.yml " +
      "from dist/ to the release."
    );
  }
  if (raw.includes("404")) {
    return "No release found on GitHub, or release assets are incomplete.";
  }

  const firstLine = raw.split("\n")[0]?.trim() ?? raw;
  return firstLine.length > 220 ? `${firstLine.slice(0, 217)}…` : firstLine;
}

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function setupAutoUpdater() {
  if (!app.isPackaged) return;

  // GitHub Releases: x64 reads latest.yml, arm64 reads latest-arm64.yml.
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;
  autoUpdater.allowPrerelease = false;
  log(
    `autoUpdater: arch=${process.arch} version=${app.getVersion()} ` +
      `(expects ${process.arch === "arm64" ? "latest-arm64.yml" : "latest.yml"})`,
  );

  autoUpdater.on("checking-for-update", () => {
    log("autoUpdater: checking");
    sendToRenderer("cashflow:update-status", { status: "checking" });
  });

  autoUpdater.on("update-available", (info) => {
    log("autoUpdater: update available", info.version);
    sendToRenderer("cashflow:update-status", {
      status: "available",
      version: info.version,
    });

    if (pendingCheck) {
      pendingCheck.resolve({
        status: "available",
        version: info.version,
      });
      pendingCheck = null;
    }
  });

  autoUpdater.on("update-not-available", (info) => {
    log("autoUpdater: up to date", info.version);
    sendToRenderer("cashflow:update-status", {
      status: "not-available",
      version: info.version,
    });

    if (pendingCheck) {
      pendingCheck.resolve({
        status: "not-available",
        version: info.version,
      });
      pendingCheck = null;
    }
  });

  autoUpdater.on("error", (error) => {
    const message = formatUpdateError(error);
    log("autoUpdater: error", error);
    sendToRenderer("cashflow:update-status", { status: "error", message });

    if (pendingCheck) {
      pendingCheck.resolve({ status: "error", message });
      pendingCheck = null;
    }
  });

  autoUpdater.on("download-progress", (progress) => {
    sendToRenderer("cashflow:update-status", {
      status: "downloading",
      percent: progress.percent,
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    log("autoUpdater: downloaded", info.version);
    sendToRenderer("cashflow:update-status", {
      status: "downloaded",
      version: info.version,
    });

    dialog
      .showMessageBox({
        type: "info",
        title: "CashFlow update ready",
        message: `Version ${info.version} has been downloaded.`,
        detail: "Restart CashFlow to install the update.",
        buttons: ["Restart now", "Later"],
        defaultId: 0,
        cancelId: 1,
      })
      .then(({ response }) => {
        if (response === 0) {
          autoUpdater.quitAndInstall(false, true);
        }
      })
      .catch(() => {
        /* ignore */
      });
  });

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((error) => {
      log("autoUpdater: startup check failed", error);
    });
  }, 15_000);
}

function checkForUpdates() {
  if (!app.isPackaged) {
    return Promise.resolve({
      status: "dev",
      message: "Updates are checked only in the installed desktop app.",
    });
  }

  if (pendingCheck) {
    return pendingCheck.promise;
  }

  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });

  pendingCheck = { promise, resolve };

  autoUpdater.checkForUpdates().catch((error) => {
    const message = formatUpdateError(error);
    if (pendingCheck) {
      pendingCheck.resolve({ status: "error", message });
      pendingCheck = null;
    }
  });

  return promise;
}

function downloadUpdate() {
  if (!app.isPackaged) {
    return Promise.resolve({ ok: false, message: "Not available in dev mode." });
  }
  return autoUpdater.downloadUpdate().then(() => ({ ok: true }));
}

function quitAndInstall() {
  if (!app.isPackaged) return;
  autoUpdater.quitAndInstall(false, true);
}

function getAppVersion() {
  return app.getVersion();
}

function isPackagedApp() {
  return app.isPackaged;
}

module.exports = {
  checkForUpdates,
  downloadUpdate,
  getAppVersion,
  isPackagedApp,
  quitAndInstall,
  setAutoUpdaterContext,
  setupAutoUpdater,
};
