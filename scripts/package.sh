#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Nico Störzbach
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Package the app for installation into a Nextcloud apps/ directory:
#   build/artifacts/public_share_control-<version>.tar.gz
#
#   scripts/package.sh                      unsigned
#   scripts/package.sh --sign <private key> signed, as the app store needs it
#
# Run `npm ci && npm run build` first. Only an explicit allowlist is packaged:
# runtime files, CHANGELOG.md (read by the app store), LICENSE and the
# js/*.license files of the bundled dependencies. No vendor/: Nextcloud never
# loads it (see "Releasing" in AGENTS.md).
#
# --sign adds the code signature (appinfo/signature.json) with Nextcloud's own
# `occ integrity:sign-app`, in a throwaway container of the minimum supported
# Nextcloud version (needs Docker), and fails unless `occ integrity:check-app`
# then accepts it. It also writes the archive signature for the app store,
# base64 encoded, to <package>.sig. The certificate is the app's public one
# from nextcloud/app-certificate-requests, unless --certificate names another.
set -euo pipefail

usage="usage: $0 [--sign <private key> [--certificate <certificate>]]"
KEY=
CERT=
while [ $# -gt 0 ]; do
	case $1 in
		--sign) KEY=$(realpath "${2:?$usage}"); shift 2 ;;
		--certificate) CERT=$(realpath "${2:?$usage}"); shift 2 ;;
		*) echo "$usage" >&2; exit 1 ;;
	esac
done
[ -z "$CERT" ] || [ -n "$KEY" ] || { echo "$usage" >&2; exit 1; }

cd "$(dirname "$0")/.."

APP_ID=public_share_control
VERSION=$(sed -n 's:.*<version>\(.*\)</version>.*:\1:p' appinfo/info.xml)
[ -n "$VERSION" ] || { echo "Could not read <version> from appinfo/info.xml" >&2; exit 1; }

for built in js/$APP_ID-main.mjs js/$APP_ID-public.mjs js/$APP_ID-settings.mjs css/$APP_ID-main.css; do
	[ -f "$built" ] || { echo "Missing $built — run 'npm ci && npm run build' first" >&2; exit 1; }
done

STAGING=build/staging/$APP_ID
ARTIFACT=build/artifacts/$APP_ID-$VERSION.tar.gz
rm -rf build/staging "$ARTIFACT" "$ARTIFACT.sig"
mkdir -p "$STAGING" build/artifacts

cp -r appinfo lib templates l10n img "$STAGING/"
cp LICENSE CHANGELOG.md "$STAGING/"
# Built assets, without source maps (they'd triple the package size).
mkdir -p "$STAGING/js" "$STAGING/css"
cp js/*.mjs js/*.license "$STAGING/js/"
cp css/*.css "$STAGING/css/"

if [ -n "$KEY" ]; then
	[ -f "$KEY" ] || { echo "Private key $KEY not found" >&2; exit 1; }
	if [ -z "$CERT" ]; then
		CERT=$(realpath build)/$APP_ID.crt
		curl -fsSL -o "$CERT" "https://raw.githubusercontent.com/nextcloud/app-certificate-requests/master/$APP_ID/$APP_ID.crt"
	fi
	NEXTCLOUD=$(sed -n 's:.*<nextcloud min-version="\([0-9]*\)".*:\1:p' appinfo/info.xml)
	docker run --rm --user "$(id -u):$(id -g)" \
		-v "$PWD/$STAGING:/sign/$APP_ID" -v "$KEY:/sign/app.key:ro" -v "$CERT:/sign/app.crt:ro" \
		--entrypoint sh "nextcloud:$NEXTCLOUD" -c "
			set -e
			cp -r /usr/src/nextcloud /tmp/nextcloud
			cd /tmp/nextcloud
			php occ maintenance:install --database sqlite --data-dir /tmp/nextcloud/data \
				--admin-user admin --admin-pass \"\$(head -c 24 /dev/urandom | base64)\" > /dev/null
			php occ integrity:sign-app --path=/sign/$APP_ID --privateKey=/sign/app.key --certificate=/sign/app.crt
			php occ integrity:check-app $APP_ID --path=/sign/$APP_ID"
fi

# Reproducible: sorted entries, fixed owner and modes, mtimes from the last commit.
MTIME=$(git log -1 --format=%cI 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%SZ)
tar --sort=name --owner=0 --group=0 --numeric-owner --mode=u=rwX,go=rX --mtime="$MTIME" \
	-czf "$ARTIFACT" -C build/staging "$APP_ID"

if [ -n "$KEY" ]; then
	openssl dgst -sha512 -sign "$KEY" "$ARTIFACT" | openssl base64 -A > "$ARTIFACT.sig"
fi

echo "$ARTIFACT"
sha256sum "$ARTIFACT"
