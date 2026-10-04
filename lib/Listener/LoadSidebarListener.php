<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Nico Störzbach
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\PublicShareControl\Listener;

use OCA\Files\Event\LoadSidebar;
use OCA\PublicShareControl\AppInfo\Application;
use OCA\PublicShareControl\Service\AdminConfig;
use OCP\AppFramework\Services\IInitialState;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\Util;

/**
 * Loads the sharing sidebar control, with the admin settings as initial state.
 *
 * @template-implements IEventListener<LoadSidebar>
 */
final class LoadSidebarListener implements IEventListener {
	public function __construct(
		private IInitialState $initialState,
		private AdminConfig $adminConfig,
	) {
	}

	#[\Override]
	public function handle(Event $event): void {
		if (!($event instanceof LoadSidebar)) {
			return;
		}

		$this->initialState->provideInitialState(Application::CONFIG_DEFAULT_HIDDEN_KEY, $this->adminConfig->getDefaultHiddenEntries());
		$this->initialState->provideInitialState(Application::CONFIG_FORBIDDEN_KEY, $this->adminConfig->getForbiddenEntries());

		Util::addScript(Application::APP_ID, 'public_share_control-main');
		Util::addStyle(Application::APP_ID, 'public_share_control-main');
	}
}
