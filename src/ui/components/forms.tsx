/** @jsxImportSource @gambrel/view */
import type { Child } from '@gambrel/view'
import { formatBytes } from '../format'
import type { FilterName } from '../view-model'

type Tone = 'primary' | 'quiet' | 'danger'

function CsrfFields(props: { csrf: string; filter: FilterName }): Child {
	return (
		<>
			<input type="hidden" name="csrf" value={props.csrf} />
			<input type="hidden" name="filter" value={props.filter} />
		</>
	)
}

export function AddForm(props: { csrf: string; filter: FilterName }): Child {
	return (
		<form class="card add-form" method="post" action="/actions/add">
			<CsrfFields csrf={props.csrf} filter={props.filter} />
			<label class="sr-only" for="add-url">Download URL</label>
			<input id="add-url" name="url" type="url" placeholder="Paste a download link" required autocomplete="off" />
			<button type="submit" class="btn btn-primary">Add download</button>
			<details class="add-options">
				<summary>Options</summary>
				<div class="options-grid">
					<label for="add-priority">Priority (-100 to 100)</label>
					<input id="add-priority" name="priority" type="number" min="-100" max="100" step="1" value={0} />
					<label for="add-sha256">SHA-256 checksum</label>
					<input id="add-sha256" name="sha256" type="text" placeholder="Optional" autocomplete="off" />
				</div>
			</details>
		</form>
	)
}

export function BandwidthForm(props: { csrf: string; filter: FilterName; bytesPerSecond: number }): Child {
	const limited = props.bytesPerSecond > 0
	const mib = props.bytesPerSecond / (1024 * 1024)
	return (
		<section class="card bandwidth" aria-labelledby="bandwidth-title">
			<div>
				<h2 id="bandwidth-title">Bandwidth limit</h2>
				<p class="muted">{limited ? `Limited to ${formatBytes(props.bytesPerSecond)}/s across all downloads.` : 'No limit.'}</p>
			</div>
			<form method="post" action="/actions/bandwidth" class="inline-form">
				<CsrfFields csrf={props.csrf} filter={props.filter} />
				<label class="sr-only" for="bandwidth-amount">Speed</label>
				<input id="bandwidth-amount" name="amount" type="number" min="0" step="any" value={limited ? Number(mib.toFixed(2)) : 0} />
				<label class="sr-only" for="bandwidth-unit">Unit</label>
				<select id="bandwidth-unit" name="unit">
					<option value="kib">KiB/s</option>
					<option value="mib" selected>MiB/s</option>
				</select>
				<button type="submit" class="btn">Set limit</button>
			</form>
			<p class="muted hint">Use 0 for no limit.</p>
		</section>
	)
}

export function ActionButton(props: { id: string, action: string, label: string, csrf: string, filter: FilterName, tone?: Tone }): Child {
	return (
		<form class="inline" method="post" action={`/actions/downloads/${props.id}/${props.action}`}>
			<CsrfFields csrf={props.csrf} filter={props.filter} />
			<button type="submit" class={`btn btn-${props.tone ?? 'quiet'}`}>{props.label}</button>
		</form>
	)
}

export function PriorityForm(props: { id: string; priority: number; csrf: string; filter: FilterName }): Child {
	return (
		<form class="inline priority" method="post" action={`/actions/downloads/${props.id}/priority`}>
			<CsrfFields csrf={props.csrf} filter={props.filter} />
			<label class="sr-only" for={`priority-${props.id}`}>Priority</label>
			<input id={`priority-${props.id}`} name="priority" type="number" min="-100" max="100" step="1" value={props.priority} />
			<button type="submit" class="btn btn-quiet">Set priority</button>
		</form>
	)
}
