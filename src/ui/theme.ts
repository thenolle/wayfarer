const STORAGE_KEY = 'wayfarer-theme'

type Theme = 'light' | 'dark'

function stored(): Theme | null {
	try {
		const value = localStorage.getItem(STORAGE_KEY)
		return value === 'light' || value === 'dark' ? value : null
	} catch {
		return null
	}
}

/**
 * Applies a saved theme choice and reveals the toggle button, which stays
 * hidden when scripts do not run. Without a saved choice the system setting
 * decides, through CSS.
 */
export function initTheme(): void {
	const root = document.documentElement
	const saved = stored()
	if (saved !== null) root.dataset['theme'] = saved
	const button = document.querySelector<HTMLButtonElement>('[data-theme-toggle]')
	if (button === null) return
	button.hidden = false
	button.addEventListener('click', () => {
		const current = root.dataset['theme']
		const dark = current === 'dark' || (current === undefined && matchMedia('(prefers-color-scheme: dark)').matches)
		const next: Theme = dark ? 'light' : 'dark'
		root.dataset['theme'] = next
		try { localStorage.setItem(STORAGE_KEY, next) } catch { return }
	})
}
