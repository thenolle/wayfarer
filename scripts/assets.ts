import { cp } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Copies the stylesheet and the static files (favicon) next to the browser
 * bundle so one directory serves every public asset.
 */
export async function copyStyles(root: string): Promise<void> {
  const base = await Bun.file(join(root, 'node_modules', '@gambrel', 'components', 'dist', 'styles.css')).text()
  const own = await Bun.file(join(root, 'src', 'ui', 'styles', 'app.css')).text()
  await Bun.write(join(root, 'dist', 'client', 'app.css'), `${base}\n${own}`)
  await cp(join(root, 'src', 'ui', 'assets'), join(root, 'dist', 'client'), { recursive: true })
}
