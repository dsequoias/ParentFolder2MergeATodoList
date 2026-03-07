/**
 * Creates assets/sounds/reminder.wav - a short beep for in-app reminders.
 * Run once: node scripts/create-reminder-sound.js
 */
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'assets', 'sounds');
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const sampleRate = 8000;
const durationSec = 0.4;
const freq = 880;
const numSamples = Math.floor(sampleRate * durationSec);
const numChannels = 1;
const bitsPerSample = 8;
const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
const blockAlign = numChannels * (bitsPerSample / 8);
const dataSize = numSamples * blockAlign;
const headerSize = 44;
const fileSize = headerSize + dataSize;

const buf = Buffer.alloc(headerSize + dataSize);
let offset = 0;

function writeStr(s) {
  buf.write(s, offset);
  offset += s.length;
}
function writeU32(n) {
  buf.writeUInt32LE(n, offset);
  offset += 4;
}
function writeU16(n) {
  buf.writeUInt16LE(n, offset);
  offset += 2;
}

writeStr('RIFF');
writeU32(fileSize - 8);
writeStr('WAVE');
writeStr('fmt ');
writeU32(16);
writeU16(1); // PCM
writeU16(numChannels);
writeU32(sampleRate);
writeU32(byteRate);
writeU16(blockAlign);
writeU16(bitsPerSample);
writeStr('data');
writeU32(dataSize);

for (let i = 0; i < numSamples; i++) {
  const t = i / sampleRate;
  const sample = Math.sin(2 * Math.PI * freq * t) * 0.3;
  const byte = Math.floor(128 + sample * 127);
  buf.writeUInt8(Math.max(0, Math.min(255, byte)), offset);
  offset++;
}

const outPath = path.join(dir, 'reminder.wav');
try {
  fs.writeFileSync(outPath, buf);
  console.log('Created', outPath);
} catch (e) {
  console.warn('Could not create reminder.wav:', e.message);
}
