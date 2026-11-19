import type { ApiRuntime } from '../../http/api/context'
import { takeFlash } from '../../http/web/session'
import type { Session } from '../../http/web/session'
import type { LocationsData } from '../view-model'

export function buildLocations(runtime: ApiRuntime, session: Session): LocationsData {
	return {
		csrf: session.csrfToken,
		flash: takeFlash(session),
		locations: runtime.locations.list().map((location) => ({ ...location, downloads: runtime.locations.downloadsIn(location) }))
	}
}
