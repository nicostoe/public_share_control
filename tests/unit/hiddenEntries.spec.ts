/*
 * SPDX-FileCopyrightText: 2026 Nico Störzbach
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// The `templates` initial state core provides on the page — see
// templateKeyFor() in src/hiddenEntries.ts for why it matters.
let templates: Record<string, { app: string, extension: string }[]> = {}

vi.mock('@nextcloud/initial-state', () => ({
	loadState: (app: string, key: string, fallback: unknown) => (key === 'templates' ? templates[app] ?? fallback : fallback),
}))

/**
 * Fresh module per test: the template key map is memoized per page load.
 */
async function load() {
	vi.resetModules()
	return await import('../../src/hiddenEntries.ts')
}

beforeEach(() => {
	templates = {}
})

describe('normalizeHiddenEntries', () => {
	it('accepts the legacy plain-id format', async () => {
		const { normalizeHiddenEntries } = await load()
		expect(normalizeHiddenEntries(['newFolder'])).toEqual([{ id: 'newFolder' }])
	})

	it('keeps id, displayName and templateKey of the current format', async () => {
		const { normalizeHiddenEntries } = await load()
		expect(normalizeHiddenEntries([{ id: 'template-new-text-0', displayName: 'Text document', templateKey: 'text:.md' }]))
			.toEqual([{ id: 'template-new-text-0', displayName: 'Text document', templateKey: 'text:.md' }])
	})

	it('drops malformed items and non-string fields', async () => {
		const { normalizeHiddenEntries } = await load()
		expect(normalizeHiddenEntries([42, null, { displayName: 'no id' }, { id: 'ok', templateKey: 7 }]))
			.toEqual([{ id: 'ok', displayName: undefined, templateKey: undefined }])
	})

	it('treats anything but an array as "nothing configured"', async () => {
		const { normalizeHiddenEntries } = await load()
		expect(normalizeHiddenEntries(null)).toEqual([])
		expect(normalizeHiddenEntries({ id: 'x' })).toEqual([])
	})
})

describe('templateKeyFor', () => {
	it('maps core\'s index-based template ids to <app>:<extension>', async () => {
		templates.files = [{ app: 'text', extension: '.md' }, { app: 'drawio', extension: '.drawio' }]
		const { templateKeyFor } = await load()
		expect(templateKeyFor('template-new-text-0', 'files')).toBe('text:.md')
		expect(templateKeyFor('template-new-drawio-1', 'files')).toBe('drawio:.drawio')
		expect(templateKeyFor('newFolder', 'files')).toBeUndefined()
	})

	it('reads the initial state of the given context only', async () => {
		templates.files_sharing = [{ app: 'text', extension: '.md' }]
		const { templateKeyFor } = await load()
		expect(templateKeyFor('template-new-text-0', 'files_sharing')).toBe('text:.md')
		expect(templateKeyFor('template-new-text-0', 'files')).toBeUndefined()
	})
})

describe('matchesHiddenEntry', () => {
	it('matches a template entry by templateKey even after its index shifted', async () => {
		// Saved while drawio was at index 0, now registered at index 1.
		templates.files_sharing = [{ app: 'text', extension: '.md' }, { app: 'drawio', extension: '.drawio' }]
		const { matchesHiddenEntry } = await load()
		const saved = [{ id: 'template-new-drawio-0', templateKey: 'drawio:.drawio' }]
		expect(matchesHiddenEntry({ id: 'template-new-drawio-1', displayName: 'Diagram' }, saved, 'files_sharing')).toBe(true)
		expect(matchesHiddenEntry({ id: 'template-new-text-0', displayName: 'Text document' }, saved, 'files_sharing')).toBe(false)
	})

	it('matches non-template entries by their stable id', async () => {
		const { matchesHiddenEntry } = await load()
		expect(matchesHiddenEntry({ id: 'newFolder', displayName: 'Neuer Ordner' }, [{ id: 'newFolder' }], 'files_sharing')).toBe(true)
	})

	it('falls back to displayName only for legacy references', async () => {
		const { matchesHiddenEntry } = await load()
		const legacy = [{ id: 'template-new-text-3', displayName: 'Text document' }]
		expect(matchesHiddenEntry({ id: 'template-new-text-0', displayName: 'Text document' }, legacy, 'files_sharing')).toBe(true)
		expect(matchesHiddenEntry({ id: 'template-new-text-0', displayName: 'Textdokument' }, legacy, 'files_sharing')).toBe(false)
	})
})

describe('isControllableEntry', () => {
	it('allows "Create new" and "Other", never "Upload from device"', async () => {
		const { isControllableEntry } = await load()
		expect(isControllableEntry({ category: 0 })).toBe(false)
		expect(isControllableEntry({ category: 1 })).toBe(true)
		expect(isControllableEntry({ category: 2 })).toBe(true)
	})
})

describe('templateIdFormatMatches', () => {
	it('is true when a rebuilt id is registered', async () => {
		templates.files = [{ app: 'text', extension: '.md' }]
		const { templateIdFormatMatches } = await load()
		expect(templateIdFormatMatches(['newFolder', 'template-new-text-0'], 'files')).toBe(true)
	})

	it('is false when core registered template entries under another id format', async () => {
		templates.files = [{ app: 'text', extension: '.md' }]
		const { templateIdFormatMatches } = await load()
		expect(templateIdFormatMatches(['newFolder', 'template:text:0'], 'files')).toBe(false)
	})

	it('is true when there are no templates at all', async () => {
		const { templateIdFormatMatches } = await load()
		expect(templateIdFormatMatches(['newFolder'], 'files')).toBe(true)
	})
})

describe('iconFingerprint', () => {
	it('is FNV-1a with 64 bits', async () => {
		const { iconFingerprint } = await load()
		// Reference values of the FNV-1a specification.
		expect(iconFingerprint('')).toBe('cbf29ce484222325')
		expect(iconFingerprint('a')).toBe('af63dc4c8601ec8c')
	})

	it('hashes the UTF-8 bytes', async () => {
		const { iconFingerprint } = await load()
		expect(iconFingerprint('<svg>ä</svg>')).not.toBe(iconFingerprint('<svg>a</svg>'))
		expect(iconFingerprint('<svg>ä</svg>')).toMatch(/^[0-9a-f]{16}$/)
	})
})

describe('uniqueIconHashes', () => {
	it('keeps only icons that occur once, and no empty ones', async () => {
		const { iconFingerprint, uniqueIconHashes } = await load()
		const unique = uniqueIconHashes(['<svg>a</svg>', '<svg>b</svg>', '<svg>b</svg>', ''])
		expect([...unique]).toEqual([iconFingerprint('<svg>a</svg>')])
	})
})

describe('matching by icon fingerprint', () => {
	const DOCX = '<svg>docx</svg>'
	const XLSX = '<svg>xlsx</svg>'

	it('links an entry registered under another id on public pages', async () => {
		// The Files app lists it as a template entry, the public page under the app's own id.
		templates.files_sharing = [{ app: 'text', extension: '.md' }]
		const { iconFingerprint, matchesHiddenEntry } = await load()
		const saved = [{ id: 'template-new-onlyoffice-1', displayName: 'New document', templateKey: 'onlyoffice:.docx', iconHash: iconFingerprint(DOCX) }]
		expect(matchesHiddenEntry({ id: 'new-onlyoffice-docx', displayName: 'Neues Dokument', iconSvgInline: DOCX }, saved, 'files_sharing')).toBe(true)
		expect(matchesHiddenEntry({ id: 'new-onlyoffice-xlsx', displayName: 'Neue Tabelle', iconSvgInline: XLSX }, saved, 'files_sharing')).toBe(false)
	})

	it('ignores the display name of entries stored with a fingerprint', async () => {
		const { iconFingerprint, matchesHiddenEntry } = await load()
		const saved = [{ id: 'new-onlyoffice-docx', displayName: 'New document', iconHash: iconFingerprint(DOCX) }]
		// Another app's entry with the same name but its own icon.
		expect(matchesHiddenEntry({ id: 'new-collabora-docx', displayName: 'New document', iconSvgInline: '<svg>other</svg>' }, saved, 'files_sharing')).toBe(false)
	})

	it('keeps a valid fingerprint when parsing and drops an invalid one', async () => {
		const { normalizeHiddenEntries } = await load()
		expect(normalizeHiddenEntries([{ id: 'a', iconHash: '0123456789abcdef' }, { id: 'b', iconHash: 'not-a-hash' }]))
			.toEqual([{ id: 'a', iconHash: '0123456789abcdef' }, { id: 'b' }])
	})
})

describe('normalizeDiscoveredEntries', () => {
	it('keeps controllable entries and defaults the order', async () => {
		const { normalizeDiscoveredEntries } = await load()
		expect(normalizeDiscoveredEntries([
			{ id: 'new-onlyoffice-pdf', label: 'New PDF form', category: 1, icon: '<svg/>', order: 24 },
			{ id: 'rich-workspace-init', label: 'Add folder description', category: 2, icon: '' },
		])).toEqual([
			{ id: 'new-onlyoffice-pdf', label: 'New PDF form', category: 1, icon: '<svg/>', order: 24 },
			{ id: 'rich-workspace-init', label: 'Add folder description', category: 2, icon: '', order: 0 },
		])
	})

	it('drops uploads, malformed items and anything but an array', async () => {
		const { normalizeDiscoveredEntries } = await load()
		expect(normalizeDiscoveredEntries([
			{ id: 'upload', label: 'Upload files', category: 0, icon: '' },
			{ id: '', label: 'No id', category: 1, icon: '' },
			{ id: 'no-icon', label: 'No icon', category: 1 },
			null,
		])).toEqual([])
		expect(normalizeDiscoveredEntries({ id: 'x' })).toEqual([])
	})
})
