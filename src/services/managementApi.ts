import { runtimeConfig } from '../config/runtime'
import { mockLabelLibraries, mockManagedProjects, mockMembers, mockProjectDistribution, mockTeams } from '../mocks/data'
import type { LabelItem, LabelLibrary, ManagedProject, Member, ProjectPayload, ProjectStatus, Team, TeamMembersData } from '../types/api'
import { request } from './api'

let projects = mockManagedProjects.map((item) => ({ ...item, teams: [...item.teams], labelLibraryIds: [...item.labelLibraryIds] }))
let libraries = mockLabelLibraries.map((item) => ({ ...item, tags: item.tags.map((tag) => ({ ...tag })) }))
let teams = mockTeams.map((item) => ({ ...item }))
let members = mockMembers.map((item) => ({ ...item, roles: [...item.roles], projects: [...item.projects] }))

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
  return {
    id: String(item.id || item.projectId || ''), code: String(item.code || item.projectCode || ''), name: String(item.name || item.projectName || ''), desc: String(item.desc || item.description || ''),
    status: statusMap[String(item.status)] || 'not-started', teams: rawTeams.map((team) => String(team.name || '')), teamIds: rawTeams.map((team) => String(team.id || '')), memberCount: num(item.annotator_count ?? item.memberCount), dataCount: num(item.data_count ?? item.task_count ?? item.dataCount),
    selectedDuration: num(item.selected_duration_ms ?? item.selectedDuration) / (item.selected_duration_ms == null ? 1 : 1000), validDuration: num(item.effective_duration_ms ?? item.validDuration) / (item.effective_duration_ms == null ? 1 : 1000), invalidDuration: num(item.invalid_duration_ms ?? item.invalidDuration) / (item.invalid_duration_ms == null ? 1 : 1000), unselectedDuration: num(item.unselected_duration_ms ?? item.unselectedDuration) / (item.unselected_duration_ms == null ? 1 : 1000), goalCount: num(item.atomic_task_count ?? item.goalCount), actionCount: num(item.atomic_action_count ?? item.actionCount),
    completionNode: completionLabels[String(workConfig.completion_node || item.completionNode)] || '验收', progress: num(item.progress_percent ?? item.progress), owner: String(owner.display_name || owner.username || item.owner || '-'), ownerId: String(owner.id || item.owner_id || ''), createdAt: String(item.created_at || item.createdAt || ''), deliveryAt: String(item.delivery_at || item.deliveryAt || ''),
    labelLibraryIds: Array.isArray(rawLabelLibraryIds) ? rawLabelLibraryIds.map(String) : [],
    assignmentStrategy: ['manual_claim', 'load_balance', 'round_robin'].includes(String(workConfig.assignment_strategy)) ? String(workConfig.assignment_strategy) as ManagedProject['assignmentStrategy'] : 'manual_claim',
  }
}

export const projectApi = {
  async list(): Promise<ManagedProject[]> {
    if (runtimeConfig.apiMode === 'mock') { await delay(); return clone(projects) }
    const result = await request<{ items: Array<Record<string, unknown>> }>('/api/projects/?page_size=100')
    return result.items.map(normalizeProject)
  },
  async save(payload: ProjectPayload): Promise<ManagedProject[]> {
    if (runtimeConfig.apiMode === 'mock') {
      await delay()
      if (projects.some((item) => item.name === payload.name && item.id !== payload.projectId)) throw new Error('项目名称已存在')
      if (payload.projectId) {
        projects = projects.map((item) => item.id === payload.projectId ? { ...item, ...payload, labelLibraryIds: [...payload.labelLibraryIds] } : item)
      } else {
        projects = [{ id: String(Date.now()), code: `PRJ-${Date.now().toString(36).toUpperCase()}`, status: 'not-started', memberCount: 0, dataCount: 0, selectedDuration: 0, validDuration: 0, invalidDuration: 0, unselectedDuration: 0, goalCount: 0, actionCount: 0, progress: 0, createdAt: new Date().toISOString().slice(0, 10), ...payload }, ...projects]
      }
      return clone(projects)
    }
    const completionNodes = { '质检': 'quality_check', '审核': 'review', '验收': 'acceptance' }
    const body = { name: payload.name, description: payload.desc, team_ids: payload.teams.map(Number), owner_id: payload.owner ? Number(payload.owner) : null, delivery_at: payload.deliveryAt || null, completion_node: completionNodes[payload.completionNode], model_generation_node: 'annotation', assignment_strategy: payload.assignmentStrategy, active_task_limit: 10, label_library_ids: payload.labelLibraryIds.map(Number) }
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

export const teamApi = {
  async getData(): Promise<TeamMembersData> {
    if (runtimeConfig.apiMode === 'mock') { await delay(); return clone({ teams, members, projects: mockProjectDistribution }) }
    const [rawTeams, rawMembers, rawProjects] = await Promise.all([
      request<{ items: Array<Record<string, unknown>> }>('/api/auth/teams?page_size=100'),
      request<{ items: Array<Record<string, unknown>> }>('/api/auth/members?page_size=100'),
      request<{ items: Array<Record<string, unknown>> }>('/api/projects/?page_size=100'),
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
    if (runtimeConfig.apiMode === 'mock') { await delay(); return }
    await request(`/api/auth/members/${encodeURIComponent(accountId)}/password`, { method: 'POST', body: JSON.stringify({ password }) })
  },
  async deleteMember(accountId: string): Promise<TeamMembersData> {
    if (runtimeConfig.apiMode === 'mock') { await delay(); members = members.filter((item) => item.accountId !== accountId); return clone({ teams, members, projects: mockProjectDistribution }) }
    await request(`/api/auth/members/${encodeURIComponent(accountId)}`, { method: 'DELETE' })
    return this.getData()
  },
}
