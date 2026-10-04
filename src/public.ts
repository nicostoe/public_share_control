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

// This script is injected by the server (see
// Listener/BeforeTemplateRenderedListener.php) for every folder share, so it
// always needs to check what actually applies — unlike before 0.5.0, an
// admin-wide default/forbidden list can apply even when this specific share
// has no per-share configuration of its own.
//
// `null` (not `[]`) is the "not configured" default: the listener only
// pushes ATTRIBUTE_KEY's initial state when the share's attribute exists AT
// ALL, so its absence here means the owner never made an explicit choice for
// this share — in which case the admin's default-hidden list applies
// instead. An attribute present but empty (owner explicitly chose to show
// everything) must NOT fall back to the admin default — that's exactly the
// ambiguity the sidebar created before 0.5.0 by omitting the attribute for an
// empty selection; see "Explicit vs. never-touched" in AGENTS.md.
const perShareHiddenRaw = loadState<unknown[] | null>('public_share_control', ATTRIBUTE_KEY, null)
const defaultHidden = normalizeHiddenEntries(loadState('public_share_control', DEFAULT_HIDDEN_ENTRIES_KEY, []))
const forbiddenEntries = normalizeHiddenEntries(loadState('public_share_control', FORBIDDEN_ENTRIES_KEY, []))

// Forbidden is unconditional (admin restriction, no owner override); the
// per-share choice, when the owner made one, entirely REPLACES the admin
// default rather than merging with it (an owner who explicitly re-enabled
// every entry should see every entry, not have the admin default silently
// re-apply on top).
const effectiveHidden = [...forbiddenEntries, ...(perShareHiddenRaw !== null ? normalizeHiddenEntries(perShareHiddenRaw) : defaultHidden)]

/**
 * Whether this "Create new" entry is currently hidden for this link — by
 * the owner's own per-share choice, the admin's instance-wide default, or
 * the admin's instance-wide forbid. Only "Create new"/"Other" entries can be
 * hidden — "Upload from device" entries always pass this as false, matched
 * by category first (see isControllableEntry()).
 *
 * Matches primarily by a stable, locale-independent template key (see
 * hiddenEntries.ts): template-based entries (documents, spreadsheets,
 * diagrams, whiteboards, …) get an id whose numeric suffix is just their
 * position in a server-supplied list, which isn't guaranteed to stay the
 * same as when the owner (or the admin) picked what to hide.
 *
 * @param entry the menu entry to check
 */
function isSelectedForHiding(entry: NewMenuEntry): boolean {
	return isControllableEntry(entry) && matchesHiddenEntry(entry, effectiveHidden, 'files_sharing')
}

/**
 * Remove the owner-selected "Create new" menu entries currently registered,
 * leaving every "Upload from device" entry — and any "Create new" entry NOT
 * selected for hiding — untouched.
 *
 * Deliberately calling getNewFileMenuEntries() with NO context: passing a
 * context would make it call every entry's own `enabled(context)` to filter
 * the list, and third-party apps' entries may expect a real Node/Folder
 * instance there rather than a hand-built stand-in, throwing on a fake one.
 * With no context the registry returns the raw, unfiltered entry list
 * without ever calling `enabled()`, which is also exactly what we want here:
 * we're matching by id against a fixed allow/deny list, not asking "what
 * would show for this folder".
 *
 * Only catches entries already registered by the time this runs — see
 * watchForLateRegistrations() below for entries apps register afterwards.
 */
function hideAlreadyRegisteredEntries() {
	try {
		getNewFileMenuEntries()
			.filter(isSelectedForHiding)
			.forEach((entry) => removeNewFileMenuEntry(entry.id))
	} catch (error) {
		logger.error('Failed to hide selected "Create new" entries on public share page', { error })
	}
}

/**
 * Some apps (Text, Office, Whiteboard, Diagrams, …) register their own
 * "Create new" entry asynchronously — via a lazily-loaded chunk, sometimes
 * well after this script has already run — so hideAlreadyRegisteredEntries()
 * alone can miss them. `@nextcloud/files` has no dedicated event for "a new
 * menu entry was just registered" (`NewMenu.registerEntry()` is a plain
 * synchronous method, confirmed by reading its source — no emit/dispatch of
 * any kind), so there's no event to subscribe to for this precisely.
 *
 * `getNewFileMenu()` is a public, documented export that returns the actual
 * registry instance apps call `addNewFileMenuEntry()` against, though — so
 * instead of polling on a schedule, this wraps that instance's own
 * `registerEntry()` method: every future registration, by any app, at any
 * time, is caught the moment it happens and immediately reversed if it's
 * one of ours to hide. No timers, no guessing how long an app's chunk might
 * take to load.
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
		logger.error('Failed to watch for late "Create new" menu entry registrations', { error })
	}
}

if (effectiveHidden.length > 0) {
	watchForLateRegistrations()
	hideAlreadyRegisteredEntries()
}
if (loadState('public_share_control', QUICK_UPLOAD_ENABLED_KEY, true)) {
	registerQuickUploadAction()
}
