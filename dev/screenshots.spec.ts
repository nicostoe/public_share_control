/*
 * SPDX-FileCopyrightText: 2026 Nico Störzbach
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { Page } from '@playwright/test'
import type { TestShare } from '../tests/e2e/helpers.ts'

import { test } from '@playwright/test'
import { dav, login, openShareEditor, openSharingSidebar, resetAppConfig, selectionButton, testShare } from '../tests/e2e/helpers.ts'

// One consistent story across all three screenshots: the admin hides "Text
// document" by default and forbids "Add folder description"; the link
// follows those defaults, so visitors only get "Upload files" and "New
// folder". The shared folder sits in a parent of its own, so the owner's
// file list shows nothing but it.
const PARENT = 'Clients'
const FOLDER = 'Project files'
// Several lines each: Nextcloud shows text files as a preview of their
// content, and a single short line would look like a broken icon.
const FILES: Record<string, string> = {
	'Agenda.md': '# Agenda\n\n1. Welcome\n2. Project scope\n3. Timeline\n4. Budget\n5. Open questions\n6. Next steps\n',
	'Budget.txt': 'Budget overview\n\nDesign      4,000\nDevelopment 12,500\nTesting     3,000\nHosting     1,200\nReserve     2,000\n\nTotal       22,700\n',
	'Contacts.txt': 'Project contacts\n\nProject lead\nDesign\nDevelopment\nQuality assurance\nOperations\nCustomer support\n',
	'Meeting notes.md': '# Meeting notes\n\n- Scope agreed\n- Milestones confirmed\n- Review every two weeks\n- Files go into this folder\n- Next meeting in May\n',
	'Project brief.md': '# Project brief\n\n## Goal\n\nA new website for the spring campaign.\n\n## Deliverables\n\n- Design\n- Content\n- Launch plan\n',
	'Timeline.md': '# Timeline\n\n- March: kick-off\n- April: design\n- May: content\n- June: development\n- July: testing\n- August: launch\n',
}

let share: TestShare

/**
 * Flip one of the admin page's switches for an entry and wait until it's saved.
 *
 * @param page the admin sharing settings page
 * @param entry the entry's label
 * @param setting the switch's label
 */
async function setAdminSwitch(page: Page, entry: string, setting: 'Hidden by default' | 'Forbidden'): Promise<void> {
	const row = page.locator('#public_share_control-settings').getByText(entry, { exact: true }).locator('xpath=ancestor::div[1]')
	const saved = page.waitForResponse((response) => response.url().includes('/config/apps/public_share_control/') && response.ok())
	await row.getByText(setting, { exact: true }).click()
	await saved
}

test.beforeAll(async ({ baseURL }) => {
	await dav(baseURL!, PARENT, { method: 'MKCOL' })
	share = await testShare(baseURL!, `${PARENT}/${FOLDER}`)
	for (const subfolder of ['Drafts', 'Photos']) {
		await dav(baseURL!, `${PARENT}/${FOLDER}/${subfolder}`, { method: 'MKCOL' })
	}
	for (const [name, content] of Object.entries(FILES)) {
		await dav(baseURL!, `${PARENT}/${FOLDER}/${name}`, { method: 'PUT', body: content })
	}
})

test.afterAll(async ({ baseURL }) => {
	await resetAppConfig(baseURL!)
	await dav(baseURL!, PARENT, { method: 'DELETE' })
})

test('admin settings', async ({ page }) => {
	await login(page)
	await page.goto('/index.php/settings/admin/sharing')
	await setAdminSwitch(page, 'Text document', 'Hidden by default')
	await setAdminSwitch(page, 'Add folder description', 'Forbidden')
	// No hover or focus highlight on the switch clicked last.
	await page.mouse.move(0, 0)
	await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
	await page.locator('#public_share_control-settings').screenshot({ path: 'screenshots/admin-settings.png', animations: 'disabled' })
})

test('sharing sidebar', async ({ page }) => {
	await login(page)
	await openSharingSidebar(page, FOLDER, `/${PARENT}`)
	await openShareEditor(page)
	await selectionButton(page).click()
	await page.getByText('Add folder description', { exact: true }).waitFor()
	await page.screenshot({ path: 'screenshots/sharing-sidebar.png', animations: 'disabled' })
})

test('public page', async ({ page }) => {
	await page.goto(`/index.php/s/${share.token}`)
	await page.locator('[data-cy-files-list-row-name="Timeline.md"]').waitFor()
	await page.getByRole('button', { name: /^New$/ }).first().click()
	await page.getByRole('menuitem', { name: 'New folder' }).waitFor()
	// File type icons and previews load lazily.
	await page.waitForLoadState('networkidle')
	await page.screenshot({ path: 'screenshots/public-page.png', animations: 'disabled' })
})
