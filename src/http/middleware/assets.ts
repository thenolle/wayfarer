import { extname } from 'node:path'
import type { Middleware } from '@gambrel/core'
import { withHeaders } from './headers'

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2'
}

/**
 * Gives built assets an explicit, correct content type. Browsers refuse to run
 * scripts or apply styles whose type is missing or `text/plain` when
 * `X-Content-Type-Options: nosniff` is set, so this must not be left to
 * inference. Register it before the static file middleware so it wraps it.
 */
export function assetContentTypes(prefix: string = '/assets/'): Middleware {
  return async (context, next) => {
    const response = await next()
    if (!context.url.pathname.startsWith(prefix) || !response.ok) return response
    const type = CONTENT_TYPES[extname(context.url.pathname).toLowerCase()]
    if (type === undefined) return response
    const current = response.headers.get('content-type')
    if (current !== null && !current.toLowerCase().startsWith('text/plain')) return response
    return withHeaders(response, (headers) => headers.set('content-type', type))
  }
}
