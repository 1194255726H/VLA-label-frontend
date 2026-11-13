import { ChevronDown } from 'lucide-react'
import { useId, useState } from 'react'
export interface SearchableOption { id: string; name: string }

export function SearchableSelect({ value, options, disabled = false, loading = false, label, required = false, placeholder = '请选择或输入名称搜索', emptyText = '暂无可选项', onChange }: { value: string; options: SearchableOption[]; disabled?: boolean; loading?: boolean; label: string; required?: boolean; placeholder?: string; emptyText?: string; onChange: (id: string) => void }) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [active, setActive] = useState(-1)
  const selected = options.find((item) => item.id === value)
  const visible = options.filter((item) => item.name.toLowerCase().includes(keyword.trim().toLowerCase()))
  function choose(item: SearchableOption) {
    if (disabled || loading) return
    onChange(item.id)
    setOpen(false); setKeyword(''); setActive(-1)
  }
  return <div className="project-supplier-picker" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}>
    <div className="project-supplier-input"><input role="combobox" aria-label={label} aria-required={required} aria-expanded={open} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={open && visible[active] ? `${listId}-${active}` : undefined}
      disabled={disabled || loading} value={open ? keyword : selected?.name || ''} placeholder={loading ? '正在加载...' : placeholder}
      onFocus={() => { setOpen(true); setKeyword(''); setActive(-1) }} onClick={() => setOpen(true)} onChange={(event) => { setKeyword(event.target.value); setOpen(true); setActive(-1) }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); return }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); setOpen(true)
          if (visible.length) setActive(active < 0 ? event.key === 'ArrowDown' ? 0 : visible.length - 1 : (active + (event.key === 'ArrowDown' ? 1 : -1) + visible.length) % visible.length)
        }
        if (event.key === 'Enter') { event.preventDefault(); if (open && visible[active]) choose(visible[active]) }
      }} /><ChevronDown size={15} aria-hidden="true" /></div>
    {open && !disabled && !loading && <div className="project-supplier-options" id={listId} role="listbox" aria-label={`${label}候选`}>{visible.map((item, index) => <button type="button" role="option" key={item.id} id={`${listId}-${index}`} aria-selected={item.id === value} className={active === index ? 'active' : ''} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(item)}>{item.name}</button>)}{!visible.length && <p>{keyword.trim() ? '未找到匹配项' : emptyText}</p>}</div>}
  </div>
}
