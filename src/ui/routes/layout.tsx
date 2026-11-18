/** @jsxImportSource @gambrel/view */
import type { LayoutProps, RouteParams } from '@gambrel/router'
import type { Child } from '@gambrel/view'

export default function RootLayout(props: LayoutProps<RouteParams, null>): Child {
	return (
		<html lang="en">
			<head>
				<meta charset="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<meta name="color-scheme" content="light dark" />
				<title>Wayfarer</title>
				<link rel="stylesheet" href="/assets/app.css" />
			</head>
			<body>{props.children}</body>
		</html>
	)
}
