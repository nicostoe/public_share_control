#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Nico Störzbach
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Prepare a release: set the version in appinfo/info.xml and package.json
# (+ lock file), and turn CHANGELOG.md's "## [Unreleased]" section into
# "## [<version>]". Commit, push and tag afterwards — see "Releasing" in
# AGENTS.md. The release workflow refuses tags whose version doesn't match.
set -euo pipefail

VERSION=${1:?usage: $0 <version>, e.g. $0 1.0.0}
[[ $VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Version must look like 1.2.3" >&2; exit 1; }
cd "$(dirname "$0")/.."

grep -q '^## \[Unreleased\]' CHANGELOG.md || { echo "CHANGELOG.md has no '## [Unreleased]' section to release" >&2; exit 1; }

sed -i "s:<version>.*</version>:<version>$VERSION</version>:" appinfo/info.xml
npm version "$VERSION" --no-git-tag-version --allow-same-version > /dev/null
sed -i "s:^## \[Unreleased\]:## [$VERSION]:" CHANGELOG.md

echo "Version set to $VERSION in appinfo/info.xml, package.json, package-lock.json and CHANGELOG.md."
echo "Next: review the changes, commit, push, then: git tag v$VERSION && git push origin v$VERSION"
