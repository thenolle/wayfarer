import type { Runtime } from '../../app/runtime'

/**
 * The part of the runtime the HTTP layer uses.
 */
export type ApiRuntime = Pick<Runtime,
	| 'config'
	| 'downloads'
	| 'segments'
	| 'scheduler'
	| 'intake'
	| 'limiter'
	| 'locations'
	| 'setBandwidthLimit'
	| 'inspect'
>
