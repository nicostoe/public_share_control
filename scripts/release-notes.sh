#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Nico Störzbach
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Print the CHANGELOG.md section of a version (without its "## [x.y.z]"
# heading), for the GitHub release notes. Fails if the section is missing or
# empty, so a release can't go out without changelog entries.
#
# A pre-release (1.2.0-beta.1, 1.2.0-rc.1, …) has no section of its own: its
# notes are the "## [Unreleased]" section, which keeps that heading until the
# final release. That's also where the app store reads a pre-release's
# changelog from.
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
