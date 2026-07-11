/** Generate public/icon.ico from public/icon.png (required by NSIS installer). */
const fs = require("fs");
const path = require("path");

async function main() {
  const pngPath = path.join(__dirname, "..", "public", "icon.png");
  const icoPath = path.join(__dirname, "..", "public", "icon.ico");

  if (!fs.existsSync(pngPath)) {
    console.error("Missing public/icon.png");
    process.exit(1);
  }

  const pngToIco = (await import("png-to-ico")).default;
  const buf = await pngToIco(pngPath);
  fs.writeFileSync(icoPath, buf);
  console.log(`Wrote ${icoPath} (${buf.length} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
