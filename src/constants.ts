/*
 * SPDX-FileCopyrightText: 2026 Nico Störzbach
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

// Must match Application::ATTR_SCOPE / ATTR_KEY in lib/AppInfo/Application.php.
// The attribute holds HiddenEntryRef[]; when it's absent, the admin defaults
// apply.
export const ATTRIBUTE_SCOPE = 'public_share_control'
export const ATTRIBUTE_KEY = 'hidden-create-entries'

// Must match the CONFIG_* keys in lib/AppInfo/Application.php. Also used as
// the initial state keys.
export const DEFAULT_HIDDEN_ENTRIES_KEY = 'default-hidden-entries'
export const FORBIDDEN_ENTRIES_KEY = 'forbidden-entries'
export const QUICK_UPLOAD_ENABLED_KEY = 'quick-upload-enabled'
