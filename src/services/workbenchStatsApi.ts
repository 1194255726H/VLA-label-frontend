import { runtimeConfig } from '../config/runtime'
import type { WorkbenchDailyStats } from '../types/api'
import { taskNodeApiValues } from '../utils/node'
import { normalizeWorkbenchDailyStats } from '../utils/workbenchStats'
import { request } from './api'

const pendingRequests = new Map<string, Promise<WorkbenchDailyStats>>()

export const workbenchStatsApi = {
  async dailyStats(projectId: string, user: string): Promise<WorkbenchDailyStats> {
    if (!projectId || !user) throw new Error('缺少项目或统计人员')
    if (runtimeConfig.apiMode === 'mock') {
      const count = user === 'all' ? 4 : 1
      const metrics = { processed_count: count, effective_duration_ms: 420000 * count, invalid_duration_ms: 180000 * count }
      const annotation = { ...metrics, invalid_rate_pct: 30, atomic_task_count: count, atomic_action_count: count * 2 }
      const decision = { ...metrics, approved_count: count, rejected_count: 0, invalidated_count: 0 }
      return normalizeWorkbenchDailyStats({
        project_id: projectId,
        scope: { type: user === 'all' ? 'all' : 'user', user_id: user === 'all' ? null : user, display_name: user === 'all' ? null : '本人' },
        nodes: Object.fromEntries(Object.values(taskNodeApiValues).map((node) => [node, node === 'annotation' ? annotation : decision])),
        total: { processed_count: count * 4, effective_duration_ms: metrics.effective_duration_ms * 4, invalid_duration_ms: metrics.invalid_duration_ms * 4, invalid_rate_pct: 30, atomic_task_count: count, atomic_action_count: count * 2, approved_count: count * 3, rejected_count: 0, invalidated_count: 0 },
      })
    }
    const params = new URLSearchParams({ user })
    const path = `/api/projects/${encodeURIComponent(projectId)}/my-daily-stats?${params}`
    const existing = pendingRequests.get(path)
    if (existing) return existing
    const pending = request<Record<string, unknown>>(path).then(normalizeWorkbenchDailyStats)
    pendingRequests.set(path, pending)
    try { return await pending } finally { if (pendingRequests.get(path) === pending) pendingRequests.delete(path) }
  },
}
