# Resolvers and networking

## Resolver pipeline

Every URL passes through a resolver before it is downloaded. A resolver turns the URL the user typed into a `ResolvedSource`: the real file URL, the request headers (referer, cookies, user agent) the host expects and an optional `filenameHint`.

| Resolver              | Handles                                                                                                                                              |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BuzzheavierResolver` | `buzzheavier.com`, `bzzhr.to`, `bzzhr.co`                                                                                                            |
| `MediafireResolver`   | `mediafire.com` pages under `/file/`, `/file_premium/`, `/download/` and `/view/`                                                                    |
| `DropboxResolver`     | `dropbox.com/s/...` and `dropbox.com/scl/fi/...`; shared files only. Folders are refused with an explanation                                         |
| `PixeldrainResolver`  | `pixeldrain.com/u/<id>` for single files only; lists are refused and the name comes from the file's info                                             |
| `HuggingFaceResolver` | `huggingface.co/<owner>/<repo>/blob/<revision>/<path>`; public model, dataset and space files only. Gated or private files fail with HTTP 401 or 403 |
| `GitHubResolver`      | File pages (`github.com/<owner>/<repo>/blob/…`); uses the "Raw" link. Release assets and archives are already direct links.                          |
| `GoogleDriveResolver` | Public file links (`/file/d/…`, `/open?id=…`, `/uc?id=…`); folders are not supported. Quota or limit pages fail without a workaround.                |
| `OneDriveResolver`    | Personal links (`1drv.ms`, `onedrive.live.com`); business and SharePoint links need a sign-in and are not supported.                                 |
| `BrowserOnlyResolver` | DataNodes file pages; it refuses with an explanation because the host requires a CAPTCHA                                                             |
| `DirectResolver`      | any other `http` or `https` URL (fallback)                                                                                                           |

Resolvers are tried in registration order and the first whose `canResolve` accepts the URL is used. `createDefaultResolvers()` in `src/downloads/resolvers/registry.ts` is the single place to register one. To add a provider, implement `UrlResolver` in its own file and add it to that list. Nothing in the download engine changes.

## Rules for resolvers

- Use the `fetch` you are given. It enforces the network policy.
- Follow only links an ordinary visitor could follow. CAPTCHAs, challenges, logins and rate limits are not bypassed.
- Call `assertNoChallenge` on responses so a Cloudflare challenge produces a clear message instead of a bare 403.
- Read untrusted pages with `readTextLimited`, which bounds both size and time.
- Wrap status failures with `failAt` so the dashboard says which request failed. It keeps the error's class, status and retry delay.

> [!NOTE]
> The Buzzheavier and MediaFire resolvers were written against documented flows and page markup and tested with simulated responses. They have not been verified against the live services.

## File names

The final name is chosen in this order: the server's `Content-Disposition`, the resolver's `filenameHint`, then the last segment of the final URL. Names are sanitised.

## Link check

The dashboard's link check calls the same resolver registry and the same probe as a real download, then stops. It shares the network policy, so a link that cannot be downloaded fails the same way.

## Probing

Before downloading, Wayfarer sends `HEAD`, then `GET` with `Range: bytes=0-0`. Range support is accepted only when the server answers `206 Partial Content` with `Content-Range: bytes 0-0/<total>`. An `Accept-Ranges` header on its own is not trusted. Requests ask for `Accept-Encoding: identity` so that byte counts match the stored file.

For links that went through a resolver, the probe refuses a response whose content type is `text/html` unless it is sent as an attachment. That catches quota pages and expired links, which would otherwise be saved as a file. Plain direct links are not affected.

## Network policy and SSRF

By default, downloads may only contact public addresses. Loopback, private, link-local, carrier-grade NAT, multicast, documentation and reserved ranges are refused for IPv4 and IPv6, including IPv4-mapped IPv6 addresses. Hostnames are resolved and every returned address must be allowed. Only `http` and `https` are accepted, and URLs with embedded credentials are refused.

Redirects are followed by Wayfarer, not by `fetch`. Each hop is checked before it is requested, at most 10 hops are followed, and `Cookie` and `Authorization` headers are dropped when a redirect changes origin.

Trusted private destinations are allowed with `WAYFARER_ALLOW_PRIVATE_NETWORKS` (hostnames, IP addresses or IPv4 CIDR ranges).

### Limitation: DNS rebinding

The policy resolves a hostname to check it, but `fetch` resolves the name again when it connects. A malicious DNS server could return a public address for the check and a private one for the connection. Bun's `fetch` does not let a caller pin the address it connects to, so this gap cannot be closed in the application. If you need strong protection, run Wayfarer where outbound traffic to private networks is blocked at the network level, for example with firewall rules or a container network.
