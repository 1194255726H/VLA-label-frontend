import { runtimeConfig } from '../config/runtime'
import { mockProjects, mockTasks } from '../mocks/data'
import type { ProjectStageStats, ProjectVideoPage, ProjectVideoQuery, TaskNode, VideoListItem } from '../types/api'
import { request, requestDownload } from './api'
import { getMockFleetSyncedTasks } from './managementApi'
import { normalizeInvalidIntervalList } from '../utils/invalidReason'
import { normalizeVideoStageFields, videoStages } from '../utils/videoStage'

const pendingStageStatsRequests = new Map<string, Promise<ProjectStageStats>>()
const pendingVideoListRequests = new Map<string, Promise<ProjectVideoPage>>()

function delay() { return new Promise((resolve) => window.setTimeout(resolve, runtimeConfig.mockDelay)) }
function numberValue(value: unknown) { return value === null || value === undefined || value === '' ? 0 : Number(value) }
function nullableNumberValue(value: unknown) { return value === null || value === undefined || value === '' ? null : Number(value) }
function optionalString(value: unknown) { return value === null || value === undefined || value === '' ? undefined : String(value) }
function normalizeScene(value: unknown) { if (!value || typeof value !== 'object') return undefined; const item = value as Record<string, unknown>; return { id: String(item.fleet_scene_id ?? item.id ?? ''), fleetSceneId: String(item.fleet_scene_id ?? item.id ?? ''), name: String(item.name || ''), level: String(item.level ?? '') } }
function normalizeSupplier(value: unknown) { if (!value || typeof value !== 'object') return undefined; const item = value as Record<string, unknown>; return { id: String(item.id || ''), fleetSupplierId: String(item.fleet_supplier_id || ''), name: String(item.name || ''), code: String(item.code || ''), type: String(item.type || '') } }

function normalizeNode(value: unknown): TaskNode {
  const raw = String(value || 'annotation')
  const nodeMap: Record<string, TaskNode> = { '标注': 'annotation', '质检': 'review', '审核': 'quality', '验收': 'acceptance', quality_check: 'review', review: 'quality' }
  return nodeMap[raw] || raw as TaskNode
}

function normalize(item: Record<string, unknown>): VideoListItem {
  return {
    ...normalizeVideoStageFields(item),
    deviceId: optionalString(item.device_id), personName: optionalString(item.person_name),
    invalidIntervalList: normalizeInvalidIntervalList(Array.isArray(item.invalid_interval_list) ? item.invalid_interval_list : item.invalid_intervals),
    id: String(item.id || ''), projectId: String(item.project_id || ''), projectName: String(item.project_name || ''),
    fleetVideoId: optionalString(item.fleet_video_id), currentNode: normalizeNode(item.current_node), currentAssigneeId: optionalString(item.current_assignee_id), currentAssigneeName: optionalString(item.current_assignee_name),
    videoStatus: String(item.status || item.video_status || 'pending'), assignmentSource: String(item.assignment_source || ''), sortOrder: numberValue(item.sort_order ?? item.video_index), videoIndex: numberValue(item.video_index ?? item.sort_order), externalVideoId: optionalString(item.external_video_id || item.video_id), videoId: optionalString(item.video_id || item.external_video_id),
    filename: String(item.filename || item.external_video_id || item.video_id || item.uri || `视频 ${item.id || ''}`), uri: String(item.uri || item.preview_url || ''), sourceUri: String(item.source_uri || ''), previewUrl: String(item.preview_url || item.uri || ''), ossBucket: String(item.oss_bucket || ''), ossKey: String(item.oss_key || ''),
    duration: numberValue(item.duration), fileSize: numberValue(item.file_size), storageStatus: String(item.storage_status || 'unchecked') as VideoListItem['storageStatus'], storageError: optionalString(item.storage_error), storageCheckedAt: optionalString(item.storage_checked_at),
    videoMeta: item.video_meta && typeof item.video_meta === 'object' ? item.video_meta as Record<string, unknown> : {}, createdAt: String(item.created_at || ''), updatedAt: String(item.updated_at || ''), scene1: normalizeScene(item.scene1), scene2: normalizeScene(item.scene2), supplier: normalizeSupplier(item.supplier), submittedNode: optionalString(item.submitted_node), submittedById: optionalString(item.submitted_by_id), submittedAt: optionalString(item.submitted_at), submittedDecision: optionalString(item.submitted_decision),
    workType: String(item.work_type || 'normal') === 'returned' ? 'returned' : 'normal', selectedDurationMs: numberValue(item.selected_duration_ms), effectiveDurationMs: numberValue(item.effective_duration_ms), invalidDurationMs: numberValue(item.invalid_duration_ms), unselectedDurationMs: nullableNumberValue(item.unselected_duration_ms), atomicTaskCount: numberValue(item.atomic_task_count), atomicActionCount: numberValue(item.atomic_action_count),
  }
}

function mockItems(projectId: string): VideoListItem[] {
  const project = mockProjects.find((item) => item.id === projectId) || mockProjects[0]
  const localVideos = mockTasks.map((item, index) => normalize({ id: `video-${index + 1}`, stage: index === 0 ? 'pre_annotation' : item.status === 'completed' ? 'completed' : 'human_processing', stage_status: index === 0 ? 'failed' : 'running', pre_annotation_job_id: index === 0 ? 1001 : undefined, pre_annotation_error: index === 0 ? '二级场景选择失败' : '', device_id: `02:00:00:00:00:${String(index + 1).padStart(2, '0')}`, person_name: ['王龙', '李明'][index % 2], project_id: projectId, project_name: project.name, current_node: item.node, current_assignee_id: item.assignee, status: item.status === 'processing' ? 'in_progress' : item.status === 'pending' ? 'assigned' : item.status, sort_order: index, external_video_id: item.dataId, filename: `${item.dataName}.mp4`, uri: '/temp.mp4', duration: item.totalDuration, file_size: 96978164, storage_status: index === 2 ? 'missing' : index === 4 ? 'unchecked' : 'available', storage_error: index === 2 ? '对象存储中未找到该视频' : '', updated_at: item.updatedAt }))
  const syncedVideos = getMockFleetSyncedTasks(projectId).map((item, index) => normalize({ id: `fleet-video-${item.id}`, stage: 'pre_annotation', stage_status: 'queued', device_id: item.device, person_name: item.operator, project_id: projectId, project_name: project.name, fleet_video_id: item.id, current_node: 'annotation', status: 'pending', sort_order: index, external_video_id: item.externalTaskId, filename: `${item.externalTaskId}.mp4`, duration: item.totalDuration, storage_status: 'unchecked', updated_at: new Date().toISOString() }))
  return [...syncedVideos, ...localVideos]
}

export const annotationDataApi = {
  async stageStats(projectId: string): Promise<ProjectStageStats> {
    if (runtimeConfig.apiMode === 'mock') {
      await delay()
      const videos = mockItems(projectId)
      return { projectId, total: videos.length, items: videoStages.map((item) => ({ stage: item.value, name: item.label, count: videos.filter((video) => video.stage === item.value).length })) }
    }
    const path = `/api/projects/${encodeURIComponent(projectId)}/stage-stats`
    const existing = pendingStageStatsRequests.get(path)
    if (existing) return existing
    const pending = request<{ project_id: number; total: number; items: ProjectStageStats['items'] }>(path).then((data) => ({ projectId: String(data.project_id), total: Number(data.total || 0), items: data.items || [] }))
    pendingStageStatsRequests.set(path, pending)
    try { return await pending } finally { if (pendingStageStatsRequests.get(path) === pending) pendingStageStatsRequests.delete(path) }
  },
  async retryPreAnnotation(jobId: string, reason = '') {
    if (!/^\d+$/.test(jobId) || Number(jobId) <= 0) throw new Error('缺少有效的预标注任务 ID，无法重试')
    if (runtimeConfig.apiMode === 'mock') { await delay(); return }
    await request(`/api/pre-annotation-jobs/${encodeURIComponent(jobId)}/retry`, { method: 'POST', body: JSON.stringify(reason.trim() ? { reason: reason.trim() } : {}) })
  },
  async sceneFilters(projectId: string): Promise<Array<{ id: string; name: string; children: Array<{ id: string; name: string }> }>> {
    if (runtimeConfig.apiMode === 'mock') {
      await delay()
      return []
    }
    const response = await request<{ items?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>>(`/api/projects/${encodeURIComponent(projectId)}/fleet/scenes`)
    const scenes = Array.isArray(response) ? response : response.items || []
    return scenes.filter((scene) => scene.id != null).map((scene) => ({
      id: String(scene.id), name: String(scene.name || ''),
      children: (Array.isArray(scene.scenes2) ? scene.scenes2 as Array<Record<string, unknown>> : []).filter((child) => child.id != null).map((child) => ({ id: String(child.id), name: String(child.name || '') })),
    }))
  },
  async list(projectId: string, query: ProjectVideoQuery = {}): Promise<ProjectVideoPage> {
    const page = query.page || 1
    const pageSize = query.pageSize || 20
    if (runtimeConfig.apiMode === 'mock') {
      await delay()
      const filename = query.filename?.toLowerCase()
      const items = mockItems(projectId).filter((item) => (!filename || item.filename.toLowerCase().includes(filename)) && (!query.personName || (item.personName || '').includes(query.personName)) && (!query.scene1Id || item.scene1?.id === query.scene1Id) && (!query.scene2Id || item.scene2?.id === query.scene2Id) && (!query.invalidReason || item.invalidIntervalList?.some((interval) => interval.reason === query.invalidReason)) && (!query.status || item.videoStatus === query.status) && (!query.stage || item.stage === query.stage) && (!query.stageStatus || item.stageStatus === query.stageStatus) && (!query.currentAssigneeId || item.currentAssigneeId === query.currentAssigneeId) && (!query.createdAtStart || item.createdAt >= query.createdAtStart) && (!query.createdAtEnd || item.createdAt.slice(0, 10) <= query.createdAtEnd))
      return { items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length, page, pageSize, pages: Math.max(1, Math.ceil(items.length / pageSize)) }
    }
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
    if (query.filename) params.set('filename', query.filename)
    if (query.personName) params.set('person_name', query.personName)
    if (query.scene1Id) params.set('scene1_id', query.scene1Id)
    if (query.scene2Id) params.set('scene2_id', query.scene2Id)
    if (query.invalidReason) params.set('invalid_reason', query.invalidReason)
    if (query.status) params.set('status', query.status)
    if (query.stage) params.set('stage', query.stage)
    if (query.stageStatus) params.set('stage_status', query.stageStatus)
    if (query.currentAssigneeId) params.set('current_assignee_id', query.currentAssigneeId)
    if (query.createdAtStart) params.set('created_at_start', query.createdAtStart)
    if (query.createdAtEnd) params.set('created_at_end', query.createdAtEnd)
    const path = `/api/projects/${encodeURIComponent(projectId)}/videos?${params}`
    const existing = pendingVideoListRequests.get(path)
    if (existing) return existing
    const pending = request<{ items: Array<Record<string, unknown>>; total: number; page: number; page_size: number; pages: number }>(path).then((result) => ({ items: result.items.map(normalize), total: result.total || 0, page: result.page || page, pageSize: result.page_size || pageSize, pages: result.pages || 1 }))
    pendingVideoListRequests.set(path, pending)
    try { return await pending } finally { if (pendingVideoListRequests.get(path) === pending) pendingVideoListRequests.delete(path) }
  },
  async exportVideos(projectId: string, videoIds: string[]): Promise<{ blob: Blob; filename: string }> {
    const ids = [...new Set(videoIds)].filter(Boolean)
    if (!projectId || !ids.length) throw new Error('请先选择要导出的视频')
    const filename = `project-${projectId}-videos.csv`
    if (runtimeConfig.apiMode === 'mock') {
      await delay()
      const rows = mockItems(projectId).filter((item) => ids.includes(item.id))
      const quote = (value: string) => `"${value.replace(/"/g, '""')}"`
      const csv = [['id', 'filename', 'device_id', 'person_name'], ...rows.map((item) => [item.id, item.filename, item.deviceId || '', item.personName || ''])].map((row) => row.map(quote).join(',')).join('\r\n')
      return { blob: new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }), filename }
    }
    const numericIds = ids.map(Number)
    if (numericIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) throw new Error('视频 ID 无效，请刷新列表后重新选择')
    return requestDownload(`/api/projects/${encodeURIComponent(projectId)}/videos/export`, filename, {
      method: 'POST',
      body: JSON.stringify({ video_ids: numericIds }),
    })
  },
}
