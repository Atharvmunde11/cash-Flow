import path from "path";
import { fileURLToPath } from "url";

/**
 * Repo root when the server runs as `node .next/standalone/server.js` from the repo,
 * or when cwd is `.next/standalone` (common when tutorials say to `cd` into standalone).
 * In those cases relative paths like `./dev.db` must not be resolved against cwd alone.
 */
export function getAppProjectRoot(): string {
  const cwd = process.cwd();
  const normalized = path.normalize(cwd);
  const marker = `${path.sep}.next${path.sep}standalone`;
  const idx = normalized.lastIndexOf(marker);
  if (idx !== -1) {
    return normalized.slice(0, idx);
  }
  return cwd;
}

/** Absolute filesystem path to the SQLite file (no `file:` prefix). */
export function resolveSqliteFilePath(): string {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) {
    return path.join(getAppProjectRoot(), "dev.db");
  }
  if (!raw.startsWith("file:")) {
    return path.isAbsolute(raw) ? raw : path.resolve(getAppProjectRoot(), raw);
  }
  const rest = raw.slice("file:".length);
  if (rest.startsWith("./") || rest.startsWith("../") || rest === ".") {
    return path.resolve(getAppProjectRoot(), rest);
  }
  try {
    return fileURLToPath(new URL(raw));
  } catch {
    if (path.isAbsolute(rest)) {
      return rest;
    }
    return path.resolve(getAppProjectRoot(), rest);
  }
}
