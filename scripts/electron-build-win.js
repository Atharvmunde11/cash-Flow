/**
 * Build Windows installers for each CPU architecture.
 * Rebuilds better-sqlite3 in .next/standalone per arch so native binaries match the target.
 */
const { spawnSync } = require("child_process");

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
}

run("restore better-sqlite3 for Node dev", "npm", ["run", "rebuild-sqlite-for-node"]);

console.log("\nDone. Installers are in dist/\n");
