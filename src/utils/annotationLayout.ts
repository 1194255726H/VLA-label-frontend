export type AnnotationLayout = { videoRatio: number; workspaceRatio: number }

export const ANNOTATION_LAYOUT_STORAGE_KEY = 'ilabel.annotation-layout.v1'
export const DEFAULT_ANNOTATION_LAYOUT: AnnotationLayout = { videoRatio: 0.6, workspaceRatio: 0.65 }
export const LAYOUT_SPLITTER_SIZE = 8

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

export function normalizeAnnotationLayout(value: unknown): AnnotationLayout {
  if (!value || typeof value !== 'object') return { ...DEFAULT_ANNOTATION_LAYOUT }
  const candidate = value as Partial<AnnotationLayout>
  return {
    videoRatio: typeof candidate.videoRatio === 'number' && Number.isFinite(candidate.videoRatio)
      ? clamp(candidate.videoRatio, 0.3, 0.7) : DEFAULT_ANNOTATION_LAYOUT.videoRatio,
    workspaceRatio: typeof candidate.workspaceRatio === 'number' && Number.isFinite(candidate.workspaceRatio)
      ? clamp(candidate.workspaceRatio, 0.35, 0.8) : DEFAULT_ANNOTATION_LAYOUT.workspaceRatio,
  }
}

export function annotationLayoutLimits(width: number, height: number) {
  const availableWidth = Math.max(1, width - LAYOUT_SPLITTER_SIZE)
  const availableHeight = Math.max(1, height - LAYOUT_SPLITTER_SIZE)
  return {
    // On smaller screens, relax pixel minimums while retaining the ratio limits.
    videoMin: Math.max(0.3, Math.min(320, availableWidth * 0.4) / availableWidth),
    videoMax: Math.min(0.7, 1 - Math.min(360, availableWidth * 0.45) / availableWidth),
    workspaceMin: Math.max(0.35, Math.min(240, availableHeight * 0.4) / availableHeight),
    workspaceMax: Math.min(0.8, 1 - Math.min(260, availableHeight * 0.5) / availableHeight),
  }
}

export function fitAnnotationLayout(layout: AnnotationLayout, width: number, height: number): AnnotationLayout {
  const limits = annotationLayoutLimits(width, height)
  return {
    videoRatio: clamp(layout.videoRatio, limits.videoMin, limits.videoMax),
    workspaceRatio: clamp(layout.workspaceRatio, limits.workspaceMin, limits.workspaceMax),
  }
}

export function readAnnotationLayout(): AnnotationLayout {
  try {
    return normalizeAnnotationLayout(JSON.parse(localStorage.getItem(ANNOTATION_LAYOUT_STORAGE_KEY) || 'null'))
  } catch {
    return { ...DEFAULT_ANNOTATION_LAYOUT }
  }
}

export function saveAnnotationLayout(layout: AnnotationLayout) {
  try {
    localStorage.setItem(ANNOTATION_LAYOUT_STORAGE_KEY, JSON.stringify(normalizeAnnotationLayout(layout)))
  } catch {
    // Resizing remains available when browser storage is unavailable or full.
  }
}
