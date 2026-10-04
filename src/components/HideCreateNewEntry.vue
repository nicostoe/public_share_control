<!--
  - SPDX-FileCopyrightText: 2026 Nico Störzbach
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<template>
	<div v-if="entries.length > 0" :class="$style.wrapper">
		<span :id="labelId" :class="$style.label">{{ t('public_share_control', 'Restrict "New" menu') }}</span>
		<NcPopover>
			<template #trigger="{ attrs }">
				<NcButton alignment="space-between-reverse" :aria-describedby="labelId" v-bind="attrs">
					{{ buttonLabel }}
					<template #icon>
						<PlaylistEdit :size="20" />
					</template>
				</NcButton>
			</template>
			<template #default>
				<div :class="$style.list">
					<NcButton
						variant="tertiary"
						alignment="start"
						wide
						@click="toggleAll">
						{{ allSelected ? t('public_share_control', 'Deselect all') : t('public_share_control', 'Select all') }}
					</NcButton>
					<hr :class="$style.divider">
					<!-- The tooltip sits on a wrapper: NcCheckboxRadioSwitch passes
					     `title` on to its hidden, disabled <input>, which never
					     receives the pointer, so no tooltip would ever show. -->
					<div
						v-for="entry in entries"
						:key="entry.id"
						:title="forbiddenIds.has(entry.id) ? t('public_share_control', 'Locked by the administrator') : undefined">
						<NcCheckboxRadioSwitch
							:modelValue="!hiddenIds.has(entry.id)"
							:disabled="forbiddenIds.has(entry.id)"
							@update:modelValue="(checked) => setEntryVisible(entry.id, checked)">
							<!-- Deliberately NOT using the component's #icon slot: it
							     replaces the checkbox's own checked/unchecked glyph
							     instead of adding alongside it, so the entry's icon
							     goes in the default (label) slot next to the name. -->
							<span :class="$style.entryLabel">
								<NcIconSvgWrapper :class="$style.entryIcon" :svg="entry.iconSvgInline" inline />
								{{ entry.displayName }}
							</span>
						</NcCheckboxRadioSwitch>
					</div>
				</div>
			</template>
		</NcPopover>
	</div>
</template>

<script lang="ts">
import type { PropType } from 'vue'
import type { HiddenEntryRef } from '../hiddenEntries.ts'

import { getNewFileMenuEntries } from '@nextcloud/files'
import { loadState } from '@nextcloud/initial-state'
import { t } from '@nextcloud/l10n'
import { defineComponent, useId } from 'vue'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcCheckboxRadioSwitch from '@nextcloud/vue/components/NcCheckboxRadioSwitch'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import NcPopover from '@nextcloud/vue/components/NcPopover'
import PlaylistEdit from 'vue-material-design-icons/PlaylistEdit.vue'
import { ATTRIBUTE_KEY, ATTRIBUTE_SCOPE, DEFAULT_HIDDEN_ENTRIES_KEY, FORBIDDEN_ENTRIES_KEY } from '../constants.ts'
import { isControllableEntry, matchesHiddenEntry, normalizeHiddenEntries, templateIdFormatMatches, templateKeyFor } from '../hiddenEntries.ts'
import { logger } from '../logger.ts'

type ShareAttribute = { scope: string, key: string, value: unknown }
type ShareLike = { id: string, attributes: ShareAttribute[] }
type NewMenuEntryLike = { id: string, displayName: string, iconSvgInline: string, order?: number }

/**
 * Core "Create new" entries confirmed (via nextcloud/server source) to never
 * apply to an anonymous public-share visitor, so listing them here would
 * just be noise with no visible effect either way:
 * - "file-request" (apps/files_sharing/src/files_newMenu/newFileRequest.ts):
 *   its own `enabled()` explicitly returns false whenever `isPublicShare()`
 *   is true, and it's only registered by the authenticated-only
 *   files_sharing/init.ts — never by the public page's init-public.ts.
 * - "template-picker" (apps/files/src/newMenu/newTemplatesFolder.ts): its
 *   `enabled()` requires `context.owner === getCurrentUser()?.uid`, which
 *   can never hold for an anonymous visitor (no current user at all).
 * If a future core version renames these ids, the entries simply reappear
 * in the picker — harmless, not a crash.
 */
const NEVER_PUBLIC_ENTRY_IDS = new Set(['file-request', 'template-picker'])

/**
 * The admin's instance-wide "hidden by default" and "forbidden" lists (see
 * lib/Settings/Admin.php), pushed unconditionally by LoadSidebarListener.php
 * regardless of which share is being edited — read once at module load,
 * same as every other loadState() call in this app.
 */
const defaultHiddenEntries = normalizeHiddenEntries(loadState('public_share_control', DEFAULT_HIDDEN_ENTRIES_KEY, []))
const forbiddenEntries = normalizeHiddenEntries(loadState('public_share_control', FORBIDDEN_ENTRIES_KEY, []))

/**
 * This app's own entry in the share's generic attributes, if any.
 *
 * @param share the share object as passed to this component
 */
function findOwnAttribute(share: ShareLike): ShareAttribute | undefined {
	return share.attributes.find((attribute) => attribute.scope === ATTRIBUTE_SCOPE && attribute.key === ATTRIBUTE_KEY)
}

/**
 * Replace (or with `undefined`, remove) this app's entry in the share's
 * attributes — **in place**, on core's own share object.
 *
 * `share` is core's actual `Share` model instance (SidebarTabExternalAction
 * passes `toRaw(props.share)`; in core's Vue 2.7 that is the same object), and
 * its `attributes` getter returns the live array without offering a setter.
 * Core reads that array when it saves (SharesMixin.queueUpdate() sends
 * `JSON.stringify(this.share.attributes)`) and edits it in place itself (the
 * Share model's `hideDownload` setter). Writing our selection into that array
 * therefore makes core's own, single "Update share" request carry it — no
 * second request of our own, and no stale copy that a later save could use to
 * overwrite our value (both were real bugs of the earlier two-request design,
 * see AGENTS.md).
 *
 * @param share the share object as passed to this component
 * @param entry the attribute entry to store, or undefined to remove it
 */
function writeOwnAttribute(share: ShareLike, entry: ShareAttribute | undefined): void {
	const attributes = share.attributes
	const index = attributes.findIndex((attribute) => attribute.scope === ATTRIBUTE_SCOPE && attribute.key === ATTRIBUTE_KEY)
	if (entry === undefined) {
		if (index !== -1) {
			attributes.splice(index, 1)
		}
	} else if (index === -1) {
		attributes.push(entry)
	} else {
		attributes.splice(index, 1, entry)
	}
}

/**
 * Deep copy of an attribute entry, so a remembered baseline can't be changed
 * by later in-place edits. JSON round-trip rather than structuredClone(): the
 * input may be a Vue reactive proxy (which structuredClone() rejects), and
 * attribute values are JSON by definition.
 *
 * @param entry the entry to copy
 */
function cloneAttribute(entry: ShareAttribute | undefined): ShareAttribute | undefined {
	return entry === undefined ? undefined : JSON.parse(JSON.stringify(entry))
}

/**
 * Every currently-registered "Create new" entry the admin forbade entirely,
 * by id — always hidden, and shown as a disabled (unselectable) checkbox,
 * regardless of any per-share choice. Entries+forbiddenEntries don't change
 * per share, so this only ever needs computing once (see data()).
 *
 * @param entries every currently-registered "Create new" entry
 */
function computeForbiddenIds(entries: NewMenuEntryLike[]): Set<string> {
	return new Set(entries.filter((entry) => matchesHiddenEntry(entry, forbiddenEntries, 'files')).map((entry) => entry.id))
}

/**
 * The effective hidden-entry id set for a given share: the admin's forbidden
 * list (unconditional) plus either the owner's own explicit choice for this
 * share, or — only when the owner has never made one (no attribute at all) —
 * the admin's default-hidden list. An explicit choice, even an empty one,
 * fully REPLACES the default rather than merging with it: an owner who
 * explicitly re-enabled every entry should see every entry.
 *
 * @param entries every currently-registered "Create new" entry
 * @param share the share object as passed to this component
 */
function computeHiddenIds(entries: NewMenuEntryLike[], share: ShareLike): Set<string> {
	const own = findOwnAttribute(share)
	const explicit: HiddenEntryRef[] | undefined = own === undefined ? undefined : normalizeHiddenEntries(own.value)
	const effective = [...forbiddenEntries, ...(explicit ?? defaultHiddenEntries)]
	return new Set(entries.filter((entry) => matchesHiddenEntry(entry, effective, 'files')).map((entry) => entry.id))
}

/**
 * Whether two id sets contain the same ids.
 *
 * @param a first set
 * @param b second set
 */
function sameIds(a: Set<string>, b: Set<string>): boolean {
	return a.size === b.size && [...a].every((id) => b.has(id))
}

/**
 * Every "Create new" entry currently registered on this page, in the same
 * order the real "+" menu would show them. Read once at module load: the
 * sidebar only mounts once the Files app (and therefore every app's own
 * menu-entry registration script) has already run.
 */
function listCreateNewEntries(): NewMenuEntryLike[] {
	const registered = getNewFileMenuEntries()
	if (!templateIdFormatMatches(registered.map((entry) => entry.id), 'files')) {
		logger.warn('Template-based "New" menu entry ids no longer match the format this app expects '
			+ '(`template-new-<app>-<index>`). Hiding document/diagram/whiteboard entries will not work '
			+ 'with this Nextcloud version — see templateKeyFor() in hiddenEntries.ts.')
	}
	return registered
		.filter((entry) => isControllableEntry(entry) && !NEVER_PUBLIC_ENTRY_IDS.has(entry.id))
		.map((entry) => ({ id: entry.id, displayName: entry.displayName, iconSvgInline: entry.iconSvgInline, order: entry.order }))
}

export default defineComponent({
	name: 'HideCreateNewEntry',

	components: {
		NcButton,
		NcCheckboxRadioSwitch,
		NcIconSvgWrapper,
		NcPopover,
		PlaylistEdit,
	},

	props: {
		share: {
			type: Object as PropType<ShareLike>,
			required: true,
		},

		// Always set by core's SidebarTabExternalAction wrapper, unused here
		// but declared for a complete, self-documenting component contract.
		node: {
			type: Object,
			required: false,
			default: null,
		},

		onSave: {
			type: Function as PropType<(cb: () => Promise<void>) => void>,
			required: true,
		},
	},

	setup() {
		// Ties the visible label to the button for screen readers.
		return { labelId: useId() }
	},

	data() {
		const entries = listCreateNewEntries()
		const hiddenIds = computeHiddenIds(entries, this.share)
		return {
			entries,
			forbiddenIds: computeForbiddenIds(entries),
			hiddenIds,
			// Last saved state, to restore if the editor is closed without
			// saving (see beforeUnmount) — mirroring how core's own cancel()
			// restores the share fields it edits in place.
			savedHiddenIds: new Set(hiddenIds),
			savedAttribute: cloneAttribute(findOwnAttribute(this.share)),
		}
	},

	computed: {
		buttonLabel(): string {
			return this.hiddenIds.size > 0
				? t('public_share_control', '{count} of {total} entries hidden', { count: this.hiddenIds.size, total: this.entries.length })
				: t('public_share_control', 'All entries visible')
		},

		// Whether every entry the owner actually has any say over is visible
		// — forbiddenIds is always a subset of hiddenIds (computeHiddenIds()
		// always includes it), so equal sizes means nothing ELSE is hidden.
		allSelected(): boolean {
			return this.hiddenIds.size === this.forbiddenIds.size
		},
	},

	watch: {
		// Keyed on share.id, NOT the whole share object: re-seed only when a
		// genuinely different share is being edited, never because core
		// mutated the current share object during its own save cycle. (Core
		// closes the share editor — unmounting this component — before another
		// share can be edited, so there are no unsaved edits to carry over.)
		'share.id': {
			immediate: true,
			handler() {
				this.hiddenIds = computeHiddenIds(this.entries, this.share)
				this.markSaved()
				// Core calls this after its own "Update share" request (which
				// already carried our attribute, see writeOwnAttribute()).
				this.onSave(async () => this.markSaved())
			},
		},
	},

	beforeUnmount() {
		// The share editor closes after "Update share" (markSaved() already
		// ran) and on "Cancel". In the latter case undo our in-place edit, just
		// like core's cancel() restores the fields it edits in place — otherwise
		// a cancelled selection would ride along with the next unrelated save.
		this.restoreUnsaved()
	},

	methods: {
		t,

		toggleAll() {
			// Mirrors a standard "select all" header checkbox: while anything
			// this owner can control is hidden, clicking reveals everything
			// they can control; only once everything they can control is
			// already visible does it hide everything in one go. Forbidden
			// entries stay hidden either way — they're not the owner's to
			// control at all.
			this.hiddenIds = this.allSelected
				? new Set(this.entries.map((entry) => entry.id))
				: new Set(this.forbiddenIds)
			this.writeSelection()
		},

		setEntryVisible(id: string, visible: boolean) {
			if (this.forbiddenIds.has(id)) {
				// Belt-and-suspenders beyond the template's :disabled binding —
				// an admin-forbidden entry is never the owner's to toggle.
				return
			}
			// Reassign (not mutate) so the Set change is actually reactive.
			const next = new Set(this.hiddenIds)
			if (visible) {
				next.delete(id)
			} else {
				next.add(id)
			}
			this.hiddenIds = next
			this.writeSelection()
		},

		/**
		 * Put the current selection into the share's attributes, so core's
		 * own "Update share" request saves it.
		 *
		 * Back at the saved selection, the saved attribute is restored as it
		 * was — including "no attribute at all", so merely toggling something
		 * and back doesn't turn a share that follows the admin's defaults into
		 * an explicitly configured one.
		 *
		 * Stored per entry: id, displayName and templateKey. Template-based
		 * entries' ids end in a list position that isn't stable across page
		 * loads; templateKey (`<app>:<extension>`, see hiddenEntries.ts) is.
		 * Admin-forbidden entries are left out: they're enforced at read time
		 * (computeHiddenIds()), so storing them per share would only go stale
		 * after a later admin un-forbid.
		 */
		writeSelection() {
			if (sameIds(this.hiddenIds, this.savedHiddenIds)) {
				writeOwnAttribute(this.share, cloneAttribute(this.savedAttribute))
				return
			}
			const value = this.entries
				.filter((entry) => this.hiddenIds.has(entry.id) && !this.forbiddenIds.has(entry.id))
				.map((entry) => ({ id: entry.id, displayName: entry.displayName, templateKey: templateKeyFor(entry.id, 'files') }))
			writeOwnAttribute(this.share, { scope: ATTRIBUTE_SCOPE, key: ATTRIBUTE_KEY, value })
		},

		/** Remember the current state as saved (after core saved it, or on load). */
		markSaved() {
			this.savedHiddenIds = new Set(this.hiddenIds)
			this.savedAttribute = cloneAttribute(findOwnAttribute(this.share))
		},

		/** Undo unsaved in-place edits, e.g. when the editor is cancelled. */
		restoreUnsaved() {
			if (!sameIds(this.hiddenIds, this.savedHiddenIds)) {
				writeOwnAttribute(this.share, cloneAttribute(this.savedAttribute))
			}
		},
	},
})
</script>

<style module lang="scss">
// Laid out like core's neighbouring options in the share editor (plain text
// in the main text colour, no card): a label with the popover button below.
.wrapper {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: calc(var(--default-grid-baseline) * 2);
	width: 100%;
	padding-block: calc(var(--default-grid-baseline) * 2);
	padding-inline: var(--default-grid-baseline);
}

.label {
	color: var(--color-main-text);
}

.list {
	display: flex;
	flex-direction: column;
	padding: var(--default-grid-baseline);
	min-width: 250px;
}

.divider {
	width: 100%;
	border: none;
	border-top: 1px solid var(--color-border);
	margin: var(--default-grid-baseline) 0;
}

.entryLabel {
	display: inline-flex;
	align-items: center;
	gap: calc(var(--default-grid-baseline) * 2);
}

.entryIcon {
	flex: 0 0 auto;
	color: var(--color-text-maxcontrast);
}
</style>
