<?php

declare(strict_types=1);

namespace OCA\PublicShareControl\Service;

use OCA\PublicShareControl\AppInfo\Application;
use OCP\IAppConfig;

/**
 * Reads the instance-wide admin settings (set via the "Sharing" admin
 * settings panel, Settings\Admin::getForm()). Centralized here so the three
 * PHP call sites that need these values (the owner sidebar listener, the
 * public page listener, and the admin settings panel itself, to prefill its
 * form) don't each re-implement the same read/parse/filter logic.
 *
 * Values are written through the generic provisioning_api config endpoint
 * (see AdminSettings.vue), not through this service — there is deliberately
 * no setter here.
 */
final class AdminConfig {
	public function __construct(
		private IAppConfig $appConfig,
	) {
	}

	/**
	 * "Create new" entries the admin chose to hide by default for any share
	 * whose owner hasn't made their own explicit per-share choice yet (see
	 * HideCreateNewEntry.vue's computeHiddenIds()). Each item is the same
	 * shape as a per-share hidden-entry reference — {id} or {id,
	 * templateKey} — interpreted by the frontend's normalizeHiddenEntries().
	 *
	 * @return list<array{id: string, templateKey?: string}>
	 */
	public function getDefaultHiddenEntries(): array {
		return $this->readEntryRefList(Application::CONFIG_DEFAULT_HIDDEN_KEY);
	}

	/**
	 * "Create new" entries the admin forbade entirely — always hidden on
	 * every public page, and shown as disabled (unselectable) checkboxes in
	 * the owner sidebar, regardless of any per-share choice.
	 *
	 * @return list<array{id: string, templateKey?: string}>
	 */
	public function getForbiddenEntries(): array {
		return $this->readEntryRefList(Application::CONFIG_FORBIDDEN_KEY);
	}

	/**
	 * Whether the app's "Upload files" quick-upload button should appear on
	 * public share pages at all. Defaults to enabled, matching this app's
	 * behavior before this setting existed.
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

		// Admin-editable data via the generic provisioning_api endpoint, not
		// guaranteed well-formed: keep only well-formed references, and only
		// the fields the frontend uses.
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
