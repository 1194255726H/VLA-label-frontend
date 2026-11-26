import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CircleAlert, Database, Download, Search } from 'lucide-react'
import { AppShell } from '../components/AppShell'
import { PaginationJump } from '../components/PaginationJump'
import { VideoSceneEditor } from '../components/VideoSceneEditor'
import { ManualFleetSyncModal } from '../components/ManualFleetSyncModal'
import { VideoCopyModal } from '../components/VideoCopyModal'
import { VideoCopyBadge } from '../components/VideoCopyBadge'
import { VideoInvalidationBadge } from '../components/VideoInvalidationBadge'
import { SearchableMultiSelect } from '../components/SearchableMultiSelect'
import { ProjectVideoActions } from '../components/ProjectVideoActions'
import { annotationDataApi } from '../services/annotationDataApi'
import { collectProjectVideos } from '../services/projectVideoQuery'
import { projectApi, teamApi } from '../services/managementApi'
import { productApi } from '../services/productApi'
import { useRangeSelection } from '../hooks/useRangeSelection'
import { copyPermissions } from '../utils/videoCopy'
import { formatDateTime } from '../utils/date'
import { nodeLabels, nodeToneByLabel } from '../utils/node'
import { summarizeInvalidIntervals } from '../utils/invalidReason'
import { videoStages, videoStageStatusLabels } from '../utils/videoStage'
import { assignmentLabel, columnLabels, emptyVideoFilters, executionFilterStages, executionStates, filtersForTab, filterVisibility, humanStatus, listInvalidReasons, listWorkTypeLabels, machineLabels, machineStages, machineStatus, matchesVideoFilters, needsVideoScan, serverVideoQuery, tabColumns, type MachineStage, type VideoColumn, type VideoListFilters, type VideoTab } from '../utils/projectVideoList'
import type { ManagedProject, Member, ProductStatus, ProjectStageStats, SessionResponse, TaskNode, VideoListItem } from '../types/api'

function clockDuration(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '—'
  const total = Math.max(0, Math.round(value)), hours = Math.floor(total / 3600)
  return [hours ? String(hours).padStart(2, '0') : '', String(Math.floor(total % 3600 / 60)).padStart(2, '0'), String(total % 60).padStart(2, '0')].filter(Boolean).join(':')
}
function VideoInvalidReasons({ video }: { video: VideoListItem }) {
  const { reasons, sampleCount } = summarizeInvalidIntervals(video.invalidIntervalList)
  return <div className="video-invalid-reasons">{sampleCount > 0 && <span>样例片段 {sampleCount} 个</span>}<span title={reasons || undefined}>{reasons || '-'}</span></div>
}
function ExecutionStatus({ video, stage }: { video: VideoListItem; stage: MachineStage }) {
  const status = machineStatus(video, stage)
  return <div className="video-stage-status"><span className={status ? `stage-status ${status}` : undefined} title={!status ? '未提供该环节的最近一轮执行状态' : undefined}>{status ? videoStageStatusLabels[status] : '-'}</span>{status === 'failed' && video.stage === stage && video.stageFailureReason && <small title={video.stageFailureReason}>{video.stageFailureReason}</small>}</div>
}

function ProjectVideoData({ session, projectId }: { session: SessionResponse; projectId: string }) {
  const navigate = useNavigate()
  const [items, setItems] = useState<VideoListItem[]>([])
  const [projectDetail, setProjectDetail] = useState<ManagedProject>()
  const [productStatus, setProductStatus] = useState<{ id: string; status: ProductStatus }>()
  const [members, setMembers] = useState<Member[]>([])
  const [stageTab, setStageTab] = useState<VideoTab>('')
  const [input, setInput] = useState<VideoListFilters>(emptyVideoFilters)
  const [filters, setFilters] = useState<VideoListFilters>(emptyVideoFilters)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [reload, setReload] = useState(0)
  const [collectorReload, setCollectorReload] = useState(0)
  const collectorKey = `${projectId}:${collectorReload}`
  const [collectorData, setCollectorData] = useState<{ key: string; names: string[]; error: string }>({ key: '', names: [], error: '' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [loadedQueryKey, setLoadedQueryKey] = useState('')
  const [scanProgress, setScanProgress] = useState<{ key: string; loaded: number; total: number }>()
  const scanCache = useRef<{ key: string; items: VideoListItem[] } | undefined>(undefined)
  const [selectedVideos, setSelectedVideos] = useState<{ projectId: string; ids: Set<string> }>({ projectId, ids: new Set() })
  const [exporting, setExporting] = useState(false)
  const [manualSyncOpen, setManualSyncOpen] = useState(false)
  const [copySelection, setCopySelection] = useState<{ projectId: string; ids: string[] }>()
  const canManage = copyPermissions(session).allowed
  const [sceneReload, setSceneReload] = useState(0)
  const sceneKey = `${projectId}:${sceneReload}`
  const [sceneData, setSceneData] = useState<{ key: string; items: Awaited<ReturnType<typeof annotationDataApi.sceneFilters>>; error: string }>({ key: '', items: [], error: '' })
  const scenesLoading = sceneData.key !== sceneKey
  const scenes = scenesLoading ? [] : sceneData.items
  const statsKey = `${projectId}:${reload}`
  const [stageStats, setStageStats] = useState<{ key: string; data?: ProjectStageStats; error: string }>({ key: '', error: '' })
  const queryKey = JSON.stringify([projectId, filters, stageTab, page, pageSize, reload])
  const tableLoading = loadedQueryKey !== queryKey
  const columns = tabColumns[stageTab]
  const visible = filterVisibility(stageTab)
  const selectedIds = selectedVideos.projectId === projectId ? selectedVideos.ids : new Set<string>()
  const rowSelection = useRangeSelection(items.map((item) => item.id), queryKey)
  const allSelected = !tableLoading && items.length > 0 && items.every((item) => selectedIds.has(item.id))
  const someSelected = !tableLoading && items.some((item) => selectedIds.has(item.id))
  const project = projectDetail?.id === projectId ? projectDetail : undefined
  const notStarted = project?.status === 'not-started' || Boolean(productStatus?.id === project?.productId && productStatus?.status === 'not_started')
  const collectorOptions = collectorData.names.map((name) => ({ id: name, name }))
  const collectorsLoading = collectorData.key !== collectorKey
  const assigneeOptions = [...new Map([...members.map((member) => ({ id: member.accountId, name: member.name })), ...items.filter((item) => item.currentAssigneeId).map((item) => ({ id: item.currentAssigneeId!, name: item.currentAssigneeName || item.currentAssigneeId! }))].map((option) => [option.id, option])).values()]
  const patch = (value: Partial<VideoListFilters>) => setInput((old) => ({ ...old, ...value }))
  const loadVideos = () => setReload((value) => value + 1)
  const refreshData = () => { loadVideos(); setCollectorReload((value) => value + 1) }

  useEffect(() => {
    const controller = new AbortController()
    collectProjectVideos(projectId, {}, controller.signal, () => undefined).then((videos) => {
      if (controller.signal.aborted) return
      const names = [...new Set(videos.map((video) => (video.personName || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN'))
      setCollectorData({ key: collectorKey, names, error: '' })
    }).catch((failure) => {
      if (!controller.signal.aborted) setCollectorData((old) => ({ key: collectorKey, names: old.names, error: failure instanceof Error ? failure.message : '采集人加载失败' }))
    })
    return () => controller.abort()
  }, [projectId, collectorKey])

  useEffect(() => {
    let active = true
    annotationDataApi.stageStats(projectId).then((data) => { if (active) setStageStats({ key: statsKey, data, error: '' }) }).catch((failure) => { if (active) setStageStats({ key: statsKey, error: failure instanceof Error ? failure.message : '阶段统计加载失败' }) })
    return () => { active = false }
  }, [projectId, statsKey])
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const query = serverVideoQuery(filters, stageTab)
        if (needsVideoScan(filters, stageTab)) {
          const cacheKey = JSON.stringify([projectId, query, reload])
          let candidates = scanCache.current?.key === cacheKey ? scanCache.current.items : undefined
          if (!candidates) {
            candidates = await collectProjectVideos(projectId, query, controller.signal, (loaded, total) => setScanProgress({ key: queryKey, loaded, total }))
            controller.signal.throwIfAborted()
            scanCache.current = { key: cacheKey, items: candidates }
          }
          const matched = candidates.filter((item) => matchesVideoFilters(item, filters, stageTab))
          const pageCount = Math.max(1, Math.ceil(matched.length / pageSize)), actualPage = Math.min(page, pageCount)
          if (!controller.signal.aborted) { setItems(matched.slice((actualPage - 1) * pageSize, actualPage * pageSize)); setTotal(matched.length); setPages(pageCount); if (actualPage !== page) setPage(actualPage) }
        } else {
          const result = await annotationDataApi.list(projectId, { ...query, page, pageSize })
          controller.signal.throwIfAborted()
          setItems(result.items); setTotal(result.total); setPages(Math.max(1, result.pages)); if (result.page !== page) setPage(result.page)
        }
        setLoadedQueryKey(queryKey); setError('')
      } catch (failure) { if (!controller.signal.aborted) { setItems([]); setTotal(0); setPages(1); setLoadedQueryKey(queryKey); setError(failure instanceof Error ? failure.message : '数据加载失败') } }
    }
    void load()
    return () => controller.abort()
  }, [projectId, filters, stageTab, page, pageSize, reload, queryKey])
  useEffect(() => {
    if (tableLoading || !items.some((item) => machineStages.includes(item.stage as MachineStage) && ['queued', 'running', 'retrying'].includes(item.stageStatus || ''))) return
    const timer = window.setTimeout(loadVideos, 15000)
    return () => window.clearTimeout(timer)
  }, [items, tableLoading])
  useEffect(() => {
    let active = true
    annotationDataApi.sceneFilters(projectId).then((items) => { if (active) setSceneData({ key: sceneKey, items, error: '' }) }).catch((failure) => { if (active) setSceneData({ key: sceneKey, items: [], error: failure instanceof Error ? failure.message : '场景加载失败' }) })
    return () => { active = false }
  }, [projectId, sceneKey])
  useEffect(() => {
    let active = true
    projectApi.detail(projectId).then(async (detail) => {
      if (!active) return
      setProjectDetail(detail)
      if (detail.productId) { const parent = await productApi.detail(detail.productId); if (active) setProductStatus({ id: parent.id, status: parent.status }) }
    }).catch(() => undefined)
    return () => { active = false }
  }, [projectId, reload])
  useEffect(() => { let active = true; teamApi.getData(false).then((data) => { if (active) setMembers(data.members) }).catch(() => undefined); return () => { active = false } }, [])
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 3500); return () => window.clearTimeout(timer) }, [toast])

  function changeTab(tab: VideoTab) { setStageTab(tab); setInput((old) => filtersForTab(old, tab)); setFilters((old) => filtersForTab(old, tab)); setPage(1) }
  function toggleSelection(ids: string[], checked: boolean) { setSelectedVideos((old) => { const next = new Set(old.projectId === projectId ? old.ids : []); ids.forEach((id) => { if (checked) next.add(id); else next.delete(id) }); return { projectId, ids: next } }) }
  function search() {
    if (input.updatedStart && input.updatedEnd && input.updatedStart > input.updatedEnd) return setToast('更新时间开始日期不能晚于结束日期')
    setPage(1); setFilters(filtersForTab({ ...input, name: input.name.trim() }, stageTab))
  }
  async function exportSelected() {
    if (!selectedIds.size || exporting) return
    setExporting(true)
    try {
      const file = await annotationDataApi.exportVideos(projectId, [...selectedIds]), url = URL.createObjectURL(file.blob), anchor = document.createElement('a')
      anchor.href = url; anchor.download = file.filename; document.body.appendChild(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); setToast('CSV 导出成功')
    } catch (failure) { setToast(failure instanceof Error ? failure.message : '导出失败') } finally { setExporting(false) }
  }
  function renderCell(column: VideoColumn, video: VideoListItem): ReactNode {
    switch (column) {
      case 'name': return <div className="entity-name"><strong title={video.filename}>{video.filename}</strong><VideoInvalidationBadge video={video} /><VideoCopyBadge video={video} /><small>ID: {video.id}</small></div>
      case 'scene': return <VideoSceneEditor key={`${projectId}:${video.id}`} variant="table" workspace={{ ...video, projectId: video.projectId || projectId, videoId: video.id }} canEdit onUpdated={() => { loadVideos(); setToast('场景信息已更新') }} />
      case 'stage': return videoStages.find((item) => item.value === video.stage)?.label || '-'
      case 'node': return video.stage === 'human_processing' && nodeLabels[video.currentNode] ? <span className={`node-tag ${nodeToneByLabel(nodeLabels[video.currentNode])}`}>{nodeLabels[video.currentNode]}</span> : '-'
      case 'assigned': return assignmentLabel(video, notStarted)
      case 'status': return humanStatus(video) === '-' ? '-' : <span className={`status-tag ${video.videoStatus}`}>{humanStatus(video)}</span>
      case 'pre_annotation': case 'model_description': case 'cutting': return <ExecutionStatus video={video} stage={column} />
      case 'workType': return <span className={`work-type-tag ${video.workType}`}>{video.workType === 'returned' ? listWorkTypeLabels.returned : listWorkTypeLabels.normal}</span>
      case 'duration': return video.availableStats?.duration === false ? '-' : clockDuration(video.duration)
      case 'effective': return clockDuration(video.effectiveDurationMs / 1000)
      case 'invalid': return clockDuration(video.invalidDurationMs / 1000)
      case 'reasons': return <VideoInvalidReasons video={video} />
      case 'goals': return video.availableStats?.atomicTasks === false ? '-' : video.atomicTaskCount
      case 'actions': return video.availableStats?.atomicActions === false ? '-' : video.atomicActionCount
      case 'collector': return video.personName || '-'
      case 'assignee': return video.currentAssigneeName || video.currentAssigneeId || '-'
      case 'updated': return formatDateTime(video.updatedAt)
      case 'cancelReasons': return video.cancelledReasons?.join('、') || '-'
      case 'cancelBy': return video.cancelledByName || video.cancelledById || '-'
      case 'cancelAt': return video.cancelledAt ? formatDateTime(video.cancelledAt) : '-'
      case 'operations': return <ProjectVideoActions video={video} tab={stageTab} projectId={projectId} accountId={String(session.account.id)} canManage={canManage} completionNode={project?.completionNode} onNavigate={navigate} onCopy={() => setCopySelection({ projectId, ids: [video.id] })} onChanged={loadVideos} onMessage={setToast} />
    }
  }
  function executionFilter(stage: MachineStage) { return <label key={stage}><span>{machineLabels[stage]}</span><div className="filter-control"><select aria-label={machineLabels[stage]} value={input.executions[stage]} onChange={(event) => patch({ executions: { ...input.executions, [stage]: event.target.value as VideoListFilters['executions'][MachineStage] } })}><option value="">全部</option>{executionStates.map((status) => <option key={status} value={status}>{videoStageStatusLabels[status]}</option>)}</select></div></label> }

  return <AppShell user={session.account}><section className="management-page"><section className="management-panel panel">
    <header className="management-toolbar annotation-data-heading"><div className="detail-title"><button className="icon-button bordered" type="button" aria-label="返回数据集列表" onClick={() => navigate(project?.productId ? `/products/${encodeURIComponent(project.productId)}/datasets` : '/products')}><ArrowLeft size={17} /></button><div><h2>{project?.name || '数据集视频'}</h2><p>{project?.productName ? `${project.productName} / ` : ''}数据集 / 视频 · {projectId}</p></div></div><span>共 {total} 条数据</span></header>
    {project && <div className="project-binding-summary"><span>数据集供应商：<b>{project.supplier?.name || '未绑定（手动同步）'}</b></span><span>最近自动同步时间：<b>{project.autoSyncTime ? formatDateTime(project.autoSyncTime) : '-'}</b></span></div>}
    <div className="annotation-data-tabs project-stage-tabs"><div className="status-segments">{[{ value: '', label: '全部' }, ...videoStages, { value: 'abnormal', label: '异常' }].map((tab) => {
      const stats = stageStats.key === statsKey ? stageStats.data : undefined, count = tab.value === '' ? stats?.total : stats?.items.find((item) => item.stage === tab.value)?.count ?? (stats ? 0 : undefined)
      return <button key={tab.value || 'all'} type="button" className={stageTab === tab.value ? 'active' : ''} onClick={() => changeTab(tab.value as VideoTab)}>{tab.label}{tab.value !== 'abnormal' && <span>{count ?? '—'}</span>}</button>
    })}</div><div className="project-video-toolbar-actions">{canManage && stageTab !== 'cancelled' && <button className="secondary-button" type="button" disabled={!selectedIds.size} onClick={() => setCopySelection({ projectId, ids: [...selectedIds] })}>批量复制（{selectedIds.size}）</button>}<button className="secondary-button" type="button" disabled={tableLoading} onClick={refreshData}>刷新</button><button className="secondary-button" type="button" disabled={!selectedIds.size || exporting} onClick={() => void exportSelected()}><Download size={16} />{exporting ? '正在导出…' : '导出 CSV'}</button><button className="primary-button" type="button" onClick={() => setManualSyncOpen(true)}><Database size={16} />手动同步</button></div></div>
    <form className="management-filters project-video-filters" onSubmit={(event) => { event.preventDefault(); search() }}>
      <label><span>数据名称</span><div className="filter-control"><Search size={16} /><input value={input.name} onChange={(event) => patch({ name: event.target.value })} placeholder="请输入数据名称或 ID" /></div></label>
      <div className="project-video-multi-filter"><span>采集人</span><SearchableMultiSelect label="采集人" clearSearchOnSelect value={input.collectors} options={collectorOptions} loading={collectorsLoading} onChange={(collectors) => patch({ collectors })} />{!collectorsLoading && collectorData.error && <small className="inline-error">{collectorData.error}<button type="button" onClick={() => setCollectorReload((value) => value + 1)}>重试</button></small>}</div>
      <label><span>场景</span><div className="filter-control"><select aria-label="一级场景" disabled={scenesLoading} value={input.scene1} onChange={(event) => patch({ scene1: event.target.value, scene2: '' })}><option value="">全部一级场景</option><option value="null">未设置一级场景</option>{scenes.map((scene) => <option key={scene.id} value={scene.id}>{scene.name}</option>)}</select></div></label>
      <label><span>二级场景</span><div className="filter-control"><select aria-label="二级场景" disabled={!input.scene1 || input.scene1 === 'null'} value={input.scene2} onChange={(event) => patch({ scene2: event.target.value })}><option value="">全部二级场景</option><option value="null">未设置二级场景</option>{scenes.find((scene) => scene.id === input.scene1)?.children.map((scene) => <option key={scene.id} value={scene.id}>{scene.name}</option>)}</select></div></label>
      <label><span>更新时间（开始）</span><div className="filter-control"><input aria-label="更新时间开始" type="date" value={input.updatedStart} max={input.updatedEnd || undefined} onChange={(event) => patch({ updatedStart: event.target.value })} /></div></label>
      <label><span>更新时间（结束）</span><div className="filter-control"><input aria-label="更新时间结束" type="date" value={input.updatedEnd} min={input.updatedStart || undefined} onChange={(event) => patch({ updatedEnd: event.target.value })} /></div></label>
      {visible.human && <><label><span>作业节点</span><div className="filter-control"><select aria-label="作业节点" value={input.node} onChange={(event) => patch({ node: event.target.value as TaskNode })}><option value="">全部作业节点</option>{Object.entries(nodeLabels).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></div></label><label><span>分配状态</span><div className="filter-control"><select aria-label="分配状态" value={input.assigned} onChange={(event) => patch({ assigned: event.target.value as VideoListFilters['assigned'] })}><option value="">全部分配状态</option><option value="false">待分配</option><option value="true">{notStarted ? '预分配' : '已分配'}</option></select></div></label><label><span>作业状态</span><div className="filter-control"><select aria-label="作业状态" value={input.status} onChange={(event) => patch({ status: event.target.value as VideoListFilters['status'] })}><option value="">全部作业状态</option><option value="pending">待处理</option><option value="in_progress">处理中</option></select></div></label><label><span>流转类型</span><div className="filter-control"><select aria-label="流转类型" value={input.workType} onChange={(event) => patch({ workType: event.target.value as VideoListFilters['workType'] })}><option value="">全部流转类型</option>{Object.entries(listWorkTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div></label></>}
      {executionFilterStages(stageTab).map((stage) => executionFilter(stage))}
      {visible.reasons && <><div className="project-video-multi-filter"><span>无效原因</span><SearchableMultiSelect label="无效原因" value={input.reasons} options={listInvalidReasons.map((name) => ({ id: name, name }))} onChange={(reasons) => patch({ reasons })} /></div><label><span>样例状态</span><div className="filter-control"><select aria-label="样例状态" value={input.sample} onChange={(event) => patch({ sample: event.target.value as VideoListFilters['sample'] })}><option value="">全部样例状态</option><option value="true">已设样例</option><option value="false">未设样例</option></select></div></label></>}
      {visible.assignee && <div className="project-video-multi-filter"><span>处理人</span><SearchableMultiSelect label="处理人" value={input.assignees} options={assigneeOptions} onChange={(assignees) => patch({ assignees })} /></div>}
      <button className="primary-button compact" type="submit">查询</button><button className="secondary-button compact" type="button" onClick={() => { setInput(emptyVideoFilters()); setFilters(emptyVideoFilters()); setPage(1) }}>重置</button>
    </form>
    {stageStats.key === statsKey && stageStats.error && <div className="error-banner"><CircleAlert size={18} /><span>{stageStats.error}</span><button type="button" onClick={loadVideos}>重新加载</button></div>}
    {!scenesLoading && sceneData.error && <div className="error-banner"><span>{sceneData.error}</span><button type="button" onClick={() => setSceneReload((value) => value + 1)}>重新加载场景</button></div>}
    {error && <div className="error-banner"><CircleAlert size={18} /><span>{error}</span><button type="button" onClick={loadVideos}>重新加载</button></div>}
    {tableLoading && scanProgress?.key === queryKey && <p className="project-video-scan-status" role="status">正在查询全部匹配数据：已读取 {scanProgress.loaded} / {scanProgress.total} 条</p>}
    <div className="management-table-wrap"><table className={`management-table annotation-data-table project-video-table video-tab-${stageTab || 'all'}`}><thead><tr><th className="video-selection-column"><input type="checkbox" aria-label="全选当前页视频" checked={allSelected} ref={(element) => { if (element) element.indeterminate = someSelected && !allSelected }} disabled={tableLoading || exporting || !items.length} onChange={(event) => toggleSelection(items.map((item) => item.id), event.target.checked)} /></th>{columns.map((column) => <th key={column} className={column === 'name' ? 'video-name-column' : column === 'scene' ? 'scene-info-column' : undefined}>{columnLabels[column]}</th>)}</tr></thead><tbody>
      {tableLoading ? <tr><td colSpan={columns.length + 1}><div className="management-empty">正在加载数据…</div></td></tr> : items.map((video) => <tr key={video.id} className={selectedIds.has(video.id) ? 'selected-row' : undefined}><td className="video-selection-column"><input type="checkbox" aria-label={`选择视频 ${video.filename}`} checked={selectedIds.has(video.id)} disabled={!video.id || exporting} onChange={(event) => toggleSelection(rowSelection.range(video.id, (event.nativeEvent as MouseEvent).shiftKey), event.target.checked)} /></td>{columns.map((column) => <td key={column} className={column === 'name' ? 'video-name-column' : column === 'reasons' || column === 'cancelReasons' ? 'video-invalid-reasons-column' : undefined}>{renderCell(column, video)}</td>)}</tr>)}
      {!tableLoading && !items.length && <tr><td colSpan={columns.length + 1}><div className="management-empty"><CircleAlert size={32} />暂无符合条件的数据</div></td></tr>}
    </tbody></table></div>
    <footer className="management-footer"><span>共 {total} 条{selectedIds.size > 0 && <> · 已选 {selectedIds.size} 条（含其他页）<button className="clear-video-selection" type="button" disabled={exporting} onClick={() => { rowSelection.reset(); setSelectedVideos({ projectId, ids: new Set() }) }}>清空选择</button></>}</span><PaginationJump page={page} pages={pages} disabled={tableLoading} onChange={setPage} pageSize={pageSize} onPageSizeChange={(size) => { setPageSize(size); setPage(1) }} /></footer>
  </section></section>
    {manualSyncOpen && <ManualFleetSyncModal key={projectId} projectId={projectId} projectName={project?.name || '数据集'} supplierName={project?.supplier?.name} onClose={() => setManualSyncOpen(false)} onSynced={(message) => { setManualSyncOpen(false); refreshData(); setToast(message) }} />}
    {copySelection?.projectId === projectId && <VideoCopyModal key={projectId} ids={copySelection.ids} currentProductId={project?.productId} session={session} onClose={() => setCopySelection(undefined)} onCopied={(ids) => { if (ids.length) { toggleSelection(ids, false); refreshData() } }} />}
    {toast && <div className="toast">{toast}</div>}
  </AppShell>
}

export function AnnotationDataPage({ session }: { session: SessionResponse }) {
  const { projectId = '' } = useParams()
  return <ProjectVideoData key={projectId} session={session} projectId={projectId} />
}
