const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function migrationChecksum(sql) {
  return crypto.createHash("sha256").update(sql, "utf8").digest("hex");
}

function prismaFileUrlToPath(databaseUrl) {
  const raw = databaseUrl.trim();
  if (!raw.startsWith("file:")) {
    return path.isAbsolute(raw) ? raw : path.resolve(raw);
  }
  const rest = raw.slice("file:".length);
  if (rest.startsWith("./") || rest.startsWith("../") || rest === ".") {
    return path.resolve(rest);
  }
  return rest;
}

function ensureMigrationsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "checksum" TEXT NOT NULL,
      "finished_at" DATETIME,
      "migration_name" TEXT NOT NULL,
      "logs" TEXT,
      "rolled_back_at" DATETIME,
      "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0
    );
  `);
}

function getAppliedMigrations(db) {
  const rows = db
    .prepare(
      'SELECT "migration_name" FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL',
    )
    .all();
  return new Set(rows.map((row) => row.migration_name));
}

/**
 * Apply Prisma SQL migrations directly via better-sqlite3.
 * Used in packaged Electron where the Prisma CLI bundle is often incomplete.
 *
 * Safety notes for upgrades:
 * - Never deletes the userData SQLite file — only applies pending migrations.
 * - Already-finished migrations are skipped (no re-run / no data wipe).
 * - Additive migrations should use CREATE IF NOT EXISTS / runtime column adds.
 *
 * @returns {{ applied: string[], skipped: string[] }}
 */
function applySqlMigrations(dbPath, migrationsDir, Database) {
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations folder not found: ${migrationsDir}`);
  }

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  const applied = [];
  const skipped = [];

  try {
    // Keep existing books readable during schema upgrades.
    db.pragma("foreign_keys = ON");
    ensureMigrationsTable(db);
    const alreadyApplied = getAppliedMigrations(db);

    const migrationFolders = fs
      .readdirSync(migrationsDir)
      .filter((name) => {
        const full = path.join(migrationsDir, name);
        return fs.statSync(full).isDirectory();
      })
      .sort();

    for (const folder of migrationFolders) {
      const sqlPath = path.join(migrationsDir, folder, "migration.sql");
      if (!fs.existsSync(sqlPath)) continue;

      if (alreadyApplied.has(folder)) {
        skipped.push(folder);
        continue;
      }

      const sql = fs.readFileSync(sqlPath, "utf8");
      const checksum = migrationChecksum(sql);
      const id = crypto.randomUUID();

      db.prepare(
        `INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "started_at")
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
      ).run(id, checksum, folder);

      try {
        // Immediate transaction: commit schema changes only if the whole
        // migration SQL succeeds. Failed upgrades leave prior data intact.
        db.exec("BEGIN IMMEDIATE");
        db.exec(sql);
        db.exec("COMMIT");
        db.prepare(
          `UPDATE "_prisma_migrations"
           SET "finished_at" = CURRENT_TIMESTAMP, "applied_steps_count" = 1
           WHERE "id" = ?`,
        ).run(id);
        applied.push(folder);
      } catch (error) {
        try {
          db.exec("ROLLBACK");
        } catch {
          /* ignore */
        }
        db.prepare(`UPDATE "_prisma_migrations" SET "logs" = ? WHERE "id" = ?`).run(
          error instanceof Error ? error.message : String(error),
          id,
        );
        throw error;
      }
    }
  } finally {
    db.close();
  }

  return { applied, skipped };
}

function loadBetterSqlite3(standaloneDir) {
  const modPath = path.join(standaloneDir, "node_modules", "better-sqlite3");
  if (!fs.existsSync(path.join(modPath, "package.json"))) {
    throw new Error(`better-sqlite3 not found in standalone at ${modPath}`);
  }
  // eslint-disable-next-line import/no-dynamic-require, global-require
  return require(modPath);
}

/**
 * @param {{ databaseUrl: string, standaloneDir: string }} options
 * @returns {{ applied: string[], skipped: string[] }}
 */
function runPackagedMigrations({ databaseUrl, standaloneDir }) {
  const dbPath = prismaFileUrlToPath(databaseUrl);
  const migrationsDir = path.join(standaloneDir, "prisma", "migrations");
  const Database = loadBetterSqlite3(standaloneDir);
  return applySqlMigrations(dbPath, migrationsDir, Database);
}

module.exports = {
  applySqlMigrations,
  loadBetterSqlite3,
  prismaFileUrlToPath,
  runPackagedMigrations,
};
