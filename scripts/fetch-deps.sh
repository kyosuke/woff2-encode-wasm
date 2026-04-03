#!/usr/bin/env bash
# Fetch google/woff2 and google/brotli sources for the Wasm build.
# Uses specific tagged releases for reproducibility.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
VENDOR_DIR="$ROOT_DIR/vendor"

WOFF2_VERSION="v1.0.2"
BROTLI_VERSION="v1.1.0"

mkdir -p "$VENDOR_DIR"

# --- google/woff2 ---
if [ ! -d "$VENDOR_DIR/google-woff2" ]; then
  echo "Fetching google/woff2 ${WOFF2_VERSION}..."
  curl -sL "https://github.com/google/woff2/archive/refs/tags/${WOFF2_VERSION}.tar.gz" | \
    tar xz -C "$VENDOR_DIR"
  mv "$VENDOR_DIR/woff2-${WOFF2_VERSION#v}" "$VENDOR_DIR/google-woff2"
  echo "google/woff2 ${WOFF2_VERSION} ready."
else
  echo "google/woff2 already present, skipping."
fi

# --- google/brotli ---
if [ ! -d "$VENDOR_DIR/brotli" ]; then
  echo "Fetching google/brotli ${BROTLI_VERSION}..."
  curl -sL "https://github.com/google/brotli/archive/refs/tags/${BROTLI_VERSION}.tar.gz" | \
    tar xz -C "$VENDOR_DIR"
  mv "$VENDOR_DIR/brotli-${BROTLI_VERSION#v}" "$VENDOR_DIR/brotli"
  echo "google/brotli ${BROTLI_VERSION} ready."
else
  echo "google/brotli already present, skipping."
fi

echo "All dependencies fetched."
