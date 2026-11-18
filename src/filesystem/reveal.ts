import { dirname } from 'node:path'

/**
 * The command that shows a file, or its folder, in the system file manager.
 */
export function revealCommand(path: string, selectFile: boolean, platform: NodeJS.Platform = process.platform): string[] {
	if (platform === 'win32') return selectFile ? ['explorer.exe', `/select,${path}`] : ['explorer.exe', dirname(path)]
	if (platform === 'darwin') return selectFile ? ['open', '-R', path] : ['open', dirname(path)]
	return ['xdg-open', dirname(path)]
}

/**
 * Opens the file manager without a shell. Returns false when none could start.
 */
export function revealInFileManager(path: string, selectFile: boolean): boolean {
	try {
		Bun.spawn(revealCommand(path, selectFile), { stdin: 'ignore', stdout: 'ignore', stderr: 'ignore' }).unref()
		return true
	} catch {
		return false
	}
}
