import type { FleetManualVideo, FleetSyncStatus } from '../types/api'

export const fleetSyncStatusLabels: Record<FleetSyncStatus, string> = { unsynced: '未同步', syncing: '同步中', synced: '已同步', failed: '同步失败', unknown: '未知状态' }

export function fleetVideoSelectable(video: FleetManualVideo) {
  return Number.isSafeInteger(video.fleetVideoId) && video.fleetVideoId > 0 && !video.synced && (video.syncStatus === 'unsynced' || video.syncStatus === 'failed')
}

export function normalizeFleetSyncStatus(raw: unknown, synced: unknown): FleetSyncStatus {
  if (synced === true) return 'synced'
  const status = String(raw ?? '').trim().toLowerCase().replace(/[\s-]/g, '_')
  if (['synced', 'success', 'completed', '已同步'].includes(status)) return 'synced'
  if (['syncing', 'in_progress', 'processing', 'running', '同步中'].includes(status)) return 'syncing'
  if (['failed', 'error', 'sync_failed', '同步失败'].includes(status)) return 'failed'
  if (['unsynced', 'not_synced', 'pending', '未同步'].includes(status)) return 'unsynced'
  if (!status && synced === false) return 'unsynced'
  return 'unknown'
}
