#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Nico Störzbach
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Print the CHANGELOG.md section of a version (without its "## [x.y.z]"
# heading), for the GitHub release notes. Fails if the section is missing or
# empty, so a release can't go out without changelog entries.
set -euo pipefail

VERSION=${1:?usage: $0 <version>}
cd "$(dirname "$0")/.."

NOTES=$(awk -v heading="## [$VERSION]" '
	index($0, heading) == 1 { found = 1; next }
	found && /^## \[/ { exit }
	found { print }
' CHANGELOG.md | sed -e '/./,$!d')

if [ -z "${NOTES//[[:space:]]/}" ]; then
	echo "CHANGELOG.md has no entries under '## [$VERSION]'" >&2
	exit 1
fi
printf '%s\n' "$NOTES"
