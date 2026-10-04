/*
 * SPDX-FileCopyrightText: 2026 Nico Störzbach
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { defineConfig } from '@playwright/test'

/**
 * End-to-end tests against the local test instances from dev/compose.yaml
 * (`docker compose -f dev/compose.yaml up -d`). One project per supported
 * Nextcloud version — raise info.xml's max-version only once a project for
 * the new version passes.
 *
 * Tests share server state (app config, the test admin), so they run
 * serially. PSC_CHROMIUM_PATH optionally points to a locally installed
 * Chromium instead of the one `npx playwright install chromium` downloads.
 */
export default defineConfig({
	testDir: 'tests/e2e',
	globalSetup: './tests/e2e/global-setup.ts',
	fullyParallel: false,
	workers: 1,
	timeout: 90_000,
	expect: { timeout: 15_000 },
	reporter: process.env.CI ? 'github' : 'list',
	use: {
		viewport: { width: 1280, height: 900 },
		locale: 'en-US',
		trace: 'retain-on-failure',
		launchOptions: process.env.PSC_CHROMIUM_PATH ? { executablePath: process.env.PSC_CHROMIUM_PATH } : {},
	},
	projects: [
		{ name: 'nc34', use: { baseURL: 'http://localhost:8034' }, metadata: { container: 'pscontrol-nc34' } },
		{ name: 'nc35', use: { baseURL: 'http://localhost:8035' }, metadata: { container: 'pscontrol-nc35' } },
	],
})
