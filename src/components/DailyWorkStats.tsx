import { Clock3 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { workbenchStatsApi } from '../services/workbenchStatsApi'
import type { TaskNode, User, WorkbenchDailyStats } from '../types/api'
import { nodeLabels, userTaskNodes } from '../utils/node'
import { canViewAllDailyStats } from '../utils/permissions'

function duration(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000))
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map((part) => String(part).padStart(2, '0')).join(':')
}

export function DailyWorkStats({ projectId, projectOwnerId, user, refreshKey }: { projectId: string; projectOwnerId?: string; user: User; refreshKey: number }) {
  const canSwitchScope = canViewAllDailyStats(user, projectOwnerId)
  const nodes = canSwitchScope ? Object.keys(nodeLabels) as TaskNode[] : userTaskNodes(user)
  const contextKey = JSON.stringify([projectId, user.id, canSwitchScope])
  const [selection, setSelection] = useState<{ key: string; scope: 'all' | 'self'; node?: TaskNode }>({ key: '', scope: 'self' })
  const selectedScope = canSwitchScope && (selection.key !== contextKey || selection.scope === 'all') ? 'all' : 'self'
  const selectedNode = selection.key === contextKey && selection.node && nodes.includes(selection.node) ? selection.node : nodes[0]
  const statsUser = selectedScope === 'all' ? 'all' : String(user.id)
  const [retry, setRetry] = useState(0)
  const [result, setResult] = useState<{ key: string; data?: WorkbenchDailyStats; error?: string }>({ key: '' })
  const requestKey = JSON.stringify([projectId, statsUser, refreshKey, retry])
  const hasNode = nodes.length > 0
  const loading = Boolean(projectId && hasNode && result.key !== requestKey)
  const data = result.key === requestKey ? result.data : undefined
  const error = result.key === requestKey ? result.error : undefined
  const metrics = selectedNode ? data?.nodes[selectedNode] : undefined
  const today = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

  useEffect(() => {
    if (!projectId || !hasNode) return
    let active = true
    workbenchStatsApi.dailyStats(projectId, statsUser).then((data) => { if (active) setResult({ key: requestKey, data }) })
      .catch((reason) => { if (active) setResult({ key: requestKey, error: reason instanceof Error ? reason.message : '统计加载失败' }) })
    return () => { active = false }
  }, [hasNode, projectId, requestKey, statsUser])

  return <section className="metric-panel panel daily-work-stats" aria-label="今日作业统计" aria-busy={loading}>
    <header><div><span>今日作业统计</span><small>{today} · 按实际提交人统计</small></div><Clock3 size={19} /></header>
    {canSwitchScope ? <div className="daily-stats-scope" role="group" aria-label="统计范围">{(['all', 'self'] as const).map((scope) => <button key={scope} type="button" aria-pressed={selectedScope === scope} onClick={() => setSelection({ key: contextKey, scope, node: selectedNode })}>{scope === 'all' ? '全员' : '本人'}</button>)}</div> : <p className="daily-stats-caption">本人作业统计</p>}
    <div className="daily-stats-nodes" role="tablist" aria-label="统计作业节点">{nodes.map((node) => <button key={node} type="button" role="tab" aria-selected={selectedNode === node} onClick={() => setSelection({ key: contextKey, scope: selectedScope, node })}>{nodeLabels[node]}</button>)}</div>
    {!hasNode ? <p className="daily-stats-caption">当前账号没有可查看的作业节点</p> : <>
      {error && <div className="daily-stats-error" role="alert"><span>{error}</span><button type="button" onClick={() => setRetry((value) => value + 1)}>重新加载</button></div>}
      <div className="metric-main"><strong>{metrics ? metrics.processedCount.toLocaleString() : '—'}</strong><span>{loading ? '加载中...' : '次处理'}</span></div>
      <div className="metric-grid daily-stats-grid">
        <div><span>有效片段时长</span><strong>{metrics ? duration(metrics.effectiveDurationMs) : '—'}</strong></div>
        <div><span>无效片段时长</span><strong>{metrics ? duration(metrics.invalidDurationMs) : '—'}</strong></div>
        <div><span>无效率</span><strong>{metrics ? `${metrics.invalidRatePct.toFixed(2)}%` : '—'}</strong></div>
        <div><span>视频总时长</span><strong>{metrics ? duration(metrics.videoDurationMs) : '—'}</strong></div>
        <div><span>单次任务数</span><strong>{metrics ? metrics.atomicTaskCount.toLocaleString() : '—'}</strong></div>
        <div><span>小目标数</span><strong>{metrics ? metrics.atomicActionCount.toLocaleString() : '—'}</strong></div>
      </div>
    </>}
  </section>
}
