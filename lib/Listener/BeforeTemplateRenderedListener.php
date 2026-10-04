<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Nico Störzbach
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\PublicShareControl\Listener;

use OCA\Files_Sharing\Event\BeforeTemplateRenderedEvent;
use OCA\PublicShareControl\AppInfo\Application;
use OCA\PublicShareControl\Service\AdminConfig;
use OCP\AppFramework\Services\IInitialState;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\Util;

/**
 * Loads the public page script on folder share pages, with the link's own
 * selection and the admin settings as initial state.
 *
 * @template-implements IEventListener<BeforeTemplateRenderedEvent>
 */
final class BeforeTemplateRenderedListener implements IEventListener {
	public function __construct(
		private IInitialState $initialState,
		private AdminConfig $adminConfig,
	) {
	}

	#[\Override]
	public function handle(Event $event): void {
		if (!($event instanceof BeforeTemplateRenderedEvent)) {
			return;
		}

		// The event also fires for the password page of protected links (scope
		// SCOPE_PUBLIC_SHARE_AUTH). Only the share page itself has no scope, so
		// nothing reaches a visitor before the password, whatever scopes core
		// adds later.
		if ($event->getScope() !== null) {
			return;
		}

		$share = $event->getShare();
		if ($share->getNodeType() !== 'folder') {
			return;
		}

		$attributes = $share->getAttributes();
		$hiddenEntries = $attributes?->getAttribute(Application::ATTR_SCOPE, Application::ATTR_KEY);

		// Pushed whenever the attribute exists, even empty: an empty list means
		// "show everything", an absent one "apply the admin defaults".
		if (is_array($hiddenEntries)) {
			// Entries are {id, …} objects or plain id strings (legacy format),
			// interpreted by src/hiddenEntries.ts. The attribute can be written
			// through the sharing API, so anything else is dropped.
			$hiddenEntries = array_values(array_filter(
				$hiddenEntries,
				static fn ($entry) => is_string($entry) || (is_array($entry) && isset($entry['id']) && is_string($entry['id'])),
			));
			$this->initialState->provideInitialState(Application::ATTR_KEY, $hiddenEntries);
		}

		$this->initialState->provideInitialState(Application::CONFIG_DEFAULT_HIDDEN_KEY, $this->adminConfig->getDefaultHiddenEntries());
		$this->initialState->provideInitialState(Application::CONFIG_FORBIDDEN_KEY, $this->adminConfig->getForbiddenEntries());
		$this->initialState->provideInitialState(Application::CONFIG_QUICK_UPLOAD_ENABLED_KEY, $this->adminConfig->isQuickUploadEnabled());

		Util::addScript(Application::APP_ID, 'public_share_control-public');
		Util::addStyle(Application::APP_ID, 'public_share_control-public');
	}
}
