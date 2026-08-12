import {
  ArrowRight, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, Clock3,
  Filter, ListFilter, MoreHorizontal, Play, RefreshCw, Search, Sparkles,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { annotationApi } from '../services/annotationApi'
import { workbenchApi } from '../services/api'
import type { SessionResponse, TaskNode, TaskTab, WorkbenchSnapshot, WorkbenchTask } from '../types/api'

const nodeLabels: Record<TaskNode, string> = { annotation: '标注', review: '质检', quality: '审核', acceptance: '验收' }
const nodeTones: Record<TaskNode, string> = { annotation: 'cyan', review: 'blue', quality: 'amber', acceptance: 'green' }
const statusLabels = { pending: '待处理', processing: '处理中', submitted: '已提交', completed: '已完成' }

function formatSeconds(value: number) {
  const minutes = Math.floor(value / 60)
  const seconds = value % 60
  return `${minutes ? `${minutes}分` : ''}${seconds}秒`
}

function TaskTable({ items, tab, loading }: { items: WorkbenchTask[]; tab: TaskTab; loading: boolean }) {
  const navigate = useNavigate()
  async function openTask(task: WorkbenchTask) {
    if (tab === 'pending' && task.status === 'pending') await annotationApi.startTask(task.id)
    navigate(`/annotation/${encodeURIComponent(task.id)}${tab === 'submitted' ? '?readonly=1' : ''}`)
  }
  return (
    <div className="table-scroll">
      <table className="task-table">
        <thead><tr>
          <th>数据名称</th><th>当前节点</th><th>流转类型</th><th>{tab === 'pending' ? '处理状态' : '提交状态'}</th>
          <th>总时长</th><th>有效时长</th><th>单次任务数</th><th>小目标数</th>
          <th>{tab === 'pending' ? '最后更新时间' : '提交时间'}</th><th className="action-column">操作</th>
        </tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={10}><div className="table-state"><RefreshCw className="spinning" size={25} /><span>正在加载任务...</span></div></td></tr> : items.length === 0 ? <tr><td colSpan={10}><div className="table-state"><ListFilter size={34} /><span>当前筛选条件下暂无任务</span></div></td></tr> : items.map((task) => <tr key={task.id}>
            <td><div className="data-name"><strong title={task.dataName}>{task.dataName}</strong><small>{task.dataId}</small></div></td>
            <td><span className={`node-tag ${nodeTones[task.node]}`}>{nodeLabels[task.node]}</span></td>
            <td><span className={task.workType === 'returned' ? 'return-type' : ''}>{task.workType === 'returned' ? '退回返修' : '正常流转'}</span></td>
            <td><span className={`status-tag ${task.status}`}>{statusLabels[task.status]}</span></td>
            <td>{formatSeconds(task.totalDuration)}</td><td>{formatSeconds(task.validDuration)}</td><td>{task.goalCount}</td><td>{task.actionCount}</td>
            <td>{tab === 'pending' ? task.updatedAt : task.submittedAt || task.updatedAt}</td>
            <td><div className="row-actions"><button type="button" onClick={() => openTask(task)}>{tab === 'pending' ? (task.status === 'processing' ? '继续处理' : '开始处理') : '查看'}</button><button className="icon-button small" type="button" aria-label="更多操作"><MoreHorizontal size={17} /></button></div></td>
          </tr>)}
        </tbody>
      </table>
    </div>
  )
}

export function WorkbenchPage({ session }: { session: SessionResponse }) {
  const navigate = useNavigate()
  const [projectId, setProjectId] = useState('')
  const [tab, setTab] = useState<TaskTab>('pending')
  const [keywordInput, setKeywordInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [node, setNode] = useState<TaskNode | ''>('')
  const [pageNo, setPageNo] = useState(1)
  const [snapshot, setSnapshot] = useState<WorkbenchSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [claimingNode, setClaimingNode] = useState<TaskNode | null>(null)
  const [toast, setToast] = useState('')

  const fetchSnapshot = useCallback(() => workbenchApi.getSnapshot({ projectId, tab, keyword, node, pageNo, pageSize: 10 }), [keyword, node, pageNo, projectId, tab])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await fetchSnapshot()
      setSnapshot(result)
      if (result.currentProjectId) setProjectId((current) => current || result.currentProjectId)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '工作台加载失败')
    } finally { setLoading(false) }
  }, [fetchSnapshot])

  useEffect(() => {
    let active = true
    fetchSnapshot()
      .then((result) => { if (active) { setSnapshot(result); if (result.currentProjectId) setProjectId((current) => current || result.currentProjectId) } })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : '工作台加载失败') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [fetchSnapshot])
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 2600)
    return () => window.clearTimeout(timer)
  }, [toast])

  const currentProject = useMemo(() => snapshot?.projects.find((item) => item.id === projectId) || snapshot?.projects[0], [projectId, snapshot])
  const totalPages = Math.max(1, Math.ceil((snapshot?.tasks.page.total || 0) / 10))

  async function claimTask(targetNode: TaskNode) {
    setClaimingNode(targetNode)
    try {
      const task = await workbenchApi.claim(projectId, targetNode)
      setToast(`已领取 ${task.dataName}`)
      await load()
    } catch (reason) { setToast(reason instanceof Error ? reason.message : '领取失败') }
    finally { setClaimingNode(null) }
  }

  function applySearch() {
    setPageNo(1)
    setKeyword(keywordInput.trim())
  }

  async function openRecommendedTask() {
    const task = snapshot?.recommendedTask
    if (!task) return
    if (task.status === 'pending') await annotationApi.startTask(task.id)
    navigate(`/annotation/${encodeURIComponent(task.id)}`)
  }

  return (
    <AppShell user={session.account}>
      <section className="workbench-page">
        {error && <div className="error-banner"><CircleAlert size={18} /><span>{error}</span><button type="button" onClick={load}>重新加载</button></div>}
        <section className="project-hero panel">
          <div className="project-hero-main">
            <div className="project-kicker"><span className="live-dot" />当前作业项目</div>
            <div className="project-title-row"><h1>{currentProject?.name || '加载中...'}</h1><div className="project-select-wrap"><select value={projectId} onChange={(event) => { setProjectId(event.target.value); setPageNo(1) }}>{snapshot?.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select><ChevronDown size={15} /></div></div>
            <p>{currentProject?.batchName} <span /> 待处理 {snapshot?.tasks.page.total || 0} 条 <span /> 跨项目自动领取额度 {currentProject?.pendingCount || 0}/{currentProject?.claimLimit || 10}</p>
          </div>
          {snapshot?.recommendedTask ? <div className="recommended-task">
            <div className="recommended-icon"><Sparkles size={19} /></div>
            <div><small>推荐优先处理</small><strong>{snapshot.recommendedTask.dataName}</strong><span>{nodeLabels[snapshot.recommendedTask.node]} · {statusLabels[snapshot.recommendedTask.status]} · 更新于 {snapshot.recommendedTask.updatedAt.slice(11)}</span></div>
            <button className="primary-button" type="button" onClick={openRecommendedTask}><Play size={16} />{snapshot.recommendedTask.status === 'processing' ? '继续处理' : '开始处理'}</button>
          </div> : <button className="primary-button claim-random-button" type="button" onClick={() => claimTask('annotation')}>随机领取</button>}
        </section>

        <div className="workbench-grid">
          <section className="task-panel panel">
            <header className="panel-heading">
              <div><h2>我的任务</h2><p>处理已领取、分配或被退回的作业任务</p></div>
              <button className="icon-button bordered" type="button" onClick={load} aria-label="刷新"><RefreshCw size={17} /></button>
            </header>
            <div className="task-tabs">
              <button className={tab === 'pending' ? 'active' : ''} type="button" onClick={() => { setTab('pending'); setPageNo(1) }}>待处理<span>{tab === 'pending' ? snapshot?.tasks.page.total || 0 : ''}</span></button>
              <button className={tab === 'submitted' ? 'active' : ''} type="button" onClick={() => { setTab('submitted'); setPageNo(1) }}>已提交</button>
            </div>
            <div className="task-filters">
              <div className="search-field"><Search size={17} /><input value={keywordInput} onChange={(event) => setKeywordInput(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && applySearch()} placeholder="搜索数据名称或数据 ID" /></div>
              <div className="select-field"><Filter size={16} /><select value={node} onChange={(event) => { setNode(event.target.value as TaskNode | ''); setPageNo(1) }}><option value="">全部节点</option>{Object.entries(nodeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><ChevronDown size={14} /></div>
              <button className="primary-button compact" type="button" onClick={applySearch}>查询</button>
              <button className="secondary-button compact" type="button" onClick={() => { setKeywordInput(''); setKeyword(''); setNode(''); setPageNo(1) }}>重置</button>
            </div>
            <TaskTable items={snapshot?.tasks.items || []} tab={tab} loading={loading} />
            <footer className="table-footer"><span>共 {snapshot?.tasks.page.total || 0} 条</span><div className="pagination"><button type="button" disabled={pageNo === 1} onClick={() => setPageNo((value) => value - 1)}><ChevronLeft size={16} /></button><strong>{pageNo}</strong><span>/ {totalPages}</span><button type="button" disabled={pageNo === totalPages} onClick={() => setPageNo((value) => value + 1)}><ChevronRight size={16} /></button></div></footer>
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
