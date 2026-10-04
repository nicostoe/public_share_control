<?php

declare(strict_types=1);

namespace OCA\PublicShareControl\Settings;

use OCA\PublicShareControl\AppInfo\Application;
use OCA\PublicShareControl\Service\AdminConfig;
use OCP\App\IAppManager;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\AppFramework\Services\IInitialState;
use OCP\Files\Template\ITemplateManager;
use OCP\Files\Template\TemplateFileCreator;
use OCP\Settings\ISettings;
use OCP\Util;

/**
 * Instance-wide "Create new" defaults/restrictions and the quick-upload
 * button toggle, in the existing "Sharing" admin settings section.
 *
 * Plain ISettings, not IDelegatedSettings: this app has no subadmin
 * delegation use case, and a full instance admin is authorized
 * unconditionally by the generic provisioning_api config endpoint this
 * settings page saves through (confirmed via
 * AppConfigController::isAllowedToChangedKey() in nextcloud/server) — an
 * IDelegatedSettings::getAuthorizedAppConfig() allow-list would only matter
 * for delegating this page to non-admin subadmins, which was never asked
 * for.
 */
final class Admin implements ISettings {
	public function __construct(
		private IInitialState $initialState,
		private ITemplateManager $templateManager,
		private AdminConfig $adminConfig,
		private IAppManager $appManager,
	) {
	}

	#[\Override]
	public function getForm(): TemplateResponse {
		// listCreators() is safe to call from any PHP context — it only
		// dispatches RegisterTemplateCreatorEvent and collects the results,
		// touching no per-user/per-folder state (confirmed by reading
		// TemplateManager::listCreators()/getTypes() in nextcloud/server).
		// This is the ONLY server-side enumeration of "Create new" entries
		// that exists at all — see AdminSettings.vue for why "New folder" is
		// hardcoded alongside this instead.
		$templateCreators = array_map(
			static fn (TemplateFileCreator $creator): array => $creator->jsonSerialize(),
			$this->templateManager->listCreators(),
		);

		$this->initialState->provideInitialState('template-creators', $templateCreators);
		// The Text app's "Add folder description" entry is registered purely
		// client-side (like "New folder"), so the admin page can only offer it
		// as a hardcoded row — and only makes sense when Text is enabled.
		$this->initialState->provideInitialState('text-app-enabled', $this->appManager->isEnabledForAnyone('text'));
		// Same initial-state key names as LoadSidebarListener/
		// BeforeTemplateRenderedListener push on their own pages — no
		// collision (each page only ever has its own script tags), and
		// reusing them here avoids a second, parallel set of key names to
		// keep in sync for what's ultimately the same three settings.
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
