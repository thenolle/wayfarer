import { join } from 'node:path'
import { buildClient, loadConfig } from '@gambrel/compiler'
import { copyStyles } from './assets'

const root = join(import.meta.dir, '..')
await buildClient({ root, config: await loadConfig(root), mode: 'development' })
await copyStyles(root)

const server = Bun.spawn([process.execPath, '--watch', 'src/index.ts'], { cwd: root, stdio: ['inherit', 'inherit', 'inherit'], env: { ...process.env, NODE_ENV: 'development' } })
process.on('SIGINT', () => server.kill())
await server.exited
