import { CircleAlert, FileJson, UploadCloud } from 'lucide-react'
import { useRef, useState, type ChangeEvent } from 'react'
import type { ImportResult, ImportValidationError } from '../types/api'
import { Modal } from './Modal'

interface Props {
  title: string
  rootKey: 'labels' | 'objects'
  itemName: string
  onClose: () => void
  onImport: (payload: Record<string, unknown>) => Promise<ImportResult>
  onImported: (count: number) => void
}

type ImportApiError = Error & { errors?: ImportValidationError[] }

function validateItems(rootKey: Props['rootKey'], items: unknown[]): ImportValidationError[] {
  const errors: ImportValidationError[] = []
  const names = new Map<string, number>()
  items.forEach((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      errors.push({ index, code: 'item_invalid', message: `第 ${index + 1} 条：必须是 JSON 对象` })
      return
    }
    const item = value as Record<string, unknown>
    const name = typeof item.name === 'string' ? item.name.trim() : ''
    const nameLimit = rootKey === 'labels' ? 100 : 160
    if (!name) errors.push({ index, code: rootKey === 'labels' ? 'label_name_required' : 'operation_object_name_required', message: `第 ${index + 1} 条：名称不能为空` })
    else if (name.length > nameLimit) errors.push({ index, code: 'name_too_long', message: `第 ${index + 1} 条：名称不能超过 ${nameLimit} 个字符` })
    else {
      const normalizedName = name.toLocaleLowerCase()
      const previous = names.get(normalizedName)
      if (previous !== undefined) errors.push({ index, code: 'import_name_conflict', message: `第 ${index + 1} 条：名称“${name}”与第 ${previous + 1} 条重复` })
      else names.set(normalizedName, index)
    }
    if (rootKey === 'labels') {
      if (typeof item.color !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(item.color)) errors.push({ index, code: 'label_color_invalid', message: `第 ${index + 1} 条：color 必须是六位十六进制颜色` })
      if (!['goal', 'action'].includes(String(item.applies_to || ''))) errors.push({ index, code: 'label_applies_to_invalid', message: `第 ${index + 1} 条：applies_to 必须是 goal 或 action` })
      if (item.enabled !== undefined && typeof item.enabled !== 'boolean') errors.push({ index, code: 'label_enabled_invalid', message: `第 ${index + 1} 条：enabled 必须是布尔值` })
      if (item.sort_order !== undefined && !Number.isInteger(item.sort_order)) errors.push({ index, code: 'label_sort_order_invalid', message: `第 ${index + 1} 条：sort_order 必须是整数` })
    } else {
      if (item.alias !== undefined && (typeof item.alias !== 'string' || item.alias.length > 160)) errors.push({ index, code: 'operation_object_alias_invalid', message: `第 ${index + 1} 条：alias 必须是不超过 160 个字符的文本` })
      if (item.attribute !== undefined && (typeof item.attribute !== 'string' || item.attribute.length > 2000)) errors.push({ index, code: 'operation_object_attribute_invalid', message: `第 ${index + 1} 条：attribute 必须是不超过 2000 个字符的文本` })
      if (item.approved !== undefined && typeof item.approved !== 'boolean') errors.push({ index, code: 'operation_object_approved_invalid', message: `第 ${index + 1} 条：approved 必须是布尔值` })
    }
  })
  return errors
}

export function JsonImportModal({ title, rootKey, itemName, onClose, onImport, onImported }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [filename, setFilename] = useState('')
  const [payload, setPayload] = useState<Record<string, unknown>>()
  const [itemCount, setItemCount] = useState(0)
  const [error, setError] = useState('')
  const [details, setDetails] = useState<ImportValidationError[]>([])
  const [importing, setImporting] = useState(false)

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    setPayload(undefined); setItemCount(0); setError(''); setDetails([])
    if (!file) { setFilename(''); return }
    setFilename(file.name)
    try {
      const parsed: unknown = JSON.parse(await file.text())
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('JSON 顶层必须是对象')
      const nextPayload = parsed as Record<string, unknown>
      const items = nextPayload[rootKey]
      if (!Array.isArray(items)) throw new Error(`JSON 中必须包含 ${rootKey} 数组`)
      if (items.length < 1 || items.length > 500) throw new Error(`${itemName}数量必须在 1–500 条之间`)
      const validationErrors = validateItems(rootKey, items)
      if (validationErrors.length) {
        setDetails(validationErrors)
        setError(`文件校验失败，共 ${validationErrors.length} 条错误`)
        return
      }
      setPayload(nextPayload)
      setItemCount(items.length)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'JSON 文件解析失败')
    }
  }

  async function submit() {
    if (!payload || importing) return
    setImporting(true); setError(''); setDetails([])
    try {
      const result = await onImport(payload)
      onImported(result.importedCount)
    } catch (reason) {
      const apiError = reason as ImportApiError
      const errorDetails = Array.isArray(apiError.errors) ? apiError.errors : []
      setError(errorDetails.length ? `批量导入校验失败，共 ${errorDetails.length} 条错误` : apiError.message || '批量导入失败')
      setDetails(errorDetails)
    } finally { setImporting(false) }
  }

  return <Modal title={title} onClose={() => !importing && onClose()} footer={<><button className="secondary-button" type="button" disabled={importing} onClick={onClose}>取消</button><button className="primary-button" type="button" disabled={!payload || importing} onClick={() => void submit()}>{importing ? '正在导入...' : `导入 ${itemCount || ''} 条`}</button></>}>
    <div className="json-import-dialog">
      <button className={`json-import-picker${payload ? ' ready' : ''}`} type="button" disabled={importing} onClick={() => inputRef.current?.click()}>
        {payload ? <FileJson size={34} /> : <UploadCloud size={34} />}
        <strong>{filename || '选择 JSON 文件'}</strong>
        <span>{payload ? `已读取 ${itemCount} 条${itemName}，点击可重新选择` : `仅支持 JSON；一次导入 1–500 条${itemName}`}</span>
      </button>
      <input ref={inputRef} className="json-import-file-input" type="file" accept="application/json,.json" onChange={(event) => void selectFile(event)} />
      {error && <div className="json-import-error"><CircleAlert size={17} /><div><strong>{error}</strong>{details.length > 0 && <ol>{details.map((detail, index) => <li key={`${detail.index}-${detail.code}-${index}`}>{detail.message || `第 ${detail.index + 1} 条校验失败`}{detail.code && <code>{detail.code}</code>}</li>)}</ol>}</div></div>}
      <p className="json-import-note">导入采用整批校验：任意一条不合法时不会写入数据。模板中的“_说明”字段可直接保留。</p>
    </div>
  </Modal>
}
