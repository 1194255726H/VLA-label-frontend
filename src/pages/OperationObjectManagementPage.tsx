import { ArrowLeft, Download, Edit3, Eye, PackageOpen, Plus, Search, Trash2, Upload } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { AppShell } from '../components/AppShell'
import { JsonImportModal } from '../components/JsonImportModal'
import { Modal } from '../components/Modal'
import { PaginationJump } from '../components/PaginationJump'
import { operationObjectApi } from '../services/managementApi'
import type { OperationObject, OperationObjectLibrary, SessionResponse } from '../types/api'
import { formatDateTime } from '../utils/date'

export function OperationObjectManagementPage({ session }: { session: SessionResponse }) {
  const [libraries, setLibraries] = useState<OperationObjectLibrary[]>([])
  const [objects, setObjects] = useState<OperationObject[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [keywordInput, setKeywordInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [selected, setSelected] = useState<OperationObjectLibrary>()
  const [loading, setLoading] = useState(true)
  const [libraryModal, setLibraryModal] = useState(false)
  const [editingLibrary, setEditingLibrary] = useState<OperationObjectLibrary>()
  const [libraryForm, setLibraryForm] = useState({ name: '', desc: '' })
  const [objectModal, setObjectModal] = useState(false)
  const [importModal, setImportModal] = useState(false)
  const [editingObject, setEditingObject] = useState<OperationObject>()
  const [objectForm, setObjectForm] = useState({ name: '', alias: '', attribute: '', approved: true })
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const identities = [...session.account.roles, ...session.account.roleLabels].map((value) => value.toLowerCase().replace(/[\s_-]/g, ''))
  const canWrite = Boolean(session.account.isStaff || session.account.isSuperuser || identities.some((value) => ['admin', 'systemadmin', '管理员', '系统管理员', '超级管理员'].includes(value)))

  const load = useCallback(async () => {
    setLoading(true)
    try {
      if (selected) { const result = await operationObjectApi.listObjects(selected.id, { keyword, page, pageSize: 10 }); setObjects(result.items); setTotal(result.total) }
      else { const result = await operationObjectApi.listLibraries({ keyword, page, pageSize: 10 }); setLibraries(result.items); setTotal(result.total) }
    } catch (reason) { setToast(reason instanceof Error ? reason.message : '数据加载失败') }
    finally { setLoading(false) }
  }, [keyword, page, selected])

  useEffect(() => { void Promise.resolve().then(load) }, [load])
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 2500); return () => clearTimeout(timer) }, [toast])
  const pages = Math.max(1, Math.ceil(total / 10))
  function search() { setPage(1); setKeyword(keywordInput.trim()) }
  function openLibrary(item?: OperationObjectLibrary) { setEditingLibrary(item); setLibraryForm({ name: item?.name || '', desc: item?.desc || '' }); setError(''); setLibraryModal(true) }
  function openObject(item?: OperationObject) { setEditingObject(item); setObjectForm({ name: item?.name || '', alias: item?.alias || '', attribute: item?.attribute || '', approved: item?.approved ?? true }); setError(''); setObjectModal(true) }
  async function saveLibrary(event: FormEvent) { event.preventDefault(); if (!libraryForm.name.trim()) return setError('请输入对象库名称'); try { await operationObjectApi.saveLibrary({ id: editingLibrary?.id, name: libraryForm.name.trim(), desc: libraryForm.desc.trim() }); setLibraryModal(false); setToast(editingLibrary ? '对象库已更新' : '对象库已创建'); await load() } catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败') } }
  async function saveObject(event: FormEvent) { event.preventDefault(); if (!selected || !objectForm.name.trim()) return setError('请输入操作对象名称'); try { await operationObjectApi.saveObject(selected.id, { id: editingObject?.id, ...objectForm, name: objectForm.name.trim(), alias: objectForm.alias.trim(), attribute: objectForm.attribute.trim() }); setObjectModal(false); setToast(editingObject ? '操作对象已更新' : '操作对象已创建'); await load() } catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败') } }
  async function removeLibrary(item: OperationObjectLibrary) { if (!window.confirm(`确认删除对象库“${item.name}”及其全部操作对象？`)) return; try { await operationObjectApi.deleteLibrary(item.id); setToast('对象库已删除'); await load() } catch (reason) { setToast(reason instanceof Error ? reason.message : '删除失败') } }
  async function removeObject(item: OperationObject) { if (!selected || !window.confirm(`确认删除操作对象“${item.name}”？已引用关键帧将解除关联。`)) return; try { await operationObjectApi.deleteObject(selected.id, item.id); setToast('操作对象已删除'); await load() } catch (reason) { setToast(reason instanceof Error ? reason.message : '删除失败') } }
  async function downloadTemplate() { try { await operationObjectApi.downloadImportTemplate(); setToast('操作对象导入模板已下载') } catch (reason) { setToast(reason instanceof Error ? reason.message : '模板下载失败') } }
  async function imported(count: number) {
    if (!selected) return
    setImportModal(false)
    await load()
    const pageData = await operationObjectApi.listLibraries({ pageSize: 100 }).catch(() => undefined)
    const refreshed = pageData?.items.find((item) => item.id === selected.id)
    if (refreshed) setSelected(refreshed)
    setToast(`成功导入 ${count} 个操作对象`)
  }

  return <AppShell user={session.account}><section className="management-page"><section className="management-panel panel">
    <header className="management-toolbar detail-toolbar"><div className="detail-title">{selected && <button className="icon-button bordered" type="button" onClick={() => { setSelected(undefined); setKeyword(''); setKeywordInput(''); setPage(1) }}><ArrowLeft size={17} /></button>}<div><h2>{selected ? selected.name : '操作对象库列表'}</h2><p>{selected ? `${selected.desc || '暂无描述'} · 共 ${selected.objectCount} 个对象 · ${selected.pendingApprovalCount} 个待审核` : '集中维护关键帧可关联的操作对象'}</p></div></div>{canWrite && <div>{selected && <><button className="secondary-button" type="button" onClick={() => void downloadTemplate()}><Download size={16} />下载模板</button><button className="secondary-button" type="button" onClick={() => setImportModal(true)}><Upload size={16} />批量导入</button></>}<button className="primary-button" type="button" onClick={() => selected ? openObject() : openLibrary()}><Plus size={16} />{selected ? '创建操作对象' : '创建对象库'}</button></div>}</header>
    <div className="management-filters"><label><span>{selected ? '操作对象' : '对象库名称'}</span><div className="filter-control"><Search size={16} /><input value={keywordInput} onChange={(event) => setKeywordInput(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && search()} placeholder={selected ? '请输入对象名称或 ID' : '请输入对象库名称或描述'} /></div></label><button className="primary-button compact" type="button" onClick={search}>查询</button><button className="secondary-button compact" type="button" onClick={() => { setKeywordInput(''); setKeyword(''); setPage(1) }}>重置</button></div>
    <div className="management-table-wrap"><table className="management-table library-table"><thead>{selected ? <tr><th>ID</th><th>对象名称</th><th>别名</th><th>属性</th><th>审核状态</th><th>创建时间</th><th>操作</th></tr> : <tr><th>对象库名称</th><th>描述</th><th>对象总数</th><th>待审核数</th><th>创建时间</th><th>操作</th></tr>}</thead><tbody>
      {loading ? <tr><td colSpan={selected ? 7 : 6}><div className="management-empty">正在加载...</div></td></tr> : selected ? objects.map((item) => <tr key={item.id}><td><code>{item.id}</code></td><td><strong>{item.name}</strong></td><td>{item.alias || '-'}</td><td>{item.attribute || '-'}</td><td><span className={`enabled-tag${item.approved ? '' : ' disabled'}`}>{item.approved ? '已通过' : '待审核'}</span></td><td>{formatDateTime(item.createdAt)}</td><td><div className="row-actions">{canWrite && <><button type="button" onClick={() => openObject(item)}><Edit3 size={15} />编辑</button><button className="danger-action" type="button" onClick={() => void removeObject(item)}><Trash2 size={15} />删除</button></>}</div></td></tr>) : libraries.map((item) => <tr key={item.id}><td><strong className="count-link">{item.name}</strong></td><td>{item.desc || '-'}</td><td><strong>{item.objectCount ?? 0}</strong></td><td><span className={`enabled-tag${item.pendingApprovalCount ? ' disabled' : ''}`}>{item.pendingApprovalCount ?? 0}</span></td><td>{formatDateTime(item.createdAt)}</td><td><div className="row-actions"><button type="button" onClick={() => { setSelected(item); setKeyword(''); setKeywordInput(''); setPage(1) }}><Eye size={15} />查看</button>{canWrite && <><button type="button" onClick={() => openLibrary(item)}><Edit3 size={15} />编辑</button><button className="danger-action" type="button" onClick={() => void removeLibrary(item)}><Trash2 size={15} />删除</button></>}</div></td></tr>)}
      {!loading && !(selected ? objects : libraries).length && <tr><td colSpan={selected ? 7 : 6}><div className="management-empty"><PackageOpen size={34} />暂无数据</div></td></tr>}
    </tbody></table></div><footer className="management-footer"><span>共 {total} 条</span><div className="pagination-with-size"><PaginationJump page={page} pages={pages} disabled={loading} onChange={setPage} /><span>10条/页</span></div></footer>
  </section></section>
  {libraryModal && <Modal title={editingLibrary ? '编辑对象库' : '创建对象库'} onClose={() => setLibraryModal(false)} footer={<><button className="secondary-button" type="button" onClick={() => setLibraryModal(false)}>取消</button><button className="primary-button" type="submit" form="operation-library-form">保存</button></>}><form id="operation-library-form" className="single-column-form" onSubmit={saveLibrary}><label><span>对象库名称 <i className="required-mark">*</i></span><input value={libraryForm.name} maxLength={100} onChange={(event) => setLibraryForm({ ...libraryForm, name: event.target.value })} /></label><label><span>描述</span><textarea value={libraryForm.desc} maxLength={500} onChange={(event) => setLibraryForm({ ...libraryForm, desc: event.target.value })} /></label>{error && <p className="inline-error">{error}</p>}</form></Modal>}
  {objectModal && <Modal title={editingObject ? '编辑操作对象' : '创建操作对象'} onClose={() => setObjectModal(false)} footer={<><button className="secondary-button" type="button" onClick={() => setObjectModal(false)}>取消</button><button className="primary-button" type="submit" form="operation-object-form">保存</button></>}><form id="operation-object-form" className="single-column-form" onSubmit={saveObject}><label><span>对象名称 <i className="required-mark">*</i></span><input value={objectForm.name} maxLength={100} onChange={(event) => setObjectForm({ ...objectForm, name: event.target.value })} /></label><label><span>别名</span><input value={objectForm.alias} maxLength={100} onChange={(event) => setObjectForm({ ...objectForm, alias: event.target.value })} /></label><label><span>属性</span><textarea value={objectForm.attribute} maxLength={500} onChange={(event) => setObjectForm({ ...objectForm, attribute: event.target.value })} /></label><label className="approval-check"><input type="checkbox" checked={objectForm.approved} disabled={editingObject?.approved} onChange={(event) => setObjectForm({ ...objectForm, approved: event.target.checked })} />审核通过{editingObject?.approved && <small>已通过对象不能改回待审核</small>}</label>{error && <p className="inline-error">{error}</p>}</form></Modal>}
  {importModal && selected && <JsonImportModal title={`批量导入操作对象 · ${selected.name}`} rootKey="objects" itemName="操作对象" onClose={() => setImportModal(false)} onImport={(payload) => operationObjectApi.importObjects(selected.id, payload)} onImported={(count) => void imported(count)} />}
  {toast && <div className="toast">{toast}</div>}
  </AppShell>
}
