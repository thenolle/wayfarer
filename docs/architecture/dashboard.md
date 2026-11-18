# Dashboard

The dashboard is rendered by Gambrel on the server. Pages are file routes in
`src/ui/routes`, and a build step turns them into route manifests under
`.gambrel/` (generated, not committed). Components are plain JSX and run both on
the server and in the browser.

## Works without JavaScript

Every action is an ordinary HTML form posted to `/actions/...`. The server runs
the action, stores a one-time message in the session and answers with a `303`
redirect back to the page. Adding, pausing, resuming, cancelling, removing,
changing priority and setting the bandwidth limit all work this way. File
downloads are plain links to `/files/<id>`.

JavaScript adds three things: live progress, a theme toggle, and a quick reload
of the list when a download changes status.

## Sessions and CSRF

- A session is created the first time a browser asks for a page. Its cookie is
  `HttpOnly` and `SameSite=Strict`, and `Secure` when the request arrived over
  HTTPS (directly or through a proxy that sets `X-Forwarded-Proto`).
- Every form carries a secret CSRF token tied to the session and checked in
  constant time. A missing or wrong token is answered with `403`.
- Requests that change state must also be same-origin; see [REST API](../api/rest.md).
- With `WAYFARER_AUTH_TOKEN` set, visitors sign in at `/login`. The session id is
  replaced on sign-in. After five wrong tokens within a minute, further attempts
  are refused until the minute passes.
- Without a token, every session counts as signed in. This is only possible
  when the service listens on loopback.
- Sessions live in memory (up to 1000, 12 hours each) and end when the server
  restarts. The REST API ignores session cookies and accepts only the bearer
  token.

## Live updates

`/ws` upgrades to a WebSocket. The server checks the `Host` header, requires an
`Origin` equal to the host (browsers always send it), and, when a token is
configured, a signed-in session cookie. Scripts may connect with the bearer
token instead.

While at least one dashboard is connected, the server reads download state every
500 ms and sends only what changed: first a snapshot, then updates containing
changed downloads and the ids of removed ones. Messages carry byte counts,
speed (an exponential moving average), time left, retry counts and per-segment
progress. Clients are read-only, messages from them are ignored, and a client that cannot keep
up is disconnected.

When a download changes status, the page reloads the list and tab bar from the
server so buttons and tabs stay correct.

## What reaches the browser

Pages receive explicit view models: names, sizes, speeds, status and error
messages. File system paths, resolved URLs, cookies and resolver details are
never serialised into page data.

## Limitations

- Sessions are not shared between server instances and do not survive restarts.
- Live updates poll the database; they are not event-driven.
- The page does not show timestamps.
