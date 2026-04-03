# woff2-encode-wasm

Encode TTF/OTF fonts to WOFF2 using the official [google/woff2](https://github.com/google/woff2) C++ library compiled to WebAssembly.

**Primary runtime target: Cloudflare Workers.** Also works in Node.js ≥ 18.

## What this package does

- Encodes TTF or OTF font bytes into WOFF2 format.
- Uses the same encoder as the `woff2_compress` CLI from google/woff2.
- Runs entirely in-memory — no filesystem, no child processes, no native addons.

## What this package does NOT do

- WOFF2 **decoding** (decompression) is out of scope.
- This is not a general-purpose font conversion toolkit.
- It does not parse, subset, or modify font tables.
- It does not serve or render fonts.

## Install

```bash
npm install woff2-encode-wasm
```

## API

```ts
import { init, encode } from 'woff2-encode-wasm';

// Initialise the Wasm module (required once before encoding).
await init(wasmSource);

// Encode a font.
const woff2Bytes: Uint8Array = await encode(ttfBytes);
```

### `init(source: WasmSource): Promise<void>`

Initialise the WebAssembly module. Must be called once before `encode()`.

`WasmSource` can be:

| Type | Use case |
|---|---|
| `WebAssembly.Module` | Cloudflare Workers (import `.wasm` file) |
| `ArrayBuffer` / `Uint8Array` | Node.js (`fs.readFileSync`) |

Calling `init()` again after successful initialisation is a no-op.

### `encode(input: Uint8Array): Promise<Uint8Array>`

Encode TTF/OTF bytes to WOFF2. Returns a fresh `Uint8Array` that the caller owns.

Throws if:
- Module is not initialised.
- Input is empty or not a `Uint8Array`.
- The font is corrupt or unsupported.

## Usage

### Cloudflare Workers

```js
import wasmModule from 'woff2-encode-wasm/encoder.wasm';
import { init, encode } from 'woff2-encode-wasm';

// Initialise once (cached across requests in the same isolate).
const ready = init(wasmModule);

export default {
  async fetch(request) {
    await ready;
    const input = new Uint8Array(await request.arrayBuffer());
    const woff2 = await encode(input);
    return new Response(woff2, {
      headers: { 'Content-Type': 'font/woff2' },
    });
  },
};
```

### Node.js

```js
import { readFileSync } from 'node:fs';
import { init, encode } from 'woff2-encode-wasm';

const wasmBuf = readFileSync('node_modules/woff2-encode-wasm/dist/encoder.wasm');
await init(wasmBuf);

const ttf = new Uint8Array(readFileSync('input.ttf'));
const woff2 = await encode(ttf);
```

## Build from source

Prerequisites: [Emscripten SDK](https://emscripten.org/docs/getting_started/) (`emcc` on PATH).

```bash
npm run build          # fetch deps + compile wasm + compile TS
npm test               # run tests
```

Individual steps:

```bash
npm run fetch-deps     # download google/woff2 v1.0.2 + brotli v1.1.0
npm run build:wasm     # compile to dist/encoder.wasm (~750 KB)
npm run build:js       # compile TS to dist/index.js + dist/index.d.ts
```

## Architecture

```
src/native/wrapper.cc   Thin C ABI over woff2::ConvertTTFToWOFF2
src/index.ts            ESM wrapper — init() + encode()
scripts/fetch-deps.sh   Downloads pinned google/woff2 + brotli releases
scripts/build-wasm.sh   Emscripten build: .cc/.c → standalone .wasm
```

The `.wasm` is built with `STANDALONE_WASM=1` and has only two imports:

| Import | Purpose |
|---|---|
| `env.emscripten_notify_memory_growth` | No-op callback on memory growth |
| `wasi_snapshot_preview1.proc_exit` | Abort (should never fire) |

This makes the module trivially instantiable in any environment without Emscripten's JS glue.

### C ABI

| Export | Signature |
|---|---|
| `woff2_alloc` | `(size: u32) → ptr` |
| `woff2_free` | `(ptr) → void` |
| `woff2_encode` | `(input_ptr, input_len: u32) → i32` (0 = success) |
| `woff2_result_ptr` | `() → ptr` |
| `woff2_result_size` | `() → u32` |
| `woff2_result_free` | `() → void` |

### Memory ownership

1. JS allocates input buffer via `woff2_alloc`, copies font bytes in.
2. `woff2_encode` allocates the output internally.
3. JS reads the result via `woff2_result_ptr` / `woff2_result_size`, copies into a fresh `Uint8Array`.
4. JS frees the result with `woff2_result_free` and the input with `woff2_free`.

## Known limitations

- **Encoding only.** There is no `decode()` function and none is planned.
- **TTF / OTF only.** TrueType Collections (`.ttc`) are not supported by the upstream encoder.
- **Synchronous Wasm execution.** Very large fonts may block the event loop. For Workers, this is bounded by the CPU time limit.
- **~750 KB Wasm binary.** This is after `-O3 -flto`. Most of the size comes from the Brotli encoder tables.

## Versions

| Dependency | Version |
|---|---|
| google/woff2 | v1.0.2 |
| google/brotli | v1.1.0 |
| Emscripten | latest (at build time) |

## License

MIT — same as the upstream google/woff2 and google/brotli.
