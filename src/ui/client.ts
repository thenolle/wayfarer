import { hydrateRoutes } from '@gambrel/browser'
import { components, routes } from '../../.gambrel/manifest.client'
import { startLive } from './live'
import { initTheme } from './theme'

try { hydrateRoutes({ routes, components }) } catch (error) { console.error('[wayfarer] hydration failed; the server-rendered page stays as it is', error) }
initTheme()
startLive()
