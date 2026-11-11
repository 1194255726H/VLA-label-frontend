import { runtimeConfig } from '../config/runtime'
import { mockLabelLibraries, mockMembers, mockTeams } from '../mocks/data'
import type { Product, ProductAssociation, ProductPayload, ProductQuery, ProductStatus } from '../types/api'
import { request } from './api'
import { projectApi } from './managementApi'

function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' ? value as Record<string, unknown> : {} }
function number(value: unknown) { const result = Number(value); return Number.isFinite(result) ? result : 0 }
function associations(value: unknown): ProductAssociation[] {
  return Array.isArray(value) ? value.map((item) => { const data = record(item); return { id: String(data.id), name: String(data.name || ''), status: data.status == null ? undefined : String(data.status) } }) : []
}
export function normalizeProduct(value: unknown): Product {
  const data = record(value)
  const owner = record(data.owner)
  return {
    id: String(data.id), name: String(data.name || ''), description: String(data.description || ''), status: data.status as ProductStatus,
    ownerId: String(owner.id ?? data.owner_id ?? ''), ownerName: String(owner.display_name || owner.username || ''),
    teams: associations(data.teams), labelLibraries: associations(data.label_libraries), operationLibraries: associations(data.operation_libraries), deliveryAt: String(data.delivery_at || ''),
    annotatorCount: number(data.annotator_count), datasetCount: number(data.dataset_count), videoCount: number(data.video_count), pendingAnnotationCount: number(data.pending_annotation_count),
    duration: number(data.duration), effectiveDurationMs: number(data.effective_duration_ms), invalidDurationMs: number(data.invalid_duration_ms), unprocessedDurationMs: number(data.unprocessed_duration_ms),
    atomicTaskCount: number(data.atomic_task_count), atomicActionCount: number(data.atomic_action_count), progressPercent: number(data.progress_percent), createdAt: String(data.created_at || ''),
  }
}
export const productStatusLabels: Record<ProductStatus, string> = { not_started: '未启动', running: '进行中', paused: '已暂停', finished: '已结束' }
export const productTransitions: Record<ProductStatus, ProductStatus[]> = { not_started: ['running', 'paused'], running: ['paused', 'finished'], paused: ['running', 'finished'], finished: [] }
let mockProducts: Product[] = [normalizeProduct({ id: 1, name: '示例生产项目', description: '生产项目下管理多个数据集', status: 'running', delivery_at: '2099-12-31',
  owner: { id: mockMembers.find((member) => member.roles.includes('项目经理'))?.accountId, display_name: '项目经理' },
  teams: mockTeams.map((team) => ({ id: team.id, name: team.name, status: team.enabled ? 'enabled' : 'disabled' })),
  label_libraries: mockLabelLibraries.map((library) => ({ id: library.id, name: library.name, status: library.enabled ? 'enabled' : 'disabled' })), operation_libraries: [{ id: 1, name: '常用操作对象库' }],
})]
const clone = <T,>(value: T): T => structuredClone(value)
async function mockStats(product: Product) {
  const datasets = await projectApi.list(product.id)
  const sum = (fn: (item: typeof datasets[number]) => number) => datasets.reduce((total, item) => total + fn(item), 0)
  return { ...clone(product), datasetCount: datasets.length, videoCount: sum((item) => item.dataCount), duration: sum((item) => item.duration || item.selectedDuration + item.unselectedDuration), effectiveDurationMs: sum((item) => item.validDuration * 1000), invalidDurationMs: sum((item) => item.invalidDuration * 1000), atomicTaskCount: sum((item) => item.goalCount), atomicActionCount: sum((item) => item.actionCount) }
}
function validate(payload: ProductPayload) {
  if (!payload.name.trim() || !payload.ownerId || !payload.deliveryAt || !payload.teamIds.length || !payload.operationLibraryIds.length) throw new Error('请填写名称、负责人、交付时间，并选择团队和操作对象库')
}
export const productApi = {
  async list(query: ProductQuery): Promise<{ items: Product[]; total: number; pages: number }> {
    if (runtimeConfig.apiMode === 'mock') {
      const filtered = mockProducts.filter((item) => (!query.name || item.name.includes(query.name)) && (!query.status || item.status === query.status) && (!query.teamId || item.teams.some((team) => team.id === query.teamId)) && (!query.ownerId || item.ownerId === query.ownerId))
      return { items: await Promise.all(filtered.slice((query.page - 1) * query.pageSize, query.page * query.pageSize).map(mockStats)), total: filtered.length, pages: Math.max(1, Math.ceil(filtered.length / query.pageSize)) }
    }
    const params = new URLSearchParams({ page: String(query.page), page_size: String(query.pageSize) })
    if (query.name) params.set('name', query.name)
    if (query.status) params.set('status', query.status)
    if (query.teamId) params.set('team_id', query.teamId)
    if (query.ownerId) params.set('owner_id', query.ownerId)
    const result = await request<{ items: unknown[]; total: number; pages?: number }>(`/api/products/?${params}`)
    return { items: result.items.map(normalizeProduct), total: result.total, pages: result.pages || Math.max(1, Math.ceil(result.total / query.pageSize)) }
  },
  async detail(id: string): Promise<Product> {
    if (runtimeConfig.apiMode === 'mock') { const item = mockProducts.find((product) => product.id === id); if (!item) throw new Error('生产项目不存在'); return mockStats(item) }
    return normalizeProduct(await request(`/api/products/${encodeURIComponent(id)}`))
  },
  async save(payload: ProductPayload, id?: string) {
    validate(payload)
    if (runtimeConfig.apiMode === 'mock') {
      if (mockProducts.some((item) => item.id !== id && item.name === payload.name.trim())) throw new Error('生产项目名称已存在')
      const existing = id ? await this.detail(id) : undefined
      if (existing?.status === 'finished') throw new Error('已结束生产项目只读')
      if (existing && ['running', 'paused'].includes(existing.status) && [
        [existing.teams, payload.teamIds], [existing.labelLibraries, payload.labelLibraryIds], [existing.operationLibraries, payload.operationLibraryIds],
      ].some(([old, ids]) => (old as ProductAssociation[]).some((item) => !(ids as string[]).includes(item.id)))) throw new Error('进行中或暂停的生产项目只能新增关联，不能移除')
      const raw = { id: id || String(Date.now()), name: payload.name.trim(), description: payload.description, delivery_at: payload.deliveryAt, status: existing?.status || 'not_started', owner: { id: payload.ownerId, display_name: mockMembers.find((member) => member.accountId === payload.ownerId)?.name }, teams: payload.teamIds.map((teamId) => ({ id: teamId, name: mockTeams.find((team) => team.id === teamId)?.name })), label_libraries: payload.labelLibraryIds.map((libraryId) => ({ id: libraryId, name: mockLabelLibraries.find((library) => library.id === libraryId)?.name })), operation_libraries: payload.operationLibraryIds.map((libraryId) => ({ id: libraryId, name: '常用操作对象库' })) }
      const next = normalizeProduct(raw)
      mockProducts = existing ? mockProducts.map((item) => item.id === id ? next : item) : [next, ...mockProducts]
      return
    }
    const body = { name: payload.name.trim(), description: payload.description, delivery_at: payload.deliveryAt, owner_id: Number(payload.ownerId), team_ids: payload.teamIds.map(Number), label_library_ids: payload.labelLibraryIds.map(Number), operation_library_ids: payload.operationLibraryIds.map(Number) }
    await request(id ? `/api/products/${encodeURIComponent(id)}` : '/api/products/', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(body) })
  },
  async setStatus(id: string, status: ProductStatus) {
    if (runtimeConfig.apiMode === 'mock') { const item = await this.detail(id); if (!productTransitions[item.status].includes(status)) throw new Error('不允许的状态流转'); mockProducts = mockProducts.map((product) => product.id === id ? { ...product, status } : product); return }
    await request(`/api/products/${encodeURIComponent(id)}/status`, { method: 'POST', body: JSON.stringify({ status }) })
  },
  async delete(id: string) {
    if (runtimeConfig.apiMode === 'mock') {
      const datasets = await projectApi.list(id)
      if (datasets.some((item) => item.dataCount > 0)) throw new Error('生产项目下存在视频，不能删除')
      for (const dataset of datasets) await projectApi.delete(dataset.id, id)
      mockProducts = mockProducts.filter((item) => item.id !== id)
      return
    }
    await request(`/api/products/${encodeURIComponent(id)}`, { method: 'DELETE' })
  },
}
