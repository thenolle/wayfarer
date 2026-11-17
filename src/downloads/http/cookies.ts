/**
 * A minimal in-memory cookie store for one resolution session.
 *
 * Cookies are stored per hostname and sent to the same hostname only. Path,
 * domain, expiry and `Secure` attributes are ignored, except that
 * `Max-Age=0` or a negative value deletes the cookie. That is enough to carry
 * a hosting site's session across the few requests a resolver makes.
 */
export class CookieJar {
  private readonly cookies = new Map<string, Map<string, string>>()

  store(url: URL, setCookies: readonly string[]): void {
    for (const entry of setCookies) {
      const [pair = '', ...attributes] = entry.split(';')
      const separator = pair.indexOf('=')
      if (separator <= 0) continue
      const name = pair.slice(0, separator).trim()
      const value = pair.slice(separator + 1).trim()
      const expired = attributes.some((attribute) => /^\s*max-age\s*=\s*(0|-\d+)\s*$/i.test(attribute))
      const forHost = this.cookies.get(url.hostname) ?? new Map<string, string>()
      if (expired) forHost.delete(name)
      else forHost.set(name, value)
      this.cookies.set(url.hostname, forHost)
    }
  }

  /**
   * The `Cookie` header value for `url`, or null when there are no cookies.
   */
  header(url: URL): string | null {
    const forHost = this.cookies.get(url.hostname)
    if (forHost === undefined || forHost.size === 0) return null
    return [...forHost].map(([name, value]) => `${name}=${value}`).join('; ')
  }
}
