import { Archive, ChevronDown, CircleAlert, Edit3, Eye, Pause, Play, Plus, RotateCcw, Search, Square, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { AppShell } from '../components/AppShell'
import { Modal } from '../components/Modal'
import { ProjectSupplierSelect } from '../components/ProjectSupplierSelect'
import { formatDateTime } from '../utils/date'
import { PaginationJump } from '../components/PaginationJump'
import { fleetApi, labelApi, mediaApi, operationObjectApi, projectApi, teamApi } from '../services/managementApi'
import type { FleetSupplierOption, LabelLibrary, ManagedProject, Member, OperationObjectLibrary, ProjectPayload, ProjectStatus, SessionResponse, Team } from '../types/api'
import { nodeToneByLabel } from '../utils/node'

const statusLabels: Record<ProjectStatus, string> = { 'not-started': '未启动', running: '进行中', paused: '已暂停', finished: '已结束', archived: '已归档' }
const statusActions: Record<ProjectStatus, Array<{ label: string; status: ProjectStatus; icon: typeof Play }>> = {
  'not-started': [{ label: '启动', status: 'running', icon: Play }], running: [{ label: '暂停', status: 'paused', icon: Pause }, { label: '结束', status: 'finished', icon: Square }], paused: [{ label: '恢复', status: 'running', icon: RotateCcw }, { label: '结束', status: 'finished', icon: Square }], finished: [{ label: '归档', status: 'archived', icon: Archive }], archived: [],
}
const emptyForm: ProjectPayload = { supplierId: '', fleetSupplierId: '', name: '', desc: '', teams: [], owner: '', deliveryAt: '', completionNode: '验收', modelGenerationNode: '标注', assignmentStrategy: 'manual_claim', labelLibraryIds: [], operationLibraryId: '', annotationGuideline: null }
const nodeOrder = ['标注', '质检', '审核', '验收'] as const
function localToday() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}` }

function duration(value: number) {
  if (!Number.isFinite(value)) return '-'
  const totalSeconds = Math.max(0, Math.round(value))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor(totalSeconds % 3600 / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':')
}

export function ProjectManagementPage({ session }: { session: SessionResponse }) {
  const [items, setItems] = useState<ManagedProject[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<ProjectStatus | 'all'>('all')
  const [keywordInput, setKeywordInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [team, setTeam] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [modalOpen, setModalOpen] = useState(false)
  const [step, setStep] = useState<1 | 2>(1)
  const [editingId, setEditingId] = useState<string>()
  const [editingReadOnly, setEditingReadOnly] = useState(false)
  const [form, setForm] = useState<ProjectPayload>(emptyForm)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [teams, setTeams] = useState<Team[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const projectOwners = members.filter((item) => item.enabled && item.roles.includes('项目经理'))
  const [labelLibraries, setLabelLibraries] = useState<LabelLibrary[]>([])
  const [loadingLabelLibraries, setLoadingLabelLibraries] = useState(false)
  const [operationLibraries, setOperationLibraries] = useState<OperationObjectLibrary[]>([])
  const [labelKeyword, setLabelKeyword] = useState('')
  const [labelPickerOpen, setLabelPickerOpen] = useState(false)
  const [uploadingGuideline, setUploadingGuideline] = useState(false)
  const [openingProjectId, setOpeningProjectId] = useState('')
  const [supplierOptions, setSupplierOptions] = useState<FleetSupplierOption[]>([])
  const [editingSupplier, setEditingSupplier] = useState<FleetSupplierOption>()
  const [suppliersLoading, setSuppliersLoading] = useState(false)
  const [supplierError, setSupplierError] = useState('')
  const [originalSupplier, setOriginalSupplier] = useState<{ supplierId: string; fleetSupplierId: string }>({ supplierId: '', fleetSupplierId: '' })
  const allSupplierOptions = editingSupplier && !supplierOptions.some((option) => option.localId === editingSupplier.localId) ? [...supplierOptions, editingSupplier] : supplierOptions
  const supplierChoices = allSupplierOptions.map((option) => {
    const bound = items.find((project) => project.id !== editingId && (project.supplier?.id === option.localId || (project.fleetSupplierId || project.supplier?.fleetSupplierId) === option.fleetSupplierId))
    return { ...option, boundProject: bound?.name }
  })
  async function loadSupplierOptions() {
    setSuppliersLoading(true); setSupplierError('')
    try { const [options, projects] = await Promise.all([fleetApi.suppliers(), projectApi.list()]); setSupplierOptions(options); setItems(projects) }
    catch (reason) { setSupplierError(reason instanceof Error ? reason.message : '供应商加载失败') }
    finally { setSuppliersLoading(false) }
  }
  function supplierValid() {
    const choice = supplierChoices.find((option) => option.localId === form.supplierId && option.fleetSupplierId === form.fleetSupplierId)
    return !suppliersLoading && !supplierError && Boolean(choice && !choice.boundProject)
  }
  const projectPermissionIdentities = [...session.account.roles, ...session.account.roleLabels]
    .map((value) => value.toLowerCase().replace(/[\s_-]/g, ''))
  const canCreateProject = Boolean(session.account.isStaff || session.account.isSuperuser || projectPermissionIdentities.some((value) => [
    'admin', 'administrator', 'normaladmin', 'generaladmin', 'platformadmin', 'projectadmin', 'systemadmin',
    '管理员', '普通管理员', '项目管理员', '平台管理员', '系统管理员', '超级管理员', '系统超级管理员',
  ].includes(value)))

  useEffect(() => { Promise.all([projectApi.list(), teamApi.getData(false)]).then(([projects, teamData]) => { setItems(projects); setTeams(teamData.teams); setMembers(teamData.members) }).finally(() => setLoading(false)) }, [])
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 2500); return () => clearTimeout(timer) }, [toast])

  const counts = useMemo(() => Object.fromEntries(Object.keys(statusLabels).map((key) => [key, items.filter((item) => item.status === key).length])), [items])
  const filtered = useMemo(() => items.filter((item) => (status === 'all' || item.status === status) && (!keyword || `${item.name}${item.code}`.toLowerCase().includes(keyword.toLowerCase())) && (!team || item.teams.includes(team))), [items, keyword, status, team])
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, pages)
  const visibleProjects = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  async function loadLabelLibraryOptions() {
    setLoadingLabelLibraries(true)
    try { const [labels, operations] = await Promise.all([labelApi.listSummaries(), operationObjectApi.listLibraries({ pageSize: 100 })]); setLabelLibraries(labels); setOperationLibraries(operations.items) }
    catch (reason) { setToast(reason instanceof Error ? reason.message : '标注配置加载失败') }
    finally { setLoadingLabelLibraries(false) }
  }
  function openCreate() { setEditingId(undefined); setEditingSupplier(undefined); setOriginalSupplier({ supplierId: '', fleetSupplierId: '' }); void loadSupplierOptions(); setEditingReadOnly(false); setForm(emptyForm); setLabelKeyword(''); setLabelPickerOpen(false); setUploadingGuideline(false); setStep(1); setError(''); setModalOpen(true); void loadLabelLibraryOptions() }
  async function openEdit(item: ManagedProject) {
    if (item.status === 'archived') return setToast('已归档项目不可编辑')
    setEditingReadOnly(!['not-started', 'paused'].includes(item.status))
    void loadLabelLibraryOptions()
    void loadSupplierOptions()
    setOpeningProjectId(item.id); setError('')
    try {
      const detail = await projectApi.detail(item.id)
      setEditingId(detail.id); setOriginalSupplier({ supplierId: detail.supplier?.id || '', fleetSupplierId: detail.fleetSupplierId || detail.supplier?.fleetSupplierId || '' }); setEditingSupplier(detail.supplier ? { localId: detail.supplier.id, fleetSupplierId: detail.supplier.fleetSupplierId, name: detail.supplier.name, code: detail.supplier.code, type: detail.supplier.type } : undefined); setForm({ supplierId: detail.supplier?.id || '', fleetSupplierId: detail.fleetSupplierId || detail.supplier?.fleetSupplierId || '', projectId: detail.id, name: detail.name, desc: detail.desc, teams: [...(detail.teamIds || [])], owner: detail.ownerId || '', deliveryAt: detail.deliveryAt, completionNode: detail.completionNode, modelGenerationNode: detail.modelGenerationNode || '标注', assignmentStrategy: detail.assignmentStrategy || 'manual_claim', labelLibraryIds: [...detail.labelLibraryIds], operationLibraryId: detail.operationLibraryId, annotationGuideline: detail.annotationGuideline || null }); setLabelKeyword(''); setLabelPickerOpen(false); setUploadingGuideline(false); setStep(1); setModalOpen(true)
    } catch (reason) { setToast(reason instanceof Error ? reason.message : '项目详情加载失败') }
    finally { setOpeningProjectId('') }
  }
  function updateLinkGuideline(patch: Partial<{ displayName: string; url: string }>) { setForm((current) => current.annotationGuideline?.type === 'link' ? { ...current, annotationGuideline: { ...current.annotationGuideline, ...patch } } : current) }
  function updateFileGuideline(patch: Partial<{ displayName: string; url: string }>) { setForm((current) => current.annotationGuideline?.type === 'file' ? { ...current, annotationGuideline: { ...current.annotationGuideline, ...patch } } : current) }
  async function uploadGuideline(file?: File) {
    if (!file) return
    if (file.size < 1) return setError('不能上传空文件')
    if (file.size > 20 * 1024 * 1024) return setError('标注规则文件不能超过 20MB')
    setUploadingGuideline(true); setError('')
    try { const uploaded = await mediaApi.upload(file); updateFileGuideline({ displayName: uploaded.displayName, url: uploaded.url }) }
    catch (reason) { setError(reason instanceof Error ? reason.message : '标注规则文件上传失败') }
    finally { setUploadingGuideline(false) }
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('')
    if (editingReadOnly) return
    if (!supplierValid()) { setStep(1); return setError(suppliersLoading ? '供应商仍在加载，请稍后重试' : supplierError || '请选择未被其它项目绑定的供应商') }
    if (step === 1) { if (!form.name.trim() || !form.teams.length) return setError('请完整填写项目名称和团队'); if (editingId && (!form.owner || !form.deliveryAt)) return setError('请完整填写负责人和交付时间'); if (form.deliveryAt && form.deliveryAt < localToday()) return setError('交付时间不能早于当前日期'); setStep(2); return }
    if (!form.completionNode) return setError('请选择任务结束节点')
    if (!form.operationLibraryId) return setError('必须选择操作对象库')
    if (nodeOrder.indexOf(form.modelGenerationNode) > nodeOrder.indexOf(form.completionNode)) return setError('模型生成环节不能晚于任务结束节点')
    if (form.annotationGuideline?.type === 'link') {
      const { displayName, url } = form.annotationGuideline
      if (!displayName.trim() || !url.trim()) return setError('请完整填写标注规则名称和 HTTPS 链接')
      try { const parsed = new URL(url); if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error() } catch { return setError('标注规则链接必须是不含账号密码的 HTTPS 地址') }
    }
    if (form.annotationGuideline?.type === 'file') {
      if (!form.annotationGuideline.displayName.trim() || !form.annotationGuideline.url.trim()) return setError('请先上传标注规则文件')
    }
    try { setItems(await projectApi.save({ ...form, projectId: editingId, deliveryAt: form.deliveryAt || '2099-01-01', ...(editingId && form.supplierId === originalSupplier.supplierId && form.fleetSupplierId === originalSupplier.fleetSupplierId ? { supplierId: undefined, fleetSupplierId: undefined } : {}) })); setModalOpen(false); setToast(editingId ? '项目已更新' : '项目创建成功') } catch (reason) { setError(reason instanceof Error ? reason.message : '项目保存失败') }
  }
  async function changeStatus(item: ManagedProject, next: ProjectStatus) {
    if (next === 'archived' && !window.confirm(`确认归档项目“${item.name}”？归档后将不能再编辑。`)) return
    try { setItems(await projectApi.setStatus(item.id, next)); setToast(`${item.name}已${statusLabels[next]}`) } catch (reason) { setToast(reason instanceof Error ? reason.message : '状态变更失败') }
  }
  async function removeProject(item: ManagedProject) { if (!window.confirm(`确认删除项目“${item.name}”？`)) return; try { setItems(await projectApi.delete(item.id)); setToast('项目已删除') } catch (reason) { setToast(reason instanceof Error ? reason.message : '项目删除失败') } }

  return <AppShell user={session.account}>
    <section className="management-page">
      <section className="management-panel panel">
        <header className="management-toolbar">
          <div className="status-segments"><button className={status === 'all' ? 'active' : ''} onClick={() => { setStatus('all'); setPage(1) }} type="button">全部 <span>{items.length}</span></button>{Object.entries(statusLabels).map(([key, label]) => <button className={status === key ? 'active' : ''} onClick={() => { setStatus(key as ProjectStatus); setPage(1) }} type="button" key={key}>{label} <span>{counts[key] || 0}</span></button>)}</div>
          {canCreateProject && <button className="primary-button" type="button" onClick={openCreate}><Plus size={16} />创建项目</button>}
        </header>
        <div className="management-filters">
          <label><span>项目名称</span><div className="filter-control"><Search size={16} /><input value={keywordInput} onChange={(event) => setKeywordInput(event.target.value)} placeholder="请输入项目名称或编号" /></div></label>
          <label><span>所属团队</span><div className="filter-control select"><select value={team} onChange={(event) => { setTeam(event.target.value); setPage(1) }}><option value="">全部团队</option>{teams.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select><ChevronDown size={14} /></div></label>
          <button className="primary-button compact" type="button" onClick={() => { setKeyword(keywordInput.trim()); setPage(1) }}>查询</button><button className="secondary-button compact" type="button" onClick={() => { setKeywordInput(''); setKeyword(''); setTeam(''); setPage(1) }}>重置</button>
        </div>
        <div className="management-table-wrap"><table className="management-table project-table"><thead><tr><th>项目名称</th><th>供应商</th><th>最近自动同步时间</th><th>状态</th><th>团队</th><th>标注人数</th><th>数据量</th><th>视频时长</th><th>有效片段时长</th><th>无效片段时长</th><th title="视频时长 − 有效片段时长 − 无效片段时长">未处理时长</th><th>单次任务数</th><th>小目标数</th><th>完成节点</th><th>进度</th><th>负责人</th><th>交付时间</th><th>操作</th></tr></thead><tbody>
          {loading ? <tr><td colSpan={18}><div className="management-empty">正在加载项目...</div></td></tr> : visibleProjects.map((item) => <tr key={item.id}><td><div className="entity-name"><strong>{item.name}</strong><small>{item.code}</small></div></td><td title={item.supplier?.name}>{item.supplier?.name || '未绑定（手动同步）'}</td><td>{item.autoSyncTime ? formatDateTime(item.autoSyncTime) : '-'}</td><td><span className={`project-status ${item.status}`}>{statusLabels[item.status]}</span></td><td title={item.teams.join('、')}>{item.teams.join('、')}</td><td>{item.memberCount}</td><td>{item.dataCount}</td><td>{duration(item.duration || 0)}</td><td>{duration(item.validDuration)}</td><td>{duration(item.invalidDuration)}</td><td>{duration(Math.max(0, (item.duration || 0) - item.validDuration - item.invalidDuration))}</td><td>{item.goalCount}</td><td>{item.actionCount}</td><td><span className={`node-tag ${nodeToneByLabel(item.completionNode)}`}>{item.completionNode}</span></td><td><div className="progress-cell"><span><i style={{ width: `${item.progress}%` }} /></span><b>{item.progress}%</b></div></td><td>{item.owner}</td><td><span className={new Date(item.deliveryAt) < new Date() && item.status !== 'finished' ? 'risk-date' : ''}>{item.deliveryAt || '-'}</span></td><td><div className="row-actions"><button type="button" onClick={() => { window.location.hash = `/projects/${encodeURIComponent(item.id)}/annotation-data` }}><Eye size={15} />查看</button><button type="button" disabled={item.status === 'archived' || Boolean(openingProjectId)} title={item.status === 'archived' ? '已归档项目不可编辑' : item.status === 'running' ? '进行中项目仅可查看，暂停后可编辑' : item.status === 'finished' ? '已结束项目仅可查看' : undefined} onClick={() => void openEdit(item)}><Edit3 size={15} />{openingProjectId === item.id ? '加载中' : '编辑'}</button>{statusActions[item.status].map(({ label, status: next, icon: Icon }) => <button key={label} type="button" onClick={() => changeStatus(item, next)}><Icon size={15} />{label}</button>)}<button className="danger-action" type="button" onClick={() => removeProject(item)}><Trash2 size={15} />删除</button></div></td></tr>)}
          {!loading && !filtered.length && <tr><td colSpan={18}><div className="management-empty"><CircleAlert size={32} />未找到匹配项目</div></td></tr>}
        </tbody></table></div>
        <footer className="management-footer"><span>共 {filtered.length} 条</span><PaginationJump page={page} pages={pages} disabled={loading} onChange={setPage} pageSize={pageSize} onPageSizeChange={(size) => { setPageSize(size); setPage(1) }} /></footer>
      </section>
    </section>
    {modalOpen && <Modal title={editingReadOnly ? '查看项目' : editingId ? '编辑项目' : '创建项目'} onClose={() => setModalOpen(false)} footer={editingReadOnly ? <><button className="secondary-button" type="button" onClick={() => step === 2 ? setStep(1) : setModalOpen(false)}>{step === 2 ? '上一步' : '关闭'}</button><button className="primary-button" type="button" onClick={() => step === 1 ? setStep(2) : setModalOpen(false)}>{step === 1 ? '下一步' : '关闭'}</button></> : <><button className="secondary-button" type="button" disabled={uploadingGuideline} onClick={() => step === 2 ? setStep(1) : setModalOpen(false)}>{step === 2 ? '上一步' : '取消'}</button><button className="primary-button" type="submit" form="project-form" disabled={uploadingGuideline}>{uploadingGuideline ? '文件上传中...' : step === 1 ? '下一步' : editingId ? '保存' : '创建项目'}</button></>}>
      <form id="project-form" className="project-form" onSubmit={submit}>
        {editingReadOnly && <p className="project-readonly-notice">当前项目状态仅支持查看；项目处于未启动或已暂停状态时可修改配置。</p>}
        <fieldset className="project-form-fields" disabled={editingReadOnly}>
        <div className="form-steps"><span className="active">1 基本信息</span><i /><span className={step === 2 ? 'active' : ''}>2 项目配置</span></div>
        {step === 1 ? <div className="modal-form-grid"><div className="wide project-field"><span>供应商 <i className="required-mark">*</i></span><ProjectSupplierSelect value={form.supplierId || ''} options={supplierChoices} loading={suppliersLoading} disabled={editingReadOnly} onChange={(option) => setForm({ ...form, supplierId: option.localId, fleetSupplierId: option.fleetSupplierId })} /><small className="guideline-hint">进行中的项目会每 10 分钟自动同步绑定供应商的新增视频。</small>{supplierError && <p className="inline-error">{supplierError} <button type="button" onClick={() => void loadSupplierOptions()}>重新加载供应商</button></p>}</div><label><span>项目名称 <i className="required-mark">*</i></span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="请输入项目名称" /></label><label><span>交付时间 {editingId && <i className="required-mark">*</i>}</span><input type="date" min={localToday()} value={form.deliveryAt} onChange={(e) => setForm({ ...form, deliveryAt: e.target.value })} /></label><label><span>所属团队 <i className="required-mark">*</i></span><select value={form.teams[0] || ''} onChange={(e) => setForm({ ...form, teams: e.target.value ? [e.target.value] : [] })}><option value="">请选择团队</option>{teams.filter((item) => item.enabled).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label><span>项目负责人 {editingId && <i className="required-mark">*</i>}</span><select value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })}><option value="">请选择负责人</option>{projectOwners.map((item) => <option key={item.accountId} value={item.accountId}>{item.name}</option>)}</select></label><label className="wide"><span>项目描述</span><textarea value={form.desc} maxLength={500} onChange={(e) => setForm({ ...form, desc: e.target.value })} placeholder="请输入项目背景和范围" /></label></div> : <div className="modal-form-grid">
          <label><span>任务结束节点 <i className="required-mark">*</i></span><select value={form.completionNode} onChange={(e) => { const completionNode = e.target.value as ProjectPayload['completionNode']; setForm({ ...form, completionNode, modelGenerationNode: nodeOrder.indexOf(form.modelGenerationNode) > nodeOrder.indexOf(completionNode) ? completionNode : form.modelGenerationNode }) }}><option>标注</option><option>质检</option><option>审核</option><option>验收</option></select></label>
          <label><span>模型生成环节 <i className="required-mark">*</i></span><select value={form.modelGenerationNode} onChange={(e) => setForm({ ...form, modelGenerationNode: e.target.value as ProjectPayload['modelGenerationNode'] })}>{nodeOrder.filter((node) => nodeOrder.indexOf(node) <= nodeOrder.indexOf(form.completionNode)).map((node) => <option key={node}>{node}</option>)}</select></label>
          <label><span>分配策略</span><select value={form.assignmentStrategy} onChange={(e) => setForm({ ...form, assignmentStrategy: e.target.value as ProjectPayload['assignmentStrategy'] })}><option value="manual_claim">人工领取</option><option value="load_balance">负载均衡</option><option value="average">平均分配</option></select></label>
          <label><span>操作对象库 <i className="required-mark">*</i></span><select value={form.operationLibraryId} disabled={loadingLabelLibraries} onChange={(e) => setForm({ ...form, operationLibraryId: e.target.value })}><option value="">{loadingLabelLibraries ? '正在加载对象库...' : '请选择操作对象库'}</option>{operationLibraries.map((library) => <option value={library.id} key={library.id}>{library.name}</option>)}</select></label>
          <label><span>标注规则</span><select value={form.annotationGuideline?.type || ''} disabled={uploadingGuideline} onChange={(e) => setForm({ ...form, annotationGuideline: e.target.value === 'link' ? { type: 'link', displayName: '标注规则', url: '' } : e.target.value === 'file' ? { type: 'file', displayName: '', url: '' } : null })}><option value="">不设置</option><option value="link">链接</option><option value="file">上传文件</option></select></label>
          <div className="wide project-field"><span>关联标签库</span><div className="label-library-picker" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setLabelPickerOpen(false) }}>
            <div className="label-library-input">{form.labelLibraryIds.map((id) => { const library = labelLibraries.find((item) => item.id === id); return library ? <span className="selected-library" key={id}>{library.name}<button type="button" aria-label={`移除${library.name}`} onClick={() => setForm({ ...form, labelLibraryIds: form.labelLibraryIds.filter((item) => item !== id) })}><X size={12} /></button></span> : null })}<input value={labelKeyword} onFocus={() => setLabelPickerOpen(true)} onChange={(e) => { setLabelKeyword(e.target.value); setLabelPickerOpen(true) }} placeholder={form.labelLibraryIds.length ? '继续输入搜索' : '输入标签库名称搜索'} /></div>
            {labelPickerOpen && <div className="label-library-options">{loadingLabelLibraries ? <p>正在加载标签库...</p> : <>{labelLibraries.filter((library) => library.enabled && library.name.toLowerCase().includes(labelKeyword.trim().toLowerCase())).map((library) => <button type="button" className={form.labelLibraryIds.includes(library.id) ? 'selected' : ''} key={library.id} onClick={() => setForm({ ...form, labelLibraryIds: form.labelLibraryIds.includes(library.id) ? form.labelLibraryIds.filter((id) => id !== library.id) : [...form.labelLibraryIds, library.id] })}><span>{library.name}</span><small>{form.labelLibraryIds.includes(library.id) ? '已选择' : library.code}</small></button>)}{!labelLibraries.some((library) => library.enabled && library.name.toLowerCase().includes(labelKeyword.trim().toLowerCase())) && <p>未找到匹配的标签库</p>}</>}</div>}
          </div></div>
          {form.annotationGuideline?.type === 'link' && <><label><span>规则名称 <i className="required-mark">*</i></span><input value={form.annotationGuideline.displayName} onChange={(e) => updateLinkGuideline({ displayName: e.target.value })} placeholder="例如：标注规则" /></label><label><span>HTTPS 链接 <i className="required-mark">*</i></span><input type="url" value={form.annotationGuideline.url} onChange={(e) => updateLinkGuideline({ url: e.target.value })} placeholder="https://example.com/guideline" /></label></>}
          {form.annotationGuideline?.type === 'file' && <div className="wide project-field"><span>规则文件 <i className="required-mark">*</i></span><div className="guideline-upload-row"><input type="file" disabled={uploadingGuideline} onChange={(e) => void uploadGuideline(e.target.files?.[0])} />{uploadingGuideline && <small>正在上传...</small>}{!uploadingGuideline && form.annotationGuideline.url && <a href={form.annotationGuideline.url} target="_blank" rel="noreferrer">已上传：{form.annotationGuideline.displayName}</a>}</div><p className="guideline-hint">文件大小限制 20MB，上传成功后会自动关联到项目。</p></div>}
        </div>}
        </fieldset>
        {error && <p className="inline-error">{error}</p>}
      </form>
    </Modal>}
    {toast && <div className="toast">{toast}</div>}
  </AppShell>
}
