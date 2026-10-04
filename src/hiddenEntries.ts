/*
 * SPDX-FileCopyrightText: 2026 Nico Störzbach
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { NewMenuEntryCategory } from '@nextcloud/files'
import { loadState } from '@nextcloud/initial-state'

/**
 * Whether owners and admins may hide this "New" menu entry: everything in the
 * "Create new" and "Other" categories, never "Upload from device".
 *
 * @param entry the menu entry to check
 * @param entry.category its NewMenuEntryCategory
 */
export function isControllableEntry(entry: { category?: number }): boolean {
	return entry.category === NewMenuEntryCategory.CreateNew || entry.category === NewMenuEntryCategory.Other
}

/**
 * A "New" menu entry to hide, as stored in the share attribute and the admin
 * settings. Entries in the legacy formats lack `displayName` or `templateKey`.
 */
export type HiddenEntryRef = { id: string, displayName?: string, templateKey?: string }

/** The fields of core's TemplateFileCreator JSON used here. */
type TemplateProvider = { app: string, extension: string }

const templateKeyMapCache = new Map<'files' | 'files_sharing', Map<string, string>>()

/**
 * Map the id of every template-based entry, as core assigns it on this page
 * load, to a stable key `<app>:<extension>`.
 *
 * Core builds these ids as `template-new-<app>-<index>` from the `templates`
 * initial state, and `<index>` is only the position in that list, which can
 * differ between page loads. `app` and `extension` identify the entry itself
 * and are never translated.
 *
 * @param initialStateApp whose `templates` initial state to read: 'files' in
 * the signed-in Files app, 'files_sharing' on public share pages
 */
function getTemplateKeyMap(initialStateApp: 'files' | 'files_sharing'): Map<string, string> {
	const cached = templateKeyMapCache.get(initialStateApp)
	if (cached) {
		return cached
	}
	const providers = loadState<TemplateProvider[]>(initialStateApp, 'templates', [])
	const map = new Map<string, string>()
	providers.forEach((provider, index) => {
		map.set(`template-new-${provider.app}-${index}`, `${provider.app}:${provider.extension}`)
	})
	templateKeyMapCache.set(initialStateApp, map)
	return map
}

/**
 * Whether core still builds template entry ids the way getTemplateKeyMap()
 * expects; no public API exposes a stable key. If not, template entries are no
 * longer hidden. Only meaningful where all template entries are registered
 * already, i.e. in the owner sidebar.
 *
 * @param registeredIds ids of all registered "New" menu entries
 * @param initialStateApp see getTemplateKeyMap()
 * @return whether the id format still matches (true if there are no templates)
 */
export function templateIdFormatMatches(registeredIds: string[], initialStateApp: 'files' | 'files_sharing'): boolean {
	const rebuiltIds = [...getTemplateKeyMap(initialStateApp).keys()]
	return rebuiltIds.length === 0 || rebuiltIds.some((id) => registeredIds.includes(id))
}

/**
 * The stable key for a template-based entry's current id, or undefined for
 * other entries, whose ids are stable already.
 *
 * @param id a "New" menu entry's current id
 * @param initialStateApp see getTemplateKeyMap()
 */
export function templateKeyFor(id: string, initialStateApp: 'files' | 'files_sharing'): string | undefined {
	return getTemplateKeyMap(initialStateApp).get(id)
}

/**
 * Parse a stored list of entries to hide, including the legacy formats (plain
 * id strings, objects without `templateKey`). Invalid items are dropped.
 *
 * @param value the raw stored value
 */
export function normalizeHiddenEntries(value: unknown): HiddenEntryRef[] {
	if (!Array.isArray(value)) {
		return []
	}
	const result: HiddenEntryRef[] = []
	for (const item of value) {
		if (typeof item === 'string') {
			result.push({ id: item })
		} else if (item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string') {
			const displayName = (item as { displayName?: unknown }).displayName
			const templateKey = (item as { templateKey?: unknown }).templateKey
			result.push({
				id: (item as { id: string }).id,
				displayName: typeof displayName === 'string' ? displayName : undefined,
				templateKey: typeof templateKey === 'string' ? templateKey : undefined,
			})
		}
	}
	return result
}

/**
 * Whether a menu entry is one of the entries to hide: by templateKey for
 * template-based entries, then by id, and last by displayName, which only
 * legacy entries need and which is translated.
 *
 * @param entry the registered menu entry to check
 * @param entry.id its current id
 * @param entry.displayName its current display name
 * @param hiddenEntries the entries to hide
 * @param initialStateApp see getTemplateKeyMap()
 */
export function matchesHiddenEntry(entry: { id: string, displayName: string }, hiddenEntries: HiddenEntryRef[], initialStateApp: 'files' | 'files_sharing'): boolean {
	const templateKey = templateKeyFor(entry.id, initialStateApp)
	return hiddenEntries.some((hidden) => (templateKey !== undefined && hidden.templateKey === templateKey)
		|| hidden.id === entry.id
		|| (hidden.displayName !== undefined && hidden.displayName === entry.displayName))
}
