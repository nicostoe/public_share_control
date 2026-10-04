#!/usr/bin/env bash
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

	printf 'waiting for install'
	until docker exec -u www-data "$container" php occ status --output=json 2>/dev/null | grep -q '"installed":true'; do
		printf '.'
		sleep 3
	done
	echo ' done'

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
