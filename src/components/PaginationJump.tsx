import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useRef } from 'react'

interface PaginationJumpProps {
  page: number
  pages: number
  disabled?: boolean
  onChange: (page: number) => void
}

export function PaginationJump({ page, pages, disabled = false, onChange }: PaginationJumpProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const maxPage = Math.max(1, pages)

  function jump() {
    const requested = Number.parseInt(inputRef.current?.value || '', 10)
    if (!Number.isFinite(requested)) {
      if (inputRef.current) inputRef.current.value = String(page)
      return
    }
    const next = Math.min(maxPage, Math.max(1, requested))
    if (inputRef.current) inputRef.current.value = String(next)
    if (next !== page) onChange(next)
  }

  function move(next: number) {
    if (next < 1 || next > maxPage) return
    onChange(next)
  }

  return <div className="pagination pagination-jump">
    <button type="button" disabled={disabled || page <= 1} onClick={() => move(page - 1)} aria-label="上一页"><ChevronLeft size={16} /></button>
    <input key={page} ref={inputRef} defaultValue={page} inputMode="numeric" aria-label="跳转页码" disabled={disabled} onChange={(event) => { event.currentTarget.value = event.currentTarget.value.replace(/\D/g, '') }} onKeyDown={(event) => { if (event.key === 'Enter') jump() }} />
    <span>/ {maxPage}</span>
    <button type="button" className="pagination-go" disabled={disabled} onClick={jump}>跳转</button>
    <button type="button" disabled={disabled || page >= maxPage} onClick={() => move(page + 1)} aria-label="下一页"><ChevronRight size={16} /></button>
  </div>
}
