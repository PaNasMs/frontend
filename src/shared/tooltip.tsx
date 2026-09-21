import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export function TooltipLayer() {
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null)
  useEffect(() => {
    let owner: HTMLElement | null = null
    let original: string | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    const hide = () => {
      clearTimeout(timer)
      if (owner) {
        if (original !== null) owner.setAttribute('title', original)
        const ids = (owner.getAttribute('aria-describedby') ?? '')
          .split(' ')
          .filter((id) => id && id !== 'interface-tooltip')
        if (ids.length) owner.setAttribute('aria-describedby', ids.join(' '))
        else owner.removeAttribute('aria-describedby')
      }
      owner = null
      setTip(null)
    }
    const show = (event: Event) => {
      const target = (event.target as Element)?.closest<HTMLElement>('[data-tooltip], [title]')
      if (!target || target === owner) return
      hide()
      const text = target.dataset.tooltip || target.title
      if (!text) return
      owner = target
      original = target.getAttribute('title')
      target.removeAttribute('title')
      timer = setTimeout(
        () => {
          const rect = target.getBoundingClientRect()
          target.setAttribute(
            'aria-describedby',
            [target.getAttribute('aria-describedby'), 'interface-tooltip'].filter(Boolean).join(' '),
          )
          setTip({
            text,
            x: Math.max(
              Math.min(152, innerWidth / 2),
              Math.min(rect.left + rect.width / 2, innerWidth - Math.min(152, innerWidth / 2)),
            ),
            y: Math.min(rect.bottom + 8, innerHeight - 80),
          })
        },
        event.type === 'focusin' ? 0 : 400,
      )
    }
    const leave = (event: Event) => {
      const next = (event as MouseEvent).relatedTarget as Node | null
      if (next && (owner?.contains(next) || (next as Element).closest?.('#interface-tooltip'))) return
      hide()
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hide()
    }
    document.addEventListener('pointerover', show)
    document.addEventListener('focusin', show)
    document.addEventListener('pointerout', leave)
    document.addEventListener('focusout', leave)
    document.addEventListener('keydown', escape)
    window.addEventListener('scroll', hide, true)
    return () => {
      hide()
      document.removeEventListener('pointerover', show)
      document.removeEventListener('focusin', show)
      document.removeEventListener('pointerout', leave)
      document.removeEventListener('focusout', leave)
      document.removeEventListener('keydown', escape)
      window.removeEventListener('scroll', hide, true)
    }
  }, [])
  return (
    tip &&
    createPortal(
      <div
        id="interface-tooltip"
        role="tooltip"
        className="interface-tooltip"
        style={{ left: tip.x, top: tip.y }}
      >
        {tip.text}
      </div>,
      document.body,
    )
  )
}
