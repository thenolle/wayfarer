import { redirect } from '@gambrel/router'
import type { Guard, Loader, RouteParams } from '@gambrel/router'
import type { PageContext } from '../../context.server'
import type { ShellData } from '../../view-model'

export const beforeLoad: Guard<RouteParams, PageContext> = (context) => context.context.session().authenticated ? undefined : redirect('/login', 303)

export const loader: Loader<RouteParams, ShellData, PageContext> = (context) => ({
	csrf: context.context.session().csrfToken,
	authRequired: context.context.runtime.config.authToken !== null
})
