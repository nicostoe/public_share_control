<?php

declare(strict_types=1);

namespace OCA\PublicShareControl\Listener;

use OCA\Files_Sharing\Event\BeforeTemplateRenderedEvent;
use OCA\PublicShareControl\AppInfo\Application;
use OCA\PublicShareControl\Service\AdminConfig;
use OCP\AppFramework\Services\IInitialState;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\Util;

/**
 * Injects the public-page script for every folder share — it always adds
 * the mobile quick-upload button (when the link allows uploads and the
 * admin hasn't disabled it instance-wide), and additionally hides specific
 * "Create new" entries per the owner's per-share choice and/or the admin's
 * instance-wide defaults/restrictions. File shares (nothing to browse or
 * upload into), the password page of protected links and everything else
 * are left untouched.
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

		// Core also fires this event for the password page of protected links
		// (scope SCOPE_PUBLIC_SHARE_AUTH), before the visitor has entered the
		// password. Only the share page itself has no scope: act there and
		// nowhere else, so nothing about the link — not even which menu
		// entries it hides — reaches anyone who hasn't authenticated. Checked
		// positively, so any scope core adds later is left alone as well.
		if ($event->getScope() !== null) {
			return;
		}

		$share = $event->getShare();
		if ($share->getNodeType() !== 'folder') {
			return;
		}

		$attributes = $share->getAttributes();
		$hiddenEntries = $attributes?->getAttribute(Application::ATTR_SCOPE, Application::ATTR_KEY);

		// Push whenever the attribute exists AT ALL — even as an empty array
		// — not only when non-empty. The frontend (public.ts) needs to tell
		// "owner never explicitly configured this share" (attribute absent,
		// apply the admin's default-hidden list) apart from "owner explicitly
		// chose to show everything" (attribute present as []) — collapsing
		// both into "don't push" here would make that distinction impossible
		// client-side. The sidebar keeps the same distinction when saving; see
		// "Explicit vs. never-touched" in AGENTS.md.
		if (is_array($hiddenEntries)) {
			// Each entry is either a plain string id (the format saved by
			// versions before 0.4.3) or an {id, displayName, templateKey}
			// object (current format — some apps assign their menu entry's id
			// dynamically, so the frontend also matches by templateKey/
			// displayName as fallbacks; see src/hiddenEntries.ts). Pass
			// either shape through as-is and let the frontend's own
			// normalizeHiddenEntries() interpret it — this listener only
			// needs to reject anything that's neither, since this is
			// user-editable API data, not guaranteed to be well-formed.
			$hiddenEntries = array_values(array_filter(
				$hiddenEntries,
				static fn ($entry) => is_string($entry) || (is_array($entry) && isset($entry['id']) && is_string($entry['id'])),
			));
			$this->initialState->provideInitialState(Application::ATTR_KEY, $hiddenEntries);
		}

		// Global, not per-share, so pushed unconditionally regardless of
		// whether the share itself has any attribute configured.
		$this->initialState->provideInitialState(Application::CONFIG_DEFAULT_HIDDEN_KEY, $this->adminConfig->getDefaultHiddenEntries());
		$this->initialState->provideInitialState(Application::CONFIG_FORBIDDEN_KEY, $this->adminConfig->getForbiddenEntries());
		$this->initialState->provideInitialState(Application::CONFIG_QUICK_UPLOAD_ENABLED_KEY, $this->adminConfig->isQuickUploadEnabled());

		Util::addScript(Application::APP_ID, 'public_share_control-public');
		Util::addStyle(Application::APP_ID, 'public_share_control-public');
	}
}
