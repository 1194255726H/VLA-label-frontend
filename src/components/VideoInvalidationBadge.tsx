import type { VideoListItem } from '../types/api'
import { nodeLabels } from '../utils/node'

export function VideoInvalidationBadge({ video }: { video: Pick<VideoListItem, 'invalidatedAt' | 'invalidatedNode'> }) {
  if (video.invalidatedAt == null) return null
  return <span className="work-type-tag invalidated video-invalidation-badge" title={video.invalidatedNode ? `${nodeLabels[video.invalidatedNode]}环节标记作废` : '已标记作废，等待下游复核'}>预作废</span>
}
