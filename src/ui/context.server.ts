import type { Context } from '@gambrel/core'
import type { ApiRuntime } from '../http/api/context'
import type { Session } from '../http/web/session'

/**
 * What page guards and loaders receive. The session is looked up on demand so
 * requests that never need one, such as unknown URLs, do not create sessions.
 */
export interface PageContext extends Context {
  readonly runtime: ApiRuntime
  readonly session: () => Session
}
