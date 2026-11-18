import type { Loader, ParamsOf } from '@gambrel/router'
import type { PageContext } from '../../context.server'
import { buildDashboard } from '../../server/dashboard.server'
import type { DashboardData } from '../../view-model'

export const loader: Loader<ParamsOf<'/'>, DashboardData, PageContext> = (context) => buildDashboard(context.context.runtime, context.context.session(), context.search)
