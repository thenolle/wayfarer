# Resolvers and networking

## Resolver pipeline

Every URL passes through a resolver before it is downloaded. A resolver turns
the URL the user typed into a `ResolvedSource`: the real file URL plus the
request headers (referer, cookies, user agent) the host expects.

| Resolver              | Handles                                    |
| --------------------- | ------------------------------------------ |
| `BuzzheavierResolver` | `buzzheavier.com`, `bzzhr.to`, `bzzhr.co`  |
| `DirectResolver`      | any other `http` or `https` URL (fallback) |

Resolvers are tried in registration order and the first whose `canResolve`
accepts the URL is used. `createDefaultResolvers()` in
`src/downloads/resolvers/registry.ts` is the single place to register one.
To add a provider, implement `UrlResolver` in its own file and add it to that
list. Nothing in the download engine changes.

Resolvers must use the `fetch` they are given, which enforces the network
policy, and must only follow links an ordinary visitor could follow. CAPTCHAs,
logins and rate limits are not bypassed; an error response is reported as is.

The Buzzheavier resolver was written against the documented flow (landing
page, `/download` endpoint, `HX-Redirect`) and tested with simulated responses.
It has not been verified against the live service.

## Probing

Before downloading, Wayfarer sends `HEAD`, then `GET` with `Range: bytes=0-0`.
Range support is accepted only when the server answers `206 Partial Content`
with `Content-Range: bytes 0-0/<total>`. An `Accept-Ranges` header on its own
is not trusted. Requests ask for `Accept-Encoding: identity` so that byte
counts match the stored file.

## Network policy and SSRF

By default, downloads may only contact public addresses. Loopback, private,
link-local, carrier-grade NAT, multicast, documentation and reserved ranges
are refused for IPv4 and IPv6, including IPv4-mapped IPv6 addresses. Hostnames
are resolved and every returned address must be allowed. Only `http` and
`https` are accepted, and URLs with embedded credentials are refused.

Redirects are followed by Wayfarer, not by `fetch`. Each hop is checked before
it is requested, at most 10 hops are followed, and `Cookie` and
`Authorization` headers are dropped when a redirect changes origin.

Trusted private destinations are allowed with `WAYFARER_ALLOW_PRIVATE_NETWORKS`
(hostnames, IP addresses or IPv4 CIDR ranges).

### Limitation: DNS rebinding

The policy resolves a hostname to check it, but `fetch` resolves the name again
when it connects. A malicious DNS server could return a public address for the
check and a private one for the connection. Bun's `fetch` does not let a caller
pin the address it connects to, so this gap cannot be closed in the application.
If you need strong protection, run Wayfarer where outbound traffic to private
networks is blocked at the network level, for example with firewall rules or a
container network.
