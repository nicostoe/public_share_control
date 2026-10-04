<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Nico Störzbach
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\PublicShareControl\Service;

use OCA\PublicShareControl\AppInfo\Application;
use OCP\IAppConfig;

/**
 * Reads the admin settings. They are written by the admin page through the
 * provisioning API's app config endpoint, so there is no setter.
 */
final class AdminConfig {
	public function __construct(
		private IAppConfig $appConfig,
	) {
	}

	/**
	 * Entries hidden on links whose owner hasn't changed the selection.
	 *
	 * @return list<array{id: string, templateKey?: string}>
	 */
	public function getDefaultHiddenEntries(): array {
		return $this->readEntryRefList(Application::CONFIG_DEFAULT_HIDDEN_KEY);
	}

	/**
	 * Entries hidden on every link, whatever its owner chose.
	 *
	 * @return list<array{id: string, templateKey?: string}>
	 */
	public function getForbiddenEntries(): array {
		return $this->readEntryRefList(Application::CONFIG_FORBIDDEN_KEY);
	}

	/**
	 * Whether public share pages show the "Upload files" button (default: yes).
	 */
	public function isQuickUploadEnabled(): bool {
		return $this->appConfig->getValueBool(Application::APP_ID, Application::CONFIG_QUICK_UPLOAD_ENABLED_KEY, true);
	}

	/**
	 * @return list<array{id: string, templateKey?: string}>
	 */
	private function readEntryRefList(string $key): array {
		$raw = $this->appConfig->getValueString(Application::APP_ID, $key, '[]');
		$decoded = json_decode($raw, true);
		if (!is_array($decoded)) {
			return [];
		}

		// Writable by any admin through the API: keep only well-formed entries
		// and only the fields the frontend uses.
		$entries = [];
		foreach ($decoded as $entry) {
			if (!is_array($entry) || !isset($entry['id']) || !is_string($entry['id'])) {
				continue;
			}
			$ref = ['id' => $entry['id']];
			if (isset($entry['templateKey']) && is_string($entry['templateKey'])) {
				$ref['templateKey'] = $entry['templateKey'];
			}
			$entries[] = $ref;
		}
		return $entries;
	}
}
