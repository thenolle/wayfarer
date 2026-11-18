import { defineConfig } from '@gambrel/compiler'

export default defineConfig({
  routesDir: 'src/ui/routes',
  serverEntry: 'src/index.ts',
  clientEntry: 'src/ui/client.ts',
  outDir: 'dist'
})
