import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { init, encode } from '../src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const WOFF2_MAGIC = new Uint8Array([0x77, 0x4f, 0x46, 0x32]); // 'wOF2'
const wasmBuf = readFileSync(join(__dirname, '..', 'dist', 'encoder.wasm'));
const ttfBytes = new Uint8Array(
  readFileSync(join(__dirname, 'fixtures', 'Abel-Regular.ttf'))
);

describe('woff2-encode-wasm', () => {
  beforeAll(async () => {
    await init(wasmBuf);
  });

  describe('encode()', () => {
    it('encodes a valid TTF to WOFF2', async () => {
      const result = await encode(ttfBytes);

      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBeGreaterThan(0);
      expect(result.length).toBeLessThan(ttfBytes.length);
      expect(result.slice(0, 4)).toEqual(WOFF2_MAGIC);
    });

    it('returns a fresh copy (not a view into Wasm memory)', async () => {
      const a = await encode(ttfBytes);
      const b = await encode(ttfBytes);

      expect(a).toEqual(b);
      expect(a.buffer).not.toBe(b.buffer);
    });

    it('handles repeated calls without memory corruption', async () => {
      const results: Uint8Array[] = [];
      for (let i = 0; i < 5; i++) {
        results.push(await encode(ttfBytes));
      }

      for (let i = 1; i < results.length; i++) {
        expect(results[i]).toEqual(results[0]);
      }
    });

    it('rejects empty input', async () => {
      await expect(encode(new Uint8Array(0))).rejects.toThrow(
        /non-empty Uint8Array/
      );
    });

    it('rejects garbage input', async () => {
      await expect(
        encode(new Uint8Array([0xde, 0xad, 0xbe, 0xef]))
      ).rejects.toThrow(/encoding failed/);
    });

    it('rejects non-Uint8Array input', async () => {
      // @ts-expect-error intentional bad input
      await expect(encode('not bytes')).rejects.toThrow(/non-empty Uint8Array/);
    });
  });

  describe('init()', () => {
    it('is idempotent — calling init() again is a no-op', async () => {
      await init(wasmBuf);
      const result = await encode(ttfBytes);
      expect(result.length).toBeGreaterThan(0);
    });
  });
});
