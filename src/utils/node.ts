import type { TaskNode, User } from '../types/api'

export const nodeLabels: Record<TaskNode, string> = { annotation: '标注', review: '质检', quality: '审核', acceptance: '验收' }
export const nodeTones: Record<TaskNode, string> = { annotation: 'cyan', review: 'blue', quality: 'amber', acceptance: 'green' }
export const taskNodeApiValues: Record<TaskNode, string> = { annotation: 'annotation', review: 'quality_check', quality: 'review', acceptance: 'acceptance' }

export function resolveNextTaskNode(user: User, entryNode: string | null, fallback: TaskNode): TaskNode {
  const nodeFromEntry = (Object.entries(taskNodeApiValues) as Array<[TaskNode, string]>).find(([, value]) => value === entryNode)?.[0]
  if (nodeFromEntry) return nodeFromEntry
  const nodes = new Set(userTaskNodes(user))
  if (nodes.size === 1) return [...nodes][0]
  // Multi-role users and managers keep the node of the task they opened.
  return fallback
}

export function userTaskNodes(user: User): TaskNode[] {
  const roleNodes: Record<string, TaskNode> = {
    annotator: 'annotation', annotation: 'annotation', annotationoperator: 'annotation', annotationstaff: 'annotation', 标注员: 'annotation',
    qualitycheck: 'review', qualitychecker: 'review', qualityinspector: 'review', qc: 'review', 质检员: 'review',
    review: 'quality', reviewer: 'quality', auditor: 'quality', 审核员: 'quality',
    acceptor: 'acceptance', acceptance: 'acceptance', acceptanceofficer: 'acceptance', 验收员: 'acceptance',
  }
  const nodes = new Set([...user.roles, ...user.roleLabels].map((role) => roleNodes[role.toLowerCase().replace(/[\s_-]/g, '')]).filter(Boolean))
  return (Object.keys(nodeLabels) as TaskNode[]).filter((node) => nodes.has(node))
}

const toneByLabel: Record<string, string> = { 标注: nodeTones.annotation, 质检: nodeTones.review, 审核: nodeTones.quality, 验收: nodeTones.acceptance }

/** 按中文节点名取色；标注=青、质检=蓝、审核=橙、验收=绿 */
export function nodeToneByLabel(label?: string) {
  return (label && toneByLabel[label]) || 'blue'
}
