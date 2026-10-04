#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Nico Störzbach
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Package the app for installation into a Nextcloud apps/ directory:
#   build/artifacts/public_share_control-<version>.tar.gz
# containing a single top-level public_share_control/ directory.
#
# Run `npm ci && npm run build` first — the package ships the built js/ and
# css/ (Nextcloud runs no build step). Only an explicit allowlist is packaged,
# so development files (src/, tests/, dev/, node_modules/, vendor/, configs)
# can't slip in. vendor/ is deliberately not shipped: Nextcloud never loads
# it (OC_App::registerAutoloading only looks for composer/autoload.php and
# otherwise maps the app namespace to lib/ itself), and this app has no PHP
# runtime dependencies. Besides runtime files, only three kinds of file are
# shipped: CHANGELOG.md (the app store reads each release's changelog from
# the package), LICENSE and the js/*.license files (AGPL and the licenses of
# the bundled npm dependencies must accompany the distributed code).
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

# Reproducible: sorted entries, fixed owner, file mtimes from the last commit.
MTIME=$(git log -1 --format=%cI 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%SZ)
tar --sort=name --owner=0 --group=0 --numeric-owner --mtime="$MTIME" \
	-czf "$ARTIFACT" -C build/staging "$APP_ID"

echo "$ARTIFACT"
sha256sum "$ARTIFACT"
