import type { User } from '../types/api'

const sampleManagementRoles = new Set([
  'admin', 'administrator', 'normaladmin', 'generaladmin', 'platformadmin', 'projectadmin', 'systemadmin',
  'projectmanager', 'manager', '管理员', '系统管理员', '超级管理员', '项目经理',
])

export function canManageInvalidSamples(user: User) {
  return Boolean(user.isStaff || user.isSuperuser || [...user.roles, ...user.roleLabels]
    .some((role) => sampleManagementRoles.has(role.toLowerCase().replace(/[\s_-]/g, ''))))
}
