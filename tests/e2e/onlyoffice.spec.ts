/*
 * SPDX-FileCopyrightText: 2026 Nico Störzbach
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { Browser, Page } from '@playwright/test'
import type { TestShare } from './helpers.ts'

import { expect, test } from '@playwright/test'
import { ADMIN_PASSWORD, ADMIN_USER, discoverEntries, login, openShareEditor, openSharingSidebar, resetAppConfig, saveShare, testShare, toggleEntry } from './helpers.ts'

// OnlyOffice registers its documents as templates in the Files app but under
// its own ids on public pages. Runs only where OnlyOffice is installed, not in CI.

let share: TestShare

/**
 * Whether an app is enabled on the instance.
 *
 * @param baseURL the instance's base URL
 * @param app the app id
 */
async function appEnabled(baseURL: string, app: string): Promise<boolean> {
	const response = await fetch(`${baseURL}/ocs/v2.php/cloud/apps?filter=enabled&format=json`, {
		headers: { Authorization: 'Basic ' + Buffer.from(`${ADMIN_USER}:${ADMIN_PASSWORD}`).toString('base64'), 'OCS-APIRequest': 'true' },
	})
	return ((await response.json()) as { ocs: { data: { apps: string[] } } }).ocs.data.apps.includes(app)
}

/**
 * The labels a visitor sees in the public page's "New" menu, in a language.
 *
 * @param browser the browser to open a fresh, anonymous context in
 * @param baseURL the instance's base URL
 * @param locale the visitor's browser language
 */
async function publicMenu(browser: Browser, baseURL: string, locale: 'en-US' | 'de-DE'): Promise<string[]> {
	const context = await browser.newContext({ baseURL, locale })
	const visitor = await context.newPage()
	await visitor.goto(`/index.php/s/${share.token}`)
	await visitor.getByRole('button', { name: locale === 'de-DE' ? /^Neu$/ : /^New$/ }).first().click()
	await visitor.getByRole('menuitem').first().waitFor()
	const items = (await visitor.getByRole('menuitem').allInnerTexts()).map((text) => text.trim())
	await context.close()
	return items
}

/**
 * Turn on the admin page's "Forbidden" switch of an entry and wait until it's saved.
 *
 * @param page the admin sharing settings page
 * @param entry the entry's label
 */
async function forbid(page: Page, entry: string): Promise<void> {
	const row = page.locator('#public_share_control-settings').getByText(entry, { exact: true }).locator('xpath=ancestor::div[1]')
	const saved = page.waitForResponse((response) => response.url().includes('/config/apps/public_share_control/forbidden-entries') && response.ok())
	await row.getByText('Forbidden', { exact: true }).click()
	await saved
}

test.beforeEach(async ({ page, baseURL }) => {
	test.skip(!(await appEnabled(baseURL!, 'onlyoffice')), 'OnlyOffice is not installed on this instance')
	share = await testShare(baseURL!, 'PSC-E2E-OnlyOffice')
	await resetAppConfig(baseURL!)
	await login(page)
})

test.afterEach(async ({ baseURL }) => {
	await resetAppConfig(baseURL!)
})

test('the admin page lists "New PDF form"', async ({ page, baseURL }) => {
	await discoverEntries(page, baseURL!)
	await page.goto('/index.php/settings/admin/sharing')
	await expect(page.locator('#public_share_control-settings').getByText('New PDF form', { exact: true })).toBeVisible()
})

test('admin restrictions apply on public pages in every language', async ({ page, browser, baseURL }) => {
	await discoverEntries(page, baseURL!)
	await page.goto('/index.php/settings/admin/sharing')
	await forbid(page, 'New document')
	await forbid(page, 'New PDF form')

	const english = await publicMenu(browser, baseURL!, 'en-US')
	expect(english).not.toContain('New document')
	expect(english).not.toContain('New PDF form')
	expect(english).toContain('New spreadsheet')

	const german = await publicMenu(browser, baseURL!, 'de-DE')
	expect(german).not.toContain('Neues Dokument')
	expect(german).not.toContain('Neues PDF-Formular')
	expect(german).toContain('Neue Tabelle')
})

test('an owner\'s selection applies on public pages in every language', async ({ page, browser, baseURL }) => {
	await openSharingSidebar(page, share.folder)
	await openShareEditor(page)
	await toggleEntry(page, 'New spreadsheet')
	await saveShare(page)

	const german = await publicMenu(browser, baseURL!, 'de-DE')
	expect(german).not.toContain('Neue Tabelle')
	expect(german).toContain('Neues Dokument')
})
