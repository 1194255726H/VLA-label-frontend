export type ApiMode = 'mock' | 'real'

export interface User {
  id: string
  account: string
  name: string
  avatar?: string
  roles: string[]
  roleLabels: string[]
  isStaff?: boolean
  isSuperuser?: boolean
  defaultRoute: string
}

export interface SessionResponse {
  account: User
  csrfToken?: string
  defaultRoute: string
}

export interface Project {
  id: string
  code: string
  name: string
  batchName: string
  status: 'running' | 'paused' | 'finished'
  pendingCount: number
  claimLimit: number
}

export type TaskNode = 'annotation' | 'review' | 'quality' | 'acceptance'
export type TaskTab = 'pending' | 'submitted'
export type TaskStatus = 'pending' | 'processing' | 'submitted' | 'completed'

export interface WorkbenchTask {
  id: string
  dataId: string
  dataName: string
  node: TaskNode
  workType: 'normal' | 'returned'
  status: TaskStatus
  totalDuration: number
  selectedDuration: number
  validDuration: number
  invalidDuration: number
  unselectedDuration: number
  goalCount: number
  actionCount: number
  startedAt: string
  updatedAt: string
  submittedAt?: string
  durationText: string
  assignee: string
}

export type StorageStatus = 'available' | 'missing' | 'unchecked'

export interface VideoListItem {
  id: string
  projectId: string
  projectName: string
  taskId: string
  taskExternalTaskId: string
  taskTitle: string
  taskStatus: string
  taskCurrentNode: TaskNode
  taskCurrentAssigneeId?: string
  currentNode: TaskNode
  currentAssigneeId?: string
  currentAssigneeName?: string
  videoStatus: string
  assignmentSource: string
  videoIndex: number
  videoId?: string
  filename: string
  uri: string
  ossBucket: string
  ossKey: string
  duration: number
  fileSize: number
  storageStatus: StorageStatus
  storageError?: string
  storageCheckedAt?: string
  createdAt: string
  updatedAt: string
  submittedNode?: string
  submittedById?: string
  submittedAt?: string
  submittedDecision?: string
}

export interface TaskPage {
  items: VideoListItem[]
  page: { pageNo: number; pageSize: number; total: number }
  pages: number
  viewMode: 'personal' | 'all-projects'
  selfClaimEnabled: boolean
}

export interface ClaimPoolItem {
  node: TaskNode
  label: string
  count: number
}

export interface WorkbenchSummary {
  todayObjects: number
  validDuration: number
  goalCount: number
  actionCount: number
}

export interface WorkbenchSnapshot {
  projects: Project[]
  currentProjectId: string
  recommendedTask: VideoListItem | null
  tasks: TaskPage
  claimPool: ClaimPoolItem[]
  summary: WorkbenchSummary
}

export interface TaskQuery {
  projectId: string
  operatorId: string
  tab: TaskTab
  pageNo?: number
  pageSize?: number
}

export interface ProjectVideoQuery {
  keyword?: string
  status?: string
  currentNode?: TaskNode | ''
  storageStatus?: StorageStatus | ''
  page?: number
  pageSize?: number
}

export interface ProjectVideoPage {
  items: VideoListItem[]
  total: number
  page: number
  pageSize: number
  pages: number
}

export interface SmsChallenge {
  challengeId: string
  expiresIn: number
}

export interface PasswordResetChallenge {
  resetToken: string
  maskedPhone: string
}

export type ProjectStatus = 'not-started' | 'running' | 'paused' | 'finished' | 'archived'

export interface ManagedProject {
  id: string
  code: string
  name: string
  desc: string
  status: ProjectStatus
  teams: string[]
  teamIds?: string[]
  memberCount: number
  dataCount: number
  selectedDuration: number
  validDuration: number
  invalidDuration: number
  unselectedDuration: number
  goalCount: number
  actionCount: number
  completionNode: '质检' | '审核' | '验收'
  progress: number
  owner: string
  ownerId?: string
  createdAt: string
  deliveryAt: string
  labelLibraryIds: string[]
  assignmentStrategy?: 'manual_claim' | 'load_balance' | 'round_robin'
}

export interface ProjectPayload {
  projectId?: string
  name: string
  desc: string
  teams: string[]
  owner: string
  deliveryAt: string
  completionNode: ManagedProject['completionNode']
  assignmentStrategy: 'manual_claim' | 'load_balance' | 'round_robin'
  labelLibraryIds: string[]
}

export interface FleetScene {
  scene: string
  taskCount: number
  videoCount: number
  totalDuration: number
}

export interface FleetTask {
  id: number
  externalTaskId: string
  name: string
  path: string
  device: string
  operator: string
  videoCount: number
  syncedCount: number
  availableCount: number
  totalDuration: number
}

export interface FleetPage<T> {
  items: T[]
  page: number
  pageSize: number
  total?: number
}

export interface FleetSyncResult {
  createdCount: number
  updatedCount: number
  items: Array<{ id: number | string; externalTaskId: string; created: boolean }>
}

export interface LabelItem {
  id: string
  name: string
  code: string
  color: string
  appliesTo: 'goal' | 'action' | 'both'
  enabled: boolean
  createdAt: string
}

export interface LabelLibrary {
  id: string
  code: string
  name: string
  desc: string
  enabled: boolean
  createdAt: string
  count: number
  tags: LabelItem[]
}

export interface Team {
  id: string
  name: string
  desc: string
  enabled: boolean
  memberCount: number
}

export interface Member {
  accountId: string
  account: string
  name: string
  email: string
  team: string
  teamId?: string
  roles: string[]
  projects: string[]
  enabled: boolean
  joinedAt: string
}

export interface ProjectDistribution {
  projectId: string
  projectName: string
  memberCount: number
  managerCount: number
  annotatorCount: number
  reviewerCount: number
  qualityCount: number
  acceptorCount: number
  teams: string[]
}

export interface TeamMembersData {
  teams: Team[]
  members: Member[]
  projects: ProjectDistribution[]
}

export interface AnnotationSegment {
  id: string
  sequence: number
  code?: string
  labelCode?: string
  parentId?: string
  type: 'goal' | 'action' | 'no_action'
  segmentType?: 'goal' | 'atomic' | 'no_action'
  startFrame: number
  endFrame: number
  labelId?: string
  labelName?: string
  color: string
  descriptionZh: string
  descriptionEn?: string
  systemCode?: 'NO_ACTION'
  descriptionSource?: 'user' | 'system'
  modelDescriptionRequired?: boolean
  keyFrames?: AnnotationKeyFrame[]
  keyframeNoneConfirmed?: boolean
  nextAtomicSequence?: number
  atomicActions?: AnnotationSegment[]
}

export interface AnnotationKeyFrame {
  id: string
  sequence: number
  frame: number
  type: 'contact' | 'change' | 'abnormal'
  objectName: string
  detail: string
}

export interface AnnotationComment {
  id: string
  sequence: number
  content: string
  frame: number
  location: string
  status: 'open' | 'addressed' | 'resolved'
  stage: TaskNode
  draft: boolean
}

export interface InvalidRange {
  id: string
  sequence: number
  startFrame: number
  endFrame: number
  reason: string
}

export interface AnnotationResult {
  schemaVersion: 'vla-video-hierarchy@11.0.0'
  coordinateSystem: 'zero-based-frame'
  intervalConvention: 'half-open'
  frameRate: number
  totalFrames: number
  mediaStartTime: number
  goals: AnnotationSegment[]
  actions: AnnotationSegment[]
  invalidRanges: InvalidRange[]
  usedAnnotationConfigCodes: string[]
  comments: AnnotationComment[]
  nextGoalSequence: number
  nextActionSequenceByGoal: Record<string, number>
  nextInvalidSequence: number
}

export interface AnnotationWorkspace {
  taskId: string
  taskCode: string
  dataId: string
  dataName: string
  projectId: string
  projectName: string
  node: TaskNode
  readonly: boolean
  videoUrl: string
  frameRate: number
  durationSeconds: number
  mediaStartTime: number
  currentRevision: number
  session?: { sessionId: string; sessionToken: string; leaseVersion: string; heartbeatIntervalSeconds: number }
  labels: LabelItem[]
  labelLibraryBound: boolean
  result: AnnotationResult
}

export type AnnotationDataStatus = 'pending' | 'processing' | 'completed' | 'voided' | 'exception'

export interface AnnotationDataItem {
  id: string
  name: string
  status: AnnotationDataStatus
  statusLabel: string
  node: TaskNode
  workType: 'normal' | 'returned'
  totalDuration: number
  selectedDuration: number
  validDuration: number
  invalidDuration: number
  unselectedDuration: number
  goalCount: number | null
  actionCount: number | null
  ownerName: string
  updatedAt: string
  taskId?: string
}
