// Deno smoke test for woff2-encode-wasm
import { init, encode } from '../dist/index.js';

const wasmBuf = await Deno.readFile('./dist/encoder.wasm');
await init(wasmBuf);
console.log('init() succeeded');

// Valid TTF encoding
const ttf = await Deno.readFile('./test/fixtures/Abel-Regular.ttf');
const woff2 = await encode(new Uint8Array(ttf));
console.log(`encode() succeeded: ${ttf.length} bytes TTF → ${woff2.length} bytes WOFF2`);

// Verify wOF2 signature
const sig = String.fromCharCode(woff2[0], woff2[1], woff2[2], woff2[3]);
if (sig !== 'wOF2') throw new Error(`bad signature: ${sig}`);
console.log('wOF2 signature: OK');

// Invalid input rejection
try {
  await encode(new Uint8Array([0xde, 0xad]));
  throw new Error('should have thrown');
} catch (e) {
  if (!(e instanceof Error) || !/encoding failed/.test(e.message)) throw e;
  console.log('invalid input rejection: OK');
}

// Compare with Node output
try {
  const nodeOutput = await Deno.readFile('/tmp/node-output.woff2');
  const match = woff2.length === nodeOutput.length &&
    woff2.every((b, i) => b === nodeOutput[i]);
  console.log(`byte-for-byte match with Node output: ${match ? 'YES' : 'NO'}`);
} catch {
  console.log('(skipped Node output comparison — /tmp/node-output.woff2 not found)');
}

console.log('\nAll Deno checks passed.');
