import { CircleAlert, Edit3, Eye, Plus, Search, Trash2 } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { Modal } from '../components/Modal'
import { PaginationJump } from '../components/PaginationJump'
import { labelApi, operationObjectApi, teamApi } from '../services/managementApi'
import { productApi, productStatusLabels, productTransitions } from '../services/productApi'
import type { Product, ProductAssociation, ProductPayload, ProductQuery, ProductStatus, SessionResponse } from '../types/api'
import { canManageInvalidSamples } from '../utils/permissions'

const emptyForm: ProductPayload = { name: '', description: '', deliveryAt: '', ownerId: '', teamIds: [], labelLibraryIds: [], operationLibraryIds: [] }
const productColumns = ['生产项目名称', '项目描述', '项目负责人', '状态', '团队', '标注人数', '数据集数', '数据量', '待标注量', '视频时长', '有效时长', '无效时长', '未处理时长', '单次任务数', '小目标数', '处理进度', '交付时间', '操作']
function duration(seconds: number) { const total = Math.max(0, Math.round(seconds)); return [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60].map((part) => String(part).padStart(2, '0')).join(':') }
function mergeOptions(options: ProductAssociation[], selected: ProductAssociation[] = []) { return [...options, ...selected.filter((item) => !options.some((option) => option.id === item.id))] }

export function ProductManagementPage({ session }: { session: SessionResponse }) {
  const navigate = useNavigate()
  const canManage = canManageInvalidSamples(session.account)
  const [query, setQuery] = useState<ProductQuery>({ page: 1, pageSize: 10 })
  const [filters, setFilters] = useState({ name: '', teamId: '', ownerId: '' })
  const [items, setItems] = useState<Product[]>([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [refresh, setRefresh] = useState(0)
  const [loadedKey, setLoadedKey] = useState('')
  const requestKey = JSON.stringify([query, refresh])
  const loading = loadedKey !== requestKey
  const [loadError, setError] = useState('')
  const error = loading ? '' : loadError
  const [toast, setToast] = useState('')
  const [busy, setBusy] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Product>()
  const [form, setForm] = useState<ProductPayload>(emptyForm)
  const [formError, setFormError] = useState('')
  const [associationSearch, setAssociationSearch] = useState({ teamIds: '', labelLibraryIds: '', operationLibraryIds: '' })
  const [options, setOptions] = useState<{ teams: ProductAssociation[]; owners: ProductAssociation[]; labels: ProductAssociation[]; operations: ProductAssociation[] }>({ teams: [], owners: [], labels: [], operations: [] })
  const [loadedOptions, setLoadedOptions] = useState(-1)
  const [optionsError, setOptionsError] = useState('')
  const [optionsRefresh, setOptionsRefresh] = useState(0)
  const optionsLoading = loadedOptions !== optionsRefresh
  const readOnly = editing?.status === 'finished'
  const additionsOnly = editing?.status === 'running' || editing?.status === 'paused'

  useEffect(() => {
    let active = true
    productApi.list(query).then((result) => { if (active) { setError(''); setItems(result.items); setTotal(result.total); setPages(result.pages); if (query.page > result.pages) setQuery((current) => ({ ...current, page: result.pages })) } })
      .catch((reason) => { if (active) { setItems([]); setError(reason instanceof Error ? reason.message : '生产项目加载失败') } }).finally(() => { if (active) setLoadedKey(requestKey) })
    return () => { active = false }
  }, [query, refresh, requestKey])
  useEffect(() => {
    let active = true
    Promise.all([teamApi.getData(false), labelApi.listSummaries(), operationObjectApi.allLibraries()]).then(([data, labels, operations]) => {
      if (!active) return
      const manager = (roles: string[]) => roles.some((role) => ['projectmanager', '项目经理'].includes(role.toLowerCase().replace(/[\s_-]/g, '')))
      setOptionsError('')
      setOptions({ teams: data.teams.filter((team) => team.enabled).map((team) => ({ id: team.id, name: team.name })), owners: data.members.filter((member) => member.enabled && manager(member.roles)).map((member) => ({ id: member.accountId, name: member.name })), labels: labels.filter((library) => library.enabled), operations: operations })
    }).catch((reason) => { if (active) setOptionsError(reason instanceof Error ? reason.message : '配置选项加载失败') }).finally(() => { if (active) setLoadedOptions(optionsRefresh) })
    return () => { active = false }
  }, [optionsRefresh])
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 3500); return () => clearTimeout(timer) }, [toast])

  async function openForm(item?: Product) {
    setBusy(true); setFormError('')
    try {
      const detail = item ? await productApi.detail(item.id) : undefined
      setEditing(detail)
      setAssociationSearch({ teamIds: '', labelLibraryIds: '', operationLibraryIds: '' })
      setForm(detail ? { name: detail.name, description: detail.description, deliveryAt: detail.deliveryAt, ownerId: detail.ownerId, teamIds: detail.teams.map((team) => team.id), labelLibraryIds: detail.labelLibraries.map((library) => library.id), operationLibraryIds: detail.operationLibraries.map((library) => library.id) } : { ...emptyForm })
      setModalOpen(true)
    } catch (reason) { setToast(reason instanceof Error ? reason.message : '详情加载失败') }
    finally { setBusy(false) }
  }
  function toggle(key: 'teamIds' | 'labelLibraryIds' | 'operationLibraryIds', id: string) { setForm((current) => ({ ...current, [key]: current[key].includes(id) ? current[key].filter((value) => value !== id) : [...current[key], id] })) }
  function choices(label: string, key: 'teamIds' | 'labelLibraryIds' | 'operationLibraryIds', available: ProductAssociation[], original: ProductAssociation[] = [], required = false) {
    const all = mergeOptions(available, original)
    const keyword = associationSearch[key].trim().toLowerCase()
    const filtered = all.filter((item) => item.name.toLowerCase().includes(keyword))
    return <fieldset className="product-association-picker wide"><legend>{label}{required && <i className="required-mark"> *</i>}</legend>
      <label className="product-association-search"><Search size={14} /><input type="search" aria-label={`搜索${label}`} placeholder={`输入${label}名称搜索`} value={associationSearch[key]} onChange={(event) => setAssociationSearch((current) => ({ ...current, [key]: event.target.value }))} onKeyDown={(event) => { if (event.key === 'Enter') event.preventDefault() }} /></label>
      <div>{filtered.map((item) => <label key={item.id}><input type="checkbox" checked={form[key].includes(item.id)} disabled={readOnly || busy || (additionsOnly && original.some((entry) => entry.id === item.id))} onChange={() => toggle(key, item.id)} />{item.name}</label>)}{!filtered.length && <span>{keyword ? '未找到匹配项' : '暂无可选项'}</span>}</div>
    </fieldset>
  }
  async function save(event: FormEvent) {
    event.preventDefault()
    if (!canManage || busy || readOnly || optionsLoading || optionsError) return
    setBusy(true); setFormError('')
    try { await productApi.save(form, editing?.id); setModalOpen(false); setToast(editing ? '生产项目已更新' : '生产项目创建成功'); setRefresh((value) => value + 1) }
    catch (reason) { setFormError(reason instanceof Error ? reason.message : '保存失败') }
    finally { setBusy(false) }
  }
  async function changeStatus(item: Product, next: ProductStatus) {
    if (!window.confirm(`确认将“${item.name}”设为${productStatusLabels[next]}？${next === 'finished' ? '结束后不可编辑，也不能创建新数据集。' : ''}旗下数据集状态不会自动改变。`)) return
    setBusy(true)
    try { await productApi.setStatus(item.id, next); setRefresh((value) => value + 1); setToast(`${item.name} ${productStatusLabels[next]}`) }
    catch (reason) { setToast(reason instanceof Error ? reason.message : '状态变更失败') }
    finally { setBusy(false) }
  }
  async function remove(item: Product) {
    if (!window.confirm(`确认删除生产项目“${item.name}”及旗下数据集？旗下存在视频时无法删除。`)) return
    setBusy(true)
    try { await productApi.delete(item.id); setRefresh((value) => value + 1); setToast('生产项目已删除') }
    catch (reason) { setToast(reason instanceof Error ? reason.message : '删除失败') }
    finally { setBusy(false) }
  }

  return <AppShell user={session.account}><section className="management-page"><section className="management-panel panel">
    <header className="management-toolbar"><div><h2>生产项目</h2><p className="hierarchy-caption">生产项目 → 数据集 → 视频</p></div>{canManage && <button type="button" className="primary-button" disabled={busy} onClick={() => void openForm()}><Plus size={16} />创建生产项目</button>}</header>
    <div className="status-segments product-status-tabs"><button type="button" className={!query.status ? 'active' : ''} onClick={() => setQuery((current) => ({ ...current, page: 1, status: undefined }))}>全部</button>{Object.entries(productStatusLabels).map(([status, label]) => <button type="button" key={status} className={query.status === status ? 'active' : ''} onClick={() => setQuery((current) => ({ ...current, page: 1, status: status as ProductStatus }))}>{label}</button>)}</div>
    <form className="management-filters product-filters" onSubmit={(event) => { event.preventDefault(); setQuery((current) => ({ ...current, ...filters, name: filters.name.trim(), page: 1 })) }}>
      <label><span>生产项目名称</span><div className="filter-control"><Search size={16} /><input value={filters.name} onChange={(event) => setFilters({ ...filters, name: event.target.value })} placeholder="请输入生产项目名称" /></div></label>
      <label><span>团队</span><select value={filters.teamId} onChange={(event) => setFilters({ ...filters, teamId: event.target.value })}><option value="">全部团队</option>{options.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
      <label><span>负责人</span><select value={filters.ownerId} onChange={(event) => setFilters({ ...filters, ownerId: event.target.value })}><option value="">全部负责人</option>{options.owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}</select></label>
      <button type="submit" className="primary-button compact">查询</button><button type="button" className="secondary-button compact" onClick={() => { setFilters({ name: '', teamId: '', ownerId: '' }); setQuery({ page: 1, pageSize: query.pageSize }) }}>重置</button>
    </form>
    {error && <div className="error-banner"><CircleAlert size={18} />{error}<button type="button" onClick={() => setRefresh((value) => value + 1)}>重新加载</button></div>}
    <div className="management-table-wrap"><table className="management-table product-table"><thead><tr>{productColumns.map((label) => <th key={label}>{label}</th>)}</tr></thead><tbody>
      {loading ? <tr><td colSpan={productColumns.length}><div className="management-empty">正在加载生产项目...</div></td></tr> : items.map((item) => <tr key={item.id}>
        <td><div className="entity-name"><strong>{item.name}</strong><small>ID: {item.id}</small></div></td><td className="product-description-column" title={item.description || undefined}>{item.description || '-'}</td><td>{item.ownerName || '-'}</td><td><span className={`project-status ${item.status.replace('_', '-')}`}>{productStatusLabels[item.status]}</span></td><td>{item.teams.map((team) => team.name).join('、') || '-'}</td>
        <td>{item.annotatorCount}</td><td>{item.datasetCount}</td><td>{item.videoCount}</td><td>{item.pendingAnnotationCount}</td><td>{duration(item.duration)}</td><td>{duration(item.effectiveDurationMs / 1000)}</td><td>{duration(item.invalidDurationMs / 1000)}</td><td>{duration(item.unprocessedDurationMs / 1000)}</td><td>{item.atomicTaskCount}</td><td>{item.atomicActionCount}</td><td>{item.progressPercent.toFixed(2)}%</td><td>{item.deliveryAt || '-'}</td>
        <td><div className="row-actions"><button type="button" onClick={() => navigate(`/products/${encodeURIComponent(item.id)}/datasets`)}><Eye size={15} />数据集</button><button type="button" disabled={busy} onClick={() => void openForm(item)}><Edit3 size={15} />{!canManage || item.status === 'finished' ? '详情' : '编辑'}</button>{canManage && <>{productTransitions[item.status].map((next) => <button type="button" key={next} disabled={busy} onClick={() => void changeStatus(item, next)}>{next === 'running' ? item.status === 'paused' ? '恢复' : '启动' : next === 'paused' ? '暂停' : '结束'}</button>)}<button type="button" className="danger-action" disabled={busy} onClick={() => void remove(item)}><Trash2 size={15} />删除</button></>}</div></td>
      </tr>)}{!loading && !items.length && <tr><td colSpan={productColumns.length}><div className="management-empty">暂无生产项目</div></td></tr>}
    </tbody></table></div>
    <footer className="management-footer"><span>共 {total} 条</span><PaginationJump page={query.page} pages={pages} disabled={loading} onChange={(page) => setQuery({ ...query, page })} pageSize={query.pageSize} onPageSizeChange={(pageSize) => setQuery({ ...query, pageSize, page: 1 })} /></footer>
  </section></section>
    {modalOpen && <Modal title={`${readOnly || !canManage ? '查看' : editing ? '编辑' : '创建'}生产项目`} onClose={() => { if (!busy) setModalOpen(false) }} footer={<><button type="button" className="secondary-button" disabled={busy} onClick={() => setModalOpen(false)}>{readOnly || !canManage ? '关闭' : '取消'}</button>{!readOnly && canManage && <button type="submit" form="product-form" className="primary-button" disabled={busy || optionsLoading || Boolean(optionsError)}>{busy ? '保存中...' : '保存'}</button>}</>}>
      <form id="product-form" className="project-form" onSubmit={save}>
        {additionsOnly && <p className="project-readonly-notice">进行中或暂停时，团队、标签库和对象库只能新增，不能移除；数据集状态不会自动改变。</p>}
        {optionsError && <p className="inline-error">{optionsError} <button type="button" onClick={() => setOptionsRefresh((value) => value + 1)}>重新加载选项</button></p>}
        <fieldset className="project-form-fields" disabled={busy || optionsLoading || readOnly || !canManage}><div className="modal-form-grid">
          <label><span>生产项目名称 <i className="required-mark">*</i></span><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <label><span>交付时间 <i className="required-mark">*</i></span><input type="date" required value={form.deliveryAt} onChange={(event) => setForm({ ...form, deliveryAt: event.target.value })} /></label>
          <label><span>负责人 <i className="required-mark">*</i></span><select required value={form.ownerId} onChange={(event) => setForm({ ...form, ownerId: event.target.value })}><option value="">请选择项目经理</option>{mergeOptions(options.owners, editing?.ownerId ? [{ id: editing.ownerId, name: editing.ownerName }] : []).map((owner) => <option value={owner.id} key={owner.id}>{owner.name}</option>)}</select></label>
          <label className="wide"><span>描述</span><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
          {choices('团队', 'teamIds', options.teams, editing?.teams, true)}
          {choices('标签库', 'labelLibraryIds', options.labels, editing?.labelLibraries)}
          {choices('操作对象库', 'operationLibraryIds', options.operations, editing?.operationLibraries, true)}
        </div></fieldset>{formError && <p className="inline-error">{formError}</p>}
      </form>
    </Modal>}{toast && <div className="toast">{toast}</div>}
  </AppShell>
}
