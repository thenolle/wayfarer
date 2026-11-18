function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

function focusField(id: string): void {
  const element = document.getElementById(id)
  if (element instanceof HTMLElement) {
    element.focus()
    element.scrollIntoView({ block: 'center' })
  }
}

function selectables(): HTMLInputElement[] {
  return [...document.querySelectorAll<HTMLInputElement>('input[type="checkbox"][name="id"][form="bulk"]')]
}

export function initEnhancements(): void {
  document.documentElement.dataset['js'] = '1'
  document.addEventListener('change', (event) => {
    const target = event.target
    if (target instanceof HTMLInputElement && target.hasAttribute('data-select-all')) {
      for (const box of selectables()) box.checked = target.checked
    }
  })
  document.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return
    if (event.key === '/') {
      event.preventDefault()
      focusField('search-q')
    } else if (event.key === 'n' || event.key === 'N') {
      event.preventDefault()
      focusField('add-url')
    }
  })
}
