import {
  ArrowRight, ChevronDown, CircleAlert, Clock3,
  ListFilter, Play, RefreshCw, Sparkles,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { PaginationJump } from '../components/PaginationJump'
import { workbenchApi } from '../services/api'
import type { Project, SessionResponse, TaskNode, TaskTab, VideoListItem, WorkbenchSnapshot } from '../types/api'
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
  if (tab === 'submitted' || video.videoStatus === 'completed') return { label: '查看', readonly: true, disabled: !video.id }
  if (['in_progress', 'processing'].includes(video.videoStatus)) return { label: '继续处理', readonly: false, disabled: false }
  return { label: '开始处理', readonly: false, disabled: false }
}

function TaskTable({ items, tab, loading, onError }: { items: VideoListItem[]; tab: TaskTab; loading: boolean; onError: (message: string) => void }) {
  const navigate = useNavigate()
  const [openingVideoId, setOpeningVideoId] = useState('')
  const columnCount = tab === 'submitted' ? 19 : 18
  async function openVideo(video: VideoListItem) {
    const action = actionFor(video, tab)
    if (action.disabled) return
    setOpeningVideoId(video.id)
    try {
      if (!video.projectId || !video.id) throw new Error('视频缺少项目或视频 ID')
      if (!action.readonly && !video.currentAssigneeId && !['in_progress', 'processing'].includes(video.videoStatus)) await workbenchApi.claimVideo(video.projectId, video.id)
      const params = new URLSearchParams()
      if (action.readonly) params.set('readonly', '1')
      navigate(`/projects/${encodeURIComponent(video.projectId)}/videos/${encodeURIComponent(video.id)}/annotation${params.size ? `?${params}` : ''}`)
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
          <th>视频名称</th><th>一级场景</th><th>二级场景</th><th>供应商</th><th>状态</th><th>当前节点</th>
          {tab === 'submitted' && <th>提交节点</th>}
          <th>流转类型</th><th>原视频时长</th><th>切片覆盖时长</th><th className="segment-duration-column">有效片段时长</th><th className="segment-duration-column">无效片段时长</th><th>未覆盖时长</th><th>单次任务数</th><th className="count-column">小目标数</th><th className="assignee-column">当前处理人</th><th>创建时间</th><th>更新时间</th><th className="action-column">操作</th>
        </tr></thead>
        <tbody>
          {!loading && (items.length === 0 ? <tr><td colSpan={columnCount}><div className="table-state"><ListFilter size={34} /><span>当前暂无视频</span></div></td></tr> : items.map((video, index) => {
            const action = actionFor(video, tab)
            const submittedNode = submittedNodeMap[video.submittedNode || '']
            return <tr key={`${video.id}-${video.submittedNode || 'pending'}-${index}`}>
              <td><div className="data-name"><strong title={video.filename}>{video.filename}</strong><small>{video.externalVideoId || video.videoId || `#${video.id}`}</small></div></td>
              <td title={video.scene1?.name}>{video.scene1?.name || '-'}</td><td title={video.scene2?.name}>{video.scene2?.name || '-'}</td><td title={video.supplier?.name}>{video.supplier?.name || '-'}</td>
              <td><span className={`status-tag ${video.videoStatus}`}>{videoStatusLabels[video.videoStatus] || video.videoStatus || '-'}</span></td>
              <td><span className={`node-tag ${nodeTones[video.currentNode]}`}>{nodeLabels[video.currentNode]}</span></td>
              {tab === 'submitted' && <td>{submittedNode ? <span className={`node-tag ${nodeTones[submittedNode]}`}>{nodeLabels[submittedNode]}</span> : '-'}</td>}
              <td><span className={`work-type-tag ${video.workType}`}>{workTypeLabels[video.workType]}</span></td>
              <td>{formatClock(video.duration)}</td><td>{formatMilliseconds(video.selectedDurationMs)}</td><td className="segment-duration-column">{formatMilliseconds(video.effectiveDurationMs)}</td><td className="segment-duration-column">{formatMilliseconds(video.invalidDurationMs)}</td><td>{formatMilliseconds(video.unselectedDurationMs)}</td><td>{video.atomicTaskCount}</td><td className="count-column">{video.atomicActionCount}</td><td className="assignee-column" title={video.currentAssigneeName || String(video.currentAssigneeId || '')}>{video.currentAssigneeName || video.currentAssigneeId || '未分配'}</td><td>{formatDateTime(video.createdAt)}</td><td>{formatDateTime(video.updatedAt)}</td>
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
  const [projects, setProjects] = useState<Project[]>([])
  const [tab, setTab] = useState<TaskTab>('pending')
  const [tabTotals, setTabTotals] = useState<Record<TaskTab, number>>({ pending: 0, submitted: 0 })
  const [pageNo, setPageNo] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [snapshot, setSnapshot] = useState<WorkbenchSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [claimingNode, setClaimingNode] = useState<TaskNode | null>(null)
  const [openingRecommended, setOpeningRecommended] = useState(false)
  const [toast, setToast] = useState('')

  const fetchWorkbenchData = useCallback(async () => {
    if (!projectId) throw new Error('请先选择作业项目')
    const otherTab: TaskTab = tab === 'pending' ? 'submitted' : 'pending'
    const [result, otherTabResult] = await Promise.all([
      workbenchApi.getSnapshot({ projectId, operatorId: session.account.id, tab, pageNo, pageSize, includeOverview: true }),
      workbenchApi.getSnapshot({ projectId, operatorId: session.account.id, tab: otherTab, pageNo: 1, pageSize: 1, includeOverview: false }),
    ])
    return {
      result,
      totals: {
        [tab]: result.tasks.page.total,
        [otherTab]: otherTabResult.tasks.page.total,
      } as Record<TaskTab, number>,
    }
  }, [pageNo, pageSize, projectId, session.account.id, tab])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { result, totals } = await fetchWorkbenchData()
      setSnapshot(result)
      setProjects(result.projects)
      setTabTotals(totals)
      if (result.currentProjectId) setProjectId((current) => current || result.currentProjectId)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '工作台加载失败')
    } finally { setLoading(false) }
  }, [fetchWorkbenchData])

  useEffect(() => {
    let active = true
    workbenchApi.listProjects()
      .then((items) => {
        if (!active) return
        setProjects(items)
        const nextProjectId = items.find((item) => item.status === 'running')?.id || items[0]?.id || ''
        setProjectId((current) => current || nextProjectId)
        if (!nextProjectId) {
          setSnapshot(null)
          setTabTotals({ pending: 0, submitted: 0 })
          setLoading(false)
        }
      })
      .catch((reason) => { if (active) { setError(reason instanceof Error ? reason.message : '项目列表加载失败'); setLoading(false) } })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!projectId) return
    let active = true
    fetchWorkbenchData()
      .then(({ result, totals }) => { if (active) { setSnapshot(result); setProjects(result.projects); setTabTotals(totals); if (result.currentProjectId) setProjectId((current) => current || result.currentProjectId) } })
      .catch((reason) => { if (active) { setSnapshot(null); setTabTotals({ pending: 0, submitted: 0 }); setError(reason instanceof Error ? reason.message : '工作台加载失败') } })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [fetchWorkbenchData, projectId])
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 2600)
    return () => window.clearTimeout(timer)
  }, [toast])

  const currentProject = useMemo(() => projects.find((item) => item.id === projectId) || projects[0], [projectId, projects])
  const totalPages = Math.max(1, snapshot?.tasks.pages || 1)

  async function claimTask(targetNode: TaskNode) {
    setClaimingNode(targetNode)
    try {
      const video = await workbenchApi.claim(projectId, targetNode)
      setToast(`已领取 ${video.filename}`)
      await load()
    } catch (reason) { setToast(reason instanceof Error ? reason.message : '领取失败') }
    finally { setClaimingNode(null) }
  }

  async function openRecommendedTask() {
    const video = snapshot?.recommendedTask
    if (!video || openingRecommended) return
    setOpeningRecommended(true)
    try {
      if (!video.projectId || !video.id) throw new Error('视频缺少项目或视频 ID')
      if (!video.currentAssigneeId && !['in_progress', 'processing'].includes(video.videoStatus)) await workbenchApi.claimVideo(video.projectId, video.id)
      navigate(`/projects/${encodeURIComponent(video.projectId)}/videos/${encodeURIComponent(video.id)}/annotation`)
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
            <div className="project-title-row"><h1>{currentProject?.name || (loading ? '加载中...' : '暂无可作业项目')}</h1><div className="project-select-wrap"><select value={projectId} disabled={!projects.length} onChange={(event) => { setLoading(true); setError(''); setSnapshot(null); setProjectId(event.target.value); setPageNo(1); setTabTotals({ pending: 0, submitted: 0 }) }}>{!projects.length && <option value="">暂无项目</option>}{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select><ChevronDown size={15} /></div></div>
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
            <footer className="table-footer"><span>共 {snapshot?.tasks.page.total || 0} 条</span><PaginationJump page={pageNo} pages={totalPages} disabled={loading} onChange={(next) => { setLoading(true); setPageNo(next) }} pageSize={pageSize} onPageSizeChange={(size) => { setLoading(true); setPageSize(size); setPageNo(1) }} /></footer>
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
