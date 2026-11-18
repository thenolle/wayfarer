# Dashboard internals

The dashboard is rendered by Gambrel on the server. Pages are file routes in `src/ui/routes`, and a build step turns them into route manifests under `.gambrel/` (generated, not committed). Components come from `@gambrel/components` and `@gambrel/icons`, and the stylesheet is the component package's styles plus `src/ui/styles/app.css`.

## Works without JavaScript

Every action is an ordinary HTML form posted to `/actions/...`. The server runs the action, stores a one-time message in the session and answers with a `303` redirect back to the page. Adding (including batches), bulk actions, pausing, resuming, cancelling, removing, priority, save location, search, sorting and the speed limit all work this way. Bulk checkboxes use the `form="bulk"` attribute, so no forms are nested. File downloads are plain links to `/files/<id>`.

## What JavaScript adds

- Live progress over WebSockets, an overall progress bar and progress in the tab title.
- The link check, which posts to `/actions/preview` and fills in the file name.
- Select all, copy folder path, keyboard shortcuts, the theme toggle and a collapsible speed-limit panel on small screens.
- A refresh of the sidebar, stats and list when a download changes status.

## Sessions and CSRF

- A session is created the first time a browser asks for a page. Its cookie is `HttpOnly` and `SameSite=Strict`, and `Secure` when the request arrived over HTTPS (directly or through a proxy that sets `X-Forwarded-Proto`).
- Every form carries a secret CSRF token tied to the session and checked in constant time. A missing or wrong token is answered with `403`.
- Requests that change state must also be same-origin; see [REST API](../api/rest.md). Because pages send `Referrer-Policy: same-origin`, browsers include the real `Origin` on form posts.
- With `WAYFARER_AUTH_TOKEN` set, visitors sign in at `/login`. The session id is replaced on sign-in. After five wrong tokens within a minute, further attempts are refused until the minute passes.
- Without a token, every session counts as signed in. This is only possible when the service listens on loopback.
- Sessions live in memory (up to 1000, 12 hours each) and end when the server restarts. The REST API ignores session cookies and accepts only the bearer token.

## Live updates

`/ws` upgrades to a WebSocket. The server checks the `Host` header, requires an `Origin` equal to the host (browsers always send it), and, when a token is configured, a signed-in session cookie. Scripts may connect with the bearer token instead.

While at least one dashboard is connected, the server reads download state every 500 ms and sends only what changed: first a snapshot, then updates containing changed downloads and the ids of removed ones. Messages carry byte counts, speed (an exponential moving average), time left, retry counts and per-segment progress. Clients are read-only, messages from them are ignored, and a client that cannot keep up is disconnected.

## Link check and "Show in folder"

`/actions/preview` runs the real resolver and probe for one link, without downloading, through the same network policy. At most four checks run at once.

`/actions/downloads/<id>/reveal` opens the system file manager at the file. It only works when the service listens on a loopback address, runs the command without a shell, and only for paths inside the configured save locations.

## What reaches the browser

Pages receive explicit view models: names, hosts, sizes, speeds, status, error messages and each download's folder. Resolved URLs, cookies and resolver details are never serialised into page data. The folder is shown to signed-in users only; the REST API never includes file system paths.

## Content Security Policy

Pages allow scripts, stylesheets, images, connections and form targets from the application itself. `style-src-attr 'unsafe-inline'` additionally allows `style` attributes, which the progress bars use.

## Limitations

- Sessions are not shared between server instances and do not survive restarts.
- Live updates poll the database; they are not event-driven.
- The page does not show timestamps.
