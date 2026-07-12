const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const standaloneRoot = path.join(projectRoot, ".next", "standalone");
const publicSource = path.join(projectRoot, "public");
const publicTarget = path.join(standaloneRoot, "public");
const staticSource = path.join(projectRoot, ".next", "static");
const staticTarget = path.join(standaloneRoot, ".next", "static");
const standaloneNodeModules = path.join(standaloneRoot, "node_modules");

function ensureBuildExists(targetPath, description) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`${description} not found at ${targetPath}. Run next build first.`);
  }
}

function copyDirectory(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true, force: true });
}

ensureBuildExists(standaloneRoot, "Standalone Next build");
ensureBuildExists(staticSource, "Next static assets");

if (fs.existsSync(publicSource)) {
  copyDirectory(publicSource, publicTarget);
}

copyDirectory(staticSource, staticTarget);

/**
 * Ensure native SQLite addon is present inside the standalone output.
 *
 * In Electron packaged builds, the Next standalone server runs from
 * `.next/standalone/server.js` and must be able to `require("better-sqlite3")`.
 * Depending on Next tracing/externalization, the module (and its native `.node`)
 * may not be copied into standalone automatically, causing runtime 500s.
 */
function ensureNativeAddonInStandalone(pkgName) {
  const from = path.join(projectRoot, "node_modules", pkgName);
  const to = path.join(standaloneNodeModules, pkgName);
  if (!fs.existsSync(from)) {
    console.warn(`Warning: ${pkgName} not found at ${from}. Skipping copy.`);
    return;
  }
  copyDirectory(from, to);
}

ensureNativeAddonInStandalone("better-sqlite3");
ensureNativeAddonInStandalone("bindings");
ensureNativeAddonInStandalone("prisma");
ensureNativeAddonInStandalone("@prisma/engines");
ensureNativeAddonInStandalone("@prisma/engines-version");
ensureNativeAddonInStandalone("@prisma/fetch-engine");
ensureNativeAddonInStandalone("@prisma/get-platform");
ensureNativeAddonInStandalone("@prisma/debug");
ensureNativeAddonInStandalone("@prisma/config");
ensureNativeAddonInStandalone("@prisma/client");
ensureNativeAddonInStandalone(".prisma");

function ensurePrismaMigrationsInStandalone() {
  const prismaSrc = path.join(projectRoot, "prisma");
  const prismaDest = path.join(standaloneRoot, "prisma");
  fs.mkdirSync(prismaDest, { recursive: true });

  const schemaSrc = path.join(prismaSrc, "schema.prisma");
  if (fs.existsSync(schemaSrc)) {
    fs.copyFileSync(schemaSrc, path.join(prismaDest, "schema.prisma"));
  }

  const migrationsSrc = path.join(prismaSrc, "migrations");
  const migrationsDest = path.join(prismaDest, "migrations");
  if (fs.existsSync(migrationsSrc)) {
    copyDirectory(migrationsSrc, migrationsDest);
  }

  for (const name of ["dev.db", "dev.db-shm", "dev.db-wal"]) {
    const dbPath = path.join(prismaDest, name);
    if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { force: true });
  }
}

ensurePrismaMigrationsInStandalone();

const prismaConfigSrc = path.join(projectRoot, "prisma.config.ts");
if (fs.existsSync(prismaConfigSrc)) {
  fs.copyFileSync(prismaConfigSrc, path.join(standaloneRoot, "prisma.config.ts"));
}

/**
 * Turbopack (Next 16) sometimes externalizes server deps using hashed "virtual"
 * package names like `better-sqlite3-<hash>` / `@prisma/client-<hash>`.
 *
 * In standalone output, those alias packages may be missing, leading to:
 * "Cannot find module 'better-sqlite3-...'" at runtime.
 *
 * We scan built server chunks for these names and generate tiny alias packages
 * that re-export the real deps.
 */
function ensureExternalAliasPackages() {
  const chunksRoot = path.join(standaloneRoot, ".next", "server", "chunks");
  if (!fs.existsSync(chunksRoot)) return;

  const aliasMap = new Map(); // aliasName -> realName

  /** Recursively walk chunks and collect alias names. */
  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (ent.isFile() && (ent.name.endsWith(".js") || ent.name.endsWith(".cjs"))) {
        let content = "";
        try {
          content = fs.readFileSync(full, "utf8");
        } catch {
          continue;
        }

        // better-sqlite3-<hash>
        for (const m of content.matchAll(/\bbetter-sqlite3-[a-f0-9]{8,}\b/g)) {
          aliasMap.set(m[0], "better-sqlite3");
        }

        // @prisma/client-<hash>
        for (const m of content.matchAll(/\B@prisma\/client-[a-f0-9]{8,}\b/g)) {
          aliasMap.set(m[0], "@prisma/client");
        }
      }
    }
  }

  walk(chunksRoot);

  for (const [aliasName, realName] of aliasMap.entries()) {
    const parts = aliasName.split("/");
    const pkgDir =
      parts.length === 2
        ? path.join(standaloneNodeModules, parts[0], parts[1])
        : path.join(standaloneNodeModules, aliasName);

    fs.mkdirSync(pkgDir, { recursive: true });

    const pkgJsonPath = path.join(pkgDir, "package.json");
    const indexPath = path.join(pkgDir, "index.js");

    const pkgJson = {
      name: aliasName,
      private: true,
      main: "index.js",
    };

    fs.writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2), "utf8");
    fs.writeFileSync(
      indexPath,
      `module.exports = require(${JSON.stringify(realName)});\n`,
      "utf8",
    );
  }

  if (aliasMap.size > 0) {
    console.log(
      `Created ${aliasMap.size} Turbopack external alias package(s) in standalone node_modules.`,
    );
  }
}

ensureExternalAliasPackages();

/**
 * Next.js loads .env* from the standalone folder at runtime and can override
 * process.env. If DATABASE_URL points at ./dev.db (or similar), it would replace
 * the value Electron sets for the per-user DB under userData and break the
 * packaged app (wrong DB, read-only path, or missing tables).
 */
function stripDatabaseUrlFromEnvFiles(dir) {
  const names = [".env", ".env.local", ".env.production", ".env.development"];
  for (const name of names) {
    const envPath = path.join(dir, name);
    if (!fs.existsSync(envPath)) continue;
    const raw = fs.readFileSync(envPath, "utf8");
    const lines = raw.split(/\r?\n/).filter((line) => {
      const t = line.trim();
      if (!t || t.startsWith("#")) return true;
      return !/^DATABASE_URL\s*=/.test(t);
    });
    fs.writeFileSync(envPath, lines.join("\n"), "utf8");
  }
}

stripDatabaseUrlFromEnvFiles(standaloneRoot);

for (const name of ["dev.db", "dev.db-shm", "dev.db-wal"]) {
  const dbPath = path.join(standaloneRoot, name);
  if (fs.existsSync(dbPath)) {
    fs.rmSync(dbPath, { force: true });
  }
}

console.log("Prepared standalone Next assets for Electron packaging.");
