#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Nico Störzbach
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Prepare a release: set the version in appinfo/info.xml and package.json
# (+ lock file).
#
# - Final release (1.2.0): CHANGELOG.md's "## [Unreleased]" section becomes
#   "## [1.2.0]", and a new, empty "## [Unreleased]" goes above it.
# - Release candidate (1.2.0-rc.1), the only kind of pre-release: CHANGELOG.md
#   stays as it is — the pre-release's notes are the current "## [Unreleased]"
#   section (see scripts/release-notes.sh).
#
# Commit, push and tag afterwards — see "Releasing" in AGENTS.md. The release
# workflow refuses tags whose version doesn't match.
set -euo pipefail

VERSION=${1:?usage: $0 <version>, e.g. $0 1.2.0 or $0 1.2.0-rc.1}
if ! [[ $VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+(-rc\.[0-9]+)?$ ]]; then
	echo "Version must look like 1.2.0, or 1.2.0-rc.1 for a release candidate" >&2
	exit 1
fi
cd "$(dirname "$0")/.."

# Nextcloud compares app versions with PHP's version_compare(), so use the
# same to make sure the new version is newer than every release so far.
for tag in $(git tag -l 'v*'); do
	if ! php -r 'exit(version_compare($argv[1], $argv[2], ">") ? 0 : 1);' "$VERSION" "${tag#v}"; then
		echo "$VERSION is not newer than the existing release $tag" >&2
		exit 1
	fi
done

# Both kinds of release need entries under "## [Unreleased]".
scripts/release-notes.sh Unreleased > /dev/null

sed -i "s:<version>.*</version>:<version>$VERSION</version>:" appinfo/info.xml
npm version "$VERSION" --no-git-tag-version --allow-same-version > /dev/null
if [[ $VERSION != *-* ]]; then
	sed -i "s:^## \[Unreleased\]$:## [Unreleased]\n\n## [$VERSION]:" CHANGELOG.md
fi

echo "Version set to $VERSION in appinfo/info.xml, package.json and package-lock.json."
if [[ $VERSION == *-* ]]; then
	echo "Release candidate: its notes are the current '## [Unreleased]' section of CHANGELOG.md."
else
	echo "CHANGELOG.md: '## [Unreleased]' is now '## [$VERSION]', with a new empty '## [Unreleased]' above it."
fi
echo "Next: review the changes, commit and push, wait for CI to pass, then:"
echo "  git tag -a v$VERSION -m \"Public Share Control $VERSION\" && git push origin v$VERSION"
