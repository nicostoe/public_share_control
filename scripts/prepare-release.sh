#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Nico Störzbach
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Prepare a final release in one step, on an up-to-date main:
# - pick the next version after the latest release tag (patch by default),
# - if "## [Unreleased]" in CHANGELOG.md is empty, fill it with the pull
#   requests merged since that release (e.g. the Renovate updates),
# - set the version (scripts/bump-version.sh), commit "Release X.Y.Z" and
#   create the annotated tag vX.Y.Z.
# Pushing is up to the caller: .github/workflows/prepare-release.yml pushes
# and starts the release workflow; locally, push main and the tag yourself.
#
# usage: scripts/prepare-release.sh [patch|minor|major|X.Y.Z]
set -euo pipefail

BUMP=${1:-patch}
cd "$(dirname "$0")/.."

LAST=$(git tag -l 'v*' --sort=-v:refname | grep -v -- - | head -n 1 || true)
if [ -z "$LAST" ]; then
	echo "No release tag vX.Y.Z found" >&2
	exit 1
fi
IFS=. read -r MAJOR MINOR PATCH <<< "${LAST#v}"
case $BUMP in
	patch) VERSION=$MAJOR.$MINOR.$((PATCH + 1)) ;;
	minor) VERSION=$MAJOR.$((MINOR + 1)).0 ;;
	major) VERSION=$((MAJOR + 1)).0.0 ;;
	*) VERSION=$BUMP ;;
esac
if [[ $VERSION == *-* ]]; then
	echo "Release candidates are prepared by hand, see \"Releasing\" in AGENTS.md" >&2
	exit 1
fi

if [ -z "$(git rev-list "$LAST..HEAD")" ]; then
	echo "Nothing to release: no commits since $LAST" >&2
	exit 1
fi

if ! scripts/release-notes.sh Unreleased > /dev/null 2>&1; then
	ENTRIES=""
	for sha in $(git rev-list --merges --reverse "$LAST..HEAD"); do
		number=$(git log -1 --format=%s "$sha" | sed -n 's/^Merge pull request #\([0-9]*\) .*/\1/p')
		title=$(git log -1 --format=%b "$sha" | head -n 1)
		if [ -n "$number" ] && [ -n "$title" ]; then
			ENTRIES+="- $title (#$number)"$'\n'
		fi
	done
	if [ -z "$ENTRIES" ]; then
		echo "No entries under '## [Unreleased]' in CHANGELOG.md and no pull requests merged since $LAST" >&2
		exit 1
	fi
	ENTRIES="$ENTRIES" awk '
		{ print }
		$0 == "## [Unreleased]" && !done { printf "\n### Changed\n\n%s", ENVIRON["ENTRIES"]; done = 1 }
	' CHANGELOG.md > CHANGELOG.md.tmp
	mv CHANGELOG.md.tmp CHANGELOG.md
fi

scripts/bump-version.sh "$VERSION" > /dev/null
git commit -q -am "Release $VERSION"
git tag -a "v$VERSION" -m "Public Share Control $VERSION"
echo "Committed and tagged v$VERSION. Release notes:"
scripts/release-notes.sh "$VERSION"
