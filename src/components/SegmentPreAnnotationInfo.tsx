import type { AnnotationSegment } from '../types/api'
import { getSegmentPreAnnotation } from '../utils/segmentPreAnnotation'

export function SegmentPreAnnotationInfo({ segment }: { segment: AnnotationSegment }) {
  const info = getSegmentPreAnnotation(segment)
  if (!info) return null
  return <div className="segment-pre-annotation" role="row">
    <div className="segment-pre-annotation-content" role="cell">
      {info.reason && <span className="segment-pre-annotation-reason">判断原因：{info.reason}</span>}
      {info.confidence !== undefined && <span className="segment-pre-annotation-confidence">置信度：{info.confidence}</span>}
    </div>
  </div>
}
