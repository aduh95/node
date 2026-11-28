#!/bin/sh
set -ex
# Shell script to update toml++ in the source tree to a specific version

BASE_DIR=$(cd "$(dirname "$0")/../.." && pwd)
DEPS_DIR="$BASE_DIR/deps"
[ -z "$NODE" ] && NODE="$BASE_DIR/out/Release/node"
[ -x "$NODE" ] || NODE=$(command -v node)

# shellcheck disable=SC1091
. "$BASE_DIR/tools/dep_updaters/utils.sh"

NEW_VERSION="$("$NODE" --input-type=module <<'EOF'
const res = await fetch('https://api.github.com/repos/marzer/tomlplusplus/releases/latest');
if (!res.ok) throw new Error(`FetchError: ${res.status} ${res.statusText}`, { cause: res });
const { tag_name } = await res.json();
console.log(tag_name.replace('v', ''));
EOF
)"
CURRENT_VERSION=$(sed -n 's/^#define TOML_LIB_[A-Z]* \([0-9]*\)$/\1/p' "$DEPS_DIR/tomlplusplus/toml++/toml.hpp" | paste -sd.)

if [ "$NEW_VERSION" = "$CURRENT_VERSION" ]; then
  echo "Skipped because toml++ is on the latest version."
  exit 0
fi

echo "Making temporary workspace..."

WORKSPACE=$(mktemp -d 2> /dev/null || mktemp -d -t 'tmp')

cleanup () {
  EXIT_CODE=$?
  [ -d "$WORKSPACE" ] && rm -rf "$WORKSPACE"
  exit $EXIT_CODE
}

trap cleanup INT TERM EXIT

TOMLPLUSPLUS_REF="v$NEW_VERSION"
TOMLPLUSPLUS_TARBALL="tomlplusplus-$NEW_VERSION.tar.gz"

cd "$WORKSPACE"

echo "Fetching toml++ source archive..."
curl -sL -o "$TOMLPLUSPLUS_TARBALL" "https://github.com/marzer/tomlplusplus/archive/refs/tags/$TOMLPLUSPLUS_REF.tar.gz"
log_and_verify_sha256sum "toml++" "$TOMLPLUSPLUS_TARBALL"
tar xzf "$TOMLPLUSPLUS_TARBALL"
cd "tomlplusplus-$NEW_VERSION"
mv "toml.hpp" "$DEPS_DIR/tomlplusplus/toml++"
mv "LICENSE" "$DEPS_DIR/tomlplusplus"

# Update the version number on maintaining-dependencies.md
# and print the new version as the last line of the script as we need
# to add it to $GITHUB_ENV variable
finalize_version_update "tomlplusplus" "$NEW_VERSION"
