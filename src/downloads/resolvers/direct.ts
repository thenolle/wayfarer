import { DEFAULT_USER_AGENT } from '../http/headers'
import type { ResolvedSource, UrlResolver } from './types'

/**
 * Handles ordinary http and https file URLs.
 *
 * It does not contact the server itself. Redirect handling, size and range
 * discovery, validators and `Content-Disposition` filenames are done by the
 * shared guarded fetch and probe, so every resolver gets them.
 */
export class DirectResolver implements UrlResolver {
  readonly name = 'direct'

  canResolve(url: URL): boolean {
    return url.protocol === 'http:' || url.protocol === 'https:'
  }

  async resolve(url: URL): Promise<ResolvedSource> {
    return {
      resolver: this.name,
      url: url.href,
      headers: { 'User-Agent': DEFAULT_USER_AGENT },
      filenameHint: null
    }
  }
}
