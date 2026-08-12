import { runtimeConfig } from '../config/runtime'
import { mockTasks } from '../mocks/data'
import type { AnnotationDataItem, AnnotationDataStatus, TaskNode } from '../types/api'
import { request } from './api'

function delay() { return new Promise((resolve) => window.setTimeout(resolve, runtimeConfig.mockDelay)) }
function numberOrNull(value: unknown) { return value === null || value === undefined || value === '' ? null : Number(value) }

function normalize(item: Record<string, unknown>): AnnotationDataItem {
  const summary = (item.vlaSummary || {}) as Record<string, unknown>
  const rawStatus = String(item.statusGroupKey || item.status || 'pending')
  const statusMap: Record<string, AnnotationDataStatus> = { assigned: 'pending', claimed: 'pending', in_progress: 'processing', processing: 'processing', submitted: 'completed', completed: 'completed', invalid: 'voided', voided: 'voided', cut_failed: 'exception' }
  const status = statusMap[rawStatus] || rawStatus as AnnotationDataStatus
  const nodeMap: Record<string, TaskNode> = { '标注': 'annotation', '质检': 'review', '审核': 'quality', '验收': 'acceptance', quality_check: 'review', review: 'quality' }
  const rawNode = String(item.current_node || item.nodeKey || item.node || 'annotation')
  const videoMeta = (item.video_meta || {}) as Record<string, unknown>
  const assignee = (item.current_assignee || {}) as Record<string, unknown>
  return {
    id: String(item.external_task_id || item.id || item.dataId || item.dataCode || ''), name: String(item.title || item.name || item.dataName || item.fileName || item.external_task_id || ''), status,
    statusLabel: String(item.statusGroupLabel || item.statusDetailLabel || ({ pending: '待处理', processing: '处理中', completed: '已完成', voided: '已作废', exception: '异常' }[status] || status)),
    node: nodeMap[rawNode] || rawNode as TaskNode, workType: String(item.workTypeKey || item.workType) === 'returned' ? 'returned' : 'normal',
    totalDuration: Number(item.total_duration_ms ?? videoMeta.duration_ms ?? 0) / 1000, selectedDuration: Number(item.selected_duration_ms ?? summary.selectedDurationSeconds ?? 0) / (item.selected_duration_ms == null ? 1 : 1000),
    validDuration: Number(item.effective_duration_ms ?? summary.validDurationSeconds ?? 0) / (item.effective_duration_ms == null ? 1 : 1000), invalidDuration: Number(item.invalid_duration_ms ?? summary.invalidDurationSeconds ?? 0) / (item.invalid_duration_ms == null ? 1 : 1000),
    unselectedDuration: Number(item.unselected_duration_ms ?? summary.unselectedDurationSeconds ?? 0) / (item.unselected_duration_ms == null ? 1 : 1000), goalCount: numberOrNull(item.atomic_task_count ?? summary.timelineTaskCount),
    actionCount: numberOrNull(item.atomic_action_count ?? summary.smallGoalCount), ownerName: String(assignee.display_name || assignee.username || item.ownerName || '-'), updatedAt: String(item.updated_at || item.updatedAt || '-'),
    taskId: item.id ? String(item.id) : undefined,
  }
}

export const annotationDataApi = {
  async list(projectId: string): Promise<AnnotationDataItem[]> {
    if (runtimeConfig.apiMode === 'mock') {
      await delay()
      return mockTasks.map((task) => normalize({ ...task, id: task.dataId, name: task.dataName, taskId: task.id, status: task.status === 'submitted' || task.status === 'completed' ? 'completed' : task.status }))
    }
    const result = await request<{ items: Array<Record<string, unknown>> }>(`/api/projects/${encodeURIComponent(projectId)}/tasks?page_size=100`)
    return result.items.map(normalize)
  },
}
