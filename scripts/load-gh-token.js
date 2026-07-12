/**
 * Load GH_TOKEN / GITHUB_TOKEN from .env for electron-builder publish.
 * Does not overwrite if already set in the environment.
 */
const fs = require("fs");
const path = require("path");

const envPath = path.join(process.cwd(), ".env");
if (!fs.existsSync(envPath)) return;

for (const rawLine of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line || line.startsWith("#")) continue;

  const eq = line.indexOf("=");
  if (eq === -1) continue;

  const key = line.slice(0, eq).trim();
  if (key !== "GH_TOKEN" && key !== "GITHUB_TOKEN") continue;
  if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN) return;

  let value = line.slice(eq + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  if (value) process.env.GH_TOKEN = value;
}
