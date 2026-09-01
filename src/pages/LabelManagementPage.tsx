import { ArrowLeft, CircleAlert, Download, Edit3, Eye, MoreHorizontal, Plus, Search, Tags, Trash2, Upload } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { AppShell } from '../components/AppShell'
import { JsonImportModal } from '../components/JsonImportModal'
import { Modal } from '../components/Modal'
import { PaginationJump } from '../components/PaginationJump'
import { labelApi } from '../services/managementApi'
import type { LabelItem, LabelLibrary, SessionResponse } from '../types/api'
import { formatDateTime } from '../utils/date'

export function LabelManagementPage({ session }: { session: SessionResponse }) {
  const [libraries, setLibraries] = useState<LabelLibrary[]>([])
  const [loading, setLoading] = useState(true)
  const [keywordInput, setKeywordInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [selectedId, setSelectedId] = useState<string>()
  const [libraryModal, setLibraryModal] = useState(false)
  const [editingLibrary, setEditingLibrary] = useState<LabelLibrary>()
  const [libraryName, setLibraryName] = useState('')
  const [libraryDesc, setLibraryDesc] = useState('')
  const [labelModal, setLabelModal] = useState(false)
  const [importModal, setImportModal] = useState(false)
  const [editingLabel, setEditingLabel] = useState<LabelItem>()
  const [labelName, setLabelName] = useState('')
  const [labelColor, setLabelColor] = useState('#2563EB')
  const [appliesTo, setAppliesTo] = useState<'goal' | 'action'>('goal')
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const identities = [...session.account.roles, ...session.account.roleLabels].map((value) => value.toLowerCase().replace(/[\s_-]/g, ''))
  const canWrite = Boolean(session.account.isStaff || session.account.isSuperuser || identities.some((value) => ['admin', 'systemadmin', '管理员', '系统管理员', '超级管理员'].includes(value)))

  useEffect(() => { labelApi.list().then(setLibraries).finally(() => setLoading(false)) }, [])
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 2500); return () => clearTimeout(timer) }, [toast])
  const selected = libraries.find((item) => item.id === selectedId)
  const filteredLibraries = useMemo(() => libraries.filter((item) => !keyword || item.name.toLowerCase().includes(keyword.toLowerCase())), [keyword, libraries])
  const filteredTags = useMemo(() => (selected?.tags || []).filter((item) => !keyword || item.name.includes(keyword)), [keyword, selected])
  const activeItems = selected ? filteredTags : filteredLibraries
  const pages = Math.max(1, Math.ceil(activeItems.length / pageSize))
  const currentPage = Math.min(page, pages)
  const visibleLibraries = filteredLibraries.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const visibleTags = filteredTags.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  function openLibrary(item?: LabelLibrary) { setEditingLibrary(item); setLibraryName(item?.name || ''); setLibraryDesc(item?.desc || ''); setError(''); setLibraryModal(true) }
  async function saveLibrary(event: FormEvent) { event.preventDefault(); if (!libraryName.trim()) return setError('请输入标签库名称'); try { const result = await labelApi.saveLibrary({ id: editingLibrary?.id, name: libraryName.trim(), desc: libraryDesc.trim() }); setLibraries(result); setLibraryModal(false); setToast(editingLibrary ? '标签库已更新' : '标签库创建成功') } catch (reason) { setError(reason instanceof Error ? reason.message : '标签库保存失败') } }
  async function removeLibrary(item: LabelLibrary) { if (!window.confirm(`确认删除标签库“${item.name}”？`)) return; try { setLibraries(await labelApi.deleteLibrary(item.id)); setToast('标签库已删除') } catch (reason) { setToast(reason instanceof Error ? reason.message : '删除失败') } }
  function openLabel(item?: LabelItem) { setEditingLabel(item); setLabelName(item?.name || ''); setLabelColor(item?.color || '#2563EB'); setAppliesTo(item?.appliesTo === 'action' ? 'action' : 'goal'); setError(''); setLabelModal(true) }
  async function saveLabel(event: FormEvent) { event.preventDefault(); if (!labelName.trim() || !/^#[0-9A-Fa-f]{6}$/.test(labelColor)) return setError('请输入标签名称和六位十六进制颜色'); if (!selected) return; try { const result = await labelApi.saveLabel(selected.id, { id: editingLabel?.id, name: labelName.trim(), color: labelColor.toUpperCase(), appliesTo }); setLibraries(result); setLabelModal(false); setToast(editingLabel ? '标签已更新' : '标签创建成功') } catch (reason) { setError(reason instanceof Error ? reason.message : '标签保存失败') } }
  async function removeLabel(item: LabelItem) { if (!selected || !window.confirm(`确认删除标签“${item.name}”？`)) return; try { setLibraries(await labelApi.deleteLabel(selected.id, item.id)); setToast('标签已删除') } catch (reason) { setToast(reason instanceof Error ? reason.message : '删除失败') } }
  async function downloadTemplate() { try { await labelApi.downloadImportTemplate(); setToast('标签导入模板已下载') } catch (reason) { setToast(reason instanceof Error ? reason.message : '模板下载失败') } }
  async function imported(count: number) { setImportModal(false); setLoading(true); try { setLibraries(await labelApi.list()); setPage(1); setToast(`成功导入 ${count} 个标签`) } finally { setLoading(false) } }

  return <AppShell user={session.account}>
    <section className="management-page">
      <section className="management-panel panel">
        {selected ? <>
          <header className="management-toolbar detail-toolbar"><div className="detail-title"><button className="icon-button bordered" type="button" onClick={() => { setSelectedId(undefined); setPage(1) }}><ArrowLeft size={17} /></button><div><h2>{selected.name}</h2><p>{selected.desc || '暂无标签库描述'} · {selected.count} 个启用标签</p></div></div><div><button className="secondary-button" type="button" onClick={() => void downloadTemplate()}><Download size={16} />下载模板</button>{canWrite && <><button className="secondary-button" type="button" onClick={() => setImportModal(true)}><Upload size={16} />批量导入</button><button className="primary-button" type="button" onClick={() => openLabel()}><Plus size={16} />创建标签</button></>}</div></header>
          <div className="management-filters"><label><span>标签名称</span><div className="filter-control"><Search size={16} /><input value={keywordInput} onChange={(e) => setKeywordInput(e.target.value)} placeholder="请输入标签名称" /></div></label><button className="primary-button compact" type="button" onClick={() => { setKeyword(keywordInput.trim()); setPage(1) }}>查询</button><button className="secondary-button compact" type="button" onClick={() => { setKeyword(''); setKeywordInput(''); setPage(1) }}>重置</button></div>
          <div className="management-table-wrap"><table className="management-table"><thead><tr><th><input type="checkbox" aria-label="全选" /></th><th>标签名称</th><th>标签编码</th><th>标签颜色</th><th>适用层级</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead><tbody>{visibleTags.map((item) => <tr key={item.id}><td><input type="checkbox" aria-label={`选择${item.name}`} /></td><td><strong>{item.name}</strong></td><td><code>{item.code}</code></td><td><span className="color-value"><i style={{ background: item.color }} />{item.color}</span></td><td><span className="scope-tag">{item.appliesTo === 'goal' ? '单次任务' : item.appliesTo === 'action' ? '小目标' : '历史兼容'}</span></td><td><span className={`enabled-tag ${item.enabled ? '' : 'disabled'}`}>{item.enabled ? '启用' : '停用'}</span></td><td>{formatDateTime(item.createdAt)}</td><td><div className="row-actions">{canWrite && <><button type="button" onClick={() => openLabel(item)}><Edit3 size={15} />编辑</button><button className="danger-action" type="button" onClick={() => removeLabel(item)}><Trash2 size={15} />删除</button></>}</div></td></tr>)}{!filteredTags.length && <tr><td colSpan={8}><div className="management-empty"><Tags size={34} />暂无标签</div></td></tr>}</tbody></table></div><footer className="management-footer"><span>共 {filteredTags.length} 条</span><PaginationJump page={page} pages={pages} onChange={setPage} pageSize={pageSize} onPageSizeChange={(size) => { setPageSize(size); setPage(1) }} /></footer>
        </> : <>
          <header className="management-toolbar"><div><h2>标签库列表</h2><p>维护系统级共享标签及颜色</p></div>{canWrite && <button className="primary-button" type="button" onClick={() => openLibrary()}><Plus size={16} />创建标签库</button>}</header>
          <div className="management-filters"><label><span>标签库名称</span><div className="filter-control"><Search size={16} /><input value={keywordInput} onChange={(e) => setKeywordInput(e.target.value)} placeholder="请输入标签库名称" /></div></label><button className="primary-button compact" type="button" onClick={() => { setKeyword(keywordInput.trim()); setPage(1) }}>查询</button><button className="secondary-button compact" type="button" onClick={() => { setKeyword(''); setKeywordInput(''); setPage(1) }}>重置</button></div>
          <div className="management-table-wrap"><table className="management-table library-table"><thead><tr><th>标签库名称</th><th>标签库编码</th><th>描述</th><th>标签数量</th><th>创建时间</th><th>操作</th></tr></thead><tbody>{loading ? <tr><td colSpan={6}><div className="management-empty">正在加载标签库...</div></td></tr> : visibleLibraries.map((item) => <tr key={item.id}><td><div className="entity-name"><strong>{item.name}</strong><small>{item.enabled ? '系统共享' : '已停用'}</small></div></td><td><code>{item.code}</code></td><td>{item.desc || '-'}</td><td><strong className="count-link">{item.count}</strong></td><td>{formatDateTime(item.createdAt)}</td><td><div className="row-actions"><button type="button" onClick={() => { setSelectedId(item.id); setPage(1) }}><Eye size={15} />查看</button>{canWrite && <><button type="button" onClick={() => openLibrary(item)}><Edit3 size={15} />编辑</button><button className="danger-action" type="button" onClick={() => removeLibrary(item)}><Trash2 size={15} />删除</button><button className="icon-button small" type="button"><MoreHorizontal size={17} /></button></>}</div></td></tr>)}{!loading && !filteredLibraries.length && <tr><td colSpan={6}><div className="management-empty"><CircleAlert size={32} />未找到匹配标签库</div></td></tr>}</tbody></table></div><footer className="management-footer"><span>共 {filteredLibraries.length} 条</span><PaginationJump page={page} pages={pages} disabled={loading} onChange={setPage} pageSize={pageSize} onPageSizeChange={(size) => { setPageSize(size); setPage(1) }} /></footer>
        </>}
      </section>
    </section>
    {libraryModal && <Modal title={editingLibrary ? '编辑标签库' : '创建标签库'} onClose={() => setLibraryModal(false)} footer={<><button className="secondary-button" onClick={() => setLibraryModal(false)}>取消</button><button className="primary-button" type="submit" form="library-form">{editingLibrary ? '保存' : '创建'}</button></>}><form id="library-form" className="single-column-form" onSubmit={saveLibrary}><label><span>标签库名称 <i className="required-mark">*</i></span><input value={libraryName} onChange={(e) => setLibraryName(e.target.value)} maxLength={100} placeholder="请输入标签库名称" /></label><label><span>描述</span><textarea value={libraryDesc} onChange={(e) => setLibraryDesc(e.target.value)} maxLength={500} placeholder="请输入描述" /></label>{error && <p className="inline-error">{error}</p>}</form></Modal>}
    {labelModal && <Modal title={editingLabel ? '编辑标签' : '创建标签'} onClose={() => setLabelModal(false)} footer={<><button className="secondary-button" onClick={() => setLabelModal(false)}>取消</button><button className="primary-button" type="submit" form="label-form">保存</button></>}><form id="label-form" className="label-form" onSubmit={saveLabel}><label><span>标签名称 <i className="required-mark">*</i></span><input value={labelName} onChange={(e) => setLabelName(e.target.value)} maxLength={100} placeholder="请输入标签名称" /></label><label><span>标签颜色 <i className="required-mark">*</i></span><div className="color-input"><input type="color" value={labelColor} onChange={(e) => setLabelColor(e.target.value)} /><input value={labelColor} onChange={(e) => setLabelColor(e.target.value)} /></div></label><fieldset className="label-scope-options"><legend>适用层级 <i className="required-mark">*</i></legend><label><input type="radio" name="label-scope" checked={appliesTo === 'goal'} onChange={() => setAppliesTo('goal')} />单次任务</label><label><input type="radio" name="label-scope" checked={appliesTo === 'action'} onChange={() => setAppliesTo('action')} />小目标</label></fieldset>{error && <p className="inline-error">{error}</p>}</form></Modal>}
    {importModal && selected && <JsonImportModal title={`批量导入标签 · ${selected.name}`} rootKey="labels" itemName="标签" onClose={() => setImportModal(false)} onImport={(payload) => labelApi.importLabels(selected.id, payload)} onImported={(count) => void imported(count)} />}
    {toast && <div className="toast">{toast}</div>}
  </AppShell>
}
