import type { TaskNode, WorkbenchDailyStats, WorkbenchNodeStats } from '../types/api'
import { taskNodeApiValues } from './node'

export function normalizeWorkbenchDailyStats(raw: Record<string, unknown>): WorkbenchDailyStats {
  const scope = (raw.scope || {}) as Record<string, unknown>
  const range = (raw.range || {}) as Record<string, unknown>
  const nodes = (raw.nodes || {}) as Record<string, Record<string, unknown>>
  const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0
  const metrics = (item: Record<string, unknown> = {}): WorkbenchNodeStats => ({
    processedCount: number(item.processed_count), effectiveDurationMs: number(item.effective_duration_ms),
    invalidDurationMs: number(item.invalid_duration_ms), videoDurationMs: number(item.video_duration_ms),
    invalidRatePct: number(item.invalid_rate_pct), atomicTaskCount: number(item.atomic_task_count), atomicActionCount: number(item.atomic_action_count),
  })
  return {
    projectId: String(raw.project_id || ''),
    scope: { type: scope.type === 'all' ? 'all' : 'user', userId: scope.user_id == null ? null : String(scope.user_id), displayName: scope.display_name == null ? null : String(scope.display_name) },
    range: { startDate: range.start_date == null ? null : String(range.start_date), endDate: range.end_date == null ? null : String(range.end_date) },
    nodes: Object.fromEntries(Object.entries(taskNodeApiValues).map(([node, wire]) => [node, metrics(nodes[wire])])) as Record<TaskNode, WorkbenchNodeStats>,
    total: metrics(raw.total as Record<string, unknown> | undefined),
  }
}
