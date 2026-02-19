export function createTooltip(mountTarget: HTMLElement = document.body) {
  const el = document.createElement('div')
  el.style.position = 'fixed'
  el.style.left = '0px'
  el.style.top = '0px'
  el.style.transform = 'translate(-50%, -120%)'
  el.style.pointerEvents = 'none'
  el.style.padding = '6px 10px'
  el.style.borderRadius = '10px'
  el.style.background = 'var(--tooltip-bg, rgba(6, 18, 38, 0.88))'
  el.style.border = '1px solid var(--tooltip-border, rgba(255, 255, 255, 0.22))'
  el.style.color = 'var(--tooltip-text, rgba(255, 255, 255, 0.95))'
  el.style.font = '12px system-ui, -apple-system, Segoe UI, Roboto, "Apple Color Emoji", "Segoe UI Emoji", sans-serif'
  el.style.letterSpacing = '0.2px'
  el.style.backdropFilter = 'blur(6px)'
  el.style.opacity = '0'
  el.style.transition = 'opacity 340ms ease'
  el.style.zIndex = '99999'

  mountTarget.appendChild(el)

  function show(text: string, x?: number, y?: number) {
    el.textContent = text
    if (typeof x === 'number' && typeof y === 'number') {
      el.style.left = `${x}px`
      el.style.top = `${y}px`
    }
    el.style.opacity = '1'
  }

  function showHTML(html: string, x?: number, y?: number) {
    el.innerHTML = html
    if (typeof x === 'number' && typeof y === 'number') {
      el.style.left = `${x}px`
      el.style.top = `${y}px`
    }
    el.style.opacity = '1'
  }

  function move(x: number, y: number) {
    el.style.left = `${x}px`
    el.style.top = `${y}px`
  }

  function hide() {
    el.style.opacity = '0'
  }

  function setTheme(isLight: boolean) {
    void isLight
    el.style.background = 'var(--tooltip-bg, rgba(6, 18, 38, 0.88))'
    el.style.border = '1px solid var(--tooltip-border, rgba(255, 255, 255, 0.22))'
    el.style.color = 'var(--tooltip-text, rgba(255, 255, 255, 0.95))'
  }

  function destroy() {
    el.remove()
  }

  return { el, show, showHTML, move, hide, setTheme, destroy }
}
