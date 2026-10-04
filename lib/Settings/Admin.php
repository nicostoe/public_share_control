<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Nico Störzbach
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\PublicShareControl\Settings;

use OCA\PublicShareControl\AppInfo\Application;
use OCA\PublicShareControl\Service\AdminConfig;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\AppFramework\Services\IInitialState;
use OCP\Files\Template\ITemplateManager;
use OCP\Files\Template\TemplateFileCreator;
use OCP\Settings\ISettings;
use OCP\Util;

/**
 * The app's section in the "Sharing" admin settings. It saves through the
 * provisioning API's app config endpoint, which accepts any admin, so the
 * page isn't delegable to non-admins (no IDelegatedSettings).
 */
final class Admin implements ISettings {
	public function __construct(
		private IInitialState $initialState,
		private ITemplateManager $templateManager,
		private AdminConfig $adminConfig,
	) {
	}

	#[\Override]
	public function getForm(): TemplateResponse {
		// The only server-side list of "New" menu entries: those created from
		// templates. The others are found in an administrator's Files app.
		$templateCreators = array_map(
			static fn (TemplateFileCreator $creator): array => $creator->jsonSerialize(),
			$this->templateManager->listCreators(),
		);

		$this->initialState->provideInitialState('template-creators', $templateCreators);
		$this->initialState->provideInitialState(Application::CONFIG_DISCOVERED_ENTRIES_KEY, $this->adminConfig->getDiscoveredEntries());
		$this->initialState->provideInitialState(Application::CONFIG_DEFAULT_HIDDEN_KEY, $this->adminConfig->getDefaultHiddenEntries());
		$this->initialState->provideInitialState(Application::CONFIG_FORBIDDEN_KEY, $this->adminConfig->getForbiddenEntries());
		$this->initialState->provideInitialState(Application::CONFIG_QUICK_UPLOAD_ENABLED_KEY, $this->adminConfig->isQuickUploadEnabled());

		Util::addScript(Application::APP_ID, 'public_share_control-settings');
		Util::addStyle(Application::APP_ID, 'public_share_control-settings');

		return new TemplateResponse(Application::APP_ID, 'settings-admin', [], '');
	}

	#[\Override]
	public function getSection(): string {
		return 'sharing';
	}

	#[\Override]
	public function getPriority(): int {
		return 50;
	}
}
