import type { User } from '../types/api'

const sampleManagementRoles = new Set([
  'admin', 'administrator', 'normaladmin', 'generaladmin', 'platformadmin', 'projectadmin', 'systemadmin',
  'projectmanager', 'manager', '管理员', '系统管理员', '超级管理员', '项目经理',
])

export function canManageInvalidSamples(user: User) {
  return Boolean(user.isStaff || user.isSuperuser || [...user.roles, ...user.roleLabels]
    .some((role) => sampleManagementRoles.has(role.toLowerCase().replace(/[\s_-]/g, ''))))
}

export function canEditAfterAnnotation(user: User) {
  const annotatorRoles = new Set(['annotator', 'annotation', '标注员', '标注', '数据标注员'])
  const roles = [...user.roles, ...user.roleLabels].map((role) => role.toLowerCase().replace(/[\s_-]/g, '')).filter(Boolean)
  return Boolean(user.isStaff || user.isSuperuser || roles.some((role) => !annotatorRoles.has(role)))
}

export function canViewAllDailyStats(user: User, projectOwnerId?: string) {
  const adminRoles = [...sampleManagementRoles].filter((role) => !['projectmanager', 'manager', '项目经理'].includes(role))
  return Boolean(user.isStaff || user.isSuperuser || (projectOwnerId && projectOwnerId === String(user.id)) || [...user.roles, ...user.roleLabels]
    .some((role) => adminRoles.includes(role.toLowerCase().replace(/[\s_-]/g, ''))))
}
