/*
 * SPDX-FileCopyrightText: 2026 Nico Störzbach
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { getLoggerBuilder } from '@nextcloud/logger'

export const logger = getLoggerBuilder()
	.setApp('public_share_control')
	.detectUser()
	.build()
