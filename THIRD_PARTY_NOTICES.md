# Third-party notices

Wayfarer itself is licensed under the PolyForm Strict License 1.0.0. This file
lists the other software it uses.

## Runtime

- **Gambrel** packages (`@gambrel/*`), PolyForm Strict License 1.0.0, same
  author as Wayfarer.
- **Bun**, the JavaScript runtime that runs Wayfarer and the base of the Docker
  image (`oven/bun`). Bun is MIT-licensed and statically links
  JavaScriptCore and parts of WebKit, which are LGPL-2 licensed, along with
  other bundled libraries. Bun's own licence page lists them:
  <https://bun.com/docs/project/license>.

## aria2

Wayfarer starts the separately installed `aria2c` program to download torrents. It is not bundled with, or linked into, Wayfarer. The Docker image installs it from the Debian package archive. aria2 is licensed under the GPL-2.0-or-later. See <https://github.com/aria2/aria2>.

## Development only (not part of the Docker image)

TypeScript and the `@types/*` and `bun-types` packages are used for type
checking. They are installed only in development.

## Checking licences

`bun run licenses` prints the licence of every installed package and fails when
one is not on the allow-list in `scripts/licenses.ts`. CI runs it on every
change.
