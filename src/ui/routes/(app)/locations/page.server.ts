import type { Loader, ParamsOf } from '@gambrel/router'
import type { PageContext } from '../../../context.server'
import { buildLocations } from '../../../server/locations.server'
import type { LocationsData } from '../../../view-model'

export const loader: Loader<ParamsOf<'/locations'>, LocationsData, PageContext> = (context) => buildLocations(context.context.runtime, context.context.session())
