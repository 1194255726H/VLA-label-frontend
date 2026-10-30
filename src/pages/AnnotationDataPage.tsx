import { ArrowLeft, CircleAlert, Database, Download, Eye, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { PaginationJump } from '../components/PaginationJump'
import { VideoSceneEditor } from '../components/VideoSceneEditor'
import { annotationDataApi } from '../services/annotationDataApi'
import { projectApi } from '../services/managementApi'
import type { ManagedProject, ProjectStageStats, SessionResponse, VideoListItem, VideoStage, VideoStageStatus } from '../types/api'
import { ManualFleetSyncModal } from '../components/ManualFleetSyncModal'
import { useRangeSelection } from '../hooks/useRangeSelection'
import { formatDateTime } from '../utils/date'
import { nodeLabels, nodeToneByLabel } from '../utils/node'
import { invalidReasons, summarizeInvalidIntervals } from '../utils/invalidReason'
import { preAnnotationRetryAvailable, videoStages, videoStageStatusLabels } from '../utils/videoStage'

const videoStatusLabels: Record<string, string> = { pending: '待处理', assigned: '待处理', processing: '处理中', in_progress: '处理中', describing: '模型描述中', cutting: '切割中', completed: '已完成', cancelled: '已作废', abnormal: '异常' }
const workTypeLabels = { normal: '正常流转', returned: '退回返修' }
function clockDuration(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '—'
  const totalSeconds = Math.max(0, Math.round(value))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return hours ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}` : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
function milliseconds(value: number | null) { return value === null ? '—' : clockDuration(value / 1000) }

function VideoInvalidReasons({ video }: { video: VideoListItem }) {
  const { reasons, sampleCount } = summarizeInvalidIntervals(video.invalidIntervalList)
  return <div className="video-invalid-reasons">
    {sampleCount > 0 && <span>样例片段 {sampleCount} 个</span>}
    <span className={sampleCount > 0 ? 'secondary' : undefined} title={reasons || undefined}>{reasons || '-'}</span>
  </div>
}

export function AnnotationDataPage({ session }: { session: SessionResponse }) {
  const { projectId = '' } = useParams()
  const navigate = useNavigate()
  const [items, setItems] = useState<VideoListItem[]>([])
  const [projectName, setProjectName] = useState('项目视频')
  const [projectDetail, setProjectDetail] = useState<ManagedProject>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filenameInput, setFilenameInput] = useState('')
  const [filename, setFilename] = useState('')
  const [personNameInput, setPersonNameInput] = useState('')
  const [personName, setPersonName] = useState('')
  const [sceneFilter, setSceneFilter] = useState('')
  const [invalidReason, setInvalidReason] = useState('')
  const [sceneReload, setSceneReload] = useState(0)
  const sceneRequestKey = `${projectId}:${sceneReload}`
  const [sceneFilterData, setSceneFilterData] = useState<{ key: string; items: Awaited<ReturnType<typeof annotationDataApi.sceneFilters>>; error: string }>({ key: '', items: [], error: '' })
  const scenesLoading = sceneFilterData.key !== sceneRequestKey
  const sceneOptions = scenesLoading ? [] : sceneFilterData.items
  const sceneError = scenesLoading ? '' : sceneFilterData.error
  const [scene1Id = '', scene2Id = ''] = sceneFilter.split(':')
  const [selectedVideos, setSelectedVideos] = useState<{ projectId: string; ids: Set<string> }>({ projectId, ids: new Set() })
  const [exporting, setExporting] = useState(false)
  const [loadedQueryKey, setLoadedQueryKey] = useState('')
  const [videoStatus, setVideoStatus] = useState('')
  const [stageTab, setStageTab] = useState<VideoStage | 'abnormal' | ''>('')
  const [stageStatus, setStageStatus] = useState<VideoStageStatus | ''>('')
  const stage = stageTab === 'abnormal' ? 'pre_annotation' : stageTab
  const [reload, setReload] = useState(0)
  const [retryingVideoId, setRetryingVideoId] = useState('')
  const statsKey = `${projectId}:${reload}`
  const [stageStats, setStageStats] = useState<{ key: string; data?: ProjectStageStats; error: string }>({ key: '', error: '' })
  const [assigneeInput, setAssigneeInput] = useState('')
  const [currentAssigneeId, setCurrentAssigneeId] = useState('')
  const [createdAtStart, setCreatedAtStart] = useState('')
  const [createdAtEnd, setCreatedAtEnd] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [manualSyncOpen, setManualSyncOpen] = useState(false)
  const [toast, setToast] = useState('')
  const queryKey = JSON.stringify([projectId, filename, personName, sceneFilter, invalidReason, videoStatus, stage, stageStatus, currentAssigneeId, createdAtStart, createdAtEnd, page, pageSize, reload])
  const tableLoading = loading || loadedQueryKey !== queryKey
  const selectedVideoIds = selectedVideos.projectId === projectId ? selectedVideos.ids : new Set<string>()
  const selectableItems = items.filter((item) => item.id)
  const rowSelection = useRangeSelection(selectableItems.map((item) => item.id), queryKey)
  const allPageSelected = !tableLoading && selectableItems.length > 0 && selectableItems.every((item) => selectedVideoIds.has(item.id))
  const somePageSelected = !tableLoading && selectableItems.some((item) => selectedVideoIds.has(item.id))

  function loadVideos() { setReload((current) => current + 1) }

  useEffect(() => {
    let active = true
    annotationDataApi.stageStats(projectId).then((data) => { if (active) setStageStats({ key: statsKey, data, error: '' }) })
      .catch((reason) => { if (active) setStageStats({ key: statsKey, error: reason instanceof Error ? reason.message : '阶段统计加载失败' }) })
    return () => { active = false }
  }, [projectId, statsKey])

  useEffect(() => {
    let active = true
    annotationDataApi.list(projectId, { filename, personName, scene1Id, scene2Id, invalidReason, status: videoStatus, stage: stage || undefined, stageStatus: stageStatus || undefined, currentAssigneeId, createdAtStart, createdAtEnd, page, pageSize }).then((result) => {
      if (!active) return
      setItems(result.items); setLoadedQueryKey(queryKey); setTotal(result.total); setPages(Math.max(1, result.pages)); setError('')
    }).catch((reason) => { if (active) { setItems([]); setLoadedQueryKey(queryKey); setError(reason instanceof Error ? reason.message : '项目视频加载失败') } }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [createdAtEnd, createdAtStart, currentAssigneeId, filename, page, pageSize, personName, scene1Id, scene2Id, invalidReason, projectId, queryKey, stage, stageStatus, videoStatus])
  useEffect(() => {
    if (tableLoading || !items.some((video) => ['pre_annotation', 'model_description', 'cutting'].includes(video.stage || '') && ['queued', 'running', 'retrying'].includes(video.stageStatus || ''))) return
    const timer = window.setTimeout(() => setReload((current) => current + 1), 15000)
    return () => window.clearTimeout(timer)
  }, [items, tableLoading])

  useEffect(() => {
    let active = true
    annotationDataApi.sceneFilters(projectId).then((items) => { if (active) setSceneFilterData({ key: sceneRequestKey, items, error: '' }) })
      .catch((reason) => { if (active) setSceneFilterData({ key: sceneRequestKey, items: [], error: reason instanceof Error ? reason.message : '场景加载失败' }) })
    return () => { active = false }
  }, [projectId, sceneRequestKey])
  useEffect(() => {
    let active = true
    projectApi.detail(projectId).then((project) => { if (active) { setProjectName(project.name); setProjectDetail(project) } }).catch(() => undefined)
    return () => { active = false }
  }, [projectId])
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 2500); return () => window.clearTimeout(timer) }, [toast])

  async function manualSynced(message: string) { setManualSyncOpen(false); loadVideos(); setToast(message) }
  function applySearch() { setPage(1); setFilename(filenameInput.trim()); setPersonName(personNameInput.trim()); setCurrentAssigneeId(assigneeInput.trim()) }
  function resetFilters() { setFilenameInput(''); setFilename(''); setPersonNameInput(''); setPersonName(''); setSceneFilter(''); setInvalidReason(''); setVideoStatus(''); setStageTab(''); setStageStatus(''); setAssigneeInput(''); setCurrentAssigneeId(''); setCreatedAtStart(''); setCreatedAtEnd(''); setPage(1) }
  function toggleSelection(ids: string[], checked: boolean) {
    setSelectedVideos((current) => {
      const next = new Set(current.projectId === projectId ? current.ids : [])
      ids.forEach((id) => { if (checked) next.add(id); else next.delete(id) })
      return { projectId, ids: next }
    })
  }
  async function exportSelected() {
    if (!selectedVideoIds.size || exporting) return
    setExporting(true)
    try {
      const { blob, filename } = await annotationDataApi.exportVideos(projectId, [...selectedVideoIds])
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url; anchor.download = filename
      document.body.appendChild(anchor); anchor.click(); anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setToast('CSV 导出成功')
    } catch (reason) { setToast(reason instanceof Error ? reason.message : '视频导出失败') }
    finally { setExporting(false) }
  }
  async function retryPreAnnotation(video: VideoListItem) {
    if (retryingVideoId || !preAnnotationRetryAvailable(video)) return
    if (!video.preAnnotationJobId) return setToast('接口未返回预标注任务 ID，无法重试')
    setRetryingVideoId(video.id)
    try {
      await annotationDataApi.retryPreAnnotation(video.preAnnotationJobId)
      setToast('已提交手动重试，等待预处理队列处理')
      loadVideos()
    } catch (reason) { setToast(reason instanceof Error ? reason.message : '手动重试失败') }
    finally { setRetryingVideoId('') }
  }

  function preview(video: VideoListItem) {
    const effectiveProjectId = video.projectId || projectId
    if (effectiveProjectId && video.id) navigate(`/projects/${encodeURIComponent(effectiveProjectId)}/videos/${encodeURIComponent(video.id)}/annotation?readonly=1`)
  }

  return <AppShell user={session.account}><section className="management-page"><section className="management-panel panel">
    <header className="management-toolbar annotation-data-heading"><div className="detail-title"><button className="icon-button bordered" type="button" onClick={() => navigate('/projects')} aria-label="返回项目管理"><ArrowLeft size={17} /></button><div><h2>{projectName}</h2><p>项目视频管理 · {projectId}</p></div></div><span>共 {total} 条视频，可按场景、无效原因、视频状态、采集人、处理人和创建时间排查</span></header>
    {projectDetail?.id === projectId && <div className="project-binding-summary"><span>项目供应商：<b>{projectDetail.supplier?.name || '未绑定（手动同步）'}</b></span><span>最近自动同步时间：<b>{projectDetail.autoSyncTime ? formatDateTime(projectDetail.autoSyncTime) : '-'}</b></span></div>}
    <div className="annotation-data-tabs project-stage-tabs"><div className="status-segments">{[{ value: '', label: '全部' }, ...videoStages, { value: 'abnormal', label: '异常' }].map((item) => {
      const stats = stageStats.key === statsKey ? stageStats.data : undefined
      const count = item.value === '' ? stats?.total : item.value === 'abnormal' ? undefined : stats?.items.find((stat) => stat.stage === item.value)?.count ?? (stats ? 0 : undefined)
      return <button key={item.value || 'all'} type="button" className={stageTab === item.value ? 'active' : ''} onClick={() => { setStageTab(item.value as typeof stageTab); setStageStatus(item.value === 'abnormal' ? 'failed' : ''); setVideoStatus(''); setPage(1) }}>{item.label}{item.value !== 'abnormal' && <span title="当前项目的阶段统计">{count ?? '—'}</span>}</button>
    })}</div><div className="project-video-toolbar-actions"><button className="secondary-button" type="button" disabled={tableLoading} onClick={loadVideos}>刷新</button><button className="secondary-button" type="button" disabled={!selectedVideoIds.size || exporting} onClick={() => void exportSelected()}><Download size={16} />{exporting ? '正在导出...' : '导出 CSV'}</button><button className="primary-button" type="button" onClick={() => setManualSyncOpen(true)}><Database size={16} />手动同步</button></div></div>
    <div className="management-filters project-video-filters">
      <label><span>视频名称</span><div className="filter-control"><Search size={16} /><input value={filenameInput} onChange={(event) => setFilenameInput(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && applySearch()} placeholder="请输入视频文件名" /></div></label>
      <label><span>阶段状态</span><div className="filter-control"><select aria-label="阶段状态筛选" value={stageStatus} onChange={(event) => { setStageStatus(event.target.value as typeof stageStatus); setPage(1) }}>{stageTab !== 'abnormal' && <option value="">全部阶段状态</option>}{Object.entries(videoStageStatusLabels).filter(([value]) => stageTab !== 'abnormal' || ['failed', 'cancelled'].includes(value)).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div></label>
      <label><span>作业状态</span><div className="filter-control"><select aria-label="作业状态筛选" value={videoStatus} onChange={(event) => { setVideoStatus(event.target.value); setPage(1) }}><option value="">全部作业状态</option>{['pending', 'in_progress', 'completed', 'cancelled', 'abnormal'].map((status) => <option key={status} value={status}>{videoStatusLabels[status]}</option>)}</select></div></label>
      <label className="project-scene-filter"><span>场景</span><div className="filter-control"><select aria-label="场景筛选" value={sceneFilter} disabled={scenesLoading} onChange={(event) => { setSceneFilter(event.target.value); setPage(1) }}><option value="">{scenesLoading ? '正在加载场景...' : '全部场景'}</option>{sceneOptions.map((scene) => <optgroup key={scene.id} label={scene.name}><option value={scene.id}>{scene.name}（全部）</option>{scene.children.map((child) => <option key={child.id} value={`${scene.id}:${child.id}`}>{scene.name} / {child.name}</option>)}</optgroup>)}</select></div></label>
      <label><span>无效原因</span><div className="filter-control"><select aria-label="无效原因筛选" value={invalidReason} onChange={(event) => { setInvalidReason(event.target.value); setPage(1) }}><option value="">全部无效原因</option>{invalidReasons.map((reason) => <option key={reason} value={reason}>{reason}</option>)}</select></div></label>
      <label><span>采集人</span><div className="filter-control"><input value={personNameInput} onChange={(event) => setPersonNameInput(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && applySearch()} placeholder="请输入采集人姓名" /></div></label>
      <label><span>当前处理人 ID</span><div className="filter-control"><input type="number" min="1" step="1" value={assigneeInput} onChange={(event) => setAssigneeInput(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && applySearch()} placeholder="请输入处理人 ID" /></div></label>
      <label><span>创建时间（开始）</span><div className="filter-control"><input type="date" value={createdAtStart} onChange={(event) => { setCreatedAtStart(event.target.value); setPage(1) }} /></div></label>
      <label><span>创建时间（结束）</span><div className="filter-control"><input type="date" value={createdAtEnd} onChange={(event) => { setCreatedAtEnd(event.target.value); setPage(1) }} /></div></label>
      <button className="primary-button compact" type="button" onClick={applySearch}>查询</button><button className="secondary-button compact" type="button" onClick={resetFilters}>重置</button>
    </div>
    {stageStats.key === statsKey && stageStats.error && <div className="error-banner"><CircleAlert size={18} /><span>阶段统计加载失败：{stageStats.error}</span><button type="button" onClick={loadVideos}>重新加载</button></div>}
    {sceneError && <div className="error-banner"><CircleAlert size={18} /><span>场景筛选加载失败：{sceneError}</span><button type="button" onClick={() => setSceneReload((current) => current + 1)}>重新加载场景</button></div>}
    {error && <div className="error-banner"><CircleAlert size={18} /><span>{error}</span><button type="button" onClick={loadVideos}>重新加载</button></div>}
    <div className="management-table-wrap"><table className="management-table annotation-data-table project-video-table"><thead><tr><th className="video-selection-column"><input type="checkbox" aria-label="全选当前页视频" checked={allPageSelected} ref={(element) => { if (element) element.indeterminate = somePageSelected && !allPageSelected }} disabled={tableLoading || exporting || !selectableItems.length} onChange={(event) => toggleSelection(selectableItems.map((item) => item.id), event.target.checked)} /></th><th className="video-name-column">视频名称</th><th className="scene-info-column">场景信息</th><th>供应商</th><th>处理阶段</th><th>阶段状态／失败原因</th><th>作业状态</th><th>作业节点</th><th>流转类型</th><th>视频时长</th><th>有效片段时长</th><th>无效片段时长</th><th className="video-invalid-reasons-column">无效原因</th><th>设备 MAC</th><th>采集人</th><th>单次任务数</th><th>小目标数</th><th>处理人</th><th>创建时间</th><th>更新时间</th><th>操作</th></tr></thead><tbody>
      {tableLoading ? <tr><td colSpan={21}><div className="management-empty">正在加载项目视频...</div></td></tr> : items.map((video) => <tr className={selectedVideoIds.has(video.id) ? 'selected-row' : undefined} key={video.id}>
        <td className="video-selection-column"><input type="checkbox" aria-label={`选择视频 ${video.filename}`} checked={selectedVideoIds.has(video.id)} disabled={!video.id || exporting} onChange={(event) => toggleSelection(rowSelection.range(video.id, (event.nativeEvent as MouseEvent).shiftKey), event.target.checked)} /></td>
        <td className="video-name-column"><div className="entity-name"><strong title={video.filename}>{video.filename}</strong><small>{video.externalVideoId || video.videoId || `视频记录 #${video.id}`}</small></div></td>
        <td><VideoSceneEditor key={`${projectId}:${video.id}`} variant="table" workspace={{ ...video, projectId: video.projectId || projectId, videoId: video.id }} canEdit onUpdated={(scenes) => { setItems((current) => current.map((item) => item.id === video.id ? { ...item, ...scenes } : item)); setToast('场景信息已更新') }} /></td><td title={video.supplier?.name}>{video.supplier?.name || '-'}</td>
        <td>{videoStages.find((item) => item.value === video.stage)?.label || '-'}</td>
        <td><div className="video-stage-status"><span className={`stage-status ${video.stageStatus || ''}`}>{video.stageStatus ? videoStageStatusLabels[video.stageStatus] : '-'}</span>{video.stageFailureReason && <small title={video.stageFailureReason}>{video.stageFailureReason}</small>}</div></td>
        <td><span className={`status-tag ${video.videoStatus}`}>{video.stage === 'pre_annotation' ? '-' : videoStatusLabels[video.videoStatus] || video.videoStatus || '-'}</span></td>
        <td><span className={`node-tag ${nodeToneByLabel(nodeLabels[video.currentNode])}`}>{video.stage === 'pre_annotation' ? '-' : nodeLabels[video.currentNode]}</span></td><td><span className={`work-type-tag ${video.workType}`}>{workTypeLabels[video.workType]}</span></td>
        <td>{clockDuration(video.duration)}</td><td>{milliseconds(video.effectiveDurationMs)}</td><td>{milliseconds(video.invalidDurationMs)}</td><td className="video-invalid-reasons-column"><VideoInvalidReasons video={video} /></td><td title={video.deviceId}>{video.deviceId || '-'}</td><td title={video.personName}>{video.personName || '-'}</td><td>{video.atomicTaskCount}</td><td>{video.atomicActionCount}</td><td>{video.currentAssigneeName || video.currentAssigneeId || '未分配'}</td><td>{formatDateTime(video.createdAt)}</td><td>{formatDateTime(video.updatedAt)}</td>
        <td><div className="row-actions"><button type="button" disabled={!video.id} onClick={() => preview(video)}><Eye size={15} />预览</button>{(video.stage === 'completed' || video.videoStatus === 'completed') && <button type="button" disabled={!video.id} onClick={() => navigate(`/projects/${encodeURIComponent(video.projectId || projectId)}/videos/${encodeURIComponent(video.id)}/annotation?invalid_only=1`)}>处理</button>}{preAnnotationRetryAvailable(video) && <button type="button" title={video.preAnnotationJobId ? '重新执行预处理' : '接口未返回预标注 job_id，无法发起重试'} disabled={!video.preAnnotationJobId || Boolean(retryingVideoId)} onClick={() => void retryPreAnnotation(video)}>{retryingVideoId === video.id ? '重试中...' : '手动重试'}</button>}</div></td>
      </tr>)}
      {!tableLoading && !items.length && <tr><td colSpan={21}><div className="management-empty"><CircleAlert size={32} />暂无符合条件的项目视频</div></td></tr>}
    </tbody></table></div>
    <footer className="management-footer"><span>共 {total} 条{selectedVideoIds.size > 0 && <> · 已选 {selectedVideoIds.size} 条（含其他页）<button className="clear-video-selection" type="button" disabled={exporting} onClick={() => { rowSelection.reset(); setSelectedVideos({ projectId, ids: new Set() }) }}>清空选择</button></>}</span><PaginationJump page={page} pages={pages} disabled={tableLoading} onChange={(next) => { setLoading(true); setPage(next) }} pageSize={pageSize} onPageSizeChange={(size) => { setLoading(true); setPageSize(size); setPage(1) }} /></footer>
  </section></section>{manualSyncOpen && <ManualFleetSyncModal key={projectId} projectId={projectId} projectName={projectName} supplierName={projectDetail?.id === projectId ? projectDetail.supplier?.name : undefined} onClose={() => setManualSyncOpen(false)} onSynced={manualSynced} />}{toast && <div className="toast">{toast}</div>}</AppShell>
}
