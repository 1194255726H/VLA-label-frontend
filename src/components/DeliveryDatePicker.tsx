import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'

function monthOf(value: string) {
  const date = value ? new Date(`${value}T00:00:00`) : new Date()
  return { year: date.getFullYear(), month: date.getMonth() }
}

export function DeliveryDatePicker({ value, noFixedDate = false, disabled, onChange }: { value: string; noFixedDate?: boolean; disabled?: boolean; onChange: (value: string, noFixedDate: boolean) => void }) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => monthOf(value))
  const root = useRef<HTMLDivElement>(null)
  const popupId = useId()
  const firstDay = (new Date(view.year, view.month, 1).getDay() + 6) % 7
  const days = new Date(view.year, view.month + 1, 0).getDate()
  const today = new Date()
  const years = Array.from({ length: Math.max(today.getFullYear() + 100, view.year) - Math.min(1900, view.year) + 1 }, (_, index) => Math.min(1900, view.year) + index)
  useEffect(() => {
    if (!open) return
    function outside(event: PointerEvent) { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])
  function choose(date: string, noFixed = false) { if (disabled) return; onChange(date, noFixed); setOpen(false) }
  function moveMonth(offset: number) { const date = new Date(view.year, view.month + offset, 1); setView({ year: date.getFullYear(), month: date.getMonth() }) }
  return <div ref={root} className="delivery-date-picker" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }} onKeyDown={(event) => { if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false) } }}>
    <button type="button" className="delivery-date-trigger" disabled={disabled} aria-label="交付时间（必填）" aria-haspopup="dialog" aria-expanded={open} aria-controls={popupId} onClick={() => { if (!open) setView(monthOf(value)); setOpen(!open) }}><span>{value || (noFixedDate ? '无固定日期' : '请选择交付时间')}</span><CalendarDays size={16} /></button>
    {open && !disabled && <div className="delivery-date-popup" id={popupId} role="dialog" aria-label="选择交付时间">
      <div className="delivery-calendar-heading"><button type="button" aria-label="上个月" onClick={() => moveMonth(-1)}><ChevronLeft size={16} /></button><select aria-label="交付年份" value={view.year} onChange={(event) => setView({ ...view, year: Number(event.target.value) })}>{years.map((year) => <option key={year} value={year}>{year}年</option>)}</select><select aria-label="交付月份" value={view.month} onChange={(event) => setView({ ...view, month: Number(event.target.value) })}>{Array.from({ length: 12 }, (_, month) => <option key={month} value={month}>{month + 1}月</option>)}</select><button type="button" aria-label="下个月" onClick={() => moveMonth(1)}><ChevronRight size={16} /></button></div>
      <div className="delivery-calendar-days">{['一', '二', '三', '四', '五', '六', '日'].map((day) => <span key={day}>{day}</span>)}{Array.from({ length: firstDay }, (_, index) => <i key={`blank-${index}`} />)}{Array.from({ length: days }, (_, index) => {
        const day = index + 1
        const date = `${view.year}-${String(view.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        return <button type="button" key={day} aria-label={date} aria-pressed={value === date} onClick={() => choose(date)}>{day}</button>
      })}</div>
      <div className="delivery-calendar-footer"><button type="button" onClick={() => choose('')}>清除</button><button type="button" onClick={() => choose('', true)}>无固定日期</button><button type="button" onClick={() => choose(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`)}>今天</button></div>
    </div>}
  </div>
}
