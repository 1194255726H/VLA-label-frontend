import type { ClaimPoolItem, LabelLibrary, ManagedProject, Member, Project, ProjectDistribution, Team, User, WorkbenchTask } from '../types/api'

export const mockUser: User = {
  id: 'U-LABELER-01',
  account: 'zhanghaitao',
  name: '张海涛',
  roles: ['annotator', 'project-manager'],
  roleLabels: ['标注员', '项目经理'],
  defaultRoute: '/workbench',
}

export const mockProjects: Project[] = [
  { id: '1', code: 'PRJ-QH-ROAD', name: '清华路端项目', batchName: '第一批次 · 路口行为采集', status: 'running', pendingCount: 6, claimLimit: 10 },
  { id: '3', code: 'PRJ-SEGMENT', name: '园区视频动作专项', batchName: '园区多场景 · 2026-08', status: 'running', pendingCount: 3, claimLimit: 10 },
]

export const mockTasks: WorkbenchTask[] = [
  { id: 'TASK-20260806-018', dataId: 'DATA-QH-018', dataName: 'roadside_obstacle_018', node: 'annotation', workType: 'returned', status: 'processing', totalDuration: 184, selectedDuration: 146, validDuration: 132, invalidDuration: 14, unselectedDuration: 38, goalCount: 12, actionCount: 36, startedAt: '2026-08-06 09:18', updatedAt: '2026-08-06 10:42', durationText: '1小时24分', assignee: '张海涛' },
  { id: 'TASK-20260806-021', dataId: 'DATA-QH-021', dataName: 'crossing_vehicle_021', node: 'annotation', workType: 'normal', status: 'pending', totalDuration: 156, selectedDuration: 121, validDuration: 115, invalidDuration: 6, unselectedDuration: 35, goalCount: 9, actionCount: 28, startedAt: '-', updatedAt: '2026-08-06 10:16', durationText: '-', assignee: '张海涛' },
  { id: 'TASK-20260805-104', dataId: 'DATA-QH-104', dataName: 'pedestrian_intent_104', node: 'review', workType: 'normal', status: 'pending', totalDuration: 209, selectedDuration: 172, validDuration: 163, invalidDuration: 9, unselectedDuration: 37, goalCount: 15, actionCount: 42, startedAt: '-', updatedAt: '2026-08-06 09:56', durationText: '-', assignee: '张海涛' },
  { id: 'TASK-20260805-097', dataId: 'DATA-QH-097', dataName: 'traffic_light_097', node: 'annotation', workType: 'normal', status: 'submitted', totalDuration: 198, selectedDuration: 164, validDuration: 158, invalidDuration: 6, unselectedDuration: 34, goalCount: 14, actionCount: 39, startedAt: '2026-08-05 15:20', updatedAt: '2026-08-05 17:38', submittedAt: '2026-08-05 17:38', durationText: '2小时18分', assignee: '张海涛' },
  { id: 'TASK-20260805-088', dataId: 'DATA-QH-088', dataName: 'lane_change_088', node: 'annotation', workType: 'returned', status: 'submitted', totalDuration: 143, selectedDuration: 109, validDuration: 101, invalidDuration: 8, unselectedDuration: 34, goalCount: 8, actionCount: 25, startedAt: '2026-08-05 10:08', updatedAt: '2026-08-05 11:44', submittedAt: '2026-08-05 11:44', durationText: '1小时36分', assignee: '张海涛' },
]

export const mockClaimPool: ClaimPoolItem[] = [
  { node: 'annotation', label: '标注数据', count: 18 },
  { node: 'review', label: '质检数据', count: 7 },
  { node: 'quality', label: '审核数据', count: 4 },
  { node: 'acceptance', label: '验收数据', count: 2 },
]

export const mockManagedProjects: ManagedProject[] = [
  { id: '1', code: 'PRJ-QH-ROAD', name: '清华路端项目', desc: '城市路口 VLA 视频动作标注', status: 'running', teams: ['清华路端项目团队'], memberCount: 12, dataCount: 86, selectedDuration: 15280, validDuration: 14316, invalidDuration: 964, unselectedDuration: 4210, goalCount: 684, actionCount: 2148, completionNode: '验收', progress: 72, owner: '张海涛', createdAt: '2026-06-18', deliveryAt: '2026-08-18', labelLibraryIds: ['1', '2'], operationLibraryId: '1', operationLibraryName: '常用操作对象库' },
  { id: '2', code: 'PRJ-HIGHWAY', name: '高速场景采集项目', desc: '高速道路车道线、障碍物和路牌联采', status: 'paused', teams: ['清华路端项目团队', '视频动作专项组'], memberCount: 8, dataCount: 42, selectedDuration: 8640, validDuration: 8012, invalidDuration: 628, unselectedDuration: 2305, goalCount: 326, actionCount: 980, completionNode: '质检', progress: 46, owner: '张三', createdAt: '2026-06-25', deliveryAt: '2026-08-10', labelLibraryIds: ['1'], operationLibraryId: '1', operationLibraryName: '常用操作对象库' },
  { id: '3', code: 'PRJ-SEGMENT', name: '园区视频动作专项', desc: '园区 VLA 视频动作训练与验收', status: 'running', teams: ['视频动作专项组'], memberCount: 7, dataCount: 31, selectedDuration: 6020, validDuration: 5716, invalidDuration: 304, unselectedDuration: 1760, goalCount: 248, actionCount: 756, completionNode: '验收', progress: 61, owner: '赵敏', createdAt: '2026-07-02', deliveryAt: '2026-08-26', labelLibraryIds: ['2', '3'], operationLibraryId: '1', operationLibraryName: '常用操作对象库' },
  { id: '4', code: 'PRJ-CAMPUS-DRAFT', name: '园区夜间采集项目', desc: '夜间复杂光照场景预研', status: 'not-started', teams: ['视频动作专项组'], memberCount: 5, dataCount: 0, selectedDuration: 0, validDuration: 0, invalidDuration: 0, unselectedDuration: 0, goalCount: 0, actionCount: 0, completionNode: '审核', progress: 0, owner: '赵敏', createdAt: '2026-08-03', deliveryAt: '2026-09-15', labelLibraryIds: [], operationLibraryId: '1', operationLibraryName: '常用操作对象库' },
  { id: '5', code: 'PRJ-CAR-END', name: '车端行为采集一期', desc: '一期车端行为数据交付项目', status: 'finished', teams: ['清华车端项目团队'], memberCount: 10, dataCount: 120, selectedDuration: 22410, validDuration: 21680, invalidDuration: 730, unselectedDuration: 5360, goalCount: 932, actionCount: 3024, completionNode: '验收', progress: 100, owner: '原云城', createdAt: '2026-04-12', deliveryAt: '2026-07-30', labelLibraryIds: ['1', '3'], operationLibraryId: '1', operationLibraryName: '常用操作对象库' },
]

export const mockLabelLibraries: LabelLibrary[] = [
  { id: '1', code: 'LIB-ROAD-V2', name: '道路参与者标签库', desc: '道路交通参与者与基础设施标签', enabled: true, createdAt: '2026-05-18 10:24', count: 6, tags: [
    { id: '101', name: '车辆', code: 'car', color: '#2F80ED', appliesTo: 'goal', enabled: true, createdAt: '2026-05-18 10:28' },
    { id: '102', name: '行人', code: 'pedestrian', color: '#27AE60', appliesTo: 'goal', enabled: true, createdAt: '2026-05-18 10:29' },
    { id: '103', name: '非机动车', code: 'non_motor', color: '#F2994A', appliesTo: 'goal', enabled: true, createdAt: '2026-05-18 10:32' },
    { id: '104', name: '减速', code: 'slow_down', color: '#9B51E0', appliesTo: 'action', enabled: true, createdAt: '2026-05-18 10:35' },
    { id: '105', name: '避让', code: 'yield', color: '#EB5757', appliesTo: 'action', enabled: true, createdAt: '2026-05-18 10:36' },
    { id: '106', name: '停车', code: 'stop', color: '#4F4F4F', appliesTo: 'action', enabled: true, createdAt: '2026-05-18 10:38' },
  ] },
  { id: '2', code: 'LIB-ACTION-V1', name: 'VLA 动作标签库', desc: '单次任务与原子动作标签', enabled: true, createdAt: '2026-06-03 14:16', count: 5, tags: [
    { id: '201', name: '通过路口', code: 'cross_intersection', color: '#2563EB', appliesTo: 'goal', enabled: true, createdAt: '2026-06-03 14:20' },
    { id: '202', name: '左转', code: 'turn_left', color: '#7C3AED', appliesTo: 'action', enabled: true, createdAt: '2026-06-03 14:22' },
    { id: '203', name: '右转', code: 'turn_right', color: '#0891B2', appliesTo: 'action', enabled: true, createdAt: '2026-06-03 14:23' },
    { id: '204', name: '直行', code: 'go_straight', color: '#16A34A', appliesTo: 'action', enabled: true, createdAt: '2026-06-03 14:24' },
    { id: '205', name: '等待', code: 'wait', color: '#D97706', appliesTo: 'action', enabled: true, createdAt: '2026-06-03 14:25' },
  ] },
  { id: '3', code: 'LIB-SCENE-V1', name: '园区场景标签库', desc: '园区道路、建筑与特殊区域', enabled: true, createdAt: '2026-07-01 09:48', count: 3, tags: [
    { id: '301', name: '园区道路', code: 'campus_road', color: '#0EA5E9', appliesTo: 'goal', enabled: true, createdAt: '2026-07-01 09:50' },
    { id: '302', name: '建筑入口', code: 'building_entry', color: '#8B5CF6', appliesTo: 'goal', enabled: true, createdAt: '2026-07-01 09:52' },
    { id: '303', name: '绕行', code: 'detour', color: '#F97316', appliesTo: 'action', enabled: true, createdAt: '2026-07-01 09:54' },
  ] },
]

export const mockTeams: Team[] = [
  { id: '1', name: '清华路端项目团队', desc: '负责路端视频片段标注', enabled: true, memberCount: 4 },
  { id: '2', name: '清华车端项目团队', desc: '负责车端采集数据复核', enabled: true, memberCount: 2 },
  { id: '3', name: '视频动作专项组', desc: '视频动作标注练习与正式任务', enabled: true, memberCount: 3 },
]

export const mockMembers: Member[] = [
  { accountId: '1', account: 'qinjie', name: '秦杰', email: 'qinjie@example.com', team: '系统管理', roles: ['管理员'], projects: ['全部项目'], enabled: true, joinedAt: '2026-05-12' },
  { accountId: '2', account: 'yuanyuncheng', name: '原云城', email: 'yuanyuncheng@example.com', team: '清华路端项目团队', roles: ['管理员', '项目经理'], projects: ['清华路端项目', '高速场景采集项目'], enabled: true, joinedAt: '2026-05-15' },
  { accountId: '3', account: 'zhanghaitao', name: '张海涛', email: 'zhanghaitao@example.com', team: '清华路端项目团队', roles: ['项目经理', '标注员'], projects: ['清华路端项目'], enabled: true, joinedAt: '2026-05-18' },
  { accountId: '4', account: 'duanchengfeng', name: '段乘风', email: 'duanchengfeng@example.com', team: '清华路端项目团队', roles: ['质检员'], projects: ['清华路端项目'], enabled: true, joinedAt: '2026-05-18' },
  { accountId: '5', account: 'zhangsan', name: '张三', email: 'zhangsan@example.com', team: '清华车端项目团队', roles: ['项目经理', '标注员'], projects: ['高速场景采集项目'], enabled: true, joinedAt: '2026-05-20' },
  { accountId: '6', account: 'lisi', name: '李四', email: 'lisi@example.com', team: '清华车端项目团队', roles: ['审核员', '验收员'], projects: ['高速场景采集项目'], enabled: false, joinedAt: '2026-05-20' },
  { accountId: '7', account: 'zhaomin', name: '赵敏', email: 'zhaomin@example.com', team: '视频动作专项组', roles: ['管理员', '项目经理'], projects: ['园区视频动作专项'], enabled: true, joinedAt: '2026-06-02' },
  { accountId: '8', account: 'wangwu', name: '王五', email: 'wangwu@example.com', team: '视频动作专项组', roles: ['标注员'], projects: ['园区视频动作专项'], enabled: true, joinedAt: '2026-06-05' },
  { accountId: '9', account: 'sunli', name: '孙丽', email: 'sunli@example.com', team: '视频动作专项组', roles: ['质检员', '审核员'], projects: ['园区视频动作专项'], enabled: true, joinedAt: '2026-06-05' },
]

export const mockProjectDistribution: ProjectDistribution[] = [
  { projectId: '1', projectName: '清华路端项目', memberCount: 4, managerCount: 2, annotatorCount: 1, reviewerCount: 1, qualityCount: 1, acceptorCount: 0, teams: ['清华路端项目团队'] },
  { projectId: '2', projectName: '高速场景采集项目', memberCount: 4, managerCount: 2, annotatorCount: 1, reviewerCount: 0, qualityCount: 1, acceptorCount: 1, teams: ['清华路端项目团队', '清华车端项目团队'] },
  { projectId: '3', projectName: '园区视频动作专项', memberCount: 3, managerCount: 1, annotatorCount: 1, reviewerCount: 1, qualityCount: 1, acceptorCount: 0, teams: ['视频动作专项组'] },
]
