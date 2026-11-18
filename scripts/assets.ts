import { join } from 'node:path'

/**
 * Copies the stylesheet next to the browser bundle so one directory serves
 * every public asset.
 */
export async function copyStyles(root: string): Promise<void> {
  await Bun.write(join(root, 'dist', 'client', 'app.css'), Bun.file(join(root, 'src', 'ui', 'styles', 'app.css')))
}
