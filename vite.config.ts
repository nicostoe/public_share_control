/*
 * SPDX-FileCopyrightText: 2026 Nico Störzbach
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createAppConfig } from '@nextcloud/vite-config'

export default createAppConfig(
	{
		main: 'src/main.ts',
		public: 'src/public.ts',
		settings: 'src/settings-admin.ts',
	},
	{
		inlineCSS: false,
		emptyOutputDirectory: {
			additionalDirectories: ['css'],
		},
	},
)
