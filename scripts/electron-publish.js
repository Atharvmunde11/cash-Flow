/**
 * Build (optional) and publish Windows x64 + arm64 installers to GitHub Releases.
 *
 * electron-builder's --publish always uploads latest.yml per arch and the arm64
 * build overwrites the x64 manifest. This script:
 *   1. Builds both arches (unless --upload-only)
 *   2. Preserves latest.yml (x64) + latest-arm64.yml
 *   3. Creates/updates the GitHub release with the correct assets
 *
 * Usage:
 *   node scripts/electron-publish.js              # build both + upload
 *   node scripts/electron-publish.js --upload-only # upload existing dist/
 */
require("./load-gh-token");

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const uploadOnly = process.argv.includes("--upload-only");
const version = require("../package.json").version;
const tag = `v${version}`;
const distDir = path.join(process.cwd(), "dist");
const repo = "Atharvmunde11/cash-Flow";

function resolveGhBin() {
  const which = spawnSync(
    process.platform === "win32" ? "where" : "which",
    ["gh"],
    { encoding: "utf8", shell: true },
  );
  if ((which.status ?? 1) === 0 && which.stdout.trim()) {
    return which.stdout.trim().split(/\r?\n/)[0];
  }
  const candidates = [
    path.join(process.env.ProgramFiles || "", "GitHub CLI", "gh.exe"),
    path.join(process.env.LOCALAPPDATA || "", "Programs", "GitHub CLI", "gh.exe"),
  ];
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return "gh";
}

const ghBin = resolveGhBin();

if (!process.env.GH_TOKEN && !process.env.GITHUB_TOKEN) {
  console.error(
    "Missing GH_TOKEN. Add it to .env or set $env:GH_TOKEN before publishing.",
  );
  process.exit(1);
}

const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
process.env.GH_TOKEN = token;
process.env.GITHUB_TOKEN = token;

function run(label, command, args, opts = {}) {
  console.log(`\n> ${label}: ${command} ${args.join(" ")}\n`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    // Avoid shell:true when command is an absolute Windows path with spaces.
    shell: false,
    env: process.env,
    ...opts,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function runCapture(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: false,
    env: process.env,
  });
  return {
    status: result.status ?? 1,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim(),
  };
}

function requiredDistFiles() {
  const files = [
    `CashFlow-x64-Setup-${version}.exe`,
    `CashFlow-x64-Setup-${version}.exe.blockmap`,
    `CashFlow-arm64-Setup-${version}.exe`,
    `CashFlow-arm64-Setup-${version}.exe.blockmap`,
    "latest.yml",
    "latest-arm64.yml",
  ];
  const missing = files.filter((name) => !fs.existsSync(path.join(distDir, name)));
  if (missing.length) {
    console.error("Missing dist assets:\n  - " + missing.join("\n  - "));
    process.exit(1);
  }
  return files.map((name) => path.join(distDir, name));
}

function assertManifests() {
  const latest = fs.readFileSync(path.join(distDir, "latest.yml"), "utf8");
  const arm = fs.readFileSync(path.join(distDir, "latest-arm64.yml"), "utf8");

  if (!latest.includes(`CashFlow-x64-Setup-${version}.exe`)) {
    console.error(
      `latest.yml must point at CashFlow-x64-Setup-${version}.exe (x64 auto-update).`,
    );
    process.exit(1);
  }
  if (!arm.includes(`CashFlow-arm64-Setup-${version}.exe`)) {
    console.error(
      `latest-arm64.yml must point at CashFlow-arm64-Setup-${version}.exe.`,
    );
    process.exit(1);
  }
  if (latest.includes("arm64")) {
    console.error("latest.yml looks like an arm64 manifest — restore the x64 copy.");
    process.exit(1);
  }
}

if (!uploadOnly) {
  run("build both arches", "npm", ["run", "electron-build"]);
}

const assets = requiredDistFiles();
assertManifests();

const releaseNotes = [
  `CashFlow ${version}`,
  "",
  "## Highlights",
  "- Financial year locking (Indian Apr–Mar) and Settings close controls",
  "- Financial Reports: balance sheet, P&L, cash flow, retained earnings",
  "- Multi-file import picker and in-app update notifications",
  "",
  "Windows installers:",
  `- x64: CashFlow-x64-Setup-${version}.exe`,
  `- arm64: CashFlow-arm64-Setup-${version}.exe`,
  "",
  "Auto-update manifests:",
  "- latest.yml (x64)",
  "- latest-arm64.yml (arm64)",
  "",
  "Upgrading keeps your local SQLite database in the app userData folder.",
  "",
  "See CHANGELOG.md for the full list.",
].join("\n");

const notesPath = path.join(distDir, `.release-notes-${version}.md`);
fs.writeFileSync(notesPath, releaseNotes, "utf8");

const existing = runCapture(ghBin, [
  "release",
  "view",
  tag,
  "--repo",
  repo,
  "--json",
  "id",
]);

if (existing.status === 0) {
  console.log(`\nRelease ${tag} already exists — uploading/replacing assets…\n`);
} else {
  run("create GitHub release", ghBin, [
    "release",
    "create",
    tag,
    "--repo",
    repo,
    "--title",
    `CashFlow ${version}`,
    "--notes-file",
    notesPath,
  ]);
}

run("upload release assets", ghBin, [
  "release",
  "upload",
  tag,
  "--repo",
  repo,
  "--clobber",
  ...assets,
]);

console.log(`\nPublished CashFlow ${version} (${tag}) to GitHub Releases.`);
console.log(`https://github.com/${repo}/releases/tag/${tag}\n`);
console.log("Verified assets:");
for (const asset of assets) {
  console.log(`  - ${path.basename(asset)}`);
}
console.log("");
