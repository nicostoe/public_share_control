<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Nico Störzbach
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

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
	 * Share attribute with the "New" menu entries hidden on this link. When
	 * it's absent, the admin defaults apply. Must match src/constants.ts.
	 */
	public const ATTR_SCOPE = 'public_share_control';
	public const ATTR_KEY = 'hidden-create-entries';

	/**
	 * App config keys of the admin settings: two JSON lists of entries, in the
	 * same shape as the share attribute, and 'yes'/'no' for the quick-upload
	 * button. Must match src/constants.ts.
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
