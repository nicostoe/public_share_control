/*
 * SPDX-FileCopyrightText: 2026 Nico Störzbach
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { defineConfig } from '@playwright/test'

/**
 * Takes the screenshots in screenshots/ (referenced by appinfo/info.xml) on
 * the newest local test instance: `npm run screenshots`. Separate from the
 * e2e config, so the test suite never runs it.
 */
export default defineConfig({
	testDir: '.',
	testMatch: 'screenshots.spec.ts',
	globalSetup: '../tests/e2e/global-setup.ts',
	workers: 1,
	timeout: 90_000,
	expect: { timeout: 15_000 },
	reporter: 'list',
	use: {
		// Tall enough for the sharing sidebar's popover to open below its
		// heading instead of covering it.
		viewport: { width: 1440, height: 1024 },
		deviceScaleFactor: 2,
		locale: 'en-US',
		launchOptions: process.env.PSC_CHROMIUM_PATH ? { executablePath: process.env.PSC_CHROMIUM_PATH } : {},
	},
	projects: [
		{ name: 'nc35', use: { baseURL: 'http://localhost:8035' }, metadata: { container: 'pscontrol-nc35' } },
	],
})
