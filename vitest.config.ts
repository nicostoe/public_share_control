/*
 * SPDX-FileCopyrightText: 2026 Nico Störzbach
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { defineConfig } from 'vitest/config'

// Separate from vite.config.ts on purpose: the app build config writes
// bundles to js/ and css/, which unit tests must not do.
export default defineConfig({
	test: {
		environment: 'happy-dom',
		include: ['tests/unit/**/*.spec.ts'],
	},
})
