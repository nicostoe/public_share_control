/*
 * SPDX-FileCopyrightText: 2026 Nico Störzbach
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { Page } from '@playwright/test'
import type { TestShare } from './helpers.ts'

import { expect, test } from '@playwright/test'
import { newMenuItems, testShare, updateShare } from './helpers.ts'

const PASSWORD = 'PSC-e2e-Pass-4711!'

let share: TestShare

/**
 * Everything this app adds to a public page: its initial state, scripts and
 * styles.
 *
 * @param page a public share page
 */
function appTraces(page: Page) {
	return page.locator('[id^="initial-state-public_share_control-"], script[src*="/public_share_control/"], link[href*="/public_share_control/"]')
}

test.beforeEach(async ({ page, baseURL }) => {
	share = await testShare(baseURL!, 'PSC-E2E-Password')
	await updateShare(baseURL!, share, {
		password: PASSWORD,
		attributes: JSON.stringify([{ scope: 'public_share_control', key: 'hidden-create-entries', value: [{ id: 'newFolder' }] }]),
	})
	await page.goto(`/index.php/s/${share.token}`)
	await page.getByLabel('Password', { exact: true }).waitFor()
})

test('the password page gets nothing from this app before the password is entered', async ({ page }) => {
	// Core fires the same event for this page as for the share page itself.
	await expect(appTraces(page)).toHaveCount(0)
})

test('after the password, the link\'s selection and the quick-upload button apply as usual', async ({ page }) => {
	await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
	await page.getByRole('button', { name: 'Submit' }).click()
	await page.getByRole('button', { name: 'Upload files' }).waitFor()

	// Same locator as above, so the first test can't pass by matching nothing.
	await expect(appTraces(page)).not.toHaveCount(0)
	expect(await newMenuItems(page)).not.toContain('New folder')
})
