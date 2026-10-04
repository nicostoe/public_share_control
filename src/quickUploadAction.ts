/*
 * SPDX-FileCopyrightText: 2026 Nico Störzbach
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { IFolder, INode } from '@nextcloud/files'
import type { IUpload } from '@nextcloud/files/upload'
import type { FileStat, ResponseDataDetailed } from 'webdav'

import { mdiTrayArrowUp } from '@mdi/js'
import { openConflictPicker, showError } from '@nextcloud/dialogs'
import { emit } from '@nextcloud/event-bus'
import { getUniqueName, Permission, registerFileListAction } from '@nextcloud/files'
import { getClient, getDefaultPropfind, getRootPath, resultToNode } from '@nextcloud/files/dav'
import { getUploader, UploadStatus } from '@nextcloud/files/upload'
import { t } from '@nextcloud/l10n'
import { logger } from './logger.ts'

const UPLOAD_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${mdiTrayArrowUp}" /></svg>`

/**
 * Let the visitor pick one or more files via the browser's native file
 * dialog. Resolves with an empty list if the dialog is dismissed.
 */
function pickFiles(): Promise<File[]> {
	return new Promise((resolve) => {
		const input = document.createElement('input')
		input.type = 'file'
		input.multiple = true
		input.addEventListener('change', () => resolve([...(input.files ?? [])]), { once: true })
		input.addEventListener('cancel', () => resolve([]), { once: true })
		input.click()
	})
}

/**
 * Ask the visitor how to handle existing file names, with Nextcloud's conflict
 * dialog (batchUpload() overwrites without asking). Returns batchUpload()'s
 * callback contract: incoming name → name to upload under (same = overwrite,
 * other = renamed, missing = skip), or `false` to cancel.
 *
 * @param files the files the visitor picked
 * @param folder the target folder
 * @param contents the target folder's current contents
 */
async function resolveConflicts(files: File[], folder: IFolder, contents: INode[]): Promise<false | Record<string, string>> {
	const existingNames = contents.map((node) => node.basename)
	const resolution: Record<string, string> = Object.fromEntries(files.map((file) => [file.name, file.name]))

	const conflicts = files.filter((file) => existingNames.includes(file.name))
	if (conflicts.length === 0) {
		return resolution
	}

	const result = await openConflictPicker(folder.displayname, conflicts, contents.filter((node) => conflicts.some((file) => file.name === node.basename)))
	if (result === null) {
		return false
	}

	for (const file of result.skipped) {
		delete resolution[file.name]
	}
	// Renamed files must not collide with existing names, the other incoming
	// files, or each other.
	const takenNames = [...existingNames, ...files.map((file) => file.name)]
	for (const file of result.renamed) {
		const newName = getUniqueName(file.name, takenNames)
		takenNames.push(newName)
		resolution[file.name] = newName
	}
	return resolution
}

/**
 * Resolve once an upload can no longer change state; batchUpload() resolves as
 * soon as uploads are queued. Uploads skipped in the conflict dialog are only
 * aborted and never dispatch `finished`, so the abort signal ends their wait.
 *
 * @param upload the upload to wait for
 */
function waitForUpload(upload: IUpload): Promise<IUpload> {
	const terminal: readonly number[] = [UploadStatus.FINISHED, UploadStatus.CANCELLED, UploadStatus.FAILED]
	if (terminal.includes(upload.status) || upload.signal.aborted) {
		return Promise.resolve(upload)
	}
	return new Promise((resolve) => {
		upload.addEventListener('finished', () => resolve(upload), { once: true })
		upload.signal.addEventListener('abort', () => resolve(upload), { once: true })
	})
}

/**
 * Add the uploaded files to the file list, which only updates on a
 * `files:node:created` event; batchUpload() provides no nodes for that.
 *
 * @param folderPath the folder the files were uploaded into
 * @param names the final names the files were uploaded under
 */
async function announceUploadedNodes(folderPath: string, names: string[]): Promise<void> {
	const client = getClient()
	for (const name of names) {
		try {
			const result = await client.stat(`${getRootPath()}${folderPath.replace(/\/$/, '')}/${name}`, {
				details: true,
				data: getDefaultPropfind(),
			}) as ResponseDataDetailed<FileStat>
			emit('files:node:created', resultToNode(result.data))
		} catch (error) {
			logger.warn('Uploaded file could not be added to the file list', { error, name })
		}
	}
}

/**
 * Register the "Upload files" button. File list actions appear in the toolbar
 * row next to "Public share", with their label visible at every width.
 */
export function registerQuickUploadAction(): void {
	registerFileListAction({
		id: 'public_share_control-quick-upload',
		displayName: () => t('public_share_control', 'Upload files'),
		iconSvgInline: () => UPLOAD_ICON,
		order: 0,
		enabled: ({ folder }) => (folder.permissions & Permission.CREATE) !== 0,
		async exec({ folder, contents }) {
			const files = await pickFiles()
			if (files.length === 0) {
				return null
			}

			let uploads: IUpload[]
			try {
				uploads = await getUploader(true).batchUpload(folder.path, files, {
					callback: () => resolveConflicts(files, folder, contents),
				})
			} catch (error) {
				logger.error('Quick upload failed', { error })
				showError(t('public_share_control', 'Failed to upload files'))
				return false
			}

			// One upload per file plus one for the batch. A file's final name ends
			// its `source` (not URL-encoded) and may differ from the picked name.
			const settled = await Promise.all(uploads.map(waitForUpload))
			const uploadedNames = settled
				.filter((upload) => upload.status === UploadStatus.FINISHED && upload.children.length === 0)
				.map((upload) => upload.source.slice(upload.source.lastIndexOf('/') + 1))
			await announceUploadedNodes(folder.path, uploadedNames)

			if (settled.some((upload) => upload.status === UploadStatus.FAILED)) {
				showError(t('public_share_control', 'Failed to upload files'))
				return false
			}
			return true
		},
	})
}
