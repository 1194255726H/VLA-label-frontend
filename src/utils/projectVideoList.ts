import type { ProjectVideoQuery, TaskNode, VideoListItem, VideoStage, VideoStageStatus } from '../types/api'
export type VideoTab = VideoStage | 'abnormal' | ''
export type MachineStage = 'pre_annotation' | 'model_description' | 'cutting'
export const machineStages: MachineStage[] = ['pre_annotation', 'model_description', 'cutting']
export const machineLabels: Record<MachineStage, string> = { pre_annotation: 'AI 预处理状态', model_description: 'AI 描述状态', cutting: '视频切分状态' }
export const executionStates: VideoStageStatus[] = ['queued', 'running', 'retrying', 'failed', 'succeeded']
export const listInvalidReasons = ['手部出框', '文件损坏', '重复数据', '严重遮挡', '关键步骤缺失', '其他']
export const listWorkTypeLabels = { normal: '正常流转', returned: '退回返工' }
export type VideoColumn = 'name' | 'scene' | 'stage' | 'node' | 'assigned' | 'status' | MachineStage | 'workType' | 'duration' | 'effective' | 'invalid' | 'reasons' | 'goals' | 'actions' | 'collector' | 'assignee' | 'updated' | 'cancelReasons' | 'cancelBy' | 'cancelAt' | 'operations'
export const columnLabels: Record<VideoColumn, string> = { name: '数据名称', scene: '场景', stage: '处理阶段', node: '作业节点', assigned: '分配状态', status: '作业状态', ...machineLabels, workType: '流转类型', duration: '视频时长', effective: '有效时长', invalid: '无效时长', reasons: '无效原因', goals: '单次任务数', actions: '小目标数', collector: '采集人', assignee: '处理人', updated: '更新时间', cancelReasons: '作废原因', cancelBy: '作废人', cancelAt: '作废时间', operations: '操作' }
const metrics: VideoColumn[] = ['duration', 'effective', 'invalid', 'reasons', 'goals', 'actions']
export const tabColumns: Record<VideoTab, VideoColumn[]> = {
  '': ['name', 'scene', 'stage', 'node', 'assigned', 'status', ...machineStages, 'workType', 'duration', 'effective', 'invalid', 'reasons', 'goals', 'actions', 'collector', 'assignee', 'updated', 'operations'],
  pre_annotation: ['name', 'scene', 'pre_annotation', 'duration', 'collector', 'updated', 'operations'],
  human_processing: ['name', 'scene', 'node', 'assigned', 'status', 'workType', ...metrics, 'collector', 'assignee', 'updated', 'operations'],
  model_description: ['name', 'scene', 'model_description', ...metrics, 'collector', 'updated', 'operations'],
  cutting: ['name', 'scene', 'cutting', ...metrics, 'collector', 'assignee', 'updated', 'operations'],
  completed: ['name', 'scene', ...machineStages, ...metrics, 'collector', 'assignee', 'updated', 'operations'],
  cancelled: ['name', 'scene', 'duration', 'collector', 'assignee', 'cancelReasons', 'cancelBy', 'cancelAt', 'updated', 'operations'],
  abnormal: ['name', 'scene', 'stage', ...machineStages, ...metrics, 'collector', 'assignee', 'updated', 'operations'],
}
export interface VideoListFilters {
  name: string; collectors: string[]; assignees: string[]; scene1: string; scene2: string
  node: TaskNode | ''; assigned: '' | 'true' | 'false'; status: '' | 'pending' | 'in_progress'
  workType: '' | 'normal' | 'returned'; reasons: string[]; sample: '' | 'true' | 'false'
  executions: Record<MachineStage, '' | VideoStageStatus>; updatedStart: string; updatedEnd: string
}
export function emptyVideoFilters(): VideoListFilters {
  return { name: '', collectors: [], assignees: [], scene1: '', scene2: '', node: '', assigned: '', status: '', workType: '', reasons: [], sample: '', executions: { pre_annotation: '', model_description: '', cutting: '' }, updatedStart: '', updatedEnd: '' }
}
export function filterVisibility(tab: VideoTab) {
  return { human: tab === '' || tab === 'human_processing', reasons: !['pre_annotation', 'cancelled'].includes(tab), assignee: tab !== 'pre_annotation' && tab !== 'model_description', machine: machineStages.includes(tab as MachineStage) }
}
export function executionFilterStages(tab: VideoTab): MachineStage[] {
  return tab === 'completed' || tab === 'abnormal' ? machineStages : machineStages.includes(tab as MachineStage) ? [tab as MachineStage] : []
}
export function filtersForTab(filters: VideoListFilters, tab: VideoTab): VideoListFilters {
  const visible = filterVisibility(tab)
  return { ...filters, ...(!visible.human ? { node: '', assigned: '', status: '', workType: '' } as const : {}), ...(!visible.reasons ? { reasons: [], sample: '' } as const : {}), ...(!visible.assignee ? { assignees: [] } : {}), executions: Object.fromEntries(machineStages.map((stage) => [stage, executionFilterStages(tab).includes(stage) ? filters.executions[stage] : ''])) as VideoListFilters['executions'] }
}
export function serverVideoQuery(filters: VideoListFilters, tab: VideoTab): ProjectVideoQuery {
  return {
    filename: /^\d+$/.test(filters.name) ? undefined : filters.name || undefined,
    personName: filters.collectors.length === 1 ? filters.collectors[0] : undefined,
    currentAssigneeId: filters.assignees.length === 1 ? filters.assignees[0] : undefined,
    invalidReason: filters.reasons.length === 1 ? filters.reasons[0] : undefined,
    scene1Id: filters.scene1 || undefined, scene2Id: filters.scene2 || undefined,
    stage: tab === 'abnormal' || tab === '' ? undefined : tab,
    stageStatus: tab === 'abnormal' ? 'failed' : undefined,
    preAnnotationStatus: filters.executions.pre_annotation || undefined,
    modelDescriptionStatus: filters.executions.model_description || undefined,
    cuttingStatus: filters.executions.cutting || undefined,
    status: filters.status || undefined, workType: filters.workType || undefined,
    assigned: filters.assigned === '' ? undefined : filters.assigned === 'true',
    isSample: filters.sample === '' ? undefined : filters.sample === 'true',
  }
}
export function needsVideoScan(filters: VideoListFilters, tab: VideoTab) {
  return Boolean(tab === 'abnormal' || /^\d+$/.test(filters.name) || filters.node || filters.updatedStart || filters.updatedEnd || filters.collectors.length > 1 || filters.assignees.length > 1 || filters.reasons.length > 1 || filters.sample === 'false')
}
export function videoAssigned(video: VideoListItem) { return video.assigned ?? Boolean(video.currentAssigneeId) }
export function assignmentLabel(video: VideoListItem, notStarted: boolean) {
  return video.stage !== 'human_processing' ? '-' : !videoAssigned(video) ? '待分配' : notStarted ? '预分配' : '已分配'
}
export function humanStatus(video: VideoListItem) {
  return video.stage !== 'human_processing' ? '-' : ['pending', 'assigned'].includes(video.videoStatus) ? '待处理' : ['in_progress', 'processing'].includes(video.videoStatus) ? '处理中' : '-'
}
// Explicit null means no execution. Only fall back for older responses that omit the new field.
export function machineStatus(video: VideoListItem, stage: MachineStage) {
  const independent = { pre_annotation: video.preAnnotationStatus, model_description: video.modelDescriptionStatus, cutting: video.cuttingStatus }[stage]
  const status = independent === undefined && video.stage === stage ? video.stageStatus : independent
  return status && executionStates.includes(status) ? status : undefined
}
function dayStart(value: string) { return Date.parse(`${value}T00:00:00+08:00`) }
export function matchesVideoFilters(video: VideoListItem, filters: VideoListFilters, tab: VideoTab) {
  const intervals = video.invalidIntervalList || []
  const hasSample = video.isSample ?? intervals.some((range) => range.isSample)
  const updated = Date.parse(video.updatedAt)
  return (!filters.name || video.filename.toLowerCase().includes(filters.name.toLowerCase()) || video.id.includes(filters.name))
    && (tab !== 'abnormal' || machineStages.includes(video.stage as MachineStage) && video.stageStatus === 'failed')
    && machineStages.every((stage) => !filters.executions[stage] || machineStatus(video, stage) === filters.executions[stage])
    && (!filters.node || video.stage === 'human_processing' && video.currentNode === filters.node)
    && (!filters.collectors.length || filters.collectors.includes(video.personName || ''))
    && (!filters.assignees.length || filters.assignees.includes(video.currentAssigneeId || ''))
    && (!filters.reasons.length || intervals.some((range) => filters.reasons.includes(range.reason)))
    && (filters.sample === '' || (filters.sample === 'true' ? hasSample : intervals.length > 0 && !hasSample))
    && (!filters.updatedStart || updated >= dayStart(filters.updatedStart))
    && (!filters.updatedEnd || updated < dayStart(filters.updatedEnd) + 86400000)
}
