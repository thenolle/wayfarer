# Security model

Wayfarer is built for one user or a small trusted group. These are its protections, and the limits you should know.

## Defaults

- It listens on `127.0.0.1`. Any other address requires `WAYFARER_AUTH_TOKEN` (16 or more characters), and wildcard addresses also require `WAYFARER_ALLOWED_HOSTS`.
- The `Host` header must be a known name, which blocks DNS rebinding of the service itself.
- State-changing requests must be same-origin. Browsers that send `Origin: null` are accepted only together with `Sec-Fetch-Site: same-origin`.

## Sessions and forms

- The session cookie is `HttpOnly` and `SameSite=Strict`, and `Secure` over HTTPS.
- Every form carries a CSRF token that is compared in constant time.
- Sign-in replaces the session id and is throttled after repeated wrong tokens.

## Browser protections

Pages send a Content-Security-Policy that limits scripts, styles, connections and forms to the application itself, plus `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`, `Permissions-Policy` and `Cross-Origin-Opener-Policy`.

## Network access

- Downloads can reach public addresses only. Loopback, private, link-local and reserved ranges are refused, including IPv4-mapped IPv6 forms.
- Every redirect hop is checked, and credentials are dropped when a redirect changes origin.
- Pages read from untrusted hosts are limited in size and time.
- Webhook deliveries use the same network policy and never follow redirects. Exports contain your links, so treat them as private.

## Files

- Clients never supply paths for individual files. Signed-in users can add save locations (folders), so only give dashboard access to people you trust to write anywhere Wayfarer can.
- Served files are attachments with `nosniff` and `Content-Security-Policy: sandbox`.
- Save locations are named by you; subfolders cannot contain `..`.

## Torrents

Torrent peers are chosen by the swarm, and aria2 connects to them directly. The network policy and `WAYFARER_ALLOW_PRIVATE_NETWORKS` apply to `.torrent` links that Wayfarer fetches, but not to peer connections. aria2's control port listens only on `127.0.0.1`, on a random port, and requires a random secret that is never written to disk or shown. Stored `.torrent` files and aria2's log live under `<data directory>/torrents`. Treat them like the rest of the data directory, because a `.torrent` file from a private tracker contains your personal announce URL.

## Known limits

- **DNS rebinding of downloads.** The destination check resolves a name, but the HTTP client resolves it again when it connects. Block private networks at the network level if you need a strong guarantee. See [Resolvers and networking](architecture/resolvers-and-networking.md).
- **Shared sign-in throttle.** After repeated wrong tokens, sign-in pauses for everyone.
- **Inline style attributes** are allowed because progress bars use them. Scripts and style sheets stay limited to the application's own files.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting, as described in [SECURITY.md](../SECURITY.md). Do not open public issues for vulnerabilities.
