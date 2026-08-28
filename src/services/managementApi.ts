import { runtimeConfig } from '../config/runtime'
import { mockLabelLibraries, mockManagedProjects, mockMembers, mockProjectDistribution, mockTeams } from '../mocks/data'
import type { FleetSyncResult, FleetVideoGroup, FleetVideoPreviewPage, LabelItem, LabelLibrary, ManagedProject, MediaUploadResult, Member, OperationObject, OperationObjectLibrary, OperationObjectPage, ProjectPayload, ProjectStatus, Team, TeamMembersData } from '../types/api'
import { request } from './api'

let projects = mockManagedProjects.map((item) => ({ ...item, teams: [...item.teams], labelLibraryIds: [...item.labelLibraryIds] }))
let libraries = mockLabelLibraries.map((item) => ({ ...item, tags: item.tags.map((tag) => ({ ...tag })) }))
let operationLibraries: OperationObjectLibrary[] = [{ id: '1', name: '常用操作对象库', desc: '标注常用对象', createdAt: '2026-08-25 06:15' }]
let operationObjects: OperationObject[] = [{ id: '1', libraryId: '1', name: '水杯', alias: '杯子', attribute: '容器', approved: true, createdAt: '2026-08-25 06:16' }]
let teams = mockTeams.map((item) => ({ ...item }))
let members = mockMembers.map((item) => ({ ...item, roles: [...item.roles], projects: [...item.projects] }))
let pendingProjectList: Promise<ManagedProject[]> | undefined
interface MockFleetTask { id: number; externalTaskId: string; name: string; path: string; device: string; operator: string; videoCount: number; syncedCount: number; availableCount: number; totalDuration: number }
const mockFleetTasks: Record<string, MockFleetTask[]> = {
  '合肥创运': Array.from({ length: 12 }, (_, index) => ({ id: 52 + index, externalTaskId: `TASK-20260716-G${String(index + 1).padStart(3, '0')}-01`, name: `合肥创运采集任务 ${index + 1}`, path: `合肥创运 / 路线 ${index + 1}`, device: `VLA-${String(index % 4 + 1).padStart(2, '0')}`, operator: ['王龙', '李明', '张伟'][index % 3], videoCount: 3, syncedCount: index < 2 ? 1 : 0, availableCount: index < 2 ? 2 : 3, totalDuration: 27000 })),
  '工厂电脑装配': Array.from({ length: 4 }, (_, index) => ({ id: 101 + index, externalTaskId: `TASK-20260716-G004-0${index + 1}`, name: ['整机装配', '部件装配', '硬盘安装', '线缆连接'][index], path: `工厂电脑装配 / ${['主板安装 / 固定主板', '内存安装 / 插装内存', '硬盘安装 / 固定硬盘', '线缆连接 / 连接电源线'][index]}`, device: `工位 ${index + 1}`, operator: ['王龙', '李明'][index % 2], videoCount: [5, 7, 4, 3][index], syncedCount: [1, 2, 0, 0][index], availableCount: [4, 5, 4, 3][index], totalDuration: [15600, 22400, 12800, 9600][index] })),
  '商超拣选': Array.from({ length: 3 }, (_, index) => ({ id: 201 + index, externalTaskId: `TASK-20260718-S${String(index + 1).padStart(3, '0')}`, name: `货架拣选任务 ${index + 1}`, path: `商超拣选 / 货架 ${index + 1}`, device: `CAM-${index + 1}`, operator: '陈静', videoCount: 4, syncedCount: 0, availableCount: 4, totalDuration: 16000 })),
}
const mockFleetSynced = new Map<string, Set<number>>()

export function getMockFleetSyncedTasks(projectId: string) {
  const synced = mockFleetSynced.get(projectId) || new Set<number>()
  return clone(Object.values(mockFleetTasks).flat().filter((task) => synced.has(task.id)))
}

function delay() { return new Promise((resolve) => window.setTimeout(resolve, runtimeConfig.mockDelay)) }
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }
function num(value: unknown) { return Number.isFinite(Number(value)) ? Number(value) : 0 }
function record(value: unknown) { return value && typeof value === 'object' ? value as Record<string, unknown> : {} }
function itemsOf(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value as Array<Record<string, unknown>>
  const valueRecord = record(value)
  return Array.isArray(valueRecord.items) ? valueRecord.items as Array<Record<string, unknown>> : []
}

function normalizeProject(item: Record<string, unknown>): ManagedProject {
  const statusMap: Record<string, ProjectStatus> = { draft: 'not-started', not_started: 'not-started', '未启动': 'not-started', running: 'running', '进行中': 'running', paused: 'paused', '已暂停': 'paused', finished: 'finished', '已结束': 'finished', archived: 'archived', '已归档': 'archived' }
  const rawTeams = itemsOf(item.teams)
  const owner = record(item.owner)
  const workConfig = record(item.work_config || item.workConfig)
  const rawLabelLibraryIds = workConfig.label_library_ids || item.labelLibraryIds
  const completionLabels: Record<string, ManagedProject['completionNode']> = { quality_check: '质检', review: '审核', acceptance: '验收' }
  const currentNodeLabels: Record<string, NonNullable<ManagedProject['currentNode']>> = { annotation: '标注', quality_check: '质检', review: '审核', acceptance: '验收' }
  const modelGenerationLabels: Record<string, NonNullable<ManagedProject['modelGenerationNode']>> = { annotation: '标注', quality_check: '质检', review: '审核', acceptance: '验收' }
  const rawGuideline = record(item.annotation_guideline || item.annotationGuideline)
  const annotationGuideline = rawGuideline.type === 'link'
    ? { type: 'link' as const, displayName: String(rawGuideline.display_name || rawGuideline.displayName || ''), url: String(rawGuideline.url || '') }
    : rawGuideline.type === 'file'
      ? { type: 'file' as const, displayName: String(rawGuideline.display_name || rawGuideline.displayName || ''), url: String(rawGuideline.url || '') }
      : null
  return {
    id: String(item.id || item.projectId || ''), code: String(item.code || item.projectCode || ''), name: String(item.name || item.projectName || ''), desc: String(item.desc || item.description || ''),
    status: statusMap[String(item.status)] || 'not-started', teams: rawTeams.map((team) => String(team.name || '')), teamIds: rawTeams.map((team) => String(team.id || '')), memberCount: num(item.annotator_count ?? item.memberCount), dataCount: num(item.video_count ?? item.dataCount),
    selectedDuration: num(item.selected_duration_ms ?? item.selectedDuration) / (item.selected_duration_ms == null ? 1 : 1000), validDuration: num(item.effective_duration_ms ?? item.validDuration) / (item.effective_duration_ms == null ? 1 : 1000), invalidDuration: num(item.invalid_duration_ms ?? item.invalidDuration) / (item.invalid_duration_ms == null ? 1 : 1000), unselectedDuration: num(item.uncovered_duration_ms ?? item.unselectedDuration) / (item.uncovered_duration_ms == null ? 1 : 1000), goalCount: num(item.atomic_task_count ?? item.goalCount), actionCount: num(item.atomic_action_count ?? item.actionCount),
    currentNode: currentNodeLabels[String(item.current_node)] || undefined, completionNode: completionLabels[String(workConfig.completion_node || item.completionNode)] || '验收', modelGenerationNode: modelGenerationLabels[String(workConfig.model_generation_node || item.modelGenerationNode)] || '标注', progress: num(item.progress_percent ?? item.progress), owner: String(owner.display_name || owner.username || item.owner || '-'), ownerId: String(owner.id || item.owner_id || ''), createdAt: String(item.created_at || item.createdAt || ''), deliveryAt: String(item.delivery_at || item.deliveryAt || ''),
    labelLibraryIds: Array.isArray(rawLabelLibraryIds) ? rawLabelLibraryIds.map(String) : [],
    operationLibraryId: String(workConfig.operation_library_id || item.operationLibraryId || ''), operationLibraryName: String(workConfig.operation_library_name || item.operationLibraryName || ''),
    assignmentStrategy: workConfig.assignment_strategy === 'round_robin' ? 'average' : ['manual_claim', 'load_balance', 'average'].includes(String(workConfig.assignment_strategy)) ? String(workConfig.assignment_strategy) as ManagedProject['assignmentStrategy'] : 'manual_claim',
    annotationGuideline,
  }
}

export const projectApi = {
  async list(): Promise<ManagedProject[]> {
    if (runtimeConfig.apiMode === 'mock') { await delay(); return clone(projects) }
    if (pendingProjectList) return pendingProjectList
    const requestPromise = request<{ items: Array<Record<string, unknown>> }>('/api/projects/?page_size=100').then((result) => result.items.map(normalizeProject))
    pendingProjectList = requestPromise
    try {
      return await requestPromise
    } finally {
      if (pendingProjectList === requestPromise) pendingProjectList = undefined
    }
  },
  async detail(projectId: string): Promise<ManagedProject> {
    if (runtimeConfig.apiMode === 'mock') {
      await delay()
      const project = projects.find((item) => item.id === projectId)
      if (!project) throw new Error('项目不存在')
      return clone(project)
    }
    const result = await request<Record<string, unknown>>(`/api/projects/${encodeURIComponent(projectId)}`)
    return normalizeProject(record(result.project || result))
  },
  async save(payload: ProjectPayload): Promise<ManagedProject[]> {
    if (!payload.operationLibraryId) throw new Error('必须选择操作对象库')
    if (payload.deliveryAt) {
      const now = new Date()
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      if (payload.deliveryAt < today) throw new Error('交付时间不能早于当前日期')
    }
    if (runtimeConfig.apiMode === 'mock') {
      await delay()
      if (projects.some((item) => item.name === payload.name && item.id !== payload.projectId)) throw new Error('项目名称已存在')
      const operationLibraryName = operationLibraries.find((item) => item.id === payload.operationLibraryId)?.name || ''
      if (payload.projectId) {
        projects = projects.map((item) => item.id === payload.projectId ? { ...item, ...payload, operationLibraryName, labelLibraryIds: [...payload.labelLibraryIds] } : item)
      } else {
        projects = [{ id: String(Date.now()), code: `PRJ-${Date.now().toString(36).toUpperCase()}`, status: 'not-started', memberCount: 0, dataCount: 0, selectedDuration: 0, validDuration: 0, invalidDuration: 0, unselectedDuration: 0, goalCount: 0, actionCount: 0, progress: 0, createdAt: new Date().toISOString().slice(0, 10), ...payload, operationLibraryName }, ...projects]
      }
      return clone(projects)
    }
    const nodeValues = { '标注': 'annotation', '质检': 'quality_check', '审核': 'review', '验收': 'acceptance' }
    const annotationGuideline = payload.annotationGuideline?.type === 'link'
      ? { type: 'link', display_name: payload.annotationGuideline.displayName, url: payload.annotationGuideline.url }
      : payload.annotationGuideline?.type === 'file'
        ? { type: 'file', display_name: payload.annotationGuideline.displayName, url: payload.annotationGuideline.url }
        : null
    const body = { name: payload.name, description: payload.desc, team_ids: payload.teams.map(Number), owner_id: payload.owner ? Number(payload.owner) : null, delivery_at: payload.deliveryAt || null, completion_node: nodeValues[payload.completionNode], model_generation_node: nodeValues[payload.modelGenerationNode], assignment_strategy: payload.assignmentStrategy, active_task_limit: 10, label_library_ids: payload.labelLibraryIds.map(Number), operation_library_id: Number(payload.operationLibraryId), ...(annotationGuideline ? { annotation_guideline: annotationGuideline } : {}) }
    await request(payload.projectId ? `/api/projects/${encodeURIComponent(payload.projectId)}` : '/api/projects/', { method: payload.projectId ? 'PATCH' : 'POST', body: JSON.stringify(body) })
    return this.list()
  },
  async setStatus(projectId: string, status: ProjectStatus): Promise<ManagedProject[]> {
    if (runtimeConfig.apiMode === 'mock') { await delay(); projects = projects.map((item) => item.id === projectId ? { ...item, status } : item); return clone(projects) }
    const wireStatus = status === 'not-started' ? 'not_started' : status
    await request(`/api/projects/${encodeURIComponent(projectId)}/status`, { method: 'POST', body: JSON.stringify({ status: wireStatus, reason: '前端项目管理操作' }) })
    return this.list()
  },
  async delete(projectId: string): Promise<ManagedProject[]> {
    if (runtimeConfig.apiMode === 'mock') { await delay(); projects = projects.filter((item) => item.id !== projectId); return clone(projects) }
    await request(`/api/projects/${encodeURIComponent(projectId)}`, { method: 'DELETE' })
    return this.list()
  },
}

export const mediaApi = {
  async upload(file: File): Promise<MediaUploadResult> {
    if (runtimeConfig.apiMode === 'mock') {
      await delay()
      return { key: `uploads/guidelines/mock/${encodeURIComponent(file.name)}`, url: `/api/media/files/uploads/guidelines/mock/${encodeURIComponent(file.name)}`, displayName: file.name, mimeType: file.type || 'application/octet-stream', byteSize: file.size }
    }
    const formData = new FormData()
    formData.append('file', file)
    const result = await request<{ key: string; url: string; display_name: string; mime_type: string; byte_size: number }>('/api/media/upload', { method: 'POST', body: formData })
    return { key: result.key, url: result.url, displayName: result.display_name, mimeType: result.mime_type, byteSize: result.byte_size }
  },
}

export const fleetApi = {
  async videoGroups(projectId: string): Promise<FleetVideoGroup[]> {
    if (runtimeConfig.apiMode === 'mock') {
      await delay()
      const synced = mockFleetSynced.get(projectId) || new Set<number>()
      return clone(Object.entries(mockFleetTasks).map(([scene, tasks], index) => ({ scene1Id: index + 1, scene1Name: scene, scene2Id: index + 101, scene2Name: tasks[0]?.path.split(' / ')[1] || scene, supplierId: index + 201, supplierName: tasks[0]?.operator || '-', videoCount: tasks.reduce((sum, task) => sum + task.videoCount, 0), syncableCount: tasks.filter((task) => !synced.has(task.id)).reduce((sum, task) => sum + task.videoCount, 0) })))
    }
    const result = await request<{ items: Array<Record<string, unknown>> }>(`/api/projects/${encodeURIComponent(projectId)}/fleet/video-groups`)
    return (result.items || []).map((item) => ({ scene1Id: num(item.scene1_id), scene1Name: String(item.scene1_name || ''), scene2Id: num(item.scene2_id), scene2Name: String(item.scene2_name || ''), supplierId: num(item.supplier_id), supplierName: String(item.supplier_name || ''), videoCount: num(item.video_count), syncableCount: num(item.syncable_count) }))
  },
  async videos(projectId: string, query: { scene1Id?: number; scene2Id?: number; supplierId?: number; keyword?: string; page: number; pageSize: number }): Promise<FleetVideoPreviewPage> {
    if (runtimeConfig.apiMode === 'mock') {
      await delay()
      const source = Object.entries(mockFleetTasks).flatMap(([scene, tasks], sceneIndex) => tasks.flatMap((task) => Array.from({ length: task.videoCount }, (_, index) => ({ fleetVideoId: task.id * 100 + index, filename: `${task.externalTaskId}-${index + 1}.mp4`, duration: task.totalDuration / Math.max(1, task.videoCount), fileSize: null, ossKey: `mock/${task.externalTaskId}/${index + 1}.mp4`, ossBucket: 'mock-fleet', scene1Id: sceneIndex + 1, scene1Name: scene, scene2Id: sceneIndex + 101, scene2Name: task.path.split(' / ')[1] || scene, supplierId: sceneIndex + 201, supplierName: task.operator || '-', synced: (mockFleetSynced.get(projectId) || new Set()).has(task.id) }))))
      const filtered = source.filter((item) => (!query.scene1Id || item.scene1Id === query.scene1Id) && (!query.scene2Id || item.scene2Id === query.scene2Id) && (!query.supplierId || item.supplierId === query.supplierId) && (!query.keyword || item.filename.toLowerCase().includes(query.keyword.toLowerCase())))
      const start = (query.page - 1) * query.pageSize
      return clone({ items: filtered.slice(start, start + query.pageSize), total: filtered.length, page: query.page, pageSize: query.pageSize, pages: Math.max(1, Math.ceil(filtered.length / query.pageSize)) })
    }
    const params = new URLSearchParams({ page: String(query.page), page_size: String(query.pageSize) })
    if (query.scene1Id) params.set('scene1_id', String(query.scene1Id)); if (query.scene2Id) params.set('scene2_id', String(query.scene2Id)); if (query.supplierId) params.set('supplier_id', String(query.supplierId)); if (query.keyword) params.set('keyword', query.keyword)
    const result = await request<{ items: Array<Record<string, unknown>>; total: number; page: number; page_size: number; pages: number }>(`/api/projects/${encodeURIComponent(projectId)}/fleet/videos?${params}`)
    return { items: (result.items || []).map((item) => ({ fleetVideoId: num(item.fleet_video_id), filename: String(item.filename || ''), duration: item.duration == null ? null : num(item.duration), fileSize: item.file_size == null ? null : num(item.file_size), ossKey: String(item.oss_key || ''), ossBucket: String(item.oss_bucket || ''), scene1Id: num(item.scene1_id), scene1Name: String(item.scene1_name || ''), scene2Id: num(item.scene2_id), scene2Name: String(item.scene2_name || ''), supplierId: num(item.supplier_id), supplierName: String(item.supplier_name || ''), synced: item.synced === true })), total: result.total || 0, page: result.page || query.page, pageSize: result.page_size || query.pageSize, pages: result.pages || 1 }
  },
  async sync(projectId: string, target: { groups?: FleetVideoGroup[]; videoIds?: number[] }): Promise<FleetSyncResult> {
    if (runtimeConfig.apiMode === 'mock') {
      await delay()
      const synced = mockFleetSynced.get(projectId) || new Set<number>()
      let createdCount = 0
      ;(target.groups || []).forEach((group) => (mockFleetTasks[group.scene1Name] || []).forEach((task) => { if (!synced.has(task.id)) { synced.add(task.id); createdCount += task.videoCount } }))
      createdCount += target.videoIds?.length || 0
      mockFleetSynced.set(projectId, synced)
      projects = projects.map((project) => project.id === projectId ? { ...project, dataCount: project.dataCount + createdCount } : project)
      return clone({ createdCount, updatedCount: 0, skippedCount: 0, skipped: [] })
    }
    const body = target.videoIds?.length ? { video_ids: target.videoIds } : { groups: (target.groups || []).map((group) => ({ scene1_id: group.scene1Id, scene2_id: group.scene2Id, supplier_id: group.supplierId })) }
    const result = await request<{ created_count: number; updated_count: number; skipped_count: number; skipped: Array<Record<string, unknown>> }>(`/api/projects/${encodeURIComponent(projectId)}/fleet/videos/sync`, { method: 'POST', body: JSON.stringify(body) })
    return { createdCount: result.created_count || 0, updatedCount: result.updated_count || 0, skippedCount: result.skipped_count || 0, skipped: (result.skipped || []).map((item) => ({ fleetVideoId: num(item.fleet_video_id), filename: String(item.filename || ''), reason: String(item.reason || '') })) }
  },
}

function normalizeLibrary(item: Record<string, unknown>): LabelLibrary {
  const rawTags = itemsOf(item.tags || item.labels)
  return { id: String(item.id || item.labelLibraryId || ''), code: String(item.code || ''), name: String(item.name || ''), desc: String(item.description || item.desc || ''), enabled: item.enabled !== false && item.status !== 'disabled', createdAt: String(item.created_at || item.createdAt || ''), count: num(item.label_count ?? item.count ?? rawTags.length), tags: rawTags.map((tag) => ({ id: String(tag.id || ''), name: String(tag.name || ''), code: String(tag.code || ''), color: String(tag.color || '#2563EB'), appliesTo: (tag.applies_to || tag.appliesTo || 'goal') as LabelItem['appliesTo'], enabled: tag.enabled !== false, createdAt: String(tag.created_at || tag.createdAt || '') })) }
}

async function loadLibrary(item: Record<string, unknown>) {
  const id = String(item.id || '')
  const labels = await request<{ items: Array<Record<string, unknown>> }>(`/api/data/label-libraries/${encodeURIComponent(id)}/labels?page_size=100`)
  return normalizeLibrary({ ...item, labels })
}

export const labelApi = {
  async listSummaries(): Promise<LabelLibrary[]> {
    if (runtimeConfig.apiMode === 'mock') { await delay(); return clone(libraries.map((library) => ({ ...library, tags: [] }))) }
    const result = await request<{ items: Array<Record<string, unknown>> }>('/api/data/label-libraries')
    return result.items.map(normalizeLibrary)
  },
  async list(): Promise<LabelLibrary[]> {
    if (runtimeConfig.apiMode === 'mock') { await delay(); return clone(libraries) }
    const result = await request<{ items: Array<Record<string, unknown>> }>('/api/data/label-libraries')
    return Promise.all(result.items.map(loadLibrary))
  },
  async saveLibrary(payload: { id?: string; name: string; desc: string }): Promise<LabelLibrary[]> {
    if (runtimeConfig.apiMode === 'mock') {
      await delay()
      if (payload.id) libraries = libraries.map((item) => item.id === payload.id ? { ...item, ...payload } : item)
      else libraries = [{ id: String(Date.now()), code: `LIB-${Date.now().toString(36).toUpperCase()}`, enabled: true, createdAt: new Date().toISOString().replace('T', ' ').slice(0, 16), count: 0, tags: [], ...payload }, ...libraries]
      return clone(libraries)
    }
    await request(payload.id ? `/api/data/label-libraries/${encodeURIComponent(payload.id)}` : '/api/data/label-libraries', { method: payload.id ? 'PATCH' : 'POST', body: JSON.stringify({ name: payload.name, description: payload.desc, enabled: true }) })
    return this.list()
  },
  async deleteLibrary(id: string): Promise<LabelLibrary[]> {
    if (runtimeConfig.apiMode === 'mock') { await delay(); if (projects.some((item) => item.labelLibraryIds.includes(id))) throw new Error('该标签库已被项目作业配置引用，无法删除'); libraries = libraries.filter((item) => item.id !== id); return clone(libraries) }
    await request(`/api/data/label-libraries/${encodeURIComponent(id)}`, { method: 'DELETE' })
    return this.list()
  },
  async saveLabel(libraryId: string, payload: Partial<LabelItem> & Pick<LabelItem, 'name' | 'color' | 'appliesTo'>): Promise<LabelLibrary[]> {
    if (runtimeConfig.apiMode === 'mock') {
      await delay()
      libraries = libraries.map((library) => {
        if (library.id !== libraryId) return library
        const tags = payload.id ? library.tags.map((tag) => tag.id === payload.id ? { ...tag, ...payload } as LabelItem : tag) : [...library.tags, { id: String(Date.now()), code: `LBL-${Date.now().toString(36).toUpperCase()}`, enabled: true, createdAt: new Date().toISOString().replace('T', ' ').slice(0, 16), ...payload } as LabelItem]
        return { ...library, tags, count: tags.filter((tag) => tag.enabled).length }
      })
      return clone(libraries)
    }
    const path = payload.id ? `/api/data/label-libraries/${encodeURIComponent(libraryId)}/labels/${encodeURIComponent(payload.id)}` : `/api/data/label-libraries/${encodeURIComponent(libraryId)}/labels`
    await request(path, { method: payload.id ? 'PATCH' : 'POST', body: JSON.stringify({ name: payload.name, color: payload.color, applies_to: payload.appliesTo, sort_order: 0 }) })
    return this.list()
  },
  async deleteLabel(libraryId: string, labelId: string): Promise<LabelLibrary[]> {
    if (runtimeConfig.apiMode === 'mock') { await delay(); libraries = libraries.map((library) => library.id === libraryId ? { ...library, tags: library.tags.filter((tag) => tag.id !== labelId), count: Math.max(0, library.count - 1) } : library); return clone(libraries) }
    await request(`/api/data/label-libraries/${encodeURIComponent(libraryId)}/labels/${encodeURIComponent(labelId)}`, { method: 'DELETE' })
    return this.list()
  },
}

function normalizeOperationLibrary(item: Record<string, unknown>): OperationObjectLibrary {
  return { id: String(item.id || ''), name: String(item.name || ''), desc: String(item.description || ''), createdAt: String(item.created_at || '') }
}

function normalizeOperationObject(item: Record<string, unknown>): OperationObject {
  return { id: String(item.id || ''), libraryId: String(item.library_id || ''), name: String(item.name || ''), alias: String(item.alias || ''), attribute: String(item.attribute || ''), approved: item.approved === true, createdAt: String(item.created_at || '') }
}

export const operationObjectApi = {
  async listLibraries(query: { keyword?: string; page?: number; pageSize?: number } = {}): Promise<OperationObjectPage<OperationObjectLibrary>> {
    const page = query.page || 1; const pageSize = query.pageSize || 10
    if (runtimeConfig.apiMode === 'mock') { await delay(); const matched = operationLibraries.filter((item) => !query.keyword || `${item.name}${item.desc}`.includes(query.keyword)); return clone({ items: matched.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: matched.length }) }
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) }); if (query.keyword) params.set('keyword', query.keyword)
    const result = await request<{ items: Array<Record<string, unknown>>; page?: number; page_size?: number; total?: number }>(`/api/data/operation-libraries?${params}`)
    return { items: (result.items || []).map(normalizeOperationLibrary), page: result.page || page, pageSize: result.page_size || pageSize, total: result.total ?? result.items?.length ?? 0 }
  },
  async saveLibrary(payload: { id?: string; name: string; desc: string }) {
    if (runtimeConfig.apiMode === 'mock') { await delay(); operationLibraries = payload.id ? operationLibraries.map((item) => item.id === payload.id ? { ...item, name: payload.name, desc: payload.desc } : item) : [{ id: String(Date.now()), name: payload.name, desc: payload.desc, createdAt: new Date().toISOString() }, ...operationLibraries]; return }
    await request(payload.id ? `/api/data/operation-libraries/${encodeURIComponent(payload.id)}` : '/api/data/operation-libraries', { method: payload.id ? 'PATCH' : 'POST', body: JSON.stringify({ name: payload.name, description: payload.desc }) })
  },
  async deleteLibrary(id: string) {
    if (runtimeConfig.apiMode === 'mock') { await delay(); if (projects.some((item) => item.operationLibraryId === id)) throw new Error('对象库已被项目引用，不能删除'); operationLibraries = operationLibraries.filter((item) => item.id !== id); operationObjects = operationObjects.filter((item) => item.libraryId !== id); return }
    await request(`/api/data/operation-libraries/${encodeURIComponent(id)}`, { method: 'DELETE' })
  },
  async listObjects(libraryId: string, query: { keyword?: string; page?: number; pageSize?: number } = {}): Promise<OperationObjectPage<OperationObject>> {
    const page = query.page || 1; const pageSize = query.pageSize || 10
    if (runtimeConfig.apiMode === 'mock') { await delay(); const matched = operationObjects.filter((item) => item.libraryId === libraryId && (!query.keyword || `${item.id}${item.name}`.includes(query.keyword))); return clone({ items: matched.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: matched.length }) }
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) }); if (query.keyword) params.set('keyword', query.keyword)
    const result = await request<{ items: Array<Record<string, unknown>>; page?: number; page_size?: number; total?: number }>(`/api/data/operation-libraries/${encodeURIComponent(libraryId)}/objects?${params}`)
    return { items: (result.items || []).map(normalizeOperationObject), page: result.page || page, pageSize: result.page_size || pageSize, total: result.total ?? result.items?.length ?? 0 }
  },
  async saveObject(libraryId: string, payload: { id?: string; name: string; alias: string; attribute: string; approved: boolean }) {
    if (runtimeConfig.apiMode === 'mock') { await delay(); operationObjects = payload.id ? operationObjects.map((item) => item.id === payload.id ? { ...item, ...payload } : item) : [...operationObjects, { ...payload, id: String(Date.now()), libraryId, createdAt: new Date().toISOString() }]; return }
    const path = payload.id ? `/api/data/operation-libraries/${encodeURIComponent(libraryId)}/objects/${encodeURIComponent(payload.id)}` : `/api/data/operation-libraries/${encodeURIComponent(libraryId)}/objects`
    await request(path, { method: payload.id ? 'PATCH' : 'POST', body: JSON.stringify({ name: payload.name, alias: payload.alias, attribute: payload.attribute, approved: payload.approved }) })
  },
  async deleteObject(libraryId: string, objectId: string) {
    if (runtimeConfig.apiMode === 'mock') { await delay(); operationObjects = operationObjects.filter((item) => item.id !== objectId); return }
    await request(`/api/data/operation-libraries/${encodeURIComponent(libraryId)}/objects/${encodeURIComponent(objectId)}`, { method: 'DELETE' })
  },
  async listApprovedObjects(): Promise<Array<OperationObject & { libraryName: string }>> {
    const librariesPage = await this.listLibraries({ pageSize: 100 })
    const groups = await Promise.all(librariesPage.items.map(async (library) => ({ library, page: await this.listObjects(library.id, { pageSize: 100 }) })))
    return groups.flatMap(({ library, page }) => page.items.filter((item) => item.approved).map((item) => ({ ...item, libraryName: library.name })))
  },
}

export const teamApi = {
  async getData(includeProjects = true): Promise<TeamMembersData> {
    if (runtimeConfig.apiMode === 'mock') { await delay(); return clone({ teams, members, projects: mockProjectDistribution }) }
    const [rawTeams, rawMembers, rawProjects] = await Promise.all([
      request<{ items: Array<Record<string, unknown>> }>('/api/auth/teams?page_size=100'),
      request<{ items: Array<Record<string, unknown>> }>('/api/auth/members?page_size=100'),
      includeProjects ? request<{ items: Array<Record<string, unknown>> }>('/api/projects/?page_size=100') : Promise.resolve({ items: [] }),
    ])
    const normalizedTeams: Team[] = rawTeams.items.map((item) => ({ id: String(item.id), name: String(item.name || ''), desc: String(item.description || ''), enabled: item.status !== 'disabled', memberCount: num(item.member_count) }))
    const normalizedMembers: Member[] = rawMembers.items.map((item) => { const team = record(item.team); return { accountId: String(item.id), account: String(item.username || ''), name: String(item.display_name || item.username || ''), email: String(item.email || ''), team: String(team.name || ''), teamId: String(team.id || ''), roles: itemsOf(item.roles).map((role) => String(role.name || role.code || '')), projects: [], enabled: item.is_active_member !== false, joinedAt: String(item.created_at || '') } })
    const normalizedProjects = rawProjects.items.map(normalizeProject).map((project) => {
      const scoped = normalizedMembers.filter((member) => (project.teamIds || []).includes(member.teamId || '')); const count = (name: string) => scoped.filter((member) => member.roles.includes(name)).length
      return { projectId: project.id, projectName: project.name, memberCount: scoped.length, managerCount: count('项目经理'), annotatorCount: count('标注员'), reviewerCount: count('质检员'), qualityCount: count('审核员'), acceptorCount: count('验收员'), teams: project.teams }
    })
    return { teams: normalizedTeams, members: normalizedMembers, projects: normalizedProjects }
  },
  async saveTeam(payload: Partial<Team> & Pick<Team, 'name' | 'desc'>): Promise<TeamMembersData> {
    if (runtimeConfig.apiMode === 'mock') { await delay(); if (payload.id) teams = teams.map((item) => item.id === payload.id ? { ...item, ...payload } : item); else teams = [...teams, { id: String(Date.now()), enabled: true, memberCount: 0, ...payload } as Team]; return clone({ teams, members, projects: mockProjectDistribution }) }
    const body = payload.id
      ? { name: payload.name, description: payload.desc }
      : { name: payload.name, description: payload.desc, status: payload.enabled === false ? 'disabled' : 'enabled' }
    await request(payload.id ? `/api/auth/teams/${encodeURIComponent(payload.id)}` : '/api/auth/teams', { method: payload.id ? 'PATCH' : 'POST', body: JSON.stringify(body) })
    return this.getData()
  },
  async setTeamStatus(teamId: string, enabled: boolean): Promise<TeamMembersData> {
    if (runtimeConfig.apiMode === 'mock') { await delay(); teams = teams.map((item) => item.id === teamId ? { ...item, enabled } : item); return clone({ teams, members, projects: mockProjectDistribution }) }
    await request(`/api/auth/teams/${encodeURIComponent(teamId)}/${enabled ? 'enable' : 'disable'}`, { method: 'POST', body: '{}' })
    return this.getData()
  },
  async deleteTeam(teamId: string): Promise<TeamMembersData> {
    if (runtimeConfig.apiMode === 'mock') { await delay(); teams = teams.filter((item) => item.id !== teamId); members = members.map((item) => item.teamId === teamId ? { ...item, team: '', teamId: '' } : item); return clone({ teams, members, projects: mockProjectDistribution }) }
    await request(`/api/auth/teams/${encodeURIComponent(teamId)}`, { method: 'DELETE' })
    return this.getData()
  },
  async saveMember(payload: Partial<Member> & Pick<Member, 'name' | 'account' | 'email' | 'team' | 'roles'> & { password?: string }): Promise<TeamMembersData> {
    if (!payload.accountId && (payload.password?.length || 0) < 8) throw new Error('初始密码至少 8 位')
    if (runtimeConfig.apiMode === 'mock') { await delay(); if (members.some((item) => item.account === payload.account && item.accountId !== payload.accountId)) throw new Error('登录账号已存在'); if (payload.accountId) members = members.map((item) => item.accountId === payload.accountId ? { ...item, ...payload } as Member : item); else members = [...members, { accountId: String(Date.now()), projects: [], enabled: true, joinedAt: new Date().toISOString().slice(0, 10), ...payload } as Member]; return clone({ teams, members, projects: mockProjectDistribution }) }
    const rolesResult = await request<{ items: Array<Record<string, unknown>> }>('/api/auth/roles')
    const roleIds = rolesResult.items.filter((role) => payload.roles.includes(String(role.name || role.code))).map((role) => Number(role.id))
    if (payload.accountId) {
      await request(`/api/auth/members/${encodeURIComponent(payload.accountId)}`, { method: 'PATCH', body: JSON.stringify({ display_name: payload.name, email: payload.email, role_ids: roleIds, is_active_member: payload.enabled !== false }) })
      const current = (await this.getData()).members.find((member) => member.accountId === payload.accountId)
      if (current && current.teamId !== payload.team) await request(`/api/auth/members/${encodeURIComponent(payload.accountId)}/move`, { method: 'POST', body: JSON.stringify({ team_id: Number(payload.team) }) })
    } else {
      await request(`/api/auth/teams/${encodeURIComponent(payload.team)}/members`, { method: 'POST', body: JSON.stringify({ username: payload.account, password: payload.password, display_name: payload.name, email: payload.email, role_ids: roleIds, is_active_member: true }) })
    }
    return this.getData()
  },
  async setMemberStatus(accountId: string, enabled: boolean): Promise<TeamMembersData> {
    if (runtimeConfig.apiMode === 'mock') { await delay(); members = members.map((item) => item.accountId === accountId ? { ...item, enabled } : item); return clone({ teams, members, projects: mockProjectDistribution }) }
    await request(`/api/auth/members/${encodeURIComponent(accountId)}`, { method: 'PATCH', body: JSON.stringify({ is_active_member: enabled }) })
    return this.getData()
  },
  async setMemberPassword(accountId: string, password: string) {
    if (password.length < 8) throw new Error('新密码至少 8 位')
    if (runtimeConfig.apiMode === 'mock') { await delay(); return }
    await request(`/api/auth/members/${encodeURIComponent(accountId)}/password`, { method: 'POST', body: JSON.stringify({ password }) })
  },
  async deleteMember(accountId: string): Promise<TeamMembersData> {
    if (runtimeConfig.apiMode === 'mock') { await delay(); members = members.filter((item) => item.accountId !== accountId); return clone({ teams, members, projects: mockProjectDistribution }) }
    await request(`/api/auth/members/${encodeURIComponent(accountId)}`, { method: 'DELETE' })
    return this.getData()
  },
}
