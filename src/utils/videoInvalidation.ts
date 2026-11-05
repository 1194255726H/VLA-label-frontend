import type { TaskNode, VideoListItem } from '../types/api'
import { nodeLabels, taskNodeApiValues } from './node'

export const workTypeLabels = { normal: '正常流转', returned: '退回返修', invalidated: '预作废' }

export function taskNodeFromApi(value: unknown): TaskNode | undefined {
  return (Object.keys(nodeLabels) as TaskNode[]).find((node) => taskNodeApiValues[node] === value || nodeLabels[node] === value)
}

export function normalizeVideoInvalidation(raw: Record<string, unknown>): Pick<VideoListItem, 'invalidatedAt' | 'invalidatedNode' | 'workType'> {
  const invalidatedAt = raw.invalidated_at == null ? null : String(raw.invalidated_at)
  return {
    invalidatedAt, invalidatedNode: taskNodeFromApi(raw.invalidated_node),
    workType: invalidatedAt !== null || raw.work_type === 'invalidated' ? 'invalidated' : raw.work_type === 'returned' ? 'returned' : 'normal',
  }
}

export function cancellationMessage(video: { stage?: string; node: TaskNode; completionNode?: TaskNode }) {
  if (video.stage && video.stage !== 'human_processing') return '当前视频不在人工处理阶段，作废后不可恢复。'
  if (video.completionNode === video.node) return '这是最后一个节点，作废后不可恢复。'
  if (!video.completionNode) return '作废后按项目流程处理：非完成节点将流转到下一节点，由下游复核；完成节点作废后不可恢复。'
  return '作废后将流转到下一节点，由下游复核；下游正常提交可恢复。'
}
