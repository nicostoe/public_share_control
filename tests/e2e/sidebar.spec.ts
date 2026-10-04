/*
 * SPDX-FileCopyrightText: 2026 Nico Störzbach
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { TestShare } from './helpers.ts'

import { expect, test } from '@playwright/test'
import { login, openShareEditor, openSharingSidebar, publicNewMenu, saveShare, selectionButton, storedHiddenIds, testShare, toggleEntry } from './helpers.ts'

let share: TestShare

test.beforeEach(async ({ page, baseURL }) => {
	share = await testShare(baseURL!, 'PSC-E2E-Sidebar')
	await login(page)
	await openSharingSidebar(page, share.folder)
	await openShareEditor(page)
})

test('lists "Create new" and "Other" entries, but not "Upload from device"', async ({ page }) => {
	await selectionButton(page).click()
	await expect(page.getByText('New folder', { exact: true })).toBeVisible()
	await expect(page.getByText('Text document', { exact: true })).toBeVisible()
	// The Text app registers this one in the "Other" category.
	await expect(page.getByText('Add folder description', { exact: true })).toBeVisible()
	await expect(page.getByText('Upload files', { exact: true })).toHaveCount(0)
})

test('hides what the owner unchecked from visitors', async ({ page, browser, baseURL }) => {
	await toggleEntry(page, 'Text document')
	await toggleEntry(page, 'Add folder description')
	await saveShare(page)

	const menu = await publicNewMenu(browser, baseURL!, share)
	expect(menu).toContain('New folder')
	expect(menu).not.toContain('Text document')
	expect(menu).not.toContain('Add folder description')
})

test('saves through core\'s single request, and a later save of another setting keeps the selection', async ({ page, baseURL }) => {
	const puts: string[] = []
	page.on('request', (request) => {
		if (request.method() === 'PUT' && request.url().includes('/shares/')) {
			puts.push(request.url())
		}
	})

	await toggleEntry(page, 'New folder')
	await saveShare(page)
	expect(puts).toHaveLength(1)
	expect(await storedHiddenIds(baseURL!, share)).toEqual(['newFolder'])

	// Same page, no reload: change only a core setting and save again.
	await openShareEditor(page)
	await page.getByText('Hide download', { exact: true }).click()
	await saveShare(page)
	expect(await storedHiddenIds(baseURL!, share)).toEqual(['newFolder'])
})

test('shows the saved selection after a full reload', async ({ page }) => {
	await toggleEntry(page, 'New folder')
	await saveShare(page)

	await openSharingSidebar(page, share.folder)
	await openShareEditor(page)
	await expect(selectionButton(page)).toHaveText(/1 of \d+ entries hidden/)
})

test('"Cancel" discards an unsaved selection', async ({ page, baseURL }) => {
	await toggleEntry(page, 'New folder')
	await page.getByRole('button', { name: 'Cancel' }).click()

	// A later save of something else must not carry the cancelled change.
	await openShareEditor(page)
	await page.getByText('Hide download', { exact: true }).click()
	await saveShare(page)
	expect(await storedHiddenIds(baseURL!, share)).toBeNull()
})

test('toggling an entry and back stores nothing, so admin defaults keep applying', async ({ page, baseURL }) => {
	await toggleEntry(page, 'New folder')
	await toggleEntry(page, 'New folder')
	await saveShare(page)
	expect(await storedHiddenIds(baseURL!, share)).toBeNull()
})

test('core\'s template entry id format still matches what the app rebuilds', async ({ page }) => {
	// Guard for a core implementation detail the app depends on (see
	// templateKeyFor() in src/hiddenEntries.ts): the sidebar logs this warning
	// when the rebuilt `template-new-<app>-<index>` ids match nothing.
	const warnings: string[] = []
	page.on('console', (message) => {
		if (message.text().includes('no longer match the format')) {
			warnings.push(message.text())
		}
	})
	await openSharingSidebar(page, share.folder)
	await openShareEditor(page)
	expect(warnings).toEqual([])
})
