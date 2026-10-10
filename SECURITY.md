# Security policy

## Reporting a vulnerability

Please report vulnerabilities **privately**, not in a public issue:
[report a vulnerability](https://github.com/nicostoe/public_share_control/security/advisories/new)
(GitHub's private vulnerability reporting). Only the maintainer sees the
report. Please include the Nextcloud and app versions and the steps to
reproduce it.

You'll get an answer as soon as possible. Once a fix is released, the
advisory is published, crediting you unless you prefer otherwise.

Vulnerabilities in Nextcloud itself go to Nextcloud's own
[security program](https://hackerone.com/nextcloud), not here.

## Supported versions

Only the latest release gets security fixes.

## By design, not a vulnerability

Hiding entries of the "New" menu changes what visitors see, not what a
link permits: on a link that allows uploads, visitors can still create
files and folders by other means, e.g. WebDAV. Nextcloud has no separate
permission for that.
