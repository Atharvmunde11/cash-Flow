const { spawnSync } = require("child_process");
const path = require("path");
const { syncSqliteNative } = require("./sync-sqlite-native");

const arch = process.argv[2];
if (arch !== "x64" && arch !== "arm64") {
  console.error("Usage: node scripts/electron-rebuild-standalone.js <x64|arm64>");
  process.exit(1);
}

const electronVersion = require("electron/package.json").version;
const standaloneRoot = path.join(process.cwd(), ".next", "standalone");

const result = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  [
    "electron-rebuild",
    "-f",
    "-w",
    "better-sqlite3",
    "-m",
    ".next/standalone",
    "--arch",
    arch,
    "--version",
    electronVersion,
  ],
  { stdio: "inherit", shell: process.platform === "win32" },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

syncSqliteNative(standaloneRoot);
process.exit(0);
