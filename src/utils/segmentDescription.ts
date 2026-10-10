import type { AnnotationSegment } from '../types/api'

export function readSegmentDescriptions(raw: Record<string, unknown>): Partial<AnnotationSegment> {
  const fields: Partial<AnnotationSegment> = {}
  if ('description' in raw || 'description_zh' in raw) fields.descriptionZh = String(raw.description ?? raw.description_zh ?? '')
  if ('description_en' in raw) fields.descriptionEn = String(raw.description_en ?? '')
  for (const [prefix, key] of [['description', 'descriptionCandidatesZh'], ['description_en', 'descriptionCandidatesEn']] as const) {
    if ([1, 2, 3, 4].some((i) => `${prefix}${i}` in raw)) fields[key] = [1, 2, 3, 4].map((i) => String(raw[`${prefix}${i}`] ?? ''))
  }
  return fields
}

export function segmentDescriptionPayload(segment: AnnotationSegment) {
  const fields: Record<string, string> = { description: segment.descriptionZh, description_en: segment.descriptionEn || '' }
  for (const [prefix, candidates] of [['description', segment.descriptionCandidatesZh], ['description_en', segment.descriptionCandidatesEn]] as const) {
    if (candidates) for (let i = 0; i < 4; i++) fields[`${prefix}${i + 1}`] = candidates[i] || ''
  }
  return fields
}

export function hasDescriptionCandidates(segment: AnnotationSegment) {
  return segment.type !== 'no_action' && [...(segment.descriptionCandidatesZh || []), ...(segment.descriptionCandidatesEn || [])].some((text) => text.trim())
}

export function selectedDescriptionChoice(candidates: string[], current: string, saved?: number) {
  if (saved !== undefined && saved >= 0 && saved < 4 && candidates[saved] === current) return saved
  return current ? candidates.findIndex((text) => text === current) : -1
}

export function editSelectedDescriptions(segment: AnnotationSegment, zh: string, en: string): Partial<AnnotationSegment> {
  const changes: Partial<AnnotationSegment> = { descriptionZh: zh, descriptionEn: en }
  for (const [key, choiceKey, current, next] of [
    ['descriptionCandidatesZh', 'descriptionChoiceZh', segment.descriptionZh, zh],
    ['descriptionCandidatesEn', 'descriptionChoiceEn', segment.descriptionEn || '', en],
  ] as const) {
    const candidates = segment[key]
    if (!candidates) continue
    const choice = selectedDescriptionChoice(candidates, current, segment[choiceKey])
    if (choice >= 0) { changes[key] = candidates.map((text, i) => i === choice ? next : text); changes[choiceKey] = choice }
  }
  return changes
}
