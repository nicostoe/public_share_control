/*
 * SPDX-FileCopyrightText: 2026 Nico Störzbach
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { NewMenuEntryCategory } from '@nextcloud/files'
import { loadState } from '@nextcloud/initial-state'

/**
 * Whether a "+ New" menu entry is one this app lets owners/admins hide:
 * everything that creates something in the shared folder — the "Create new"
 * category plus "Other" (e.g. the Text app's "Add folder description",
 * which creates a Readme.md). "Upload from device" is never hideable.
 *
 * @param entry the menu entry to check
 * @param entry.category its NewMenuEntryCategory
 */
export function isControllableEntry(entry: { category?: number }): boolean {
	return entry.category === NewMenuEntryCategory.CreateNew || entry.category === NewMenuEntryCategory.Other
}

/**
 * A reference to a "Create new" menu entry an owner selected for hiding,
 * stored on the share's generic attributes.
 *
 * `displayName` and `templateKey` are optional only for backwards
 * compatibility with shares saved before they existed (see
 * normalizeHiddenEntries()) — new saves always include both when available.
 */
export type HiddenEntryRef = { id: string, displayName?: string, templateKey?: string }

/**
 * The subset of `apps/files/lib/../Template/TemplateFileCreator`'s JSON
 * representation (see nextcloud/server's TemplateFileCreator::jsonSerialize())
 * this module actually needs. Nextcloud core sends the full list of these —
 * one per registered "Create new from template" provider (documents,
 * spreadsheets, diagrams, whiteboards, …) — as initial state, and its own
 * apps/files/src/newMenu/newFromTemplate.ts builds each menu entry's id from
 * this same list. See buildTemplateKeyMap() below for why we read it again
 * ourselves instead of trusting that id.
 */
type TemplateProvider = { app: string, extension: string }

const templateKeyMapCache = new Map<'files' | 'files_sharing', Map<string, string>>()

/**
 * Map every template-based "Create new" entry's CURRENT id (as core would
 * assign it THIS page load) to a stable, locale-independent key for the same
 * conceptual entry: `<app>:<file extension>`.
 *
 * Nextcloud core assigns template-based "Create new" entries an id of the
 * form `template-new-<app>-<index>`, where `<index>` is simply that
 * provider's position in a server-supplied list (confirmed by reading
 * nextcloud/server's apps/files/src/newMenu/newFromTemplate.ts) — not a
 * stable identifier for the entry itself. That position isn't guaranteed to
 * stay the same across separate page loads (e.g. another app's provider
 * being registered before this one shifts every later index), so an id
 * saved from the owner's sidebar can silently stop matching the very same
 * "New X" option by the time a visitor loads the public page — confirmed in
 * production via two separate diagnostic dumps showing the same conceptual
 * entries under different ids.
 *
 * The same provider list each id is built from also carries `app` (the
 * registering app's id) and `extension` (the file extension the entry
 * creates) — both intrinsic to what the entry IS rather than where it
 * happens to sit in the list, and — unlike `displayName` — neither is ever
 * translated. Recomputing the id core would assign THIS page load for every
 * provider in the list gives a map from "id as it happens to be right now"
 * to "app:extension as it will always be", so matching survives the index
 * reshuffling without depending on locale at all.
 *
 * Memoized per initial-state app: the underlying loadState() call is itself
 * memoized (safe to call more than once), but there's no need to rebuild the
 * Map on every lookup within the same page load either.
 *
 * @param initialStateApp which app's `templates` initial state to read —
 * 'files' for the authenticated owner sidebar, 'files_sharing' for the
 * public share page (core reads a different one for each, gated on
 * isPublicShare() inside registerTemplateEntries()).
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
 * Detect when templateKeyFor()'s assumption about core no longer holds.
 *
 * Template entry ids are rebuilt from core's private id format
 * (`template-new-<app>-<index>`, see getTemplateKeyMap()) — there is no public
 * API exposing a stable key. If a future core version changes that format,
 * none of the rebuilt ids matches a registered entry and template-based
 * entries silently stop being hidden (they fail open: visible). This turns
 * that silent failure into an explicit console warning. Call it only where
 * all template entries are known to be registered already (the owner
 * sidebar), not on the public page where apps may still be registering.
 *
 * @param registeredIds ids of all currently registered "+ New" entries
 * @param initialStateApp see getTemplateKeyMap()
 * @return whether the id format still matches (true if there are no templates)
 */
export function templateIdFormatMatches(registeredIds: string[], initialStateApp: 'files' | 'files_sharing'): boolean {
	const rebuiltIds = [...getTemplateKeyMap(initialStateApp).keys()]
	return rebuiltIds.length === 0 || rebuiltIds.some((id) => registeredIds.includes(id))
}

/**
 * The stable, locale-independent key for a template-based "Create new"
 * entry's CURRENT id, or undefined if `id` isn't a template-based entry at
 * all (e.g. the built-in "New folder" — those ids are already stable, see
 * matchesHiddenEntry()).
 *
 * @param id a "Create new" menu entry's current id
 * @param initialStateApp see getTemplateKeyMap()
 */
export function templateKeyFor(id: string, initialStateApp: 'files' | 'files_sharing'): string | undefined {
	return getTemplateKeyMap(initialStateApp).get(id)
}

/**
 * Parse whatever is stored in the share attribute's `value` field into a
 * consistent list of HiddenEntryRef.
 *
 * Also accepts the older formats (plain string ids only; or {id,
 * displayName} without a templateKey) so links saved by earlier versions of
 * this app keep working — see matchesHiddenEntry() for how each field is
 * used as matching gets less reliable from templateKey down to displayName.
 *
 * @param value the raw, untyped value from the share attribute
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
 * Whether a currently-registered menu entry matches one of the owner's
 * saved hidden-entry references.
 *
 * Tries, in order of reliability:
 * 1. templateKey — locale- and page-load-independent, for template-based
 *    entries (see templateKeyFor()); this is what actually fixes the
 *    unstable-id bug for the apps affected by it (documents, spreadsheets,
 *    diagrams, whiteboards, …).
 * 2. id — already stable for every entry NOT assigned through the template
 *    mechanism (e.g. the built-in "New folder").
 * 3. displayName — a last-resort fallback kept only for shares saved by a
 *    version of this app that stored neither of the above; known to be
 *    locale-fragile (an owner and a visitor can see different translated
 *    strings for the same entry), so it's tried last.
 *
 * @param entry the currently-registered menu entry to check
 * @param entry.id its current id
 * @param entry.displayName its current display name
 * @param hiddenEntries the owner's saved list of entries to hide
 * @param initialStateApp see getTemplateKeyMap()
 */
export function matchesHiddenEntry(entry: { id: string, displayName: string }, hiddenEntries: HiddenEntryRef[], initialStateApp: 'files' | 'files_sharing'): boolean {
	const templateKey = templateKeyFor(entry.id, initialStateApp)
	return hiddenEntries.some((hidden) => (templateKey !== undefined && hidden.templateKey === templateKey)
		|| hidden.id === entry.id
		|| (hidden.displayName !== undefined && hidden.displayName === entry.displayName))
}
