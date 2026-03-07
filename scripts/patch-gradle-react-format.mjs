#!/usr/bin/env node
/**
 * Patches graphicsConversions.h in the Gradle transform cache so that
 * Android build works with NDK 26 (no std::format). Run before expo run:android.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gradleCaches = path.join(process.env.USERPROFILE || process.env.HOME, '.gradle', 'caches');
const badLine = 'return std::format("{}%", dimension.value);';
const goodLine = 'return folly::dynamic(std::to_string(dimension.value) + "%");';

function* walkDir(dir, depth = 0) {
  if (depth > 20) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      yield* walkDir(full, depth + 1);
    } else if (e.isFile() && e.name === 'graphicsConversions.h') {
      const relative = path.relative(gradleCaches, full).replace(/\\/g, '/');
      // Match transform cache paths like .../transformed/react-android-.../.../react/renderer/core/...
      if (relative.includes('react-android') && relative.includes('react/renderer/core')) {
        yield full;
      }
    }
  }
}

function findFiles() {
  const out = [];
  for (const p of walkDir(gradleCaches)) out.push(p);
  return out;
}

const files = findFiles();
if (files.length === 0) {
  console.log('patch-gradle-react-format: No graphicsConversions.h found in Gradle cache (run a build first to populate it).');
  process.exit(0);
}

let patched = 0;
for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  if (!content.includes(badLine)) continue;
  content = content.replace(badLine, goodLine);
  fs.writeFileSync(file, content, 'utf8');
  console.log('Patched:', file);
  patched++;
}

if (patched === 0) {
  console.log('patch-gradle-react-format: No file needed patching (already fixed or different layout).');
} else {
  console.log('patch-gradle-react-format: Patched', patched, 'file(s). You can run expo run:android now.');
}
