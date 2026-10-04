<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Nico Störzbach
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\PublicShareControl\Controller;

use OCA\PublicShareControl\AppInfo\Application;
use OCA\PublicShareControl\Service\AdminConfig;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\FrontpageRoute;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IRequest;

/**
 * Stores the "New" menu entries registered in an administrator's Files app
 * (src/discovery.ts). Admins only and CSRF-protected, the framework's
 * defaults.
 */
final class DiscoveredEntriesController extends Controller {
	public function __construct(
		IRequest $request,
		private AdminConfig $adminConfig,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	/**
	 * @param mixed $entries the complete list
	 */
	#[FrontpageRoute(verb: 'POST', url: '/discovered-entries')]
	public function update(mixed $entries = null): JSONResponse {
		$normalized = AdminConfig::normalizeDiscoveredEntries($entries);
		if ($normalized === null) {
			return new JSONResponse([], Http::STATUS_BAD_REQUEST);
		}
		$this->adminConfig->setDiscoveredEntries($normalized);
		return new JSONResponse([]);
	}
}
