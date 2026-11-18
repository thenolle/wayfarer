import { join } from 'node:path'
import { generateRoutes, loadConfig } from '@gambrel/compiler'

const root = join(import.meta.dir, '..')
const config = await loadConfig(root)
await generateRoutes({ root, routesDir: config.routesDir })
console.log('Route manifests generated')
