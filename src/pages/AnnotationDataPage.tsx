import { ArrowLeft, CircleAlert, Database, Eye, Search } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { PaginationJump } from '../components/PaginationJump'
import { annotationDataApi } from '../services/annotationDataApi'
import { projectApi } from '../services/managementApi'
import type { SessionResponse, TaskNode, VideoListItem } from '../types/api'
import { FleetSyncModal } from './ProjectManagementPage'
import { formatDateTime } from '../utils/date'

const nodeLabels: Record<TaskNode, string> = { annotation: '标注', review: '质检', quality: '审核', acceptance: '验收' }
const videoStatusTabs = [{ value: '', label: '全部' }, { value: 'pending', label: '待处理' }, { value: 'in_progress', label: '处理中' }, { value: 'describing', label: '模型描述中' }, { value: 'cutting', label: '切割中' }, { value: 'completed', label: '已完成' }, { value: 'cancelled', label: '已作废' }, { value: 'abnormal', label: '异常' }]
const videoStatusLabels: Record<string, string> = { pending: '待处理', assigned: '待处理', processing: '处理中', in_progress: '处理中', describing: '模型描述中', cutting: '切割中', completed: '已完成', cancelled: '已作废', abnormal: '异常' }
const workTypeLabels = { normal: '正常流转', returned: '退回返修' }
const pageSize = 20
const initialVideoStatusTotals = Object.fromEntries(videoStatusTabs.map((item) => [item.value, 0])) as Record<string, number>

function clockDuration(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '—'
  const totalSeconds = Math.max(0, Math.round(value))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return hours ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}` : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
function milliseconds(value: number | null) { return value === null ? '—' : clockDuration(value / 1000) }

export function AnnotationDataPage({ session }: { session: SessionResponse }) {
  const { projectId = '' } = useParams()
  const navigate = useNavigate()
  const [items, setItems] = useState<VideoListItem[]>([])
  const [projectName, setProjectName] = useState('项目视频')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filenameInput, setFilenameInput] = useState('')
  const [filename, setFilename] = useState('')
  const [videoStatus, setVideoStatus] = useState('')
  const [assigneeInput, setAssigneeInput] = useState('')
  const [currentAssigneeId, setCurrentAssigneeId] = useState('')
  const [createdAtStart, setCreatedAtStart] = useState('')
  const [createdAtEnd, setCreatedAtEnd] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [videoStatusTotals, setVideoStatusTotals] = useState(initialVideoStatusTotals)
  const [fleetOpen, setFleetOpen] = useState(false)
  const [toast, setToast] = useState('')

  const loadVideos = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const result = await annotationDataApi.list(projectId, { filename, status: videoStatus, currentAssigneeId, createdAtStart, createdAtEnd, page, pageSize })
      setItems(result.items); setTotal(result.total); setPages(Math.max(1, result.pages))
    } catch (reason) { setError(reason instanceof Error ? reason.message : '项目视频加载失败') }
    finally { setLoading(false) }
  }, [createdAtEnd, createdAtStart, currentAssigneeId, filename, page, projectId, videoStatus])

  const loadVideoStatusTotals = useCallback(async () => {
    try {
      const results = await Promise.all(videoStatusTabs.map((item) => annotationDataApi.list(projectId, { status: item.value, page: 1, pageSize: 1 })))
      setVideoStatusTotals(Object.fromEntries(videoStatusTabs.map((item, index) => [item.value, results[index].total])))
    } catch { /* 列表主体仍可独立展示，统计失败时保留上次结果 */ }
  }, [projectId])

  useEffect(() => {
    let active = true
    annotationDataApi.list(projectId, { filename, status: videoStatus, currentAssigneeId, createdAtStart, createdAtEnd, page, pageSize }).then((result) => {
      if (!active) return
      setItems(result.items); setTotal(result.total); setPages(Math.max(1, result.pages)); setError('')
    }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : '项目视频加载失败') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [createdAtEnd, createdAtStart, currentAssigneeId, filename, page, projectId, videoStatus])
  useEffect(() => {
    let active = true
    async function loadTotals() { await Promise.resolve(); if (active) await loadVideoStatusTotals() }
    void loadTotals()
    return () => { active = false }
  }, [loadVideoStatusTotals])
  useEffect(() => { projectApi.list().then((projects) => setProjectName(projects.find((item) => item.id === projectId)?.name || '项目视频')).catch(() => undefined) }, [projectId])
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 2500); return () => window.clearTimeout(timer) }, [toast])

  async function fleetSynced(message: string) { setFleetOpen(false); await Promise.all([loadVideos(), loadVideoStatusTotals()]); setToast(message) }
  function applySearch() { setPage(1); setFilename(filenameInput.trim()); setCurrentAssigneeId(assigneeInput.trim()) }
  function resetFilters() { setFilenameInput(''); setFilename(''); setVideoStatus(''); setAssigneeInput(''); setCurrentAssigneeId(''); setCreatedAtStart(''); setCreatedAtEnd(''); setPage(1) }
  function preview(video: VideoListItem) {
    const effectiveProjectId = video.projectId || projectId
    if (effectiveProjectId && video.id) navigate(`/projects/${encodeURIComponent(effectiveProjectId)}/videos/${encodeURIComponent(video.id)}/annotation?readonly=1`)
  }

  return <AppShell user={session.account}><section className="management-page"><section className="management-panel panel">
    <header className="management-toolbar annotation-data-heading"><div className="detail-title"><button className="icon-button bordered" type="button" onClick={() => navigate('/projects')} aria-label="返回项目管理"><ArrowLeft size={17} /></button><div><h2>{projectName}</h2><p>项目视频管理 · {projectId}</p></div></div><span>共 {total} 条视频，可按视频状态、处理人和创建时间排查</span></header>
    <div className="annotation-data-tabs"><div className="status-segments">{videoStatusTabs.map((item) => <button key={item.value || 'all'} type="button" className={videoStatus === item.value ? 'active' : ''} onClick={() => { setVideoStatus(item.value); setPage(1) }}>{item.label}<span>{videoStatusTotals[item.value] || 0}</span></button>)}</div><button className="primary-button" type="button" onClick={() => setFleetOpen(true)}><Database size={16} />从 Fleet 同步</button></div>
    <div className="management-filters project-video-filters">
      <label><span>视频名称</span><div className="filter-control"><Search size={16} /><input value={filenameInput} onChange={(event) => setFilenameInput(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && applySearch()} placeholder="请输入视频文件名" /></div></label>
      <label><span>当前处理人 ID</span><div className="filter-control"><input type="number" min="1" step="1" value={assigneeInput} onChange={(event) => setAssigneeInput(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && applySearch()} placeholder="请输入处理人 ID" /></div></label>
      <label><span>创建时间（开始）</span><div className="filter-control"><input type="date" value={createdAtStart} onChange={(event) => { setCreatedAtStart(event.target.value); setPage(1) }} /></div></label>
      <label><span>创建时间（结束）</span><div className="filter-control"><input type="date" value={createdAtEnd} onChange={(event) => { setCreatedAtEnd(event.target.value); setPage(1) }} /></div></label>
      <button className="primary-button compact" type="button" onClick={applySearch}>查询</button><button className="secondary-button compact" type="button" onClick={resetFilters}>重置</button>
    </div>
    {error && <div className="error-banner"><CircleAlert size={18} /><span>{error}</span><button type="button" onClick={loadVideos}>重新加载</button></div>}
    <div className="management-table-wrap"><table className="management-table annotation-data-table project-video-table"><thead><tr><th>视频名称</th><th>状态</th><th>作业节点</th><th>流转类型</th><th>原视频时长</th><th>切片覆盖时长</th><th>有效片段时长</th><th>无效片段时长</th><th>未覆盖时长</th><th>单次任务数</th><th>小目标数</th><th>处理人</th><th>创建时间</th><th>操作</th></tr></thead><tbody>
      {loading ? <tr><td colSpan={14}><div className="management-empty">正在加载项目视频...</div></td></tr> : items.map((video) => <tr key={video.id}>
        <td><div className="entity-name"><strong title={video.filename}>{video.filename}</strong><small>{video.externalVideoId || video.videoId || `视频记录 #${video.id}`}</small></div></td>
        <td><span className={`status-tag ${video.videoStatus}`}>{videoStatusLabels[video.videoStatus] || video.videoStatus || '-'}</span></td>
        <td><span className="node-tag blue">{nodeLabels[video.currentNode]}</span></td><td><span className={`work-type-tag ${video.workType}`}>{workTypeLabels[video.workType]}</span></td>
        <td>{clockDuration(video.duration)}</td><td>{milliseconds(video.selectedDurationMs)}</td><td>{milliseconds(video.effectiveDurationMs)}</td><td>{milliseconds(video.invalidDurationMs)}</td><td>{milliseconds(video.unselectedDurationMs)}</td><td>{video.atomicTaskCount}</td><td>{video.atomicActionCount}</td><td>{video.currentAssigneeName || video.currentAssigneeId || '未分配'}</td><td>{formatDateTime(video.createdAt)}</td>
        <td><div className="row-actions"><button type="button" disabled={!video.id} onClick={() => preview(video)}><Eye size={15} />预览</button></div></td>
      </tr>)}
      {!loading && !items.length && <tr><td colSpan={14}><div className="management-empty"><CircleAlert size={32} />暂无符合条件的项目视频</div></td></tr>}
    </tbody></table></div>
    <footer className="management-footer"><span>共 {total} 条</span><div className="pagination-with-size"><PaginationJump page={page} pages={pages} disabled={loading} onChange={(next) => { setLoading(true); setPage(next) }} /><span>{pageSize}条/页</span></div></footer>
  </section></section>{fleetOpen && <FleetSyncModal projectId={projectId} projectName={projectName} onClose={() => setFleetOpen(false)} onSynced={fleetSynced} />}{toast && <div className="toast">{toast}</div>}</AppShell>
}
