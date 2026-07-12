/**
 * electron-builder writes dist/latest.yml per build; arm64 overwrites x64.
 * Keep both manifests so GitHub Releases can serve arch-specific auto-updates.
 */
const fs = require("fs");
const path = require("path");

const distDir = path.join(process.cwd(), "dist");
const latestPath = path.join(distDir, "latest.yml");
const arch = process.argv[2];

if (arch !== "x64" && arch !== "arm64") {
  console.error("Usage: node scripts/preserve-update-manifest.js <x64|arm64>");
  process.exit(1);
}

if (!fs.existsSync(latestPath)) {
  console.warn("preserve-update-manifest: dist/latest.yml not found, skipping.");
  process.exit(0);
}

if (arch === "x64") {
  fs.copyFileSync(latestPath, path.join(distDir, ".latest-x64.yml.backup"));
  console.log("preserve-update-manifest: kept x64 manifest as dist/latest.yml");
} else {
  fs.copyFileSync(latestPath, path.join(distDir, "latest-arm64.yml"));
  console.log("preserve-update-manifest: wrote dist/latest-arm64.yml");

  const backup = path.join(distDir, ".latest-x64.yml.backup");
  if (fs.existsSync(backup)) {
    fs.copyFileSync(backup, latestPath);
    fs.rmSync(backup, { force: true });
    console.log("preserve-update-manifest: restored dist/latest.yml for x64");
  }
}

console.log("\nUpload to GitHub Release:");
console.log("  - dist/latest.yml          (x64 auto-update)");
console.log("  - dist/latest-arm64.yml    (arm64 auto-update)");
console.log("  - dist/CashFlow-x64-Setup-*.exe");
console.log("  - dist/CashFlow-arm64-Setup-*.exe");
