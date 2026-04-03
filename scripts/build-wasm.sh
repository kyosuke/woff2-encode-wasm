#!/usr/bin/env bash
# Compile google/woff2 encoder + brotli to a standalone WebAssembly module.
# Requires: Emscripten SDK (emcc on PATH)
#
# Strategy: compile C and C++ sources separately (different flags), then link.
# Object files are namespaced by library to avoid collisions (e.g. both brotli
# and woff2 have a transform source file).
# The result is a standalone .wasm with no JS glue — the JS wrapper
# instantiates it directly via WebAssembly.instantiate().
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
VENDOR_DIR="$ROOT_DIR/vendor"
DIST_DIR="$ROOT_DIR/dist"
BUILD_DIR="$ROOT_DIR/build"

WOFF2_DIR="$VENDOR_DIR/google-woff2"
BROTLI_DIR="$VENDOR_DIR/brotli"
WRAPPER="$ROOT_DIR/src/native/wrapper.cc"

if ! command -v emcc &>/dev/null; then
  echo "Error: emcc not found. Install Emscripten: https://emscripten.org/docs/getting_started/" >&2
  exit 1
fi

if [ ! -d "$WOFF2_DIR" ] || [ ! -d "$BROTLI_DIR" ]; then
  echo "Dependencies not found. Run: npm run fetch-deps" >&2
  exit 1
fi

mkdir -p "$DIST_DIR" "$BUILD_DIR"

COMMON_FLAGS="-O3 -flto -D__STDC_FORMAT_MACROS"
INCLUDE_FLAGS="-I$WOFF2_DIR/include -I$WOFF2_DIR/src -I$BROTLI_DIR/c/include"

ALL_OBJS=()

# --- Brotli (C) ---
echo "Compiling brotli (C)..."
for src in "$BROTLI_DIR"/c/common/*.c "$BROTLI_DIR"/c/enc/*.c; do
  # Namespace: brotli_common_foo.o / brotli_enc_foo.o
  parent=$(basename "$(dirname "$src")")
  base=$(basename "$src" .c)
  obj="$BUILD_DIR/brotli_${parent}_${base}.o"
  emcc $COMMON_FLAGS $INCLUDE_FLAGS -c "$src" -o "$obj"
  ALL_OBJS+=("$obj")
done

# --- woff2 (C++) ---
echo "Compiling woff2 encoder (C++)..."
CXX_SRCS=(
  "$WOFF2_DIR/src/table_tags.cc"
  "$WOFF2_DIR/src/variable_length.cc"
  "$WOFF2_DIR/src/woff2_common.cc"
  "$WOFF2_DIR/src/font.cc"
  "$WOFF2_DIR/src/glyph.cc"
  "$WOFF2_DIR/src/normalize.cc"
  "$WOFF2_DIR/src/transform.cc"
  "$WOFF2_DIR/src/woff2_enc.cc"
)
for src in "${CXX_SRCS[@]}"; do
  base=$(basename "$src" .cc)
  obj="$BUILD_DIR/woff2_${base}.o"
  em++ $COMMON_FLAGS $INCLUDE_FLAGS -std=c++11 -c "$src" -o "$obj"
  ALL_OBJS+=("$obj")
done

# --- Wrapper (C++) ---
echo "Compiling wrapper..."
WRAPPER_OBJ="$BUILD_DIR/wrapper.o"
em++ $COMMON_FLAGS $INCLUDE_FLAGS -std=c++11 -c "$WRAPPER" -o "$WRAPPER_OBJ"
ALL_OBJS+=("$WRAPPER_OBJ")

# --- Link ---
echo "Linking to standalone WebAssembly..."
emcc \
  -O3 \
  -flto \
  --no-entry \
  -s STANDALONE_WASM=1 \
  -s EXPORTED_FUNCTIONS='["_woff2_alloc","_woff2_free","_woff2_encode","_woff2_result_ptr","_woff2_result_size","_woff2_result_free"]' \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s INITIAL_MEMORY=16777216 \
  -s MAXIMUM_MEMORY=268435456 \
  -s FILESYSTEM=0 \
  -s MALLOC=dlmalloc \
  "${ALL_OBJS[@]}" \
  -o "$DIST_DIR/encoder.wasm"

# Clean up intermediate objects
rm -rf "$BUILD_DIR"

WASM_SIZE=$(wc -c < "$DIST_DIR/encoder.wasm" | tr -d ' ')
echo "Build complete: dist/encoder.wasm (${WASM_SIZE} bytes)"
