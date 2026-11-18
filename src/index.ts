import { installShutdownHandlers } from './app/lifecycle'
import { createRuntime } from './app/runtime'
import { ConfigError, loadConfig } from './config/config'
import { createHttpApp } from './http/app'
import { buildAllowedHosts } from './http/middleware/security'
import { authorizeSocket } from './http/web/socket-auth'
import { createSessionResolver } from './http/web/session-context'
import { startServer } from './server/server'
import type { RunningServer } from './server/server'
import { LiveHub } from './websocket/hub'
import { collectLiveSnapshot } from './websocket/snapshot'

async function main(): Promise<void> {
	const config = loadConfig()
	const runtime = await createRuntime(config)
	const sessions = createSessionResolver(config)
	const hub = new LiveHub(() => collectLiveSnapshot(runtime))
	const allowedHosts = buildAllowedHosts(config)
	let server: RunningServer | null = null
	installShutdownHandlers({
		async shutdown() {
			hub.stop()
			await server?.stop()
			await runtime.shutdown()
		}
	})
	const report = await runtime.start()
	server = startServer(createHttpApp(runtime, sessions), { hostname: config.host, port: config.port }, { hub, authorize: (request) => authorizeSocket(request, { allowedHosts, authToken: config.authToken, sessions }) })
	console.log(`[wayfarer] listening on ${server.url.href} (${report.resumed.length} resumed, ${report.toVerify.length} to verify, ${report.restarted.length} restarted)`)
}

main().catch((error: unknown) => {
	if (error instanceof ConfigError) console.error(`[wayfarer] configuration error: ${error.message}`)
	else console.error('[wayfarer] failed to start', error)
	process.exit(1)
})
