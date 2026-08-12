import { runtimeConfig } from '../config/runtime'
import { mockLabelLibraries, mockTasks } from '../mocks/data'
import type { AnnotationResult, AnnotationWorkspace, TaskNode } from '../types/api'
import { request } from './api'

const mockResults = new Map<string, AnnotationResult>()
const mockRevisions = new Map<string, number>()
const workspaceRequests = new Map<string, Promise<AnnotationWorkspace>>()
const taskNodes = new Map<string, TaskNode>()

function delay() {
  return new Promise((resolve) => window.setTimeout(resolve, runtimeConfig.mockDelay))
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function emptyResult(frameRate = 30, totalFrames = 911): AnnotationResult {
  return { schemaVersion: 'vla-video-hierarchy@11.0.0', coordinateSystem: 'zero-based-frame', intervalConvention: 'half-open', frameRate, totalFrames, goals: [], actions: [], invalidRanges: [], usedAnnotationConfigCodes: [], comments: [], nextGoalSequence: 1, nextActionSequenceByGoal: {} }
}

function mockResult(taskId: string) {
  if (!mockResults.has(taskId)) {
    const result = emptyResult()
    result.goals = [
      { id: 'goal-1', sequence: 1, code: 'roadside_obstacle_018-001', type: 'goal', startFrame: 60, endFrame: 300, labelId: '201', labelName: '通过路口', color: '#2563EB', descriptionZh: '车辆通过园区路口' },
      { id: 'goal-2', sequence: 2, code: 'roadside_obstacle_018-002', type: 'goal', startFrame: 390, endFrame: 750, labelId: '101', labelName: '车辆', color: '#7C3AED', descriptionZh: '' },
    ]
    result.actions = [
      { id: 'action-1', sequence: 1, code: 'roadside_obstacle_018-001-A001', parentId: 'goal-1', type: 'action', startFrame: 90, endFrame: 180, labelId: '204', labelName: '直行', color: '#16A34A', descriptionZh: '保持直行', keyFrames: [] },
      { id: 'action-2', sequence: 2, code: 'roadside_obstacle_018-001-A002', parentId: 'goal-1', type: 'action', startFrame: 190, endFrame: 270, labelId: '205', labelName: '等待', color: '#D97706', descriptionZh: '', keyFrames: [] },
    ]
    mockResults.set(taskId, result)
    result.nextGoalSequence = 3
    result.nextActionSequenceByGoal = { 'goal-1': 3, 'goal-2': 1 }
    mockRevisions.set(taskId, 1)
  }
  return mockResults.get(taskId) as AnnotationResult
}

function wireNode(value: unknown): TaskNode {
  return ({ annotation: 'annotation', quality_check: 'review', review: 'quality', acceptance: 'acceptance' } as Record<string, TaskNode>)[String(value)] || 'annotation'
}

function backendNode(value: TaskNode) {
  return ({ annotation: 'annotation', review: 'quality_check', quality: 'review', acceptance: 'acceptance' } as const)[value]
}

function msToFrame(value: unknown, frameRate: number) { return Math.max(0, Math.round(Number(value || 0) / 1000 * frameRate)) }
function frameToMs(value: number, frameRate: number) { return Math.max(0, Math.round(value / frameRate * 1000)) }

function annotationPayload(result: AnnotationResult) {
  return {
    atomic_tasks: result.goals.map((goal) => ({
      start_ms: frameToMs(goal.startFrame, result.frameRate), end_ms: frameToMs(goal.endFrame, result.frameRate), sequence: goal.sequence || 0,
      label_id: goal.labelId ? Number(goal.labelId) : null, description: goal.descriptionZh,
      actions: result.actions.filter((action) => action.parentId === goal.id).map((action) => ({ start_ms: frameToMs(action.startFrame, result.frameRate), end_ms: frameToMs(action.endFrame, result.frameRate), sequence: action.sequence || 0, label_id: action.labelId ? Number(action.labelId) : null, description: action.descriptionZh })),
    })),
    invalid_intervals: result.invalidRanges.map((range) => ({ start_ms: frameToMs(range.startFrame, result.frameRate), end_ms: frameToMs(range.endFrame, result.frameRate), reason: range.reason, description: range.reason })),
    meta: { frame_rate: result.frameRate, frontend_result: result },
  }
}

async function loadTaskLabels(projectId: string) {
  if (!projectId) return []
  const project = await request<Record<string, unknown>>(`/api/projects/${encodeURIComponent(projectId)}`)
  const projectData = (project.project || project) as Record<string, unknown>
  const config = (projectData.work_config || {}) as Record<string, unknown>
  const ids = Array.isArray(config.label_library_ids) ? config.label_library_ids : []
  const groups = await Promise.all(ids.map((id) => request<{ items: Array<Record<string, unknown>> }>(`/api/data/label-libraries/${encodeURIComponent(String(id))}/labels?page_size=100`)))
  return groups.flatMap((group) => group.items).filter((item) => item.enabled !== false).map((item) => ({ id: String(item.id), name: String(item.name || ''), code: String(item.code || ''), color: String(item.color || '#2563EB'), appliesTo: String(item.applies_to || 'goal') as 'goal' | 'action', enabled: true, createdAt: String(item.created_at || '') }))
}

function normalizeWorkspace(taskId: string, raw: Record<string, unknown>, labels: AnnotationWorkspace['labels'], viewOnly: boolean): AnnotationWorkspace {
  const task = (raw.task || raw) as Record<string, unknown>
  const project = (task.project || raw.project || {}) as Record<string, unknown>
  const videoMeta = (task.video_meta || {}) as Record<string, unknown>
  const revision = (raw.current_revision || {}) as Record<string, unknown>
  const revisionPayload = (revision.payload || revision.annotation_data || revision.data || {}) as Record<string, unknown>
  const meta = (revisionPayload.meta || {}) as Record<string, unknown>
  const preserved = meta.frontend_result && typeof meta.frontend_result === 'object' ? meta.frontend_result as AnnotationResult : undefined
  const frameRate = Number(preserved?.frameRate || meta.frame_rate || videoMeta.frame_rate || 30)
  const durationSeconds = Number(videoMeta.duration_ms || task.duration_ms || 0) / 1000
  const rawGoals = Array.isArray(revisionPayload.atomic_tasks) ? revisionPayload.atomic_tasks as Array<Record<string, unknown>> : []
  const goals = rawGoals.map((goal, index) => ({ id: String(goal.id || `goal-${goal.sequence ?? index}`), sequence: Number(goal.sequence ?? index), type: 'goal' as const, startFrame: msToFrame(goal.start_ms, frameRate), endFrame: msToFrame(goal.end_ms, frameRate), labelId: goal.label_id == null ? undefined : String(goal.label_id), labelName: labels.find((label) => label.id === String(goal.label_id))?.name, color: labels.find((label) => label.id === String(goal.label_id))?.color || '#2563EB', descriptionZh: String(goal.description || '') }))
  const actions = rawGoals.flatMap((goal, goalIndex) => { const parent = goals[goalIndex]; return (Array.isArray(goal.actions) ? goal.actions as Array<Record<string, unknown>> : []).map((action, index) => ({ id: String(action.id || `${parent.id}-action-${action.sequence ?? index}`), sequence: Number(action.sequence ?? index), parentId: parent.id, type: 'action' as const, startFrame: msToFrame(action.start_ms, frameRate), endFrame: msToFrame(action.end_ms, frameRate), labelId: action.label_id == null ? undefined : String(action.label_id), labelName: labels.find((label) => label.id === String(action.label_id))?.name, color: labels.find((label) => label.id === String(action.label_id))?.color || '#16A34A', descriptionZh: String(action.description || ''), keyFrames: [] })) })
  const node = wireNode(task.current_node)
  const videoUri = String(task.video_url || task.video_uri || '')
  const status = String(task.status || '')
  const baseResult = preserved || {
    schemaVersion: 'vla-video-hierarchy@11.0.0' as const, coordinateSystem: 'zero-based-frame' as const, intervalConvention: 'half-open' as const, frameRate,
    totalFrames: Math.round(durationSeconds * frameRate), goals, actions,
    invalidRanges: (Array.isArray(revisionPayload.invalid_intervals) ? revisionPayload.invalid_intervals as Array<Record<string, unknown>> : []).map((range, index) => ({ id: String(range.id || `invalid-${index}`), startFrame: msToFrame(range.start_ms, frameRate), endFrame: msToFrame(range.end_ms, frameRate), reason: String(range.reason || range.description || '视频内容无效') })),
    usedAnnotationConfigCodes: [], comments: [], nextGoalSequence: goals.length + 1, nextActionSequenceByGoal: Object.fromEntries(goals.map((goal) => [goal.id, actions.filter((action) => action.parentId === goal.id).length + 1])),
  }
  return {
    taskId,
    taskCode: String(task.external_task_id || task.id || taskId), dataId: String(task.external_task_id || task.id || ''), dataName: String(task.title || task.external_task_id || 'VLA 视频数据'),
    projectId: String(task.project_id || project.id || ''), projectName: String(project.name || ''), node,
    readonly: viewOnly || ['submitted', 'completed'].includes(status),
    videoUrl: /^https?:\/\//i.test(videoUri) ? videoUri : '',
    frameRate,
    durationSeconds,
    currentRevision: Number(revision.id || revision.revision || revision.revision_no || 0), labels, result: baseResult,
  }
}

export const annotationApi = {
  async getWorkspace(taskId: string, viewOnly = false): Promise<AnnotationWorkspace> {
    if (runtimeConfig.apiMode === 'mock') {
      await delay()
      const task = mockTasks.find((item) => item.id === taskId) || mockTasks[0]
      const result = clone(mockResult(taskId))
      return {
        taskId, taskCode: task.id, dataId: task.dataId, dataName: task.dataName,
        projectId: '1', projectName: '清华路端项目', node: task.node, readonly: task.status === 'submitted' || task.status === 'completed',
        videoUrl: '/temp.mp4', frameRate: result.frameRate, durationSeconds: result.totalFrames / result.frameRate,
        currentRevision: mockRevisions.get(taskId) || 0,
        labels: mockLabelLibraries.flatMap((library) => library.tags.filter((tag) => tag.enabled)), result,
      }
    }
    const requestKey = `${taskId}:${viewOnly ? 'view' : 'edit'}`
    const pending = workspaceRequests.get(requestKey)
    if (pending) return pending
    const workspaceRequest = (async () => {
      const raw = await request<Record<string, unknown>>(`/api/tasks/${encodeURIComponent(taskId)}`)
      const task = (raw.task || raw) as Record<string, unknown>
      const labels = await loadTaskLabels(String(task.project_id || (task.project as Record<string, unknown> | undefined)?.id || ''))
      const workspace = normalizeWorkspace(taskId, raw, labels, viewOnly)
      taskNodes.set(taskId, workspace.node)
      return workspace
    })()
    workspaceRequests.set(requestKey, workspaceRequest)
    try { return await workspaceRequest } finally { workspaceRequests.delete(requestKey) }
  },

  async startTask(_taskId: string) {
    void _taskId
    if (runtimeConfig.apiMode === 'mock') { await delay(); return }
    return
  },

  async save(taskId: string, result: AnnotationResult, baseRevision: number): Promise<number> {
    if (runtimeConfig.apiMode === 'mock') {
      await delay(); mockResults.set(taskId, clone(result)); const revision = (mockRevisions.get(taskId) || 0) + 1; mockRevisions.set(taskId, revision); return revision
    }
    const response = await request<Record<string, unknown>>(`/api/tasks/${encodeURIComponent(taskId)}/annotation-draft`, { method: 'POST', body: JSON.stringify(annotationPayload(result)) })
    const revision = (response.revision || response.current_revision || response) as Record<string, unknown>
    return Number(revision.id || revision.revision || revision.revision_no || baseRevision + 1)
  },

  async submit(taskId: string, result: AnnotationResult, _revision: number) {
    void _revision
    if (runtimeConfig.apiMode === 'mock') { await delay(); mockResults.set(taskId, clone(result)); return }
    const node = taskNodes.get(taskId) || 'annotation'
    if (node === 'annotation') await request(`/api/tasks/${encodeURIComponent(taskId)}/submit-annotation`, { method: 'POST', body: JSON.stringify(annotationPayload(result)) })
    else await request(`/api/tasks/${encodeURIComponent(taskId)}/decision`, { method: 'POST', body: JSON.stringify({ node: backendNode(node), decision: 'approved', opinion: '通过' }) })
  },
  async heartbeat(taskId: string) {
    void taskId
  },
  async release(taskId: string) {
    taskNodes.delete(taskId)
  },
  async invalidate(taskId: string, reason: string) {
    if (runtimeConfig.apiMode === 'mock') { await delay(); return }
    void taskId; void reason
    throw new Error('当前后端 API 尚未提供整条任务作废接口')
  },
  async reject(taskId: string, reason: string) {
    if (runtimeConfig.apiMode === 'mock') { await delay(); return }
    const node = taskNodes.get(taskId) || 'review'
    await request(`/api/tasks/${encodeURIComponent(taskId)}/decision`, { method: 'POST', body: JSON.stringify({ node: backendNode(node), decision: 'rejected', opinion: reason }) })
  },
}
