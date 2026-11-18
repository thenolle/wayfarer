import type { App } from '@gambrel/core'
import type { LiveHub } from '../websocket/hub'

const MAX_REQUEST_BODY_BYTES = 1024 * 1024
const MAX_SOCKET_MESSAGE_BYTES = 1024
const SOCKET_PATH = '/ws'

export interface ServerOptions {
  readonly hostname: string
  readonly port: number
}

export interface LiveSocketOptions {
  readonly hub: LiveHub
  /** Returns a rejection response, or null when the upgrade may proceed. */
  readonly authorize: (request: Request) => Response | null
}

export interface RunningServer {
  readonly url: URL
  /** Stops listening and closes open connections. */
  stop(): Promise<void>
}

/**
 * Serves the application with `Bun.serve`, and upgrades `/ws` to a WebSocket
 * when live updates are configured.
 *
 * Bun is used directly rather than through `@gambrel/bun`'s `serve`, because
 * the upgrade needs the server object and `serve` does not expose it. Routing,
 * middleware and responses still come from `@gambrel/core`.
 *
 * Sockets are read-only: messages from clients are ignored and limited to 1 KiB.
 */
export function startServer(app: Pick<App, 'fetch'>, options: ServerOptions, live?: LiveSocketOptions): RunningServer {
  const server = Bun.serve({
    hostname: options.hostname,
    port: options.port,
    maxRequestBodySize: MAX_REQUEST_BODY_BYTES,
    fetch(request, bunServer) {
      if (live !== undefined && new URL(request.url).pathname === SOCKET_PATH) {
        const rejection = live.authorize(request)
        if (rejection !== null) return rejection
        if (live.hub.full) return new Response('Too many connections', { status: 503 })
        if (bunServer.upgrade(request)) return undefined
        return new Response('Expected a WebSocket upgrade', { status: 426 })
      }
      return app.fetch(request)
    },
    websocket: {
      maxPayloadLength: MAX_SOCKET_MESSAGE_BYTES,
      open(socket) {
        live?.hub.add(socket)
      },
      close(socket) {
        live?.hub.remove(socket)
      },
      message() {
        return undefined
      }
    }
  })
  return {
    url: server.url,
    stop: () => server.stop(true)
  }
}
