/*
 * SPDX-FileCopyrightText: 2026 Nico Störzbach
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { NewMenuEntry } from '@nextcloud/files'
import type { DiscoveredEntry } from './hiddenEntries.ts'

import { getCurrentUser, getRequestToken } from '@nextcloud/auth'
import { getNewFileMenu, getNewFileMenuEntries } from '@nextcloud/files'
import { loadState } from '@nextcloud/initial-state'
import { generateUrl } from '@nextcloud/router'
import { DISCOVERED_ENTRIES_KEY } from './constants.ts'
import { isControllableEntry, NEVER_PUBLIC_ENTRY_IDS, normalizeDiscoveredEntries, templateKeyFor } from './hiddenEntries.ts'
import { logger } from './logger.ts'

// keepalive requests are limited to 64 KiB.
const KEEPALIVE_LIMIT = 60_000

/**
 * The entries the admin page can't get from the server: everything
 * controllable except template-based entries, which the server lists itself.
 */
function registeredEntries(): DiscoveredEntry[] {
	return sortById(getNewFileMenuEntries()
		.filter((entry) => isControllableEntry(entry) && !NEVER_PUBLIC_ENTRY_IDS.has(entry.id) && templateKeyFor(entry.id, 'files') === undefined)
		.map((entry) => ({ id: entry.id, label: entry.displayName, category: entry.category, icon: entry.iconSvgInline ?? '', order: entry.order ?? 0 })))
}

/**
 * Entries in a fixed order, so lists compare by their JSON.
 *
 * @param entries the entries to sort
 */
function sortById(entries: DiscoveredEntry[]): DiscoveredEntry[] {
	return [...entries].sort((a, b) => a.id.localeCompare(b.id))
}

/**
 * Store the list on the server.
 *
 * @param entries the complete list
 * @param leaving whether the page is being left, so the request must survive it
 */
async function send(entries: DiscoveredEntry[], leaving: boolean): Promise<void> {
	const body = JSON.stringify({ entries })
	await fetch(generateUrl('/apps/public_share_control/discovered-entries'), {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', requesttoken: getRequestToken() ?? '' },
		body,
		keepalive: leaving && body.length < KEEPALIVE_LIMIT,
	}).then((response) => {
		if (!response.ok) {
			logger.warn('Storing the "New" menu entries failed', { status: response.status })
		}
	}).catch((error) => logger.warn('Storing the "New" menu entries failed', { error }))
}

/**
 * Keep the stored list of "New" menu entries up to date while an admin uses
 * the Files app, for the admin page. Additions are sent right away, keeping
 * stored entries not registered yet, since apps may register late; entries
 * still missing when the page is left are removed then. One request at a
 * time, so they can't overtake each other.
 */
export function discoverNewMenuEntries(): void {
	if (!getCurrentUser()?.isAdmin) {
		return
	}
	let stored = sortById(normalizeDiscoveredEntries(loadState('public_share_control', DISCOVERED_ENTRIES_KEY, [])))
	let checkPending = false
	let sending = false
	let sendAgain = false

	const update = (leaving: boolean) => {
		const current = registeredEntries()
		const next = leaving ? current : sortById([...current, ...stored.filter((entry) => !current.some((registered) => registered.id === entry.id))])
		if (JSON.stringify(next) === JSON.stringify(stored)) {
			return
		}
		if (sending) {
			// Sent once the running request is done. When leaving, the removal
			// waits for a later visit instead.
			sendAgain ||= !leaving
			return
		}
		stored = next
		sending = true
		send(next, leaving).finally(() => {
			sending = false
			if (sendAgain) {
				sendAgain = false
				update(false)
			}
		})
	}
	const scheduleUpdate = () => {
		if (!checkPending) {
			checkPending = true
			queueMicrotask(() => {
				checkPending = false
				update(false)
			})
		}
	}

	try {
		const menu = getNewFileMenu()
		const originalRegisterEntry = menu.registerEntry.bind(menu)
		menu.registerEntry = (entry: NewMenuEntry) => {
			originalRegisterEntry(entry)
			scheduleUpdate()
		}
	} catch (error) {
		logger.warn('Failed to watch for late "New" menu entry registrations', { error })
	}
	scheduleUpdate()
	window.addEventListener('load', scheduleUpdate)
	window.addEventListener('pagehide', () => update(true))
}
