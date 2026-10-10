import type { InvalidIntervalSummary, InvalidRange } from '../types/api'

export function normalizeInvalidIntervalList(value: unknown): InvalidIntervalSummary[] {
  if (!Array.isArray(value)) return []
  return value.filter((item) => item && typeof item === 'object' && item.id != null)
    .map((item) => ({ id: String(item.id), reason: String(item.reason || ''), isSample: item.is_sample === true }))
}

export function summarizeInvalidIntervals(intervals: InvalidIntervalSummary[] = []) {
  const reasons = intervals.map((interval) => {
    const reason = interval.reason.trim()
    return /^其他(?:\s*[:：]|$)/.test(reason) ? '其他' : reason
  }).filter(Boolean)
  return {
    reasons: [...new Set(reasons)].join('、'),
    sampleCount: intervals.filter((interval) => interval.isSample).length,
  }
}

export const invalidReasons = ['手部出框', '严重遮挡', '关键步骤缺失', '其他']

export function normalizeInvalidReason(value: { reason?: unknown; description?: unknown }) {
  const reason = String(value.reason || '').trim()
  const description = String(value.description || '').trim()
  if (invalidReasons.includes(reason)) {
    return { reason, description: reason === '其他' ? description : '' }
  }
  // Older drafts stored free text (or "其他: ...") in both fields.
  const legacyText = reason || description
  if (invalidReasons.includes(legacyText)) return { reason: legacyText, description: '' }
  return { reason: '其他', description: legacyText.replace(/^其他\s*[:：]\s*/, '').trim() }
}

export function formatInvalidReason(value: { reason: string; description?: string }) {
  const { reason, description } = normalizeInvalidReason(value)
  return reason === '其他' && description ? `${reason}: ${description}` : reason
}

export function normalizeInvalidRanges(ranges: InvalidRange[]) {
  const ordered = ranges.map((range) => ({ ...range, ...normalizeInvalidReason(range) }))
    .sort((a, b) => a.startFrame - b.startFrame || a.sequence - b.sequence)
  return ordered.reduce<InvalidRange[]>((merged, range) => {
    const last = merged.at(-1)
    if (last && last.reason === range.reason && last.description === range.description && Boolean(last.isSample) === Boolean(range.isSample) && range.startFrame <= last.endFrame) {
      last.endFrame = Math.max(last.endFrame, range.endFrame)
      if (range.sequence < last.sequence) { last.id = range.id; last.sequence = range.sequence }
    } else merged.push({ ...range })
    return merged
  }, [])
}
