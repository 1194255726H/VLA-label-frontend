import { Archive, ChevronDown, CircleAlert, Edit3, Eye, Pause, Play, Plus, RotateCcw, Search, Square, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { AppShell } from '../components/AppShell'
import { Modal } from '../components/Modal'
import { PaginationJump } from '../components/PaginationJump'
import { fleetApi, labelApi, mediaApi, projectApi, teamApi } from '../services/managementApi'
import type { FleetScene, FleetTask, LabelLibrary, ManagedProject, Member, ProjectPayload, ProjectStatus, SessionResponse, Team } from '../types/api'

const statusLabels: Record<ProjectStatus, string> = { 'not-started': '未启动', running: '进行中', paused: '已暂停', finished: '已结束', archived: '已归档' }
const statusActions: Record<ProjectStatus, Array<{ label: string; status: ProjectStatus; icon: typeof Play }>> = {
  'not-started': [{ label: '启动', status: 'running', icon: Play }], running: [{ label: '暂停', status: 'paused', icon: Pause }, { label: '结束', status: 'finished', icon: Square }], paused: [{ label: '恢复', status: 'running', icon: RotateCcw }, { label: '结束', status: 'finished', icon: Square }], finished: [{ label: '归档', status: 'archived', icon: Archive }], archived: [],
}
const emptyForm: ProjectPayload = { name: '', desc: '', teams: [], owner: '', deliveryAt: '', completionNode: '验收', modelGenerationNode: '标注', assignmentStrategy: 'manual_claim', labelLibraryIds: [], annotationGuideline: null }
const nodeOrder = ['标注', '质检', '审核', '验收'] as const
function localToday() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}` }

function duration(value: number) { if (!value) return '-'; const hours = Math.floor(value / 3600); const minutes = Math.floor(value % 3600 / 60); return `${hours}时${minutes}分` }

export function FleetSyncModal({ projectId, projectName, onClose, onSynced }: { projectId: string; projectName: string; onClose: () => void; onSynced: (message: string) => void }) {
  const [view, setView] = useState<'scenes' | 'tasks'>('scenes')
  const [scenes, setScenes] = useState<FleetScene[]>([])
  const [selectedScene, setSelectedScene] = useState('')
  const [sceneKeywordInput, setSceneKeywordInput] = useState('')
  const [sceneKeyword, setSceneKeyword] = useState('')
  const [scenePage, setScenePage] = useState(1)
  const [sceneTotal, setSceneTotal] = useState<number>()
  const [tasks, setTasks] = useState<FleetTask[]>([])
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<number>>(new Set())
  const [selectedTaskDetails, setSelectedTaskDetails] = useState<Map<number, FleetTask>>(new Map())
  const [taskKeywordInput, setTaskKeywordInput] = useState('')
  const [taskKeyword, setTaskKeyword] = useState('')
  const [taskPage, setTaskPage] = useState(1)
  const [taskTotal, setTaskTotal] = useState<number>()
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')
  const pageSize = 20

  useEffect(() => {
    if (!projectId || view !== 'scenes') return
    let active = true
    fleetApi.scenes(projectId, { keyword: sceneKeyword, page: scenePage, pageSize }).then((data) => {
      if (!active) return
      setScenes(data.items); setSceneTotal(data.total)
    }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Fleet 场景加载失败') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [projectId, sceneKeyword, scenePage, view])

  useEffect(() => {
    if (!projectId || !selectedScene || view !== 'tasks') return
    let active = true
    fleetApi.tasks(projectId, { scene: selectedScene, keyword: taskKeyword, page: taskPage, pageSize }).then((data) => {
      if (!active) return
      setTasks(data.items); setTaskTotal(data.total)
    }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Fleet 任务加载失败') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [projectId, selectedScene, taskKeyword, taskPage, view])

  const sceneHasNext = sceneTotal == null ? scenes.length === pageSize : scenePage * pageSize < sceneTotal
  const taskHasNext = taskTotal == null ? tasks.length === pageSize : taskPage * pageSize < taskTotal
  const scenePages = sceneTotal == null ? (sceneHasNext ? scenePage + 1 : scenePage) : Math.max(1, Math.ceil(sceneTotal / pageSize))
  const taskPages = taskTotal == null ? (taskHasNext ? taskPage + 1 : taskPage) : Math.max(1, Math.ceil(taskTotal / pageSize))
  const selectableTasks = tasks.filter((task) => task.availableCount > 0)
  const currentPageSelected = selectableTasks.length > 0 && selectableTasks.every((task) => selectedTaskIds.has(task.id))
  const selectedTasks = [...selectedTaskDetails.values()]
  const selectedAvailable = selectedTasks.reduce((sum, task) => sum + task.availableCount, 0)
  const selectedDuration = selectedTasks.reduce((sum, task) => sum + task.totalDuration, 0)

  function startLoading() { setLoading(true); setError('') }
  function openTasks() { if (!selectedScene) return; startLoading(); setTaskKeywordInput(''); setTaskKeyword(''); setTaskPage(1); setSelectedTaskIds(new Set()); setSelectedTaskDetails(new Map()); setView('tasks') }
  function toggleTask(id: number) {
    const task = tasks.find((item) => item.id === id); if (!task) return
    setSelectedTaskIds((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
    setSelectedTaskDetails((current) => { const next = new Map(current); if (next.has(id)) next.delete(id); else next.set(id, task); return next })
  }
  function togglePage() {
    setSelectedTaskIds((current) => { const next = new Set(current); selectableTasks.forEach((task) => currentPageSelected ? next.delete(task.id) : next.add(task.id)); return next })
    setSelectedTaskDetails((current) => { const next = new Map(current); selectableTasks.forEach((task) => currentPageSelected ? next.delete(task.id) : next.set(task.id, task)); return next })
  }
  async function sync(taskIds?: number[]) {
    if (!projectId || !selectedScene || syncing) return
    setSyncing(true); setError('')
    try {
      const result = await fleetApi.sync(projectId, selectedScene, taskIds)
      onSynced(`Fleet 同步完成：新增 ${result.createdCount} 个，更新 ${result.updatedCount} 个任务`)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Fleet 同步失败') }
    finally { setSyncing(false) }
  }

  const footer = view === 'scenes'
    ? <><button className="secondary-button" type="button" onClick={onClose}>取消</button><button className="secondary-button" type="button" disabled={!selectedScene || loading || syncing} onClick={openTasks}>选择任务同步</button><button className="primary-button" type="button" disabled={!selectedScene || loading || syncing} onClick={() => sync()}>{syncing ? '正在同步...' : '同步该场景全部数据'}</button></>
    : <><button className="secondary-button" type="button" onClick={onClose}>取消</button><button className="secondary-button" type="button" disabled={syncing} onClick={() => { startLoading(); setView('scenes') }}>上一步</button><button className="primary-button" type="button" disabled={!selectedTaskIds.size || syncing} onClick={() => sync([...selectedTaskIds])}>{syncing ? '正在同步...' : `同步所选任务（${selectedTaskIds.size}）`}</button></>

  return <Modal title="从 Fleet 同步数据" onClose={onClose} footer={footer}>
    <div className="fleet-sync-dialog">
      <div className="fleet-project-target"><span>同步到当前项目</span><strong>{projectName}</strong><small>{projectId}</small></div>
      {view === 'scenes' ? <>
        <div className="fleet-dialog-heading"><div><h3>选择场景</h3><p>从 Fleet 场景中选择整场同步，或进入任务列表选择部分任务</p></div><form className="fleet-search" onSubmit={(event) => { event.preventDefault(); startLoading(); setSelectedScene(''); setScenePage(1); setSceneKeyword(sceneKeywordInput.trim()) }}><Search size={16} /><input value={sceneKeywordInput} onChange={(event) => setSceneKeywordInput(event.target.value)} placeholder="搜索场景名称" /><button type="submit">查询</button></form></div>
        <div className="fleet-scene-grid">{loading ? <div className="fleet-dialog-empty">正在读取 Fleet 场景...</div> : scenes.map((scene) => <button type="button" className={selectedScene === scene.scene ? 'selected' : ''} key={scene.scene} onClick={() => setSelectedScene(scene.scene)}><i className="fleet-radio" /><span><strong>{scene.scene}</strong><small>{scene.taskCount} 个任务 · {scene.videoCount} 个视频 · {duration(scene.totalDuration)}</small></span></button>)}{!loading && !scenes.length && <div className="fleet-dialog-empty">未找到可同步场景</div>}</div>
        <div className="fleet-dialog-pagination"><span>{sceneTotal == null ? `第 ${scenePage} 页` : `共 ${sceneTotal} 个场景`}</span><PaginationJump page={scenePage} pages={scenePages} disabled={loading} onChange={(next) => { startLoading(); setSelectedScene(''); setScenePage(next) }} /></div>
      </> : <>
        <div className="fleet-dialog-heading"><div><h3>{selectedScene}</h3><p>选择需要同步的 Fleet 任务</p></div><form className="fleet-search" onSubmit={(event) => { event.preventDefault(); startLoading(); setTaskPage(1); setTaskKeyword(taskKeywordInput.trim()) }}><Search size={16} /><input value={taskKeywordInput} onChange={(event) => setTaskKeywordInput(event.target.value)} placeholder="搜索任务 ID、名称、设备或人员" /><button type="submit">查询</button></form></div>
        <div className="fleet-task-table-wrap"><table className="fleet-task-table"><thead><tr><th><input type="checkbox" checked={currentPageSelected} disabled={!selectableTasks.length} onChange={togglePage} aria-label="选择当前页可同步任务" /></th><th>任务编号 / 任务路径</th><th>设备 / 人员</th><th>视频数</th><th>当前项目已同步</th><th>可同步</th></tr></thead><tbody>{loading ? <tr><td colSpan={6}><div className="fleet-dialog-empty">正在读取 Fleet 任务...</div></td></tr> : tasks.map((task) => <tr key={task.id}><td><input type="checkbox" checked={selectedTaskIds.has(task.id)} disabled={!task.availableCount} onChange={() => toggleTask(task.id)} aria-label={`选择 ${task.externalTaskId}`} /></td><td><strong>{task.externalTaskId}</strong><small>{task.path || task.name || '-'}</small></td><td><span>{[task.device, task.operator].filter(Boolean).join(' / ') || '-'}</span></td><td>{task.videoCount}</td><td>{task.syncedCount}</td><td><b className={task.availableCount ? 'available' : ''}>{task.availableCount}</b></td></tr>)}{!loading && !tasks.length && <tr><td colSpan={6}><div className="fleet-dialog-empty">未找到匹配任务</div></td></tr>}</tbody></table></div>
        <div className="fleet-task-summary"><span>已选 <b>{selectedTaskIds.size}</b> 个任务</span><span>预计同步 <b>{selectedAvailable}</b> 个视频</span><span>总时长 <b>{duration(selectedDuration)}</b></span><PaginationJump page={taskPage} pages={taskPages} disabled={loading} onChange={(next) => { startLoading(); setTaskPage(next) }} /></div>
      </>}
      {error && <p className="inline-error fleet-sync-error">{error}</p>}
    </div>
  </Modal>
}

export function ProjectManagementPage({ session }: { session: SessionResponse }) {
  const [items, setItems] = useState<ManagedProject[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<ProjectStatus | 'all'>('all')
  const [keywordInput, setKeywordInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [team, setTeam] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [step, setStep] = useState<1 | 2>(1)
  const [editingId, setEditingId] = useState<string>()
  const [form, setForm] = useState<ProjectPayload>(emptyForm)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [teams, setTeams] = useState<Team[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [labelLibraries, setLabelLibraries] = useState<LabelLibrary[]>([])
  const [loadingLabelLibraries, setLoadingLabelLibraries] = useState(false)
  const [labelKeyword, setLabelKeyword] = useState('')
  const [labelPickerOpen, setLabelPickerOpen] = useState(false)
  const [uploadingGuideline, setUploadingGuideline] = useState(false)
  const [openingProjectId, setOpeningProjectId] = useState('')
  const projectPermissionIdentities = [...session.account.roles, ...session.account.roleLabels]
    .map((value) => value.toLowerCase().replace(/[\s_-]/g, ''))
  const canCreateProject = Boolean(session.account.isStaff || session.account.isSuperuser || projectPermissionIdentities.some((value) => ['admin', 'systemadmin', '管理员', '系统管理员', '超级管理员', '系统超级管理员'].includes(value)))

  useEffect(() => { Promise.all([projectApi.list(), teamApi.getData(false)]).then(([projects, teamData]) => { setItems(projects); setTeams(teamData.teams); setMembers(teamData.members) }).finally(() => setLoading(false)) }, [])
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 2500); return () => clearTimeout(timer) }, [toast])

  const counts = useMemo(() => Object.fromEntries(Object.keys(statusLabels).map((key) => [key, items.filter((item) => item.status === key).length])), [items])
  const filtered = useMemo(() => items.filter((item) => (status === 'all' || item.status === status) && (!keyword || `${item.name}${item.code}`.toLowerCase().includes(keyword.toLowerCase())) && (!team || item.teams.includes(team))), [items, keyword, status, team])

  async function loadLabelLibraryOptions() {
    setLoadingLabelLibraries(true)
    try { setLabelLibraries(await labelApi.listSummaries()) }
    catch (reason) { setToast(reason instanceof Error ? reason.message : '标签库加载失败') }
    finally { setLoadingLabelLibraries(false) }
  }
  function openCreate() { setEditingId(undefined); setForm(emptyForm); setLabelKeyword(''); setLabelPickerOpen(false); setUploadingGuideline(false); setStep(1); setError(''); setModalOpen(true); void loadLabelLibraryOptions() }
  async function openEdit(item: ManagedProject) {
    if (item.status === 'archived') return setToast('已归档项目不可编辑')
    void loadLabelLibraryOptions()
    setOpeningProjectId(item.id); setError('')
    try {
      const detail = await projectApi.detail(item.id)
      setEditingId(detail.id); setForm({ projectId: detail.id, name: detail.name, desc: detail.desc, teams: [...(detail.teamIds || [])], owner: detail.ownerId || '', deliveryAt: detail.deliveryAt, completionNode: detail.completionNode, modelGenerationNode: detail.modelGenerationNode || '标注', assignmentStrategy: detail.assignmentStrategy || 'manual_claim', labelLibraryIds: [...detail.labelLibraryIds], annotationGuideline: detail.annotationGuideline || null }); setLabelKeyword(''); setLabelPickerOpen(false); setUploadingGuideline(false); setStep(1); setModalOpen(true)
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
    if (step === 1) { if (!form.name.trim() || !form.teams.length || !form.owner || !form.deliveryAt) return setError('请完整填写项目名称、团队、负责人和交付时间'); if (!editingId && form.deliveryAt < localToday()) return setError('交付时间不能早于项目创建时间'); setStep(2); return }
    if (!form.completionNode) return setError('请选择任务结束节点')
    if (nodeOrder.indexOf(form.modelGenerationNode) > nodeOrder.indexOf(form.completionNode)) return setError('模型生成环节不能晚于任务结束节点')
    if (form.annotationGuideline?.type === 'link') {
      const { displayName, url } = form.annotationGuideline
      if (!displayName.trim() || !url.trim()) return setError('请完整填写标注规则名称和 HTTPS 链接')
      try { const parsed = new URL(url); if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error() } catch { return setError('标注规则链接必须是不含账号密码的 HTTPS 地址') }
    }
    if (form.annotationGuideline?.type === 'file') {
      if (!form.annotationGuideline.displayName.trim() || !form.annotationGuideline.url.trim()) return setError('请先上传标注规则文件')
    }
    try { setItems(await projectApi.save({ ...form, projectId: editingId })); setModalOpen(false); setToast(editingId ? '项目已更新' : '项目创建成功') } catch (reason) { setError(reason instanceof Error ? reason.message : '项目保存失败') }
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
          <div className="status-segments"><button className={status === 'all' ? 'active' : ''} onClick={() => setStatus('all')} type="button">全部 <span>{items.length}</span></button>{Object.entries(statusLabels).map(([key, label]) => <button className={status === key ? 'active' : ''} onClick={() => setStatus(key as ProjectStatus)} type="button" key={key}>{label} <span>{counts[key] || 0}</span></button>)}</div>
          {canCreateProject && <button className="primary-button" type="button" onClick={openCreate}><Plus size={16} />创建项目</button>}
        </header>
        <div className="management-filters">
          <label><span>项目名称</span><div className="filter-control"><Search size={16} /><input value={keywordInput} onChange={(event) => setKeywordInput(event.target.value)} placeholder="请输入项目名称或编号" /></div></label>
          <label><span>所属团队</span><div className="filter-control select"><select value={team} onChange={(event) => setTeam(event.target.value)}><option value="">全部团队</option>{teams.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select><ChevronDown size={14} /></div></label>
          <button className="primary-button compact" type="button" onClick={() => setKeyword(keywordInput.trim())}>查询</button><button className="secondary-button compact" type="button" onClick={() => { setKeywordInput(''); setKeyword(''); setTeam('') }}>重置</button>
        </div>
        <div className="management-table-wrap"><table className="management-table project-table"><thead><tr><th>项目名称</th><th>状态</th><th>团队</th><th>标注人数</th><th>数据量</th><th>有效时长</th><th>单次任务数</th><th>小目标数</th><th>完成节点</th><th>进度</th><th>负责人</th><th>交付时间</th><th>操作</th></tr></thead><tbody>
          {loading ? <tr><td colSpan={13}><div className="management-empty">正在加载项目...</div></td></tr> : filtered.map((item) => <tr key={item.id}><td><div className="entity-name"><strong>{item.name}</strong><small>{item.code}</small></div></td><td><span className={`project-status ${item.status}`}>{statusLabels[item.status]}</span></td><td title={item.teams.join('、')}>{item.teams.join('、')}</td><td>{item.memberCount}</td><td>{item.dataCount}</td><td>{duration(item.validDuration)}</td><td>{item.goalCount}</td><td>{item.actionCount}</td><td><span className="node-tag blue">{item.completionNode}</span></td><td><div className="progress-cell"><span><i style={{ width: `${item.progress}%` }} /></span><b>{item.progress}%</b></div></td><td>{item.owner}</td><td><span className={new Date(item.deliveryAt) < new Date() && item.status !== 'finished' ? 'risk-date' : ''}>{item.deliveryAt}</span></td><td><div className="row-actions"><button type="button" onClick={() => { window.location.hash = `/projects/${encodeURIComponent(item.id)}/annotation-data` }}><Eye size={15} />查看</button><button type="button" disabled={item.status === 'archived' || Boolean(openingProjectId)} title={item.status === 'archived' ? '已归档项目不可编辑' : undefined} onClick={() => void openEdit(item)}><Edit3 size={15} />{openingProjectId === item.id ? '加载中' : '编辑'}</button>{statusActions[item.status].map(({ label, status: next, icon: Icon }) => <button key={label} type="button" onClick={() => changeStatus(item, next)}><Icon size={15} />{label}</button>)}<button className="danger-action" type="button" onClick={() => removeProject(item)}><Trash2 size={15} />删除</button></div></td></tr>)}
          {!loading && !filtered.length && <tr><td colSpan={13}><div className="management-empty"><CircleAlert size={32} />未找到匹配项目</div></td></tr>}
        </tbody></table></div>
        <footer className="management-footer"><span>共 {filtered.length} 条</span><div className="pagination"><button disabled type="button">‹</button><strong>1</strong><button disabled type="button">›</button><span>10条/页</span></div></footer>
      </section>
    </section>
    {modalOpen && <Modal title={editingId ? '编辑项目' : '创建项目'} onClose={() => setModalOpen(false)} footer={<><button className="secondary-button" type="button" disabled={uploadingGuideline} onClick={() => step === 2 ? setStep(1) : setModalOpen(false)}>{step === 2 ? '上一步' : '取消'}</button><button className="primary-button" type="submit" form="project-form" disabled={uploadingGuideline}>{uploadingGuideline ? '文件上传中...' : step === 1 ? '下一步' : editingId ? '保存' : '创建项目'}</button></>}>
      <form id="project-form" className="project-form" onSubmit={submit}>
        <div className="form-steps"><span className="active">1 基本信息</span><i /><span className={step === 2 ? 'active' : ''}>2 项目配置</span></div>
        {step === 1 ? <div className="modal-form-grid"><label><span>项目名称 <i className="required-mark">*</i></span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="请输入项目名称" /></label><label><span>交付时间 <i className="required-mark">*</i></span><input type="date" min={editingId ? undefined : localToday()} value={form.deliveryAt} onChange={(e) => setForm({ ...form, deliveryAt: e.target.value })} /></label><label><span>所属团队 <i className="required-mark">*</i></span><select value={form.teams[0] || ''} onChange={(e) => setForm({ ...form, teams: e.target.value ? [e.target.value] : [] })}><option value="">请选择团队</option>{teams.filter((item) => item.enabled).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label><span>项目负责人 <i className="required-mark">*</i></span><select value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })}><option value="">请选择负责人</option>{members.filter((item) => item.enabled && item.roles.includes('项目经理')).map((item) => <option key={item.accountId} value={item.accountId}>{item.name}</option>)}</select></label><label className="wide"><span>项目描述</span><textarea value={form.desc} maxLength={500} onChange={(e) => setForm({ ...form, desc: e.target.value })} placeholder="请输入项目背景和范围" /></label></div> : <div className="modal-form-grid">
          <label><span>任务结束节点 <i className="required-mark">*</i></span><select value={form.completionNode} onChange={(e) => { const completionNode = e.target.value as ProjectPayload['completionNode']; setForm({ ...form, completionNode, modelGenerationNode: nodeOrder.indexOf(form.modelGenerationNode) > nodeOrder.indexOf(completionNode) ? completionNode : form.modelGenerationNode }) }}><option>质检</option><option>审核</option><option>验收</option></select></label>
          <label><span>模型生成环节 <i className="required-mark">*</i></span><select value={form.modelGenerationNode} onChange={(e) => setForm({ ...form, modelGenerationNode: e.target.value as ProjectPayload['modelGenerationNode'] })}>{nodeOrder.filter((node) => nodeOrder.indexOf(node) <= nodeOrder.indexOf(form.completionNode)).map((node) => <option key={node}>{node}</option>)}</select></label>
          <label><span>分配策略</span><select value={form.assignmentStrategy} onChange={(e) => setForm({ ...form, assignmentStrategy: e.target.value as ProjectPayload['assignmentStrategy'] })}><option value="manual_claim">人工领取</option><option value="load_balance">负载均衡</option><option value="average">平均分配</option></select></label>
          <label><span>标注规则</span><select value={form.annotationGuideline?.type || ''} disabled={uploadingGuideline} onChange={(e) => setForm({ ...form, annotationGuideline: e.target.value === 'link' ? { type: 'link', displayName: '标注规则', url: '' } : e.target.value === 'file' ? { type: 'file', displayName: '', url: '' } : null })}><option value="">不设置</option><option value="link">链接</option><option value="file">上传文件</option></select></label>
          <div className="wide project-field"><span>关联标签库</span><div className="label-library-picker" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setLabelPickerOpen(false) }}>
            <div className="label-library-input">{form.labelLibraryIds.map((id) => { const library = labelLibraries.find((item) => item.id === id); return library ? <span className="selected-library" key={id}>{library.name}<button type="button" aria-label={`移除${library.name}`} onClick={() => setForm({ ...form, labelLibraryIds: form.labelLibraryIds.filter((item) => item !== id) })}><X size={12} /></button></span> : null })}<input value={labelKeyword} onFocus={() => setLabelPickerOpen(true)} onChange={(e) => { setLabelKeyword(e.target.value); setLabelPickerOpen(true) }} placeholder={form.labelLibraryIds.length ? '继续输入搜索' : '输入标签库名称搜索'} /></div>
            {labelPickerOpen && <div className="label-library-options">{loadingLabelLibraries ? <p>正在加载标签库...</p> : <>{labelLibraries.filter((library) => library.enabled && library.name.toLowerCase().includes(labelKeyword.trim().toLowerCase())).map((library) => <button type="button" className={form.labelLibraryIds.includes(library.id) ? 'selected' : ''} key={library.id} onClick={() => setForm({ ...form, labelLibraryIds: form.labelLibraryIds.includes(library.id) ? form.labelLibraryIds.filter((id) => id !== library.id) : [...form.labelLibraryIds, library.id] })}><span>{library.name}</span><small>{form.labelLibraryIds.includes(library.id) ? '已选择' : library.code}</small></button>)}{!labelLibraries.some((library) => library.enabled && library.name.toLowerCase().includes(labelKeyword.trim().toLowerCase())) && <p>未找到匹配的标签库</p>}</>}</div>}
          </div></div>
          {form.annotationGuideline?.type === 'link' && <><label><span>规则名称 <i className="required-mark">*</i></span><input value={form.annotationGuideline.displayName} onChange={(e) => updateLinkGuideline({ displayName: e.target.value })} placeholder="例如：标注规则" /></label><label><span>HTTPS 链接 <i className="required-mark">*</i></span><input type="url" value={form.annotationGuideline.url} onChange={(e) => updateLinkGuideline({ url: e.target.value })} placeholder="https://example.com/guideline" /></label></>}
          {form.annotationGuideline?.type === 'file' && <div className="wide project-field"><span>规则文件 <i className="required-mark">*</i></span><div className="guideline-upload-row"><input type="file" disabled={uploadingGuideline} onChange={(e) => void uploadGuideline(e.target.files?.[0])} />{uploadingGuideline && <small>正在上传...</small>}{!uploadingGuideline && form.annotationGuideline.url && <a href={form.annotationGuideline.url} target="_blank" rel="noreferrer">已上传：{form.annotationGuideline.displayName}</a>}</div><p className="guideline-hint">文件大小限制 20MB，上传成功后会自动关联到项目。</p></div>}
        </div>}
        {error && <p className="inline-error">{error}</p>}
      </form>
    </Modal>}
    {toast && <div className="toast">{toast}</div>}
  </AppShell>
}
