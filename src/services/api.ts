import { runtimeConfig } from '../config/runtime'
import { mockClaimPool, mockProjects, mockTasks, mockUser } from '../mocks/data'
import type {
  PasswordResetChallenge,
  ClaimPoolItem,
  Project,
  SessionResponse,
  SmsChallenge,
  TaskNode,
  TaskQuery,
  WorkbenchSnapshot,
  WorkbenchTask,
} from '../types/api'

const SESSION_KEY = 'ilabel.session'
const nodeLabelsForApi: Record<TaskNode, string> = { annotation: '标注', review: '质检', quality: '审核', acceptance: '验收' }
let mutableTasks = mockTasks.map((item) => ({ ...item }))
const mutablePool = mockClaimPool.map((item) => ({ ...item }))

function sleep() {
  return new Promise((resolve) => window.setTimeout(resolve, runtimeConfig.mockDelay))
}

function getCsrfToken() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) || '{}').csrfToken || ''
  } catch {
    return ''
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  headers.set('Accept', 'application/json')
  if (init?.body) headers.set('Content-Type', 'application/json')
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
    const error = new Error(payload?.message || `请求失败（${response.status}）`) as Error & { code?: string; status?: number }
    error.code = payload?.code
    error.status = response.status
    throw error
  }
  return (payload?.success === true || payload?.code === 'ok' ? payload.data : payload) as T
}

function normalizeUser(payload: Record<string, unknown>): SessionResponse {
  const raw = (payload.account || payload) as Record<string, unknown>
  const account = {
    id: String(raw.id || raw.userCode || ''),
    account: String(raw.account || raw.username || ''),
    name: String(raw.name || raw.display_name || raw.displayName || raw.account || raw.username || ''),
    avatar: raw.avatar ? String(raw.avatar) : undefined,
    roles: Array.isArray(raw.roles) ? raw.roles.map((role) => String((role as Record<string, unknown>).code || role)) : Array.isArray(raw.roleIds) ? raw.roleIds.map(String) : [],
    roleLabels: Array.isArray(raw.roles) ? raw.roles.map((role) => String((role as Record<string, unknown>).name || role)) : Array.isArray(raw.roleLabels) ? raw.roleLabels.map(String) : [],
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
    const matchesKeyword = !query.keyword || `${task.dataName}${task.dataId}`.toLowerCase().includes(query.keyword.toLowerCase())
    return matchesTab && matchesKeyword && (!query.node || task.node === query.node)
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
        recommendedTask: mutableTasks.find((task) => ['pending', 'processing'].includes(task.status)) || null,
        tasks: { items: all.slice((pageNo - 1) * pageSize, pageNo * pageSize), page: { pageNo, pageSize, total: all.length }, viewMode: 'personal', selfClaimEnabled: true },
        claimPool: mutablePool.map((item) => ({ ...item })),
        summary: { todayObjects: 3008, validDuration: 972, goalCount: 68, actionCount: 214 },
      }
    }
    const [projects, rawTasks, pool] = await Promise.all([
      request<{ items: Array<Record<string, unknown>> }>('/api/projects/?page_size=100'),
      request<{ items: Array<Record<string, unknown>> }>('/api/tasks/my?page_size=100'),
      request<{ items: Array<Record<string, unknown>> }>('/api/tasks/pool?page_size=100'),
    ])
    const effectiveProjectId = query.projectId || String(projects.items[0]?.id || '')
    const allTasks = rawTasks.items.filter((item) => !effectiveProjectId || String(item.project_id || (item.project as Record<string, unknown> | undefined)?.id || '') === effectiveProjectId).map(normalizeTask)
    const filteredTasks = allTasks.filter((task) => (query.tab === 'submitted' ? ['submitted', 'completed'].includes(task.status) : ['pending', 'processing'].includes(task.status)) && (!query.keyword || `${task.dataName}${task.dataId}`.toLowerCase().includes(query.keyword.toLowerCase())) && (!query.node || task.node === query.node))
    const pageNo = query.pageNo || 1; const pageSize = query.pageSize || 10
    const taskItems = filteredTasks.slice((pageNo - 1) * pageSize, pageNo * pageSize)
    const tasks: WorkbenchSnapshot['tasks'] = { items: taskItems, page: { pageNo, pageSize, total: filteredTasks.length }, viewMode: 'personal', selfClaimEnabled: true }
    const todayTasks = taskItems.filter((item) => item.updatedAt.startsWith(new Date().toISOString().slice(0, 10)))
    return {
      projects: projects.items.map((item) => { const config = (item.work_config || {}) as Record<string, unknown>; return { id: String(item.id), code: String(item.code || item.external_project_id || ''), name: String(item.name || ''), batchName: String(item.description || ''), status: String(item.status || 'running').replace('_', '-') as Project['status'], pendingCount: allTasks.filter((task) => ['pending', 'processing'].includes(task.status)).length, claimLimit: numberValue(config.active_task_limit) || 10 } }),
      currentProjectId: effectiveProjectId,
      recommendedTask: tasks.items.find((item) => ['pending', 'processing'].includes(item.status)) || null,
      tasks,
      claimPool: Object.values(pool.items.filter((item) => !effectiveProjectId || String(item.project_id || (item.project as Record<string, unknown> | undefined)?.id || '') === effectiveProjectId).map(normalizeTask).reduce<Record<string, ClaimPoolItem>>((groups, task) => { const current = groups[task.node] || { node: task.node, label: `${nodeLabelsForApi[task.node]}数据`, count: 0 }; current.count += 1; groups[task.node] = current; return groups }, {})),
      summary: todayTasks.reduce((total, item) => ({ todayObjects: total.todayObjects + item.actionCount, validDuration: total.validDuration + item.validDuration, goalCount: total.goalCount + item.goalCount, actionCount: total.actionCount + item.actionCount }), { todayObjects: 0, validDuration: 0, goalCount: 0, actionCount: 0 }),
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
