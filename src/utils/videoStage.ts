import type { VideoListItem, VideoStage, VideoStageStatus } from '../types/api'

export const videoStages: Array<{ value: VideoStage; label: string }> = [
  { value: 'pre_annotation', label: '预处理' }, { value: 'human_processing', label: '人工处理' },
  { value: 'model_description', label: '模型描述' }, { value: 'cutting', label: '切割' },
  { value: 'completed', label: '已完成' }, { value: 'cancelled', label: '已作废' },
]
export const videoStageStatusLabels: Record<VideoStageStatus, string> = { queued: '排队中', running: '处理中', retrying: '重试中', succeeded: '成功', failed: '失败', skipped: '已跳过', cancelled: '已取消' }

export function normalizeVideoStageFields(raw: Record<string, unknown>): Pick<VideoListItem, 'stage' | 'stageStatus' | 'preAnnotationJobId' | 'stageFailureReason'> {
  const job = (raw.pre_annotation_job || raw.latest_pre_annotation_job || {}) as Record<string, unknown>
  const id = raw.pre_annotation_job_id ?? job.id ?? job.job_id ?? raw.job_id
  const message = raw.stage_error_message
  return {
    stage: videoStages.some((item) => item.value === raw.stage) ? raw.stage as VideoStage : undefined,
    stageStatus: Object.hasOwn(videoStageStatusLabels, String(raw.stage_status || '')) ? raw.stage_status as VideoStageStatus : undefined,
    preAnnotationJobId: id != null && /^\d+$/.test(String(id)) && Number(id) > 0 ? String(id) : undefined,
    stageFailureReason: message == null ? undefined : String(message),
  }
}

export function preAnnotationRetryAvailable(video: VideoListItem) {
  return video.stage === 'pre_annotation' && (video.stageStatus === 'failed' || video.stageStatus === 'cancelled')
}
