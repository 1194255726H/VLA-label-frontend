import { runtimeConfig } from '../config/runtime'
import { mockLabelLibraries, mockTasks } from '../mocks/data'
import type { AnnotationKeyFrame, AnnotationResult, AnnotationWorkspace, TaskNode, VideoComment } from '../types/api'
import { request } from './api'

const mockResults = new Map<string, AnnotationResult>()
const mockRevisions = new Map<string, number>()
const workspaceRequests = new Map<string, Promise<AnnotationWorkspace>>()
const videoNodes = new Map<string, TaskNode>()
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

function mockResult(videoKey: string) {
  if (!mockResults.has(videoKey)) {
    const result = emptyResult()
    result.goals = [
      { id: 'goal-1', sequence: 1, code: 'roadside_obstacle_018-001', type: 'goal', startFrame: 60, endFrame: 300, labelId: '201', labelName: '通过路口', color: '#2563EB', descriptionZh: '车辆通过园区路口' },
      { id: 'goal-2', sequence: 2, code: 'roadside_obstacle_018-002', type: 'goal', startFrame: 390, endFrame: 750, labelId: '101', labelName: '车辆', color: '#7C3AED', descriptionZh: '' },
    ]
    result.actions = [
      { id: 'action-1', sequence: 1, code: 'roadside_obstacle_018-001-A001', parentId: 'goal-1', type: 'action', startFrame: 90, endFrame: 180, labelId: '204', labelName: '直行', color: '#16A34A', descriptionZh: '保持直行', keyFrames: [] },
      { id: 'action-2', sequence: 2, code: 'roadside_obstacle_018-001-A002', parentId: 'goal-1', type: 'action', startFrame: 190, endFrame: 270, labelId: '205', labelName: '等待', color: '#D97706', descriptionZh: '', keyFrames: [] },
    ]
    mockResults.set(videoKey, result)
    result.nextGoalSequence = 3
    result.nextActionSequenceByGoal = { 'goal-1': 3, 'goal-2': 1 }
    mockRevisions.set(videoKey, 1)
  }
  return mockResults.get(videoKey) as AnnotationResult
}

function wireNode(value: unknown): TaskNode {
  return ({ annotation: 'annotation', quality_check: 'review', review: 'quality', acceptance: 'acceptance' } as Record<string, TaskNode>)[String(value)] || 'annotation'
}

function backendNode(value: TaskNode) {
  return ({ annotation: 'annotation', review: 'quality_check', quality: 'review', acceptance: 'acceptance' } as const)[value]
}

function normalizeVideoComment(item: Record<string, unknown>): VideoComment {
  return {
    id: String(item.id || ''), videoId: String(item.video_id || ''),
    node: wireNode(item.node), sequence: Number(item.sequence || 0),
    positionX: Number(item.position_x || 0), positionY: Number(item.position_y || 0), content: String(item.content || ''),
    resolved: Boolean(item.resolved), createdById: String(item.created_by_id || ''), createdByName: String(item.created_by_name || ''),
    createdAt: String(item.created_at || ''), resolvedById: item.resolved_by_id == null ? undefined : String(item.resolved_by_id), resolvedAt: item.resolved_at == null ? undefined : String(item.resolved_at),
  }
}

function videoContextKey(projectId: string, videoId: string) { return `${projectId}:${videoId}` }

function msToFrame(value: unknown, frameRate: number) { return Math.max(0, Math.round(Number(value || 0) / 1000 * frameRate)) }
function frameToMs(value: number, frameRate: number) { return Math.max(0, Math.round(value / frameRate * 1000)) }

function normalizeOperationObjectRefs(item: Record<string, unknown>) {
  const rawObjects = Array.isArray(item.operation_objects) ? item.operation_objects as Array<Record<string, unknown>> : []
  const rawIds = item.operation_object_ids ?? item.operationObjectIds
  const legacyId = item.operation_object_id ?? item.operationObjectId
  const operationObjectIds = (Array.isArray(rawIds) ? rawIds : legacyId == null ? rawObjects.map((object) => object.id) : [legacyId]).filter((id) => id != null).map(String)
  const rawNames = item.operation_object_names ?? item.operationObjectNames
  const legacyName = item.operation_object_name ?? item.operationObjectName ?? item.objectName
  const operationObjectNames = (Array.isArray(rawNames) ? rawNames : legacyName ? [legacyName] : rawObjects.map((object) => object.name)).filter(Boolean).map(String)
  return { operationObjectIds, operationObjectNames }
}

function normalizeKeyFrame(item: Record<string, unknown>, index = 0): AnnotationKeyFrame {
  const type = String(item.event_type || item.type || 'contact') as AnnotationKeyFrame['type']
  const detail = String(type === 'contact' ? item.contact_description || item.detail || '' : type === 'object_change' ? item.object_change_description || item.detail || '' : item.abnormal_description || item.detail || '')
  const { operationObjectIds, operationObjectNames } = normalizeOperationObjectRefs(item)
  return { id: String(item.id || crypto.randomUUID()), sequence: Number(item.sequence ?? index + 1), frame: Number(item.frame || 0), type, operationObjectIds, operationObjectNames, detail }
}

function keyFramePayload(keyFrame: AnnotationKeyFrame) {
  return { frame: keyFrame.frame, event_type: keyFrame.type, contact_description: keyFrame.type === 'contact' ? keyFrame.detail : '', object_change_description: keyFrame.type === 'object_change' ? keyFrame.detail : '', abnormal_description: keyFrame.type === 'abnormal' ? keyFrame.detail : '', operation_object_ids: keyFrame.operationObjectIds.map(Number) }
}

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
      keyFrames: (action.keyFrames || []).filter((keyFrame) => Number.isFinite(keyFrame.frame)).map((keyFrame, index) => normalizeKeyFrame(keyFrame as unknown as Record<string, unknown>, index)),
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
        operation_object_ids: (action.operationObjectIds || []).map(Number),
        description_zh: action.descriptionZh, description_en: action.descriptionEn || '', description_source: action.descriptionSource || 'user',
        model_description_required: action.modelDescriptionRequired,
        relative_start_second: (action.startFrame - goal.startFrame) / result.frameRate,
        relative_end_second: (action.endFrame - goal.startFrame) / result.frameRate,
      })),
    })),
    invalid_intervals: result.invalidRanges.map((range) => ({ id: range.id, sequence: range.sequence, start_frame: range.startFrame, end_frame: range.endFrame, start_ms: frameToMs(range.startFrame, result.frameRate), end_ms: frameToMs(range.endFrame, result.frameRate), reason: range.reason, description: range.reason })),
    meta: { frame_rate: result.frameRate, media_start_time: result.mediaStartTime, coordinate_system: result.coordinateSystem, interval_convention: result.intervalConvention, frontend_result: result },
  }
}

async function loadTaskConfiguration(projectId: string) {
  if (!projectId) return { labels: [], bound: false, operationLibraryId: '', operationLibraryName: '' }
  const project = await request<Record<string, unknown>>(`/api/projects/${encodeURIComponent(projectId)}`)
  const projectData = (project.project || project) as Record<string, unknown>
  const config = (projectData.work_config || {}) as Record<string, unknown>
  const ids = Array.isArray(config.label_library_ids) ? config.label_library_ids : []
  const groups = await Promise.all(ids.map((id) => request<{ items: Array<Record<string, unknown>> }>(`/api/data/label-libraries/${encodeURIComponent(String(id))}/labels?page_size=100`)))
  return { labels: groups.flatMap((group) => group.items).filter((item) => item.enabled !== false).map((item) => ({ id: String(item.id), name: String(item.name || ''), code: String(item.code || ''), color: String(item.color || '#2563EB'), appliesTo: String(item.applies_to || 'goal') as 'goal' | 'action', enabled: true, createdAt: String(item.created_at || '') })), bound: ids.length > 0, operationLibraryId: String(config.operation_library_id || ''), operationLibraryName: String(config.operation_library_name || '') }
}

function normalizeWorkspace(projectId: string, videoId: string, raw: Record<string, unknown>, labels: AnnotationWorkspace['labels'], labelLibraryBound: boolean, operationLibraryId: string, operationLibraryName: string, viewOnly: boolean): AnnotationWorkspace {
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
  const durationMilliseconds = Number(videoMeta.duration_ms || selectedVideo.duration_ms || task.duration_ms || 0)
  const durationSeconds = durationMilliseconds > 0 ? durationMilliseconds / 1000 : Number(selectedVideo.duration || task.duration || 0)
  const rawGoals = Array.isArray(revisionPayload.atomic_tasks) ? revisionPayload.atomic_tasks as Array<Record<string, unknown>> : []
  const goals = rawGoals.map((goal, index) => ({ id: String(goal.id || `goal-${goal.sequence ?? index + 1}`), sequence: Number(goal.sequence ?? index + 1), type: 'goal' as const, startFrame: goal.start_frame == null ? msToFrame(goal.start_ms, frameRate) : Number(goal.start_frame), endFrame: goal.end_frame == null ? msToFrame(goal.end_ms, frameRate) : Number(goal.end_frame), labelId: goal.label_id == null ? undefined : String(goal.label_id), labelCode: String(goal.label_code || ''), labelName: labels.find((label) => label.id === String(goal.label_id))?.name, color: labels.find((label) => label.id === String(goal.label_id))?.color || '#2563EB', descriptionZh: String(goal.description || '') }))
  const actions = rawGoals.flatMap((goal, goalIndex) => { const parent = goals[goalIndex]; return (Array.isArray(goal.actions) ? goal.actions as Array<Record<string, unknown>> : []).map((action, index) => { const noAction = action.segment_type === 'no_action' || action.system_code === 'NO_ACTION'; const rawKeyFrames = Array.isArray(action.keyframes) ? action.keyframes : Array.isArray(action.key_frames) ? action.key_frames : []; return ({ id: String(action.id || `${parent.id}-A${String(action.sequence ?? index + 1).padStart(3, '0')}`), sequence: Number(action.sequence ?? index + 1), parentId: parent.id, type: noAction ? 'no_action' as const : 'action' as const, startFrame: action.start_frame == null ? msToFrame(action.start_ms, frameRate) : Number(action.start_frame), endFrame: action.end_frame == null ? msToFrame(action.end_ms, frameRate) : Number(action.end_frame), labelId: action.label_id == null ? undefined : String(action.label_id), labelCode: String(action.label_code || ''), labelName: labels.find((label) => label.id === String(action.label_id))?.name, color: noAction ? '#64748B' : labels.find((label) => label.id === String(action.label_id))?.color || '#16A34A', descriptionZh: String(action.description_zh || action.description || (noAction ? '未执行有效动作' : '')), descriptionEn: String(action.description_en || (noAction ? 'No valid action is performed.' : '')), systemCode: noAction ? 'NO_ACTION' as const : undefined, descriptionSource: noAction ? 'system' as const : 'user' as const, modelDescriptionRequired: noAction ? false : undefined, ...normalizeOperationObjectRefs(action), keyFrames: (rawKeyFrames as Array<Record<string, unknown>>).map(normalizeKeyFrame) }) }) })
  const node = wireNode(selectedVideo.current_node || task.current_node)
  const videoUri = String(selectedVideo.url || task.video_url || task.video_uri || '')
  const status = String(selectedVideo.status || task.status || '')
  const preservedWithBackendIdentity = preserved ? (() => {
    const goalIdByOldId = new Map<string, string>()
    const mergedGoals = preserved.goals.map((goal) => { const backend = goals.find((item) => item.sequence === goal.sequence); if (backend) goalIdByOldId.set(goal.id, backend.id); return backend ? { ...goal, id: backend.id } : goal })
    const mergedActions = preserved.actions.map((action) => {
      const parentId = goalIdByOldId.get(action.parentId || '') || action.parentId
      const backend = actions.find((item) => item.parentId === parentId && item.sequence === action.sequence)
      return backend ? { ...action, id: backend.id, parentId, operationObjectIds: backend.operationObjectIds, operationObjectNames: backend.operationObjectNames, keyFrames: backend.keyFrames } : { ...action, parentId }
    })
    return { ...preserved, goals: mergedGoals, actions: mergedActions }
  })() : undefined
  const baseResult = preservedWithBackendIdentity || {
    schemaVersion: 'vla-video-hierarchy@11.0.0' as const, coordinateSystem: 'zero-based-frame' as const, intervalConvention: 'half-open' as const, frameRate,
    totalFrames: Math.round(durationSeconds * frameRate), mediaStartTime, goals, actions,
    invalidRanges: (Array.isArray(revisionPayload.invalid_intervals) ? revisionPayload.invalid_intervals as Array<Record<string, unknown>> : []).map((range, index) => ({ id: String(range.id || `invalid-${index + 1}`), sequence: Number(range.sequence || index + 1), startFrame: range.start_frame == null ? msToFrame(range.start_ms, frameRate) : Number(range.start_frame), endFrame: range.end_frame == null ? msToFrame(range.end_ms, frameRate) : Number(range.end_frame), reason: String(range.reason || range.description || '视频内容无效') })),
    usedAnnotationConfigCodes: [], comments: [], nextGoalSequence: goals.length + 1, nextActionSequenceByGoal: Object.fromEntries(goals.map((goal) => [goal.id, actions.filter((action) => action.parentId === goal.id).length + 1])), nextInvalidSequence: 1,
  }
  return {
    videoId,
    videoCode: String(selectedVideo.external_video_id || selectedVideo.id || videoId), dataId: String(selectedVideo.external_video_id || selectedVideo.id || videoId), dataName: String(selectedVideo.filename || 'VLA 视频数据'),
    projectId: String(selectedVideo.project_id || project.id || projectId), projectName: String(project.name || ''), node,
    readonly: viewOnly || ['submitted', 'completed'].includes(status),
    videoUrl: /^https?:\/\//i.test(videoUri) ? videoUri : '',
    frameRate,
    durationSeconds, mediaStartTime,
    currentRevision: Number(revision.version || revision.revision || revision.revision_no || revision.id || 0), labels, labelLibraryBound, operationLibraryId, operationLibraryName, result: normalizeAnnotationResult(baseResult),
  }
}

export const annotationApi = {
  async listVideoComments(projectId: string, videoId: string): Promise<VideoComment[]> {
    if (runtimeConfig.apiMode === 'mock') { await delay(); return clone(mockVideoComments.get(videoContextKey(projectId, videoId)) || []) }
    const response = await request<{ items: Array<Record<string, unknown>> }>(`/api/projects/${encodeURIComponent(projectId)}/videos/${encodeURIComponent(videoId)}/comments`)
    return (response.items || []).map(normalizeVideoComment)
  },

  async createVideoComment(projectId: string, videoId: string, payload: { node: TaskNode; sequence: number; content: string; positionX: number; positionY: number }): Promise<VideoComment> {
    if (runtimeConfig.apiMode === 'mock') {
      await delay()
      const key = videoContextKey(projectId, videoId)
      const comment: VideoComment = { id: crypto.randomUUID(), videoId, node: payload.node, sequence: payload.sequence, positionX: payload.positionX, positionY: payload.positionY, content: payload.content, resolved: false, createdById: 'mock-user', createdByName: '当前用户', createdAt: new Date().toISOString() }
      mockVideoComments.set(key, [...(mockVideoComments.get(key) || []), comment])
      return clone(comment)
    }
    const response = await request<Record<string, unknown>>(`/api/projects/${encodeURIComponent(projectId)}/videos/${encodeURIComponent(videoId)}/comments`, { method: 'POST', body: JSON.stringify({ node: backendNode(payload.node), sequence: payload.sequence, content: payload.content, position_x: payload.positionX, position_y: payload.positionY }) })
    return normalizeVideoComment(response)
  },

  async resolveVideoComment(projectId: string, videoId: string, commentId: string): Promise<VideoComment> {
    if (runtimeConfig.apiMode === 'mock') {
      await delay()
      for (const [key, comments] of mockVideoComments) {
        const comment = comments.find((item) => item.id === commentId)
        if (comment) { const resolved = { ...comment, resolved: true, resolvedById: 'mock-user', resolvedAt: new Date().toISOString() }; mockVideoComments.set(key, comments.map((item) => item.id === commentId ? resolved : item)); return clone(resolved) }
      }
      throw new Error('批注不存在')
    }
    const response = await request<Record<string, unknown>>(`/api/projects/${encodeURIComponent(projectId)}/videos/${encodeURIComponent(videoId)}/comments/${encodeURIComponent(commentId)}/resolve`, { method: 'POST', body: '{}' })
    return normalizeVideoComment(response)
  },

  async createKeyFrame(projectId: string, videoId: string, actionId: string, keyFrame: AnnotationKeyFrame): Promise<AnnotationKeyFrame> {
    if (runtimeConfig.apiMode === 'mock' || !/^\d+$/.test(actionId)) { await delay(); return { ...keyFrame, id: crypto.randomUUID() } }
    const response = await request<Record<string, unknown>>(`/api/projects/${encodeURIComponent(projectId)}/videos/${encodeURIComponent(videoId)}/keyframes`, { method: 'POST', body: JSON.stringify({ action_id: Number(actionId), ...keyFramePayload(keyFrame) }) })
    return normalizeKeyFrame(response)
  },

  async updateKeyFrame(projectId: string, videoId: string, keyFrame: AnnotationKeyFrame): Promise<AnnotationKeyFrame> {
    if (runtimeConfig.apiMode === 'mock' || !/^\d+$/.test(keyFrame.id)) { await delay(); return keyFrame }
    const response = await request<Record<string, unknown>>(`/api/projects/${encodeURIComponent(projectId)}/videos/${encodeURIComponent(videoId)}/keyframes/${encodeURIComponent(keyFrame.id)}`, { method: 'PATCH', body: JSON.stringify(keyFramePayload(keyFrame)) })
    return normalizeKeyFrame(response)
  },

  async deleteKeyFrame(projectId: string, videoId: string, keyFrameId: string): Promise<void> {
    if (runtimeConfig.apiMode === 'mock' || !/^\d+$/.test(keyFrameId)) { await delay(); return }
    await request(`/api/projects/${encodeURIComponent(projectId)}/videos/${encodeURIComponent(videoId)}/keyframes/${encodeURIComponent(keyFrameId)}`, { method: 'DELETE' })
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

  async getWorkspace(projectId: string, videoId: string, viewOnly = false): Promise<AnnotationWorkspace> {
    if (runtimeConfig.apiMode === 'mock') {
      await delay()
      const task = mockTasks[0]
      const key = videoContextKey(projectId, videoId)
      const result = clone(mockResult(key))
      return {
        videoId, videoCode: videoId, dataId: videoId, dataName: task.dataName,
        projectId, projectName: '清华路端项目', node: task.node, readonly: viewOnly || task.status === 'submitted' || task.status === 'completed',
        videoUrl: '/temp.mp4', frameRate: result.frameRate, durationSeconds: result.totalFrames / result.frameRate, mediaStartTime: result.mediaStartTime,
        currentRevision: mockRevisions.get(key) || 0,
        labels: mockLabelLibraries.flatMap((library) => library.tags.filter((tag) => tag.enabled)), labelLibraryBound: true, operationLibraryId: '1', operationLibraryName: '常用操作对象库', result,
      }
    }
    if (!videoId) throw new Error('缺少视频记录 ID，无法进入作业页')
    const requestKey = `${projectId}:${videoId}:${viewOnly ? 'view' : 'edit'}`
    const pending = workspaceRequests.get(requestKey)
    if (pending) return pending
    const workspaceRequest = (async () => {
      const raw = await request<Record<string, unknown>>(`/api/projects/${encodeURIComponent(projectId)}/videos/${encodeURIComponent(videoId)}`)
      const configuration = await loadTaskConfiguration(projectId)
      const workspace = normalizeWorkspace(projectId, videoId, raw, configuration.labels, configuration.bound, configuration.operationLibraryId, configuration.operationLibraryName, viewOnly)
      videoNodes.set(videoContextKey(projectId, videoId), workspace.node)
      return workspace
    })()
    workspaceRequests.set(requestKey, workspaceRequest)
    try { return await workspaceRequest } finally { workspaceRequests.delete(requestKey) }
  },

  async save(projectId: string, videoId: string, result: AnnotationResult, baseRevision: number): Promise<number> {
    if (runtimeConfig.apiMode === 'mock') {
      const key = videoContextKey(projectId, videoId); await delay(); mockResults.set(key, clone(result)); const revision = (mockRevisions.get(key) || 0) + 1; mockRevisions.set(key, revision); return revision
    }
    const response = await request<Record<string, unknown>>(`/api/projects/${encodeURIComponent(projectId)}/videos/${encodeURIComponent(videoId)}/annotation-draft`, { method: 'POST', body: JSON.stringify(annotationPayload(result)) })
    const revision = (response.revision || response.current_revision || response) as Record<string, unknown>
    return Number(response.version || revision.version || revision.revision || revision.revision_no || response.revision_id || revision.id || baseRevision + 1)
  },

  async submit(projectId: string, videoId: string, result: AnnotationResult, _revision: number) {
    void _revision
    const key = videoContextKey(projectId, videoId)
    if (runtimeConfig.apiMode === 'mock') { await delay(); mockResults.set(key, clone(result)); return }
    const node = videoNodes.get(key) || 'annotation'
    if (node === 'annotation') await request(`/api/projects/${encodeURIComponent(projectId)}/videos/${encodeURIComponent(videoId)}/submit-annotation`, { method: 'POST', body: JSON.stringify(annotationPayload(result)) })
    else await request(`/api/projects/${encodeURIComponent(projectId)}/videos/${encodeURIComponent(videoId)}/decision`, { method: 'POST', body: JSON.stringify({ node: backendNode(node), decision: 'approved', opinion: '通过' }) })
  },
  clearVideoContext(projectId: string, videoId: string) {
    videoNodes.delete(videoContextKey(projectId, videoId))
  },
  async cancelVideo(projectId: string, videoId: string) {
    if (runtimeConfig.apiMode === 'mock') { await delay(); return { videoId: Number(videoId), currentNode: 'annotation', status: 'cancelled', currentAssigneeId: null, cancelled: true } }
    const response = await request<{ video_id: number; current_node: string; status: string; current_assignee_id: number | null; cancelled: boolean }>(`/api/projects/${encodeURIComponent(projectId)}/videos/${encodeURIComponent(videoId)}/cancel`, { method: 'POST', body: '{}' })
    return { videoId: Number(response.video_id), currentNode: response.current_node, status: response.status, currentAssigneeId: response.current_assignee_id === null ? null : String(response.current_assignee_id), cancelled: Boolean(response.cancelled) }
  },
  async reject(projectId: string, videoId: string, reason: string) {
    if (runtimeConfig.apiMode === 'mock') { await delay(); return }
    const node = videoNodes.get(videoContextKey(projectId, videoId)) || 'review'
    if (node === 'annotation') throw new Error('标注环节不支持退回')
    await request(`/api/projects/${encodeURIComponent(projectId)}/videos/${encodeURIComponent(videoId)}/decision`, { method: 'POST', body: JSON.stringify({ node: backendNode(node), decision: 'rejected', opinion: reason }) })
  },
}
