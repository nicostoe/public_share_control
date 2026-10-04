# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

First public release, for Nextcloud 34 and 35.

### Added

- Restrict the "New" menu per public folder link: the link's owner chooses
  which entries visitors see, e.g. "New folder", text documents, whiteboards
  or "Add folder description". Uploading always stays available.
- An "Upload files" button for visitors, right next to "Public share", on
  every screen size. Existing files are handled with Nextcloud's own
  conflict dialog.
- Admin settings (Administration settings → Sharing): entries hidden by
  default on new and untouched links, entries forbidden on all links, and a
  switch for the "Upload files" button.
