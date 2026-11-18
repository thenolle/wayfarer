import { cp, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { renderIcon, renderSocial } from './png'

export const root = join(import.meta.dir, '..')

/**
 * Bundles the browser app, concatenates the stylesheets and writes the icons
 * and the social image into `out`.
 */
export async function writeAssets(out: string, minify: boolean): Promise<void> {
	const result = await Bun.build({
		entrypoints: [join(root, 'src', 'client', 'app.tsx')],
		outdir: join(out, 'assets'),
		naming: 'app.js',
		target: 'browser',
		format: 'esm',
		minify,
		sourcemap: minify ? 'none' : 'inline'
	})
	if (!result.success) throw new Error(result.logs.map((log) => log.message).join('\n'))
	const components = await Bun.file(join(root, 'node_modules', '@gambrel', 'components', 'dist', 'styles.css')).text()
	const own = await Bun.file(join(root, 'public', 'site.css')).text()
	await Bun.write(join(out, 'assets', 'site.css'), `${components}\n${own}`)
	await cp(join(root, 'public', 'favicon.svg'), join(out, 'favicon.svg'))
	await mkdir(join(out, 'icons'), { recursive: true })
	for (const size of [32, 180, 192, 512]) await writeFile(join(out, 'icons', `icon-${size}.png`), renderIcon(size, false))
	await writeFile(join(out, 'icons', 'maskable-512.png'), renderIcon(512, true))
	await writeFile(join(out, 'social.png'), renderSocial())
}
