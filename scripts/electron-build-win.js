/**
 * Build Windows installers for each CPU architecture.
 * Rebuilds better-sqlite3 in .next/standalone per arch so native binaries match the target.
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ARCHES = ["x64", "arm64"];

function run(label, command, args) {
  console.log(`\n> ${label}: ${command} ${args.join(" ")}\n`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run("prep", "npm", ["run", "electron-build:prep"]);

for (const arch of ARCHES) {
  run(
    `rebuild better-sqlite3 (${arch})`,
    "node",
    ["scripts/electron-rebuild-standalone.js", arch],
  );

  run(`electron-builder (${arch})`, "npx", [
    "electron-builder",
    "--win",
    `--${arch}`,
  ]);

  run(`preserve update manifest (${arch})`, "node", [
    "scripts/preserve-update-manifest.js",
    arch,
  ]);
}

run("restore better-sqlite3 for Node dev", "npm", ["run", "rebuild-sqlite-for-node"]);

console.log("\nDone. Installers and update manifests are in dist/\n");
console.log("Release upload checklist:");
for (const name of [
  "latest.yml",
  "latest-arm64.yml",
  "CashFlow-x64-Setup-*.exe",
  "CashFlow-arm64-Setup-*.exe",
]) {
  const matches =
    name.includes("*")
      ? fs.readdirSync(path.join(process.cwd(), "dist")).filter((f) =>
          f.startsWith("CashFlow-x64-Setup-") || f.startsWith("CashFlow-arm64-Setup-"),
        )
      : [name];
  if (!name.includes("*")) {
    console.log(`  - dist/${name}`);
  } else {
    for (const f of [...new Set(matches)]) console.log(`  - dist/${f}`);
  }
}
console.log("");
