/**
 * Resizes assets/ddicon.png to 1024x1024 (icon centered, transparent padding) for Expo/Android.
 * Preserves transparency. Run: npm run fix-icon
 */
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const input = path.join(root, 'assets', 'ddicon.png');
const output = path.join(root, 'assets', 'ddicon.png');
const temp = path.join(root, 'assets', 'ddicon-1024.png');

await sharp(input)
  .ensureAlpha()
  .resize(1024, 1024, { fit: 'contain', position: 'center', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toFile(temp);

fs.renameSync(temp, output);
console.log('Icon saved as 1024x1024 (transparent padding):', output);
