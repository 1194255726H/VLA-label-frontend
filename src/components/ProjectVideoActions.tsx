import { Eye } from 'lucide-react'
import type { VideoListItem, TaskNode } from '../types/api'
import { videoAssigned, type VideoTab } from '../utils/projectVideoList'
import { cancellationMessage } from '../utils/videoInvalidation'
import { nodeLabels } from '../utils/node'
import { annotationApi } from '../services/annotationApi'
import { annotationDataApi } from '../services/annotationDataApi'
import { useRef, useState } from 'react'

export function ProjectVideoActions({ video, tab, projectId, accountId, canManage, completionNode, onNavigate, onCopy, onChanged, onMessage }: {
  video: VideoListItem; tab: VideoTab; projectId: string; accountId: string; canManage: boolean; completionNode?: string
  onNavigate: (path: string) => void; onCopy: () => void; onChanged: () => void; onMessage: (message: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const url = `/projects/${encodeURIComponent(video.projectId || projectId)}/videos/${encodeURIComponent(video.id)}/annotation`
  const human = video.stage === 'human_processing'
  const failed = video.stageStatus === 'failed'
  const canProcess = human && (canManage || video.currentAssigneeId === accountId)
  const canCopy = canManage && tab !== 'cancelled'
  const canCancel = canManage && !['completed', 'cancelled'].includes(video.stage || '')
  const missing = '暂不可用：尚未提供此操作的后端接口'
  async function perform(operation: 'retry' | 'cancel') {
    if (busyRef.current) return
    if (operation === 'cancel') {
      const endNode = (Object.keys(nodeLabels) as TaskNode[]).find((key) => nodeLabels[key] === completionNode)
      if (!window.confirm(`确认作废“${video.filename}”？${cancellationMessage({ stage: video.stage, node: video.currentNode, completionNode: endNode })}`)) return
    }
    busyRef.current = true; setBusy(true)
    try {
      if (operation === 'retry') {
        if (!video.preAnnotationJobId) throw new Error('接口未返回预标注任务 ID，无法重试')
        await annotationDataApi.retryPreAnnotation(video.preAnnotationJobId)
        onMessage('已提交重试 AI 预处理')
      } else {
        const result = await annotationApi.cancelVideo(projectId, video.id, human ? video.currentNode : undefined)
        if (!result.cancelled && !result.invalidated) throw new Error('接口未确认作废结果，请刷新后检查')
        onMessage(result.cancelled ? '数据已作废' : '已标记作废并流转到下一节点')
      }
      onChanged()
    } catch (failure) { onMessage(failure instanceof Error ? failure.message : '操作失败') }
    finally { busyRef.current = false; setBusy(false) }
  }
  return <div className="row-actions">
    <button type="button" disabled={busy || !video.id} onClick={() => onNavigate(`${url}?readonly=1`)}><Eye size={15} />查看</button>
    {canProcess && <button type="button" disabled={busy} onClick={() => onNavigate(url)}>处理</button>}
    {canManage && video.stage === 'completed' && <button type="button" disabled={busy} onClick={() => onNavigate(`${url}?invalid_only=1`)}>处理</button>}
    {canManage && human && !videoAssigned(video) && <button type="button" disabled title={missing}>分配</button>}
    {canManage && video.stage === 'pre_annotation' && failed && <button type="button" disabled={busy || !video.preAnnotationJobId} title={!video.preAnnotationJobId ? '接口未返回预标注任务 ID' : undefined} onClick={() => void perform('retry')}>{busy ? '处理中…' : '重试 AI 预处理'}</button>}
    {canManage && video.stage === 'model_description' && failed && <><button type="button" disabled title={missing}>重新生成</button>{(tab === '' || tab === 'abnormal') && <button type="button" disabled title={missing}>人工修改</button>}</>}
    {canManage && video.stage === 'cutting' && failed && (tab === '' || tab === 'abnormal') && <><button type="button" disabled title={missing}>分配返修</button><button type="button" disabled title={missing}>重新切割</button></>}
    {(canCopy || canCancel) && <details className="video-more-actions"><summary>更多操作</summary>
      {canCopy && <button type="button" disabled={busy} onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); onCopy() }}>复制</button>}
      {canManage && human && videoAssigned(video) && (tab === '' || tab === 'human_processing') && <button type="button" disabled title={missing}>释放</button>}
      {canCancel && <button type="button" disabled={busy} onClick={() => void perform('cancel')}>作废</button>}
      {canManage && !['completed', 'cancelled'].includes(video.stage || '') && tab !== 'abnormal' && <button type="button" disabled title={video.stage === 'cutting' ? '视频切分阶段不可删除' : missing}>删除</button>}
    </details>}
  </div>
}
