import { describe, it, expect } from 'vitest';
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import worker from './worker';

// Imported as ArrayBuffer via wrangler's Data module rule.
import ttfData from '../fixtures/Abel-Regular.ttf';

const WOFF2_MAGIC = new Uint8Array([0x77, 0x4f, 0x46, 0x32]); // 'wOF2'
const ttfBytes = new Uint8Array(ttfData as ArrayBuffer);

describe('Workers integration', () => {
  it('GET /health returns 200', async () => {
    const req = new Request('http://localhost/health');
    const ctx = createExecutionContext();
    const res = await worker.fetch(req, {}, ctx);
    await waitOnExecutionContext(ctx);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
  });

  it('POST /encode returns valid WOFF2', async () => {
    const req = new Request('http://localhost/encode', {
      method: 'POST',
      body: ttfBytes,
    });
    const ctx = createExecutionContext();
    const res = await worker.fetch(req, {}, ctx);
    await waitOnExecutionContext(ctx);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('font/woff2');

    const woff2 = new Uint8Array(await res.arrayBuffer());
    expect(woff2.length).toBeGreaterThan(0);
    expect(woff2.length).toBeLessThan(ttfBytes.length);
    expect(woff2.slice(0, 4)).toEqual(WOFF2_MAGIC);
  });

  it('POST /encode twice returns identical output', async () => {
    const makeReq = () =>
      new Request('http://localhost/encode', {
        method: 'POST',
        body: ttfBytes,
      });

    const ctx1 = createExecutionContext();
    const res1 = await worker.fetch(makeReq(), {}, ctx1);
    await waitOnExecutionContext(ctx1);
    const out1 = new Uint8Array(await res1.arrayBuffer());

    const ctx2 = createExecutionContext();
    const res2 = await worker.fetch(makeReq(), {}, ctx2);
    await waitOnExecutionContext(ctx2);
    const out2 = new Uint8Array(await res2.arrayBuffer());

    expect(out1).toEqual(out2);
  });

  it('GET /unknown returns 404', async () => {
    const req = new Request('http://localhost/unknown');
    const ctx = createExecutionContext();
    const res = await worker.fetch(req, {}, ctx);
    await waitOnExecutionContext(ctx);

    expect(res.status).toBe(404);
  });
});
