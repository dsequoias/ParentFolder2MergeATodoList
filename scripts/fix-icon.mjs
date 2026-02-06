/**
 * Crops assets/ddicon.png to 1024x1024 (center crop) so it meets Expo's square icon requirement.
 * Run once: npm install sharp --save-dev && node scripts/fix-icon.mjs
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
  .resize(1024, 1024, { fit: 'cover', position: 'center' })
  .toFile(temp);

fs.renameSync(temp, output);
console.log('Icon saved as 1024x1024:', output);
