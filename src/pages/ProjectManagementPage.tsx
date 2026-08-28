import { Archive, ChevronDown, CircleAlert, Edit3, Eye, Pause, Play, Plus, RotateCcw, Search, Square, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { AppShell } from '../components/AppShell'
import { Modal } from '../components/Modal'
import { PaginationJump } from '../components/PaginationJump'
import { fleetApi, labelApi, mediaApi, operationObjectApi, projectApi, teamApi } from '../services/managementApi'
import type { FleetVideoGroup, FleetVideoPreview, LabelLibrary, ManagedProject, Member, OperationObjectLibrary, ProjectPayload, ProjectStatus, SessionResponse, Team } from '../types/api'

const statusLabels: Record<ProjectStatus, string> = { 'not-started': '未启动', running: '进行中', paused: '已暂停', finished: '已结束', archived: '已归档' }
const statusActions: Record<ProjectStatus, Array<{ label: string; status: ProjectStatus; icon: typeof Play }>> = {
  'not-started': [{ label: '启动', status: 'running', icon: Play }], running: [{ label: '暂停', status: 'paused', icon: Pause }, { label: '结束', status: 'finished', icon: Square }], paused: [{ label: '恢复', status: 'running', icon: RotateCcw }, { label: '结束', status: 'finished', icon: Square }], finished: [{ label: '归档', status: 'archived', icon: Archive }], archived: [],
}
const emptyForm: ProjectPayload = { name: '', desc: '', teams: [], owner: '', deliveryAt: '', completionNode: '验收', modelGenerationNode: '标注', assignmentStrategy: 'manual_claim', labelLibraryIds: [], operationLibraryId: '', annotationGuideline: null }
const nodeOrder = ['标注', '质检', '审核', '验收'] as const
function localToday() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}` }

function duration(value: number) { if (!value) return '-'; const hours = Math.floor(value / 3600); const minutes = Math.floor(value % 3600 / 60); return `${hours}时${minutes}分` }

export function FleetSyncModal({ projectId, projectName, onClose, onSynced }: { projectId: string; projectName: string; onClose: () => void; onSynced: (message: string) => void }) {
  const [level, setLevel] = useState<1 | 2 | 3>(1)
  const [groups, setGroups] = useState<FleetVideoGroup[]>([])
  const [selectedScene1Ids, setSelectedScene1Ids] = useState<Set<number>>(new Set())
  const [selectedScene2Keys, setSelectedScene2Keys] = useState<Set<string>>(new Set())
  const [keyword, setKeyword] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [videos, setVideos] = useState<FleetVideoPreview[]>([])
  const [selectedVideoIds, setSelectedVideoIds] = useState<Set<number>>(new Set())
  const [videoKeywordInput, setVideoKeywordInput] = useState('')
  const [videoKeyword, setVideoKeyword] = useState('')
  const [videoPage, setVideoPage] = useState(1)
  const [videoPages, setVideoPages] = useState(1)
  const [videoTotal, setVideoTotal] = useState(0)
  const [videosLoading, setVideosLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!projectId) return
    let active = true
    fleetApi.videoGroups(projectId).then((data) => { if (active) setGroups(data) })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Fleet 视频分组加载失败') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [projectId])

  const scene2Key = (group: Pick<FleetVideoGroup, 'scene1Id' | 'scene2Id'>) => `${group.scene1Id}:${group.scene2Id}`
  const suppliers = [...new Map(groups.map((group) => [group.supplierId, group.supplierName])).entries()]
  const supplierGroups = groups.filter((group) => !supplierId || group.supplierId === Number(supplierId))
  const scene1Rows = [...new Map(supplierGroups.map((group) => [group.scene1Id, { id: group.scene1Id, name: group.scene1Name }])).values()].map((scene) => {
    const children = supplierGroups.filter((group) => group.scene1Id === scene.id)
    return { ...scene, supplierCount: new Set(children.map((group) => group.supplierId)).size, videoCount: children.reduce((sum, group) => sum + group.videoCount, 0), syncableCount: children.reduce((sum, group) => sum + group.syncableCount, 0) }
  }).filter((row) => !keyword.trim() || row.name.toLowerCase().includes(keyword.trim().toLowerCase()))
  const scene2Rows = [...new Map(supplierGroups.filter((group) => selectedScene1Ids.has(group.scene1Id)).map((group) => [scene2Key(group), { scene1Id: group.scene1Id, scene1Name: group.scene1Name, scene2Id: group.scene2Id, scene2Name: group.scene2Name }])).values()].map((scene) => {
    const children = supplierGroups.filter((group) => group.scene1Id === scene.scene1Id && group.scene2Id === scene.scene2Id)
    return { ...scene, supplierCount: new Set(children.map((group) => group.supplierId)).size, videoCount: children.reduce((sum, group) => sum + group.videoCount, 0), syncableCount: children.reduce((sum, group) => sum + group.syncableCount, 0) }
  }).filter((row) => !keyword.trim() || `${row.scene1Name}${row.scene2Name}`.toLowerCase().includes(keyword.trim().toLowerCase()))
  const selectedScene2 = scene2Rows.find((row) => selectedScene2Keys.has(scene2Key(row)))
  const previewScene1Id = selectedScene2?.scene1Id
  const previewScene2Id = selectedScene2?.scene2Id
  const selectedGroups = supplierGroups.filter((group) => level === 1 ? selectedScene1Ids.has(group.scene1Id) : selectedScene2Keys.has(scene2Key(group)))
  const selectedVideoCount = selectedGroups.reduce((sum, group) => sum + group.syncableCount, 0)
  const selectableScene1Rows = scene1Rows.filter((row) => row.syncableCount > 0)
  const selectableScene2Rows = scene2Rows.filter((row) => row.syncableCount > 0)
  const allVisibleSelected = level === 1
    ? selectableScene1Rows.length > 0 && selectableScene1Rows.every((row) => selectedScene1Ids.has(row.id))
    : level === 2 ? selectableScene2Rows.length > 0 && selectableScene2Rows.every((row) => selectedScene2Keys.has(scene2Key(row)))
      : videos.some((video) => !video.synced) && videos.filter((video) => !video.synced).every((video) => selectedVideoIds.has(video.fleetVideoId))
  function toggleScene1(id: number) { setSelectedScene1Ids((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next }) }
  function toggleScene2(row: { scene1Id: number; scene2Id: number }) { const key = scene2Key(row); setSelectedScene2Keys((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next }) }
  function toggleVisible() {
    if (level === 1) setSelectedScene1Ids((current) => { const next = new Set(current); selectableScene1Rows.forEach((row) => allVisibleSelected ? next.delete(row.id) : next.add(row.id)); return next })
    else if (level === 2) setSelectedScene2Keys((current) => { const next = new Set(current); selectableScene2Rows.forEach((row) => allVisibleSelected ? next.delete(scene2Key(row)) : next.add(scene2Key(row))); return next })
    else setSelectedVideoIds((current) => { const next = new Set(current); videos.filter((video) => !video.synced).forEach((video) => allVisibleSelected ? next.delete(video.fleetVideoId) : next.add(video.fleetVideoId)); return next })
  }
  useEffect(() => {
    if (level !== 3 || !previewScene1Id || !previewScene2Id) return
    let active = true
    fleetApi.videos(projectId, { scene1Id: previewScene1Id, scene2Id: previewScene2Id, supplierId: supplierId ? Number(supplierId) : undefined, keyword: videoKeyword, page: videoPage, pageSize: 20 })
      .then((result) => { if (active) { setVideos(result.items); setVideoTotal(result.total); setVideoPages(result.pages) } })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Fleet 视频明细加载失败') })
      .finally(() => { if (active) setVideosLoading(false) })
    return () => { active = false }
  }, [level, previewScene1Id, previewScene2Id, projectId, supplierId, videoKeyword, videoPage])
  async function sync() {
    if (!projectId || (level === 3 ? !selectedVideoIds.size : !selectedGroups.length) || syncing) return
    setSyncing(true); setError('')
    try {
      const result = await fleetApi.sync(projectId, level === 3 ? { videoIds: [...selectedVideoIds] } : { groups: selectedGroups })
      onSynced(`Fleet 视频同步完成：新增 ${result.createdCount}，更新 ${result.updatedCount}，跳过 ${result.skippedCount}`)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Fleet 同步失败') }
    finally { setSyncing(false) }
  }

  const selectedCount = level === 1 ? selectedScene1Ids.size : level === 2 ? selectedScene2Keys.size : selectedVideoIds.size
  const footer = <><button className="secondary-button" type="button" onClick={onClose}>取消</button>{level > 1 && <button className="secondary-button" type="button" disabled={syncing} onClick={() => { if (level === 3) { setLevel(2); setSelectedVideoIds(new Set()); setVideos([]) } else { setLevel(1); setSelectedScene2Keys(new Set()) }; setKeyword('') }}>上一步</button>}{level === 1
    ? <button className="secondary-button" type="button" disabled={!selectedScene1Ids.size || syncing} onClick={() => { setLevel(2); setKeyword('') }}>下一步：选择二级场景</button>
    : level === 2 ? <button className="secondary-button" type="button" disabled={selectedScene2Keys.size !== 1 || syncing} title={selectedScene2Keys.size > 1 ? '预览具体视频时请选择一个二级场景' : undefined} onClick={() => { setVideosLoading(true); setLevel(3); setVideoPage(1); setVideoKeyword(''); setVideoKeywordInput(''); setSelectedVideoIds(new Set()) }}>下一步：选择具体视频</button> : null}<button className="primary-button" type="button" disabled={(level === 3 ? !selectedVideoIds.size : !selectedGroups.length) || syncing} onClick={() => void sync()}>{syncing ? '正在同步...' : level === 3 ? `同步所选视频（${selectedVideoIds.size}）` : `同步当前选择（${selectedVideoCount}）`}</button></>

  return <Modal title="从 Fleet 同步数据" onClose={onClose} footer={footer}>
    <div className="fleet-sync-dialog">
      <div className="fleet-project-target"><span>同步到当前项目</span><strong>{projectName}</strong><small>{projectId}</small></div>
      <div className="fleet-dialog-heading"><div><h3>{level === 1 ? '选择一级场景' : level === 2 ? '选择二级场景' : '选择具体视频'}</h3><p>{level === 1 ? '可直接同步一级场景，或继续细分' : level === 2 ? '可直接同步二级场景，预览视频时请单选一个二级场景' : `${selectedScene2?.scene1Name || ''} / ${selectedScene2?.scene2Name || ''}`}</p></div>{level < 3 ? <><div className="fleet-search"><Search size={16} /><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder={`搜索${level === 1 ? '一级' : '二级'}场景名称`} /></div><label className="fleet-search"><select value={supplierId} onChange={(event) => { setSupplierId(event.target.value); if (level === 1) setSelectedScene1Ids(new Set()); setSelectedScene2Keys(new Set()) }}><option value="">全部供应商</option>{suppliers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label></> : <form className="fleet-search" onSubmit={(event) => { event.preventDefault(); setVideosLoading(true); setVideoPage(1); setVideoKeyword(videoKeywordInput.trim()) }}><Search size={16} /><input value={videoKeywordInput} onChange={(event) => setVideoKeywordInput(event.target.value)} placeholder="搜索视频文件名" /><button type="submit">查询</button></form>}</div>
      <div className="fleet-task-table-wrap"><table className="fleet-task-table"><thead>{level < 3 ? <tr><th><input type="checkbox" checked={allVisibleSelected} disabled={loading || !(level === 1 ? selectableScene1Rows.length : selectableScene2Rows.length)} onChange={toggleVisible} aria-label="全选当前场景" /></th><th>一级场景</th>{level === 2 && <th>二级场景</th>}<th>来源供应商</th><th>视频数量</th><th>可同步数量</th></tr> : <tr><th><input type="checkbox" checked={allVisibleSelected} disabled={videosLoading || !videos.some((video) => !video.synced)} onChange={toggleVisible} aria-label="全选当前页未同步视频" /></th><th>视频文件名</th><th>场景 / 供应商</th><th>时长</th><th>文件大小</th><th>状态</th></tr>}</thead><tbody>{level < 3 ? loading ? <tr><td colSpan={level === 1 ? 5 : 6}><div className="fleet-dialog-empty">正在读取 Fleet 视频分组...</div></td></tr> : level === 1 ? scene1Rows.map((row) => <tr key={row.id}><td><input type="checkbox" checked={selectedScene1Ids.has(row.id)} disabled={!row.syncableCount} onChange={() => toggleScene1(row.id)} /></td><td><strong>{row.name || '-'}</strong></td><td>{row.supplierCount} 个供应商</td><td>{row.videoCount}</td><td><b className={row.syncableCount ? 'available' : ''}>{row.syncableCount}</b></td></tr>) : scene2Rows.map((row) => <tr key={scene2Key(row)}><td><input type="checkbox" checked={selectedScene2Keys.has(scene2Key(row))} disabled={!row.syncableCount} onChange={() => toggleScene2(row)} /></td><td>{row.scene1Name || '-'}</td><td><strong>{row.scene2Name || '-'}</strong></td><td>{row.supplierCount} 个供应商</td><td>{row.videoCount}</td><td><b className={row.syncableCount ? 'available' : ''}>{row.syncableCount}</b></td></tr>) : videosLoading ? <tr><td colSpan={6}><div className="fleet-dialog-empty">正在读取 Fleet 视频...</div></td></tr> : videos.map((video) => <tr key={video.fleetVideoId}><td><input type="checkbox" checked={selectedVideoIds.has(video.fleetVideoId)} disabled={video.synced} onChange={() => setSelectedVideoIds((current) => { const next = new Set(current); if (next.has(video.fleetVideoId)) next.delete(video.fleetVideoId); else next.add(video.fleetVideoId); return next })} /></td><td><strong>{video.filename}</strong><small>ID: {video.fleetVideoId}</small></td><td>{video.scene1Name} / {video.scene2Name}<small>{video.supplierName}</small></td><td>{video.duration == null ? '-' : duration(video.duration)}</td><td>{video.fileSize == null ? '-' : `${(video.fileSize / 1024 / 1024).toFixed(1)} MB`}</td><td><b className={video.synced ? '' : 'available'}>{video.synced ? '已同步' : '可同步'}</b></td></tr>)}{!loading && !videosLoading && !(level === 1 ? scene1Rows.length : level === 2 ? scene2Rows.length : videos.length) && <tr><td colSpan={level === 1 ? 5 : 6}><div className="fleet-dialog-empty">{level === 3 ? '未找到匹配视频' : '未找到可同步场景'}</div></td></tr>}</tbody></table></div>
      <div className="fleet-task-summary"><span>已选 <b>{selectedCount}</b> 个{level === 1 ? '一级场景' : level === 2 ? '二级场景' : '视频'}</span>{level < 3 ? <span>预计同步 <b>{selectedVideoCount}</b> 个视频</span> : <><span>共 <b>{videoTotal}</b> 个视频</span><PaginationJump page={videoPage} pages={videoPages} disabled={videosLoading} onChange={(next) => { setVideosLoading(true); setVideoPage(next) }} /></>}</div>
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
  const [operationLibraries, setOperationLibraries] = useState<OperationObjectLibrary[]>([])
  const [labelKeyword, setLabelKeyword] = useState('')
  const [labelPickerOpen, setLabelPickerOpen] = useState(false)
  const [uploadingGuideline, setUploadingGuideline] = useState(false)
  const [openingProjectId, setOpeningProjectId] = useState('')
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

  async function loadLabelLibraryOptions() {
    setLoadingLabelLibraries(true)
    try { const [labels, operations] = await Promise.all([labelApi.listSummaries(), operationObjectApi.listLibraries({ pageSize: 100 })]); setLabelLibraries(labels); setOperationLibraries(operations.items) }
    catch (reason) { setToast(reason instanceof Error ? reason.message : '标注配置加载失败') }
    finally { setLoadingLabelLibraries(false) }
  }
  function openCreate() { setEditingId(undefined); setForm(emptyForm); setLabelKeyword(''); setLabelPickerOpen(false); setUploadingGuideline(false); setStep(1); setError(''); setModalOpen(true); void loadLabelLibraryOptions() }
  async function openEdit(item: ManagedProject) {
    if (item.status === 'archived') return setToast('已归档项目不可编辑')
    void loadLabelLibraryOptions()
    setOpeningProjectId(item.id); setError('')
    try {
      const detail = await projectApi.detail(item.id)
      setEditingId(detail.id); setForm({ projectId: detail.id, name: detail.name, desc: detail.desc, teams: [...(detail.teamIds || [])], owner: detail.ownerId || '', deliveryAt: detail.deliveryAt, completionNode: detail.completionNode, modelGenerationNode: detail.modelGenerationNode || '标注', assignmentStrategy: detail.assignmentStrategy || 'manual_claim', labelLibraryIds: [...detail.labelLibraryIds], operationLibraryId: detail.operationLibraryId, annotationGuideline: detail.annotationGuideline || null }); setLabelKeyword(''); setLabelPickerOpen(false); setUploadingGuideline(false); setStep(1); setModalOpen(true)
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
    if (step === 1) { if (!form.name.trim() || !form.teams.length || !form.owner || !form.deliveryAt) return setError('请完整填写项目名称、团队、负责人和交付时间'); if (form.deliveryAt < localToday()) return setError('交付时间不能早于当前日期'); setStep(2); return }
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
        <div className="management-table-wrap"><table className="management-table project-table"><thead><tr><th>项目名称</th><th>状态</th><th>团队</th><th>标注人数</th><th>数据量</th><th>有效时长</th><th>无效时长</th><th>未覆盖时长</th><th>单次任务数</th><th>小目标数</th><th>完成节点</th><th>进度</th><th>负责人</th><th>交付时间</th><th>操作</th></tr></thead><tbody>
          {loading ? <tr><td colSpan={15}><div className="management-empty">正在加载项目...</div></td></tr> : filtered.map((item) => <tr key={item.id}><td><div className="entity-name"><strong>{item.name}</strong><small>{item.code}</small></div></td><td><span className={`project-status ${item.status}`}>{statusLabels[item.status]}</span></td><td title={item.teams.join('、')}>{item.teams.join('、')}</td><td>{item.memberCount}</td><td>{item.dataCount}</td><td>{duration(item.validDuration)}</td><td>{duration(item.invalidDuration)}</td><td>{duration(item.unselectedDuration)}</td><td>{item.goalCount}</td><td>{item.actionCount}</td><td>{item.currentNode ? <span className="node-tag blue">{item.currentNode}</span> : '-'}</td><td><div className="progress-cell"><span><i style={{ width: `${item.progress}%` }} /></span><b>{item.progress}%</b></div></td><td>{item.owner}</td><td><span className={new Date(item.deliveryAt) < new Date() && item.status !== 'finished' ? 'risk-date' : ''}>{item.deliveryAt || '-'}</span></td><td><div className="row-actions"><button type="button" onClick={() => { window.location.hash = `/projects/${encodeURIComponent(item.id)}/annotation-data` }}><Eye size={15} />查看</button><button type="button" disabled={item.status === 'archived' || Boolean(openingProjectId)} title={item.status === 'archived' ? '已归档项目不可编辑' : undefined} onClick={() => void openEdit(item)}><Edit3 size={15} />{openingProjectId === item.id ? '加载中' : '编辑'}</button>{statusActions[item.status].map(({ label, status: next, icon: Icon }) => <button key={label} type="button" onClick={() => changeStatus(item, next)}><Icon size={15} />{label}</button>)}<button className="danger-action" type="button" onClick={() => removeProject(item)}><Trash2 size={15} />删除</button></div></td></tr>)}
          {!loading && !filtered.length && <tr><td colSpan={15}><div className="management-empty"><CircleAlert size={32} />未找到匹配项目</div></td></tr>}
        </tbody></table></div>
        <footer className="management-footer"><span>共 {filtered.length} 条</span><div className="pagination"><button disabled type="button">‹</button><strong>1</strong><button disabled type="button">›</button><span>10条/页</span></div></footer>
      </section>
    </section>
    {modalOpen && <Modal title={editingId ? '编辑项目' : '创建项目'} onClose={() => setModalOpen(false)} footer={<><button className="secondary-button" type="button" disabled={uploadingGuideline} onClick={() => step === 2 ? setStep(1) : setModalOpen(false)}>{step === 2 ? '上一步' : '取消'}</button><button className="primary-button" type="submit" form="project-form" disabled={uploadingGuideline}>{uploadingGuideline ? '文件上传中...' : step === 1 ? '下一步' : editingId ? '保存' : '创建项目'}</button></>}>
      <form id="project-form" className="project-form" onSubmit={submit}>
        <div className="form-steps"><span className="active">1 基本信息</span><i /><span className={step === 2 ? 'active' : ''}>2 项目配置</span></div>
        {step === 1 ? <div className="modal-form-grid"><label><span>项目名称 <i className="required-mark">*</i></span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="请输入项目名称" /></label><label><span>交付时间 <i className="required-mark">*</i></span><input type="date" min={localToday()} value={form.deliveryAt} onChange={(e) => setForm({ ...form, deliveryAt: e.target.value })} /></label><label><span>所属团队 <i className="required-mark">*</i></span><select value={form.teams[0] || ''} onChange={(e) => setForm({ ...form, teams: e.target.value ? [e.target.value] : [] })}><option value="">请选择团队</option>{teams.filter((item) => item.enabled).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label><span>项目负责人 <i className="required-mark">*</i></span><select value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })}><option value="">请选择负责人</option>{members.filter((item) => item.enabled && item.roles.includes('项目经理')).map((item) => <option key={item.accountId} value={item.accountId}>{item.name}</option>)}</select></label><label className="wide"><span>项目描述</span><textarea value={form.desc} maxLength={500} onChange={(e) => setForm({ ...form, desc: e.target.value })} placeholder="请输入项目背景和范围" /></label></div> : <div className="modal-form-grid">
          <label><span>任务结束节点 <i className="required-mark">*</i></span><select value={form.completionNode} onChange={(e) => { const completionNode = e.target.value as ProjectPayload['completionNode']; setForm({ ...form, completionNode, modelGenerationNode: nodeOrder.indexOf(form.modelGenerationNode) > nodeOrder.indexOf(completionNode) ? completionNode : form.modelGenerationNode }) }}><option>质检</option><option>审核</option><option>验收</option></select></label>
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
        {error && <p className="inline-error">{error}</p>}
      </form>
    </Modal>}
    {toast && <div className="toast">{toast}</div>}
  </AppShell>
}
