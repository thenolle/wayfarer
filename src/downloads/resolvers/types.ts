import type { GuardedFetch } from '../http/guarded-fetch'

/**
 * Where and how to download a file, as determined by a resolver.
 *
 * `headers` are sent with every request for the file, including the probe and
 * every segment. They may contain session cookies and must stay server-side.
 */
export interface ResolvedSource {
  readonly resolver: string
  readonly url: string
  readonly headers: Readonly<Record<string, string>>
  readonly filenameHint: string | null
}

export interface ResolverContext {
  /** Network access that enforces the SSRF policy. Resolvers must use it for every request. */
  readonly fetch: GuardedFetch
  readonly signal: AbortSignal
}

/**
 * Turns a user-supplied URL into a downloadable source.
 *
 * Add a provider by implementing this interface in its own module and
 * registering it in `createDefaultResolvers`. Resolvers are tried in
 * registration order and the first whose `canResolve` returns true wins; the
 * direct resolver is the fallback. The download engine never needs to change.
 *
 * Resolvers may only follow links a normal visitor would follow. They must not
 * bypass CAPTCHAs, logins, paywalls or rate limits, and must surface HTTP
 * errors (including 429) as `HttpStatusError` so the engine can back off.
 */
export interface UrlResolver {
  readonly name: string
  canResolve(url: URL): boolean
  resolve(url: URL, context: ResolverContext): Promise<ResolvedSource>
}
