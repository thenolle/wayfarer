import { installShutdownHandlers } from './app/lifecycle'
import { createRuntime } from './app/runtime'
import { ConfigError, loadConfig } from './config/config'
import { createHttpApp } from './http/app'
import { startServer } from './server/server'
import type { RunningServer } from './server/server'

async function main(): Promise<void> {
	const config = loadConfig()
	const runtime = await createRuntime(config)
	let server: RunningServer | null = null
	installShutdownHandlers({
		async shutdown() {
			await server?.stop()
			await runtime.shutdown()
		}
	})
	const report = await runtime.start()
	server = startServer(createHttpApp(runtime), { hostname: config.host, port: config.port })
	console.log(`[wayfarer] listening on ${server.url.href} (${report.resumed.length} resumed, ${report.toVerify.length} to verify, ${report.restarted.length} restarted)`)
}

main().catch((error: unknown) => {
	if (error instanceof ConfigError) console.error(`[wayfarer] configuration error: ${error.message}`)
	else console.error('[wayfarer] failed to start', error)
	process.exit(1)
})
