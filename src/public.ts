/*
 * SPDX-FileCopyrightText: 2026 Nico Störzbach
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { NewMenuEntry } from '@nextcloud/files'

import { getNewFileMenu, getNewFileMenuEntries, removeNewFileMenuEntry } from '@nextcloud/files'
import { loadState } from '@nextcloud/initial-state'
import { ATTRIBUTE_KEY, DEFAULT_HIDDEN_ENTRIES_KEY, FORBIDDEN_ENTRIES_KEY, QUICK_UPLOAD_ENABLED_KEY } from './constants.ts'
import { isControllableEntry, matchesHiddenEntry, normalizeHiddenEntries } from './hiddenEntries.ts'
import { logger } from './logger.ts'
import { registerQuickUploadAction } from './quickUploadAction.ts'

// The link's own selection is absent (null) when its owner never changed it;
// then the admin defaults apply. An empty selection means "show everything".
const perShareHiddenRaw = loadState<unknown[] | null>('public_share_control', ATTRIBUTE_KEY, null)
const defaultHidden = normalizeHiddenEntries(loadState('public_share_control', DEFAULT_HIDDEN_ENTRIES_KEY, []))
const forbiddenEntries = normalizeHiddenEntries(loadState('public_share_control', FORBIDDEN_ENTRIES_KEY, []))

// Forbidden entries always apply; the owner's selection replaces the defaults.
const effectiveHidden = [...forbiddenEntries, ...(perShareHiddenRaw !== null ? normalizeHiddenEntries(perShareHiddenRaw) : defaultHidden)]

/**
 * Whether the entry is hidden on this link. "Upload from device" entries
 * never are.
 *
 * @param entry the menu entry to check
 */
function isSelectedForHiding(entry: NewMenuEntry): boolean {
	return isControllableEntry(entry) && matchesHiddenEntry(entry, effectiveHidden, 'files_sharing')
}

/**
 * Remove the already registered entries that are hidden on this link.
 *
 * Called without a context: with one, the registry calls every entry's
 * `enabled(context)`, and other apps' entries may throw on anything but a
 * real folder node.
 */
function hideAlreadyRegisteredEntries() {
	try {
		getNewFileMenuEntries()
			.filter(isSelectedForHiding)
			.forEach((entry) => removeNewFileMenuEntry(entry.id))
	} catch (error) {
		logger.error('Failed to hide "New" menu entries on public share page', { error })
	}
}

/**
 * Some apps register their entry later, from lazily loaded code. The menu has
 * no event for new entries, so wrap the registry's registerEntry() and undo a
 * registration right away if the entry is hidden on this link.
 */
function watchForLateRegistrations() {
	try {
		const menu = getNewFileMenu()
		const originalRegisterEntry = menu.registerEntry.bind(menu)
		menu.registerEntry = (entry: NewMenuEntry) => {
			originalRegisterEntry(entry)
			if (isSelectedForHiding(entry)) {
				menu.unregisterEntry(entry.id)
			}
		}
	} catch (error) {
		logger.error('Failed to watch for late "New" menu entry registrations', { error })
	}
}

if (effectiveHidden.length > 0) {
	watchForLateRegistrations()
	hideAlreadyRegisteredEntries()
}
if (loadState('public_share_control', QUICK_UPLOAD_ENABLED_KEY, true)) {
	registerQuickUploadAction()
}
