import { hydrateRoutes } from '@gambrel/browser'
import { components, routes } from '../../.gambrel/manifest.client'
import { initEnhancements } from './enhance'
import { startLive } from './live'
import { registerServiceWorker } from './pwa'
import { initTheme } from './theme'

try { hydrateRoutes({ routes, components }) } catch (error) { console.error('[wayfarer] hydration failed; the server-rendered page stays as it is', error) }
initEnhancements()
initTheme()
startLive()
registerServiceWorker()
