#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Nico Störzbach
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Prepare the local test instances from dev/compose.yaml: wait for the
# Nextcloud install to finish, enable the app, and create a test folder with
# a public link (upload + editing allowed). Safe to run repeatedly.
set -euo pipefail

ADMIN_USER=admin
ADMIN_PASS='Admin1234!'
FOLDER=PSC-Test

setup_instance() {
	local container=$1 port=$2
	local base="http://localhost:${port}"
	echo "== ${container} (${base})"

	printf 'waiting for Nextcloud'
	local deadline=$((SECONDS + 600))
	until [[ $(curl -sf "${base}/status.php" 2>/dev/null) == *'"installed":true'* ]]; do
		if ((SECONDS >= deadline)); then
			echo ' timed out after 10 minutes' >&2
			return 1
		fi
		printf '.'
		sleep 3
	done
	echo ' done'

	# The repository is the app: after a version bump in info.xml, Nextcloud
	# answers 503 until the upgrade has run. A no-op otherwise.
	docker exec -u www-data "$container" php occ upgrade > /dev/null
	docker exec -u www-data "$container" php occ app:enable public_share_control
	# The first-run "Welcome" dialog overlays the Files app and blocks browser tests.
	docker exec -u www-data "$container" php occ app:disable firstrunwizard >/dev/null 2>&1 || true

	curl -s -o /dev/null -u "${ADMIN_USER}:${ADMIN_PASS}" -X MKCOL \
		"${base}/remote.php/dav/files/${ADMIN_USER}/${FOLDER}"

	local existing
	existing=$(curl -s -u "${ADMIN_USER}:${ADMIN_PASS}" -H 'OCS-APIRequest: true' \
		"${base}/ocs/v2.php/apps/files_sharing/api/v1/shares?path=/${FOLDER}&format=json" \
		| php -r '$d = json_decode(stream_get_contents(STDIN), true); foreach ($d["ocs"]["data"] ?? [] as $s) { if ((int)$s["share_type"] === 3) { echo $s["token"]; break; } }')

	local token=$existing
	if [ -z "$token" ]; then
		# permissions 15 = read + update + create + delete ("Allow upload and editing")
		token=$(curl -s -u "${ADMIN_USER}:${ADMIN_PASS}" -H 'OCS-APIRequest: true' -X POST \
			-d "path=/${FOLDER}" -d shareType=3 -d permissions=15 \
			"${base}/ocs/v2.php/apps/files_sharing/api/v1/shares?format=json" \
			| php -r '$d = json_decode(stream_get_contents(STDIN), true); echo $d["ocs"]["data"]["token"] ?? "";')
	fi

	echo "admin:       ${base}  (${ADMIN_USER} / ${ADMIN_PASS})"
	echo "public link: ${base}/index.php/s/${token}"
	echo
}

setup_instance pscontrol-nc34 8034
setup_instance pscontrol-nc35 8035
