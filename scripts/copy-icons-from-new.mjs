/**
 * Replaces all app icon images with the image from NewICon.png.
 * Icon filenames stay the same (ddicon.png, splash.png, etc.); only the image content is replaced.
 * Run: node scripts/copy-icons-from-new.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.join(__dirname, '..', 'assets');
const source = path.join(assetsDir, 'NewICon.png');

const iconFiles = [
  'ddicon.png',
  'splash.png',
  'favicon.png',
  'adaptive-icon.png',
];

if (!fs.existsSync(source)) {
  console.error('Source image not found: assets/NewICon.png');
  process.exit(1);
}

const buffer = fs.readFileSync(source);
for (const name of iconFiles) {
  const dest = path.join(assetsDir, name);
  fs.writeFileSync(dest, buffer);
  console.log('Updated', name);
}
console.log('Done. All icon images now use NewICon.png.');
