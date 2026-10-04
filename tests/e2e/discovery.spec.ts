/*
 * SPDX-FileCopyrightText: 2026 Nico Störzbach
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { Page } from '@playwright/test'

import { expect, test } from '@playwright/test'
import { ADMIN_PASSWORD, ADMIN_USER, discoverEntries, login, openFilesAndAwaitDiscovery, postDiscoveredEntries, resetAppConfig } from './helpers.ts'

const ENDPOINT = '/index.php/apps/public_share_control/discovered-entries'
const FAKE_ENTRY = { id: 'psc-e2e-fake', label: 'PSC E2E fake entry', category: 1, icon: '', order: 0 }

/**
 * The labels of the admin page's entry rows.
 *
 * @param page a page logged in as the test admin
 */
async function adminRows(page: Page): Promise<string[]> {
	await page.goto('/index.php/settings/admin/sharing')
	const section = page.locator('#public_share_control-settings')
	await section.getByText('Text document', { exact: true }).waitFor()
	return (await section.locator('[class*="entryLabel"]').allInnerTexts()).map((label) => label.trim())
}

test.beforeEach(async ({ page, baseURL }) => {
	await resetAppConfig(baseURL!)
	await login(page)
})

test.afterEach(async ({ baseURL }) => {
	await resetAppConfig(baseURL!)
})

test('the admin page lists entries apps register in the browser once an admin opened Files', async ({ page, baseURL }) => {
	expect(await adminRows(page)).not.toContain('New folder')
	await expect(page.getByText('appear here once an administrator has opened the Files app')).toBeVisible()

	await discoverEntries(page, baseURL!)
	const rows = await adminRows(page)
	expect(rows).toContain('New folder')
	expect(rows).toContain('Add folder description')
	// Template-based entries come from the server's list, not twice.
	expect(rows.filter((label) => label === 'Text document')).toHaveLength(1)
})

test('entries no longer registered are removed once the Files app is left', async ({ page, baseURL }) => {
	await discoverEntries(page, baseURL!)
	await page.goto('/index.php/settings/admin/sharing')
	expect(await postDiscoveredEntries(page, { entries: [FAKE_ENTRY] })).toBe(200)
	expect(await adminRows(page)).toContain(FAKE_ENTRY.label)

	// Missing while the Files app is open, so it's removed when the page is left.
	await openFilesAndAwaitDiscovery(page)
	await expect.poll(async () => adminRows(page)).not.toContain(FAKE_ENTRY.label)
	expect(await adminRows(page)).toContain('New folder')
})

test('only admins can store entries, and only with a CSRF token', async ({ baseURL }) => {
	const ocs = (path: string, init: RequestInit) => fetch(`${baseURL}/ocs/v2.php/cloud/${path}`, {
		...init,
		headers: { Authorization: 'Basic ' + Buffer.from(`${ADMIN_USER}:${ADMIN_PASSWORD}`).toString('base64'), 'OCS-APIRequest': 'true', ...init.headers },
	})
	const user = { name: 'psc-e2e-user', password: 'PSC-e2e-User-4711!' }
	await ocs(`users/${user.name}`, { method: 'DELETE' })
	expect((await ocs('users', { method: 'POST', body: new URLSearchParams({ userid: user.name, password: user.password }) })).ok).toBe(true)

	const post = (name: string, password: string) => fetch(`${baseURL}${ENDPOINT}`, {
		method: 'POST',
		headers: { Authorization: 'Basic ' + Buffer.from(`${name}:${password}`).toString('base64'), 'Content-Type': 'application/json' },
		body: JSON.stringify({ entries: [FAKE_ENTRY] }),
	})
	try {
		expect((await post(user.name, user.password)).status).toBe(403)
		// An admin, but without the CSRF token a browser session sends.
		expect((await post(ADMIN_USER, ADMIN_PASSWORD)).status).toBe(412)
	} finally {
		await ocs(`users/${user.name}`, { method: 'DELETE' })
	}
})

test('invalid lists are rejected and change nothing', async ({ page, baseURL }) => {
	await discoverEntries(page, baseURL!)
	await page.goto('/index.php/settings/admin/sharing')
	for (const entries of [
		'not a list',
		[{ ...FAKE_ENTRY, category: 0 }],
		[{ ...FAKE_ENTRY, icon: 'x'.repeat(40_000) }],
		Array.from({ length: 101 }, (_, index) => ({ ...FAKE_ENTRY, id: `entry-${index}` })),
	]) {
		expect(await postDiscoveredEntries(page, { entries })).toBe(400)
	}
	expect(await adminRows(page)).toContain('New folder')
})
