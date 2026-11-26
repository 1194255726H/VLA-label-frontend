import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'

type DateRange = { start: string; end: string }
function monthOf(value: string) {
  const date = value ? new Date(`${value}T00:00:00`) : new Date()
  return { year: date.getFullYear(), month: date.getMonth() }
}
export function DateRangePicker({ start, end, label, onChange }: DateRange & { label: string; onChange: (range: DateRange) => void }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<DateRange>({ start, end })
  const [active, setActive] = useState<'start' | 'end'>('start')
  const [view, setView] = useState(() => monthOf(start || end))
  const root = useRef<HTMLDivElement>(null)
  const popupId = useId()
  const invalid = Boolean(draft.start && draft.end && draft.start > draft.end)
  const firstDay = (new Date(view.year, view.month, 1).getDay() + 6) % 7
  const days = new Date(view.year, view.month + 1, 0).getDate()
  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: Math.max(currentYear + 100, view.year) - Math.min(1900, view.year) + 1 }, (_, index) => Math.min(1900, view.year) + index)
  useEffect(() => {
    if (!open) return
    function outside(event: PointerEvent) { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])
  function moveMonth(offset: number) { const date = new Date(view.year, view.month + offset, 1); setView({ year: date.getFullYear(), month: date.getMonth() }) }
  function choose(date: string) {
    if (active === 'start') { setDraft({ start: date, end: '' }); setActive('end') }
    else if (!draft.start || date >= draft.start) setDraft({ ...draft, end: date })
  }
  function apply() { if (!invalid) { onChange(draft); setOpen(false) } }
  return <div ref={root} className="delivery-date-picker date-range-picker" onKeyDown={(event) => { if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false) } }} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}>
    <button type="button" className="delivery-date-trigger date-range-trigger" aria-label={label} aria-haspopup="dialog" aria-expanded={open} aria-controls={popupId} onClick={() => {
      if (!open) { setDraft({ start, end }); setActive(start && !end ? 'end' : 'start'); setView(monthOf(start || end)) }
      setOpen(!open)
    }}><span>{start || end ? `${start || '开始日期'} 至 ${end || '结束日期'}` : '请选择日期范围'}</span><CalendarDays size={15} /></button>
    {open && <div className="delivery-date-popup date-range-popup" role="dialog" aria-label={`选择${label}`} id={popupId}>
      <div className="date-range-inputs">{(['start', 'end'] as const).map((side) => <label className={active === side ? 'active' : ''} key={side}><span>{side === 'start' ? '开始日期' : '结束日期'}</span><input type="date" aria-label={`${label}${side === 'start' ? '开始' : '结束'}`} value={draft[side]} min={side === 'end' ? draft.start || undefined : undefined} max={side === 'start' ? draft.end || undefined : undefined} onFocus={() => { setActive(side); if (draft[side]) setView(monthOf(draft[side])) }} onChange={(event) => setDraft({ ...draft, [side]: event.target.value })} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); apply() } }} /></label>)}</div>
      <div className="delivery-calendar-heading"><button type="button" aria-label="上个月" onClick={() => moveMonth(-1)}><ChevronLeft size={16} /></button><select aria-label="范围年份" value={view.year} onChange={(event) => setView({ ...view, year: Number(event.target.value) })}>{years.map((year) => <option key={year} value={year}>{year}年</option>)}</select><select aria-label="范围月份" value={view.month} onChange={(event) => setView({ ...view, month: Number(event.target.value) })}>{Array.from({ length: 12 }, (_, month) => <option key={month} value={month}>{month + 1}月</option>)}</select><button type="button" aria-label="下个月" onClick={() => moveMonth(1)}><ChevronRight size={16} /></button></div>
      <div className="delivery-calendar-days">{['一', '二', '三', '四', '五', '六', '日'].map((day) => <span key={day}>{day}</span>)}{Array.from({ length: firstDay }, (_, index) => <i key={`blank-${index}`} />)}{Array.from({ length: days }, (_, index) => {
        const date = `${view.year}-${String(view.month + 1).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`
        return <button type="button" key={date} aria-label={date} aria-pressed={date === draft.start || date === draft.end} className={draft.start && draft.end && date > draft.start && date < draft.end ? 'in-range' : undefined} disabled={active === 'end' && Boolean(draft.start && date < draft.start)} onClick={() => choose(date)}>{index + 1}</button>
      })}</div>
      {invalid && <p className="inline-error">开始日期不能晚于结束日期</p>}
      <div className="delivery-calendar-footer"><button type="button" onClick={() => { onChange({ start: '', end: '' }); setOpen(false) }}>清除</button><button type="button" onClick={() => setOpen(false)}>取消</button><button type="button" disabled={invalid} onClick={apply}>确定</button></div>
    </div>}
  </div>
}
