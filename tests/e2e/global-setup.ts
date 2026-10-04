/*
 * SPDX-FileCopyrightText: 2026 Nico Störzbach
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { FullConfig } from '@playwright/test'

import { occ, resetAppConfig } from './helpers.ts'

/**
 * Bring every test instance into the state the tests expect: app enabled,
 * English UI (tests use English labels), no first-run dialog covering the
 * Files app, and no admin settings left over from an earlier run.
 *
 * @param config the Playwright config
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
	for (const project of config.projects) {
		const container = project.metadata.container as string
		occ(container, 'app:enable', 'public_share_control')
		occ(container, 'app:disable', 'firstrunwizard')
		occ(container, 'user:setting', 'admin', 'core', 'lang', 'en')
		await resetAppConfig(project.use.baseURL as string)
	}
}
