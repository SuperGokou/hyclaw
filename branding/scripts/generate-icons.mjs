import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import decodeIco from "decode-ico";
import pngToIco from "png-to-ico";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const sourceIco = path.join(root, "source", "efd-logo.ico");
const outDir = path.join(root, "generated");
const PNG_SIZES = [16, 24, 32, 48, 64, 128, 180, 256, 512];
const ICO_SIZES = new Set([16, 24, 32, 48, 64, 128, 256]);

const images = decodeIco(await readFile(sourceIco));
const largest = images.reduce((a, b) => (b.width > a.width ? b : a));
const base =
  largest.type === "png"
    ? sharp(Buffer.from(largest.data))
    : sharp(Buffer.from(largest.data), {
        raw: { width: largest.width, height: largest.height, channels: 4 },
      });
const basePng = await base.png().toBuffer();

await mkdir(outDir, { recursive: true });
const icoInputs = [];
for (const size of PNG_SIZES) {
  const file = path.join(outDir, `icon-${size}.png`);
  await sharp(basePng)
    .resize(size, size, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    })
    .png()
    .toFile(file);
  if (ICO_SIZES.has(size)) icoInputs.push(file);
}
await writeFile(path.join(outDir, "icon.ico"), await pngToIco(icoInputs));

const png256 = await readFile(path.join(outDir, "icon-256.png"));
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><image href="data:image/png;base64,${png256.toString("base64")}" width="256" height="256"/></svg>\n`;
await writeFile(path.join(outDir, "favicon.svg"), svg);

console.log(
  `generated ${PNG_SIZES.length} PNGs + icon.ico + favicon.svg (source layer: ${largest.width}px)`,
);
