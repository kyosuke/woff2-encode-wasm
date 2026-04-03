/**
 * woff2-encode-wasm — Encode TTF/OTF fonts to WOFF2 using the official
 * google/woff2 library compiled to WebAssembly.
 *
 * This module intentionally only encodes. WOFF2 decoding is out of scope.
 *
 * ## Instantiation strategy
 *
 * The standalone .wasm has two tiny imports that we stub:
 *   - env.emscripten_notify_memory_growth  (no-op, called when memory grows)
 *   - wasi_snapshot_preview1.proc_exit     (throws — should never fire)
 *
 * For Cloudflare Workers the caller passes a pre-compiled WebAssembly.Module
 * (imported from the .wasm file by the bundler). For browsers and Node the
 * caller can pass an ArrayBuffer, a URL, or a fetch Response.
 */

// The shape of our C ABI exports.
interface WasmExports {
  memory: WebAssembly.Memory;
  woff2_alloc(size: number): number;
  woff2_free(ptr: number): void;
  woff2_encode(input: number, input_len: number): number;
  woff2_result_ptr(): number;
  woff2_result_size(): number;
  woff2_result_free(): void;
  _initialize(): void;
}

/** Source material accepted by {@link init}. */
export type WasmSource =
  | WebAssembly.Module // Cloudflare Workers / pre-compiled
  | BufferSource       // raw .wasm bytes
  | Response           // fetch() response
  | Promise<Response>; // fetch() promise

let exports: WasmExports | null = null;
let initPromise: Promise<void> | null = null;

const importObject = {
  env: {
    // Called by Emscripten when ALLOW_MEMORY_GROWTH triggers a resize.
    emscripten_notify_memory_growth(_memoryIndex: number): void {
      // No-op — we re-read memory.buffer on every encode() call.
    },
  },
  wasi_snapshot_preview1: {
    proc_exit(code: number): void {
      throw new Error(`woff2 wasm called proc_exit(${code})`);
    },
  },
};

/**
 * Initialise the WebAssembly module.
 *
 * In **Cloudflare Workers**, pass the imported `.wasm` module:
 * ```ts
 * import wasmModule from './encoder.wasm';
 * import { init, encode } from 'woff2-encode-wasm';
 * await init(wasmModule);
 * ```
 *
 * In **browsers**, you can pass a `fetch()` response:
 * ```ts
 * await init(fetch('/encoder.wasm'));
 * ```
 *
 * If called without arguments and a previous init() is in progress, it
 * returns the same promise (idempotent).
 */
export async function init(source?: WasmSource): Promise<void> {
  if (exports) return;
  if (initPromise && !source) return initPromise;

  initPromise = (async () => {
    let instance: WebAssembly.Instance;

    if (source instanceof WebAssembly.Module) {
      // Cloudflare Workers path: already a compiled Module
      instance = await WebAssembly.instantiate(source, importObject);
    } else if (source instanceof Response || source instanceof Promise) {
      // Browser path: streaming compile from fetch Response
      const response = source instanceof Promise ? await source : source;
      const result = await WebAssembly.instantiateStreaming(response, importObject);
      instance = result.instance;
    } else if (source) {
      // ArrayBuffer / Uint8Array path
      const result = await WebAssembly.instantiate(source, importObject);
      instance = result.instance;
    } else {
      throw new Error(
        'woff2-encode-wasm: init() requires a WasmSource argument. ' +
        'Pass a WebAssembly.Module (Workers), fetch Response (browser), ' +
        'or ArrayBuffer (Node).'
      );
    }

    const ex = instance.exports as unknown as WasmExports;
    // STANDALONE_WASM reactors must call _initialize() once.
    ex._initialize();
    exports = ex;
  })();

  try {
    await initPromise;
  } catch (err) {
    // Allow retrying on failure.
    initPromise = null;
    throw err;
  }
}

const WOFF2_SIGNATURE = 0x774f4632; // 'wOF2'

/**
 * Encode a TTF or OTF font to WOFF2.
 *
 * @param input - Raw font bytes (TTF or OTF).
 * @returns WOFF2-encoded bytes.
 * @throws If the module is not initialised, input is empty, or encoding fails.
 */
export async function encode(input: Uint8Array): Promise<Uint8Array> {
  if (!exports) {
    throw new Error(
      'woff2-encode-wasm: module not initialised. Call init() first.'
    );
  }

  if (!(input instanceof Uint8Array) || input.length === 0) {
    throw new Error(
      'woff2-encode-wasm: input must be a non-empty Uint8Array.'
    );
  }

  const { memory, woff2_alloc, woff2_free, woff2_encode, woff2_result_ptr, woff2_result_size, woff2_result_free } = exports;

  // 1. Allocate input buffer in Wasm memory and copy data in.
  const inputPtr = woff2_alloc(input.length);
  if (inputPtr === 0) {
    throw new Error('woff2-encode-wasm: failed to allocate input buffer.');
  }

  try {
    new Uint8Array(memory.buffer, inputPtr, input.length).set(input);

    // 2. Call the encoder.
    const rc = woff2_encode(inputPtr, input.length);
    if (rc !== 0) {
      const messages: Record<number, string> = {
        1: 'MaxWOFF2CompressedSize returned 0 — input is not a valid font.',
        2: 'Failed to allocate output buffer.',
        3: 'ConvertTTFToWOFF2 failed — font may be corrupt or unsupported.',
      };
      throw new Error(
        `woff2-encode-wasm: encoding failed (code ${rc}). ${messages[rc] ?? ''}`
      );
    }

    // 3. Copy result out of Wasm memory into a fresh Uint8Array.
    const resultPtr = woff2_result_ptr();
    const resultSize = woff2_result_size();
    // Re-read memory.buffer — it may have grown during encoding.
    const result = new Uint8Array(memory.buffer, resultPtr, resultSize).slice();

    // Sanity check: WOFF2 files start with 'wOF2'.
    if (result.length >= 4) {
      const sig =
        (result[0] << 24) | (result[1] << 16) | (result[2] << 8) | result[3];
      if (sig !== WOFF2_SIGNATURE) {
        throw new Error('woff2-encode-wasm: output does not have wOF2 signature.');
      }
    }

    // 4. Free the Wasm-side result buffer.
    woff2_result_free();

    return result;
  } finally {
    // Always free the input buffer.
    woff2_free(inputPtr);
  }
}
