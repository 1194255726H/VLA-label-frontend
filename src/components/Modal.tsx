import { X } from 'lucide-react'
import type { ReactNode } from 'react'

interface Props {
  title: string
  children: ReactNode
  footer?: ReactNode
  onClose: () => void
}

export function Modal({ title, children, footer, onClose }: Props) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <header><h2>{title}</h2><button className="icon-button" type="button" onClick={onClose} aria-label="关闭"><X size={19} /></button></header>
        <div className="modal-body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </section>
    </div>
  )
}
