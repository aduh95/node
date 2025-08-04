#!/bin/sh
set -ex
# Shell script to update Nixpkgs pin in the source tree to the most recent
# version on the unstable channel.

BASE_DIR=$(cd "$(dirname "$0")/../.." && pwd)
WORKFLOW_FILE="$BASE_DIR/.github/workflows/test-shared.yml"

NIXPKGS_REPO=$(grep NIXPKGS_REPO: "$WORKFLOW_FILE" | awk -F': ' '{ print $2 }')
CURRENT_VERSION_SHA1=$(grep NIXPKGS_PIN: "$WORKFLOW_FILE" | awk -F': ' '{ print $2 }')
CURRENT_VERSION=$(echo "$CURRENT_UPSTREAM_SHA1" | head -c 7)

NEW_UPSTREAM_SHA1=$(git ls-remote "$NIXPKGS_REPO.git" nixpkgs-unstable | awk '{print $1}')
NEW_VERSION=$(echo "$NEW_UPSTREAM_SHA1" | head -c 7)


# shellcheck disable=SC1091
. "$BASE_DIR/tools/dep_updaters/utils.sh"

compare_dependency_version "nixpkgs-unstable" "$NEW_VERSION" "$CURRENT_VERSION"

TMP_FILE=$(mktemp)
sed "s/$CURRENT_VERSION_SHA1/$NEW_UPSTREAM_SHA1/" "$WORKFLOW_FILE" > "$TMP_FILE"
mv "$TMP_FILE" "$WORKFLOW_FILE"

echo "All done!"
echo ""
echo "Please git add and commit the new version:"
echo ""
echo "$ git add $WORKFLOW_FILE"
echo "$ git commit -m 'tools: bump nixpkgs-unstable pin to $NEW_VERSION'"
echo ""

# The last line of the script should always print the new version,
# as we need to add it to $GITHUB_ENV variable.
echo "NEW_VERSION=$NEW_VERSION"
