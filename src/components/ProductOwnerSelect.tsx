import { ChevronDown } from 'lucide-react'
import { useId, useState } from 'react'
import type { ProductAssociation } from '../types/api'

export function ProductOwnerSelect({ value, options, disabled, loading, label = '项目负责人', required = true, onChange }: { value: string; options: ProductAssociation[]; disabled: boolean; loading: boolean; label?: string; required?: boolean; onChange: (id: string) => void }) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [active, setActive] = useState(-1)
  const selected = options.find((item) => item.id === value)
  const visible = options.filter((item) => item.name.toLowerCase().includes(keyword.trim().toLowerCase()))
  function choose(item: ProductAssociation) {
    if (disabled || loading) return
    onChange(item.id)
    setOpen(false); setKeyword(''); setActive(-1)
  }
  return <div className="project-supplier-picker" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}>
    <div className="project-supplier-input"><input role="combobox" aria-label={label} aria-required={required} aria-expanded={open} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={open && visible[active] ? `${listId}-${active}` : undefined}
      disabled={disabled || loading} value={open ? keyword : selected?.name || ''} placeholder={loading ? '正在加载负责人...' : '请选择或输入负责人名称搜索'}
      onFocus={() => { setOpen(true); setKeyword(''); setActive(-1) }} onClick={() => setOpen(true)} onChange={(event) => { setKeyword(event.target.value); setOpen(true); setActive(-1) }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); return }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); setOpen(true)
          if (visible.length) setActive(active < 0 ? event.key === 'ArrowDown' ? 0 : visible.length - 1 : (active + (event.key === 'ArrowDown' ? 1 : -1) + visible.length) % visible.length)
        }
        if (event.key === 'Enter') { event.preventDefault(); if (open && visible[active]) choose(visible[active]) }
      }} /><ChevronDown size={15} aria-hidden="true" /></div>
    {open && !disabled && !loading && <div className="project-supplier-options" id={listId} role="listbox" aria-label={`${label}候选`}>{visible.map((item, index) => <button type="button" role="option" key={item.id} id={`${listId}-${index}`} aria-selected={item.id === value} className={active === index ? 'active' : ''} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(item)}>{item.name}</button>)}{!visible.length && <p>{keyword.trim() ? '未找到匹配的负责人' : '暂无可选项目经理'}</p>}</div>}
  </div>
}
