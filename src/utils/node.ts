import type { TaskNode } from '../types/api'

export const nodeLabels: Record<TaskNode, string> = { annotation: '标注', review: '质检', quality: '审核', acceptance: '验收' }
export const nodeTones: Record<TaskNode, string> = { annotation: 'cyan', review: 'blue', quality: 'amber', acceptance: 'green' }

const toneByLabel: Record<string, string> = { 标注: nodeTones.annotation, 质检: nodeTones.review, 审核: nodeTones.quality, 验收: nodeTones.acceptance }

/** 按中文节点名取色；标注=青、质检=蓝、审核=橙、验收=绿 */
export function nodeToneByLabel(label?: string) {
  return (label && toneByLabel[label]) || 'blue'
}
