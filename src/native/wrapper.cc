// Thin C ABI wrapper over google/woff2 in-memory encoding.
// Compiled to WebAssembly with Emscripten. No filesystem, no exceptions.

#include <cstdlib>
#include <cstdint>
#include <cstring>
#include <woff2/encode.h>

// Global result state — the JS side reads these after a successful encode
// and copies the data before the next call or free.
static uint8_t* g_result_ptr = nullptr;
static size_t   g_result_len = 0;

extern "C" {

// Allocate a buffer in Wasm linear memory.
// JS uses this to write input font bytes before calling woff2_encode.
uint8_t* woff2_alloc(uint32_t size) {
    return static_cast<uint8_t*>(malloc(size));
}

// Free a buffer previously returned by woff2_alloc.
void woff2_free(void* ptr) {
    free(ptr);
}

// Encode TTF/OTF bytes to WOFF2.
//
// - input:     pointer to font bytes in Wasm memory (allocated via woff2_alloc)
// - input_len: byte length of the input
//
// Returns 0 on success. On success, call woff2_result_ptr() and
// woff2_result_size() to retrieve the output, then woff2_result_free()
// to release it.
//
// Error codes:
//   1 — MaxWOFF2CompressedSize returned 0 (invalid input)
//   2 — memory allocation failed for output buffer
//   3 — ConvertTTFToWOFF2 failed (corrupt or unsupported font)
//   4 — null input pointer with non-zero length
int woff2_encode(const uint8_t* input, uint32_t input_len) {
    if (input == nullptr && input_len > 0) {
        return 4;
    }

    // Free any prior result
    if (g_result_ptr) {
        free(g_result_ptr);
        g_result_ptr = nullptr;
        g_result_len = 0;
    }

    size_t max_size = woff2::MaxWOFF2CompressedSize(input, input_len);
    if (max_size == 0) {
        return 1;
    }

    uint8_t* output = static_cast<uint8_t*>(malloc(max_size));
    if (!output) {
        return 2;
    }

    size_t output_size = max_size;
    if (!woff2::ConvertTTFToWOFF2(input, input_len, output, &output_size)) {
        free(output);
        return 3;
    }

    g_result_ptr = output;
    g_result_len = output_size;
    return 0;
}

// Pointer to the last successful encode result in Wasm memory.
uint8_t* woff2_result_ptr(void) {
    return g_result_ptr;
}

// Byte length of the last successful encode result.
uint32_t woff2_result_size(void) {
    return static_cast<uint32_t>(g_result_len);
}

// Free the encode result buffer.
// Must be called after copying the result to JS.
void woff2_result_free(void) {
    if (g_result_ptr) {
        free(g_result_ptr);
        g_result_ptr = nullptr;
        g_result_len = 0;
    }
}

} // extern "C"
