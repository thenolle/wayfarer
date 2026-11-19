/** @jsxImportSource @gambrel/view */
import { Button } from '@gambrel/components'
import { Download, LogOut, Moon, Sun } from '@gambrel/icons'
import type { LayoutProps, LoaderData, RouteParams } from '@gambrel/router'
import type { Child } from '@gambrel/view'
import type { loader } from './layout.server'

export default function AppLayout(props: LayoutProps<RouteParams, LoaderData<typeof loader>>): Child {
	const { data } = props
	return (
		<div class="shell">
			<header class="topbar">
				<a class="brand" href="/">
					<span class="brand-mark"><Download size={18} /></span>
					<span class="brand-name">Wayfarer</span>
				</a>
				<div class="topbar-actions">
					<a class="gb-button gb-button-ghost gb-button-sm" href="/locations">Locations</a>
					<span class="live" title="Live updates"><span class="live-dot" /></span>
					<Button variant="ghost" size="icon" data-theme-toggle data-js-only aria-label="Toggle theme">
						<Sun class="theme-sun" size={18} />
						<Moon class="theme-moon" size={18} />
					</Button>
					{data.authRequired ? (
						<form method="post" action="/actions/logout">
							<input type="hidden" name="csrf" value={data.csrf} />
							<Button type="submit" variant="ghost" size="sm"><LogOut size={16} /> Sign out</Button>
						</form>
					) : null}
				</div>
			</header>
			<main class="content" data-live-root>{props.children}</main>
		</div>
	)
}
