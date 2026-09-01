import {
  ArrowLeft, Check, ChevronDown, CircleAlert, Expand, GripVertical, Keyboard, Pause, Play, Plus, Redo2, RotateCcw,
  SkipBack, SkipForward, Trash2, Undo2, X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { BrandLogo } from '../components/BrandLogo'
import { Modal } from '../components/Modal'
import { annotationApi, normalizeAnnotationResult } from '../services/annotationApi'
import { operationObjectApi } from '../services/managementApi'
import type { AnnotationKeyFrame, AnnotationResult, AnnotationSegment, AnnotationWorkspace, OperationObject, SessionResponse, VideoComment } from '../types/api'
import { formatDateTime } from '../utils/date'

const nodeLabels = { annotation: '标注', review: '质检', quality: '审核', acceptance: '验收' }
const TIMELINE_FRAME_WIDTH = 6
const keyFrameTypeLabels: Record<AnnotationKeyFrame['type'], string> = { contact: '接触', object_change: '物体变化', abnormal: '异常' }
const invalidReasons = ['手部出框', '严重遮挡', '关键步骤缺失', '其他']

function sortOperationObjects<T extends OperationObject>(items: T[]) {
  return [...items].sort((left, right) => {
    if (left.approved !== right.approved) return left.approved ? -1 : 1
    const leftTime = Date.parse(left.createdAt) || 0
    const rightTime = Date.parse(right.createdAt) || 0
    return leftTime - rightTime || left.id.localeCompare(right.id, 'zh-CN', { numeric: true })
  })
}

const keyboardShortcuts = [
  { keys: ['Space'], title: '播放 / 暂停', description: '切换当前视频的播放状态' },
  { keys: ['C'], title: '添加批注', description: '按 C 进入十字光标放置模式，单击业务内容确定批注位置；再次按 C 或 Esc 取消' },
  { keys: ['Q'], title: '创建普通动作', description: '暂停时悬停轨道按住 Q 取鼠标起点；播放时从播放头取点，移动后松开生成片段' },
  { keys: ['W'], title: '创建无动作', description: '在小目标轨道按住 W 并移动，松开后创建系统灰色无动作片段；无需选择标签或填写描述' },
  { keys: ['E'], title: '标记关键帧', description: '选中普通小目标并定位视频帧后，标记接触、物体变化或异常事件' },
  { keys: ['X'], title: '标记无效区间', description: '在单次任务轨道未标记的空白位置按住 X，移动后松开并选择无效原因' },
  { keys: ['Backspace', 'Delete'], title: '删除 / 恢复', description: '删除选中的关键帧或标注片段；在单次任务轨道选中无效区间后可删除恢复' },
  { keys: ['Ctrl + Z'], title: '撤销', description: '撤销最近一次时间轴标注操作' },
  { keys: ['Ctrl + Shift + Z'], title: '重做', description: '恢复最近一次被撤销的时间轴标注操作' },
  { keys: ['Esc'], title: '取消 / 退出预览', description: '取消创建或编辑，退出片段预览，也可关闭展开的菜单' },
]

const timelineShortcuts = [
  { keys: ['点击顶部定位带'], title: '定位当前帧', description: '点击红色播放头三角形所在的顶部区域移动当前帧；下方轨道主体用于拖动' },
  { keys: ['拖动色块'], title: '移动 / 调整区间', description: '普通片段按所在轨道编辑；红色无效区间统一在第三行小目标详情轨道移动或调整两侧边缘' },
  { keys: ['两层回显'], title: '一份无效区间', description: '单次任务行显示只读投影，小目标详情行显示可编辑完整色块；全局行不重复展示' },
  { keys: ['拖动播放头'], title: '逐帧定位', description: '拖动红色播放头预览，松开后定位视频画面' },
  { keys: ['滚轮'], title: '平移时间轴', description: '鼠标放在单次任务或小目标轨道：向上前移，向下后移' },
  { keys: ['Alt + 滚轮'], title: '缩放时间轴', description: '在单次任务或小目标轨道以鼠标位置为中心：向上放大，向下缩小' },
  { keys: ['切换单次任务'], title: '恢复小目标视图', description: '进入或切换单次任务时，小目标轨道自动恢复为当前单次任务的完整范围（100%）' },
  { keys: ['拖动蓝色框'], title: '查看前后时间', description: '第一行只读显示单次任务色块分布；拖动蓝色框切换单次任务时间轴当前显示范围' },
  { keys: ['拖动两侧', '双击'], title: '调整范围 / 恢复全部', description: '拖动蓝色框两侧调整显示范围；双击蓝色框恢复完整时间轴（100%）' },
  { keys: ['双击轨道空白'], title: '恢复当前轨道', description: '单次任务轨道恢复整段视频；小目标轨道恢复当前单次任务片段的完整范围' },
]

function ShortcutColumn({ title, items }: { title: string; items: typeof keyboardShortcuts }) {
  return <section className="shortcut-column"><h3>{title}</h3><div className="shortcut-list">{items.map((item) => <article key={`${item.keys.join('-')}-${item.title}`}><div className="shortcut-keys">{item.keys.map((key) => <kbd key={key}>{key}</kbd>)}</div><div><strong>{item.title}</strong><p>{item.description}</p></div></article>)}</div></section>
}

function timeText(seconds: number) {
  const safe = Math.max(0, seconds || 0)
  const minutes = Math.floor(safe / 60)
  return `${String(minutes).padStart(2, '0')}:${(safe % 60).toFixed(3).padStart(6, '0')}`
}

function contrastTextColor(color: string) {
  const match = color.match(/^#([0-9a-f]{6})$/i)
  if (!match) return '#ffffff'
  const value = Number.parseInt(match[1], 16)
  const red = value >> 16
  const green = value >> 8 & 0xff
  const blue = value & 0xff
  return red * 299 + green * 587 + blue * 114 > 160000 ? '#24313a' : '#ffffff'
}

function coverageGaps(startFrame: number, endFrame: number, ranges: Array<{ startFrame: number; endFrame: number }>) {
  const intervals = ranges
    .map((item) => ({ start: Math.max(startFrame, item.startFrame), end: Math.min(endFrame, item.endFrame) }))
    .filter((item) => item.end > item.start).sort((a, b) => a.start - b.start)
  const gaps: Array<{ startFrame: number; endFrame: number }> = []
  let cursor = startFrame
  for (const interval of intervals) { if (interval.start > cursor) gaps.push({ startFrame: cursor, endFrame: interval.start }); cursor = Math.max(cursor, interval.end) }
  if (cursor < endFrame) gaps.push({ startFrame: cursor, endFrame })
  return gaps
}

function normalizeInvalidRanges(ranges: AnnotationResult['invalidRanges']) {
  const ordered = [...ranges].sort((a, b) => a.startFrame - b.startFrame || a.sequence - b.sequence)
  return ordered.reduce<AnnotationResult['invalidRanges']>((merged, range) => {
    const last = merged.at(-1)
    if (last && range.startFrame <= last.endFrame) {
      last.endFrame = Math.max(last.endFrame, range.endFrame)
      if (range.sequence < last.sequence) { last.id = range.id; last.sequence = range.sequence }
    }
    else merged.push({ ...range })
    return merged
  }, [])
}

function firstOverlap(items: Array<{ id: string; startFrame: number; endFrame: number }>) {
  const ordered = [...items].sort((a, b) => a.startFrame - b.startFrame || a.endFrame - b.endFrame)
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index].startFrame < ordered[index - 1].endFrame) return { left: ordered[index - 1], right: ordered[index] }
  }
  return undefined
}

function invalidFrameRange(item: { startFrame: number; endFrame: number }, totalFrames: number) {
  return !Number.isInteger(item.startFrame) || !Number.isInteger(item.endFrame) || item.startFrame < 0 || item.endFrame > totalFrames || item.endFrame - item.startFrame < 1
}

function resolveCreationRange(origin: number, target: number, siblings: Array<{ startFrame: number; endFrame: number }>, domainStart: number, domainEnd: number) {
  const direction = Math.sign(target - origin)
  if (!direction) return undefined
  const ordered = [...siblings].sort((a, b) => a.startFrame - b.startFrame)
  const containing = ordered.find((item) => origin > item.startFrame && origin < item.endFrame)
  const anchor = containing ? (direction > 0 ? containing.endFrame : containing.startFrame) : Math.max(domainStart, Math.min(domainEnd, origin))
  if (direction > 0) {
    const boundary = ordered.find((item) => item.startFrame >= anchor)?.startFrame ?? domainEnd
    const endFrame = Math.min(domainEnd, boundary, Math.max(anchor, target))
    return endFrame > anchor ? { startFrame: anchor, endFrame } : undefined
  }
  const boundary = ordered.filter((item) => item.endFrame <= anchor).at(-1)?.endFrame ?? domainStart
  const startFrame = Math.max(domainStart, boundary, Math.min(anchor, target))
  return anchor > startFrame ? { startFrame, endFrame: anchor } : undefined
}

type TimelineViewport = { startFrame: number; endFrame: number }
type TimelineDraft = { level: 'goal' | 'action' | 'invalid'; startFrame: number; endFrame: number; parentId?: string }
type TimelineEditMode = 'move' | 'start' | 'end'

function clampViewport(domainStart: number, domainEnd: number, startFrame: number, endFrame: number, minimumFrames = 1) {
  const domainSpan = Math.max(1, domainEnd - domainStart)
  const minimumSpan = Math.min(domainSpan, Math.max(1, Math.round(minimumFrames)))
  const span = Math.max(minimumSpan, Math.min(domainSpan, Math.round(endFrame - startFrame)))
  let start = Math.round(startFrame)
  if (start < domainStart) start = domainStart
  if (start + span > domainEnd) start = domainEnd - span
  return { startFrame: start, endFrame: start + span }
}

function niceFrameStep(minimumStep: number) {
  if (minimumStep <= 1) return 1
  const magnitude = 10 ** Math.floor(Math.log10(minimumStep))
  const normalized = minimumStep / magnitude
  const multiplier = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return multiplier * magnitude
}

function frameRulerSteps(frameCount: number, width: number, minorPixels: number) {
  return {
    major: niceFrameStep(frameCount * 56 / Math.max(1, width)),
    minor: niceFrameStep(frameCount * minorPixels / Math.max(1, width)),
  }
}

function wheelDelta(event: React.WheelEvent) {
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1
  return { x: event.deltaX * unit, y: event.deltaY * unit }
}

function viewportFromWheel(domainStart: number, domainEnd: number, viewport: TimelineViewport, event: React.WheelEvent, rect: DOMRect, minimumFrames: number) {
  const span = Math.max(1, viewport.endFrame - viewport.startFrame)
  const delta = wheelDelta(event)
  const dominant = Math.abs(delta.x) > Math.abs(delta.y) ? delta.x : delta.y
  if (!event.altKey) {
    if (span >= domainEnd - domainStart || dominant === 0) return viewport
    const frameDelta = Math.sign(dominant) * Math.max(1, Math.round(span * Math.min(0.5, Math.abs(dominant) / 700)))
    return clampViewport(domainStart, domainEnd, viewport.startFrame + frameDelta, viewport.endFrame + frameDelta, minimumFrames)
  }
  const pointerRatio = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)))
  const anchorFrame = viewport.startFrame + pointerRatio * span
  const exponent = Math.max(-0.5, Math.min(0.5, dominant * 0.0018))
  const domainSpan = Math.max(1, domainEnd - domainStart)
  const nextSpan = Math.max(Math.min(domainSpan, minimumFrames), Math.min(domainSpan, Math.round(span * Math.exp(exponent))))
  const nextStart = anchorFrame - pointerRatio * nextSpan
  return clampViewport(domainStart, domainEnd, nextStart, nextStart + nextSpan, minimumFrames)
}

function frameFromPointer(clientX: number, rect: Pick<DOMRect, 'left' | 'width'>, viewport: TimelineViewport) {
  const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)))
  return Math.max(viewport.startFrame, Math.min(viewport.endFrame, Math.round(viewport.startFrame + ratio * (viewport.endFrame - viewport.startFrame))))
}

function revealRange(domainStart: number, domainEnd: number, viewport: TimelineViewport, startFrame: number, endFrame: number, minimumFrames = 1) {
  const normalized = clampViewport(domainStart, domainEnd, viewport.startFrame, viewport.endFrame, minimumFrames)
  const span = normalized.endFrame - normalized.startFrame
  if (startFrame >= normalized.startFrame && endFrame <= normalized.endFrame) return normalized
  if (startFrame < normalized.startFrame && endFrame > normalized.startFrame) return clampViewport(domainStart, domainEnd, startFrame, startFrame + span, minimumFrames)
  if (startFrame < normalized.endFrame && endFrame > normalized.endFrame) return clampViewport(domainStart, domainEnd, endFrame - span, endFrame, minimumFrames)
  const nextStart = startFrame - Math.round(span * .1)
  return clampViewport(domainStart, domainEnd, nextStart, nextStart + span, minimumFrames)
}

function followFrame(domainStart: number, domainEnd: number, viewport: TimelineViewport, frame: number, minimumFrames = 1) {
  const normalized = clampViewport(domainStart, domainEnd, viewport.startFrame, viewport.endFrame, minimumFrames)
  const span = normalized.endFrame - normalized.startFrame
  const ratio = (frame - normalized.startFrame) / Math.max(1, span)
  if (ratio > .8) return clampViewport(domainStart, domainEnd, frame - Math.round(span * .65), frame + Math.round(span * .35), minimumFrames)
  if (ratio < .1) return clampViewport(domainStart, domainEnd, frame - Math.round(span * .2), frame + Math.round(span * .8), minimumFrames)
  return normalized
}

function sameViewport(left: TimelineViewport, right: TimelineViewport) {
  return left.startFrame === right.startFrame && left.endFrame === right.endFrame
}

function segmentNumber(item: AnnotationSegment, fallbackIndex: number) {
  const suffix = item.type === 'goal'
    ? item.code?.match(/(?:^|-)(\d{3})$/)?.[1]
    : item.code?.match(/(?:^|-)(\d{3}-A\d{3})$/)?.[1]
  if (suffix) return suffix
  const sequence = String(item.sequence || fallbackIndex + 1).padStart(3, '0')
  return item.type === 'goal' ? sequence : `A${sequence}`
}

function TimelineLane({ level, label, items, childItems = [], draft, totalFrames, rangeStartFrame = 0, rangeEndFrame = totalFrames, viewport, frameRate, currentFrame, selectedId, invalidRanges, readonly, showPlayhead, onSeek, onScrubStart, onScrubPreview, onScrubEnd, onSelect, onSelectInvalid, onPreciseSeek, onHover, onEditStart, onSegmentPreview, onInvalidPreview, onEditFinish, onViewportChange }: {
  level: 'goal' | 'action'
  label: string; items: AnnotationSegment[]; totalFrames: number; rangeStartFrame?: number; rangeEndFrame?: number; currentFrame: number; selectedId?: string
  childItems?: AnnotationSegment[]; draft?: TimelineDraft
  viewport?: TimelineViewport
  frameRate: number; invalidRanges?: AnnotationResult['invalidRanges']; readonly?: boolean; onSeek: (frame: number) => void; onSelect: (item: AnnotationSegment, clickedFrame?: number) => void
  onSelectInvalid?: (range: AnnotationResult['invalidRanges'][number]) => void
  onPreciseSeek?: (level: 'goal' | 'action', frame: number) => void
  onScrubStart?: () => boolean; onScrubPreview?: (frame: number) => void; onScrubEnd?: (frame: number, restorePlayback: boolean) => void
  onHover?: (frame?: number) => void
  showPlayhead?: boolean
  onEditStart?: (label: string) => void
  onSegmentPreview?: (item: AnnotationSegment, startFrame: number, endFrame: number, mode: TimelineEditMode) => TimelineViewport | undefined
  onInvalidPreview?: (range: AnnotationResult['invalidRanges'][number], startFrame: number, endFrame: number, mode: TimelineEditMode) => void
  onEditFinish?: (commit: boolean) => void
  onViewportChange?: (viewport: TimelineViewport) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const suppressClickRef = useRef(false)
  const lastSegmentClickRef = useRef<{ id: string; at: number; x: number; y: number } | undefined>(undefined)
  const [trackWidth, setTrackWidth] = useState(900)
  const [panning, setPanning] = useState(false)
  const domainStart = Math.max(0, Math.min(totalFrames, rangeStartFrame))
  const domainEnd = Math.max(domainStart, Math.min(totalFrames, rangeEndFrame))
  const minimumFrames = Math.max(1, Math.floor(trackWidth / TIMELINE_FRAME_WIDTH))
  const normalizedViewport = clampViewport(domainStart, domainEnd, viewport?.startFrame ?? domainStart, viewport?.endFrame ?? domainEnd, minimumFrames)
  const safeStart = normalizedViewport.startFrame
  const safeEnd = normalizedViewport.endFrame
  const safeSpan = Math.max(1, safeEnd - safeStart)
  const domainSpan = Math.max(1, domainEnd - domainStart)
  const zoomRatio = Math.max(1, domainSpan / safeSpan)
  const pixelsPerFrame = trackWidth / safeSpan
  const { major: majorRulerStep, minor: minorRulerStep } = frameRulerSteps(safeSpan, trackWidth, TIMELINE_FRAME_WIDTH)
  const firstTick = Math.ceil(safeStart / minorRulerStep) * minorRulerStep
  const rulerFrames: number[] = []
  for (let frame = firstTick; frame <= safeEnd; frame += minorRulerStep) rulerFrames.push(frame)
  if (level === 'action') {
    if (!rulerFrames.includes(safeStart)) rulerFrames.unshift(safeStart)
    if (!rulerFrames.includes(safeEnd)) rulerFrames.push(safeEnd)
  }
  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    const updateWidth = () => setTrackWidth(track.clientWidth || 900)
    updateWidth()
    const observer = new ResizeObserver(updateWidth)
    observer.observe(track)
    return () => observer.disconnect()
  }, [])
  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    if (!onViewportChange || domainEnd <= domainStart) return
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect?.width) return
    event.preventDefault()
    onViewportChange(viewportFromWheel(domainStart, domainEnd, normalizedViewport, event, rect, minimumFrames))
  }
  function startViewportPan(event: React.PointerEvent<HTMLElement>) {
    if (!onViewportChange || safeSpan >= domainSpan || event.button !== 0 || (event.target as HTMLElement).closest('.range-handle')) return
    event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId)
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect?.width) return
    const panTrackWidth = rect.width
    const originX = event.clientX
    const origin = normalizedViewport
    let dragged = false
    setPanning(true)
    function move(pointer: PointerEvent) {
      const pixels = pointer.clientX - originX
      if (Math.abs(pixels) >= 3) dragged = true
      const delta = Math.round(-pixels / panTrackWidth * safeSpan)
      const nextViewport = clampViewport(domainStart, domainEnd, origin.startFrame + delta, origin.endFrame + delta, minimumFrames)
      onViewportChange?.(nextViewport)
    }
    function cleanup() {
      suppressClickRef.current = dragged
      setPanning(false)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('blur', cancel)
      window.removeEventListener('keydown', keydown)
    }
    function end() { cleanup() }
    function cancel() { onViewportChange?.(origin); cleanup() }
    function keydown(key: KeyboardEvent) { if (key.key === 'Escape') cancel() }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('blur', cancel)
    window.addEventListener('keydown', keydown)
  }
  function startRangeDrag(event: React.PointerEvent<HTMLButtonElement>, item: AnnotationSegment) {
    const target = event.target as HTMLElement
    const handle = target.closest<HTMLElement>('.range-handle')
    if (readonly || !onSegmentPreview || selectedId !== item.id) return
    event.preventDefault(); event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const rect = event.currentTarget.parentElement?.getBoundingClientRect(); if (!rect) return
    const trackWidth = rect.width
    const mode: TimelineEditMode = handle?.dataset.handle === 'start' ? 'start' : handle?.dataset.handle === 'end' ? 'end' : 'move'
    const originX = event.clientX; const originStart = item.startFrame; const originEnd = item.endFrame
    const playheadInside = currentFrame >= originStart && currentFrame < originEnd
    const moveAnchorFrame = playheadInside ? currentFrame : originStart
    const moveAnchorOffset = moveAnchorFrame - originStart
    let changed = false
    onEditStart?.(`${mode === 'move' ? '移动' : mode === 'start' ? '调整起点' : '调整终点'} ${item.code || ''}`)
    function move(pointer: PointerEvent) {
      const delta = Math.round((pointer.clientX - originX) / trackWidth * safeSpan)
      if (mode === 'move' && Math.abs(pointer.clientX - originX) <= 5) return
      const startFrame = mode === 'end' ? originStart : originStart + delta
      const endFrame = mode === 'start' ? originEnd : originEnd + delta
      changed = changed || startFrame !== originStart || endFrame !== originEnd
      const preview = onSegmentPreview?.(item, startFrame, endFrame, mode)
      const actualStart = preview?.startFrame ?? startFrame
      const actualEnd = preview?.endFrame ?? endFrame
      onSeek(mode === 'move' ? actualStart + moveAnchorOffset : mode === 'start' ? actualStart : actualEnd)
    }
    function cleanup() { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', cancel); window.removeEventListener('blur', cancel); window.removeEventListener('keydown', keydown) }
    function end() {
      suppressClickRef.current = changed
      cleanup()
      onEditFinish?.(changed)
    }
    function cancel() { cleanup(); onEditFinish?.(false) }
    function keydown(key: KeyboardEvent) { if (key.key === 'Escape') cancel() }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', end); window.addEventListener('pointercancel', cancel); window.addEventListener('blur', cancel); window.addEventListener('keydown', keydown)
  }
  function startInvalidDrag(event: React.PointerEvent<HTMLButtonElement>, range: AnnotationResult['invalidRanges'][number]) {
    const handle = (event.target as HTMLElement).closest<HTMLElement>('.range-handle')
    if (readonly || !onInvalidPreview || selectedId !== `invalid:${range.id}`) return
    event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId)
    const rect = event.currentTarget.parentElement?.getBoundingClientRect(); if (!rect) return
    const mode: TimelineEditMode = handle?.dataset.handle === 'start' ? 'start' : handle?.dataset.handle === 'end' ? 'end' : 'move'
    const originX = event.clientX; const originStart = range.startFrame; const originEnd = range.endFrame; let changed = false
    onEditStart?.(`${mode === 'move' ? '移动' : mode === 'start' ? '调整起点' : '调整终点'}无效区间`)
    function move(pointer: PointerEvent) {
      if (mode === 'move' && Math.abs(pointer.clientX - originX) <= 5) return
      const delta = Math.round((pointer.clientX - originX) / trackWidth * safeSpan)
      const startFrame = mode === 'end' ? originStart : originStart + delta
      const endFrame = mode === 'start' ? originEnd : originEnd + delta
      changed = changed || startFrame !== originStart || endFrame !== originEnd
      onInvalidPreview?.(range, startFrame, endFrame, mode)
    }
    function cleanup() { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', cancel); window.removeEventListener('blur', cancel); window.removeEventListener('keydown', keydown) }
    function end() { suppressClickRef.current = changed; cleanup(); onEditFinish?.(changed) }
    function cancel() { cleanup(); onEditFinish?.(false) }
    function keydown(key: KeyboardEvent) { if (key.key === 'Escape') cancel() }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', end); window.addEventListener('pointercancel', cancel); window.addEventListener('blur', cancel); window.addEventListener('keydown', keydown)
  }
  function startPlayheadScrub(event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId)
    const bounds = trackRef.current?.getBoundingClientRect(); if (!bounds) return
    const rect = { left: bounds.left, right: bounds.right, width: bounds.width }
    const restorePlayback = onScrubStart?.() || false
    let frame = frameFromPointer(event.clientX, rect, normalizedViewport)
    let lastPreview = 0
    function move(pointer: PointerEvent) {
      frame = frameFromPointer(pointer.clientX, rect, normalizedViewport)
      const now = performance.now()
      if (now - lastPreview >= 1000 / 15) { lastPreview = now; onScrubPreview?.(frame) }
    }
    function cleanup() { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', cancel) }
    function end() { cleanup(); onScrubEnd?.(frame, restorePlayback) }
    function cancel() { cleanup(); onScrubEnd?.(currentFrame, restorePlayback) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', end); window.addEventListener('pointercancel', cancel)
  }
  return <div className={`annotation-lane ${level}-lane`}><span className="annotation-lane-label">{label}</span><div ref={trackRef} className={`annotation-track${panning ? ' panning' : ''}`} title={`${label}时间轴 · ${zoomRatio.toFixed(2)} 倍 · F${safeStart} - F${safeEnd}`} onWheel={handleWheel} onDoubleClick={(event) => { if (!(event.target as HTMLElement).closest('.timeline-block,.invalid-block')) onViewportChange?.({ startFrame: domainStart, endFrame: domainEnd }) }} onPointerMove={(event) => { const rect = event.currentTarget.getBoundingClientRect(); onHover?.(frameFromPointer(event.clientX, rect, normalizedViewport)) }} onPointerLeave={() => onHover?.()} onClick={() => {
    if (suppressClickRef.current) { suppressClickRef.current = false; return }
  }} onPointerDown={(event) => {
    if ((event.target as HTMLElement).closest('.timeline-block,.invalid-block')) return
    startViewportPan(event)
  }}>
    <button type="button" className="timeline-seek-strip" aria-label={`${label}时间定位区域`} title="点击定位当前帧" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); const rect = trackRef.current?.getBoundingClientRect(); if (rect) onSeek(frameFromPointer(event.clientX, rect, normalizedViewport)) }} onDoubleClick={(event) => event.stopPropagation()} />
    {(level === 'action' || zoomRatio >= 2) && <div className="timeline-ruler" aria-hidden="true">{rulerFrames.map((frame) => { const major = frame === safeStart || frame === safeEnd || frame % majorRulerStep === 0; const onDark = invalidRanges?.some((range) => frame >= range.startFrame && frame < range.endFrame) || items.some((item) => selectedId === item.id && frame >= item.startFrame && frame < item.endFrame); const pixel = Math.min(trackWidth - 1, Math.max(0, Math.round((frame - safeStart) / safeSpan * trackWidth))); return <i className={`${major ? 'major' : 'minor'}${onDark ? ' on-dark' : ''}`} key={frame} style={{ left: pixel }} /> })}</div>}
    <span className="timeline-zoom-readout">{zoomRatio.toFixed(zoomRatio < 10 ? 2 : 1)}x · {safeSpan}帧 · {pixelsPerFrame.toFixed(1)}px/帧</span>
    {level === 'goal' && invalidRanges?.flatMap((range) => {
      const visibleStart = Math.max(safeStart, range.startFrame)
      const visibleEnd = Math.min(safeEnd, range.endFrame)
      return visibleEnd > visibleStart ? [<button type="button" className={`invalid-block${selectedId === `invalid:${range.id}` ? ' selected' : ''}${range.startFrame < safeStart ? ' clipped-start' : ''}${range.endFrame > safeEnd ? ' clipped-end' : ''}`} key={range.id} title={`无效：${range.reason} · 点击选中后按 Backspace 或 Delete 删除`} aria-label={`视频无效区间 ${range.reason}，F${range.startFrame} 至 F${range.endFrame}`} style={{ left: `${(visibleStart - safeStart) / safeSpan * 100}%`, right: `${(safeEnd - visibleEnd) / safeSpan * 100}%` }} onPointerDown={(event) => startInvalidDrag(event, range)} onClick={(event) => { event.stopPropagation(); onSelectInvalid?.(range) }}><span className="invalid-block-label">{range.reason}</span>{selectedId === `invalid:${range.id}` && !readonly && <><i className="range-handle start" data-handle="start" /><i className="range-handle end" data-handle="end" /></>}</button>] : []
    })}
    {items.flatMap((item, index) => {
      const visibleStart = Math.max(safeStart, item.startFrame)
      const visibleEnd = Math.min(safeEnd, item.endFrame)
      if (visibleEnd <= visibleStart) return []
      const number = segmentNumber(item, index)
      const children = item.type === 'goal' ? childItems.filter((child) => child.parentId === item.id) : []
      const childDraft = item.type === 'goal' && draft?.level === 'action' && draft.parentId === item.id ? draft : undefined
      return [<button className={`timeline-block ${item.type}${children.length || childDraft ? ' has-child-overview' : ''}${selectedId === item.id ? ' selected' : ''}${item.startFrame < safeStart ? ' clipped-start' : ''}${item.endFrame > safeEnd ? ' clipped-end' : ''}`} type="button" key={item.id} title={`${item.code || number} · ${item.labelName || (item.type === 'no_action' ? '无标签' : '未选择标签')}`} style={{ left: `${(visibleStart - safeStart) / safeSpan * 100}%`, right: `${(safeEnd - visibleEnd) / safeSpan * 100}%`, '--segment-color': item.color } as React.CSSProperties} onPointerDown={(event) => {
        if (event.button !== 0) return
        if (selectedId !== item.id) {
          // Selection must not depend on the later click event: a preceding pan/drag
          // may intentionally suppress that click and used to make action blocks
          // appear unresponsive.
          suppressClickRef.current = false
          event.stopPropagation()
          const rect = event.currentTarget.parentElement?.getBoundingClientRect()
          onSelect(item, rect ? frameFromPointer(event.clientX, rect, normalizedViewport) : undefined)
          return
        }
        startRangeDrag(event, item)
      }} onClick={(event) => { event.stopPropagation(); if (suppressClickRef.current) { suppressClickRef.current = false; return }; const now = performance.now(); const previous = lastSegmentClickRef.current; const precise = previous?.id === item.id && now - previous.at <= 400 && Math.hypot(event.clientX - previous.x, event.clientY - previous.y) <= 6 && !(event.target as HTMLElement).closest('.range-handle'); lastSegmentClickRef.current = precise ? undefined : { id: item.id, at: now, x: event.clientX, y: event.clientY }; const rect = event.currentTarget.parentElement!.getBoundingClientRect(); const clickedFrame = frameFromPointer(event.clientX, rect, normalizedViewport); if (precise) { onPreciseSeek?.(level, clickedFrame); return } onSelect(item, clickedFrame) }}><span className="timeline-block-bar"><span className="timeline-block-copy">{number} · {item.endFrame - item.startFrame}帧{item.type === 'goal' && ` · ${timeText((item.endFrame - item.startFrame) / frameRate)}`}</span>{item.keyFrames?.map((frame) => <i className="timeline-keyframe" key={frame.id} style={{ left: `${(frame.frame - item.startFrame) / Math.max(1, item.endFrame - item.startFrame) * 100}%` }} />)}{item.type === 'goal' && <span className="timeline-child-overview" aria-hidden="true">{children.map((child) => <i key={child.id} style={{ left: `${(child.startFrame - item.startFrame) / Math.max(1, item.endFrame - item.startFrame) * 100}%`, width: `${(child.endFrame - child.startFrame) / Math.max(1, item.endFrame - item.startFrame) * 100}%`, '--child-color': child.color } as React.CSSProperties} />)}{invalidRanges?.filter((range) => range.startFrame < item.endFrame && range.endFrame > item.startFrame).map((range) => <i className="invalid" key={range.id} style={{ left: `${(Math.max(range.startFrame, item.startFrame) - item.startFrame) / Math.max(1, item.endFrame - item.startFrame) * 100}%`, width: `${(Math.min(range.endFrame, item.endFrame) - Math.max(range.startFrame, item.startFrame)) / Math.max(1, item.endFrame - item.startFrame) * 100}%` }} />)}{childDraft && (() => { const draftStart = Math.max(item.startFrame, childDraft.startFrame); const draftEnd = Math.min(item.endFrame, childDraft.endFrame); return draftEnd > draftStart ? <i className="draft" style={{ left: `${(draftStart - item.startFrame) / Math.max(1, item.endFrame - item.startFrame) * 100}%`, width: `${(draftEnd - draftStart) / Math.max(1, item.endFrame - item.startFrame) * 100}%` }} /> : null })()}</span>}</span>{selectedId === item.id && !readonly && <><i className="range-handle start" data-handle="start" /><i className="range-handle end" data-handle="end" /></>}</button>]
    })}
    {items.flatMap((item) => (item.keyFrames || []).filter((keyFrame) => keyFrame.frame >= safeStart && keyFrame.frame < safeEnd).map((keyFrame) => <i className="timeline-keyframe-overlay" aria-hidden="true" key={`${item.id}:${keyFrame.id}`} style={{ left: `${(keyFrame.frame - safeStart) / safeSpan * 100}%` }} />))}
    {draft && (draft.level === (label === '单次任务' ? 'goal' : 'action') || level === 'goal' && draft.level === 'invalid') && draft.endFrame >= safeStart && draft.startFrame <= safeEnd && <span className={`timeline-draft${draft.level === 'invalid' ? ' invalid' : ''}`} style={{ left: `${(Math.max(safeStart, draft.startFrame) - safeStart) / safeSpan * 100}%`, width: `${Math.max(1, Math.min(safeEnd, draft.endFrame) - Math.max(safeStart, draft.startFrame)) / safeSpan * 100}%` }} />}
    {!items.length && <span className="timeline-empty-hint">{label === '单次任务' ? '暂无单次任务片段' : '暂无小目标片段'}</span>}
    {showPlayhead && currentFrame >= safeStart && currentFrame <= safeEnd && <button type="button" className="annotation-playhead" aria-label={`${label}播放头 F${currentFrame}`} style={{ left: `${(currentFrame - safeStart) / safeSpan * 100}%` }} onPointerDown={startPlayheadScrub} />}
    <span className="timeline-boundary start">{timeText(safeStart / frameRate)}</span><span className="timeline-boundary end">{timeText(safeEnd / frameRate)}</span>
  </div></div>
}

function GlobalTimeline({ goals, invalidRanges, draft, selectedRange, totalFrames, frameRate, currentFrame, viewport, onViewportChange, onSeek, onScrubStart, onScrubPreview, onScrubEnd, onClearSelection }: {
  goals: AnnotationSegment[]; invalidRanges: AnnotationResult['invalidRanges']; draft?: TimelineDraft; selectedRange?: { startFrame: number; endFrame: number }
  totalFrames: number; frameRate: number; currentFrame: number; viewport: TimelineViewport
  onViewportChange: (viewport: TimelineViewport) => void; onSeek: (frame: number) => void; onScrubStart: () => boolean; onScrubPreview: (frame: number) => void; onScrubEnd: (frame: number, restorePlayback: boolean) => void; onClearSelection: () => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const safeTotal = Math.max(1, totalFrames)
  const normalized = clampViewport(0, totalFrames, viewport.startFrame, viewport.endFrame)
  const zoomRatio = Math.max(1, totalFrames / Math.max(1, normalized.endFrame - normalized.startFrame))
  function startViewportDrag(event: React.PointerEvent<HTMLSpanElement>) {
    event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId)
    const track = event.currentTarget.parentElement?.getBoundingClientRect(); if (!track) return
    const trackWidth = track.width
    const target = event.target as HTMLElement
    const mode = target.dataset.viewportHandle === 'start' ? 'start' : target.dataset.viewportHandle === 'end' ? 'end' : 'move'
    const originX = event.clientX; const origin = normalized; const span = origin.endFrame - origin.startFrame
    function move(pointer: PointerEvent) {
      const delta = Math.round((pointer.clientX - originX) / trackWidth * safeTotal)
      const minimum = Math.max(1, Math.floor(trackWidth / TIMELINE_FRAME_WIDTH))
      if (mode === 'start') onViewportChange(clampViewport(0, totalFrames, origin.startFrame + delta, origin.endFrame, minimum))
      else if (mode === 'end') onViewportChange(clampViewport(0, totalFrames, origin.startFrame, origin.endFrame + delta, minimum))
      else onViewportChange(clampViewport(0, totalFrames, origin.startFrame + delta, origin.startFrame + delta + span, minimum))
    }
    function cleanup() { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', cancel); window.removeEventListener('blur', cancel); window.removeEventListener('keydown', keydown) }
    function end() { cleanup() }
    function cancel() { onViewportChange(origin); cleanup() }
    function keydown(key: KeyboardEvent) { if (key.key === 'Escape') cancel() }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', end); window.addEventListener('pointercancel', cancel); window.addEventListener('blur', cancel); window.addEventListener('keydown', keydown)
  }
  function keydown(event: React.KeyboardEvent<HTMLDivElement>) {
    const oneSecond = Math.max(1, Math.round(frameRate))
    if (['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp', 'Home', 'End'].includes(event.key)) event.preventDefault()
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') onSeek(currentFrame - (event.shiftKey ? oneSecond : 1))
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') onSeek(currentFrame + (event.shiftKey ? oneSecond : 1))
    if (event.key === 'Home') onSeek(0)
    if (event.key === 'End') onSeek(totalFrames)
  }
  function startGlobalScrub(event: React.PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest('.timeline-viewport')) return
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.focus(); onClearSelection()
    const rect = event.currentTarget.getBoundingClientRect(); const full = { startFrame: 0, endFrame: totalFrames }
    const restorePlayback = onScrubStart(); let frame = frameFromPointer(event.clientX, rect, full); let lastPreview = 0
    onScrubPreview(frame)
    function move(pointer: PointerEvent) { frame = frameFromPointer(pointer.clientX, rect, full); const now = performance.now(); if (now - lastPreview >= 1000 / 15) { lastPreview = now; onScrubPreview(frame) } }
    function cleanup() { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', cancel) }
    function end() { cleanup(); onScrubEnd(frame, restorePlayback) }
    function cancel() { cleanup(); onScrubEnd(currentFrame, restorePlayback) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', end); window.addEventListener('pointercancel', cancel)
  }
  return <div className="annotation-lane global-lane"><span className="annotation-lane-label">全局</span><div ref={trackRef} className="global-progress" tabIndex={0} role="slider" aria-label="全局视频时间轴" aria-valuemin={0} aria-valuemax={totalFrames} aria-valuenow={currentFrame} onKeyDown={keydown} onPointerDown={startGlobalScrub}>
    <span className="global-progress-fill" style={{ transform: `scaleX(${Math.max(0, Math.min(1, currentFrame / safeTotal))})` }} />
    <span className="global-goal-overview" aria-hidden="true">{goals.map((goal) => <i key={goal.id} style={{ left: `${goal.startFrame / safeTotal * 100}%`, width: `${(goal.endFrame - goal.startFrame) / safeTotal * 100}%`, '--overview-color': goal.color } as React.CSSProperties} />)}{draft?.level === 'goal' && <i className="draft" style={{ left: `${draft.startFrame / safeTotal * 100}%`, width: `${Math.max(1, draft.endFrame - draft.startFrame) / safeTotal * 100}%` }} />}</span>
    <span className="global-invalid-overview" aria-hidden="true">{invalidRanges.map((range) => <i key={range.id} style={{ left: `${range.startFrame / safeTotal * 100}%`, width: `${(range.endFrame - range.startFrame) / safeTotal * 100}%` }} />)}</span>
    {selectedRange && <span className="global-selected-range" style={{ left: `${selectedRange.startFrame / safeTotal * 100}%`, right: `${(totalFrames - selectedRange.endFrame) / safeTotal * 100}%` }} />}
    <span className="global-time start">00:00.000</span><span className="global-time current" style={{ left: `${Math.max(4, Math.min(96, currentFrame / safeTotal * 100))}%` }}>{timeText(currentFrame / frameRate)}</span><span className="global-time end">{timeText(totalFrames / frameRate)}</span>
    <span className={`timeline-viewport${zoomRatio === 1 ? ' full' : ''}`} style={{ left: `${normalized.startFrame / safeTotal * 100}%`, width: `${(normalized.endFrame - normalized.startFrame) / safeTotal * 100}%` }} onPointerDown={startViewportDrag} onClick={(event) => event.stopPropagation()} title={`视窗 ${zoomRatio.toFixed(2)} 倍 · F${normalized.startFrame} - F${normalized.endFrame}`}><i data-viewport-handle="start" /><b>{Math.round(zoomRatio * 100)}%</b><i data-viewport-handle="end" /></span>
    <span className="annotation-playhead overview" style={{ left: `${currentFrame / safeTotal * 100}%` }} />
  </div></div>
}

export function VideoAnnotationPage({ session }: { session: SessionResponse }) {
  const { projectId = '', videoId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const videoRef = useRef<HTMLVideoElement>(null)
  const scrubVideoRef = useRef<HTMLVideoElement>(null)
  const commentDialogRef = useRef<HTMLDivElement>(null)
  const commentDragRef = useRef<{ offsetX: number; offsetY: number } | null>(null)
  const undoStack = useRef<AnnotationResult[]>([])
  const redoStack = useRef<AnnotationResult[]>([])
  const editSnapshotRef = useRef<AnnotationResult | undefined>(undefined)
  const editResultRef = useRef<AnnotationResult | undefined>(undefined)
  const editViewportSnapshotRef = useRef<Record<string, TimelineViewport> | undefined>(undefined)
  const [workspace, setWorkspace] = useState<AnnotationWorkspace>()
  const [result, setResult] = useState<AnnotationResult>()
  const [revision, setRevision] = useState(0)
  const [selectedId, setSelectedId] = useState<string>()
  const [selectedLevel, setSelectedLevel] = useState<'goal' | 'action' | 'invalid'>()
  const [activeGoalId, setActiveGoalId] = useState<string>()
  const [currentFrame, setCurrentFrame] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [rate, setRate] = useState(1)
  const [mark, setMark] = useState<{ kind: 'goal' | 'action' | 'no_action' | 'invalid'; frame: number }>()
  const [history, setHistory] = useState({ undo: 0, redo: 0 })
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [returning, setReturning] = useState(false)
  const [cancellingVideo, setCancellingVideo] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [errorCode, setErrorCode] = useState('')
  const [workspaceReloadKey, setWorkspaceReloadKey] = useState(0)
  const [videoLockState, setVideoLockState] = useState<'checking' | 'loading' | 'held' | 'lost' | 'stopped'>('checking')
  const [toast, setToast] = useState('')
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [videoComments, setVideoComments] = useState<VideoComment[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentFilter, setCommentFilter] = useState<'all' | 'pending' | 'resolved'>('all')
  const [commentDialogPosition, setCommentDialogPosition] = useState<{ x: number; y: number }>()
  const [commentPlacementMode, setCommentPlacementMode] = useState(false)
  const [commentPoint, setCommentPoint] = useState<{ x: number; y: number }>()
  const [commentSubmitting, setCommentSubmitting] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [commentDraft, setCommentDraft] = useState('')
  const [keyFrameModalOpen, setKeyFrameModalOpen] = useState(false)
  const [editingKeyFrame, setEditingKeyFrame] = useState<AnnotationKeyFrame>()
  const [keyFrameForm, setKeyFrameForm] = useState<{ type: AnnotationKeyFrame['type']; operationObjectIds: string[]; detail: string }>({ type: 'contact', operationObjectIds: [], detail: '' })
  const [operationObjects, setOperationObjects] = useState<Array<OperationObject & { libraryName: string }>>([])
  const [operationObjectsLoading, setOperationObjectsLoading] = useState(false)
  const [candidateModalOpen, setCandidateModalOpen] = useState(false)
  const [candidateForm, setCandidateForm] = useState({ name: '', alias: '', attribute: '' })
  const [candidateSaving, setCandidateSaving] = useState(false)
  const [submitIssue, setSubmitIssue] = useState<
    | { type: 'goal-gap'; gaps: Array<{ startFrame: number; endFrame: number }> }
    | { type: 'action-gap'; goal: AnnotationSegment; gaps: Array<{ startFrame: number; endFrame: number }> }
    | { type: 'missing-object'; action: AnnotationSegment; title: string }
  >()
  const [pendingInvalidRange, setPendingInvalidRange] = useState<{ startFrame: number; endFrame: number }>()
  const [editingInvalidRangeId, setEditingInvalidRangeId] = useState<string>()
  const [invalidReason, setInvalidReason] = useState(invalidReasons[0])
  const [invalidReasonOther, setInvalidReasonOther] = useState('')
  const [inspectorTab, setInspectorTab] = useState<'segments' | 'invalid'>('segments')
  const [hoverPoint, setHoverPoint] = useState<{ level: 'goal' | 'action'; frame: number }>()
  const [goalViewport, setGoalViewport] = useState<TimelineViewport>({ startFrame: 0, endFrame: 0 })
  const [atomicViewports, setAtomicViewports] = useState<Record<string, TimelineViewport>>({})
  const [editing, setEditing] = useState<string>()
  const [scrubbing, setScrubbing] = useState(false)
  const cancelPermissionIdentities = [...session.account.roles, ...session.account.roleLabels]
    .map((value) => value.toLowerCase().replace(/[\s_-]/g, ''))
  const canCancelVideo = Boolean(session.account.isStaff || session.account.isSuperuser || cancelPermissionIdentities.some((value) => ['admin', 'projectmanager', 'systemadmin', '管理员', '项目经理', '超级管理员'].includes(value)))
  const isVideoLockError = ['video_locked', 'video_heartbeat_failed'].includes(errorCode)

  useEffect(() => {
    let active = true
    async function acquireLock() {
      let lastError: unknown
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try { return await annotationApi.videoHeartbeat(videoId, session.account.id) }
        catch (reason) { lastError = reason; if (attempt < 2) await new Promise((resolve) => window.setTimeout(resolve, (attempt + 1) * 750)) }
      }
      throw lastError
    }
    async function loadWorkspace() {
      await Promise.resolve()
      if (!active) return
      setWorkspace(undefined); setResult(undefined); setVideoComments([]); setOperationObjects([]); setCommentsOpen(false); setCommentPlacementMode(false); setCommentPoint(undefined); setError(''); setErrorCode(''); setVideoLockState('checking')
      let lockAcquired = false
      let awaitingHeartbeat = true
      try {
        const lock = await acquireLock()
        if (!active) return
        if (!lock.locked || lock.lockedById !== String(session.account.id)) {
          const lockError = new Error('该视频正在被其他成员处理') as Error & { code?: string }
          lockError.code = 'video_locked'
          throw lockError
        }
        lockAcquired = true
        awaitingHeartbeat = false
        setVideoLockState('loading')
        const data = await annotationApi.getWorkspace(projectId, videoId, searchParams.get('readonly') === '1')
        if (!active) return
        awaitingHeartbeat = true
        const confirmedLock = await acquireLock()
        if (!active) return
        if (!confirmedLock.locked || confirmedLock.lockedById !== String(session.account.id)) {
          const lockError = new Error('视频锁已被其他成员获取，当前作业已停止') as Error & { code?: string }
          lockError.code = 'video_locked'
          throw lockError
        }
        awaitingHeartbeat = false
        setVideoLockState('held')
        undoStack.current = []
        redoStack.current = []
        setHistory({ undo: 0, redo: 0 })
        setSelectedId(undefined)
        setSelectedLevel(undefined)
        setActiveGoalId(undefined)
        setAtomicViewports({})
        setEditing(undefined)
        setDirty(false)
        setSubmitted(false)
        setWorkspace(data)
        setResult(data.result)
        setRevision(data.currentRevision)
        setError('')
        setErrorCode('')
      } catch (reason) {
        if (!active) return
        const apiError = reason as Error & { code?: string }
        const lockFailure = apiError.code === 'video_locked'
        setVideoLockState(lockFailure ? 'lost' : 'stopped')
        setError(apiError instanceof Error ? apiError.message : '操作台加载失败')
        setErrorCode(apiError.code || (awaitingHeartbeat || !lockAcquired ? 'video_heartbeat_failed' : ''))
      }
    }
    void loadWorkspace()
    return () => { active = false; annotationApi.clearVideoContext(projectId, videoId) }
  }, [projectId, searchParams, session.account.id, videoId, workspaceReloadKey])

  useEffect(() => {
    if (videoLockState !== 'held' || !videoId) return
    let active = true
    let requestInFlight = false
    let retryTimer: number | undefined
    let lastSuccessAt = Date.now()
    const loseLock = (code: 'video_locked' | 'video_heartbeat_failed', message: string) => {
      if (!active) return
      active = false
      if (retryTimer) window.clearTimeout(retryTimer)
      videoRef.current?.pause()
      setVideoLockState('lost')
      setErrorCode(code)
      setError(message)
    }
    const sendHeartbeat = async (attempt = 0) => {
      if (!active || requestInFlight || document.visibilityState !== 'visible') return
      requestInFlight = true
      try {
        const lock = await annotationApi.videoHeartbeat(videoId, session.account.id)
        if (!active) return
        if (!lock.locked || lock.lockedById !== String(session.account.id)) return loseLock('video_locked', '视频锁已被其他成员获取，当前作业已停止')
        lastSuccessAt = Date.now()
        if (retryTimer) { window.clearTimeout(retryTimer); retryTimer = undefined }
      } catch {
        if (!active) return
        if (Date.now() - lastSuccessAt >= 30_000) return loseLock('video_heartbeat_failed', '心跳服务持续不可用，视频锁可能已释放，请重新打开')
        if (attempt < 2) retryTimer = window.setTimeout(() => { retryTimer = undefined; void sendHeartbeat(attempt + 1) }, (attempt + 1) * 1000)
        else setToast('视频锁心跳暂时失败，正在自动重试')
      } finally { requestInFlight = false }
    }
    const interval = window.setInterval(() => { if (!retryTimer) void sendHeartbeat() }, 10_000)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (retryTimer) { window.clearTimeout(retryTimer); retryTimer = undefined }
      } else void sendHeartbeat()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => { active = false; window.clearInterval(interval); if (retryTimer) window.clearTimeout(retryTimer); document.removeEventListener('visibilitychange', onVisibilityChange) }
  }, [session.account.id, videoId, videoLockState])

  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) { if (dirty) event.preventDefault() }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [dirty])

  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 2400); return () => clearTimeout(timer) }, [toast])

  const approvalStage = Boolean(workspace && workspace.node !== 'annotation')
  const canReturn = Boolean(workspace && ['review', 'quality', 'acceptance'].includes(workspace.node))
  const submitButtonLabel = workspace?.node === 'quality' ? '提交审核' : workspace?.node === 'acceptance' ? '提交验收' : '提交'
  const hardReadonly = Boolean(workspace?.readonly || searchParams.get('readonly') === '1' || submitted || videoLockState !== 'held')
  const readonly = Boolean(hardReadonly || approvalStage)
  const canComment = Boolean(approvalStage && !hardReadonly)
  const keyFrameNeedsObject = keyFrameForm.type !== 'abnormal'
  const keyFrameNeedsDetail = keyFrameForm.type !== 'contact'
  const keyFrameFormValid = (!keyFrameNeedsObject || keyFrameForm.operationObjectIds.length > 0) && (!keyFrameNeedsDetail || Boolean(keyFrameForm.detail.trim()))
  const unresolvedCommentCount = videoComments.filter((comment) => !comment.resolved).length
  const commentsAvailable = Boolean(approvalStage || videoComments.length)
  const canResolveComment = Boolean(!hardReadonly && commentsAvailable)
  const visibleVideoComments = useMemo(() => videoComments.filter((comment) => commentFilter === 'all' || (commentFilter === 'resolved' ? comment.resolved : !comment.resolved)), [commentFilter, videoComments])

  useEffect(() => {
    if (!workspace || !videoId) return
    let active = true
    async function loadComments() {
      setCommentsLoading(true)
      try {
        const comments = await annotationApi.listVideoComments(projectId, videoId)
        if (active) setVideoComments(comments)
      } catch (reason) { if (active) setToast(reason instanceof Error ? reason.message : '批注加载失败') }
      finally { if (active) setCommentsLoading(false) }
    }
    void loadComments()
    return () => { active = false }
  }, [projectId, videoId, workspace])

  useEffect(() => {
    if (!workspace?.operationLibraryId) return
    let active = true
    Promise.resolve().then(() => { if (active) setOperationObjectsLoading(true); return operationObjectApi.listObjects(workspace.operationLibraryId, { pageSize: 100 }) })
      .then((page) => { if (active) setOperationObjects(sortOperationObjects(page.items.map((item) => ({ ...item, libraryName: workspace.operationLibraryName || '项目操作对象库' })))) })
      .catch((reason) => { if (active) setToast(reason instanceof Error ? reason.message : '操作对象加载失败') })
      .finally(() => { if (active) setOperationObjectsLoading(false) })
    return () => { active = false }
  }, [workspace?.operationLibraryId, workspace?.operationLibraryName])
  const selected = useMemo(() => !result || !selectedId ? undefined : selectedLevel === 'goal'
    ? result.goals.find((item) => item.id === selectedId)
    : selectedLevel === 'action' ? result.actions.find((item) => item.id === selectedId) : undefined, [result, selectedId, selectedLevel])
  const selectedInvalidRange = useMemo(() => selectedLevel === 'invalid' && selectedId?.startsWith('invalid:') ? result?.invalidRanges.find((range) => `invalid:${range.id}` === selectedId) : undefined, [result, selectedId, selectedLevel])
  const selectedGoal = selected?.type === 'goal'
    ? selected
    : result?.goals.find((item) => item.id === selected?.parentId || item.id === activeGoalId || (selectedInvalidRange && item.startFrame <= selectedInvalidRange.startFrame && item.endFrame >= selectedInvalidRange.endFrame))
  const visibleActions = selectedGoal ? result?.actions.filter((item) => item.parentId === selectedGoal.id) || [] : []
  const goalTimelineViewport = useMemo(() => result && goalViewport.endFrame > goalViewport.startFrame
    ? clampViewport(0, result.totalFrames, goalViewport.startFrame, goalViewport.endFrame)
    : { startFrame: 0, endFrame: result?.totalFrames || 0 }, [goalViewport, result])
  const atomicTimelineViewport = useMemo(() => selectedGoal
    ? clampViewport(selectedGoal.startFrame, selectedGoal.endFrame, atomicViewports[selectedGoal.id]?.startFrame ?? selectedGoal.startFrame, atomicViewports[selectedGoal.id]?.endFrame ?? selectedGoal.endFrame)
    : undefined, [atomicViewports, selectedGoal])
  const currentSeconds = currentFrame / (result?.frameRate || 30)
  const selectedLabelScope = selected?.type === 'goal' ? 'goal' : 'action'
  const visibleLabels = workspace?.labels.filter((item) => item.appliesTo === selectedLabelScope || (item.appliesTo === 'both' && item.id === selected?.labelId)) || []
  const draftRange = mark ? (() => {
    const pointerFrame = !playing && hoverPoint ? hoverPoint.frame : currentFrame
    if (mark.kind === 'goal') {
      const range = result ? resolveCreationRange(mark.frame, pointerFrame, [...result.goals, ...result.invalidRanges], 0, result.totalFrames) : undefined
      return range ? { level: 'goal', ...range } as TimelineDraft : undefined
    }
    if (mark.kind === 'invalid') {
      const range = result ? resolveCreationRange(mark.frame, pointerFrame, result.goals, 0, result.totalFrames) : undefined
      return range ? { level: 'invalid', ...range } as TimelineDraft : undefined
    }
    if (!selectedGoal || !result) return undefined
    const range = resolveCreationRange(mark.frame, pointerFrame, result.actions.filter((item) => item.parentId === selectedGoal.id), selectedGoal.startFrame, selectedGoal.endFrame)
    if (!range) return undefined
    return {
      level: 'action', ...range, parentId: selectedGoal.id,
    } as TimelineDraft
  })() : undefined

  const seek = useCallback((frame: number) => {
    if (!result) return
    const next = Math.max(0, Math.min(result.totalFrames, Math.round(frame)))
    if (videoRef.current && workspace?.videoUrl) videoRef.current.currentTime = result.mediaStartTime + next / result.frameRate
    setCurrentFrame(next)
  }, [result, workspace?.videoUrl])

  function resetAtomicViewport(goal: AnnotationSegment) {
    setAtomicViewports((current) => ({
      ...current,
      [goal.id]: { startFrame: goal.startFrame, endFrame: goal.endFrame },
    }))
  }

  function selectSegment(item: AnnotationSegment, clickedFrame?: number) {
    videoRef.current?.pause()
    setInspectorTab('segments')
    const nextGoal = item.type === 'goal' ? item : result?.goals.find((goal) => goal.id === item.parentId)
    if (nextGoal && (item.type === 'goal' || nextGoal.id !== selectedGoal?.id)) resetAtomicViewport(nextGoal)
    setSelectedId(item.id)
    setSelectedLevel(item.type === 'goal' ? 'goal' : 'action')
    setActiveGoalId(item.type === 'goal' ? item.id : item.parentId)
    if (clickedFrame === undefined) seek(item.startFrame)
    if (item.type === 'goal') {
      if (result) setGoalViewport(revealRange(0, result.totalFrames, goalTimelineViewport, item.startFrame, item.endFrame))
    } else {
      const parent = result?.goals.find((goal) => goal.id === item.parentId)
      if (parent) setAtomicViewports((current) => ({ ...current, [parent.id]: revealRange(parent.startFrame, parent.endFrame, current[parent.id] || { startFrame: parent.startFrame, endFrame: parent.endFrame }, item.startFrame, item.endFrame) }))
    }
  }

  function previewStep(delta: number) {
    if (selected) {
      const lower = selected.startFrame
      const upper = selected.endFrame
      seek(Math.max(lower, Math.min(upper, currentFrame + delta)))
    } else seek(currentFrame + delta)
  }

  function togglePlayback() {
    const video = videoRef.current
    if (!video) return
    if (!video.paused) { video.pause(); return }
    if (selected && (currentFrame < selected.startFrame || currentFrame >= selected.endFrame)) seek(selected.startFrame)
    window.setTimeout(() => video.play(), 0)
  }

  function startScrub() {
    const restorePlayback = Boolean(videoRef.current && !videoRef.current.paused)
    videoRef.current?.pause()
    setScrubbing(true)
    return restorePlayback
  }

  function previewScrub(frame: number) {
    if (!result) return
    const next = Math.max(0, Math.min(result.totalFrames, Math.round(frame)))
    setCurrentFrame(next)
    if (scrubVideoRef.current) scrubVideoRef.current.currentTime = result.mediaStartTime + next / result.frameRate
  }

  function finishScrub(frame: number, restorePlayback: boolean) {
    const video = videoRef.current
    setScrubbing(false)
    if (!video || !result) { seek(frame); return }
    const next = Math.max(0, Math.min(result.totalFrames, Math.round(frame)))
    const resume = () => { video.removeEventListener('seeked', resume); if (restorePlayback) video.play() }
    video.addEventListener('seeked', resume, { once: true })
    video.currentTime = result.mediaStartTime + next / result.frameRate
    setCurrentFrame(next)
  }

  function handleVideoTimeUpdate(media: HTMLVideoElement) {
    const frame = Math.max(0, Math.min(result?.totalFrames || 0, Math.floor((media.currentTime - (result?.mediaStartTime || 0)) * (result?.frameRate || 30) + 1e-7)))
    if (selected && !media.paused && frame >= selected.endFrame) {
      media.pause()
      seek(selected.endFrame)
      return
    }
    setCurrentFrame(frame)
    if (!playing || !result) return
    const nextGoalViewport = followFrame(0, result.totalFrames, goalTimelineViewport, frame)
    if (!sameViewport(nextGoalViewport, goalTimelineViewport)) setGoalViewport(nextGoalViewport)
    if (selectedGoal && atomicTimelineViewport) {
      const nextAtomicViewport = followFrame(selectedGoal.startFrame, selectedGoal.endFrame, atomicTimelineViewport, frame)
      if (!sameViewport(nextAtomicViewport, atomicTimelineViewport)) setAtomicViewports((current) => ({ ...current, [selectedGoal.id]: nextAtomicViewport }))
    }
  }

  function handleVideoMetadata(media: HTMLVideoElement) {
    media.playbackRate = rate
    const firstSeekableTime = media.seekable.length ? media.seekable.start(0) : result?.mediaStartTime || 0
    const mediaStartTime = result?.mediaStartTime || firstSeekableTime
    const durationSeconds = Number.isFinite(media.duration) ? Math.max(0, media.duration - mediaStartTime) : 0
    if (result) {
      const totalFrames = result.totalFrames || Math.round(durationSeconds * result.frameRate)
      if (mediaStartTime !== result.mediaStartTime || totalFrames !== result.totalFrames) setResult(normalizeAnnotationResult({ ...result, mediaStartTime, totalFrames }))
    }
    if (workspace && (mediaStartTime !== workspace.mediaStartTime || (!workspace.durationSeconds && durationSeconds))) setWorkspace({ ...workspace, mediaStartTime, durationSeconds: workspace.durationSeconds || durationSeconds })
    if (media.currentTime < mediaStartTime) media.currentTime = mediaStartTime
  }

  function clearSelection(level?: 'goal' | 'action') {
    setSelectedId(undefined)
    setSelectedLevel(undefined)
    if (!level || level === 'goal') setActiveGoalId(undefined)
  }

  function preciseSeek(_level: 'goal' | 'action', frame: number) {
    seek(frame)
  }

  function hoverTimeline(level: 'goal' | 'action', frame?: number) {
    setHoverPoint(frame === undefined ? undefined : { level, frame })
    if (frame !== undefined && mark && !playing) seek(frame)
  }

  function mutate(next: AnnotationResult, remember = true) {
    if (result && remember) { undoStack.current.push(structuredClone(result)); if (undoStack.current.length > 50) undoStack.current.shift(); redoStack.current = []; setHistory({ undo: undoStack.current.length, redo: 0 }) }
    const normalized = normalizeAnnotationResult(next)
    normalized.usedAnnotationConfigCodes = [...new Set([...normalized.goals, ...normalized.actions].map((item) => item.labelCode || item.labelId).filter(Boolean) as string[])]
    setResult(normalized); setDirty(true)
  }

  function undo() { const previous = undoStack.current.pop(); if (!previous || !result) return; redoStack.current.push(structuredClone(result)); setResult(previous); setDirty(true); setHistory({ undo: undoStack.current.length, redo: redoStack.current.length }) }
  function redo() { const next = redoStack.current.pop(); if (!next || !result) return; undoStack.current.push(structuredClone(result)); setResult(next); setDirty(true); setHistory({ undo: undoStack.current.length, redo: redoStack.current.length }) }

  function beginEdit(label: string) {
    if (!result || editSnapshotRef.current) return
    editSnapshotRef.current = structuredClone(result)
    editResultRef.current = structuredClone(result)
    editViewportSnapshotRef.current = structuredClone(atomicViewports)
    setEditing(label)
  }

  function finishEdit(commit: boolean) {
    const snapshot = editSnapshotRef.current
    const editedResult = editResultRef.current
    const viewportSnapshot = editViewportSnapshotRef.current
    editSnapshotRef.current = undefined
    editResultRef.current = undefined
    editViewportSnapshotRef.current = undefined
    setEditing(undefined)
    if (!snapshot || !editedResult) return
    if (!commit || JSON.stringify(snapshot) === JSON.stringify(editedResult)) { setResult(snapshot); if (viewportSnapshot) setAtomicViewports(viewportSnapshot); return }
    setResult(editedResult)
    undoStack.current.push(snapshot)
    if (undoStack.current.length > 50) undoStack.current.shift()
    redoStack.current = []
    setHistory({ undo: undoStack.current.length, redo: 0 })
    setDirty(true)
  }

  function finishMark(kind: 'goal' | 'action' | 'no_action' | 'invalid', targetFrame = currentFrame) {
    if (!result || readonly) return
    if (!mark || mark.kind !== kind) { setMark({ kind, frame: currentFrame }); setToast(`已记录起点 F${currentFrame}，移动播放头后确认终点`); return }
    let startFrame = Math.min(mark.frame, targetFrame)
    let endFrame = Math.max(mark.frame, targetFrame)
    setMark(undefined)
    if (startFrame === endFrame) return setToast('起止帧相同，未创建区间')
    if (kind === 'invalid') {
      const resolved = resolveCreationRange(mark.frame, targetFrame, [...result.goals, ...result.invalidRanges], 0, result.totalFrames)
      if (!resolved) return setToast('X 只能在单次任务轨道未标记的空白区间创建')
      setInvalidReason(invalidReasons[0])
      setInvalidReasonOther('')
      setEditingInvalidRangeId(undefined)
      setPendingInvalidRange(resolved)
      return
    }
    if (kind === 'goal') {
      const resolved = resolveCreationRange(mark.frame, targetFrame, result.goals, 0, result.totalFrames)
      if (!resolved) return setToast('未形成可创建的单次任务区间')
      ;({ startFrame, endFrame } = resolved)
      const sequence = result.nextGoalSequence
      const id = `${workspace?.dataName || 'VLA'}-${String(sequence).padStart(3, '0')}`
      const item: AnnotationSegment = { id, sequence, code: id, labelCode: '', type: 'goal', segmentType: 'goal', startFrame, endFrame, color: '#2563EB', descriptionZh: '', descriptionSource: 'user', nextAtomicSequence: 1, atomicActions: [] }
      const actionId = `${item.id}-A001`
      const action: AnnotationSegment = { id: actionId, sequence: 1, code: actionId, labelCode: '', parentId: item.id, type: 'action', segmentType: 'atomic', startFrame, endFrame, color: '#16A34A', descriptionZh: '', descriptionSource: 'user', operationObjectIds: [], operationObjectNames: [], keyFrames: [], keyframeNoneConfirmed: false }
      mutate({ ...result, nextGoalSequence: sequence + 1, nextActionSequenceByGoal: { ...result.nextActionSequenceByGoal, [item.id]: 2 }, goals: [...result.goals, { ...item, nextAtomicSequence: 2, atomicActions: [action] }].sort((a, b) => a.startFrame - b.startFrame), actions: [...result.actions, action].sort((a, b) => a.startFrame - b.startFrame) }); resetAtomicViewport(item); setActiveGoalId(item.id); setSelectedId(action.id); setSelectedLevel('action'); return
    }
    if (!selectedGoal) return setToast('请先选择一个单次任务')
    const siblings = result.actions.filter((item) => item.parentId === selectedGoal.id)
    const resolved = resolveCreationRange(mark.frame, targetFrame, siblings, selectedGoal.startFrame, selectedGoal.endFrame)
    if (!resolved) return setToast('未形成可创建的小目标区间')
    ;({ startFrame, endFrame } = resolved)
    const sequence = result.nextActionSequenceByGoal[selectedGoal.id] || 1
    const noAction = kind === 'no_action'
    const id = `${selectedGoal.id}-A${String(sequence).padStart(3, '0')}`
    const item: AnnotationSegment = { id, sequence, code: id, labelCode: '', parentId: selectedGoal.id, type: noAction ? 'no_action' : 'action', segmentType: noAction ? 'no_action' : 'atomic', startFrame, endFrame, color: noAction ? '#64748B' : '#16A34A', descriptionZh: noAction ? '未执行有效动作' : '', descriptionEn: noAction ? 'No valid action is performed.' : undefined, systemCode: noAction ? 'NO_ACTION' : undefined, descriptionSource: noAction ? 'system' : 'user', modelDescriptionRequired: noAction ? false : undefined, keyFrames: [], keyframeNoneConfirmed: noAction }
    mutate({ ...result, nextActionSequenceByGoal: { ...result.nextActionSequenceByGoal, [selectedGoal.id]: sequence + 1 }, actions: [...result.actions, item].sort((a, b) => a.startFrame - b.startFrame) }); setSelectedId(item.id); setSelectedLevel('action')
  }

  function confirmInvalidRange() {
    if (!result || !pendingInvalidRange || !invalidReason) return
    const reason = invalidReason === '其他' ? `其他: ${invalidReasonOther.trim()}` : invalidReason
    if (invalidReason === '其他' && !invalidReasonOther.trim()) return
    if (editingInvalidRangeId) {
      mutate({ ...result, invalidRanges: result.invalidRanges.map((range) => range.id === editingInvalidRangeId ? { ...range, reason } : range) })
      setPendingInvalidRange(undefined)
      setEditingInvalidRangeId(undefined)
      setToast(`无效原因已修改为：${reason}`)
      return
    }
    const sequence = result.nextInvalidSequence
    const range = { id: `${workspace?.dataName || 'VLA'}-INVALID-${String(sequence).padStart(3, '0')}`, sequence, ...pendingInvalidRange, reason }
    mutate({ ...result, nextInvalidSequence: sequence + 1, invalidRanges: normalizeInvalidRanges([...result.invalidRanges, range]) })
    setPendingInvalidRange(undefined)
    setSelectedId(`invalid:${range.id}`)
    setSelectedLevel('invalid')
    setInspectorTab('invalid')
    setToast(`已标记无效区间：${reason}`)
  }

  function editInvalidReason(range: AnnotationResult['invalidRanges'][number]) {
    const otherPrefix = '其他:'
    const predefined = invalidReasons.includes(range.reason) && range.reason !== '其他'
    setInvalidReason(predefined ? range.reason : '其他')
    setInvalidReasonOther(predefined ? '' : range.reason.startsWith(otherPrefix) ? range.reason.slice(otherPrefix.length).trim() : range.reason)
    setEditingInvalidRangeId(range.id)
    setPendingInvalidRange({ startFrame: range.startFrame, endFrame: range.endFrame })
  }

  function updateSegment(target: AnnotationSegment, changes: Partial<AnnotationSegment>) {
    if (!result) return
    const key = target.type === 'goal' ? 'goals' : 'actions'
    mutate({ ...result, [key]: result[key].map((item) => item.id === target.id ? { ...item, ...changes } : item) })
  }

  function updateSelected(changes: Partial<AnnotationSegment>) {
    if (selected) updateSegment(selected, changes)
  }

  function previewSegmentRange(target: AnnotationSegment, requestedStart: number, requestedEnd: number, mode: TimelineEditMode) {
    if (!result || readonly) return
    const base = editSnapshotRef.current || result
    const isGoal = target.type === 'goal'
    const siblings = (isGoal ? base.goals : base.actions.filter((item) => item.parentId === target.parentId)).filter((item) => item.id !== target.id)
    const parent = isGoal ? undefined : base.goals.find((item) => item.id === target.parentId)
    const duration = target.endFrame - target.startFrame
    const moving = mode === 'move'
    let startFrame = Math.round(requestedStart); let endFrame = Math.round(requestedEnd)
    const minimum = 1
    if (moving) { const lower = Math.max(parent?.startFrame || 0, ...siblings.filter((item) => item.endFrame <= target.startFrame).map((item) => item.endFrame)); const upper = Math.min(parent?.endFrame || base.totalFrames, ...siblings.filter((item) => item.startFrame >= target.endFrame).map((item) => item.startFrame)); startFrame = Math.max(lower, Math.min(startFrame, upper - duration)); endFrame = startFrame + duration }
    else { const lower = Math.max(parent?.startFrame || 0, ...siblings.filter((item) => item.endFrame <= target.startFrame).map((item) => item.endFrame)); const upper = Math.min(parent?.endFrame || base.totalFrames, ...siblings.filter((item) => item.startFrame >= target.endFrame).map((item) => item.startFrame)); startFrame = Math.max(lower, Math.min(startFrame, target.endFrame - minimum)); endFrame = Math.min(upper, Math.max(endFrame, target.startFrame + minimum)) }
    if (isGoal) {
      const children = base.actions.filter((item) => item.parentId === target.id)
      if (!moving && children.length) { startFrame = Math.min(startFrame, ...children.map((item) => item.startFrame)); endFrame = Math.max(endFrame, ...children.map((item) => item.endFrame)) }
      const delta = moving ? startFrame - target.startFrame : 0
      const nextActions = delta ? base.actions.map((item) => item.parentId === target.id ? { ...item, startFrame: item.startFrame + delta, endFrame: item.endFrame + delta, keyFrames: item.keyFrames?.map((frame) => ({ ...frame, frame: frame.frame + delta })) } : item) : base.actions
      const nextResult = normalizeAnnotationResult({ ...base, goals: base.goals.map((item) => item.id === target.id ? { ...item, startFrame, endFrame } : item), actions: nextActions, invalidRanges: structuredClone(base.invalidRanges) })
      editResultRef.current = nextResult
      setResult(nextResult)
      setAtomicViewports((current) => {
        const remembered = editViewportSnapshotRef.current?.[target.id] || current[target.id]
        if (!remembered) return current
        const moved = delta ? { startFrame: remembered.startFrame + delta, endFrame: remembered.endFrame + delta } : remembered
        return { ...current, [target.id]: clampViewport(startFrame, endFrame, moved.startFrame, moved.endFrame) }
      })
    } else {
      const keyFrames = target.keyFrames || []
      if (!moving && keyFrames.length) {
        if (mode === 'start') startFrame = Math.min(startFrame, ...keyFrames.map((frame) => frame.frame))
        if (mode === 'end') endFrame = Math.max(endFrame, ...keyFrames.map((frame) => frame.frame + 1))
      }
      const delta = moving ? startFrame - target.startFrame : 0
      const nextResult = normalizeAnnotationResult({ ...base, actions: base.actions.map((item) => item.id === target.id ? { ...item, startFrame, endFrame, keyFrames: delta ? item.keyFrames?.map((frame) => ({ ...frame, frame: frame.frame + delta })) : item.keyFrames } : item), invalidRanges: structuredClone(base.invalidRanges) })
      editResultRef.current = nextResult
      setResult(nextResult)
    }
    return { startFrame, endFrame }
  }

  function previewInvalidRange(target: AnnotationResult['invalidRanges'][number], requestedStart: number, requestedEnd: number, mode: TimelineEditMode) {
    if (!result || readonly || !selectedGoal) return
    const base = editSnapshotRef.current || result
    const fullyInside = target.startFrame >= selectedGoal.startFrame && target.endFrame <= selectedGoal.endFrame
    if (!fullyInside) return setToast('跨单次任务边界的无效区间不能整体编辑')
    const siblings = base.invalidRanges.filter((range) => range.id !== target.id).sort((a, b) => a.startFrame - b.startFrame)
    const previous = siblings.filter((range) => range.endFrame <= target.startFrame).at(-1)
    const next = siblings.find((range) => range.startFrame >= target.endFrame)
    const lower = Math.max(selectedGoal.startFrame, previous?.endFrame ?? selectedGoal.startFrame)
    const upper = Math.min(selectedGoal.endFrame, next?.startFrame ?? selectedGoal.endFrame)
    const duration = target.endFrame - target.startFrame
    let startFrame = Math.round(requestedStart); let endFrame = Math.round(requestedEnd)
    if (mode === 'move') { startFrame = Math.max(lower, Math.min(startFrame, upper - duration)); endFrame = startFrame + duration }
    else if (mode === 'start') startFrame = Math.max(lower, Math.min(startFrame, target.endFrame - 1))
    else endFrame = Math.min(upper, Math.max(endFrame, target.startFrame + 1))
    const nextResult = normalizeAnnotationResult({ ...base, invalidRanges: base.invalidRanges.map((range) => range.id === target.id ? { ...range, startFrame, endFrame } : range) })
    editResultRef.current = nextResult
    setResult(nextResult)
  }

  function removeSelected() {
    if (!result || !selected) return
    if (selected.type === 'goal') {
      let nextInvalidSequence = result.nextInvalidSequence
      const ranges = result.invalidRanges.flatMap((range) => {
        if (range.endFrame <= selected.startFrame || range.startFrame >= selected.endFrame) return [range]
        const left = range.startFrame < selected.startFrame ? { ...range, endFrame: selected.startFrame } : undefined
        const right = range.endFrame > selected.endFrame ? { ...range, id: `${workspace?.dataName || 'VLA'}-INVALID-${String(nextInvalidSequence).padStart(3, '0')}`, sequence: nextInvalidSequence++, startFrame: selected.endFrame } : undefined
        return [left, right].filter(Boolean) as AnnotationResult['invalidRanges']
      })
      mutate({ ...result, nextInvalidSequence, goals: result.goals.filter((item) => item.id !== selected.id), actions: result.actions.filter((item) => item.parentId !== selected.id), invalidRanges: ranges })
      setAtomicViewports((current) => { const next = { ...current }; delete next[selected.id]; return next })
      setActiveGoalId(undefined)
    }
    else mutate({ ...result, actions: result.actions.filter((item) => item.id !== selected.id) })
    setSelectedId(undefined)
    setSelectedLevel(undefined)
  }

  async function save(showToast = true) {
    if (!result || hardReadonly || saving || editing) { if (editing && showToast) setToast('请先完成或取消当前拖动'); return revision }
    setSaving(true)
    try { const nextRevision = await annotationApi.save(projectId, videoId, result, revision); setRevision(nextRevision); setDirty(false); if (showToast) setToast('草稿已保存'); return nextRevision }
    catch (reason) { setToast(reason instanceof Error ? reason.message : '保存失败'); throw reason }
    finally { setSaving(false) }
  }

  async function submit(options: { ignoreGoalGaps?: boolean; ignoreActionGaps?: boolean } = {}) {
    if (!result) return
    if (editing) return setToast('请先完成或取消当前拖动')
    if (workspace?.node === 'annotation' && commentsLoading) return setToast('批注仍在加载，请稍后再提交')
    if (workspace?.node === 'annotation' && unresolvedCommentCount > 0) {
      setCommentFilter('pending')
      openComments()
      return setToast(`还有 ${unresolvedCommentCount} 条批注未解决，全部处理后才能提交至质检`)
    }
    if (!result.goals.length) return setToast('至少创建一个单次任务后才能提交')
    const malformed = [...result.goals, ...result.actions, ...result.invalidRanges].find((item) => invalidFrameRange(item, result.totalFrames))
    if (malformed) { seek(Math.max(0, Math.round(malformed.startFrame))); return setToast('存在非整数帧、零长度或越界区间，请先修正') }
    const goalOverlap = firstOverlap(result.goals)
    if (goalOverlap) { setSelectedId(goalOverlap.right.id); setSelectedLevel('goal'); seek(goalOverlap.right.startFrame); return setToast('单次任务存在历史重叠，必须修正后才能提交') }
    const goalGaps = coverageGaps(0, result.totalFrames, [...result.goals, ...result.invalidRanges])
    if (goalGaps.length && !options.ignoreGoalGaps) { setSubmitIssue({ type: 'goal-gap', gaps: goalGaps }); return }
    for (const goal of result.goals) {
      const actions = result.actions.filter((action) => action.parentId === goal.id)
      const actionOverlap = firstOverlap(actions)
      if (actionOverlap) { setSelectedId(actionOverlap.right.id); setSelectedLevel('action'); seek(actionOverlap.right.startFrame); return setToast('同一单次任务内存在小目标历史重叠，必须修正后才能提交') }
      const outside = actions.find((action) => action.startFrame < goal.startFrame || action.endFrame > goal.endFrame)
      if (outside) { setSelectedId(outside.id); setSelectedLevel('action'); seek(outside.startFrame); return setToast('存在越过父单次任务边界的小目标') }
    }
    const invalidKeyFrame = result.actions.flatMap((action) => (action.keyFrames || []).map((keyFrame) => ({ action, keyFrame }))).find(({ action, keyFrame }) => !Number.isInteger(keyFrame.frame) || keyFrame.frame < action.startFrame || keyFrame.frame >= action.endFrame)
    if (invalidKeyFrame) { setSelectedId(invalidKeyFrame.action.id); setSelectedLevel('action'); seek(invalidKeyFrame.keyFrame.frame); return setToast('存在越过小目标半开区间的关键帧') }
    const actionGap = result.goals.map((goal) => ({ goal, gaps: coverageGaps(goal.startFrame, goal.endFrame, [...result.actions.filter((action) => action.parentId === goal.id), ...result.invalidRanges]) })).find((item) => item.gaps.length)
    if (actionGap && !options.ignoreActionGaps) { setSubmitIssue({ type: 'action-gap', goal: actionGap.goal, gaps: actionGap.gaps }); return }
    const missingObject = result.actions.find((item) => item.type === 'action' && !item.operationObjectIds?.length)
    if (missingObject) { const parentIndex = result.goals.findIndex((goal) => goal.id === missingObject.parentId); const actionIndex = result.actions.filter((action) => action.parentId === missingObject.parentId).findIndex((action) => action.id === missingObject.id); setSubmitIssue({ type: 'missing-object', action: missingObject, title: `小目标 ${parentIndex + 1}-${actionIndex + 1}` }); return }
    const fullyInvalid = result.actions.find((item) => result.invalidRanges.some((range) => range.startFrame <= item.startFrame && range.endFrame >= item.endFrame))
    if (fullyInvalid) { setSelectedId(fullyInvalid.id); setSelectedLevel('action'); return setToast('小目标被无效区间完全覆盖，请调整或删除') }
    try {
      const nextRevision = dirty ? await save(false) : revision
      await annotationApi.submit(projectId, videoId, result, nextRevision)
      setSubmitted(true)
      setVideoLockState('stopped')
      try {
        const nextVideoId = await annotationApi.nextVideo(projectId, workspace?.node || 'annotation')
        if (nextVideoId) {
          setToast('任务提交成功，正在进入下一条')
          navigate(`/projects/${encodeURIComponent(projectId)}/videos/${encodeURIComponent(nextVideoId)}/annotation`, { replace: true })
        } else {
          setToast('任务提交成功，当前暂无下一条')
          window.setTimeout(() => navigate('/workbench'), 700)
        }
      } catch (nextError) {
        setToast(`任务已提交，但获取下一条失败：${nextError instanceof Error ? nextError.message : '未知错误'}`)
      }
    } catch (reason) {
      setToast(reason instanceof Error ? reason.message : '任务提交失败')
    }
  }

  function retryVideoLock() { setError(''); setErrorCode(''); setWorkspaceReloadKey((value) => value + 1) }

  function openComments() {
    setCommentsOpen(true)
    setCommentDialogPosition((current) => current || { x: Math.max(16, (window.innerWidth - 680) / 2), y: Math.max(76, (window.innerHeight - 520) / 2) })
  }

  function startCommentDialogDrag(event: React.PointerEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest('button')) return
    const rect = commentDialogRef.current?.getBoundingClientRect()
    if (!rect) return
    commentDragRef.current = { offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function moveCommentDialog(event: React.PointerEvent<HTMLElement>) {
    const drag = commentDragRef.current
    if (!drag) return
    const width = commentDialogRef.current?.offsetWidth || 680
    const height = commentDialogRef.current?.offsetHeight || 520
    setCommentDialogPosition({
      x: Math.max(8, Math.min(window.innerWidth - width - 8, event.clientX - drag.offsetX)),
      y: Math.max(8, Math.min(window.innerHeight - height - 8, event.clientY - drag.offsetY)),
    })
  }

  function stopCommentDialogDrag(event: React.PointerEvent<HTMLElement>) {
    commentDragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  function chooseCommentPosition(event: React.MouseEvent<HTMLDivElement>) {
    if (!canComment) return
    const rect = event.currentTarget.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
    setCommentPlacementMode(false)
    setCommentPoint({ x, y })
    setCommentDraft('')
  }

  async function createComment() {
    if (!workspace || !commentPoint || !canComment || !commentDraft.trim() || commentSubmitting) return
    setCommentSubmitting(true)
    try {
      const sequence = Math.max(0, ...videoComments.map((item) => item.sequence)) + 1
      const comment = await annotationApi.createVideoComment(projectId, videoId, { node: workspace.node, sequence, content: commentDraft.trim().slice(0, 100), positionX: commentPoint.x, positionY: commentPoint.y })
      setVideoComments((items) => [...items, comment].sort((left, right) => left.sequence - right.sequence))
      setCommentPoint(undefined)
      setCommentDraft('')
      setToast('批注已添加')
    } catch (reason) { setToast(reason instanceof Error ? reason.message : '批注添加失败') }
    finally { setCommentSubmitting(false) }
  }

  async function resolveComment(commentId: string) {
    if (!canResolveComment) return setToast('当前为只读状态，无法修改批注状态')
    try {
      const resolved = await annotationApi.resolveVideoComment(projectId, videoId, commentId)
      setVideoComments((items) => items.map((item) => item.id === commentId ? resolved : item))
      setToast('批注已标记解决')
    } catch (reason) { setToast(reason instanceof Error ? reason.message : '批注状态更新失败') }
  }

  async function openKeyFrame(item?: AnnotationKeyFrame, action = selected) {
    if (!action || action.type !== 'action') return setToast('请先选中一个小目标')
    if (!item && (currentFrame < action.startFrame || currentFrame >= action.endFrame)) return setToast('请先定位到当前小目标范围内')
    if (!item && action.keyFrames?.some((keyFrame) => keyFrame.frame === currentFrame)) return setToast(`F${currentFrame} 已有关键帧，请在片段列表中点击该关键帧进行编辑`)
    // E only creates a keyframe. Existing keyframes can only enter edit mode
    // through their entry below the action in the segment list.
    const targetKeyFrame = item
    setSelectedId(action.id)
    setSelectedLevel('action')
    setEditingKeyFrame(targetKeyFrame)
    setKeyFrameForm({ type: targetKeyFrame?.type || 'contact', operationObjectIds: targetKeyFrame?.operationObjectIds || [], detail: targetKeyFrame?.detail || '' })
    setKeyFrameModalOpen(true)
    if (!operationObjects.length) {
      if (!workspace?.operationLibraryId) { setToast('当前项目未关联操作对象库'); return }
      setOperationObjectsLoading(true)
      try { const page = await operationObjectApi.listObjects(workspace.operationLibraryId, { pageSize: 100 }); setOperationObjects(sortOperationObjects(page.items.map((item) => ({ ...item, libraryName: workspace.operationLibraryName || '项目操作对象库' })))) }
      catch (reason) { setToast(reason instanceof Error ? reason.message : '操作对象加载失败') }
      finally { setOperationObjectsLoading(false) }
    }
  }

  function saveKeyFrame() {
    if (!selected || selected.type !== 'action' || !keyFrameFormValid || !result) return
    const selectedOperationObjects = operationObjects.filter((item) => keyFrameForm.operationObjectIds.includes(item.id))
    if (keyFrameNeedsObject && selectedOperationObjects.length !== keyFrameForm.operationObjectIds.length) return setToast('请选择有效的操作对象')
    const target = selected
    const keyFrame: AnnotationKeyFrame = { id: editingKeyFrame?.id || crypto.randomUUID(), sequence: editingKeyFrame?.sequence || Math.max(0, ...(target.keyFrames || []).map((item) => item.sequence)) + 1, frame: editingKeyFrame?.frame ?? currentFrame, type: keyFrameForm.type, operationObjectIds: selectedOperationObjects.map((item) => item.id), operationObjectNames: selectedOperationObjects.map((item) => item.name), detail: keyFrameForm.type === 'contact' ? '' : keyFrameForm.detail.trim() }
    mutate({ ...result, actions: result.actions.map((action) => action.id === target.id ? { ...action, keyFrames: editingKeyFrame ? (action.keyFrames || []).map((item) => item.id === editingKeyFrame.id ? keyFrame : item) : [...(action.keyFrames || []), keyFrame], keyframeNoneConfirmed: false } : action) })
    setSelectedId(target.id)
    setSelectedLevel('action')
    setKeyFrameModalOpen(false)
    setEditingKeyFrame(undefined)
    setToast(editingKeyFrame ? '关键帧已更新，正在保存草稿' : '关键帧已添加，正在保存草稿')
  }

  function deleteEditingKeyFrame() {
    if (!editingKeyFrame || !selected || selected.type !== 'action' || !result) return
    if (!window.confirm(`确认删除关键帧 F${editingKeyFrame.frame}？`)) return
    mutate({ ...result, actions: result.actions.map((action) => action.id === selected.id ? { ...action, keyFrames: (action.keyFrames || []).filter((item) => item.id !== editingKeyFrame.id) } : action) })
    setKeyFrameModalOpen(false)
    setEditingKeyFrame(undefined)
    setToast('关键帧已删除，正在保存草稿')
  }

  async function createOperationCandidate() {
    if (!workspace?.operationLibraryId || candidateSaving || !candidateForm.name.trim()) return
    setCandidateSaving(true)
    try {
      await operationObjectApi.saveObject(workspace.operationLibraryId, { name: candidateForm.name.trim(), alias: candidateForm.alias.trim(), attribute: candidateForm.attribute.trim(), approved: false })
      const page = await operationObjectApi.listObjects(workspace.operationLibraryId, { pageSize: 100 })
      setOperationObjects(sortOperationObjects(page.items.map((item) => ({ ...item, libraryName: workspace.operationLibraryName || '项目操作对象库' }))))
      setCandidateModalOpen(false); setCandidateForm({ name: '', alias: '', attribute: '' }); setToast('候选对象已创建，可立即选择使用')
    } catch (reason) { setToast(reason instanceof Error ? reason.message : '候选对象创建失败') }
    finally { setCandidateSaving(false) }
  }

  async function returnTask() {
    if (!result || returning) return
    if (commentsLoading) return setToast('批注仍在加载，请稍后再试')
    const unresolved = videoComments.filter((item) => !item.resolved)
    if (!unresolved.length) return setToast('至少需要一条未解决批注才能退回')
    if (!window.confirm('确认将该视频退回上一个流程环节？')) return
    const opinion = unresolved.map((item) => item.content.trim()).filter(Boolean).join('；')
    setReturning(true)
    try { if (dirty) await save(false); await annotationApi.reject(projectId, videoId, opinion); setDirty(false); setSubmitted(true); setVideoLockState('stopped'); setToast('视频已退回'); window.setTimeout(() => navigate('/workbench'), 700) } catch (failure) { setToast(failure instanceof Error ? failure.message : '退回失败') }
    finally { setReturning(false) }
  }

  async function cancelVideo() {
    if (cancellingVideo || !canCancelVideo) return
    if (!window.confirm(`确认作废视频“${workspace?.dataName || videoId}”？作废后将不再参与流转，且当前未保存修改会被丢弃。`)) return
    setCancellingVideo(true)
    try { await annotationApi.cancelVideo(projectId, videoId); videoRef.current?.pause(); setDirty(false); setVideoLockState('stopped'); setToast('视频已作废'); window.setTimeout(() => navigate('/workbench'), 700) }
    catch (failure) { setToast(failure instanceof Error ? failure.message : '视频作废失败') }
    finally { setCancellingVideo(false) }
  }

  useEffect(() => {
    if (!dirty || hardReadonly || saving || !result || editing) return
    const snapshot = result
    const timer = window.setTimeout(() => {
      setSaving(true)
      annotationApi.save(projectId, videoId, snapshot, revision)
        .then((nextRevision) => {
          setRevision(nextRevision)
          setResult((current) => {
            if (current === snapshot) setDirty(false)
            return current
          })
        })
        .catch((reason) => setToast(reason instanceof Error ? reason.message : '自动保存失败'))
        .finally(() => setSaving(false))
    }, 700)
    return () => window.clearTimeout(timer)
  }, [dirty, editing, hardReadonly, projectId, result, revision, saving, videoId])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (commentPlacementMode && (event.key === 'Escape' || event.key.toLowerCase() === 'c')) {
        event.preventDefault()
        setCommentPlacementMode(false)
        return
      }
      if (shortcutsOpen) {
        if (event.key === 'Escape') { event.preventDefault(); setShortcutsOpen(false) }
        return
      }
      if (target?.matches('input,textarea,select,[contenteditable="true"],[contenteditable=""]') || event.repeat) return
      if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'c') {
        event.preventDefault()
        if (!canComment) {
          setToast(!approvalStage ? '添加批注仅在质检、审核或验收阶段可用' : hardReadonly ? '当前为只读状态，无法添加批注' : '当前状态无法添加批注')
          return
        }
        setCommentsOpen(false)
        setCommentPlacementMode(true)
        return
      }
      if (event.code === 'Space') {
        if (document.querySelector('.modal-backdrop') || target?.closest('.comment-panel')) return
        event.preventDefault()
        togglePlayback()
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (editing) return; if (event.shiftKey) redo(); else undo(); return }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); if (!editing) redo(); return }
      if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'e') {
        event.preventDefault()
        if (!readonly) void openKeyFrame()
        return
      }
      const pointerFrame = !playing && hoverPoint ? hoverPoint.frame : currentFrame
      if (!readonly && event.key.toLowerCase() === 'q' && !mark) setMark({ kind: hoverPoint?.level === 'action' || (!hoverPoint && selectedGoal) ? 'action' : 'goal', frame: pointerFrame })
      if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'w') {
        event.preventDefault()
        if (readonly) { setToast(hardReadonly ? '当前为只读状态或未持有视频锁，无法创建无动作区间' : '质检、审核和验收阶段不能修改标注'); return }
        if (mark) { setToast('已有区间正在创建，请先松开对应快捷键或按 Esc 取消'); return }
        const hoveredGoal = hoverPoint?.level === 'goal' ? result?.goals.find((goal) => pointerFrame >= goal.startFrame && pointerFrame < goal.endFrame) : selectedGoal
        if (!hoveredGoal) { setToast('请先选择一个单次任务，或将鼠标悬停在单次任务轨道内'); return }
        setActiveGoalId(hoveredGoal.id); if (hoveredGoal.id !== selectedGoal?.id) { resetAtomicViewport(hoveredGoal); setSelectedId(hoveredGoal.id); setSelectedLevel('goal') }; setMark({ kind: 'no_action', frame: pointerFrame })
      }
      if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'x') {
        event.preventDefault()
        if (readonly) { setToast(hardReadonly ? '当前为只读状态或未持有视频锁，无法标记无效区间' : '质检、审核和验收阶段不能修改标注'); return }
        if (mark) { setToast('已有区间正在创建，请先松开对应快捷键或按 Esc 取消'); return }
        if (hoverPoint?.level !== 'goal') { setToast('请将鼠标悬停在单次任务进度条的空白位置后按 X'); return }
        if ([...(result?.goals || []), ...(result?.invalidRanges || [])].some((range) => pointerFrame >= range.startFrame && pointerFrame < range.endFrame)) { setToast('当前位置已有标记，请在未标记的空白位置按 X'); return }
        setMark({ kind: 'invalid', frame: pointerFrame })
      }
      if ((event.key === 'Backspace' || event.key === 'Delete') && result && (selected || selectedId?.startsWith('invalid:'))) {
        event.preventDefault()
        if (readonly) return
        if (selectedId?.startsWith('invalid:')) {
          mutate({ ...result, invalidRanges: result.invalidRanges.filter((item) => `invalid:${item.id}` !== selectedId) })
          setSelectedId(undefined)
          setSelectedLevel(undefined)
          setToast('无效区间已删除，可通过撤销恢复')
        } else if (selected) {
          const typeName = selected.type === 'goal' ? '单次任务及其全部小目标' : '小目标'
          removeSelected()
          setToast(`${typeName}已删除，可通过撤销恢复`)
        }
        return
      }
      if (event.key === 'Escape') {
        setMark(undefined)
        if (editing) finishEdit(false)
        if (selectedId) { videoRef.current?.pause(); clearSelection(); document.querySelector<HTMLElement>('.global-progress')?.focus() }
      }
    }
    function onKeyUp(event: KeyboardEvent) { if (shortcutsOpen) return; const endFrame = !playing && hoverPoint ? hoverPoint.frame : currentFrame; if (event.key.toLowerCase() === 'q' && (mark?.kind === 'goal' || mark?.kind === 'action')) finishMark(mark.kind, endFrame); if (event.key.toLowerCase() === 'w' && mark?.kind === 'no_action') finishMark('no_action', endFrame); if (event.key.toLowerCase() === 'x' && mark?.kind === 'invalid') finishMark('invalid', endFrame) }
    window.addEventListener('keydown', onKeyDown); window.addEventListener('keyup', onKeyUp)
    function cancelTemporary() { setMark(undefined); if (editSnapshotRef.current) finishEdit(false) }
    window.addEventListener('blur', cancelTemporary)
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); window.removeEventListener('blur', cancelTemporary) }
  })

  if (error) return <main className="annotation-load-state"><CircleAlert size={38} /><h1>无法打开视频标注工作台</h1><p>{error}</p>{isVideoLockError && <button className="primary-button" type="button" onClick={retryVideoLock}>重新获取视频锁</button>}<button className={isVideoLockError ? 'secondary-button' : 'primary-button'} type="button" onClick={() => navigate('/workbench')}>返回工作台</button></main>
  if (!workspace || !result) return <main className="annotation-load-state"><RotateCcw className="spinning" size={34} /><p>{videoLockState === 'checking' ? '正在获取视频锁...' : '正在加载任务和标注结果...'}</p></main>

  function segmentListButton(item: AnnotationSegment, title: string) {
    const label = item.type === 'no_action' ? '无标签' : item.labelName || '未选择标签'
    const active = selectedId === item.id && selectedLevel === (item.type === 'goal' ? 'goal' : 'action')
    return <button className={active ? 'active' : ''} type="button" aria-pressed={active} onClick={() => selectSegment(item)}><i style={{ background: item.color }} /><span className="segment-list-title"><b>{title}</b></span><span className="segment-list-copy"><small style={{ color: item.type === 'no_action' ? '#697782' : item.color }}>{label}</small><em>{item.descriptionZh || '暂无描述'}</em></span><span className="segment-list-duration"><b>{timeText((item.endFrame - item.startFrame) / result!.frameRate)}</b><small>F{item.startFrame}-{item.endFrame}</small></span></button>
  }

  function segmentKeyFrameMeta(item: AnnotationSegment) {
    if (item.type !== 'action') return null
    const keyFrames = item.keyFrames || []
    const namesByIds = (ids: string[], names: string[] = []) => ids.map((id, index) => names[index] || operationObjects.find((object) => object.id === id)?.name).filter(Boolean) as string[]
    const actionObjectNames = namesByIds(item.operationObjectIds || [], item.operationObjectNames)
    return <div className="segment-keyframe-meta"><span>对象：<b>{actionObjectNames.length ? actionObjectNames.join('、') : '未关联'}</b></span><span>关键帧：{keyFrames.length ? keyFrames.map((frame) => { const names = namesByIds(frame.operationObjectIds, frame.operationObjectNames); return <button type="button" key={frame.id} title={readonly ? '定位到关键帧' : '点击编辑关键帧'} onClick={() => { selectSegment(item, frame.frame); seek(frame.frame); if (!readonly) void openKeyFrame(frame, item) }}>◆ F{frame.frame} {keyFrameTypeLabels[frame.type]}{names.length ? ` · ${names.join('、')}` : ''}</button> }) : <b>无</b>}</span></div>
  }

  function inlineSegmentEditor(item: AnnotationSegment) {
    const noAction = item.type === 'no_action'
    const scope = item.type === 'goal' ? 'goal' : 'action'
    const labels = workspace!.labels.filter((label) => label.appliesTo === scope || (label.appliesTo === 'both' && label.id === item.labelId))
    const selectedLabel = labels.find((label) => label.id === item.labelId)
    return <div className="segment-inline-editor" onClick={(event) => event.stopPropagation()}>
      {noAction ? <div className="segment-inline-row"><span className="segment-inline-system no-action-label">无标签</span><label className="segment-content"><input disabled value="未执行有效动作" aria-label="无动作片段描述" /></label><span className="segment-inline-duration"><b>{timeText((item.endFrame - item.startFrame) / result!.frameRate)}</b><small>F{item.startFrame}-{item.endFrame}</small></span><button className="segment-inline-delete" type="button" disabled={readonly} onClick={removeSelected} aria-label="删除片段" title="删除片段"><Trash2 size={14} /></button></div> : <div className="segment-inline-row">
        {workspace!.labelLibraryBound && <label className="label-select"><select disabled={readonly} title={item.labelName || '请选择标签'} className={selectedLabel ? 'has-label-color' : ''} style={selectedLabel ? { '--selected-label-color': selectedLabel.color, '--selected-label-text': contrastTextColor(selectedLabel.color) } as React.CSSProperties : undefined} value={item.labelId || ''} onChange={(event) => { const label = labels.find((candidate) => candidate.id === event.target.value); if (label?.appliesTo === 'both') return; updateSegment(item, { labelId: label?.id, labelCode: label?.code || '', labelName: label?.name, color: label?.color || item.color }) }}><option value="">请选择标签</option>{labels.map((label) => <option key={label.id} value={label.id}>{label.name}</option>)}</select></label>}
        <label className="segment-content"><input disabled={readonly} value={item.descriptionZh} maxLength={300} onChange={(event) => updateSegment(item, { descriptionZh: event.target.value })} placeholder="输入片段描述（选填）" /></label><span className="segment-inline-duration"><b>{timeText((item.endFrame - item.startFrame) / result!.frameRate)}</b><small>F{item.startFrame}-{item.endFrame}</small></span>
        <button className="segment-inline-delete" type="button" disabled={readonly} onClick={removeSelected} aria-label="删除片段" title="删除片段"><Trash2 size={14} /></button>
      </div>}
    </div>
  }

  return <main className="annotation-page">
    <header className="annotation-header">
      <button className="annotation-back" type="button" onClick={() => navigate('/workbench')} aria-label="返回工作台"><BrandLogo compact /><ArrowLeft className="annotation-back-arrow" size={19} /></button>
      <div className="annotation-task-title"><div><strong>{workspace.dataName}</strong><span className="workflow-stage-chip">{nodeLabels[workspace.node]}</span></div><small>{workspace.videoCode} · {workspace.projectName}</small></div>
      <div className="annotation-save-state"><i className={dirty ? 'dirty' : ''} />{saving ? '正在保存' : dirty ? '有未保存修改' : `草稿已保存 · V${revision}`}</div>
      <div className="annotation-header-actions">
        {approvalStage && <button className={`comment-add-button${commentPlacementMode ? ' active' : ''}`} type="button" disabled={!canComment} onClick={() => { setCommentsOpen(false); setCommentPlacementMode((value) => !value) }}><Plus size={17} />添加批注</button>}
        {commentsAvailable &&
          <button className="comment-all-button" type="button" onClick={() => commentsOpen ? setCommentsOpen(false) : openComments()}>全部批注 <b>{videoComments.length}</b></button>
        }
        <span className={readonly ? 'readonly-badge' : 'editing-badge'} title={`当前处理人：${session.account.name}`}>{readonly ? '标注内容已锁定' : '编辑模式'}</span>
        <button className="secondary-button annotation-shortcut-button" type="button" onClick={() => setShortcutsOpen(true)}><Keyboard size={15} />快捷键</button>
        {canCancelVideo && <button className="secondary-button danger-button" type="button" disabled={cancellingVideo || videoLockState !== 'held'} onClick={cancelVideo}>{cancellingVideo ? '正在作废...' : '作废'}</button>}
        {/* <button className="secondary-button" type="button" disabled={hardReadonly || !dirty || saving || Boolean(editing)} onClick={() => save()}><Save size={15} />保存草稿</button> */}
        {canReturn && <button className="secondary-button return-button" type="button" disabled={hardReadonly || returning || commentsLoading || unresolvedCommentCount === 0} title={unresolvedCommentCount === 0 ? '至少需要一条未解决批注才能退回' : undefined} onClick={returnTask}>{returning ? '正在退回...' : '退回'}</button>}
        <button className="primary-button" type="button" disabled={hardReadonly || saving || Boolean(editing)} onClick={() => void submit()}><Check size={16} />{submitButtonLabel}</button>
      </div>
    </header>

    <section className="annotation-workspace">
      <section className="video-stage">
        <video ref={scrubVideoRef} className={`scrub-preview${scrubbing ? ' active' : ''}`} src={workspace.videoUrl || undefined} muted playsInline />
        <div className="video-canvas"><video ref={videoRef} src={workspace.videoUrl || undefined} onLoadedMetadata={(event) => handleVideoMetadata(event.currentTarget)} onTimeUpdate={(event) => handleVideoTimeUpdate(event.currentTarget)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />{!workspace.videoUrl && <div className="video-unavailable"><CircleAlert size={28} /><strong>视频暂不可播放</strong><span>后端返回的是对象存储地址，当前 API 尚未提供预签名播放链接</span></div>}<div className="video-controls"><div className="video-control-side"><span>{timeText(currentSeconds)} / {timeText(result.totalFrames / result.frameRate)}</span><b>F{currentFrame}</b></div><div className="video-control-center"><button type="button" onClick={() => previewStep(-1)} aria-label="上一帧" title="上一帧"><SkipBack size={18} /></button><button className="video-play" type="button" disabled={!workspace.videoUrl} onClick={togglePlayback} aria-label={playing ? '暂停' : '播放'} title={playing ? '暂停' : '播放'}>{playing ? <Pause size={23} /> : <Play size={23} />}</button><button type="button" onClick={() => previewStep(1)} aria-label="下一帧" title="下一帧"><SkipForward size={18} /></button></div><div className="video-control-side end"><label><select value={rate} disabled={!workspace.videoUrl} onChange={(event) => { const next = Number(event.target.value); setRate(next); if (videoRef.current) videoRef.current.playbackRate = next }}><option value="0.5">0.5×</option><option value="1">1×</option><option value="1.5">1.5×</option><option value="2">2×</option><option value="3">3×</option><option value="4">4×</option></select><ChevronDown size={13} /></label><button type="button" disabled={!workspace.videoUrl} onClick={() => videoRef.current?.requestFullscreen()} aria-label="全屏" title="全屏查看"><Expand size={18} /></button></div></div></div>
      </section>

      <aside className="annotation-inspector">
        <header className="inspector-tabs"><button type="button" className={inspectorTab === 'segments' ? 'active' : ''} onClick={() => setInspectorTab('segments')}>片段 <b>{result.goals.length + result.actions.length}</b></button><button type="button" className={inspectorTab === 'invalid' ? 'active' : ''} onClick={() => setInspectorTab('invalid')}>无效区间 <b>{result.invalidRanges.length}</b></button></header>
        {inspectorTab === 'segments' ? <><div className="segment-list-columns"><span>片段</span><span>标签与描述</span><span>总时长</span></div><div className="segment-tree">{result.goals.map((goal, index) => { const goalSelected = selectedLevel === 'goal' && selectedId === goal.id; return <div className="segment-group" key={goal.id}><div className={`segment-list-entry${goalSelected ? ' selected' : ''}`}>{segmentListButton(goal, `单次任务 ${index + 1}`)}{goalSelected && inlineSegmentEditor(goal)}</div>{result.actions.filter((action) => action.parentId === goal.id).map((action, actionIndex) => { const actionSelected = selectedLevel === 'action' && selectedId === action.id; return <div className={`segment-action-wrap${actionSelected ? ' selected' : ''}`} key={action.id}><div className={`segment-list-entry child${actionSelected ? ' selected' : ''}`}>{segmentListButton(action, `小目标 ${index + 1}.${actionIndex + 1}`)}{actionSelected && inlineSegmentEditor(action)}</div>{segmentKeyFrameMeta(action)}</div> })}</div> })}</div></> : <><div className="segment-list-columns invalid-list-columns"><span>区间</span><span>无效原因</span><span>总时长</span><span>操作</span></div><div className="segment-tree invalid-segment-list">{result.invalidRanges.map((range, index) => { const active = selectedLevel === 'invalid' && selectedId === `invalid:${range.id}`; return <div className={`invalid-list-row${active ? ' selected' : ''}`} key={range.id}><button className="invalid-row-main" type="button" aria-pressed={active} onClick={() => { videoRef.current?.pause(); setActiveGoalId(undefined); setSelectedId(`invalid:${range.id}`); setSelectedLevel('invalid'); seek(range.startFrame) }}><i /><span className="segment-list-title"><b>无效区间 {index + 1}</b></span><span className="segment-list-copy"><small>{range.reason}</small><em>{timeText(range.startFrame / result.frameRate)} - {timeText(range.endFrame / result.frameRate)}</em></span><span className="segment-list-duration"><b>{timeText((range.endFrame - range.startFrame) / result.frameRate)}</b><small>F{range.startFrame}-{range.endFrame}</small></span></button><button className="invalid-reason-edit" type="button" disabled={readonly} onClick={() => editInvalidReason(range)}>修改原因</button></div> })}{!result.invalidRanges.length && <div className="inspector-empty">暂无无效区间，按 X 可在单次任务轨道空白处标记</div>}</div></>}
      </aside>
    </section>

    <section className={`annotation-timeline${workspace.labelLibraryBound || editing ? '' : ' no-label-library'}${workspace.operationLibraryId ? ' has-operation-bar' : ''}${selectedLevel ? ` selection-${selectedLevel === 'invalid' ? 'goal' : selectedLevel}` : ''}`}>
      {(workspace.labelLibraryBound || editing) && <div className="annotation-label-bar">{workspace.labelLibraryBound && <><span>片段标签</span>{selected?.type === 'no_action' ? <small>无动作片段不设置标签</small> : !visibleLabels.length ? <small>当前类型无可用标签</small> : visibleLabels.map((label) => <button type="button" disabled={!selected || readonly} className={selected?.labelId === label.id ? 'active' : ''} style={{ '--label-color': label.color } as React.CSSProperties} key={label.id} onClick={() => updateSelected(selected?.labelId === label.id ? { labelId: undefined, labelCode: '', labelName: undefined } : label.appliesTo === 'both' ? {} : { labelId: label.id, labelCode: label.code, labelName: label.name, color: label.color })}>{label.name}</button>)}</>}{editing && (selected || selectedInvalidRange) && <span className="timeline-edit-feedback"><strong>{editing}</strong><span>{timeText((selected || selectedInvalidRange)!.startFrame / result.frameRate)} - {timeText((selected || selectedInvalidRange)!.endFrame / result.frameRate)}</span><b>{(selected || selectedInvalidRange)!.endFrame - (selected || selectedInvalidRange)!.startFrame} 帧</b></span>}</div>}
      {workspace.operationLibraryId && <div className="annotation-operation-bar"><span>操作对象</span>{operationObjectsLoading ? <small>正在加载...</small> : !operationObjects.length ? <small>暂无操作对象</small> : operationObjects.map((item) => <button type="button" className={selected?.operationObjectIds?.includes(item.id) ? 'active' : ''} disabled={readonly || selected?.type !== 'action'} onClick={() => { if (selected?.type !== 'action') return; const ids = selected.operationObjectIds || []; const nextIds = ids.includes(item.id) ? ids.filter((id) => id !== item.id) : [...ids, item.id]; updateSelected({ operationObjectIds: nextIds, operationObjectNames: nextIds.map((id) => operationObjects.find((object) => object.id === id)?.name || '') }) }} key={item.id}>{item.name}{!item.approved && '（未审核）'}</button>)}<button className="candidate-button" type="button" disabled={readonly} onClick={() => { setCandidateForm({ name: '', alias: '', attribute: '' }); setCandidateModalOpen(true) }}><Plus size={13} />新增候选</button></div>}
      <header><div><strong>{draftRange ? `正在创建：${draftRange.level === 'goal' ? '单次任务' : draftRange.level === 'invalid' ? '视频无效区间' : '小目标'}` : selectedGoal ? `当前单次任务：${selectedGoal.labelName || selectedGoal.code || '未选择标签'}` : '当前创建：单次任务'}</strong><span>{draftRange ? `${timeText(draftRange.startFrame / result.frameRate)} - ${timeText(draftRange.endFrame / result.frameRate)} · 松开 ${mark?.kind === 'no_action' ? 'W' : mark?.kind === 'invalid' ? 'X' : 'Q'} 完成，Esc 取消` : 'Q 普通片段 · W 无动作 · X 视频无效区间'}</span></div><div>{selected && <button type="button" onClick={() => clearSelection()}>退出预览</button>}<button type="button" disabled={readonly || !history.undo} onClick={undo} title="撤销"><Undo2 size={14} />撤销</button><button type="button" disabled={readonly || !history.redo} onClick={redo} title="重做"><Redo2 size={14} />重做</button></div></header>
      <div className="timeline-body">
        <GlobalTimeline goals={result.goals} invalidRanges={result.invalidRanges} draft={draftRange} selectedRange={selected || selectedInvalidRange} totalFrames={result.totalFrames} frameRate={result.frameRate} currentFrame={currentFrame} viewport={goalTimelineViewport} onViewportChange={setGoalViewport} onSeek={seek} onScrubStart={startScrub} onScrubPreview={previewScrub} onScrubEnd={finishScrub} onClearSelection={() => clearSelection()} />
        <TimelineLane level="goal" label="单次任务" items={result.goals} childItems={result.actions} invalidRanges={result.invalidRanges} draft={draftRange} totalFrames={result.totalFrames} viewport={goalTimelineViewport} frameRate={result.frameRate} currentFrame={currentFrame} selectedId={selectedLevel === 'goal' || selectedLevel === 'invalid' ? selectedId : undefined} readonly={readonly} showPlayhead onHover={(frame) => hoverTimeline('goal', frame)} onViewportChange={setGoalViewport} onSeek={seek} onScrubStart={startScrub} onScrubPreview={previewScrub} onScrubEnd={finishScrub} onPreciseSeek={preciseSeek} onEditStart={beginEdit} onSegmentPreview={previewSegmentRange} onEditFinish={finishEdit} onSelect={selectSegment} onSelectInvalid={(range) => { videoRef.current?.pause(); setActiveGoalId(undefined); setSelectedId(`invalid:${range.id}`); setSelectedLevel('invalid'); setInspectorTab('invalid'); seek(range.startFrame) }} />
        {selectedGoal && atomicTimelineViewport ? <TimelineLane level="action" label="小目标" items={visibleActions} draft={draftRange} totalFrames={result.totalFrames} rangeStartFrame={selectedGoal.startFrame} rangeEndFrame={selectedGoal.endFrame} viewport={atomicTimelineViewport} frameRate={result.frameRate} currentFrame={currentFrame} selectedId={selectedLevel === 'action' || selectedLevel === 'invalid' ? selectedId : undefined} invalidRanges={result.invalidRanges.filter((range) => range.startFrame < selectedGoal.endFrame && range.endFrame > selectedGoal.startFrame)} readonly={readonly} showPlayhead onHover={(frame) => hoverTimeline('action', frame)} onViewportChange={(viewport) => setAtomicViewports((current) => ({ ...current, [selectedGoal.id]: viewport }))} onSeek={seek} onScrubStart={startScrub} onScrubPreview={previewScrub} onScrubEnd={finishScrub} onPreciseSeek={preciseSeek} onEditStart={beginEdit} onSegmentPreview={previewSegmentRange} onInvalidPreview={previewInvalidRange} onEditFinish={finishEdit} onSelect={selectSegment} onSelectInvalid={(range) => { videoRef.current?.pause(); setActiveGoalId(selectedGoal.id); setSelectedId(`invalid:${range.id}`); setSelectedLevel('invalid') }} /> : <div className="annotation-lane action-lane"><span className="annotation-lane-label">小目标</span><div className="annotation-track empty"><span className="timeline-empty-hint">先选择一个单次任务片段</span></div></div>}
      </div>
    </section>
    {commentsAvailable && videoComments.map((comment) => <button type="button" className={`page-comment-marker${comment.resolved ? ' resolved' : ''}`} style={{ left: `${comment.positionX * 100}%`, top: `${comment.positionY * 100}%` }} key={comment.id} title={`#${comment.sequence} ${comment.content}`} onClick={openComments}>{comment.sequence}</button>)}
    {commentPlacementMode && <div className="page-comment-placement-layer" role="button" tabIndex={0} aria-label="选择批注位置" onClick={chooseCommentPosition}><span>点击页面任意位置放置批注 · 按 C 或 Esc 取消</span></div>}
    {commentsOpen && commentDialogPosition && <div ref={commentDialogRef} className="page-comment-dialog" style={{ left: commentDialogPosition.x, top: commentDialogPosition.y }} role="dialog" aria-label="全部批注">
      <header onPointerDown={startCommentDialogDrag} onPointerMove={moveCommentDialog} onPointerUp={stopCommentDialogDrag} onPointerCancel={stopCommentDialogDrag}><strong>全部批注</strong><div><GripVertical size={18} /><button type="button" onClick={() => setCommentsOpen(false)} aria-label="关闭"><X size={17} /></button></div></header>
      <nav><button className={commentFilter === 'all' ? 'active' : ''} type="button" onClick={() => setCommentFilter('all')}>全部 <b>{videoComments.length}</b></button><button className={commentFilter === 'pending' ? 'active' : ''} type="button" onClick={() => setCommentFilter('pending')}>待处理 <b>{videoComments.filter((item) => !item.resolved).length}</b></button><button className={commentFilter === 'resolved' ? 'active' : ''} type="button" onClick={() => setCommentFilter('resolved')}>已解决 <b>{videoComments.filter((item) => item.resolved).length}</b></button></nav>
      <div className="page-comment-dialog-list">{commentsLoading ? <div className="comment-empty">批注加载中...</div> : visibleVideoComments.length === 0 ? <div className="comment-empty">暂无批注</div> : visibleVideoComments.map((comment) => <article className={comment.resolved ? 'resolved' : ''} key={comment.id}><header><span className="page-comment-sequence">{comment.sequence}</span><strong>{nodeLabels[comment.node]}批注</strong><span className={comment.resolved ? 'resolved' : 'pending'}>{comment.resolved ? '已解决' : '待处理'}</span></header><p>{comment.content}</p><footer><small>{comment.createdByName || '未知用户'} · {formatDateTime(comment.createdAt)} · 页面位置 {Math.round(comment.positionX * 100)}%, {Math.round(comment.positionY * 100)}%</small>{!comment.resolved && <button type="button" disabled={!canResolveComment} onClick={() => resolveComment(comment.id)}>标记已解决</button>}</footer></article>)}</div>
      <footer><button className="secondary-button" type="button" onClick={() => setCommentsOpen(false)}>关闭</button></footer>
    </div>}
    {pendingInvalidRange && <Modal title="选择无效原因" onClose={() => { setPendingInvalidRange(undefined); setEditingInvalidRangeId(undefined) }} footer={<><button className="secondary-button" type="button" onClick={() => { setPendingInvalidRange(undefined); setEditingInvalidRangeId(undefined) }}>取消</button><button className="primary-button" type="button" disabled={!invalidReason || invalidReason === '其他' && !invalidReasonOther.trim()} onClick={confirmInvalidRange}>{editingInvalidRangeId ? '确认修改' : '确认标记'}</button></>}><div className="invalid-reason-dialog"><p>无效区间：{timeText(pendingInvalidRange.startFrame / result.frameRate)} - {timeText(pendingInvalidRange.endFrame / result.frameRate)}</p><fieldset><legend>无效原因 <i className="required-mark">*</i></legend><div>{invalidReasons.map((reason) => <label key={reason}><input type="radio" name="invalid-reason" checked={invalidReason === reason} onChange={() => setInvalidReason(reason)} />{reason}</label>)}</div></fieldset>{invalidReason === '其他' && <label className="invalid-reason-other"><span>其他原因 <i className="required-mark">*</i></span><input autoFocus value={invalidReasonOther} maxLength={200} onChange={(event) => setInvalidReasonOther(event.target.value)} placeholder="请输入其他无效原因" /><small>{invalidReasonOther.length}/200</small></label>}</div></Modal>}
    {submitIssue && <Modal title="当前标注未完成" onClose={() => setSubmitIssue(undefined)} footer={submitIssue.type === 'goal-gap' ? <><button className="secondary-button" type="button" onClick={() => { setSubmitIssue(undefined); void submit({ ignoreGoalGaps: true }) }}>确认不标注，继续提交</button><button className="primary-button" type="button" onClick={() => { seek(submitIssue.gaps[0].startFrame); setSubmitIssue(undefined) }}>返回检查第一个</button></> : submitIssue.type === 'action-gap' ? <><button className="secondary-button" type="button" onClick={() => { setSubmitIssue(undefined); void submit({ ignoreGoalGaps: true, ignoreActionGaps: true }) }}>确认不标注，继续提交</button><button className="primary-button" type="button" onClick={() => { setActiveGoalId(submitIssue.goal.id); setSelectedId(submitIssue.goal.id); setSelectedLevel('goal'); seek(submitIssue.gaps[0].startFrame); setSubmitIssue(undefined) }}>返回检查第一个</button></> : <><button className="secondary-button" type="button" onClick={() => setSubmitIssue(undefined)}>返回补充</button><button className="primary-button" type="button" onClick={() => { setActiveGoalId(submitIssue.action.parentId); setSelectedId(submitIssue.action.id); setSelectedLevel('action'); seek(submitIssue.action.startFrame); setSubmitIssue(undefined) }}>定位首个问题</button></>}><div className="submit-validation-dialog">{submitIssue.type === 'goal-gap' ? <><strong>当前视频还有 {submitIssue.gaps.length} 个未覆盖区间，共 {submitIssue.gaps.reduce((sum, gap) => sum + gap.endFrame - gap.startFrame, 0)} 帧</strong><p>可确认这些区间不标注并继续，也可返回检查第一个并补充标注或标记无效。</p></> : submitIssue.type === 'action-gap' ? <><strong>当前单次任务还有 {submitIssue.gaps.length} 个小目标未覆盖区间，共 {submitIssue.gaps.reduce((sum, gap) => sum + gap.endFrame - gap.startFrame, 0)} 帧</strong><p>可确认这些区间不标注并继续，也可返回检查第一个并补充小目标或标记无效。</p></> : <><strong>{submitIssue.title} 尚未选择操作对象，请选择对象</strong><p>请定位并完成当前问题后再次提交。小目标标签可不选择。</p></>}</div></Modal>}
    {shortcutsOpen && <Modal title="快捷键与操作" onClose={() => setShortcutsOpen(false)}><div className="shortcut-guide"><ShortcutColumn title="键盘快捷键" items={keyboardShortcuts} /><ShortcutColumn title="时间轴操作" items={timelineShortcuts} /></div></Modal>}
    {candidateModalOpen && <Modal title="新增操作对象候选" onClose={() => { if (!candidateSaving) setCandidateModalOpen(false) }} footer={<><button className="secondary-button" type="button" disabled={candidateSaving} onClick={() => setCandidateModalOpen(false)}>取消</button><button className="primary-button" type="button" disabled={candidateSaving || !candidateForm.name.trim()} onClick={() => void createOperationCandidate()}>{candidateSaving ? '正在提交...' : '提交候选'}</button></>}><div className="candidate-object-form"><p>候选对象将提交到“{workspace.operationLibraryName || '项目操作对象库'}”，审核通过后才可用于关键帧。</p><label><span>对象名称 <i className="required-mark">*</i></span><input autoFocus value={candidateForm.name} maxLength={100} onChange={(event) => setCandidateForm({ ...candidateForm, name: event.target.value })} placeholder="请输入对象名称" /></label><label><span>别名</span><input value={candidateForm.alias} maxLength={100} onChange={(event) => setCandidateForm({ ...candidateForm, alias: event.target.value })} placeholder="请输入对象别名（选填）" /></label><label><span>属性</span><input value={candidateForm.attribute} maxLength={500} onChange={(event) => setCandidateForm({ ...candidateForm, attribute: event.target.value })} placeholder="请输入对象属性（选填）" /></label></div></Modal>}
    {keyFrameModalOpen && selected?.type === 'action' && <Modal title={editingKeyFrame ? '编辑关键帧' : '标记关键帧'} onClose={() => setKeyFrameModalOpen(false)} footer={<>{editingKeyFrame && <button className="secondary-button danger-button" type="button" onClick={deleteEditingKeyFrame}>删除关键帧</button>}<button className="secondary-button" type="button" onClick={() => setKeyFrameModalOpen(false)}>取消</button><button className="primary-button" type="button" disabled={operationObjectsLoading || !keyFrameFormValid} onClick={saveKeyFrame}>保存关键帧</button></>}><div className="keyframe-modal-form"><div className="keyframe-summary"><strong>小目标 {selected.code || selected.sequence}</strong><span>当前帧 F{editingKeyFrame?.frame ?? currentFrame}</span></div><fieldset><legend>事件类型 <i className="required-mark">*</i></legend><div>{(Object.entries(keyFrameTypeLabels) as Array<[AnnotationKeyFrame['type'], string]>).map(([value, label]) => <label key={value}><input type="radio" name="keyframe-type" checked={keyFrameForm.type === value} onChange={() => setKeyFrameForm({ ...keyFrameForm, type: value, operationObjectIds: value === 'abnormal' ? [] : keyFrameForm.operationObjectIds, detail: value === 'contact' ? '' : keyFrameForm.detail })} />{label}</label>)}</div></fieldset>{keyFrameNeedsObject && <div className="keyframe-object-field"><span>关联对象 <i className="required-mark">*</i></span>{operationObjectsLoading ? <div className="keyframe-object-empty">正在加载操作对象...</div> : operationObjects.length ? <div className="keyframe-object-options">{operationObjects.map((item) => <label className={keyFrameForm.operationObjectIds.includes(item.id) ? 'selected' : ''} key={item.id}><input type="checkbox" value={item.id} checked={keyFrameForm.operationObjectIds.includes(item.id)} onChange={() => setKeyFrameForm((form) => ({ ...form, operationObjectIds: form.operationObjectIds.includes(item.id) ? form.operationObjectIds.filter((id) => id !== item.id) : [...form.operationObjectIds, item.id] }))} /><strong>{item.libraryName}：</strong><b>{item.name}{!item.approved && '（未审核）'}</b>{item.alias && <small>{item.alias}</small>}</label>)}</div> : <small>暂无操作对象，请先在标注配置中维护</small>}</div>}{keyFrameNeedsDetail && <label><span>{keyFrameForm.type === 'object_change' ? '变化说明' : '异常类型或说明'} <i className="required-mark">*</i></span><input value={keyFrameForm.detail} maxLength={2000} onChange={(event) => setKeyFrameForm({ ...keyFrameForm, detail: event.target.value })} placeholder={keyFrameForm.type === 'object_change' ? '请输入变化说明' : '请输入异常类型或说明'} /></label>}</div></Modal>}
    {commentPoint && <Modal title="添加批注" onClose={() => { if (!commentSubmitting) setCommentPoint(undefined) }} footer={<><button className="secondary-button" type="button" disabled={commentSubmitting} onClick={() => setCommentPoint(undefined)}>取消</button><button className="primary-button" type="button" disabled={commentSubmitting || !commentDraft.trim()} onClick={createComment}>{commentSubmitting ? '正在添加...' : '添加批注'}</button></>}><div className="page-comment-form"><p>批注位置：横向 {Math.round(commentPoint.x * 100)}%，纵向 {Math.round(commentPoint.y * 100)}%</p><textarea autoFocus value={commentDraft} maxLength={100} onChange={(event) => setCommentDraft(event.target.value)} placeholder="请输入批注内容（最多 100 字）" /><small>{commentDraft.length}/100</small></div></Modal>}
    {toast && <div className="toast">{toast}</div>}
  </main>
}
