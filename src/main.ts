/*
 * SPDX-FileCopyrightText: 2026 Nico Störzbach
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { INode } from '@nextcloud/files'
import type { ILinkShare, IShare } from '@nextcloud/sharing'
import type { ISidebarAction } from '@nextcloud/sharing/ui'

import { FileType } from '@nextcloud/files'
import { registerSidebarAction } from '@nextcloud/sharing/ui'
import { defineCustomElement } from 'vue'
import HideCreateNewEntry from './components/HideCreateNewEntry.vue'

const CUSTOM_ELEMENT_ID = 'oca_public_share_control-sharing_action'

const sharingAction: ISidebarAction = {
	id: 'public_share_control',

	element: CUSTOM_ELEMENT_ID,

	order: 30,

	enabled(share: IShare, node: INode) {
		// Only link shares (mail shares are link shares too) have a public page.
		if (!(share as ILinkShare).token) {
			return false
		}

		// Only folder shares have a "New" menu.
		return node.type === FileType.Folder
	},
}

if (!window.customElements.get(CUSTOM_ELEMENT_ID)) {
	const HideCreateNewEntryElement = defineCustomElement(HideCreateNewEntry, { shadowRoot: false })
	window.customElements.define(CUSTOM_ELEMENT_ID, HideCreateNewEntryElement)
}

registerSidebarAction(sharingAction)
