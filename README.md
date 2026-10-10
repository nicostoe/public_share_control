# Public Share Control

Give admins and share owners more control over public folder links: hide
specific entries of the "New" menu per link, and give visitors a one-click
upload button.

## Contents

- [What it does](#what-it-does)
- [Requirements](#requirements)
- [Installation](#installation)
- [Uninstalling](#uninstalling)
- [Usage](#usage)
- [Admin settings](#admin-settings)
- [Good to know](#good-to-know)
- [Building from source](#building-from-source)
- [Releasing (maintainers)](#releasing-maintainers)
- [Support](#support)
- [License](#license)

## What it does

**1. Per-link "New" menu control.** Every public folder share's sharing
panel gets a dropdown listing each entry the visitor's "New" menu
would normally show (new folder, document, spreadsheet, whiteboard,
diagram, the Text app's "Add folder description", …), with a checkbox per
entry. All entries are selected (visible)
by default. Deselect individual ones — or use "Select all"/"Deselect all"
— to hide just those for visitors of *that specific link*. "Upload from
device" can't be deselected and is always available.

This is per-link by default: other links keep showing the full menu unless
configured otherwise. An admin can additionally set instance-wide defaults
and restrictions — see [Admin settings](#admin-settings) below.

**2. Quick-upload button.** Every public folder share with upload
permission gets an "Upload files" button right next to "Public share" in
the toolbar, so visitors don't need to open the "New" menu just to upload a
file. Shown at every screen width, phone to desktop. Upload-only links (file
requests) keep Nextcloud's own upload page.

## Requirements

- Nextcloud 34 or 35.
- PHP as required by your Nextcloud version.

## Installation

Download `public_share_control-<version>.tar.gz` from the
[releases page](https://github.com/nicostoe/public_share_control/releases),
extract it into your apps directory (`apps/` or your custom apps path), make
it belong to the user your web server runs as, then enable it on the
**Apps** page or with `occ`:

```bash
tar -xzf public_share_control-<version>.tar.gz -C /path/to/nextcloud/apps/
chown -R www-data:www-data /path/to/nextcloud/apps/public_share_control
sudo -u www-data php /path/to/nextcloud/occ app:enable public_share_control
```

The commands in this README use `www-data`, the web server user on
Debian and Ubuntu. Other systems use another one, e.g. `apache` (Fedora,
RHEL), `http` (Arch) or `wwwrun` (openSUSE); in Docker, run `occ` with
`docker exec -u www-data <container> php occ …`.

To **update**, replace the `public_share_control` folder with the new one
the same way, then run `occ upgrade` (or open the admin page, which offers
the update).

No build step needed — the package ships pre-built JS/CSS.

## Uninstalling

Disable or remove the app as usual (on the Apps page, or with
`occ app:disable` / `occ app:remove public_share_control`). Public links
behave like plain Nextcloud again right away: the full "New" menu and no
extra "Upload files" button.

What stays behind has no effect:

- Links whose owner changed the "New" menu selection keep it as a small
  share attribute. Without the app nothing reads it; it goes away when the
  link is deleted, and new links never get it. If you install the app
  again, these selections apply again.
- The admin settings and the list of "New" menu entries found in the Files
  app stay in the app config, so a reinstall keeps them too. To delete them:

  ```bash
  sudo -u www-data php occ config:app:delete public_share_control default-hidden-entries
  sudo -u www-data php occ config:app:delete public_share_control forbidden-entries
  sudo -u www-data php occ config:app:delete public_share_control quick-upload-enabled
  sudo -u www-data php occ config:app:delete public_share_control discovered-entries
  ```

## Usage

1. Share a folder as usual: **Share → Create link**, with permission
   **"Allow upload and editing"** (not "File request" — that mode doesn't
   show visitors a file list or a "New" menu in the first place).
2. Open the link's details (where password, expiration, "Hide download"
   etc. also live) and expand **Advanced settings**. A **Restrict "New" menu**
   option appears there with a button listing each entry — checked by
   default, unless an admin configured instance-wide defaults (see below).
   Uncheck what you don't want visitors to create, then click the sidebar's
   own **"Update share"** button to save — same button as every other
   sharing setting, no separate save action.
3. Visitors of that link now see every "New" menu entry except the ones
   you unchecked (plus anything an admin forbade instance-wide, which is
   always hidden and can't be re-enabled per link). "Upload from device" is
   unaffected.
4. The "Upload files" button next to "Public share" needs no setup — it
   appears automatically on every folder share that allows uploads (except
   upload-only file requests), unless an admin turned it off instance-wide.

## Admin settings

An admin can go to **Settings → Sharing → Public share control** to set,
instance-wide:

- **Hidden by default**: entries that start out unchecked for any share
  whose owner hasn't made their own explicit choice yet. The owner can still
  turn any of them back on for a specific link — this only changes the
  starting point, not a hard restriction. A share the owner already
  explicitly configured (even just clicking "Update share" once with
  everything checked) is unaffected by later changes to this list.
- **Forbidden**: entries that are always hidden, everywhere, with no owner
  override — shown as disabled checkboxes in the sidebar dropdown. Applies
  immediately to every existing link as well.
- Whether the quick-upload button appears at all (on by default).

The page lists every entry of the "New" menu. Entries created from
templates (documents, spreadsheets, diagrams, whiteboards, …) come from the
server; all others — "New folder", the Text app's "Add folder description",
OnlyOffice's "New PDF form" and whatever other apps add — appear once an
administrator has opened the Files app, where the app notes which entries
are registered. Entries of apps installed later show up the same way.

Entries from apps installed later are visible by default everywhere — all
lists are "what to hide" lists, so anything not on one stays visible until
an owner or admin adds it.

## Good to know

- **This hides UI, it doesn't change permissions.** The share still has
  the "create" capability under the hood (uploads wouldn't work otherwise
  — Nextcloud has no separate permission for "upload a file" vs. "create a
  folder/document"). A technically inclined visitor could still create a
  folder via WebDAV directly. Treat this the same way you'd treat
  Nextcloud's own built-in "Hide download" toggle: a UI-level nudge for
  normal use, not a hard security boundary.
- The dropdown only appears on **folder** shares — file
  shares and non-link shares never had a "New" menu to control.
- Public links (`/s/…`) aren't intercepted by the official Nextcloud
  Android/iOS apps, so visitors always land in their normal mobile
  browser — both features work there exactly as on desktop.
- Two core entries that can never apply to an anonymous visitor
  ("Create file request", "Create templates folder" — both tied to a
  logged-in account) are filtered out of the dropdown automatically.

## Building from source

```bash
npm ci
npm run build
scripts/package.sh   # → build/artifacts/public_share_control-<version>.tar.gz
```

Requires Node 24 (see `engines` in `package.json`); `npm run lint` needs at
least Node 22.14.

## Releasing (maintainers)

- **While developing:** commit and push as usual, and add every change users
  will notice to `CHANGELOG.md` under `## [Unreleased]`. Pushes to `main` only
  run CI — nothing is released.
- **Release candidate**, to test a version on a real instance first:

  ```bash
  scripts/bump-version.sh 1.1.0-rc.1
  git commit -am "Release 1.1.0-rc.1" && git push   # wait for CI to pass
  git tag -a v1.1.0-rc.1 -m "Public Share Control 1.1.0-rc.1" && git push origin v1.1.0-rc.1
  ```

  Install the package from the pre-release on GitHub and test it. Another
  round is `-rc.2`, `-rc.3`, …
- **Final release:**

  ```bash
  scripts/bump-version.sh 1.1.0
  git commit -am "Release 1.1.0" && git push           # wait for CI to pass
  git tag -a v1.1.0 -m "Public Share Control 1.1.0" && git push origin v1.1.0
  ```

- Pushing the tag runs all checks, then publishes a GitHub release with the
  package attached. **Its notes come from `CHANGELOG.md`**: the version's
  section, or `## [Unreleased]` for a pre-release. The tag message is only
  stored with the tag.
- **Only final releases go to the Nextcloud app store**, signed and uploaded
  automatically. Pre-releases stay on GitHub, unsigned.

Details, e.g. which versions `bump-version.sh` accepts: "Releasing" in
`AGENTS.md`.

## Support

Issues: <https://github.com/nicostoe/public_share_control/issues>

## License

AGPL-3.0-or-later, see [LICENSE](LICENSE).
