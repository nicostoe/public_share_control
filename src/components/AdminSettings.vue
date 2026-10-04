<!--
  - SPDX-FileCopyrightText: 2026 Nico Störzbach
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<template>
	<NcSettingsSection
		:name="t('public_share_control', 'Public Share Control')"
		:description="t('public_share_control', 'Defaults and restrictions for all public share links on this server. Within these limits, owners can still adjust their own links in the sharing sidebar.')">
		<NcCheckboxRadioSwitch
			:modelValue="quickUploadEnabled"
			:loading="quickUploadSaving"
			type="switch"
			@update:modelValue="setQuickUploadEnabled">
			{{ t('public_share_control', 'Show an "Upload files" button on public share pages') }}
			<template #description>
				{{ t('public_share_control', 'Gives visitors one-click uploads next to "Public share". Only shown on links that allow uploads.') }}
			</template>
		</NcCheckboxRadioSwitch>

		<p :class="$style.intro">
			{{ t('public_share_control', 'Controls what visitors can create via the "New" menu on public share pages. Uploading files is always possible.') }}
		</p>
		<!-- Plain paragraphs, not a <dl>: Nextcloud's global dt/dd styles break a grid layout here. -->
		<div :class="$style.legend">
			<p>
				<strong>{{ t('public_share_control', 'Hidden by default') }}:</strong>
				{{ t('public_share_control', 'Hidden on links whose owner hasn\'t changed the selection. Owners can turn it back on for individual links.') }}
			</p>
			<p>
				<strong>{{ t('public_share_control', 'Forbidden') }}:</strong>
				{{ t('public_share_control', 'Always hidden on all links, including existing ones. Owners cannot turn it back on.') }}
			</p>
		</div>

		<div :class="$style.rows">
			<div v-for="row in rows" :key="row.key" :class="$style.row">
				<span :class="$style.entryLabel">
					<!-- Always rendered (an empty icon-sized box if an app ships no inline SVG) so labels stay aligned. -->
					<NcIconSvgWrapper :class="$style.entryIcon" :svg="row.iconSvgInline ?? ''" inline />
					{{ row.label }}
				</span>
				<span :class="$style.switches">
					<NcCheckboxRadioSwitch
						:modelValue="isDefaultHidden(row.key)"
						:disabled="isForbidden(row.key)"
						type="switch"
						@update:modelValue="(checked) => setDefaultHidden(row.key, checked)">
						{{ t('public_share_control', 'Hidden by default') }}
					</NcCheckboxRadioSwitch>
					<NcCheckboxRadioSwitch
						:modelValue="isForbidden(row.key)"
						type="switch"
						@update:modelValue="(checked) => setForbidden(row.key, checked)">
						{{ t('public_share_control', 'Forbidden') }}
					</NcCheckboxRadioSwitch>
				</span>
			</div>
		</div>

		<p :class="$style.hint">
			{{ t('public_share_control', 'Only entries Nextcloud can list on the server appear here. Entries that apps add in a non-standard way can\'t be restricted on this page.') }}
		</p>
		<p :class="$style.hint">
			{{ t('public_share_control', 'This only hides menu entries. Visitors with upload permission could still create files and folders by other means, e.g. WebDAV.') }}
		</p>
	</NcSettingsSection>
</template>

<script lang="ts">
import type { HiddenEntryRef } from '../hiddenEntries.ts'

import { mdiFolderPlusOutline, mdiText } from '@mdi/js'
import axios from '@nextcloud/axios'
import { showError } from '@nextcloud/dialogs'
import { loadState } from '@nextcloud/initial-state'
import { t } from '@nextcloud/l10n'
import { confirmPassword } from '@nextcloud/password-confirmation'
import { generateOcsUrl } from '@nextcloud/router'
import { defineComponent } from 'vue'
import NcCheckboxRadioSwitch from '@nextcloud/vue/components/NcCheckboxRadioSwitch'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import NcSettingsSection from '@nextcloud/vue/components/NcSettingsSection'
import { DEFAULT_HIDDEN_ENTRIES_KEY, FORBIDDEN_ENTRIES_KEY, QUICK_UPLOAD_ENABLED_KEY } from '../constants.ts'
import { normalizeHiddenEntries } from '../hiddenEntries.ts'
import { logger } from '../logger.ts'

const APP_ID = 'public_share_control'

type TemplateCreator = { app: string, label: string, extension: string, iconSvgInline: string | null }

/**
 * A single "Create new" entry as shown in this admin page's row list.
 *
 * `templateKey` is set for template-based entries (documents, spreadsheets,
 * diagrams, whiteboards, …) — the SAME `<app>:<extension>` key
 * src/hiddenEntries.ts's templateKeyFor() recomputes on the consuming side
 * (sidebar, public page) from a live registered entry's volatile id. It's
 * absent for "New folder", the one core "Create new" entry that both has no
 * PHP-side registry at all (must be hardcoded, see below) and needs none —
 * its id ('newFolder') is already stable, unlike template-based entries'.
 */
type EntryRow = { key: string, label: string, iconSvgInline: string | null, templateKey?: string }

/**
 * Wrap an `@mdi/js` icon path as an inline SVG string. The hardcoded rows below
 * use the exact same Material Design icons the real "+ New" entries register
 * (verified by comparing the registered SVG paths on NC34 and NC35:
 * "New folder" → mdiFolderPlusOutline, Text's "Add folder description" →
 * mdiText), so the admin page always matches the menu.
 *
 * @param path the icon's SVG path data
 */
function mdiSvg(path: string): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${path}" /></svg>`
}

/**
 * The hardcoded "New folder" pseudo-row. Nextcloud core enumerates
 * "Create new" entries server-side ONLY for template-based ones, via
 * ITemplateManager::listCreators() (see Settings/Admin.php) — "New folder"
 * is registered purely client-side (apps/files/src/newMenu/newFolder.ts in
 * nextcloud/server, id `newFolder`, confirmed stable) with no PHP-side
 * registry at all. Any third-party app that likewise registers its own
 * "Create new" entry directly (bypassing the template mechanism) is not
 * enumerable here either — a real, known limitation, not silently glossed
 * over (see the hint text in the template above).
 */
const NEW_FOLDER_ROW: EntryRow = { key: 'newFolder', label: t('public_share_control', 'New folder'), iconSvgInline: mdiSvg(mdiFolderPlusOutline) }

/**
 * The Text app's "Add folder description" entry (creates a Readme.md shown
 * above the file list). Like "New folder" it's registered purely client-side
 * (id `rich-workspace-init`, category "Other", confirmed on NC34 and NC35),
 * so it can't be enumerated server-side and is hardcoded — shown only when
 * the Text app is enabled.
 */
const FOLDER_DESCRIPTION_ROW: EntryRow = { key: 'rich-workspace-init', label: t('public_share_control', 'Add folder description'), iconSvgInline: mdiSvg(mdiText) }

export default defineComponent({
	name: 'AdminSettings',

	components: {
		NcCheckboxRadioSwitch,
		NcIconSvgWrapper,
		NcSettingsSection,
	},

	data() {
		const templateCreators = loadState<TemplateCreator[]>(APP_ID, 'template-creators', [])
		const rows: EntryRow[] = [
			NEW_FOLDER_ROW,
			...templateCreators.map((creator): EntryRow => {
				const templateKey = `${creator.app}:${creator.extension}`
				return { key: templateKey, label: creator.label, iconSvgInline: creator.iconSvgInline, templateKey }
			}),
			...(loadState<boolean>(APP_ID, 'text-app-enabled', false) ? [FOLDER_DESCRIPTION_ROW] : []),
		]

		const defaultHidden = normalizeHiddenEntries(loadState(APP_ID, DEFAULT_HIDDEN_ENTRIES_KEY, []))
		const forbidden = normalizeHiddenEntries(loadState(APP_ID, FORBIDDEN_ENTRIES_KEY, []))
		// Keyed on the SAME row.key used everywhere else here (templateKey
		// for template rows, plain id for "New folder") — admin-authored refs
		// always set templateKey === id for template rows (see toRefs()), so
		// `ref.templateKey ?? ref.id` recovers row.key either way.
		const defaultHiddenKeys = new Set(defaultHidden.map((ref) => ref.templateKey ?? ref.id))
		const forbiddenKeys = new Set(forbidden.map((ref) => ref.templateKey ?? ref.id))
		const quickUploadEnabled = loadState<boolean>(APP_ID, QUICK_UPLOAD_ENABLED_KEY, true)

		return {
			rows,
			defaultHiddenKeys,
			forbiddenKeys,
			// Last state the server confirmed — what the switches fall back to
			// if a save fails or the password confirmation is cancelled.
			savedDefaultHiddenKeys: new Set(defaultHiddenKeys),
			savedForbiddenKeys: new Set(forbiddenKeys),
			// Configured entries without a row on this page (e.g. from an app
			// that's currently disabled) — kept as-is on save instead of being
			// silently dropped.
			storedRefs: new Map([...defaultHidden, ...forbidden].map((ref) => [ref.templateKey ?? ref.id, ref])),
			entriesSaving: false,
			entriesDirty: false,
			quickUploadEnabled,
			quickUploadSaving: false,
		}
	},

	methods: {
		t,

		isDefaultHidden(key: string): boolean {
			return this.defaultHiddenKeys.has(key)
		},

		isForbidden(key: string): boolean {
			return this.forbiddenKeys.has(key)
		},

		setDefaultHidden(key: string, hidden: boolean) {
			if (this.forbiddenKeys.has(key)) {
				// Locked: a forbidden entry is always default-hidden too, see
				// setForbidden() below — this is defense in depth alongside the
				// template's :disabled binding, not the primary guard.
				return
			}
			const next = new Set(this.defaultHiddenKeys)
			if (hidden) {
				next.add(key)
			} else {
				next.delete(key)
			}
			this.defaultHiddenKeys = next
			this.saveEntries()
		},

		setForbidden(key: string, forbidden: boolean) {
			const nextForbidden = new Set(this.forbiddenKeys)
			if (forbidden) {
				nextForbidden.add(key)
				// Forbidding an entry makes a separate "hidden by default" state
				// for it meaningless (forbidding already hides it unconditionally
				// — see the merge model in hiddenEntries.ts's consumers), so force
				// it on here too, purely so the UI doesn't show a confusing
				// contradictory-looking pair of switches.
				const nextDefault = new Set(this.defaultHiddenKeys)
				nextDefault.add(key)
				this.defaultHiddenKeys = nextDefault
			} else {
				nextForbidden.delete(key)
			}
			this.forbiddenKeys = nextForbidden
			this.saveEntries()
		},

		/**
		 * Persist both entry lists. Saves start immediately and never run
		 * concurrently: both lists are array-valued keys shared by every row,
		 * so overlapping requests could land out of order and revert a newer
		 * change. A change made while a save is running marks the state dirty,
		 * and the loop then saves the newest state once more.
		 *
		 * If a save fails — or the admin cancels the password confirmation —
		 * the switches return to what the server last confirmed, so the page
		 * never shows a state that isn't actually stored.
		 */
		async saveEntries() {
			if (this.entriesSaving) {
				this.entriesDirty = true
				return
			}
			this.entriesSaving = true
			try {
				do {
					this.entriesDirty = false
					const defaultHiddenKeys = new Set(this.defaultHiddenKeys)
					const forbiddenKeys = new Set(this.forbiddenKeys)
					await confirmPassword()
					await this.saveConfigValue(DEFAULT_HIDDEN_ENTRIES_KEY, JSON.stringify(this.toRefs(defaultHiddenKeys)))
					this.savedDefaultHiddenKeys = defaultHiddenKeys
					await this.saveConfigValue(FORBIDDEN_ENTRIES_KEY, JSON.stringify(this.toRefs(forbiddenKeys)))
					this.savedForbiddenKeys = forbiddenKeys
				} while (this.entriesDirty)
			} catch (error) {
				logger.error('Failed to save the "New" menu settings', { error })
				showError(t('public_share_control', 'Failed to save the "New" menu settings'))
				this.defaultHiddenKeys = new Set(this.savedDefaultHiddenKeys)
				this.forbiddenKeys = new Set(this.savedForbiddenKeys)
			} finally {
				this.entriesSaving = false
				this.entriesDirty = false
			}
		},

		/**
		 * Stored references for a set of row keys. Keys without a row on this
		 * page keep the reference they were loaded with.
		 *
		 * @param keys the row keys to store
		 */
		toRefs(keys: Set<string>): HiddenEntryRef[] {
			return [...keys].map((key) => {
				const row = this.rows.find((candidate) => candidate.key === key)
				if (row === undefined) {
					return this.storedRefs.get(key) ?? { id: key }
				}
				return row.templateKey !== undefined ? { id: row.templateKey, templateKey: row.templateKey } : { id: row.key }
			})
		},

		async setQuickUploadEnabled(enabled: boolean) {
			if (this.quickUploadSaving) {
				return
			}
			this.quickUploadEnabled = enabled
			this.quickUploadSaving = true
			try {
				await confirmPassword()
				await this.saveConfigValue(QUICK_UPLOAD_ENABLED_KEY, enabled ? 'yes' : 'no')
			} catch (error) {
				logger.error('Failed to save the "Upload files" button setting', { error })
				showError(t('public_share_control', 'Failed to save the "Upload files" button setting'))
				this.quickUploadEnabled = !enabled
			} finally {
				this.quickUploadSaving = false
			}
		},

		/**
		 * Store one app config value through Nextcloud's generic app config
		 * endpoint (the same one core's own sharebymail admin settings use).
		 *
		 * @param key the app config key
		 * @param value the string value to store
		 */
		async saveConfigValue(key: string, value: string) {
			await axios.post(generateOcsUrl('/apps/provisioning_api/api/v1/config/apps/{appId}/{key}', { appId: APP_ID, key }), { value })
		},
	},
})
</script>

<style module lang="scss">
.intro {
	margin-block: calc(var(--default-grid-baseline) * 6) calc(var(--default-grid-baseline) * 2);
}

// Short legend for the two per-entry switches, instead of one long paragraph.
.legend {
	display: flex;
	flex-direction: column;
	gap: var(--default-grid-baseline);
	margin-block-end: calc(var(--default-grid-baseline) * 3);
	color: var(--color-text-maxcontrast);
}

.hint {
	color: var(--color-text-maxcontrast);
	font-size: var(--font-size-small);
	margin-block-start: calc(var(--default-grid-baseline) * 3);
}

.rows {
	display: flex;
	flex-direction: column;
	gap: var(--default-grid-baseline);
}

.row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: calc(var(--default-grid-baseline) * 2) calc(var(--default-grid-baseline) * 6);
	padding: calc(var(--default-grid-baseline) * 2) 0;
	border-bottom: 1px solid var(--color-border);

	&:last-child {
		border-bottom: none;
	}
}

.entryLabel {
	display: inline-flex;
	align-items: center;
	gap: calc(var(--default-grid-baseline) * 2);
	flex: 1 1 auto;
	min-width: 200px;
}

.entryIcon {
	flex: 0 0 auto;
	color: var(--color-text-maxcontrast);
}

.switches {
	display: flex;
	flex-wrap: wrap;
	gap: calc(var(--default-grid-baseline) * 2) calc(var(--default-grid-baseline) * 6);
	flex: 0 0 auto;
}
</style>
