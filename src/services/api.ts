import { runtimeConfig } from '../config/runtime'
import { mockClaimPool, mockProjects, mockTasks, mockUser } from '../mocks/data'
import type {
  PasswordResetChallenge,
  Project,
  SessionResponse,
  SmsChallenge,
  TaskNode,
  TaskQuery,
  VideoListItem,
  WorkbenchSnapshot,
  WorkbenchTask,
} from '../types/api'

const SESSION_KEY = 'ilabel.session'
let mutableTasks = mockTasks.map((item) => ({ ...item }))
const mutablePool = mockClaimPool.map((item) => ({ ...item }))
let pendingWorkbenchProjects: Promise<{ items: Array<Record<string, unknown>> }> | undefined

function sleep() {
  return new Promise((resolve) => window.setTimeout(resolve, runtimeConfig.mockDelay))
}

async function loadWorkbenchProjects() {
  if (pendingWorkbenchProjects) return pendingWorkbenchProjects
  const requestPromise = request<{ items: Array<Record<string, unknown>> }>('/api/projects/?page_size=100')
  pendingWorkbenchProjects = requestPromise
  try {
    return await requestPromise
  } finally {
    if (pendingWorkbenchProjects === requestPromise) pendingWorkbenchProjects = undefined
  }
}

function getCsrfToken() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) || '{}').csrfToken || ''
  } catch {
    return ''
  }
}

function collectErrorMessages(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() ? [value.trim()] : []
  if (Array.isArray(value)) return value.flatMap(collectErrorMessages)
  if (value && typeof value === 'object') return Object.values(value as Record<string, unknown>).flatMap(collectErrorMessages)
  return []
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  headers.set('Accept', 'application/json')
  if (init?.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  const csrfToken = getCsrfToken()
  if (csrfToken) headers.set('X-CSRF-Token', csrfToken)
  const response = await fetch(`${runtimeConfig.apiBaseUrl}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  })
  const payload = await response.json().catch(() => ({}))
  const businessFailed = payload?.success === false || (typeof payload?.code === 'string' && payload.code !== 'ok')
  if (!response.ok || businessFailed) {
    const validationMessages = collectErrorMessages(payload?.errors)
    const error = new Error(validationMessages.length ? validationMessages.join('；') : payload?.message || `请求失败（${response.status}）`) as Error & { code?: string; status?: number }
    error.code = payload?.code
    error.status = response.status
    throw error
  }
  return (payload?.success === true || payload?.code === 'ok' ? payload.data : payload) as T
}

function normalizeUser(payload: Record<string, unknown>): SessionResponse {
  const raw = (payload.account || payload) as Record<string, unknown>
  const booleanValue = (...values: unknown[]) => values.some((value) => value === true || value === 1 || value === '1' || value === 'true')
  const account = {
    id: String(raw.id || raw.userCode || ''),
    account: String(raw.account || raw.username || ''),
    name: String(raw.name || raw.display_name || raw.displayName || raw.account || raw.username || ''),
    avatar: raw.avatar ? String(raw.avatar) : undefined,
    roles: Array.isArray(raw.roles) ? raw.roles.map((role) => String((role as Record<string, unknown>).code || role)) : Array.isArray(raw.roleIds) ? raw.roleIds.map(String) : [],
    roleLabels: Array.isArray(raw.roles) ? raw.roles.map((role) => String((role as Record<string, unknown>).name || role)) : Array.isArray(raw.roleLabels) ? raw.roleLabels.map(String) : [],
    isStaff: booleanValue(raw.is_staff, raw.isStaff, payload.is_staff, payload.isStaff),
    isSuperuser: booleanValue(raw.is_superuser, raw.isSuperuser, payload.is_superuser, payload.isSuperuser),
    defaultRoute: '/workbench',
  }
  return { account, csrfToken: String(payload.csrfToken || ''), defaultRoute: '/workbench' }
}

function saveSession(session: SessionResponse) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export const authApi = {
  async login(username: string, password: string): Promise<SessionResponse> {
    if (runtimeConfig.apiMode === 'mock') {
      await sleep()
      if (!username.trim() || !password.trim()) throw new Error('请输入登录账号和密码')
      const session = { account: { ...mockUser, account: username.trim() }, csrfToken: 'mock-csrf-token', defaultRoute: '/workbench' }
      saveSession(session)
      return session
    }
    const payload = await request<Record<string, unknown>>('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) })
    const session = normalizeUser(payload)
    saveSession(session)
    return session
  },
  async requestSmsCode(phone: string): Promise<SmsChallenge> {
    if (runtimeConfig.apiMode === 'mock') {
      await sleep()
      return { challengeId: `mock-${phone}`, expiresIn: 300 }
    }
    void phone
    throw new Error('当前后端 API 尚未提供短信登录')
  },
  async smsLogin(phone: string, code: string, challengeId: string): Promise<SessionResponse> {
    if (runtimeConfig.apiMode === 'mock') {
      await sleep()
      if (code.length !== 6) throw new Error('请输入 6 位验证码')
      const session = { account: { ...mockUser }, csrfToken: 'mock-csrf-token', defaultRoute: '/workbench' }
      saveSession(session)
      return session
    }
    void phone; void code; void challengeId
    throw new Error('当前后端 API 尚未提供短信登录')
  },
  async requestPasswordReset(account: string): Promise<PasswordResetChallenge> {
    if (runtimeConfig.apiMode === 'mock') {
      await sleep()
      return { resetToken: `reset-${account}`, maskedPhone: '188****0003' }
    }
    void account
    throw new Error('当前后端 API 尚未提供密码找回')
  },
  async confirmPasswordReset(payload: { resetToken: string; code: string; newPassword: string }) {
    if (runtimeConfig.apiMode === 'mock') return sleep()
    void payload
    throw new Error('当前后端 API 尚未提供密码找回')
  },
  async logout() {
    if (runtimeConfig.apiMode === 'real') await request('/api/auth/logout', { method: 'POST', body: '{}' }).catch(() => undefined)
    sessionStorage.removeItem(SESSION_KEY)
  },
  getStoredSession(): SessionResponse | null {
    try {
      return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null')
    } catch {
      return null
    }
  },
  async restoreSession(): Promise<SessionResponse | null> {
    try {
      const payload = await request<Record<string, unknown>>('/api/auth/me')
      const session = normalizeUser(payload)
      saveSession(session)
      return session
    } catch {
      sessionStorage.removeItem(SESSION_KEY)
      return null
    }
  },
}

function filteredMockTasks(query: TaskQuery) {
  return mutableTasks.filter((task) => {
    const matchesTab = query.tab === 'submitted' ? ['submitted', 'completed'].includes(task.status) : ['pending', 'processing'].includes(task.status)
    return matchesTab
  })
}

function numberValue(...values: unknown[]) {
  const match = values.find((value) => value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value)))
  return match === undefined ? 0 : Number(match)
}

function normalizeTask(item: Record<string, unknown>): WorkbenchTask {
  const summary = (item.vlaSummary || {}) as Record<string, unknown>
  const videoMeta = (item.video_meta || {}) as Record<string, unknown>
  const wireNode = String(item.current_node || item.node || item.currentNodeKey || 'annotation')
  const nodeByLabel: Record<string, WorkbenchTask['node']> = { '标注': 'annotation', '质检': 'review', '审核': 'quality', '验收': 'acceptance', quality_check: 'review', review: 'quality' }
  const wireStatus = String(item.taskStatusKey || item.status || 'pending')
  const statusByLabel: Record<string, WorkbenchTask['status']> = { '待处理': 'pending', '处理中': 'processing', '已提交': 'submitted', '已完成': 'completed', assigned: 'pending', claimed: 'pending', in_progress: 'processing' }
  const assignee = (item.current_assignee || item.assignee || {}) as Record<string, unknown>
  return {
    id: String(item.id || item.taskId || item.taskCode || ''),
    dataId: String(item.external_task_id || item.dataId || item.dataCode || item.id || ''),
    dataName: String(item.title || item.dataName || item.fileName || item.taskName || item.external_task_id || ''),
    node: nodeByLabel[wireNode] || wireNode as WorkbenchTask['node'],
    workType: ['returned', '退回', '退回返修'].includes(String(item.workType || item.status)) ? 'returned' : 'normal',
    status: statusByLabel[wireStatus] || wireStatus as WorkbenchTask['status'],
    totalDuration: numberValue(item.total_duration_ms, videoMeta.duration_ms, item.totalDuration, numberValue(item.durationMs)) / 1000,
    selectedDuration: numberValue(item.selected_duration_ms, item.selectedDuration, numberValue(summary.selectedDurationSeconds) * 1000) / 1000,
    validDuration: numberValue(item.effective_duration_ms, item.validDuration, numberValue(summary.validDurationSeconds) * 1000) / 1000,
    invalidDuration: numberValue(item.invalid_duration_ms, item.invalidDuration, numberValue(summary.invalidDurationSeconds) * 1000) / 1000,
    unselectedDuration: numberValue(item.unselected_duration_ms, item.unselectedDuration, numberValue(summary.unselectedDurationSeconds) * 1000) / 1000,
    goalCount: numberValue(item.atomic_task_count, item.goalCount, summary.timelineTaskCount),
    actionCount: numberValue(item.atomic_action_count, item.actionCount, summary.smallGoalCount),
    startedAt: String(item.claimed_at || item.startedAt || item.startTime || '-'),
    updatedAt: String(item.updated_at || item.updatedAt || item.updateTime || '-'),
    submittedAt: item.submitted_at || item.submittedAt || item.submitTime ? String(item.submitted_at || item.submittedAt || item.submitTime) : undefined,
    durationText: String(item.durationText || item.duration || '-'),
    assignee: String(assignee.display_name || assignee.username || item.handlerName || ''),
  }
}

function normalizeNode(value: unknown): TaskNode {
  const wireNode = String(value || 'annotation')
  const nodeMap: Record<string, TaskNode> = { '标注': 'annotation', '质检': 'review', '审核': 'quality', '验收': 'acceptance', quality_check: 'review', review: 'quality' }
  return nodeMap[wireNode] || wireNode as TaskNode
}

function optionalString(value: unknown) {
  return value === null || value === undefined || value === '' ? undefined : String(value)
}

function normalizeVideo(item: Record<string, unknown>): VideoListItem {
  return {
    id: String(item.id || ''),
    projectId: String(item.project_id || ''),
    projectName: String(item.project_name || ''),
    taskId: String(item.task_id || ''),
    taskExternalTaskId: String(item.task_external_task_id || ''),
    taskTitle: String(item.task_title || ''),
    taskStatus: String(item.task_status || ''),
    taskCurrentNode: normalizeNode(item.task_current_node),
    taskCurrentAssigneeId: optionalString(item.task_current_assignee_id),
    taskCurrentAssigneeName: optionalString(item.task_current_assignee_name),
    currentNode: normalizeNode(item.current_node),
    currentAssigneeId: optionalString(item.current_assignee_id || item.video_current_assignee_id),
    currentAssigneeName: optionalString(item.current_assignee_name || item.video_current_assignee_name),
    videoStatus: String(item.status || item.video_status || 'pending'),
    assignmentSource: String(item.assignment_source || ''),
    sortOrder: numberValue(item.sort_order, item.video_index),
    videoIndex: numberValue(item.video_index, item.sort_order),
    externalVideoId: optionalString(item.external_video_id || item.video_id),
    videoId: optionalString(item.video_id || item.external_video_id),
    filename: String(item.filename || item.external_video_id || item.video_id || item.uri || `视频 ${item.id || ''}`),
    uri: String(item.uri || item.preview_url || ''),
    sourceUri: String(item.source_uri || ''),
    previewUrl: String(item.preview_url || item.uri || ''),
    ossBucket: String(item.oss_bucket || ''),
    ossKey: String(item.oss_key || ''),
    duration: numberValue(item.duration),
    fileSize: numberValue(item.file_size),
    storageStatus: String(item.storage_status || 'unchecked') as VideoListItem['storageStatus'],
    storageError: optionalString(item.storage_error),
    storageCheckedAt: optionalString(item.storage_checked_at),
    videoMeta: item.video_meta && typeof item.video_meta === 'object' ? item.video_meta as Record<string, unknown> : {},
    createdAt: String(item.created_at || ''),
    updatedAt: String(item.updated_at || ''),
    submittedNode: optionalString(item.submitted_node),
    submittedById: optionalString(item.submitted_by_id),
    submittedAt: optionalString(item.submitted_at),
    submittedDecision: optionalString(item.submitted_decision),
  }
}

function mockVideo(task: WorkbenchTask, index: number): VideoListItem {
  return normalizeVideo({
    id: `video-${index + 1}`,
    project_id: '1',
    project_name: mockProjects[0].name,
    task_id: task.id,
    task_external_task_id: task.dataId,
    task_title: task.dataName,
    task_status: task.status,
    task_current_node: task.node,
    current_node: task.node,
    current_assignee_id: mockUser.id,
    video_status: task.status === 'processing' ? 'in_progress' : task.status === 'pending' ? 'assigned' : task.status,
    video_index: 0,
    video_id: task.dataId,
    filename: `${task.dataName}.mp4`,
    uri: '/temp.mp4',
    duration: task.totalDuration,
    storage_status: 'available',
    updated_at: task.updatedAt,
    submitted_at: task.submittedAt,
  })
}

export const workbenchApi = {
  async getSnapshot(query: TaskQuery): Promise<WorkbenchSnapshot> {
    if (runtimeConfig.apiMode === 'mock') {
      await sleep()
      const all = filteredMockTasks(query)
      const pageNo = query.pageNo || 1
      const pageSize = query.pageSize || 10
      return {
        projects: mockProjects.map((item) => ({ ...item })),
        currentProjectId: query.projectId || mockProjects[0].id,
        recommendedTask: query.tab === 'pending' ? all.map(mockVideo)[0] || null : null,
        tasks: { items: all.map(mockVideo).slice((pageNo - 1) * pageSize, pageNo * pageSize), page: { pageNo, pageSize, total: all.length }, pages: Math.max(1, Math.ceil(all.length / pageSize)), viewMode: 'personal', selfClaimEnabled: true },
        claimPool: mutablePool.map((item) => ({ ...item })),
        summary: { todayObjects: 3008, validDuration: 972, goalCount: 68, actionCount: 214 },
      }
    }
    const projects = await loadWorkbenchProjects()
    const effectiveProjectId = query.projectId || String(projects.items[0]?.id || '')
    const pageNo = query.pageNo || 1; const pageSize = query.pageSize || 10
    const params = new URLSearchParams({ operator_id: query.operatorId, tab: query.tab, page: String(pageNo), page_size: String(pageSize) })
    const rawVideos = effectiveProjectId
      ? await request<{ items: Array<Record<string, unknown>>; total: number; page: number; page_size: number; pages: number }>(`/api/projects/${encodeURIComponent(effectiveProjectId)}/workbench/videos?${params}`)
      : { items: [], total: 0, page: pageNo, page_size: pageSize, pages: 0 }
    const videoItems = rawVideos.items.map(normalizeVideo)
    const tasks: WorkbenchSnapshot['tasks'] = { items: videoItems, page: { pageNo: rawVideos.page || pageNo, pageSize: rawVideos.page_size || pageSize, total: rawVideos.total || 0 }, pages: rawVideos.pages || 1, viewMode: 'personal', selfClaimEnabled: true }
    return {
      projects: projects.items.map((item) => { const config = (item.work_config || {}) as Record<string, unknown>; return { id: String(item.id), code: String(item.code || item.external_project_id || ''), name: String(item.name || ''), batchName: String(item.description || ''), status: String(item.status || 'running').replace('_', '-') as Project['status'], pendingCount: String(item.id) === effectiveProjectId && query.tab === 'pending' ? rawVideos.total : 0, claimLimit: numberValue(config.active_task_limit) || 10 } }),
      currentProjectId: effectiveProjectId,
      recommendedTask: query.tab === 'pending' ? videoItems[0] || null : null,
      tasks,
      claimPool: [],
      summary: { todayObjects: 0, validDuration: 0, goalCount: 0, actionCount: 0 },
    }
  },
  async claim(projectId: string, node: string): Promise<WorkbenchTask> {
    if (runtimeConfig.apiMode === 'mock') {
      await sleep()
      const pool = mutablePool.find((item) => item.node === node)
      if (!pool || pool.count < 1) throw new Error('当前没有可领取任务')
      pool.count -= 1
      const claimed = { ...mockTasks[1], id: `TASK-MOCK-${Date.now()}`, node: node as WorkbenchTask['node'], status: 'pending' as const }
      mutableTasks = [claimed, ...mutableTasks]
      return claimed
    }
    const pool = await request<{ items: Array<Record<string, unknown>> }>('/api/tasks/pool?page_size=100')
    const candidate = pool.items.find((item) => String(item.project_id || (item.project as Record<string, unknown> | undefined)?.id || '') === projectId && normalizeTask(item).node === node)
    if (!candidate) throw new Error('当前没有可领取任务')
    const claimed = await request<Record<string, unknown>>(`/api/tasks/${encodeURIComponent(String(candidate.id))}/claim`, { method: 'POST', body: '{}' })
    return normalizeTask((claimed.task || claimed) as Record<string, unknown>)
  },
}
