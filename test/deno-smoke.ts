// Deno smoke test for woff2-encode-wasm
// Run: deno run --allow-read test/deno-smoke.ts

import { dirname, fromFileUrl, join } from 'https://deno.land/std/path/mod.ts';
import { init, encode } from '../dist/index.js';

const testDir = dirname(fromFileUrl(import.meta.url));
const rootDir = join(testDir, '..');

const wasmBuf = await Deno.readFile(join(rootDir, 'dist', 'encoder.wasm'));
await init(wasmBuf);
console.log('init() succeeded');

// Valid TTF encoding
const ttf = await Deno.readFile(join(testDir, 'fixtures', 'Abel-Regular.ttf'));
const woff2 = await encode(new Uint8Array(ttf));
console.log(`encode() succeeded: ${ttf.length} bytes TTF → ${woff2.length} bytes WOFF2`);

// Verify wOF2 signature
const sig = String.fromCharCode(woff2[0], woff2[1], woff2[2], woff2[3]);
if (sig !== 'wOF2') throw new Error(`bad signature: ${sig}`);
console.log('wOF2 signature: OK');

// Verify output is smaller than input
if (woff2.length >= ttf.length) throw new Error('WOFF2 not smaller than input');
console.log('compression ratio: OK');

// Invalid input rejection
try {
  await encode(new Uint8Array([0xde, 0xad]));
  throw new Error('should have thrown');
} catch (e) {
  if (!(e instanceof Error) || !/encoding failed/.test(e.message)) throw e;
  console.log('invalid input rejection: OK');
}

// Repeated calls produce identical output
const woff2b = await encode(new Uint8Array(ttf));
if (woff2.length !== woff2b.length || !woff2.every((b, i) => b === woff2b[i])) {
  throw new Error('repeated calls produced different output');
}
console.log('repeated call consistency: OK');

console.log('\nAll Deno checks passed.');
