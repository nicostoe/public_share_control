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
					<!-- Tooltip on a wrapper: NcCheckboxRadioSwitch passes `title` on to
					     its hidden input, which never gets the pointer. -->
					<div
						v-for="entry in entries"
						:key="entry.id"
						:title="forbiddenIds.has(entry.id) ? t('public_share_control', 'Locked by the administrator') : undefined">
						<NcCheckboxRadioSwitch
							:modelValue="!hiddenIds.has(entry.id)"
							:disabled="forbiddenIds.has(entry.id)"
							@update:modelValue="(checked) => setEntryVisible(entry.id, checked)">
							<!-- Not the #icon slot: it replaces the checkbox glyph. -->
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
 * Core entries that never show for visitors: "file-request" is disabled on
 * public pages, "template-picker" needs a signed-in owner.
 */
const NEVER_PUBLIC_ENTRY_IDS = new Set(['file-request', 'template-picker'])

const defaultHiddenEntries = normalizeHiddenEntries(loadState('public_share_control', DEFAULT_HIDDEN_ENTRIES_KEY, []))
const forbiddenEntries = normalizeHiddenEntries(loadState('public_share_control', FORBIDDEN_ENTRIES_KEY, []))

/**
 * This app's attribute on the share, if any.
 *
 * @param share the share object as passed to this component
 */
function findOwnAttribute(share: ShareLike): ShareAttribute | undefined {
	return share.attributes.find((attribute) => attribute.scope === ATTRIBUTE_SCOPE && attribute.key === ATTRIBUTE_KEY)
}

/**
 * Set (or with `undefined`, remove) this app's attribute, in place. `share` is
 * core's own Share model: its `attributes` getter returns the live array that
 * core's "Update share" request sends, and it has no setter, so the array is
 * edited, never replaced.
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
 * Deep copy of an attribute, so later in-place edits can't change it. JSON
 * round-trip because structuredClone() rejects Vue proxies.
 *
 * @param entry the entry to copy
 */
function cloneAttribute(entry: ShareAttribute | undefined): ShareAttribute | undefined {
	return entry === undefined ? undefined : JSON.parse(JSON.stringify(entry))
}

/**
 * Ids of the entries the admin forbade.
 *
 * @param entries the controllable entries
 */
function computeForbiddenIds(entries: NewMenuEntryLike[]): Set<string> {
	return new Set(entries.filter((entry) => matchesHiddenEntry(entry, forbiddenEntries, 'files')).map((entry) => entry.id))
}

/**
 * Ids of the entries hidden on this link: the forbidden ones plus the owner's
 * selection or, if the owner never changed it, the admin defaults.
 *
 * @param entries the controllable entries
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
 * The controllable "New" menu entries, in menu order. All apps have registered
 * theirs by the time the sidebar opens.
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

		// Passed by core, unused.
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
			// Last saved state, restored if the editor closes without saving.
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

		// Nothing hidden except the forbidden entries, which hiddenIds
		// always contains.
		allSelected(): boolean {
			return this.hiddenIds.size === this.forbiddenIds.size
		},
	},

	watch: {
		// Only share.id: core changes the share object itself while saving,
		// which must not reset the selection.
		'share.id': {
			immediate: true,
			handler() {
				this.hiddenIds = computeHiddenIds(this.entries, this.share)
				this.markSaved()
				// Called by core after its "Update share" request.
				this.onSave(async () => this.markSaved())
			},
		},
	},

	beforeUnmount() {
		// After "Cancel", undo the unsaved edit like core's cancel() does for
		// its own fields; otherwise the next save would carry it.
		this.restoreUnsaved()
	},

	methods: {
		t,

		toggleAll() {
			// Shows everything unless everything is shown already. Forbidden
			// entries stay hidden either way.
			this.hiddenIds = this.allSelected
				? new Set(this.entries.map((entry) => entry.id))
				: new Set(this.forbiddenIds)
			this.writeSelection()
		},

		setEntryVisible(id: string, visible: boolean) {
			if (this.forbiddenIds.has(id)) {
				return
			}
			// Reassigned, not mutated, so the change is reactive.
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
		 * Write the selection into the share's attributes for core's
		 * "Update share" request. Back at the saved selection, the saved
		 * attribute is restored exactly, including "none", so the link keeps
		 * following the admin defaults. Each entry is stored with its
		 * templateKey, since template entry ids aren't stable. Forbidden
		 * entries apply anyway and aren't stored.
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
// Laid out like the neighbouring options in core's share editor.
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
