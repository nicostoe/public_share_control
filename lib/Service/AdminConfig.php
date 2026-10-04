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
	private const MAX_DISCOVERED_ENTRIES = 100;
	private const MAX_TEXT_LENGTH = 255;
	private const MAX_ICON_BYTES = 32768;

	public function __construct(
		private IAppConfig $appConfig,
	) {
	}

	/**
	 * Entries hidden on links whose owner hasn't changed the selection.
	 *
	 * @return list<array{id: string, templateKey?: string, iconHash?: string}>
	 */
	public function getDefaultHiddenEntries(): array {
		return $this->readEntryRefList(Application::CONFIG_DEFAULT_HIDDEN_KEY);
	}

	/**
	 * Entries hidden on every link, whatever its owner chose.
	 *
	 * @return list<array{id: string, templateKey?: string, iconHash?: string}>
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
	 * The "New" menu entries last found in an administrator's Files app.
	 *
	 * @return list<array{id: string, label: string, category: int, icon: string, order: int|float}>
	 */
	public function getDiscoveredEntries(): array {
		$stored = $this->appConfig->getValueArray(Application::APP_ID, Application::CONFIG_DISCOVERED_ENTRIES_KEY, [], lazy: true);
		return self::normalizeDiscoveredEntries($stored) ?? [];
	}

	/**
	 * @param list<array{id: string, label: string, category: int, icon: string, order: int|float}> $entries
	 */
	public function setDiscoveredEntries(array $entries): void {
		$this->appConfig->setValueArray(Application::APP_ID, Application::CONFIG_DISCOVERED_ENTRIES_KEY, $entries, lazy: true);
	}

	/**
	 * Validate a list of discovered entries as sent by src/discovery.ts. Returns
	 * null if the list or any entry is invalid.
	 *
	 * @return list<array{id: string, label: string, category: int, icon: string, order: int|float}>|null
	 */
	public static function normalizeDiscoveredEntries(mixed $value): ?array {
		if (!is_array($value) || !array_is_list($value) || count($value) > self::MAX_DISCOVERED_ENTRIES) {
			return null;
		}
		$entries = [];
		foreach ($value as $entry) {
			if (!is_array($entry)) {
				return null;
			}
			$id = $entry['id'] ?? null;
			$label = $entry['label'] ?? null;
			$category = $entry['category'] ?? null;
			$icon = $entry['icon'] ?? null;
			$order = $entry['order'] ?? 0;
			// Categories 1 and 2: "Create new" and "Other", the ones that can be hidden.
			if (!is_string($id) || $id === '' || strlen($id) > self::MAX_TEXT_LENGTH
				|| !is_string($label) || strlen($label) > self::MAX_TEXT_LENGTH
				|| ($category !== 1 && $category !== 2)
				|| !is_string($icon) || strlen($icon) > self::MAX_ICON_BYTES
				|| !(is_int($order) || is_float($order))) {
				return null;
			}
			$entries[] = ['id' => $id, 'label' => $label, 'category' => $category, 'icon' => $icon, 'order' => $order];
		}
		return $entries;
	}

	/**
	 * @return list<array{id: string, templateKey?: string, iconHash?: string}>
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
			if (isset($entry['iconHash']) && is_string($entry['iconHash']) && preg_match('/^[0-9a-f]{16}$/', $entry['iconHash']) === 1) {
				$ref['iconHash'] = $entry['iconHash'];
			}
			$entries[] = $ref;
		}
		return $entries;
	}
}
