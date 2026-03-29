/**
 * Creates assets/sounds/reminder.wav - an alarm-style beep-beep-beep for in-app reminders.
 * Run once: node scripts/create-reminder-sound.js
 */
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'assets', 'sounds');
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const sampleRate = 16000;
const numChannels = 1;
const bitsPerSample = 8;
const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
const blockAlign = numChannels * (bitsPerSample / 8);

// Alarm pattern: 3 clear beeps (0.2s on, 0.12s off) then short pause; ~1.2s total, loops as beep-beep-beep
const freq = 1200;
const volume = 0.75;
const beepOnSamples = Math.floor(sampleRate * 0.2);
const beepOffSamples = Math.floor(sampleRate * 0.12);
const pauseSamples = Math.floor(sampleRate * 0.25);
const beep = (n) => {
  const samples = [];
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * freq * t) * volume;
    samples.push(sample);
  }
  return samples;
};
const silence = (n) => Array(n).fill(0);

const part1 = beep(beepOnSamples);
const part0 = silence(beepOffSamples);
const partPause = silence(pauseSamples);
const pattern = [
  ...part1, ...part0, ...part1, ...part0, ...part1, ...partPause,
];
const numSamples = pattern.length;
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
writeU16(1);
writeU16(numChannels);
writeU32(sampleRate);
writeU32(byteRate);
writeU16(blockAlign);
writeU16(bitsPerSample);
writeStr('data');
writeU32(dataSize);

for (let i = 0; i < numSamples; i++) {
  const sample = pattern[i];
  const byte = Math.floor(128 + sample * 127);
  buf.writeUInt8(Math.max(0, Math.min(255, byte)), offset);
  offset++;
}

const outPath = path.join(dir, 'reminder.wav');
try {
  fs.writeFileSync(outPath, buf);
  console.log('Created', outPath, '(alarm-style beep-beep-beep)');
} catch (e) {
  console.warn('Could not create reminder.wav:', e.message);
}
