import { runtimeConfig } from '../config/runtime'
import { mockLabelLibraries, mockTasks } from '../mocks/data'
import type { AnnotationResult, AnnotationWorkspace, TaskNode, VideoComment } from '../types/api'
import { request } from './api'

const mockResults = new Map<string, AnnotationResult>()
const mockRevisions = new Map<string, number>()
const workspaceRequests = new Map<string, Promise<AnnotationWorkspace>>()
const taskNodes = new Map<string, TaskNode>()
const taskVideoIds = new Map<string, string>()
const mockVideoComments = new Map<string, VideoComment[]>()

export interface VideoHeartbeatResult { locked: boolean; lockedById: string | null }

function delay() {
  return new Promise((resolve) => window.setTimeout(resolve, runtimeConfig.mockDelay))
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function emptyResult(frameRate = 30, totalFrames = 911): AnnotationResult {
  return { schemaVersion: 'vla-video-hierarchy@11.0.0', coordinateSystem: 'zero-based-frame', intervalConvention: 'half-open', frameRate, totalFrames, mediaStartTime: 0, goals: [], actions: [], invalidRanges: [], usedAnnotationConfigCodes: [], comments: [], nextGoalSequence: 1, nextActionSequenceByGoal: {}, nextInvalidSequence: 1 }
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

function normalizeVideoComment(item: Record<string, unknown>): VideoComment {
  return {
    id: String(item.id || ''), videoId: String(item.video_id || ''), taskId: String(item.task_id || ''),
    node: wireNode(item.node), sequence: Number(item.sequence || 0),
    positionX: Number(item.position_x || 0), positionY: Number(item.position_y || 0), content: String(item.content || ''),
    resolved: Boolean(item.resolved), createdById: String(item.created_by_id || ''), createdByName: String(item.created_by_name || ''),
    createdAt: String(item.created_at || ''), resolvedById: item.resolved_by_id == null ? undefined : String(item.resolved_by_id), resolvedAt: item.resolved_at == null ? undefined : String(item.resolved_at),
  }
}

function videoQuery(taskId: string) {
  const videoId = taskVideoIds.get(taskId)
  return videoId ? `?video_id=${encodeURIComponent(videoId)}` : ''
}

function decisionVideoId(taskId: string) {
  const videoId = Number(taskVideoIds.get(taskId))
  if (!Number.isInteger(videoId)) throw new Error('video_id 必须传入有效的视频 ID')
  return videoId
}

function msToFrame(value: unknown, frameRate: number) { return Math.max(0, Math.round(Number(value || 0) / 1000 * frameRate)) }
function frameToMs(value: number, frameRate: number) { return Math.max(0, Math.round(value / frameRate * 1000)) }

export function normalizeAnnotationResult(source: AnnotationResult): AnnotationResult {
  const frameRate = Number.isFinite(source.frameRate) && source.frameRate > 0 ? source.frameRate : 30
  const totalFrames = Math.max(0, Math.round(source.totalFrames || 0))
  const integerRange = <T extends { startFrame: number; endFrame: number }>(item: T): T => ({
    ...item,
    startFrame: Math.max(0, Math.min(totalFrames, Math.round(item.startFrame || 0))),
    endFrame: Math.max(0, Math.min(totalFrames, Math.round(item.endFrame || 0))),
  })
  const rawActions = (source.actions || []).map((action) => {
    const normalized = integerRange(action)
    return {
      ...normalized,
      sequence: Math.max(1, Math.round(action.sequence || 1)),
      segmentType: action.type === 'no_action' ? 'no_action' as const : 'atomic' as const,
      labelCode: action.type === 'no_action' ? '' : action.labelCode || '',
      descriptionSource: action.type === 'no_action' ? 'system' as const : action.descriptionSource || 'user' as const,
      modelDescriptionRequired: action.type === 'no_action' ? false : action.modelDescriptionRequired,
      keyFrames: (action.keyFrames || []).filter((keyFrame) => Number.isFinite(keyFrame.frame)).map((keyFrame) => ({ ...keyFrame, frame: Math.round(keyFrame.frame) })),
    }
  })
  const nextActionSequenceByGoal = { ...(source.nextActionSequenceByGoal || {}) }
  const goals = (source.goals || []).map((goal) => {
    const normalized = integerRange(goal)
    const atomicActions = rawActions.filter((action) => action.parentId === goal.id)
    const nextAtomicSequence = Math.max(goal.nextAtomicSequence || 1, nextActionSequenceByGoal[goal.id] || 1, ...atomicActions.map((action) => action.sequence + 1))
    nextActionSequenceByGoal[goal.id] = nextAtomicSequence
    return { ...normalized, sequence: Math.max(1, Math.round(goal.sequence || 1)), segmentType: 'goal' as const, labelCode: goal.labelCode || '', nextAtomicSequence, atomicActions }
  })
  const invalidRanges = (source.invalidRanges || []).map((range, index) => ({ ...integerRange(range), sequence: Math.max(1, Math.round(range.sequence || index + 1)) }))
  return {
    ...source,
    schemaVersion: 'vla-video-hierarchy@11.0.0', coordinateSystem: 'zero-based-frame', intervalConvention: 'half-open',
    frameRate, totalFrames, mediaStartTime: Math.max(0, Number(source.mediaStartTime || 0)), goals, actions: rawActions, invalidRanges,
    nextGoalSequence: Math.max(source.nextGoalSequence || 1, ...goals.map((goal) => goal.sequence + 1)),
    nextActionSequenceByGoal,
    nextInvalidSequence: Math.max(source.nextInvalidSequence || 1, ...invalidRanges.map((range) => range.sequence + 1)),
  }
}

function annotationPayload(rawResult: AnnotationResult) {
  const result = normalizeAnnotationResult(rawResult)
  return {
    atomic_tasks: result.goals.map((goal) => ({
      id: goal.id, start_frame: goal.startFrame, end_frame: goal.endFrame,
      start_ms: frameToMs(goal.startFrame, result.frameRate), end_ms: frameToMs(goal.endFrame, result.frameRate), sequence: goal.sequence,
      label_id: goal.labelId ? Number(goal.labelId) : null, label_code: goal.labelCode || '', description: goal.descriptionZh,
      next_atomic_sequence: goal.nextAtomicSequence,
      actions: result.actions.filter((action) => action.parentId === goal.id).map((action) => ({
        id: action.id, start_frame: action.startFrame, end_frame: action.endFrame,
        start_ms: frameToMs(action.startFrame, result.frameRate), end_ms: frameToMs(action.endFrame, result.frameRate), sequence: action.sequence,
        segment_type: action.segmentType || (action.type === 'no_action' ? 'no_action' : 'atomic'), system_code: action.systemCode,
        label_id: action.labelId ? Number(action.labelId) : null, label_code: action.labelCode || '', description: action.descriptionZh,
        description_zh: action.descriptionZh, description_en: action.descriptionEn || '', description_source: action.descriptionSource || 'user',
        model_description_required: action.modelDescriptionRequired, key_frames: action.keyFrames || [],
        relative_start_second: (action.startFrame - goal.startFrame) / result.frameRate,
        relative_end_second: (action.endFrame - goal.startFrame) / result.frameRate,
      })),
    })),
    invalid_intervals: result.invalidRanges.map((range) => ({ id: range.id, sequence: range.sequence, start_frame: range.startFrame, end_frame: range.endFrame, start_ms: frameToMs(range.startFrame, result.frameRate), end_ms: frameToMs(range.endFrame, result.frameRate), reason: range.reason, description: range.reason })),
    meta: { frame_rate: result.frameRate, media_start_time: result.mediaStartTime, coordinate_system: result.coordinateSystem, interval_convention: result.intervalConvention, frontend_result: result },
  }
}

async function loadTaskLabels(projectId: string) {
  if (!projectId) return { labels: [], bound: false }
  const project = await request<Record<string, unknown>>(`/api/projects/${encodeURIComponent(projectId)}`)
  const projectData = (project.project || project) as Record<string, unknown>
  const config = (projectData.work_config || {}) as Record<string, unknown>
  const ids = Array.isArray(config.label_library_ids) ? config.label_library_ids : []
  const groups = await Promise.all(ids.map((id) => request<{ items: Array<Record<string, unknown>> }>(`/api/data/label-libraries/${encodeURIComponent(String(id))}/labels?page_size=100`)))
  return { labels: groups.flatMap((group) => group.items).filter((item) => item.enabled !== false).map((item) => ({ id: String(item.id), name: String(item.name || ''), code: String(item.code || ''), color: String(item.color || '#2563EB'), appliesTo: String(item.applies_to || 'goal') as 'goal' | 'action', enabled: true, createdAt: String(item.created_at || '') })), bound: ids.length > 0 }
}

function normalizeWorkspace(taskId: string, raw: Record<string, unknown>, labels: AnnotationWorkspace['labels'], labelLibraryBound: boolean, viewOnly: boolean, selectedProjectId = ''): AnnotationWorkspace {
  const task = (raw.task || raw) as Record<string, unknown>
  const selectedVideo = (raw.selected_video || task.selected_video || {}) as Record<string, unknown>
  const project = (task.project || raw.project || {}) as Record<string, unknown>
  const videoMeta = (selectedVideo.video_meta || task.video_meta || {}) as Record<string, unknown>
  const revision = (raw.annotation || raw.current_revision || {}) as Record<string, unknown>
  const revisionPayload = (revision.payload || revision.annotation_data || revision.data || revision) as Record<string, unknown>
  const meta = (revisionPayload.meta || {}) as Record<string, unknown>
  const preserved = meta.frontend_result && typeof meta.frontend_result === 'object' ? meta.frontend_result as AnnotationResult : undefined
  const frameRate = Number(preserved?.frameRate || meta.frame_rate || videoMeta.frame_rate || 30)
  const mediaStartTime = Number(preserved?.mediaStartTime || meta.media_start_time || videoMeta.media_start_time || videoMeta.start_time_ms && Number(videoMeta.start_time_ms) / 1000 || 0)
  const durationSeconds = Number(videoMeta.duration_ms || selectedVideo.duration_ms || task.duration_ms || 0) / 1000
  const rawGoals = Array.isArray(revisionPayload.atomic_tasks) ? revisionPayload.atomic_tasks as Array<Record<string, unknown>> : []
  const goals = rawGoals.map((goal, index) => ({ id: String(goal.id || `goal-${goal.sequence ?? index + 1}`), sequence: Number(goal.sequence ?? index + 1), type: 'goal' as const, startFrame: goal.start_frame == null ? msToFrame(goal.start_ms, frameRate) : Number(goal.start_frame), endFrame: goal.end_frame == null ? msToFrame(goal.end_ms, frameRate) : Number(goal.end_frame), labelId: goal.label_id == null ? undefined : String(goal.label_id), labelCode: String(goal.label_code || ''), labelName: labels.find((label) => label.id === String(goal.label_id))?.name, color: labels.find((label) => label.id === String(goal.label_id))?.color || '#2563EB', descriptionZh: String(goal.description || '') }))
  const actions = rawGoals.flatMap((goal, goalIndex) => { const parent = goals[goalIndex]; return (Array.isArray(goal.actions) ? goal.actions as Array<Record<string, unknown>> : []).map((action, index) => { const noAction = action.segment_type === 'no_action' || action.system_code === 'NO_ACTION'; return ({ id: String(action.id || `${parent.id}-A${String(action.sequence ?? index + 1).padStart(3, '0')}`), sequence: Number(action.sequence ?? index + 1), parentId: parent.id, type: noAction ? 'no_action' as const : 'action' as const, startFrame: action.start_frame == null ? msToFrame(action.start_ms, frameRate) : Number(action.start_frame), endFrame: action.end_frame == null ? msToFrame(action.end_ms, frameRate) : Number(action.end_frame), labelId: action.label_id == null ? undefined : String(action.label_id), labelCode: String(action.label_code || ''), labelName: labels.find((label) => label.id === String(action.label_id))?.name, color: noAction ? '#64748B' : labels.find((label) => label.id === String(action.label_id))?.color || '#16A34A', descriptionZh: String(action.description_zh || action.description || (noAction ? '未执行有效动作' : '')), descriptionEn: String(action.description_en || (noAction ? 'No valid action is performed.' : '')), systemCode: noAction ? 'NO_ACTION' as const : undefined, descriptionSource: noAction ? 'system' as const : 'user' as const, modelDescriptionRequired: noAction ? false : undefined, keyFrames: Array.isArray(action.key_frames) ? action.key_frames as never[] : [] }) }) })
  const node = wireNode(selectedVideo.current_node || task.current_node)
  const videoUri = String(selectedVideo.url || task.video_url || task.video_uri || '')
  const status = String(selectedVideo.status || task.status || '')
  const baseResult = preserved || {
    schemaVersion: 'vla-video-hierarchy@11.0.0' as const, coordinateSystem: 'zero-based-frame' as const, intervalConvention: 'half-open' as const, frameRate,
    totalFrames: Math.round(durationSeconds * frameRate), mediaStartTime, goals, actions,
    invalidRanges: (Array.isArray(revisionPayload.invalid_intervals) ? revisionPayload.invalid_intervals as Array<Record<string, unknown>> : []).map((range, index) => ({ id: String(range.id || `invalid-${index + 1}`), sequence: Number(range.sequence || index + 1), startFrame: range.start_frame == null ? msToFrame(range.start_ms, frameRate) : Number(range.start_frame), endFrame: range.end_frame == null ? msToFrame(range.end_ms, frameRate) : Number(range.end_frame), reason: String(range.reason || range.description || '视频内容无效') })),
    usedAnnotationConfigCodes: [], comments: [], nextGoalSequence: goals.length + 1, nextActionSequenceByGoal: Object.fromEntries(goals.map((goal) => [goal.id, actions.filter((action) => action.parentId === goal.id).length + 1])), nextInvalidSequence: 1,
  }
  return {
    taskId,
    taskCode: String(task.external_task_id || task.id || taskId), dataId: String(selectedVideo.external_video_id || task.external_task_id || selectedVideo.id || task.id || ''), dataName: String(selectedVideo.filename || task.title || task.external_task_id || 'VLA 视频数据'),
    projectId: String(task.project_id || project.id || selectedProjectId), projectName: String(project.name || ''), node,
    readonly: viewOnly || ['submitted', 'completed'].includes(status),
    videoUrl: /^https?:\/\//i.test(videoUri) ? videoUri : '',
    frameRate,
    durationSeconds, mediaStartTime,
    currentRevision: Number(revision.version || revision.revision || revision.revision_no || revision.id || 0), labels, labelLibraryBound, result: normalizeAnnotationResult(baseResult),
  }
}

export const annotationApi = {
  async listVideoComments(taskId: string, videoId: string): Promise<VideoComment[]> {
    if (runtimeConfig.apiMode === 'mock') { await delay(); return clone(mockVideoComments.get(`${taskId}:${videoId}`) || []) }
    const params = new URLSearchParams({ video_id: videoId })
    const response = await request<{ items: Array<Record<string, unknown>> }>(`/api/tasks/${encodeURIComponent(taskId)}/comments?${params}`)
    return (response.items || []).map(normalizeVideoComment)
  },

  async createVideoComment(taskId: string, payload: { videoId: string; node: TaskNode; sequence: number; content: string; positionX: number; positionY: number }): Promise<VideoComment> {
    if (runtimeConfig.apiMode === 'mock') {
      await delay()
      const key = `${taskId}:${payload.videoId}`
      const comment: VideoComment = { id: crypto.randomUUID(), videoId: payload.videoId, taskId, node: payload.node, sequence: payload.sequence, positionX: payload.positionX, positionY: payload.positionY, content: payload.content, resolved: false, createdById: 'mock-user', createdByName: '当前用户', createdAt: new Date().toISOString() }
      mockVideoComments.set(key, [...(mockVideoComments.get(key) || []), comment])
      return clone(comment)
    }
    const response = await request<Record<string, unknown>>(`/api/tasks/${encodeURIComponent(taskId)}/comments`, { method: 'POST', body: JSON.stringify({ video_id: Number(payload.videoId), node: backendNode(payload.node), sequence: payload.sequence, content: payload.content, position_x: payload.positionX, position_y: payload.positionY }) })
    return normalizeVideoComment(response)
  },

  async resolveVideoComment(taskId: string, commentId: string): Promise<VideoComment> {
    if (runtimeConfig.apiMode === 'mock') {
      await delay()
      for (const [key, comments] of mockVideoComments) {
        const comment = comments.find((item) => item.id === commentId)
        if (comment) { const resolved = { ...comment, resolved: true, resolvedById: 'mock-user', resolvedAt: new Date().toISOString() }; mockVideoComments.set(key, comments.map((item) => item.id === commentId ? resolved : item)); return clone(resolved) }
      }
      throw new Error('批注不存在')
    }
    const response = await request<Record<string, unknown>>(`/api/tasks/${encodeURIComponent(taskId)}/comments/${encodeURIComponent(commentId)}/resolve`, { method: 'POST', body: '{}' })
    return normalizeVideoComment(response)
  },

  async nextVideo(projectId: string, node: TaskNode): Promise<string | null> {
    if (runtimeConfig.apiMode === 'mock') { await delay(); return null }
    if (!projectId) throw new Error('缺少项目 ID，无法获取下一条视频')
    const params = new URLSearchParams({ node: backendNode(node) })
    const response = await request<{ video_id: number | null }>(`/api/projects/${encodeURIComponent(projectId)}/workbench/next-video?${params}`)
    return response.video_id === null || response.video_id === undefined ? null : String(response.video_id)
  },

  async videoHeartbeat(videoId: string, mockUserId = ''): Promise<VideoHeartbeatResult> {
    if (!videoId) throw new Error('缺少视频记录 ID，无法获取作业锁')
    if (runtimeConfig.apiMode === 'mock') { await delay(); return { locked: true, lockedById: mockUserId || null } }
    const response = await request<{ locked: boolean; locked_by_id: number | null }>(`/api/videos/${encodeURIComponent(videoId)}/heartbeat`, { method: 'POST', body: '{}' })
    return { locked: Boolean(response.locked), lockedById: response.locked_by_id === null || response.locked_by_id === undefined ? null : String(response.locked_by_id) }
  },

  async getWorkspace(taskId: string, viewOnly = false, videoId = '', projectId = ''): Promise<AnnotationWorkspace> {
    if (runtimeConfig.apiMode === 'mock') {
      await delay()
      const task = mockTasks.find((item) => item.id === taskId) || mockTasks[0]
      const result = clone(mockResult(taskId))
      return {
        taskId, taskCode: task.id, dataId: task.dataId, dataName: task.dataName,
        projectId: '1', projectName: '清华路端项目', node: task.node, readonly: task.status === 'submitted' || task.status === 'completed',
        videoUrl: '/temp.mp4', frameRate: result.frameRate, durationSeconds: result.totalFrames / result.frameRate, mediaStartTime: result.mediaStartTime,
        currentRevision: mockRevisions.get(taskId) || 0,
        labels: mockLabelLibraries.flatMap((library) => library.tags.filter((tag) => tag.enabled)), labelLibraryBound: true, result,
      }
    }
    if (!videoId) throw new Error('缺少视频记录 ID，无法进入作业页')
    const requestKey = `${taskId}:${videoId}:${viewOnly ? 'view' : 'edit'}`
    const pending = workspaceRequests.get(requestKey)
    if (pending) return pending
    const workspaceRequest = (async () => {
      const params = new URLSearchParams({ video_id: videoId })
      const raw = await request<Record<string, unknown>>(`/api/tasks/${encodeURIComponent(taskId)}?${params}`)
      const task = (raw.task || raw) as Record<string, unknown>
      const effectiveProjectId = String(task.project_id || (task.project as Record<string, unknown> | undefined)?.id || projectId)
      const labelSnapshot = await loadTaskLabels(effectiveProjectId)
      const workspace = normalizeWorkspace(taskId, raw, labelSnapshot.labels, labelSnapshot.bound, viewOnly, effectiveProjectId)
      taskNodes.set(taskId, workspace.node)
      if (videoId) taskVideoIds.set(taskId, videoId)
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
    const response = await request<Record<string, unknown>>(`/api/tasks/${encodeURIComponent(taskId)}/annotation-draft${videoQuery(taskId)}`, { method: 'POST', body: JSON.stringify(annotationPayload(result)) })
    const revision = (response.revision || response.current_revision || response) as Record<string, unknown>
    return Number(response.version || revision.version || revision.revision || revision.revision_no || response.revision_id || revision.id || baseRevision + 1)
  },

  async submit(taskId: string, result: AnnotationResult, _revision: number) {
    void _revision
    if (runtimeConfig.apiMode === 'mock') { await delay(); mockResults.set(taskId, clone(result)); return }
    const node = taskNodes.get(taskId) || 'annotation'
    if (node === 'annotation') await request(`/api/tasks/${encodeURIComponent(taskId)}/submit-annotation${videoQuery(taskId)}`, { method: 'POST', body: JSON.stringify(annotationPayload(result)) })
    else await request(`/api/tasks/${encodeURIComponent(taskId)}/decision`, { method: 'POST', body: JSON.stringify({ video_id: decisionVideoId(taskId), node: backendNode(node), decision: 'approved', opinion: '通过' }) })
  },
  clearTaskContext(taskId: string) {
    taskNodes.delete(taskId)
    taskVideoIds.delete(taskId)
  },
  async cancelVideo(taskId: string) {
    if (runtimeConfig.apiMode === 'mock') { await delay(); return { videoId: Number(taskVideoIds.get(taskId) || 0), currentNode: 'annotation', status: 'cancelled', currentAssigneeId: null, cancelled: true } }
    const response = await request<{ video_id: number; current_node: string; status: string; current_assignee_id: number | null; cancelled: boolean }>(`/api/tasks/${encodeURIComponent(taskId)}/cancel-video`, { method: 'POST', body: JSON.stringify({ video_id: decisionVideoId(taskId) }) })
    return { videoId: Number(response.video_id), currentNode: response.current_node, status: response.status, currentAssigneeId: response.current_assignee_id === null ? null : String(response.current_assignee_id), cancelled: Boolean(response.cancelled) }
  },
  async reject(taskId: string, reason: string) {
    if (runtimeConfig.apiMode === 'mock') { await delay(); return }
    const node = taskNodes.get(taskId) || 'review'
    if (node === 'annotation') throw new Error('标注环节不支持退回')
    await request(`/api/tasks/${encodeURIComponent(taskId)}/decision`, { method: 'POST', body: JSON.stringify({ video_id: decisionVideoId(taskId), node: backendNode(node), decision: 'rejected', opinion: reason }) })
  },
}
