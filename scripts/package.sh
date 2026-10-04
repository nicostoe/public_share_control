#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Nico Störzbach
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Package the app for installation into a Nextcloud apps/ directory:
#   build/artifacts/public_share_control-<version>.tar.gz
#
# Run `npm ci && npm run build` first. Only an explicit allowlist is packaged:
# runtime files, CHANGELOG.md (read by the app store), LICENSE and the
# js/*.license files of the bundled dependencies. No vendor/: Nextcloud never
# loads it (see "Releasing" in AGENTS.md).
set -euo pipefail

cd "$(dirname "$0")/.."

APP_ID=public_share_control
VERSION=$(sed -n 's:.*<version>\(.*\)</version>.*:\1:p' appinfo/info.xml)
[ -n "$VERSION" ] || { echo "Could not read <version> from appinfo/info.xml" >&2; exit 1; }

for built in js/$APP_ID-main.mjs js/$APP_ID-public.mjs js/$APP_ID-settings.mjs css/$APP_ID-main.css; do
	[ -f "$built" ] || { echo "Missing $built — run 'npm ci && npm run build' first" >&2; exit 1; }
done

STAGING=build/staging/$APP_ID
ARTIFACT=build/artifacts/$APP_ID-$VERSION.tar.gz
rm -rf build/staging "$ARTIFACT"
mkdir -p "$STAGING" build/artifacts

cp -r appinfo lib templates l10n "$STAGING/"
cp LICENSE CHANGELOG.md "$STAGING/"
# Built assets, without source maps (they'd triple the package size).
mkdir -p "$STAGING/js" "$STAGING/css"
cp js/*.mjs js/*.license "$STAGING/js/"
cp css/*.css "$STAGING/css/"

# Reproducible: sorted entries, fixed owner and modes, mtimes from the last commit.
MTIME=$(git log -1 --format=%cI 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%SZ)
tar --sort=name --owner=0 --group=0 --numeric-owner --mode=u=rwX,go=rX --mtime="$MTIME" \
	-czf "$ARTIFACT" -C build/staging "$APP_ID"

echo "$ARTIFACT"
sha256sum "$ARTIFACT"
