<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Nico Störzbach
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Psalm stubs for the event classes this app listens to. They belong to
 * Nextcloud's bundled files/files_sharing apps, not to OCP, so nextcloud/ocp
 * doesn't ship them. Signatures copied from Nextcloud 34.
 */

namespace OCA\Files\Event {
	use OCP\EventDispatcher\Event;

	class LoadSidebar extends Event {
	}
}

namespace OCA\Files_Sharing\Event {
	use OCP\EventDispatcher\Event;
	use OCP\Share\IShare;

	class BeforeTemplateRenderedEvent extends Event {
		public const SCOPE_PUBLIC_SHARE_AUTH = 'publicShareAuth';

		public function __construct(IShare $share, ?string $scope = null) {
		}

		public function getShare(): IShare {
		}

		public function getScope(): ?string {
		}
	}
}
