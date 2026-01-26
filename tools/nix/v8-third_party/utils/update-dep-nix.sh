#!/bin/sh

set -ex

DEP_NAME=${1:-"abseil-cpp"}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NIX_DIR=$(cd "$SCRIPT_DIR/../.." && pwd)
REPO_ROOT="$(cd "$NIX_DIR/../.." && pwd)"
DEPS_FILE="$REPO_ROOT/deps/v8/DEPS"
NIX_DERIVATION="$SCRIPT_DIR/../$DEP_NAME.nix"

if [[ ! -f "$DEPS_FILE" ]]; then
    echo "Error: deps/v8/DEPS not found at $DEPS_FILE" >&2
    exit 1
fi

if [[ ! -f "$NIX_DERIVATION" ]]; then
    echo "Error: $NIX_DERIVATION not found" >&2
    exit 1
fi

echo "Extracting values from deps/v8/DEPS..."

DEP_SRC=$(sed -n "/^ \\{0,\\}'third_party.$DEP_NAME\\(.src\\)\\{0,1\\}': \\{0,1\\}{\\{0,1\\}\$/{n;p;}" "$DEPS_FILE")

echo "$DEP_SRC" | grep -q "Var('chromium_url') \?+ \?'.\+' \?+ \?'@' \?+ \?'.\+',$" || {
  echo "Unexpected format for $DEP_NAME source URL: $DEP_SRC"
  exit 1
}

REPO_URL="$(grep "^ \+'chromium_url':" "$DEPS_FILE" | awk -F"'" '{ print $4; }')$(echo "$DEP_SRC" | awk -F"'" '{ if ($2 == "chromium_url") print $4; else if ($4 == "chromium_url") print $6 }')"
REV="$(echo "$DEP_SRC" | awk -F"'" '{ if ($2 == "chromium_url") print $8; else if ($4 == "chromium_url") print $10 }')"

if command -v nix-shell >/dev/null 2>&1; then
  # No fallback, use nix-shell directly
  true
elif command -v docker >/dev/null 2>&1; then
    echo "nix-shell not found, falling back to nixos/nix Docker image" >&2

    nix-shell() {
        docker run --rm \
            -v "$PWD:$PWD" \
            -w "$PWD" \
            nixos/nix \
            nix-shell "$@"
    }
else
    echo "Neither nix-shell nor docker is available, cannot update the file" >&2
    exit 1
fi

DEFINED_IN_NIX="$(
  EXPR="((import <nixpkgs> {}).callPackage $NIX_DERIVATION { skipCheck = true; }).src.drvAttrs" nix-shell \
    -I "nixpkgs=$NIX_DIR/pkgs.nix" --pure --keep EXPR -p nix \
    --run 'nix --extra-experimental-features nix-command eval --impure --json --expr "$EXPR"'
)";
PREVIOUS_REPO_URL=$(
  DEFINED_IN_NIX="$DEFINED_IN_NIX" nix-shell \
    -I "nixpkgs=$NIX_DIR/pkgs.nix" --pure --keep DEFINED_IN_NIX -p jq \
    --run 'echo "$DEFINED_IN_NIX" | jq -r .url'
)
PREVIOUS_REV=$(
  DEFINED_IN_NIX="$DEFINED_IN_NIX" nix-shell \
    -I "nixpkgs=$NIX_DIR/pkgs.nix" --pure --keep DEFINED_IN_NIX -p jq \
    --run 'echo "$DEFINED_IN_NIX" | jq -r .rev'
)
PREVIOUS_HASH=$(
  DEFINED_IN_NIX="$DEFINED_IN_NIX" nix-shell \
    -I "nixpkgs=$NIX_DIR/pkgs.nix" --pure --keep DEFINED_IN_NIX -p jq \
    --run 'echo "$DEFINED_IN_NIX" | jq -r .hash'
)
SPARSE_CHECKOUT=$(
  DEFINED_IN_NIX="$DEFINED_IN_NIX" nix-shell \
    -I "nixpkgs=$NIX_DIR/pkgs.nix" --pure --keep DEFINED_IN_NIX -p jq \
    --run 'echo "$DEFINED_IN_NIX" | jq -r ".sparseCheckoutText | @sh"'
)
HASH="$(
  REPO_URL="$REPO_URL" REV="$REV" SPARSE_CHECKOUT="$(
      [ -z "$SPARSE_CHECKOUT" ] || echo "--sparse-checkout $SPARSE_CHECKOUT --non-cone-mode"
  )" nix-shell \
    -I "nixpkgs=$NIX_DIR/pkgs.nix" --pure --keep REPO_URL --keep REV -p nix-prefetch-git -p cacert -p nix -p jq \
    --run 'nix-prefetch-git --url "$REPO_URL" --rev "$REV" $SPARSE_CHECKOUT | jq -r .hash'
)";

tmp_file=$(mktemp)
sed -e "s#$PREVIOUS_REPO_URL#$REPO_URL#g" -e "s/$PREVIOUS_REV/$REV/g" -e "s/$PREVIOUS_HASH/$HASH/g" "$NIX_DERIVATION" > "$tmp_file"
mv "$tmp_file" "$NIX_DERIVATION"
echo "$NIX_DERIVATION has been updated" >&2
