import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load the compiled module and library.
const wasmBuf = readFileSync(join(__dirname, '..', 'dist', 'encoder.wasm'));
const { init, encode } = await import(join(__dirname, '..', 'dist', 'index.js'));

const WOFF2_MAGIC = new Uint8Array([0x77, 0x4f, 0x46, 0x32]); // 'wOF2'
const ttfBytes = new Uint8Array(
  readFileSync(join(__dirname, 'fixtures', 'Abel-Regular.ttf'))
);

describe('woff2-encode-wasm', () => {
  before(async () => {
    await init(wasmBuf);
  });

  describe('encode()', () => {
    it('encodes a valid TTF to WOFF2', async () => {
      const result = await encode(ttfBytes);

      assert.ok(result instanceof Uint8Array, 'result is Uint8Array');
      assert.ok(result.length > 0, 'result is non-empty');
      assert.ok(result.length < ttfBytes.length, 'WOFF2 is smaller than TTF');

      // Check wOF2 signature
      assert.deepStrictEqual(
        result.slice(0, 4),
        WOFF2_MAGIC,
        'output starts with wOF2 signature'
      );
    });

    it('returns a fresh copy (not a view into Wasm memory)', async () => {
      const a = await encode(ttfBytes);
      const b = await encode(ttfBytes);

      // Both should be equal in content
      assert.deepStrictEqual(a, b, 'identical input produces identical output');

      // But they must be distinct ArrayBuffer instances
      assert.notStrictEqual(
        a.buffer,
        b.buffer,
        'results use distinct ArrayBuffers'
      );
    });

    it('handles repeated calls without memory corruption', async () => {
      const results = [];
      for (let i = 0; i < 5; i++) {
        results.push(await encode(ttfBytes));
      }

      // All results should be identical
      for (let i = 1; i < results.length; i++) {
        assert.deepStrictEqual(
          results[i],
          results[0],
          `call ${i + 1} matches call 1`
        );
      }
    });

    it('rejects empty input', async () => {
      await assert.rejects(
        () => encode(new Uint8Array(0)),
        { message: /non-empty Uint8Array/ }
      );
    });

    it('rejects garbage input', async () => {
      await assert.rejects(
        () => encode(new Uint8Array([0xde, 0xad, 0xbe, 0xef])),
        { message: /encoding failed/ }
      );
    });

    it('rejects non-Uint8Array input', async () => {
      // @ts-ignore — intentional bad input
      await assert.rejects(
        () => encode('not bytes'),
        { message: /non-empty Uint8Array/ }
      );
    });
  });

  describe('init()', () => {
    it('is idempotent — calling init() again is a no-op', async () => {
      // Should not throw
      await init(wasmBuf);
      const result = await encode(ttfBytes);
      assert.ok(result.length > 0);
    });
  });
});
