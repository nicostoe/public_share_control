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
					<!-- Always rendered, so labels stay aligned for entries without an icon. -->
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
 * One row of the entry list. Template-based entries have a `templateKey`
 * (`<app>:<extension>`, see hiddenEntries.ts) as their key; the fixed rows
 * use their stable ids.
 */
type EntryRow = { key: string, label: string, iconSvgInline: string | null, templateKey?: string }

/**
 * Inline SVG for an `@mdi/js` icon path. The fixed rows use the same icons as
 * the real menu entries.
 *
 * @param path the icon's SVG path data
 */
function mdiSvg(path: string): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${path}" /></svg>`
}

/**
 * "New folder" exists only client-side, so it isn't in the server's list (see
 * Settings/Admin.php) and is a fixed row. Entries other apps add the same way
 * can't be listed at all, as the page says.
 */
const NEW_FOLDER_ROW: EntryRow = { key: 'newFolder', label: t('public_share_control', 'New folder'), iconSvgInline: mdiSvg(mdiFolderPlusOutline) }

/**
 * The Text app's "Add folder description", also client-side only. Shown when
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
		// Stored refs map back to row keys: template rows are stored with
		// id === templateKey (see toRefs()).
		const defaultHiddenKeys = new Set(defaultHidden.map((ref) => ref.templateKey ?? ref.id))
		const forbiddenKeys = new Set(forbidden.map((ref) => ref.templateKey ?? ref.id))
		const quickUploadEnabled = loadState<boolean>(APP_ID, QUICK_UPLOAD_ENABLED_KEY, true)

		return {
			rows,
			defaultHiddenKeys,
			forbiddenKeys,
			// Last state the server confirmed, restored when a save fails.
			savedDefaultHiddenKeys: new Set(defaultHiddenKeys),
			savedForbiddenKeys: new Set(forbiddenKeys),
			// Configured entries without a row here (e.g. from a disabled app),
			// kept unchanged on save.
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
				// A forbidden entry stays hidden by default, see setForbidden().
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
				// Hidden anyway; switching "Hidden by default" on too keeps the
				// two switches from contradicting each other.
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
		 * Save both entry lists. Saves never overlap, since requests landing out
		 * of order could revert a newer change: a change during a save is saved
		 * by one more round. If a save fails or the password confirmation is
		 * cancelled, the switches return to the last confirmed state.
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
		 * Store an app config value through the provisioning API.
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

// Legend for the two switches per entry.
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
