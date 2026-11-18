/** @jsxImportSource @gambrel/view */
import type { LayoutProps, LoaderData, RouteParams } from '@gambrel/router'
import type { Child } from '@gambrel/view'
import type { loader } from './layout.server'

export default function AppLayout(props: LayoutProps<RouteParams, LoaderData<typeof loader>>): Child {
	const { data } = props
	return (
		<div class="shell">
			<header class="topbar">
				<a class="brand" href="/">Wayfarer</a>
				<div class="topbar-actions">
					<span class="live" title="Live updates"><span class="live-dot" /></span>
					<button type="button" class="btn btn-quiet" data-theme-toggle hidden>Theme</button>
					{data.authRequired ? (
						<form method="post" action="/actions/logout">
							<input type="hidden" name="csrf" value={data.csrf} />
							<button type="submit" class="btn btn-quiet">Sign out</button>
						</form>
					) : null}
				</div>
			</header>
			<main class="content" data-live-root>{props.children}</main>
		</div>
	)
}
