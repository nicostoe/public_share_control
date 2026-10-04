/*
 * SPDX-FileCopyrightText: 2026 Nico Störzbach
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { Page } from '@playwright/test'
import type { TestShare } from './helpers.ts'

import { expect, test } from '@playwright/test'
import { dav, testShare, updateShare } from './helpers.ts'

let share: TestShare

/**
 * Pick files through the quick-upload button.
 *
 * @param page the public share page
 * @param files the files to "pick"
 */
async function quickUpload(page: Page, files: { name: string, content: string }[]): Promise<void> {
	const chooser = page.waitForEvent('filechooser')
	await page.getByRole('button', { name: 'Upload files' }).click()
	await (await chooser).setFiles(files.map(({ name, content }) => ({ name, mimeType: 'text/plain', buffer: Buffer.from(content) })))
}

/**
 * A file's row in the file list (file names are split into separate spans
 * for basename and extension, so match on the data attribute).
 *
 * @param page the public share page
 * @param name the file name
 */
function row(page: Page, name: string) {
	return page.locator(`[data-cy-files-list-row-name="${name}"]`)
}

test.beforeEach(async ({ page, baseURL }) => {
	// An empty folder each time: the file list only renders the rows in view,
	// so uploads from earlier runs would push new files out of it.
	await dav(baseURL!, 'PSC-E2E-Upload', { method: 'DELETE' })
	share = await testShare(baseURL!, 'PSC-E2E-Upload')
	await page.goto(`/index.php/s/${share.token}`)
	await page.getByRole('button', { name: 'Upload files' }).waitFor()
})

test('uploads several files, which appear without a reload', async ({ page, baseURL }) => {
	const names = [`a-${Date.now()}.txt`, `b-${Date.now()}.txt`]
	await quickUpload(page, names.map((name) => ({ name, content: name })))

	for (const name of names) {
		await expect(row(page, name)).toHaveCount(1)
		expect((await dav(baseURL!, `${share.folder}/${name}`)).status).toBe(200)
	}
})

test('is not offered on links without upload permission', async ({ page, baseURL }) => {
	const readOnly = await testShare(baseURL!, 'PSC-E2E-ReadOnly', 1)
	await page.goto(`/index.php/s/${readOnly.token}`)
	await page.getByRole('button', { name: /^Download/ }).first().waitFor()
	await expect(page.getByRole('button', { name: 'Upload files' })).toHaveCount(0)
})

for (const [choice, expected] of [
	['Cancel', { 'conflict.txt': 'ORIGINAL' }],
	['Keep both', { 'conflict.txt': 'ORIGINAL', 'conflict (1).txt': 'VISITOR' }],
	['Replace', { 'conflict.txt': 'VISITOR' }],
] as const) {
	test(`asks before overwriting an existing file: "${choice}"`, async ({ page, baseURL }) => {
		for (const name of ['conflict.txt', 'conflict (1).txt']) {
			await dav(baseURL!, `${share.folder}/${name}`, { method: 'DELETE' })
		}
		await dav(baseURL!, `${share.folder}/conflict.txt`, { method: 'PUT', body: 'ORIGINAL' })
		await page.reload()

		await quickUpload(page, [{ name: 'conflict.txt', content: 'VISITOR' }])
		const dialog = page.getByRole('dialog')
		await dialog.getByRole('button', { name: choice, exact: true }).click()
		await expect(dialog).toHaveCount(0)
		await expect(page.getByRole('button', { name: 'Upload files' })).toBeEnabled()

		for (const [name, content] of Object.entries(expected)) {
			await expect(row(page, name)).toHaveCount(1)
			expect(await (await dav(baseURL!, `${share.folder}/${name}`)).text()).toBe(content)
		}
		if (!('conflict (1).txt' in expected)) {
			expect((await dav(baseURL!, `${share.folder}/conflict (1).txt`)).status).toBe(404)
		}
	})
}

for (const [variant, attributes] of [
	['created via "New", which asks for the visitor\'s name', [{ scope: 'fileRequest', key: 'enabled', value: true }]],
	['set in the share menu', []],
] as const) {
	test(`upload-only links keep only Nextcloud's own upload button: file request ${variant}`, async ({ page, baseURL }) => {
		const request = await testShare(baseURL!, 'PSC-E2E-FileRequest')
		await updateShare(baseURL!, request, { permissions: '4', attributes: JSON.stringify(attributes) })
		await page.goto(`/index.php/s/${request.token}`)
		await page.getByRole('button', { name: 'Upload', exact: true }).waitFor()
		await expect(page.locator('[data-cy-files-list-action="public_share_control-quick-upload"]')).toHaveCount(0)
	})
}
