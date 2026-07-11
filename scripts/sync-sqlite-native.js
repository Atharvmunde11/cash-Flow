/**
 * Next/Turbopack may trace better-sqlite3 under hashed package names
 * (e.g. better-sqlite3-90e2652d1716b047) in multiple places:
 *   - standalone/node_modules/
 *   - standalone/.next/node_modules/   <-- runtime often loads from here
 *
 * electron-rebuild only updates the canonical better-sqlite3 folder — copy the
 * rebuilt .node into every copy found under the standalone tree.
 */
const fs = require("fs");
const path = require("path");

function walkForNativeBinaries(dir, depth, found) {
  if (depth > 16) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory() || ent.isSymbolicLink()) {
      walkForNativeBinaries(full, depth + 1, found);
    } else if (ent.name === "better_sqlite3.node") {
      found.push(full);
    }
  }
}

function findNativeBinaryPaths(root) {
  const found = [];
  for (const sub of ["node_modules", path.join(".next", "node_modules")]) {
    const start = path.join(root, sub);
    if (fs.existsSync(start)) {
      walkForNativeBinaries(start, 0, found);
    }
  }
  return found;
}

function syncSqliteNative(standaloneRoot) {
  const root = path.resolve(standaloneRoot);
  if (!fs.existsSync(root)) {
    console.warn("sync-sqlite-native: missing standalone root", root);
    return;
  }

  const source = path.join(
    root,
    "node_modules",
    "better-sqlite3",
    "build",
    "Release",
    "better_sqlite3.node",
  );

  if (!fs.existsSync(source)) {
    console.warn("sync-sqlite-native: rebuilt binary not found at", source);
    return;
  }

  const sourceResolved = path.resolve(source);
  const targets = findNativeBinaryPaths(root).filter(
    (p) => path.resolve(p) !== sourceResolved,
  );
  let copied = 0;

  for (const dest of targets) {
    try {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(source, dest);
      copied += 1;
    } catch (err) {
      console.warn("sync-sqlite-native: failed to copy to", dest, err);
    }
  }

  if (copied > 0) {
    console.log(`sync-sqlite-native: copied binary to ${copied} location(s)`);
  } else {
    console.warn("sync-sqlite-native: no alias copies found under", root);
  }
}

const standaloneRoot =
  process.argv[2] ?? path.join(process.cwd(), ".next", "standalone");

if (require.main === module) {
  syncSqliteNative(standaloneRoot);
}

module.exports = { syncSqliteNative, findNativeBinaryPaths };
