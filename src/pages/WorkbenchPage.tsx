import {
  ArrowRight, ChevronDown, CircleAlert, Clock3,
  ListFilter, Play, RefreshCw, Sparkles,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { PaginationJump } from '../components/PaginationJump'
import { annotationApi } from '../services/annotationApi'
import { workbenchApi } from '../services/api'
import type { SessionResponse, TaskNode, TaskTab, VideoListItem, WorkbenchSnapshot } from '../types/api'
import { formatDateTime } from '../utils/date'

const nodeLabels: Record<TaskNode, string> = { annotation: '标注', review: '质检', quality: '审核', acceptance: '验收' }
const nodeTones: Record<TaskNode, string> = { annotation: 'cyan', review: 'blue', quality: 'amber', acceptance: 'green' }
const videoStatusLabels: Record<string, string> = { pending: '待处理', assigned: '待处理', claimed: '已领取', processing: '处理中', in_progress: '处理中', describing: '模型描述中', cutting: '切割中', completed: '已完成', cancelled: '已作废', abnormal: '异常' }
const workTypeLabels = { normal: '正常流转', returned: '退回返修' }
const submittedNodeMap: Record<string, TaskNode> = { annotation: 'annotation', quality_check: 'review', review: 'quality', acceptance: 'acceptance' }

function formatClock(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '—'
  const totalSeconds = Math.max(0, Math.round(value))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return hours ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}` : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function formatMilliseconds(value: number | null) { return value === null ? '—' : formatClock(value / 1000) }

function actionFor(video: VideoListItem, tab: TaskTab) {
  if (tab === 'submitted' || video.videoStatus === 'completed') return { label: '查看', readonly: true, disabled: !video.taskId && !video.uri }
  if (['in_progress', 'processing'].includes(video.videoStatus)) return { label: '继续处理', readonly: false, disabled: false }
  return { label: '开始处理', readonly: false, disabled: false }
}

function TaskTable({ items, tab, loading, onError }: { items: VideoListItem[]; tab: TaskTab; loading: boolean; onError: (message: string) => void }) {
  const navigate = useNavigate()
  const [openingVideoId, setOpeningVideoId] = useState('')
  const columnCount = tab === 'submitted' ? 15 : 14
  async function openVideo(video: VideoListItem) {
    const action = actionFor(video, tab)
    if (action.disabled) return
    setOpeningVideoId(video.id)
    try {
      const taskId = video.taskId || await workbenchApi.resolveTaskId(video)
      if (!taskId) {
        if (action.readonly && video.uri) return window.open(video.uri, '_blank', 'noopener,noreferrer')
        throw new Error('未找到该视频所属任务，请后端在工作台视频接口中返回 task_id')
      }
      if (!action.readonly && !['in_progress', 'processing'].includes(video.videoStatus)) await annotationApi.startTask(taskId)
      const params = new URLSearchParams({ video_id: video.id, project_id: video.projectId })
      if (action.readonly) params.set('readonly', '1')
      navigate(`/annotation/${encodeURIComponent(taskId)}?${params}`)
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : '无法进入视频作业页')
    } finally {
      setOpeningVideoId('')
    }
  }
  return (
    <div className="table-scroll">
      <table className={`task-table workbench-video-table ${tab}`}>
        <thead><tr>
          <th>视频名称</th><th>状态</th><th>当前节点</th>
          {tab === 'submitted' && <th>提交节点</th>}
          <th>流转类型</th><th>原视频时长</th><th>切片覆盖时长</th><th>有效片段时长</th><th>无效片段时长</th><th>未覆盖时长</th><th>单次任务数</th><th>小目标数</th><th>当前处理人</th><th>创建时间</th><th className="action-column">操作</th>
        </tr></thead>
        <tbody>
          {!loading && (items.length === 0 ? <tr><td colSpan={columnCount}><div className="table-state"><ListFilter size={34} /><span>当前暂无视频</span></div></td></tr> : items.map((video, index) => {
            const action = actionFor(video, tab)
            const submittedNode = submittedNodeMap[video.submittedNode || '']
            return <tr key={`${video.id}-${video.submittedNode || 'pending'}-${index}`}>
              <td><div className="data-name"><strong title={video.filename}>{video.filename}</strong><small>{video.externalVideoId || video.videoId || `#${video.id}`}</small></div></td>
              <td><span className={`status-tag ${video.videoStatus}`}>{videoStatusLabels[video.videoStatus] || video.videoStatus || '-'}</span></td>
              <td><span className={`node-tag ${nodeTones[video.currentNode]}`}>{nodeLabels[video.currentNode]}</span></td>
              {tab === 'submitted' && <td>{submittedNode ? <span className={`node-tag ${nodeTones[submittedNode]}`}>{nodeLabels[submittedNode]}</span> : '-'}</td>}
              <td><span className={`work-type-tag ${video.workType}`}>{workTypeLabels[video.workType]}</span></td>
              <td>{formatClock(video.duration)}</td><td>{formatMilliseconds(video.selectedDurationMs)}</td><td>{formatMilliseconds(video.effectiveDurationMs)}</td><td>{formatMilliseconds(video.invalidDurationMs)}</td><td>{formatMilliseconds(video.unselectedDurationMs)}</td><td>{video.atomicTaskCount}</td><td>{video.atomicActionCount}</td><td>{video.currentAssigneeName || video.currentAssigneeId || '未分配'}</td><td>{formatDateTime(video.createdAt)}</td>
              <td><div className="row-actions"><button type="button" disabled={action.disabled || Boolean(openingVideoId)} onClick={() => openVideo(video)}>{openingVideoId === video.id ? '正在打开...' : action.label}</button></div></td>
            </tr>
          }))}
        </tbody>
      </table>
      {loading && <div className="table-state table-loading-layer"><RefreshCw className="spinning" size={25} /><span>加载中...</span></div>}
    </div>
  )
}

export function WorkbenchPage({ session }: { session: SessionResponse }) {
  const navigate = useNavigate()
  const [projectId, setProjectId] = useState('')
  const [tab, setTab] = useState<TaskTab>('pending')
  const [tabTotals, setTabTotals] = useState<Record<TaskTab, number>>({ pending: 0, submitted: 0 })
  const [pageNo, setPageNo] = useState(1)
  const [snapshot, setSnapshot] = useState<WorkbenchSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [claimingNode, setClaimingNode] = useState<TaskNode | null>(null)
  const [openingRecommended, setOpeningRecommended] = useState(false)
  const [toast, setToast] = useState('')

  const fetchWorkbenchData = useCallback(async () => {
    const otherTab: TaskTab = tab === 'pending' ? 'submitted' : 'pending'
    const [result, otherTabResult] = await Promise.all([
      workbenchApi.getSnapshot({ projectId, operatorId: session.account.id, tab, pageNo, pageSize: 10, includeOverview: true }),
      workbenchApi.getSnapshot({ projectId, operatorId: session.account.id, tab: otherTab, pageNo: 1, pageSize: 1, includeOverview: false }),
    ])
    return {
      result,
      totals: {
        [tab]: result.tasks.page.total,
        [otherTab]: otherTabResult.tasks.page.total,
      } as Record<TaskTab, number>,
    }
  }, [pageNo, projectId, session.account.id, tab])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { result, totals } = await fetchWorkbenchData()
      setSnapshot(result)
      setTabTotals(totals)
      if (result.currentProjectId) setProjectId((current) => current || result.currentProjectId)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '工作台加载失败')
    } finally { setLoading(false) }
  }, [fetchWorkbenchData])

  useEffect(() => {
    let active = true
    fetchWorkbenchData()
      .then(({ result, totals }) => { if (active) { setSnapshot(result); setTabTotals(totals); if (result.currentProjectId) setProjectId((current) => current || result.currentProjectId) } })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : '工作台加载失败') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [fetchWorkbenchData])
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 2600)
    return () => window.clearTimeout(timer)
  }, [toast])

  const currentProject = useMemo(() => snapshot?.projects.find((item) => item.id === projectId) || snapshot?.projects[0], [projectId, snapshot])
  const totalPages = Math.max(1, snapshot?.tasks.pages || 1)

  async function claimTask(targetNode: TaskNode) {
    setClaimingNode(targetNode)
    try {
      const task = await workbenchApi.claim(projectId, targetNode)
      setToast(`已领取 ${task.dataName}`)
      await load()
    } catch (reason) { setToast(reason instanceof Error ? reason.message : '领取失败') }
    finally { setClaimingNode(null) }
  }

  async function openRecommendedTask() {
    const video = snapshot?.recommendedTask
    if (!video || openingRecommended) return
    setOpeningRecommended(true)
    try {
      const taskId = video.taskId || await workbenchApi.resolveTaskId(video)
      if (!taskId) throw new Error('未找到该视频所属任务，请后端在工作台视频接口中返回 task_id')
      if (!['in_progress', 'processing'].includes(video.videoStatus)) await annotationApi.startTask(taskId)
      navigate(`/annotation/${encodeURIComponent(taskId)}?video_id=${encodeURIComponent(video.id)}&project_id=${encodeURIComponent(video.projectId)}`)
    } catch (reason) { setToast(reason instanceof Error ? reason.message : '无法进入视频作业页') }
    finally { setOpeningRecommended(false) }
  }

  return (
    <AppShell user={session.account}>
      <section className="workbench-page">
        {error && <div className="error-banner"><CircleAlert size={18} /><span>{error}</span><button type="button" onClick={load}>重新加载</button></div>}
        <section className="project-hero panel">
          <div className="project-hero-main">
            <div className="project-kicker"><span className="live-dot" />当前作业项目</div>
            <div className="project-title-row"><h1>{currentProject?.name || '加载中...'}</h1><div className="project-select-wrap"><select value={projectId} onChange={(event) => { setProjectId(event.target.value); setPageNo(1); setTabTotals({ pending: 0, submitted: 0 }) }}>{snapshot?.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select><ChevronDown size={15} /></div></div>
            <p>{currentProject?.batchName} <span /> {tab === 'pending' ? '待处理' : '已提交'} {snapshot?.tasks.page.total || 0} 条 <span /> 当前任务额度 {currentProject?.pendingCount || 0}/{currentProject?.claimLimit || 10}</p>
          </div>
          {!loading && snapshot && (snapshot.recommendedTask ? <div className="recommended-task">
            <div className="recommended-icon"><Sparkles size={19} /></div>
            <div><small>推荐优先处理</small><strong>{snapshot.recommendedTask.filename}</strong><span>{nodeLabels[snapshot.recommendedTask.currentNode]} · {videoStatusLabels[snapshot.recommendedTask.videoStatus] || snapshot.recommendedTask.videoStatus} · 创建于 {formatDateTime(snapshot.recommendedTask.createdAt)}</span></div>
            <button className="primary-button" type="button" disabled={openingRecommended} onClick={openRecommendedTask}><Play size={16} />{openingRecommended ? '正在打开...' : ['in_progress', 'processing'].includes(snapshot.recommendedTask.videoStatus) ? '继续处理' : '开始处理'}</button>
          </div> : tab === 'pending' ? <button className="primary-button claim-random-button" type="button" onClick={() => claimTask('annotation')}>随机领取</button> : null)}
        </section>

        <div className="workbench-grid">
          <section className="task-panel panel">
            <header className="panel-heading">
              <div><h2>我的任务</h2><p>按视频处理已分配或已提交的作业数据</p></div>
              <button className="icon-button bordered" type="button" onClick={load} aria-label="刷新"><RefreshCw size={17} /></button>
            </header>
            <div className="task-tabs">
              <button className={tab === 'pending' ? 'active' : ''} type="button" onClick={() => { if (tab === 'pending') return; setLoading(true); setTab('pending'); setPageNo(1) }}>待处理<span>{tabTotals.pending}</span></button>
              <button className={tab === 'submitted' ? 'active' : ''} type="button" onClick={() => { if (tab === 'submitted') return; setLoading(true); setTab('submitted'); setPageNo(1) }}>已提交<span>{tabTotals.submitted}</span></button>
            </div>
            <TaskTable items={snapshot?.tasks.items || []} tab={tab} loading={loading} onError={setToast} />
            <footer className="table-footer"><span>共 {snapshot?.tasks.page.total || 0} 条</span><PaginationJump page={pageNo} pages={totalPages} disabled={loading} onChange={(next) => { setLoading(true); setPageNo(next) }} /></footer>
          </section>

          <aside className="workbench-side">
            <section className="metric-panel panel">
              <header><div><span>今日作业统计</span><small>{snapshot?.summary.date || '截至当前'}</small></div><Clock3 size={19} /></header>
              <div className="metric-main"><strong>{snapshot?.summary.processedCount.toLocaleString() || 0}</strong><span>条处理数据</span></div>
              <div className="metric-grid daily-stats-grid"><div><span>完成作业</span><strong>{snapshot?.summary.completedCount || 0} 条</strong></div><div><span>切片覆盖时长</span><strong>{formatMilliseconds(snapshot?.summary.selectedDurationMs || 0)}</strong></div><div><span>有效片段时长</span><strong>{formatMilliseconds(snapshot?.summary.effectiveDurationMs || 0)}</strong></div><div><span>无效片段时长</span><strong>{formatMilliseconds(snapshot?.summary.invalidDurationMs || 0)}</strong></div><div><span>无效率</span><strong>{snapshot?.summary.invalidRatePct || 0}%</strong></div><div><span>单次任务</span><strong>{snapshot?.summary.atomicTaskCount || 0}</strong></div><div><span>小目标</span><strong>{snapshot?.summary.atomicActionCount || 0}</strong></div></div>
            </section>
            <section className="claim-panel panel">
              <header><div><h2>待领取数据</h2><span>共 {(snapshot?.claimPool || []).reduce((sum, item) => sum + item.count, 0)} 条</span></div></header>
              <div className="claim-list">{snapshot?.claimPool.map((item) => <article className={`claim-card ${nodeTones[item.node]}`} key={item.node}><div><span>{item.label}</span><strong>{item.count}<small> 条可领取</small></strong></div><button type="button" disabled={item.count === 0 || claimingNode !== null} onClick={() => claimTask(item.node)}>{claimingNode === item.node ? <RefreshCw className="spinning" size={16} /> : <ArrowRight size={16} />}<span>领取</span></button></article>)}</div>
            </section>
          </aside>
        </div>
      </section>
      {toast && <div className="toast">{toast}</div>}
    </AppShell>
  )
}
