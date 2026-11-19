import type { SessionResponse } from '../types/api'

export function copyPermissions(session: SessionResponse) {
  const roles = [...session.account.roles, ...session.account.roleLabels].map((role) => role.toLowerCase().replace(/[\s_-]/g, ''))
  const admin = Boolean(session.account.isStaff || session.account.isSuperuser || roles.some((role) => ['admin', 'administrator', 'normaladmin', 'generaladmin', 'platformadmin', 'projectadmin', 'systemadmin', '管理员', '普通管理员', '平台管理员', '项目管理员', '系统管理员', '超级管理员', '系统超级管理员'].includes(role)))
  return { admin, allowed: admin || roles.some((role) => ['projectmanager', '项目经理'].includes(role)) }
}
export interface VideoCopySource {
  isCopy?: boolean
  sourceVideoId?: string
  sourceFleetVideoId?: string
  copyReason?: string
  copiedAt?: string
}
export function normalizeVideoCopy(raw: Record<string, unknown>): VideoCopySource {
  return { isCopy: raw.is_copy === true, sourceVideoId: raw.source_video_id == null ? undefined : String(raw.source_video_id), sourceFleetVideoId: raw.source_fleet_video_id == null ? undefined : String(raw.source_fleet_video_id), copyReason: String(raw.copy_reason || ''), copiedAt: raw.copied_at == null ? undefined : String(raw.copied_at) }
}
