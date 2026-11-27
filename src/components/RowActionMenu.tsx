import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'

export function RowActionMenu({ children, disabled }: { children: ReactNode; disabled?: boolean }) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number; maxHeight: number }>()

  useEffect(() => {
    if (!position) return
    function dismiss(event: Event) {
      if (event.target instanceof Node && (menu.current?.contains(event.target) || trigger.current?.contains(event.target))) return
      setPosition(undefined)
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') { setPosition(undefined); trigger.current?.focus() }
    }
    function resize() { setPosition(undefined) }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('scroll', dismiss, true)
    document.addEventListener('keydown', escape)
    window.addEventListener('resize', resize)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('scroll', dismiss, true)
      document.removeEventListener('keydown', escape)
      window.removeEventListener('resize', resize)
    }
  }, [position])

  return <>
    <button ref={trigger} type="button" className="video-more-trigger" disabled={disabled} aria-expanded={Boolean(position)} aria-controls={position ? id : undefined} onClick={() => {
      if (position) { setPosition(undefined); return }
      const bounds = trigger.current!.getBoundingClientRect()
      setPosition({ top: bounds.bottom + 6, left: Math.max(8, Math.min(bounds.right - 132, window.innerWidth - 140)), maxHeight: Math.max(48, window.innerHeight - bounds.bottom - 14) })
    }}>更多操作<ChevronDown size={13} /></button>
    {position && createPortal(<div ref={menu} id={id} className="video-more-menu" style={position} onClick={(event) => {
      const target = event.target instanceof Element ? event.target.closest('button') : null
      if (target && !target.disabled) setPosition(undefined)
    }}>{children}</div>, document.body)}
  </>
}
