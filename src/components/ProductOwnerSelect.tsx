import { SearchableSelect } from './SearchableSelect'
import type { ProductAssociation } from '../types/api'

export function ProductOwnerSelect({ value, options, disabled, loading, label = '项目负责人', required = true, onChange }: { value: string; options: ProductAssociation[]; disabled: boolean; loading: boolean; label?: string; required?: boolean; onChange: (id: string) => void }) {
  return <SearchableSelect value={value} options={options} disabled={disabled} loading={loading} label={label} required={required} placeholder="请选择或输入负责人名称搜索" emptyText="暂无可选项目经理" onChange={onChange} />
}
