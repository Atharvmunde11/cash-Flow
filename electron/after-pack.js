/**
 * Copy the full Next standalone output (including node_modules) into the
 * packaged app. electron-builder extraResources excludes node_modules by default.
 */
const fs = require("fs");
const path = require("path");

/** @param {import("app-builder-lib").AfterPackContext} context */
exports.default = async function afterPack(context) {
  const src = path.join(context.packager.projectDir, ".next", "standalone");
  const dest = path.join(context.appOutDir, "resources", "standalone");

  if (!fs.existsSync(path.join(src, "server.js"))) {
    throw new Error(`Missing Next standalone build at ${src}. Run npm run build first.`);
  }

  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true, force: true });

  for (const name of ["dev.db", "dev.db-shm", "dev.db-wal"]) {
    const dbPath = path.join(dest, name);
    if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { force: true });
  }

  const { syncSqliteNative } = require(path.join(
    context.packager.projectDir,
    "scripts",
    "sync-sqlite-native.js",
  ));
  syncSqliteNative(dest);
};
