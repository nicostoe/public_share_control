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
