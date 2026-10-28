import type { AnnotationSegment } from '../types/api'

export function readSegmentMeta(raw: Record<string, unknown>): Pick<AnnotationSegment, 'meta'> {
  if (!Object.hasOwn(raw, 'meta')) return {}
  return { meta: raw.meta && typeof raw.meta === 'object' && !Array.isArray(raw.meta) ? raw.meta as Record<string, unknown> : null }
}

export function getSegmentPreAnnotation(segment: AnnotationSegment) {
  const raw = segment.meta?.pre_annotation
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const info = raw as Record<string, unknown>
  const reason = typeof info.reason === 'string' ? info.reason.trim() : ''
  const confidence = typeof info.confidence === 'number' && Number.isFinite(info.confidence) ? info.confidence : undefined
  return reason || confidence !== undefined ? { reason, confidence } : null
}
