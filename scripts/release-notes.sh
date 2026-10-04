#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Nico Störzbach
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Print the CHANGELOG.md section of a version (without its heading) for the
# GitHub release notes; fails if it's missing or empty. A pre-release
# (1.2.0-beta.1) uses the "## [Unreleased]" section, as the app store does.
set -euo pipefail

VERSION=${1:?usage: $0 <version>}
cd "$(dirname "$0")/.."

SECTION=$VERSION
if [[ $VERSION == *-* ]]; then
	SECTION=Unreleased
fi

NOTES=$(awk -v heading="## [$SECTION]" '
	index($0, heading) == 1 { found = 1; next }
	found && /^## \[/ { exit }
	found { print }
' CHANGELOG.md | sed -e '/./,$!d')

if [ -z "${NOTES//[[:space:]]/}" ]; then
	echo "CHANGELOG.md has no entries under '## [$SECTION]'" >&2
	exit 1
fi
printf '%s\n' "$NOTES"
