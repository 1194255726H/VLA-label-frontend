import {
  ArrowRight, ChevronDown, CircleAlert, Clock3,
  Filter, ListFilter, Play, RefreshCw, Sparkles,
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
const statusLabels: Record<string, string> = { pending: '待处理', assigned: '待处理', claimed: '已领取', processing: '处理中', in_progress: '处理中', submitted: '已提交', completed: '已完成', rejected: '已退回' }
const decisionLabels: Record<string, string> = { approved: '已通过', rejected: '已退回', submitted: '已提交' }
const storageLabels = { available: '存在', missing: '缺失', unchecked: '未确认' }

function formatSeconds(value: number) {
  const minutes = Math.floor(value / 60)
  const seconds = value % 60
  return `${minutes ? `${minutes}分` : ''}${seconds}秒`
}

function actionFor(video: VideoListItem, tab: TaskTab) {
  if (video.storageStatus === 'missing') return { label: '素材缺失', readonly: true, disabled: true }
  if (tab === 'submitted' || ['submitted', 'completed'].includes(video.videoStatus) || video.taskStatus === 'completed') return { label: '查看', readonly: true, disabled: false }
  if (['in_progress', 'processing'].includes(video.videoStatus)) return { label: '继续处理', readonly: false, disabled: false }
  return { label: '开始处理', readonly: false, disabled: false }
}

function TaskTable({ items, tab, loading }: { items: VideoListItem[]; tab: TaskTab; loading: boolean }) {
  const navigate = useNavigate()
  async function openVideo(video: VideoListItem) {
    const action = actionFor(video, tab)
    if (action.disabled) return
    if (!action.readonly && !['in_progress', 'processing'].includes(video.videoStatus)) await annotationApi.startTask(video.taskId)
    const params = new URLSearchParams({ video_id: video.id, project_id: video.projectId })
    if (action.readonly) params.set('readonly', '1')
    navigate(`/annotation/${encodeURIComponent(video.taskId)}?${params}`)
  }
  return (
    <div className="table-scroll">
      <table className="task-table workbench-video-table">
        <thead><tr>
          <th>视频名称</th><th>所属任务</th><th>当前节点</th><th>{tab === 'pending' ? '处理状态' : '提交状态'}</th>
          <th>素材状态</th><th>时长</th><th>{tab === 'pending' ? '最后更新时间' : '提交时间'}</th><th className="action-column">操作</th>
        </tr></thead>
        <tbody>
          {!loading && (items.length === 0 ? <tr><td colSpan={8}><div className="table-state"><ListFilter size={34} /><span>当前暂无视频</span></div></td></tr> : items.map((video) => {
            const action = actionFor(video, tab)
            const displayedStatus = tab === 'submitted' ? video.submittedDecision || 'submitted' : video.videoStatus
            return <tr key={video.id}>
              <td><div className="data-name"><strong title={video.filename}>{video.filename}</strong><small>{video.videoId || video.uri || `#${video.id}`}</small></div></td>
              <td><div className="data-name"><strong title={video.taskTitle}>{video.taskTitle || '-'}</strong><small>{video.taskExternalTaskId || video.taskId}</small></div></td>
              <td><span className={`node-tag ${nodeTones[video.currentNode]}`}>{nodeLabels[video.currentNode]}</span></td>
              <td><div className="video-status-stack"><span className={`status-tag ${displayedStatus}`}>{decisionLabels[displayedStatus] || statusLabels[displayedStatus] || displayedStatus}</span><small>当前视频：{statusLabels[video.videoStatus] || video.videoStatus || '-'}</small><small>任务：{statusLabels[video.taskStatus] || video.taskStatus || '-'}</small></div></td>
              <td><span className={`storage-tag ${video.storageStatus}`} title={video.storageError}>{storageLabels[video.storageStatus]}</span></td>
              <td>{formatSeconds(video.duration)}</td>
              <td>{tab === 'pending' ? formatDateTime(video.updatedAt) : formatDateTime(video.submittedAt || video.updatedAt)}</td>
              <td><div className="row-actions"><button type="button" disabled={action.disabled} onClick={() => openVideo(video)}>{action.label}</button></div></td>
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
  const [toast, setToast] = useState('')

  const fetchWorkbenchData = useCallback(async () => {
    const otherTab: TaskTab = tab === 'pending' ? 'submitted' : 'pending'
    const [result, otherTabResult] = await Promise.all([
      workbenchApi.getSnapshot({ projectId, operatorId: session.account.id, tab, pageNo, pageSize: 10 }),
      workbenchApi.getSnapshot({ projectId, operatorId: session.account.id, tab: otherTab, pageNo: 1, pageSize: 1 }),
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
    if (!video) return
    const action = actionFor(video, 'pending')
    if (action.disabled) return
    if (!['in_progress', 'processing'].includes(video.videoStatus)) await annotationApi.startTask(video.taskId)
    navigate(`/annotation/${encodeURIComponent(video.taskId)}?video_id=${encodeURIComponent(video.id)}&project_id=${encodeURIComponent(video.projectId)}`)
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
          {snapshot?.recommendedTask ? <div className="recommended-task">
            <div className="recommended-icon"><Sparkles size={19} /></div>
            <div><small>推荐优先处理</small><strong>{snapshot.recommendedTask.filename}</strong><span>{nodeLabels[snapshot.recommendedTask.currentNode]} · {statusLabels[snapshot.recommendedTask.videoStatus] || snapshot.recommendedTask.videoStatus} · 更新于 {formatDateTime(snapshot.recommendedTask.updatedAt).slice(11)}</span></div>
            <button className="primary-button" type="button" disabled={snapshot.recommendedTask.storageStatus === 'missing'} onClick={openRecommendedTask}><Play size={16} />{['in_progress', 'processing'].includes(snapshot.recommendedTask.videoStatus) ? '继续处理' : '开始处理'}</button>
          </div> : tab === 'pending' ? <button className="primary-button claim-random-button" type="button" onClick={() => claimTask('annotation')}>随机领取</button> : null}
        </section>

        <div className="workbench-grid">
          <section className="task-panel panel">
            <header className="panel-heading">
              <div><h2>我的任务</h2><p>按视频处理已分配或已提交的作业数据</p></div>
              <button className="icon-button bordered" type="button" onClick={load} aria-label="刷新"><RefreshCw size={17} /></button>
            </header>
            <div className="task-tabs">
              <button className={tab === 'pending' ? 'active' : ''} type="button" onClick={() => { setTab('pending'); setPageNo(1) }}>待处理<span>{tabTotals.pending}</span></button>
              <button className={tab === 'submitted' ? 'active' : ''} type="button" onClick={() => { setTab('submitted'); setPageNo(1) }}>已提交<span>{tabTotals.submitted}</span></button>
            </div>
            <TaskTable items={snapshot?.tasks.items || []} tab={tab} loading={loading} />
            <footer className="table-footer"><span>共 {snapshot?.tasks.page.total || 0} 条</span><PaginationJump page={pageNo} pages={totalPages} disabled={loading} onChange={(next) => { setLoading(true); setPageNo(next) }} /></footer>
          </section>

          <aside className="workbench-side">
            <section className="metric-panel panel">
              <header><div><span>今日标注量</span><small>截至当前</small></div><Clock3 size={19} /></header>
              <div className="metric-main"><strong>{snapshot?.summary.todayObjects.toLocaleString() || 0}</strong><span>个对象</span></div>
              <div className="metric-grid"><div><span>有效时长</span><strong>{formatSeconds(snapshot?.summary.validDuration || 0)}</strong></div><div><span>单次任务</span><strong>{snapshot?.summary.goalCount || 0}</strong></div><div><span>小目标</span><strong>{snapshot?.summary.actionCount || 0}</strong></div></div>
            </section>
            <section className="claim-panel panel">
              <header><div><h2>待领取数据</h2><span>共 {(snapshot?.claimPool || []).reduce((sum, item) => sum + item.count, 0)} 条</span></div><button type="button"><Filter size={15} />筛选</button></header>
              <div className="claim-list">{snapshot?.claimPool.map((item) => <article className={`claim-card ${nodeTones[item.node]}`} key={item.node}><div><span>{item.label}</span><strong>{item.count}<small> 条可领取</small></strong></div><button type="button" disabled={item.count === 0 || claimingNode !== null} onClick={() => claimTask(item.node)}>{claimingNode === item.node ? <RefreshCw className="spinning" size={16} /> : <ArrowRight size={16} />}<span>领取</span></button></article>)}</div>
            </section>
          </aside>
        </div>
      </section>
      {toast && <div className="toast">{toast}</div>}
    </AppShell>
  )
}
