import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect } from 'react'

interface PaginationJumpProps {
  page: number
  pages: number
  disabled?: boolean
  onChange: (page: number) => void
}

type PaginationItem = number | 'ellipsis'

function paginationItems(page: number, pages: number): PaginationItem[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, index) => index + 1)
  if (page <= 4) return [1, 2, 3, 4, 5, 'ellipsis', pages]
  if (page >= pages - 3) return [1, 'ellipsis', pages - 4, pages - 3, pages - 2, pages - 1, pages]
  return [1, 'ellipsis', page - 1, page, page + 1, 'ellipsis', pages]
}

export function PaginationJump({ page, pages, disabled = false, onChange }: PaginationJumpProps) {
  const maxPage = Math.max(1, pages)
  const currentPage = Math.min(maxPage, Math.max(1, page))

  useEffect(() => {
    if (page !== currentPage) onChange(currentPage)
  }, [currentPage, onChange, page])

  function move(next: number) {
    if (disabled || next < 1 || next > maxPage || next === currentPage) return
    onChange(next)
  }

  return <nav className="pagination pagination-numbers" aria-label="分页">
    <button type="button" disabled={disabled || currentPage <= 1} onClick={() => move(currentPage - 1)} aria-label="上一页"><ChevronLeft size={16} /></button>
    {paginationItems(currentPage, maxPage).map((item, index) => item === 'ellipsis'
      ? <span className="pagination-ellipsis" aria-hidden="true" key={`ellipsis-${index}`}>…</span>
      : <button type="button" className={item === currentPage ? 'active' : ''} aria-current={item === currentPage ? 'page' : undefined} disabled={disabled} onClick={() => move(item)} key={item}>{item}</button>)}
    <button type="button" disabled={disabled || currentPage >= maxPage} onClick={() => move(currentPage + 1)} aria-label="下一页"><ChevronRight size={16} /></button>
  </nav>
}
