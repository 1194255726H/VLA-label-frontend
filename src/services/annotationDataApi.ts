import { runtimeConfig } from '../config/runtime'
import { mockProjects, mockTasks } from '../mocks/data'
import type { ProjectVideoPage, ProjectVideoQuery, TaskNode, VideoListItem } from '../types/api'
import { request } from './api'
import { getMockFleetSyncedTasks } from './managementApi'

const pendingVideoListRequests = new Map<string, Promise<ProjectVideoPage>>()

function delay() { return new Promise((resolve) => window.setTimeout(resolve, runtimeConfig.mockDelay)) }
function numberValue(value: unknown) { return value === null || value === undefined || value === '' ? 0 : Number(value) }
function nullableNumberValue(value: unknown) { return value === null || value === undefined || value === '' ? null : Number(value) }
function optionalString(value: unknown) { return value === null || value === undefined || value === '' ? undefined : String(value) }

function normalizeNode(value: unknown): TaskNode {
  const raw = String(value || 'annotation')
  const nodeMap: Record<string, TaskNode> = { '标注': 'annotation', '质检': 'review', '审核': 'quality', '验收': 'acceptance', quality_check: 'review', review: 'quality' }
  return nodeMap[raw] || raw as TaskNode
}

function normalize(item: Record<string, unknown>): VideoListItem {
  return {
    id: String(item.id || ''), projectId: String(item.project_id || ''), projectName: String(item.project_name || ''),
    fleetVideoId: optionalString(item.fleet_video_id), currentNode: normalizeNode(item.current_node), currentAssigneeId: optionalString(item.current_assignee_id), currentAssigneeName: optionalString(item.current_assignee_name),
    videoStatus: String(item.status || item.video_status || 'pending'), assignmentSource: String(item.assignment_source || ''), sortOrder: numberValue(item.sort_order ?? item.video_index), videoIndex: numberValue(item.video_index ?? item.sort_order), externalVideoId: optionalString(item.external_video_id || item.video_id), videoId: optionalString(item.video_id || item.external_video_id),
    filename: String(item.filename || item.external_video_id || item.video_id || item.uri || `视频 ${item.id || ''}`), uri: String(item.uri || item.preview_url || ''), sourceUri: String(item.source_uri || ''), previewUrl: String(item.preview_url || item.uri || ''), ossBucket: String(item.oss_bucket || ''), ossKey: String(item.oss_key || ''),
    duration: numberValue(item.duration), fileSize: numberValue(item.file_size), storageStatus: String(item.storage_status || 'unchecked') as VideoListItem['storageStatus'], storageError: optionalString(item.storage_error), storageCheckedAt: optionalString(item.storage_checked_at),
    videoMeta: item.video_meta && typeof item.video_meta === 'object' ? item.video_meta as Record<string, unknown> : {}, createdAt: String(item.created_at || ''), updatedAt: String(item.updated_at || ''), submittedNode: optionalString(item.submitted_node), submittedById: optionalString(item.submitted_by_id), submittedAt: optionalString(item.submitted_at), submittedDecision: optionalString(item.submitted_decision),
    workType: String(item.work_type || 'normal') === 'returned' ? 'returned' : 'normal', selectedDurationMs: numberValue(item.selected_duration_ms), effectiveDurationMs: numberValue(item.effective_duration_ms), invalidDurationMs: numberValue(item.invalid_duration_ms), unselectedDurationMs: nullableNumberValue(item.unselected_duration_ms), atomicTaskCount: numberValue(item.atomic_task_count), atomicActionCount: numberValue(item.atomic_action_count),
  }
}

function mockItems(projectId: string): VideoListItem[] {
  const project = mockProjects.find((item) => item.id === projectId) || mockProjects[0]
  const localVideos = mockTasks.map((item, index) => normalize({ id: `video-${index + 1}`, project_id: projectId, project_name: project.name, current_node: item.node, current_assignee_id: item.assignee, status: item.status === 'processing' ? 'in_progress' : item.status === 'pending' ? 'assigned' : item.status, sort_order: index, external_video_id: item.dataId, filename: `${item.dataName}.mp4`, uri: '/temp.mp4', duration: item.totalDuration, file_size: 96978164, storage_status: index === 2 ? 'missing' : index === 4 ? 'unchecked' : 'available', storage_error: index === 2 ? '对象存储中未找到该视频' : '', updated_at: item.updatedAt }))
  const syncedVideos = getMockFleetSyncedTasks(projectId).map((item, index) => normalize({ id: `fleet-video-${item.id}`, project_id: projectId, project_name: project.name, fleet_video_id: item.id, current_node: 'annotation', status: 'pending', sort_order: index, external_video_id: item.externalTaskId, filename: `${item.externalTaskId}.mp4`, duration: item.totalDuration, storage_status: 'unchecked', updated_at: new Date().toISOString() }))
  return [...syncedVideos, ...localVideos]
}

export const annotationDataApi = {
  async list(projectId: string, query: ProjectVideoQuery = {}): Promise<ProjectVideoPage> {
    const page = query.page || 1
    const pageSize = query.pageSize || 20
    if (runtimeConfig.apiMode === 'mock') {
      await delay()
      const filename = query.filename?.toLowerCase()
      const items = mockItems(projectId).filter((item) => (!filename || item.filename.toLowerCase().includes(filename)) && (!query.status || item.videoStatus === query.status) && (!query.currentAssigneeId || item.currentAssigneeId === query.currentAssigneeId) && (!query.createdAtStart || item.createdAt >= query.createdAtStart) && (!query.createdAtEnd || item.createdAt.slice(0, 10) <= query.createdAtEnd))
      return { items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length, page, pageSize, pages: Math.max(1, Math.ceil(items.length / pageSize)) }
    }
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
    if (query.filename) params.set('filename', query.filename)
    if (query.status) params.set('status', query.status)
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
}
