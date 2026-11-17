import { installShutdownHandlers } from './app/lifecycle'
import { createRuntime } from './app/runtime'
import { ConfigError, loadConfig } from './config/config'

async function main(): Promise<void> {
	const config = loadConfig()
	const runtime = await createRuntime(config)
	installShutdownHandlers(runtime)
	const report = await runtime.start()
	console.log(`[wayfarer] started: ${report.resumed.length} resumed, ${report.toVerify.length} to verify, ${report.restarted.length} restarted`)
	setInterval(() => undefined, 2_147_483_647)
}

main().catch((error: unknown) => {
	if (error instanceof ConfigError) console.error(`[wayfarer] configuration error: ${error.message}`)
	else console.error('[wayfarer] failed to start', error)
	process.exit(1)
})
