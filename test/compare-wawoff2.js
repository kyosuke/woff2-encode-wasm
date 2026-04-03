/**
 * Compare WOFF2 output from woff2-encode-wasm vs wawoff2.
 *
 * Checks:
 *  1. Byte-for-byte equality
 *  2. If not equal: size difference, header comparison, structural diff
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Load both libraries ---
const wasmBuf = readFileSync(join(__dirname, '..', 'dist', 'encoder.wasm'));
const { init, encode } = await import(join(__dirname, '..', 'dist', 'index.js'));
const wawoff2 = await import('wawoff2');

// --- Test fonts ---
const ttfPath = join(__dirname, 'fixtures', 'Abel-Regular.ttf');
const ttfBytes = new Uint8Array(readFileSync(ttfPath));

console.log(`Input font: Abel-Regular.ttf (${ttfBytes.length} bytes)\n`);

// --- Encode with woff2-encode-wasm ---
await init(wasmBuf);
const ours = await encode(ttfBytes);
console.log(`woff2-encode-wasm: ${ours.length} bytes`);

// --- Encode with wawoff2 ---
const theirs = new Uint8Array(await wawoff2.default.compress(ttfBytes));
console.log(`wawoff2:           ${theirs.length} bytes`);

// --- Compare ---
console.log('');

if (ours.length === theirs.length) {
  let identical = true;
  let firstDiffOffset = -1;
  for (let i = 0; i < ours.length; i++) {
    if (ours[i] !== theirs[i]) {
      identical = false;
      firstDiffOffset = i;
      break;
    }
  }

  if (identical) {
    console.log('Result: IDENTICAL (byte-for-byte match)');
  } else {
    console.log(`Result: SAME SIZE but DIFFERENT content`);
    console.log(`  First difference at byte offset: ${firstDiffOffset}`);
    console.log(`  ours[${firstDiffOffset}]   = 0x${ours[firstDiffOffset].toString(16).padStart(2, '0')}`);
    console.log(`  theirs[${firstDiffOffset}] = 0x${theirs[firstDiffOffset].toString(16).padStart(2, '0')}`);
  }
} else {
  console.log(`Result: DIFFERENT SIZE`);
  console.log(`  Size difference: ${ours.length - theirs.length} bytes`);

  // Count differing bytes (up to the shorter length)
  const minLen = Math.min(ours.length, theirs.length);
  let diffCount = 0;
  let firstDiffOffset = -1;
  for (let i = 0; i < minLen; i++) {
    if (ours[i] !== theirs[i]) {
      diffCount++;
      if (firstDiffOffset === -1) firstDiffOffset = i;
    }
  }
  // Bytes beyond the shorter one are all "different"
  diffCount += Math.abs(ours.length - theirs.length);

  console.log(`  Differing bytes: ${diffCount} / ${Math.max(ours.length, theirs.length)}`);
  if (firstDiffOffset >= 0) {
    console.log(`  First difference at byte offset: ${firstDiffOffset}`);
  }
}

// --- WOFF2 header comparison ---
console.log('\n--- WOFF2 Header Comparison ---');
function parseWoff2Header(buf) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return {
    signature: String.fromCharCode(buf[0], buf[1], buf[2], buf[3]),
    flavor: `0x${view.getUint32(4).toString(16).padStart(8, '0')}`,
    length: view.getUint32(8),
    numTables: view.getUint16(12),
    reserved: view.getUint16(14),
    totalSfntSize: view.getUint32(16),
    totalCompressedSize: view.getUint32(20),
    majorVersion: view.getUint16(24),
    minorVersion: view.getUint16(26),
    metaOffset: view.getUint32(28),
    metaLength: view.getUint32(32),
    metaOrigLength: view.getUint32(36),
    privOffset: view.getUint32(40),
    privLength: view.getUint32(44),
  };
}

const hdrOurs = parseWoff2Header(ours);
const hdrTheirs = parseWoff2Header(theirs);

const fields = Object.keys(hdrOurs);
for (const f of fields) {
  const match = hdrOurs[f] === hdrTheirs[f] ? '  ' : '≠ ';
  console.log(`${match}${f.padEnd(22)} ours=${String(hdrOurs[f]).padEnd(14)} theirs=${hdrTheirs[f]}`);
}

// --- Hex dump of first 64 bytes ---
console.log('\n--- First 64 bytes (hex) ---');
function hexLine(buf, offset, len) {
  const bytes = [];
  for (let i = offset; i < Math.min(offset + len, buf.length); i++) {
    bytes.push(buf[i].toString(16).padStart(2, '0'));
  }
  return bytes.join(' ');
}

for (let off = 0; off < 64; off += 16) {
  const lineOurs = hexLine(ours, off, 16);
  const lineTheirs = hexLine(theirs, off, 16);
  const marker = lineOurs === lineTheirs ? '  ' : '≠ ';
  console.log(`${marker}offset ${String(off).padStart(3)}: ours   = ${lineOurs}`);
  if (lineOurs !== lineTheirs) {
    console.log(`              theirs = ${lineTheirs}`);
  }
}
