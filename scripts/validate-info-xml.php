<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Nico Störzbach
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Validate appinfo/info.xml against the Nextcloud app store schema — the app
 * store rejects releases whose info.xml doesn't validate.
 */

$schemaUrl = 'https://apps.nextcloud.com/schema/apps/info.xsd';
$schema = file_get_contents($schemaUrl);
if ($schema === false) {
	fwrite(STDERR, "Could not download $schemaUrl\n");
	exit(2);
}
$schemaFile = tempnam(sys_get_temp_dir(), 'info-xsd-');
file_put_contents($schemaFile, $schema);

libxml_use_internal_errors(true);
$document = new DOMDocument();
$valid = $document->load(__DIR__ . '/../appinfo/info.xml') && $document->schemaValidate($schemaFile);
unlink($schemaFile);

foreach (libxml_get_errors() as $error) {
	// GitHub Actions annotation format; readable in a terminal as well.
	echo '::error file=appinfo/info.xml,line=' . $error->line . '::' . trim($error->message) . "\n";
}
echo $valid ? "appinfo/info.xml is valid\n" : '';
exit($valid ? 0 : 1);
