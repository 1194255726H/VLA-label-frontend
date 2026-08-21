import { ArrowLeft, ChevronDown, CircleAlert, Database, Eye, Search } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { PaginationJump } from '../components/PaginationJump'
import { annotationDataApi } from '../services/annotationDataApi'
import { projectApi } from '../services/managementApi'
import type { SessionResponse, StorageStatus, TaskNode, VideoListItem } from '../types/api'
import { FleetSyncModal } from './ProjectManagementPage'
import { formatDateTime } from '../utils/date'

const nodeLabels: Record<TaskNode, string> = { annotation: '标注', review: '质检', quality: '审核', acceptance: '验收' }
const taskStatusTabs = [{ value: '', label: '全部' }, { value: 'pending', label: '待处理' }, { value: 'in_progress', label: '处理中' }, { value: 'returned', label: '已退回' }, { value: 'completed', label: '已完成' }, { value: 'cutting', label: '切割中' }, { value: 'cancelled', label: '已取消' }]
const videoStatusLabels: Record<string, string> = { pending: '待处理', assigned: '待处理', processing: '处理中', in_progress: '处理中', describing: '模型描述中', cutting: '切割中', completed: '已完成', cancelled: '已作废', abnormal: '异常' }
const taskStatusLabels: Record<string, string> = { pending: '待处理', processing: '处理中', in_progress: '处理中', returned: '已退回', completed: '已完成', cutting: '切割中', cancelled: '已取消' }
const storageOptions: Array<{ value: StorageStatus | ''; label: string }> = [{ value: '', label: '全部素材' }, { value: 'available', label: '存在' }, { value: 'missing', label: '不存在' }, { value: 'unchecked', label: '未确认' }]
const assignmentSourceLabels: Record<string, string> = { manual_claim: '人工领取', auto_load_balance: '自动分配（负载均衡）', auto_average: '自动分配（平均）', auto_video_flow: '自动分配（视频流转）', auto_video_return: '自动分配（退回）' }
const pageSize = 20

function duration(value: number) { const minutes = Math.floor(value / 60); const seconds = Math.round(value % 60); return value ? `${minutes ? `${minutes}分` : ''}${seconds}秒` : '—' }
function fileSize(value: number) { if (!value) return '—'; if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GB`; if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`; return `${Math.round(value / 1024)} KB` }

export function AnnotationDataPage({ session }: { session: SessionResponse }) {
  const { projectId = '' } = useParams()
  const navigate = useNavigate()
  const [items, setItems] = useState<VideoListItem[]>([])
  const [projectName, setProjectName] = useState('项目视频')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keywordInput, setKeywordInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [taskStatus, setTaskStatus] = useState('')
  const [node, setNode] = useState<TaskNode | ''>('')
  const [storageStatus, setStorageStatus] = useState<StorageStatus | ''>('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [fleetOpen, setFleetOpen] = useState(false)
  const [toast, setToast] = useState('')

  const loadVideos = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const result = await annotationDataApi.list(projectId, { keyword, status: taskStatus, currentNode: node, storageStatus, page, pageSize })
      setItems(result.items); setTotal(result.total); setPages(Math.max(1, result.pages))
    } catch (reason) { setError(reason instanceof Error ? reason.message : '项目视频加载失败') }
    finally { setLoading(false) }
  }, [keyword, node, page, projectId, storageStatus, taskStatus])

  useEffect(() => {
    let active = true
    annotationDataApi.list(projectId, { keyword, status: taskStatus, currentNode: node, storageStatus, page, pageSize }).then((result) => {
      if (!active) return
      setItems(result.items); setTotal(result.total); setPages(Math.max(1, result.pages)); setError('')
    }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : '项目视频加载失败') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [keyword, node, page, projectId, storageStatus, taskStatus])
  useEffect(() => { projectApi.list().then((projects) => setProjectName(projects.find((item) => item.id === projectId)?.name || '项目视频')).catch(() => undefined) }, [projectId])
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 2500); return () => window.clearTimeout(timer) }, [toast])

  async function fleetSynced(message: string) { setFleetOpen(false); await loadVideos(); setToast(message) }
  function applySearch() { setPage(1); setKeyword(keywordInput.trim()) }
  function resetFilters() { setKeywordInput(''); setKeyword(''); setTaskStatus(''); setNode(''); setStorageStatus(''); setPage(1) }
  function preview(video: VideoListItem) { navigate(`/annotation/${encodeURIComponent(video.taskId)}?video_id=${encodeURIComponent(video.id)}&project_id=${encodeURIComponent(video.projectId || projectId)}&readonly=1`) }

  return <AppShell user={session.account}><section className="management-page"><section className="management-panel panel">
    <header className="management-toolbar annotation-data-heading"><div className="detail-title"><button className="icon-button bordered" type="button" onClick={() => navigate('/projects')} aria-label="返回项目管理"><ArrowLeft size={17} /></button><div><h2>{projectName}</h2><p>项目视频管理 · {projectId}</p></div></div><span>共 {total} 条视频，可按任务、节点和素材状态排查</span></header>
    <div className="annotation-data-tabs"><div className="status-segments">{taskStatusTabs.map((item) => <button key={item.value || 'all'} type="button" className={taskStatus === item.value ? 'active' : ''} onClick={() => { setTaskStatus(item.value); setPage(1) }}>{item.label}{taskStatus === item.value && <span>{total}</span>}</button>)}</div><button className="primary-button" type="button" onClick={() => setFleetOpen(true)}><Database size={16} />从 Fleet 同步</button></div>
    <div className="management-filters project-video-filters">
      <label><span>视频 / 任务</span><div className="filter-control"><Search size={16} /><input value={keywordInput} onChange={(event) => setKeywordInput(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && applySearch()} placeholder="视频名称、URI 或任务 ID" /></div></label>
      <label><span>任务节点</span><div className="filter-control select"><select value={node} onChange={(event) => { setNode(event.target.value as TaskNode | ''); setPage(1) }}><option value="">全部节点</option>{Object.entries(nodeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><ChevronDown size={14} /></div></label>
      <label><span>素材状态</span><div className="filter-control select"><select value={storageStatus} onChange={(event) => { setStorageStatus(event.target.value as StorageStatus | ''); setPage(1) }}>{storageOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><ChevronDown size={14} /></div></label>
      <button className="primary-button compact" type="button" onClick={applySearch}>查询</button><button className="secondary-button compact" type="button" onClick={resetFilters}>重置</button>
    </div>
    {error && <div className="error-banner"><CircleAlert size={18} /><span>{error}</span><button type="button" onClick={loadVideos}>重新加载</button></div>}
    <div className="management-table-wrap"><table className="management-table annotation-data-table project-video-table"><thead><tr><th>视频名称</th><th>视频状态</th><th>当前节点</th><th>当前处理人</th><th>所属任务</th><th>任务状态</th><th>任务节点</th><th>任务处理人</th><th>分配来源</th><th>素材状态</th><th>时长</th><th>文件大小</th><th>存储位置</th><th>更新时间</th><th>操作</th></tr></thead><tbody>
      {loading ? <tr><td colSpan={15}><div className="management-empty">正在加载项目视频...</div></td></tr> : items.map((video) => <tr key={video.id}>
        <td><div className="entity-name"><strong title={video.filename}>{video.filename}</strong><small>{video.externalVideoId || video.videoId || `视频记录 #${video.id}`}</small></div></td>
        <td><span className={`status-tag ${video.videoStatus}`}>{videoStatusLabels[video.videoStatus] || video.videoStatus || '-'}</span></td>
        <td><span className="node-tag blue">{nodeLabels[video.currentNode]}</span></td><td>{video.currentAssigneeName || video.currentAssigneeId || '未分配'}</td>
        <td><div className="entity-name"><strong title={video.taskTitle}>{video.taskTitle || '-'}</strong><small>{video.taskExternalTaskId || video.taskId}</small></div></td>
        <td><span className={`status-tag ${video.taskStatus}`}>{taskStatusLabels[video.taskStatus] || video.taskStatus || '-'}</span></td><td><span className="node-tag blue">{nodeLabels[video.taskCurrentNode]}</span></td><td>{video.taskCurrentAssigneeName || video.taskCurrentAssigneeId || '未分配'}</td><td>{assignmentSourceLabels[video.assignmentSource] || video.assignmentSource || '-'}</td>
        <td><span className={`storage-tag ${video.storageStatus}`} title={video.storageError}>{storageOptions.find((item) => item.value === video.storageStatus)?.label}</span>{video.storageError && <small className="storage-error" title={video.storageError}>{video.storageError}</small>}</td>
        <td>{duration(video.duration)}</td><td>{fileSize(video.fileSize)}</td><td><code title={video.sourceUri || video.uri}>{video.ossBucket && video.ossKey ? `${video.ossBucket}/${video.ossKey}` : video.sourceUri || video.uri || '—'}</code></td><td>{formatDateTime(video.updatedAt)}</td>
        <td><div className="row-actions"><button type="button" disabled={!video.taskId || video.storageStatus === 'missing'} onClick={() => preview(video)}><Eye size={15} />预览</button></div></td>
      </tr>)}
      {!loading && !items.length && <tr><td colSpan={15}><div className="management-empty"><CircleAlert size={32} />暂无符合条件的项目视频</div></td></tr>}
    </tbody></table></div>
    <footer className="management-footer"><span>共 {total} 条</span><div className="pagination-with-size"><PaginationJump page={page} pages={pages} disabled={loading} onChange={(next) => { setLoading(true); setPage(next) }} /><span>{pageSize}条/页</span></div></footer>
  </section></section>{fleetOpen && <FleetSyncModal projectId={projectId} projectName={projectName} onClose={() => setFleetOpen(false)} onSynced={fleetSynced} />}{toast && <div className="toast">{toast}</div>}</AppShell>
}
