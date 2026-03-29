/**
 * Removes white/near-white square background from icon images (makes them transparent).
 * Uses sharp to set alpha = 0 where pixel is white. Updates all app icon files.
 * Run: node scripts/remove-icon-white-background.mjs
 */
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.join(__dirname, '..', 'assets');

/** Pixels with R,G,B all >= this value are made transparent (0-255). Increase (e.g. 250) to remove only pure white; decrease (e.g. 235) to remove off-white too. */
const WHITE_THRESHOLD = 245;

const iconFiles = [
  'NewICon.png',
  'ddicon.png',
  'splash.png',
  'favicon.png',
  'adaptive-icon.png',
];

async function makeWhiteTransparent(inputPath, outputPath) {
  const pipeline = sharp(inputPath).ensureAlpha();
  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r >= WHITE_THRESHOLD && g >= WHITE_THRESHOLD && b >= WHITE_THRESHOLD) {
      data[i + 3] = 0;
    }
  }

  await sharp(data, {
    raw: { width, height, channels },
  })
    .png()
    .toFile(outputPath);
}

const source = path.join(assetsDir, 'NewICon.png');
if (!fs.existsSync(source)) {
  console.error('Source not found: assets/NewICon.png');
  process.exit(1);
}

const tempOut = path.join(assetsDir, 'icon-no-bg.png');
await makeWhiteTransparent(source, tempOut);
console.log('Created transparent version.');

const transparentBuffer = fs.readFileSync(tempOut);
for (const name of iconFiles) {
  const dest = path.join(assetsDir, name);
  fs.writeFileSync(dest, transparentBuffer);
  console.log('Updated', name);
}
fs.unlinkSync(tempOut);
console.log('Done. White background removed from all icons.');
