import type { AnnotationGuideline } from '../types/api'

export function normalizeAnnotationGuideline(value: unknown): AnnotationGuideline | null {
  if (!value || typeof value !== 'object') return null
  const data = value as Record<string, unknown>
  if (data.type !== 'link' && data.type !== 'file') return null
  return { type: data.type, displayName: String(data.display_name || data.displayName || '标注规则'), url: String(data.url || '').trim() }
}
