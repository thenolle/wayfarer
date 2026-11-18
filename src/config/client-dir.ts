import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * Files the dashboard needs in the browser asset directory.
 */
export const CLIENT_ASSET_FILES = ['client.js', 'app.css'] as const

/**
 * Chooses the directory that holds the built browser assets.
 *
 * It checks, in order: next to the server bundle (`dist/server` beside
 * `dist/client`), the build output of a source checkout (`dist/client` above
 * `src/config`), and `dist/client` under the working directory. The first one
 * containing `client.js` wins, so the result does not depend on where the
 * service was started. If none has it, the working-directory path is returned.
 */
export function findClientDir(moduleDir: string, cwd: string, exists: (path: string) => boolean = existsSync): string {
	const fromCwd = resolve(cwd, 'dist', 'client')
	const candidates = [resolve(moduleDir, '..', 'client'), resolve(moduleDir, '..', '..', 'dist', 'client'), fromCwd]
	return candidates.find((candidate) => exists(join(candidate, 'client.js'))) ?? fromCwd
}

/**
 * Names of required browser asset files that are missing from `clientDir`.
 */
export function missingClientAssets(clientDir: string, exists: (path: string) => boolean = existsSync): string[] {
	return CLIENT_ASSET_FILES.filter((file) => !exists(join(clientDir, file)))
}
