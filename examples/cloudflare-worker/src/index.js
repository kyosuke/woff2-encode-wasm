/**
 * Cloudflare Worker example — WOFF2 encoder endpoint.
 *
 * POST /encode  — accepts a TTF/OTF binary body, returns WOFF2 bytes.
 * GET  /health  — returns a 200 to prove the worker is alive.
 * GET  /self-test — encodes a tiny payload and reports whether it fails
 *                   (useful as a quick smoke test after deploy).
 */
import wasmModule from '../../../dist/encoder.wasm';
import { init, encode } from '../../../dist/index.js';

// Maximum accepted input size (30 MB). Fonts larger than this are unusual
// and would consume significant CPU time in a Worker.
const MAX_INPUT_BYTES = 30 * 1024 * 1024;

// Initialise the Wasm module once on cold start.
// Workers reuse the same isolate for multiple requests, so this
// promise is resolved once and cached.
const ready = init(wasmModule);

export default {
  async fetch(request, _env, _ctx) {
    const url = new URL(request.url);

    // --- Health check ---
    if (url.pathname === '/health') {
      return new Response('ok', { status: 200 });
    }

    // --- Self-test (GET) ---
    if (url.pathname === '/self-test') {
      try {
        await ready;
        // 4 garbage bytes — should produce an actionable error.
        await encode(new Uint8Array([0, 0, 0, 0]));
        // If we somehow reach here, something is wrong.
        return new Response('unexpected: encoding garbage succeeded', { status: 500 });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (/encoding failed/.test(message)) {
          return new Response('self-test passed: encoder rejects invalid input', {
            status: 200,
          });
        }
        return new Response(`self-test error: ${message}`, { status: 500 });
      }
    }

    // --- Encode endpoint (POST) ---
    if (url.pathname === '/encode' && request.method === 'POST') {
      try {
        // Reject oversized bodies early via Content-Length when available.
        const cl = request.headers.get('content-length');
        if (cl && Number(cl) > MAX_INPUT_BYTES) {
          return new Response('Request body too large.', { status: 413 });
        }

        await ready;
        const body = await request.arrayBuffer();
        if (body.byteLength === 0) {
          return new Response('Empty request body.', { status: 400 });
        }
        if (body.byteLength > MAX_INPUT_BYTES) {
          return new Response('Request body too large.', { status: 413 });
        }

        const input = new Uint8Array(body);
        const woff2 = await encode(input);
        return new Response(woff2, {
          status: 200,
          headers: {
            'Content-Type': 'font/woff2',
            'Content-Length': String(woff2.byteLength),
          },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal error';
        // Encoding failures (bad input) → 400; everything else → 500.
        const status = message.includes('encoding failed') ? 400 : 500;
        return new Response(message, { status });
      }
    }

    return new Response('Not found. POST /encode with TTF/OTF body.', {
      status: 404,
    });
  },
};
