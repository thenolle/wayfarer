import { redirect } from '@gambrel/router'
import type { Loader, ParamsOf } from '@gambrel/router'
import { takeFlash } from '../../../http/web/session'
import type { PageContext } from '../../context.server'
import type { LoginData } from '../../view-model'

export const loader: Loader<ParamsOf<'/login'>, LoginData, PageContext> = (context) => {
  const session = context.context.session()
  if (context.context.runtime.config.authToken === null || session.authenticated) return redirect('/', 303)
  return { csrf: session.csrfToken, flash: takeFlash(session) }
}
