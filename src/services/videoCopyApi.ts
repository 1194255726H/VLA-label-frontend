import { request } from './api'
import { runtimeConfig } from '../config/runtime'

export interface VideoCopyItem {
  source_video_id: number
  video_id?: number
  success: boolean
  annotation_copied?: boolean
  pre_annotation?: boolean
  code?: string
  message?: string
}
export interface VideoCopyResult { total: number; success_count: number; failed_count: number; items: VideoCopyItem[] }
export async function copyVideos(targetId: string, ids: string[], options: { copyAnnotation: boolean; runPreAnnotation: boolean; reason: string }): Promise<VideoCopyResult> {
  const videoIds = [...new Set(ids)].map(Number)
  if (!/^\d+$/.test(targetId) || Number(targetId) <= 0) throw new Error('请选择有效目标数据集')
  if (!videoIds.length || videoIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) throw new Error('来源数据 ID 无效，请刷新列表后重试')
  if (videoIds.length > 200) throw new Error('单次最多复制 200 条数据')
  if (runtimeConfig.apiMode === 'mock') throw new Error('数据复制需要连接真实后端')
  try { return await request<VideoCopyResult>(`/api/projects/${encodeURIComponent(targetId)}/videos/copy`, { method: 'POST', body: JSON.stringify({ video_ids: videoIds, copy_annotation: options.copyAnnotation, run_pre_annotation: !options.copyAnnotation && options.runPreAnnotation, copy_reason: options.reason.trim().slice(0, 500) }) }) }
  catch (failure) {
    if (failure instanceof Error) {
      const code = (failure as Error & { code?: string }).code
      if (code === 'permission_denied') failure.message = '无复制权限'
      if (code === 'pre_annotation_not_enabled') failure.message = '目标数据集未启用 AI 预处理，请取消勾选后重新复制'
    }
    throw failure
  }
}
