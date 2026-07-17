import { stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const outDir = path.resolve(import.meta.dirname, "..", "generated");
const meta = await sharp(path.join(outDir, "icon-256.png")).metadata();
if (meta.width !== 256 || meta.height !== 256) {
  throw new Error(`icon-256.png is ${meta.width}x${meta.height}, expected 256x256`);
}
const ico = await stat(path.join(outDir, "icon.ico"));
if (ico.size < 1000) throw new Error(`icon.ico is ${ico.size} bytes, looks empty`);
const svg = await stat(path.join(outDir, "favicon.svg"));
if (svg.size < 500) throw new Error("favicon.svg looks empty");
console.log("branding assets OK");
