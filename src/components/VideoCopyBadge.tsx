import type { VideoCopySource } from '../utils/videoCopy'
export function VideoCopyBadge({ video }: { video: VideoCopySource }) {
  if (!video.isCopy) return null
  return <span className="video-copy-badge" title={[video.sourceVideoId ? `复制自 #${video.sourceVideoId}` : '复制数据', video.sourceFleetVideoId ? `原始 Fleet ID：${video.sourceFleetVideoId}` : '', video.copyReason ? `复制原因：${video.copyReason}` : '', video.copiedAt ? `复制时间：${video.copiedAt}` : ''].filter(Boolean).join('\n')}>副本</span>
}
