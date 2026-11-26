import { useId, useState } from 'react'
export interface MultiOption { id: string; name: string }
export function SearchableMultiSelect({ label, value, options, allowCustom = false, disabled = false, loading = false, clearSearchOnSelect = false, onChange }: {
  label: string; value: string[]; options: MultiOption[]; allowCustom?: boolean; disabled?: boolean; loading?: boolean; clearSearchOnSelect?: boolean; onChange: (value: string[]) => void
}) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [keyword, setKeyword] = useState('')
  const visible = options.filter((item) => item.name.toLowerCase().includes(keyword.trim().toLowerCase()))
  const toggle = (id: string) => {
    if (disabled) return
    const selected = value.includes(id)
    onChange(selected ? value.filter((item) => item !== id) : [...value, id])
    if (!selected && clearSearchOnSelect) setKeyword('')
  }
  function add() { const next = keyword.trim(); if (allowCustom && next) { if (!value.includes(next)) onChange([...value, next]); setKeyword('') } }
  return <div className="searchable-multi-select" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}>
    <div className="multi-select-input">{value.map((id) => <span className="selected-library" key={id}>{options.find((item) => item.id === id)?.name || id}<button type="button" disabled={disabled} aria-label={`移除${label}${id}`} onClick={() => toggle(id)}>×</button></span>)}<input aria-label={label} aria-expanded={open} aria-controls={listId} disabled={disabled} value={keyword} placeholder={loading ? '正在加载…' : allowCustom ? '输入名称搜索或回车添加' : '输入名称搜索'} onFocus={() => setOpen(true)} onChange={(event) => { setKeyword(event.target.value); setOpen(true) }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); add() } if (event.key === 'Escape') { event.stopPropagation(); setOpen(false) } }} /></div>
    {open && !disabled && <div className="multi-select-options" role="group" aria-label={`${label}候选`} id={listId}>{loading && <p role="status">正在加载全部候选…</p>}{visible.map((item) => <label key={item.id}><input type="checkbox" checked={value.includes(item.id)} onChange={() => toggle(item.id)} />{item.name}</label>)}{allowCustom && keyword.trim() && !options.some((item) => item.id === keyword.trim()) && <button type="button" onClick={add}>添加“{keyword.trim()}”</button>}{!loading && !visible.length && !allowCustom && <p>暂无匹配项</p>}<button type="button" onClick={() => setOpen(false)}>完成</button></div>}
  </div>
}
