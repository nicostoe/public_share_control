/*
 * SPDX-FileCopyrightText: 2026 Nico Störzbach
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { TestShare } from './helpers.ts'

import { expect, test } from '@playwright/test'
import { login, openShareEditor, openSharingSidebar, publicNewMenu, resetAppConfig, selectionButton, setAppConfig, testShare } from './helpers.ts'

let share: TestShare

test.beforeEach(async ({ baseURL }) => {
	share = await testShare(baseURL!, 'PSC-E2E-Admin')
})

test.afterEach(async ({ baseURL }) => {
	await resetAppConfig(baseURL!)
})

test('admin page uses the same icons as the real "New" menu', async ({ page, browser, baseURL }) => {
	// The icons of the real menu entries, from the registry on the public page.
	const visitor = await (await browser.newContext({ baseURL })).newPage()
	await visitor.goto(`/index.php/s/${share.token}`)
	await visitor.getByRole('button', { name: /^New$/ }).first().waitFor()
	const menuIcons = await visitor.evaluate(() => {
		const entries = (window as unknown as { _nc_files_scope: { v4_0: { newFileMenu: { _entries: { displayName: string, iconSvgInline: string }[] } } } })
			._nc_files_scope.v4_0.newFileMenu._entries
		return Object.fromEntries(entries.map((entry) => [entry.displayName, entry.iconSvgInline.match(/ d="([^"]+)"/)?.[1]]))
	})
	await visitor.context().close()

	await login(page)
	await page.goto('/index.php/settings/admin/sharing')
	const section = page.locator('#public_share_control-settings')
	for (const label of ['New folder', 'Text document', 'Add folder description']) {
		const icon = section.locator('span', { hasText: label }).first().locator('svg path').first()
		expect(await icon.getAttribute('d'), label).toBe(menuIcons[label])
	}
})

test('a forbidden entry is disabled for owners and hidden from visitors', async ({ page, browser, baseURL }) => {
	await setAppConfig(baseURL!, 'forbidden-entries', '[{"id":"newFolder"}]')

	expect(await publicNewMenu(browser, baseURL!, share)).not.toContain('New folder')

	await login(page)
	await openSharingSidebar(page, share.folder)
	await openShareEditor(page)
	await selectionButton(page).click()
	const forbiddenRow = page.locator('.checkbox-radio-switch', { hasText: 'New folder' })
	await expect(forbiddenRow.locator('input')).toBeDisabled()

	// Hover tooltip: browsers show the `title` of the element under the
	// pointer or its nearest ancestor that has one. Check both the checkbox
	// glyph (left edge) and the label text of the forbidden row — and that
	// an allowed row has no tooltip.
	const tooltipAt = async (row: typeof forbiddenRow, xOffset: number) => {
		const box = (await row.boundingBox())!
		return page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[title]')?.getAttribute('title') ?? null, { x: box.x + xOffset, y: box.y + box.height / 2 })
	}
	// Polled: the popover fades in and is positioned asynchronously.
	await expect(forbiddenRow).toBeVisible()
	await expect.poll(() => tooltipAt(forbiddenRow, 16)).toBe('Locked by the administrator')
	expect(await tooltipAt(forbiddenRow, 80)).toBe('Locked by the administrator')
	expect(await tooltipAt(page.locator('.checkbox-radio-switch', { hasText: 'Text document' }), 80)).toBeNull()
})

test('a default-hidden entry applies until the owner chooses otherwise', async ({ page, browser, baseURL }) => {
	await setAppConfig(baseURL!, 'default-hidden-entries', '[{"id":"newFolder"}]')
	expect(await publicNewMenu(browser, baseURL!, share)).not.toContain('New folder')

	// The owner re-enables it for this link.
	await login(page)
	await openSharingSidebar(page, share.folder)
	await openShareEditor(page)
	await selectionButton(page).click()
	await page.getByText('New folder', { exact: true }).click()
	await page.keyboard.press('Escape')
	await page.getByRole('button', { name: 'Update share' }).click()
	await expect.poll(async () => publicNewMenu(browser, baseURL!, share)).toContain('New folder')
})

test('the quick-upload switch removes the button from public pages', async ({ page, baseURL }) => {
	await setAppConfig(baseURL!, 'quick-upload-enabled', 'no')
	await page.goto(`${baseURL}/index.php/s/${share.token}`)
	await page.getByRole('button', { name: /^New$/ }).first().waitFor()
	await expect(page.getByRole('button', { name: 'Upload files' })).toHaveCount(0)
})

test('a failed save reverts the switch and tells the admin', async ({ page }) => {
	await login(page)
	await page.route('**/apps/provisioning_api/api/v1/config/apps/public_share_control/**', (route) => route.fulfill({ status: 500 }))
	await page.goto('/index.php/settings/admin/sharing')

	const section = page.locator('#public_share_control-settings')
	const forbidden = section.locator('.checkbox-radio-switch', { hasText: 'Forbidden' }).first().locator('input')
	await expect(forbidden).not.toBeChecked()
	await section.getByText('Forbidden', { exact: true }).first().click()

	await expect(page.getByText('Failed to save the "New" menu settings')).toBeVisible()
	await expect(forbidden).not.toBeChecked()
})
