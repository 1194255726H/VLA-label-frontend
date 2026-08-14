import { runtimeConfig } from '../config/runtime'
import { mockProjects, mockTasks } from '../mocks/data'
import type { ProjectVideoPage, ProjectVideoQuery, TaskNode, VideoListItem } from '../types/api'
import { request } from './api'
import { getMockFleetSyncedTasks } from './managementApi'

function delay() { return new Promise((resolve) => window.setTimeout(resolve, runtimeConfig.mockDelay)) }
function numberValue(value: unknown) { return value === null || value === undefined || value === '' ? 0 : Number(value) }
function optionalString(value: unknown) { return value === null || value === undefined || value === '' ? undefined : String(value) }

function normalizeNode(value: unknown): TaskNode {
  const raw = String(value || 'annotation')
  const nodeMap: Record<string, TaskNode> = { '标注': 'annotation', '质检': 'review', '审核': 'quality', '验收': 'acceptance', quality_check: 'review', review: 'quality' }
  return nodeMap[raw] || raw as TaskNode
}

function backendNode(node: TaskNode | '') {
  return ({ annotation: 'annotation', review: 'quality_check', quality: 'review', acceptance: 'acceptance' } as const)[node as TaskNode] || ''
}

function normalize(item: Record<string, unknown>): VideoListItem {
  return {
    id: String(item.id || ''), projectId: String(item.project_id || ''), projectName: String(item.project_name || ''),
    taskId: String(item.task_id || ''), taskExternalTaskId: String(item.task_external_task_id || ''), taskTitle: String(item.task_title || ''), taskStatus: String(item.task_status || ''),
    taskCurrentNode: normalizeNode(item.task_current_node), taskCurrentAssigneeId: optionalString(item.task_current_assignee_id), currentNode: normalizeNode(item.current_node), currentAssigneeId: optionalString(item.current_assignee_id),
    videoStatus: String(item.video_status || item.task_status || 'pending'), assignmentSource: String(item.assignment_source || ''), videoIndex: numberValue(item.video_index), videoId: optionalString(item.video_id),
    filename: String(item.filename || item.video_id || item.uri || `视频 ${item.id || ''}`), uri: String(item.uri || ''), ossBucket: String(item.oss_bucket || ''), ossKey: String(item.oss_key || ''),
    duration: numberValue(item.duration), fileSize: numberValue(item.file_size), storageStatus: String(item.storage_status || 'unchecked') as VideoListItem['storageStatus'], storageError: optionalString(item.storage_error), storageCheckedAt: optionalString(item.storage_checked_at),
    createdAt: String(item.created_at || ''), updatedAt: String(item.updated_at || ''), submittedNode: optionalString(item.submitted_node), submittedById: optionalString(item.submitted_by_id), submittedAt: optionalString(item.submitted_at), submittedDecision: optionalString(item.submitted_decision),
  }
}

function mockItems(projectId: string): VideoListItem[] {
  const project = mockProjects.find((item) => item.id === projectId) || mockProjects[0]
  const taskVideos = mockTasks.map((task, index) => normalize({ id: `video-${index + 1}`, project_id: projectId, project_name: project.name, task_id: task.id, task_external_task_id: task.dataId, task_title: task.dataName, task_status: task.status, task_current_node: task.node, current_node: task.node, current_assignee_id: task.assignee, video_status: task.status === 'processing' ? 'in_progress' : task.status === 'pending' ? 'assigned' : task.status, video_index: 0, video_id: task.dataId, filename: `${task.dataName}.mp4`, uri: '/temp.mp4', duration: task.totalDuration, file_size: 96978164, storage_status: index === 2 ? 'missing' : index === 4 ? 'unchecked' : 'available', storage_error: index === 2 ? '对象存储中未找到该视频' : '', updated_at: task.updatedAt }))
  const syncedVideos = getMockFleetSyncedTasks(projectId).map((task, index) => normalize({ id: `fleet-video-${task.id}`, project_id: projectId, project_name: project.name, task_id: `fleet-${task.id}`, task_external_task_id: task.externalTaskId, task_title: task.name || task.externalTaskId, task_status: 'pending', current_node: 'annotation', video_status: 'pending', video_index: index, filename: `${task.externalTaskId}.mp4`, duration: task.totalDuration, storage_status: 'unchecked', updated_at: new Date().toISOString() }))
  return [...syncedVideos, ...taskVideos]
}

export const annotationDataApi = {
  async list(projectId: string, query: ProjectVideoQuery = {}): Promise<ProjectVideoPage> {
    const page = query.page || 1
    const pageSize = query.pageSize || 20
    if (runtimeConfig.apiMode === 'mock') {
      await delay()
      const keyword = query.keyword?.toLowerCase()
      const items = mockItems(projectId).filter((item) => (!keyword || `${item.filename}${item.videoId}${item.uri}${item.taskTitle}${item.taskExternalTaskId}`.toLowerCase().includes(keyword)) && (!query.status || item.taskStatus === query.status) && (!query.currentNode || item.currentNode === query.currentNode) && (!query.storageStatus || item.storageStatus === query.storageStatus))
      return { items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length, page, pageSize, pages: Math.max(1, Math.ceil(items.length / pageSize)) }
    }
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
    if (query.keyword) params.set('keyword', query.keyword)
    if (query.status) params.set('status', query.status)
    if (query.currentNode) params.set('current_node', backendNode(query.currentNode))
    if (query.storageStatus) params.set('storage_status', query.storageStatus)
    const result = await request<{ items: Array<Record<string, unknown>>; total: number; page: number; page_size: number; pages: number }>(`/api/projects/${encodeURIComponent(projectId)}/videos?${params}`)
    return { items: result.items.map(normalize), total: result.total || 0, page: result.page || page, pageSize: result.page_size || pageSize, pages: result.pages || 1 }
  },
}
