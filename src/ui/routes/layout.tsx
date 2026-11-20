/** @jsxImportSource @gambrel/view */
import type { LayoutProps, RouteParams } from '@gambrel/router'
import type { Child } from '@gambrel/view'

export default function RootLayout(props: LayoutProps<RouteParams, null>): Child {
	return (
		<html lang="en">
			<head>
				<meta charset="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
				<meta name="color-scheme" content="light dark" />
				<meta name="theme-color" content="#b93168" media="(prefers-color-scheme: light)" />
				<meta name="theme-color" content="#1a1316" media="(prefers-color-scheme: dark)" />
				<title>Wayfarer</title>
				<link rel="manifest" href="/manifest.webmanifest" />
				<link rel="apple-touch-icon" href="/icon-192.png" />
				<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml" />
				<link rel="stylesheet" href="/assets/app.css" />
			</head>
			<body>{props.children}</body>
		</html>
	)
}
