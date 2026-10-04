/*
 * SPDX-FileCopyrightText: 2026 Nico Störzbach
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { Browser, Page } from '@playwright/test'

import { spawnSync } from 'node:child_process'

export const ADMIN_USER = 'admin'
export const ADMIN_PASSWORD = 'Admin1234!'
const AUTH = 'Basic ' + Buffer.from(`${ADMIN_USER}:${ADMIN_PASSWORD}`).toString('base64')

/**
 * Run an occ command in a test instance container and return its stdout.
 * Failures are left to the caller to check.
 *
 * @param container the Docker container of the instance
 * @param args the occ arguments
 */
export function occ(container: string, ...args: string[]): string {
	return spawnSync('docker', ['exec', '-u', 'www-data', container, 'php', 'occ', ...args], { encoding: 'utf8' }).stdout
}

/**
 * Set one of this app's admin settings through the web server's app config
 * endpoint, not `occ`: the instances cache app config in APCu, which the CLI
 * doesn't share.
 *
 * @param baseURL the instance's base URL
 * @param key the app config key
 * @param value the value, JSON-encoded where the app expects JSON
 */
export async function setAppConfig(baseURL: string, key: string, value: string): Promise<void> {
	await appConfigRequest(baseURL, key, { method: 'POST', body: new URLSearchParams({ value }) })
}

/**
 * Remove all of this app's admin settings and discovered entries again.
 *
 * @param baseURL the instance's base URL
 */
export async function resetAppConfig(baseURL: string): Promise<void> {
	for (const key of ['default-hidden-entries', 'forbidden-entries', 'quick-upload-enabled', 'discovered-entries']) {
		await appConfigRequest(baseURL, key, { method: 'DELETE' })
	}
}

/**
 * Let the app discover the "New" menu entries: forget the stored ones, open
 * the Files app as the logged-in admin and wait until the list is stored.
 *
 * @param page a page logged in as the test admin
 * @param baseURL the instance's base URL
 */
export async function discoverEntries(page: Page, baseURL: string): Promise<void> {
	await appConfigRequest(baseURL, 'discovered-entries', { method: 'DELETE' })
	const stored = page.waitForResponse((response) => response.url().endsWith('/apps/public_share_control/discovered-entries') && response.request().method() === 'POST')
	await page.goto('/index.php/apps/files/files')
	if (!(await stored).ok()) {
		throw new Error('Storing the discovered entries failed')
	}
}

/**
 * POST to the discovery endpoint from a logged-in page, with its CSRF token.
 *
 * @param page a page logged in as the test admin
 * @param body the request body
 */
export async function postDiscoveredEntries(page: Page, body: unknown): Promise<number> {
	return page.evaluate(async (payload) => {
		const response = await fetch('/index.php/apps/public_share_control/discovered-entries', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', requesttoken: document.head.dataset.requesttoken ?? '' },
			body: JSON.stringify(payload),
		})
		return response.status
	}, body)
}

/**
 * Request to the provisioning API's app config endpoint for this app.
 *
 * @param baseURL the instance's base URL
 * @param key the app config key
 * @param init fetch options
 */
async function appConfigRequest(baseURL: string, key: string, init: RequestInit): Promise<void> {
	const response = await fetch(`${baseURL}/ocs/v2.php/apps/provisioning_api/api/v1/config/apps/public_share_control/${key}`, {
		...init,
		headers: { Authorization: AUTH, 'OCS-APIRequest': 'true' },
	})
	if (!response.ok) {
		throw new Error(`App config request for ${key} failed: HTTP ${response.status}`)
	}
}

export type TestShare = { id: string, token: string, folder: string }
type OcsShare = { id: string, token: string, path: string, share_type: number, attributes: string | null }

/**
 * Call the OCS sharing API as the test admin.
 *
 * @param baseURL the instance's base URL
 * @param path the path below apps/files_sharing/api/v1/
 * @param init fetch options
 */
async function ocs(baseURL: string, path: string, init: RequestInit = {}): Promise<unknown> {
	const response = await fetch(`${baseURL}/ocs/v2.php/apps/files_sharing/api/v1/${path}${path.includes('?') ? '&' : '?'}format=json`, {
		...init,
		headers: { Authorization: AUTH, 'OCS-APIRequest': 'true', 'Content-Type': 'application/x-www-form-urlencoded', ...init.headers },
	})
	return ((await response.json()) as { ocs: { data: unknown } }).ocs.data
}

/**
 * WebDAV request on the test admin's files.
 *
 * @param baseURL the instance's base URL
 * @param path path below the admin's files root
 * @param init fetch options
 */
export function dav(baseURL: string, path: string, init: RequestInit = {}): Promise<Response> {
	return fetch(`${baseURL}/remote.php/dav/files/${ADMIN_USER}/${path}`, { ...init, headers: { Authorization: AUTH, ...init.headers } })
}

/**
 * Get (or create) a folder with exactly one public link share, reset to
 * "never configured": no attributes, nothing hidden, upload allowed (or
 * read-only with `permissions: 1`).
 *
 * @param baseURL the instance's base URL
 * @param folder the folder name
 * @param permissions share permissions (15 = upload + editing)
 */
export async function testShare(baseURL: string, folder: string, permissions = 15): Promise<TestShare> {
	await dav(baseURL, folder, { method: 'MKCOL' })
	const shares = (await ocs(baseURL, `shares?path=/${folder}`)) as OcsShare[]
	let share = shares.find((candidate) => Number(candidate.share_type) === 3)
	if (share === undefined) {
		share = (await ocs(baseURL, 'shares', { method: 'POST', body: `path=/${folder}&shareType=3&permissions=${permissions}` })) as OcsShare
	}
	await ocs(baseURL, `shares/${share.id}`, { method: 'PUT', body: 'attributes=%5B%5D&hideDownload=false' })
	return { id: share.id, token: share.token, folder }
}

/**
 * Change fields of a test share through the OCS API, as the share editor
 * would (e.g. `{ password: '…' }` or `{ attributes: '[…]' }`).
 *
 * @param baseURL the instance's base URL
 * @param share the test share
 * @param fields the fields to change
 */
export async function updateShare(baseURL: string, share: TestShare, fields: Record<string, string>): Promise<void> {
	await ocs(baseURL, `shares/${share.id}`, { method: 'PUT', body: new URLSearchParams(fields).toString() })
}

/**
 * The ids this app has stored on a share, or null if it stored nothing.
 *
 * @param baseURL the instance's base URL
 * @param share the test share
 */
export async function storedHiddenIds(baseURL: string, share: TestShare): Promise<string[] | null> {
	const data = (await ocs(baseURL, `shares/${share.id}`)) as OcsShare[]
	const attributes = JSON.parse(data[0].attributes ?? '[]') as { scope: string, value: { id: string }[] }[]
	return attributes.find((attribute) => attribute.scope === 'public_share_control')?.value.map((ref) => ref.id) ?? null
}

/**
 * Log in as the test admin.
 *
 * @param page the page to log in with
 */
export async function login(page: Page): Promise<void> {
	await page.goto('/index.php/login')
	await page.fill('input[name=user]', ADMIN_USER)
	await page.fill('input[name=password]', ADMIN_PASSWORD)
	await page.click('button[type=submit]')
	await page.waitForURL(/apps\//)
}

/**
 * Open the Files app and the sharing sidebar of a folder.
 *
 * @param page a logged-in page
 * @param folder the folder name
 * @param dir the directory containing the folder
 */
export async function openSharingSidebar(page: Page, folder: string, dir = '/'): Promise<void> {
	await page.goto(`/index.php/apps/files/files?dir=${encodeURIComponent(dir)}`)
	await page.locator('tr', { hasText: folder }).first().locator('button[aria-label*="Actions"]').first().click()
	await page.getByText('Details', { exact: true }).click()
	await page.getByText('Share link', { exact: true }).waitFor()
}

/**
 * Open the link share's editor ("Customize link") with advanced settings
 * expanded, where this app's "New" menu control lives.
 *
 * @param page a page with the sharing sidebar open
 */
export async function openShareEditor(page: Page): Promise<void> {
	await page.locator('button[aria-label*="Actions"]').last().click()
	await page.getByText('Customize link', { exact: true }).click()
	await page.getByText('Advanced settings', { exact: true }).click()
	await selectionButton(page).waitFor()
}

/**
 * The button opening this app's entry selection in the share editor.
 *
 * @param page a page with the share editor open
 */
export function selectionButton(page: Page) {
	return page.locator('button').filter({ hasText: /entries (hidden|visible)/ }).first()
}

/**
 * Toggle one entry in this app's selection popover, then close it again.
 *
 * @param page a page with the share editor open
 * @param label the entry's label
 */
export async function toggleEntry(page: Page, label: string): Promise<void> {
	await selectionButton(page).click()
	await page.getByText(label, { exact: true }).click()
	await page.keyboard.press('Escape')
}

/**
 * Click core's "Update share" and wait for its request to finish.
 *
 * @param page a page with the share editor open
 */
export async function saveShare(page: Page): Promise<void> {
	const response = page.waitForResponse((r) => r.request().method() === 'PUT' && r.url().includes('/shares/'))
	await page.getByRole('button', { name: 'Update share' }).click()
	await response
}

/**
 * The labels a visitor sees in the public page's "New" menu.
 *
 * @param browser the browser to open a fresh, anonymous context in
 * @param baseURL the instance's base URL
 * @param share the test share
 */
export async function publicNewMenu(browser: Browser, baseURL: string, share: TestShare): Promise<string[]> {
	const context = await browser.newContext({ baseURL, locale: 'en-US' })
	const page = await context.newPage()
	await page.goto(`/index.php/s/${share.token}`)
	const items = await newMenuItems(page)
	await context.close()
	return items
}

/**
 * Open the "New" menu on a public share page that is already loaded and
 * return its labels.
 *
 * @param page a page showing a public share
 */
export async function newMenuItems(page: Page): Promise<string[]> {
	await page.getByRole('button', { name: /^New$/ }).first().click()
	await page.getByRole('menuitem').first().waitFor()
	return (await page.getByRole('menuitem').allInnerTexts()).map((text) => text.trim())
}
