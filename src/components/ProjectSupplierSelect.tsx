import { ChevronDown } from 'lucide-react'
import { useId, useState } from 'react'
import type { FleetSupplierOption } from '../types/api'

type Option = FleetSupplierOption & { boundProject?: string }

export function ProjectSupplierSelect({ value, options, loading, disabled, onChange }: { value: string; options: Option[]; loading: boolean; disabled?: boolean; onChange: (option: FleetSupplierOption) => void }) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [active, setActive] = useState(-1)
  const selected = options.find((option) => option.localId === value)
  const visible = options.filter((option) => `${option.name} ${option.code}`.toLowerCase().includes(keyword.toLowerCase()))
  function choose(option: Option) {
    if (option.boundProject || disabled || loading) return
    onChange(option); setOpen(false); setKeyword('')
  }
  return <div className="project-supplier-picker" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}>
    <div className="project-supplier-input"><input role="combobox" aria-label="项目供应商" aria-required="true" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined} disabled={disabled || loading} value={open ? keyword : selected?.name || ''} placeholder={loading ? '正在加载供应商...' : '请选择或输入供应商名称搜索'} onFocus={() => { setKeyword(''); setActive(-1); setOpen(true) }} onClick={() => setOpen(true)} onChange={(event) => { setKeyword(event.target.value); setActive(-1); setOpen(true) }} onKeyDown={(event) => {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); return }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault(); setOpen(true)
        const direction = event.key === 'ArrowDown' ? 1 : -1
        for (let step = 1; step <= visible.length; step++) { const index = ((active + direction * step) % visible.length + visible.length) % visible.length; if (!visible[index].boundProject) { setActive(index); break } }
      }
      if (event.key === 'Enter' && open) { event.preventDefault(); if (active >= 0 && visible[active]) choose(visible[active]) }
    }} /><ChevronDown size={15} aria-hidden="true" /></div>
    {open && !disabled && <div className="project-supplier-options" id={listId} role="listbox" aria-label="供应商候选">{visible.map((option, index) => <button type="button" role="option" id={`${listId}-${index}`} aria-selected={value === option.localId} className={active === index ? 'active' : ''} disabled={Boolean(option.boundProject)} key={option.localId} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option)}><span>{option.name}</span><small>{option.boundProject ? `已绑定：${option.boundProject}` : option.code}</small></button>)}{!visible.length && <p>{options.length ? '未找到匹配的供应商' : '暂无可用供应商'}</p>}</div>}
  </div>
}
