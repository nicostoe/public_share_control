/*
 * SPDX-FileCopyrightText: 2026 Nico Störzbach
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { NewMenuEntryCategory } from '@nextcloud/files'
import { loadState } from '@nextcloud/initial-state'

/**
 * Core entries that never show for visitors: "file-request" is disabled on
 * public pages, "template-picker" needs a signed-in owner.
 */
export const NEVER_PUBLIC_ENTRY_IDS = new Set(['file-request', 'template-picker'])

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
 * settings. `iconHash` is only set when the icon was unique among the listed
 * entries. Entries in the legacy formats lack some of the optional fields.
 */
export type HiddenEntryRef = { id: string, displayName?: string, templateKey?: string, iconHash?: string }

/**
 * A "New" menu entry registered in an administrator's Files app, stored so the
 * admin page can list entries the server doesn't know (see src/discovery.ts).
 */
export type DiscoveredEntry = { id: string, label: string, category: number, icon: string, order: number }

const FNV_OFFSET_BASIS = BigInt('0xcbf29ce484222325')
const FNV_PRIME = BigInt('0x100000001b3')

/**
 * Fingerprint of an entry's icon (FNV-1a, 64 bit). Some apps register the same
 * entry under different ids in the Files app and on public pages, but with the
 * same icon; the fingerprint links the two.
 *
 * @param svg the icon's SVG markup
 */
export function iconFingerprint(svg: string): string {
	let hash = FNV_OFFSET_BASIS
	for (const byte of new TextEncoder().encode(svg)) {
		hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * FNV_PRIME)
	}
	return hash.toString(16).padStart(16, '0')
}

/**
 * Fingerprints of the icons that occur exactly once among the given icons.
 * Only those identify an entry.
 *
 * @param icons the SVG markup of every listed entry's icon
 */
export function uniqueIconHashes(icons: string[]): Set<string> {
	const counts = new Map<string, number>()
	for (const icon of icons.filter((svg) => svg !== '')) {
		const hash = iconFingerprint(icon)
		counts.set(hash, (counts.get(hash) ?? 0) + 1)
	}
	return new Set([...counts].filter(([, count]) => count === 1).map(([hash]) => hash))
}

/** The fields of core's TemplateFileCreator JSON used here. */
type TemplateProvider = { app: string, extension: string }

const templateKeyMapCache = new Map<'files' | 'files_sharing', Map<string, string>>()

/**
 * Map each template entry id (`template-new-<app>-<index>`, built by core from
 * the `templates` initial state; the index can change between page loads) to
 * the stable key `<app>:<extension>`.
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
 * expects (no public API offers a stable key). Only meaningful where all
 * template entries are registered, i.e. in the owner sidebar.
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
			const iconHash = (item as { iconHash?: unknown }).iconHash
			result.push({
				id: (item as { id: string }).id,
				displayName: typeof displayName === 'string' ? displayName : undefined,
				templateKey: typeof templateKey === 'string' ? templateKey : undefined,
				iconHash: typeof iconHash === 'string' && /^[0-9a-f]{16}$/.test(iconHash) ? iconHash : undefined,
			})
		}
	}
	return result
}

/**
 * Parse a stored list of discovered entries. Invalid items are dropped.
 *
 * @param value the raw stored value
 */
export function normalizeDiscoveredEntries(value: unknown): DiscoveredEntry[] {
	if (!Array.isArray(value)) {
		return []
	}
	const result: DiscoveredEntry[] = []
	for (const item of value) {
		if (!item || typeof item !== 'object') {
			continue
		}
		const { id, label, category, icon, order } = item as Record<string, unknown>
		if (typeof id === 'string' && id !== '' && typeof label === 'string' && isControllableEntry({ category: category as number }) && typeof icon === 'string') {
			result.push({ id, label, category: category as number, icon, order: typeof order === 'number' && Number.isFinite(order) ? order : 0 })
		}
	}
	return result
}

/**
 * Whether a menu entry is one of the entries to hide: by templateKey for
 * template-based entries, by id, by icon fingerprint for entries an app
 * registers under another id elsewhere, and last by displayName, which is
 * translated and only used for entries stored without a fingerprint.
 *
 * @param entry the registered menu entry to check
 * @param entry.id its current id
 * @param entry.displayName its current display name
 * @param entry.iconSvgInline its icon's SVG markup
 * @param hiddenEntries the entries to hide
 * @param initialStateApp see getTemplateKeyMap()
 */
export function matchesHiddenEntry(entry: { id: string, displayName: string, iconSvgInline?: string }, hiddenEntries: HiddenEntryRef[], initialStateApp: 'files' | 'files_sharing'): boolean {
	const templateKey = templateKeyFor(entry.id, initialStateApp)
	const iconHash = entry.iconSvgInline ? iconFingerprint(entry.iconSvgInline) : undefined
	return hiddenEntries.some((hidden) => (templateKey !== undefined && hidden.templateKey === templateKey)
		|| hidden.id === entry.id
		|| (hidden.iconHash !== undefined && hidden.iconHash === iconHash)
		|| (hidden.iconHash === undefined && hidden.displayName !== undefined && hidden.displayName === entry.displayName))
}
