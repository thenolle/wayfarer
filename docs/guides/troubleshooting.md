# Troubleshooting

## Quick answers

| Symptom                                                       | Likely cause and fix                                                                                                                                    |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Forms answer `forbidden_origin`                               | A proxy changed or removed `Origin` or `Host`. Forward both unchanged.                                                                                  |
| Pages answer `421`                                            | The `Host` is not in `WAYFARER_ALLOWED_HOSTS`.                                                                                                          |
| The page has no styles and no live updates                    | The browser files were not found. Run `bun run build` and check the startup line `serving browser assets from ...`, or set `WAYFARER_CLIENT_DIRECTORY`. |
| `Landing page: The server responded with HTTP 403`            | The host blocks non-browser clients, often with a Cloudflare challenge. See [Supported hosts](resolvers.md).                                            |
| `... is protected by a Cloudflare challenge`                  | Same cause. Use the browser workaround on that page.                                                                                                    |
| `File server <host>: ... HTTP 403`                            | The file link expired or needs headers Wayfarer does not have. Get a fresh link.                                                                        |
| `… answered with a web page instead of the file`              | The link expired, needs a browser, or the host's download limit was reached. Get a fresh link, or try later.                                            |
| `That folder cannot be created or written to`                 | The chosen location does not exist or is not writable. Check `WAYFARER_LOCATIONS` and permissions.                                                      |
| **Show in folder** is missing or fails                        | It only works when Wayfarer listens on a loopback address and a file manager is available.                                                              |
| `… is already in your downloads` / `… was already downloaded` | The link is already in the list, or its file is still on disk. Remove the old entry, or add it anyway.                                                  |
| `blocked_destination`                                         | The address is private or reserved. Allow it with `WAYFARER_ALLOW_PRIVATE_NETWORKS` only if you trust it.                                               |
| Sign-in loops                                                 | Cookies are blocked, or the proxy does not forward `Host`.                                                                                              |
| No live progress                                              | The proxy does not pass WebSocket upgrades on `/ws`.                                                                                                    |
| Docker cannot write to a mounted folder                       | The folder must be writable by user ID 1000.                                                                                                            |

## Console messages from other sites

Messages about inline scripts, fingerprinting or third-party cookies usually come from the pages of the host you were visiting or from a browser extension, not from Wayfarer. Check by opening the dashboard in a private window with extensions disabled.

## Still stuck?

Collect the startup lines, the download's error message and, for Buzzheavier links, the output of `scripts/trace-resolver.ts`. Never include your auth token.
