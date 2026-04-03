#!/usr/bin/env bash
# Fetch google/woff2 and google/brotli sources for the Wasm build.
# Uses specific tagged releases with SHA-256 verification for reproducibility.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
VENDOR_DIR="$ROOT_DIR/vendor"

WOFF2_VERSION="v1.0.2"
WOFF2_SHA256="add272bb09e6384a4833ffca4896350fdb16e0ca22df68c0384773c67a175594"

BROTLI_VERSION="v1.1.0"
BROTLI_SHA256="e720a6ca29428b803f4ad165371771f5398faba397edf6778837a18599ea13ff"

verify_checksum() {
  local file="$1" expected="$2" name="$3"
  local actual
  actual=$(shasum -a 256 "$file" | awk '{print $1}')
  if [ "$actual" != "$expected" ]; then
    echo "ERROR: SHA-256 mismatch for ${name}!" >&2
    echo "  expected: ${expected}" >&2
    echo "  actual:   ${actual}" >&2
    rm -f "$file"
    exit 1
  fi
}

mkdir -p "$VENDOR_DIR"

# --- google/woff2 ---
if [ ! -d "$VENDOR_DIR/google-woff2" ]; then
  echo "Fetching google/woff2 ${WOFF2_VERSION}..."
  TARBALL="$VENDOR_DIR/woff2.tar.gz"
  curl -sL "https://github.com/google/woff2/archive/refs/tags/${WOFF2_VERSION}.tar.gz" -o "$TARBALL"
  verify_checksum "$TARBALL" "$WOFF2_SHA256" "google/woff2"
  tar xzf "$TARBALL" -C "$VENDOR_DIR"
  mv "$VENDOR_DIR/woff2-${WOFF2_VERSION#v}" "$VENDOR_DIR/google-woff2"
  rm "$TARBALL"
  echo "google/woff2 ${WOFF2_VERSION} ready."
else
  echo "google/woff2 already present, skipping."
fi

# --- google/brotli ---
if [ ! -d "$VENDOR_DIR/brotli" ]; then
  echo "Fetching google/brotli ${BROTLI_VERSION}..."
  TARBALL="$VENDOR_DIR/brotli.tar.gz"
  curl -sL "https://github.com/google/brotli/archive/refs/tags/${BROTLI_VERSION}.tar.gz" -o "$TARBALL"
  verify_checksum "$TARBALL" "$BROTLI_SHA256" "google/brotli"
  tar xzf "$TARBALL" -C "$VENDOR_DIR"
  mv "$VENDOR_DIR/brotli-${BROTLI_VERSION#v}" "$VENDOR_DIR/brotli"
  rm "$TARBALL"
  echo "google/brotli ${BROTLI_VERSION} ready."
else
  echo "google/brotli already present, skipping."
fi

echo "All dependencies fetched."
