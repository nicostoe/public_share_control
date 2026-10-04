/*
 * SPDX-FileCopyrightText: 2026 Nico Störzbach
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

// Must match Application::ATTR_SCOPE / Application::ATTR_KEY in lib/AppInfo/Application.php
export const ATTRIBUTE_SCOPE = 'public_share_control'
// Value: HiddenEntryRef[] (see hiddenEntries.ts) the owner unchecked for
// this link. Absent = owner never made an explicit choice for this share, in
// which case DEFAULT_HIDDEN_ENTRIES_KEY applies instead; present-but-empty =
// owner explicitly chose to show everything.
export const ATTRIBUTE_KEY = 'hidden-create-entries'

// Must match Application::CONFIG_DEFAULT_HIDDEN_KEY / CONFIG_FORBIDDEN_KEY /
// CONFIG_QUICK_UPLOAD_ENABLED_KEY in lib/AppInfo/Application.php. Used both
// as the IAppConfig key (admin settings save/read) and, with the same
// string, as the IInitialState key each consuming page pushes it under.
export const DEFAULT_HIDDEN_ENTRIES_KEY = 'default-hidden-entries'
export const FORBIDDEN_ENTRIES_KEY = 'forbidden-entries'
export const QUICK_UPLOAD_ENABLED_KEY = 'quick-upload-enabled'
