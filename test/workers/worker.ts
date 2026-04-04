/**
 * Test Worker entry point — wraps the woff2-encode-wasm library.
 * Used by vitest-pool-workers for integration testing.
 */
import wasmModule from '../../dist/encoder.wasm';
import { init, encode } from '../../src/index.js';

const ready = init(wasmModule);

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return new Response('ok');
    }

    if (url.pathname === '/encode' && request.method === 'POST') {
      await ready;
      const input = new Uint8Array(await request.arrayBuffer());
      const woff2 = await encode(input);
      return new Response(woff2, {
        headers: { 'Content-Type': 'font/woff2' },
      });
    }

    return new Response('Not found', { status: 404 });
  },
};
