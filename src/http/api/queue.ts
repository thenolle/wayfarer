import { json } from '@gambrel/core'
import type { App } from '@gambrel/core'
import { isQueueOperation, QUEUE_OPERATIONS, runQueueOperation } from '../../downloads/queue'
import type { ApiRuntime } from './context'
import { ApiError } from './errors'

/**
 * Registers `POST /api/queue/:operation` for whole-queue operations. The
 * response is `{ "data": { "operation", "matched", "done" } }`.
 */
export function registerQueueRoutes(app: App, runtime: ApiRuntime): void {
	app.post('/api/queue/:operation', async (context) => {
		const operation = context.params.operation
		if (!isQueueOperation(operation)) throw new ApiError(400, 'invalid_request', `Unknown operation. Use one of: ${QUEUE_OPERATIONS.join(', ')}`)
		return json({ data: await runQueueOperation(runtime, operation) })
	})
}
