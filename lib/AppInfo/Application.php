<?php

declare(strict_types=1);

namespace OCA\PublicShareControl\AppInfo;

use OCA\Files\Event\LoadSidebar;
use OCA\Files_Sharing\Event\BeforeTemplateRenderedEvent;
use OCA\PublicShareControl\Listener\BeforeTemplateRenderedListener;
use OCA\PublicShareControl\Listener\LoadSidebarListener;
use OCP\AppFramework\App;
use OCP\AppFramework\Bootstrap\IBootContext;
use OCP\AppFramework\Bootstrap\IBootstrap;
use OCP\AppFramework\Bootstrap\IRegistrationContext;

final class Application extends App implements IBootstrap {
	public const APP_ID = 'public_share_control';

	/**
	 * Share attribute scope/key holding the list of "Create new" menu entry
	 * ids the owner unchecked for this link (JSON array of strings; empty or
	 * absent = nothing hidden). Must match src/constants.ts.
	 */
	public const ATTR_SCOPE = 'public_share_control';
	public const ATTR_KEY = 'hidden-create-entries';

	/**
	 * IAppConfig keys for the instance-wide admin settings. Values for the
	 * two entry-list keys are JSON arrays in the same shape as ATTR_KEY's
	 * (see src/hiddenEntries.ts's HiddenEntryRef); the quick-upload key is a
	 * plain 'yes'/'no' string (@nextcloud/password-confirmation's confirmed
	 * convention, see apps/sharebymail's AdminSettings.vue in nextcloud/server
	 * for the reference pattern this app's own admin settings follow). Must
	 * match src/constants.ts.
	 */
	public const CONFIG_DEFAULT_HIDDEN_KEY = 'default-hidden-entries';
	public const CONFIG_FORBIDDEN_KEY = 'forbidden-entries';
	public const CONFIG_QUICK_UPLOAD_ENABLED_KEY = 'quick-upload-enabled';

	public function __construct() {
		parent::__construct(self::APP_ID);
	}

	#[\Override]
	public function register(IRegistrationContext $context): void {
		$context->registerEventListener(LoadSidebar::class, LoadSidebarListener::class);
		$context->registerEventListener(BeforeTemplateRenderedEvent::class, BeforeTemplateRenderedListener::class);
	}

	#[\Override]
	public function boot(IBootContext $context): void {
	}
}
