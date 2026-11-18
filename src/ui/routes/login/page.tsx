/** @jsxImportSource @gambrel/view */
import type { LoaderData, PageProps, ParamsOf } from '@gambrel/router'
import type { Child } from '@gambrel/view'
import { Flash } from '../../components/chrome'
import type { loader } from './page.server'

export default function LoginPage(props: PageProps<ParamsOf<'/login'>, LoaderData<typeof loader>>): Child {
	const { data } = props
	if ('csrf' in data === false) return null
	return (
		<div class="shell narrow">
			<main class="content">
				<h1 class="brand">Wayfarer</h1>
				<p class="muted">Enter the access token to continue.</p>
				<Flash flash={data.flash} />
				<form class="card form-stack" method="post" action="/actions/login">
					<input type="hidden" name="csrf" value={data.csrf} />
					<label for="token">Access token</label>
					<input id="token" name="token" type="password" autocomplete="current-password" required />
					<button type="submit" class="btn btn-primary">Sign in</button>
				</form>
			</main>
		</div>
	)
}
