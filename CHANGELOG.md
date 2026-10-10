# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [1.0.0]

First public release, for Nextcloud 34 and 35.

### Added

- Restrict the "New" menu per public folder link: the link's owner chooses
  which entries visitors see, e.g. "New folder", text documents, whiteboards
  or "Add folder description". Works for the entries of any app, also those
  an app registers differently on public pages (e.g. OnlyOffice's), and for
  visitors in any language. Uploading always stays available.
- An "Upload files" button for visitors, right next to "Public share", on
  every screen size. Existing files are handled with Nextcloud's own
  conflict dialog. Upload-only links (file requests) keep Nextcloud's own
  upload page.
- Admin settings (Administration settings → Sharing): entries hidden by
  default on new and untouched links, entries forbidden on all links, and a
  switch for the "Upload files" button. The page lists every "New" menu
  entry, including those other apps add, once an administrator has opened
  the Files app.
