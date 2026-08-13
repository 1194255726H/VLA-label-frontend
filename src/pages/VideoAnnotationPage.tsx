import {
  ArrowLeft, Check, ChevronDown, CircleAlert, Expand, Pause, Play, Redo2, RotateCcw,
  Save, SkipBack, SkipForward, Trash2, Undo2, X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { BrandLogo } from '../components/BrandLogo'
import { annotationApi } from '../services/annotationApi'
import type { AnnotationResult, AnnotationSegment, AnnotationWorkspace, SessionResponse } from '../types/api'

const nodeLabels = { annotation: '标注', review: '质检', quality: '审核', acceptance: '验收' }

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

function overlaps(items: AnnotationSegment[], startFrame: number, endFrame: number) {
  return items.some((item) => startFrame < item.endFrame && endFrame > item.startFrame)
}

function firstCoverageGap(goal: AnnotationSegment, result: AnnotationResult) {
  const intervals = [...result.actions.filter((item) => item.parentId === goal.id), ...result.invalidRanges]
    .map((item) => ({ start: Math.max(goal.startFrame, item.startFrame), end: Math.min(goal.endFrame, item.endFrame) }))
    .filter((item) => item.end > item.start).sort((a, b) => a.start - b.start)
  let cursor = goal.startFrame
  for (const interval of intervals) { if (interval.start > cursor) return { startFrame: cursor, endFrame: interval.start }; cursor = Math.max(cursor, interval.end) }
  return cursor < goal.endFrame ? { startFrame: cursor, endFrame: goal.endFrame } : null
}

function normalizeInvalidRanges(ranges: AnnotationResult['invalidRanges']) {
  const ordered = [...ranges].sort((a, b) => a.startFrame - b.startFrame)
  return ordered.reduce<AnnotationResult['invalidRanges']>((merged, range) => {
    const last = merged.at(-1)
    if (last && range.startFrame <= last.endFrame) last.endFrame = Math.max(last.endFrame, range.endFrame)
    else merged.push({ ...range })
    return merged
  }, [])
}

type TimelineViewport = { startFrame: number; endFrame: number }
type TimelineDraft = { level: 'goal' | 'action'; startFrame: number; endFrame: number; parentId?: string }

const MINIMUM_VIEWPORT_FRAMES = 8

function clampViewport(domainStart: number, domainEnd: number, startFrame: number, endFrame: number) {
  const domainSpan = Math.max(1, domainEnd - domainStart)
  const minimumSpan = Math.min(domainSpan, MINIMUM_VIEWPORT_FRAMES)
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

function frameRulerSteps(frameCount: number, width: number) {
  const major = niceFrameStep(frameCount * 104 / Math.max(320, width))
  const minor = major >= 10 ? major / 5 : major >= 2 ? major / 2 : 1
  return { major, minor: Math.max(1, Math.round(minor)) }
}

function wheelDelta(event: React.WheelEvent) {
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1
  return { x: event.deltaX * unit, y: event.deltaY * unit }
}

function viewportFromWheel(domainStart: number, domainEnd: number, viewport: TimelineViewport, event: React.WheelEvent, rect: DOMRect) {
  const span = Math.max(1, viewport.endFrame - viewport.startFrame)
  const delta = wheelDelta(event)
  const horizontal = event.shiftKey || Math.abs(delta.x) > Math.abs(delta.y)
  if (horizontal) {
    const wheel = event.shiftKey && Math.abs(delta.x) <= Math.abs(delta.y) ? delta.y : delta.x
    const frameDelta = Math.sign(wheel) * Math.max(1, Math.round(span * Math.min(0.5, Math.abs(wheel) / 700)))
    return clampViewport(domainStart, domainEnd, viewport.startFrame + frameDelta, viewport.endFrame + frameDelta)
  }
  const pointerRatio = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)))
  const anchorFrame = viewport.startFrame + pointerRatio * span
  const exponent = Math.max(-0.5, Math.min(0.5, delta.y * 0.0018))
  const domainSpan = Math.max(1, domainEnd - domainStart)
  const nextSpan = Math.max(Math.min(domainSpan, MINIMUM_VIEWPORT_FRAMES), Math.min(domainSpan, Math.round(span * Math.exp(exponent))))
  const nextStart = anchorFrame - pointerRatio * nextSpan
  return clampViewport(domainStart, domainEnd, nextStart, nextStart + nextSpan)
}

function segmentNumber(item: AnnotationSegment, fallbackIndex: number) {
  const suffix = item.type === 'goal'
    ? item.code?.match(/(?:^|-)(\d{3})$/)?.[1]
    : item.code?.match(/(?:^|-)(\d{3}-A\d{3})$/)?.[1]
  if (suffix) return suffix
  const sequence = String(item.sequence || fallbackIndex + 1).padStart(3, '0')
  return item.type === 'goal' ? sequence : `A${sequence}`
}

function TimelineLane({ label, items, childItems = [], draft, totalFrames, rangeStartFrame = 0, rangeEndFrame = totalFrames, viewport, frameRate, currentFrame, selectedId, invalidRanges, readonly, onSeek, onSelect, onHover, onRangeChange, onViewportChange }: {
  label: string; items: AnnotationSegment[]; totalFrames: number; rangeStartFrame?: number; rangeEndFrame?: number; currentFrame: number; selectedId?: string
  childItems?: AnnotationSegment[]; draft?: TimelineDraft
  viewport?: TimelineViewport
  frameRate: number; invalidRanges?: AnnotationResult['invalidRanges']; readonly?: boolean; onSeek: (frame: number) => void; onSelect: (item: AnnotationSegment) => void
  onHover?: (frame?: number) => void
  onRangeChange?: (item: AnnotationSegment, startFrame: number, endFrame: number, remember: boolean) => void
  onViewportChange?: (viewport: TimelineViewport) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const suppressClickRef = useRef(false)
  const [trackWidth, setTrackWidth] = useState(900)
  const [panning, setPanning] = useState(false)
  const domainStart = Math.max(0, Math.min(totalFrames, rangeStartFrame))
  const domainEnd = Math.max(domainStart, Math.min(totalFrames, rangeEndFrame))
  const normalizedViewport = clampViewport(domainStart, domainEnd, viewport?.startFrame ?? domainStart, viewport?.endFrame ?? domainEnd)
  const safeStart = normalizedViewport.startFrame
  const safeEnd = normalizedViewport.endFrame
  const safeSpan = Math.max(1, safeEnd - safeStart)
  const domainSpan = Math.max(1, domainEnd - domainStart)
  const zoomRatio = Math.max(1, domainSpan / safeSpan)
  const { major: majorRulerStep, minor: minorRulerStep } = frameRulerSteps(safeSpan, trackWidth)
  const firstTick = Math.ceil(safeStart / minorRulerStep) * minorRulerStep
  const playheadFrame = Math.max(safeStart, Math.min(safeEnd, currentFrame))
  const rulerFrames: number[] = []
  for (let frame = firstTick; frame <= safeEnd; frame += minorRulerStep) rulerFrames.push(frame)
  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    const updateWidth = () => setTrackWidth(track.clientWidth || 900)
    updateWidth()
    const observer = new ResizeObserver(updateWidth)
    observer.observe(track)
    return () => observer.disconnect()
  }, [])
  const frameFromPointer = (clientX: number, left: number, width: number) => (
    safeStart + Math.max(0, Math.min(safeSpan, Math.round((clientX - left) / width * safeSpan)))
  )
  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    if (!onViewportChange || domainEnd <= domainStart) return
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect?.width) return
    event.preventDefault()
    onViewportChange(viewportFromWheel(domainStart, domainEnd, normalizedViewport, event, rect))
  }
  function startViewportPan(event: React.PointerEvent<HTMLElement>) {
    if (!onViewportChange || safeSpan >= domainSpan || event.button !== 0 || (event.target as HTMLElement).closest('.range-handle')) return
    event.preventDefault(); event.stopPropagation()
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect?.width) return
    const panTrackWidth = rect.width
    const panTrackLeft = rect.left
    const originX = event.clientX
    const origin = normalizedViewport
    let dragged = false
    onSeek(frameFromPointer(event.clientX, rect.left, panTrackWidth))
    setPanning(true)
    function move(pointer: PointerEvent) {
      const pixels = pointer.clientX - originX
      if (Math.abs(pixels) >= 3) dragged = true
      const delta = Math.round(-pixels / panTrackWidth * safeSpan)
      const nextViewport = clampViewport(domainStart, domainEnd, origin.startFrame + delta, origin.endFrame + delta)
      onViewportChange?.(nextViewport)
      const pointerRatio = Math.max(0, Math.min(1, (pointer.clientX - panTrackLeft) / panTrackWidth))
      onSeek(nextViewport.startFrame + pointerRatio * (nextViewport.endFrame - nextViewport.startFrame))
    }
    function end() {
      suppressClickRef.current = dragged
      setPanning(false)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }
  function startRangeDrag(event: React.PointerEvent<HTMLButtonElement>, item: AnnotationSegment) {
    const target = event.target as HTMLElement
    const handle = target.closest<HTMLElement>('.range-handle')
    if (!handle) { startViewportPan(event); return }
    if (readonly || !onRangeChange || selectedId !== item.id) return
    event.preventDefault(); event.stopPropagation()
    const rect = event.currentTarget.parentElement?.getBoundingClientRect(); if (!rect) return
    const trackWidth = rect.width
    const mode = handle.dataset.handle === 'start' ? 'start' : 'end'
    const originX = event.clientX; const originStart = item.startFrame; const originEnd = item.endFrame; let first = true
    onSeek(mode === 'start' ? originStart : originEnd)
    function move(pointer: PointerEvent) {
      const delta = Math.round((pointer.clientX - originX) / trackWidth * safeSpan)
      const startFrame = mode === 'end' ? originStart : originStart + delta
      const endFrame = mode === 'start' ? originEnd : originEnd + delta
      onRangeChange?.(item, startFrame, endFrame, first); first = false
      onSeek(mode === 'start' ? startFrame : endFrame)
    }
    function end() { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end)
  }
  return <div className="annotation-lane"><span className="annotation-lane-label">{label}</span><div ref={trackRef} className={`annotation-track${panning ? ' panning' : ''}`} title={`${label}时间轴 · ${zoomRatio.toFixed(2)} 倍 · F${safeStart} - F${safeEnd}`} onWheel={handleWheel} onDoubleClick={(event) => { if (!(event.target as HTMLElement).closest('.timeline-block')) onViewportChange?.({ startFrame: domainStart, endFrame: domainEnd }) }} onPointerDown={startViewportPan} onPointerMove={(event) => { const rect = event.currentTarget.getBoundingClientRect(); onHover?.(frameFromPointer(event.clientX, rect.left, rect.width)) }} onPointerLeave={() => onHover?.()} onClick={(event) => {
    if (suppressClickRef.current) { suppressClickRef.current = false; return }
    const rect = event.currentTarget.getBoundingClientRect(); onSeek(frameFromPointer(event.clientX, rect.left, rect.width))
  }}>
    <div className="timeline-ruler" aria-hidden="true">{rulerFrames.map((frame) => { const major = frame % majorRulerStep === 0; return <i className={major ? 'major' : 'minor'} key={frame} style={{ left: `${(frame - safeStart) / safeSpan * 100}%` }}>{major && <><em>{timeText(frame / frameRate)}</em><span>F{frame}</span></>}</i> })}</div>
    <span className="timeline-zoom-readout">{zoomRatio.toFixed(zoomRatio < 10 ? 2 : 1)}x · {safeSpan}帧</span>
    {invalidRanges?.flatMap((range) => {
      const visibleStart = Math.max(safeStart, range.startFrame)
      const visibleEnd = Math.min(safeEnd, range.endFrame)
      return visibleEnd > visibleStart ? [<i className="invalid-block" key={range.id} title={`无效：${range.reason}`} style={{ left: `${(visibleStart - safeStart) / safeSpan * 100}%`, width: `${(visibleEnd - visibleStart) / safeSpan * 100}%` }} />] : []
    })}
    {items.flatMap((item, index) => {
      const visibleStart = Math.max(safeStart, item.startFrame)
      const visibleEnd = Math.min(safeEnd, item.endFrame)
      if (visibleEnd <= visibleStart) return []
      const number = segmentNumber(item, index)
      const children = item.type === 'goal' ? childItems.filter((child) => child.parentId === item.id) : []
      const childDraft = item.type === 'goal' && draft?.level === 'action' && draft.parentId === item.id ? draft : undefined
      const visibleItemSpan = Math.max(1, visibleEnd - visibleStart)
      return [<button className={`timeline-block ${item.type}${children.length || childDraft ? ' has-child-overview' : ''}${selectedId === item.id ? ' selected' : ''}${item.startFrame < safeStart ? ' clipped-start' : ''}${item.endFrame > safeEnd ? ' clipped-end' : ''}`} type="button" key={item.id} title={`${item.code || number} · ${item.labelName || (item.type === 'no_action' ? '无动作' : '未选择标签')}`} style={{ left: `${(visibleStart - safeStart) / safeSpan * 100}%`, width: `${visibleItemSpan / safeSpan * 100}%`, '--segment-color': item.color } as React.CSSProperties} onPointerDown={(event) => startRangeDrag(event, item)} onClick={(event) => { event.stopPropagation(); if (suppressClickRef.current) { suppressClickRef.current = false; return }; onSelect(item) }}><span className="timeline-block-bar"><span className="timeline-block-copy">{number} · {((item.endFrame - item.startFrame) / frameRate).toFixed(item.type === 'goal' ? 3 : 0)}s</span>{item.keyFrames?.map((frame) => <i className="timeline-keyframe" key={frame.id} style={{ left: `${(frame.frame - item.startFrame) / Math.max(1, item.endFrame - item.startFrame) * 100}%` }} />)}{(children.length > 0 || childDraft) && <span className="timeline-child-overview" aria-hidden="true">{children.flatMap((child) => { const childStart = Math.max(visibleStart, child.startFrame); const childEnd = Math.min(visibleEnd, child.endFrame); return childEnd > childStart ? [<i key={child.id} style={{ left: `${(childStart - visibleStart) / visibleItemSpan * 100}%`, width: `${(childEnd - childStart) / visibleItemSpan * 100}%`, '--child-color': child.color } as React.CSSProperties} />] : [] })}{childDraft && (() => { const draftStart = Math.max(visibleStart, childDraft.startFrame); const draftEnd = Math.min(visibleEnd, childDraft.endFrame); return draftEnd > draftStart ? <i className="draft" style={{ left: `${(draftStart - visibleStart) / visibleItemSpan * 100}%`, width: `${(draftEnd - draftStart) / visibleItemSpan * 100}%` }} /> : null })()}</span>}</span>{selectedId === item.id && !readonly && <><i className="range-handle start" data-handle="start" /><i className="range-handle end" data-handle="end" /></>}</button>]
    })}
    {draft && draft.level === (label === '单次任务' ? 'goal' : 'action') && draft.endFrame >= safeStart && draft.startFrame <= safeEnd && <span className="timeline-draft" style={{ left: `${(Math.max(safeStart, draft.startFrame) - safeStart) / safeSpan * 100}%`, width: `${Math.max(1, Math.min(safeEnd, draft.endFrame) - Math.max(safeStart, draft.startFrame)) / safeSpan * 100}%` }} />}
    {!items.length && <span className="timeline-empty-hint">{label === '单次任务' ? '暂无单次任务片段' : '暂无小目标片段'}</span>}
    <span className="annotation-playhead" style={{ left: `${(playheadFrame - safeStart) / safeSpan * 100}%` }} />
    <span className="timeline-boundary start">{timeText(safeStart / frameRate)}</span><span className="timeline-boundary end">{timeText(safeEnd / frameRate)}</span>
  </div></div>
}

function GlobalTimeline({ goals, draft, selectedId, totalFrames, frameRate, currentFrame, viewport, onViewportChange, onSeek }: {
  goals: AnnotationSegment[]; draft?: TimelineDraft; selectedId?: string
  totalFrames: number; frameRate: number; currentFrame: number; viewport: TimelineViewport
  onViewportChange: (viewport: TimelineViewport) => void; onSeek: (frame: number) => void
}) {
  const safeTotal = Math.max(1, totalFrames)
  const normalized = clampViewport(0, totalFrames, viewport.startFrame, viewport.endFrame)
  const zoomRatio = Math.max(1, totalFrames / Math.max(1, normalized.endFrame - normalized.startFrame))
  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    if (!rect.width || totalFrames <= 0) return
    event.preventDefault()
    onViewportChange(viewportFromWheel(0, totalFrames, normalized, event, rect))
  }
  function startViewportDrag(event: React.PointerEvent<HTMLSpanElement>) {
    event.preventDefault(); event.stopPropagation()
    const track = event.currentTarget.parentElement?.getBoundingClientRect(); if (!track) return
    const trackWidth = track.width
    const target = event.target as HTMLElement
    const mode = target.dataset.viewportHandle === 'start' ? 'start' : target.dataset.viewportHandle === 'end' ? 'end' : 'move'
    const originX = event.clientX; const origin = normalized; const span = origin.endFrame - origin.startFrame
    function move(pointer: PointerEvent) {
      const delta = Math.round((pointer.clientX - originX) / trackWidth * safeTotal)
      if (mode === 'start') onViewportChange(clampViewport(0, totalFrames, origin.startFrame + delta, origin.endFrame))
      else if (mode === 'end') onViewportChange(clampViewport(0, totalFrames, origin.startFrame, origin.endFrame + delta))
      else onViewportChange(clampViewport(0, totalFrames, origin.startFrame + delta, origin.startFrame + delta + span))
    }
    function end() { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end)
  }
  return <div className="annotation-lane global-lane"><span className="annotation-lane-label">全局</span><div className="global-progress" onWheel={handleWheel} onDoubleClick={() => onViewportChange({ startFrame: 0, endFrame: totalFrames })} onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); onSeek(Math.round((event.clientX - rect.left) / rect.width * safeTotal)) }}>
    <span className="global-progress-fill" style={{ transform: `scaleX(${Math.max(0, Math.min(1, currentFrame / safeTotal))})` }} />
    <span className="global-goal-overview" aria-hidden="true">{goals.map((goal) => <i className={selectedId === goal.id ? 'selected' : ''} key={goal.id} style={{ left: `${goal.startFrame / safeTotal * 100}%`, width: `${(goal.endFrame - goal.startFrame) / safeTotal * 100}%`, '--overview-color': goal.color } as React.CSSProperties} />)}{draft?.level === 'goal' && <i className="draft" style={{ left: `${draft.startFrame / safeTotal * 100}%`, width: `${Math.max(1, draft.endFrame - draft.startFrame) / safeTotal * 100}%` }} />}</span>
    <span className="global-time start">00:00.000</span><span className="global-time current" style={{ left: `${Math.max(4, Math.min(96, currentFrame / safeTotal * 100))}%` }}>{timeText(currentFrame / frameRate)}</span><span className="global-time end">{timeText(totalFrames / frameRate)}</span>
    <span className={`timeline-viewport${zoomRatio === 1 ? ' full' : ''}`} style={{ left: `${normalized.startFrame / safeTotal * 100}%`, width: `${(normalized.endFrame - normalized.startFrame) / safeTotal * 100}%` }} onPointerDown={startViewportDrag} onClick={(event) => event.stopPropagation()} title={`视窗 ${zoomRatio.toFixed(2)} 倍 · F${normalized.startFrame} - F${normalized.endFrame}`}><i data-viewport-handle="start" /><b>{zoomRatio.toFixed(zoomRatio < 10 ? 2 : 1)}x</b><i data-viewport-handle="end" /></span>
    <span className="annotation-playhead overview" style={{ left: `${currentFrame / safeTotal * 100}%` }} />
  </div></div>
}

export function VideoAnnotationPage({ session }: { session: SessionResponse }) {
  const { taskId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const videoRef = useRef<HTMLVideoElement>(null)
  const undoStack = useRef<AnnotationResult[]>([])
  const redoStack = useRef<AnnotationResult[]>([])
  const [workspace, setWorkspace] = useState<AnnotationWorkspace>()
  const [result, setResult] = useState<AnnotationResult>()
  const [revision, setRevision] = useState(0)
  const [selectedId, setSelectedId] = useState<string>()
  const [currentFrame, setCurrentFrame] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [rate, setRate] = useState(1)
  const [mark, setMark] = useState<{ kind: 'goal' | 'action' | 'no_action' | 'invalid'; frame: number }>()
  const [history, setHistory] = useState({ undo: 0, redo: 0 })
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [commentDraft, setCommentDraft] = useState('')
  const [keyframeObject, setKeyframeObject] = useState('')
  const [hoverPoint, setHoverPoint] = useState<{ level: 'goal' | 'action'; frame: number }>()
  const [goalViewport, setGoalViewport] = useState<TimelineViewport>({ startFrame: 0, endFrame: 0 })

  useEffect(() => {
    let active = true
    annotationApi.getWorkspace(taskId, searchParams.get('readonly') === '1').then((data) => {
      if (!active) return
      undoStack.current = []
      redoStack.current = []
      setHistory({ undo: 0, redo: 0 })
      setSelectedId(undefined)
      setWorkspace(data)
      setResult(data.result)
      setRevision(data.currentRevision)
    }).catch((reason) => setError(reason instanceof Error ? reason.message : '操作台加载失败'))
    return () => { active = false }
  }, [searchParams, taskId])

  useEffect(() => {
    if (!workspace?.session) return
    const heartbeat = window.setInterval(() => annotationApi.heartbeat(taskId).catch(() => setToast('编辑会话心跳失败，请尽快保存')), workspace.session.heartbeatIntervalSeconds * 1000)
    return () => { window.clearInterval(heartbeat); annotationApi.release(taskId) }
  }, [taskId, workspace?.session])

  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) { if (dirty) event.preventDefault() }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [dirty])

  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 2400); return () => clearTimeout(timer) }, [toast])

  const approvalStage = Boolean(workspace && workspace.node !== 'annotation')
  const hardReadonly = Boolean(workspace?.readonly || searchParams.get('readonly') === '1' || submitted)
  const readonly = Boolean(hardReadonly || approvalStage)
  const selected = useMemo(() => result && [...result.goals, ...result.actions].find((item) => item.id === selectedId), [result, selectedId])
  const selectedGoal = selected?.type === 'goal' ? selected : result?.goals.find((item) => item.id === selected?.parentId)
  const visibleActions = selectedGoal ? result?.actions.filter((item) => item.parentId === selectedGoal.id) || [] : []
  const goalTimelineViewport = result && goalViewport.endFrame > goalViewport.startFrame
    ? goalViewport
    : { startFrame: 0, endFrame: result?.totalFrames || 0 }
  const currentSeconds = currentFrame / (result?.frameRate || 30)
  const visibleLabels = workspace?.labels.filter((item) => item.appliesTo === (selected?.type === 'goal' ? 'goal' : 'action') || item.appliesTo === 'both') || []
  const draftRange = mark && ['goal', 'action', 'no_action'].includes(mark.kind) ? (() => {
    const pointerFrame = !playing && hoverPoint ? hoverPoint.frame : currentFrame
    return {
      level: mark.kind === 'goal' ? 'goal' : 'action',
      startFrame: Math.min(mark.frame, pointerFrame),
      endFrame: Math.max(mark.frame, pointerFrame),
      parentId: mark.kind === 'goal' ? undefined : selectedGoal?.id,
    } as TimelineDraft
  })() : undefined

  const seek = useCallback((frame: number) => {
    if (!result) return
    const next = Math.max(0, Math.min(result.totalFrames, Math.round(frame)))
    if (videoRef.current && workspace?.videoUrl) videoRef.current.currentTime = next / result.frameRate
    setCurrentFrame(next)
  }, [result, workspace?.videoUrl])

  function hoverTimeline(level: 'goal' | 'action', frame?: number) {
    setHoverPoint(frame === undefined ? undefined : { level, frame })
    if (frame !== undefined && mark && !playing) seek(frame)
  }

  function mutate(next: AnnotationResult, remember = true) {
    if (result && remember) { undoStack.current.push(structuredClone(result)); if (undoStack.current.length > 50) undoStack.current.shift(); redoStack.current = []; setHistory({ undo: undoStack.current.length, redo: 0 }) }
    next.usedAnnotationConfigCodes = [...new Set([...next.goals, ...next.actions].map((item) => item.labelId).filter(Boolean) as string[])]
    setResult(next); setDirty(true)
  }

  function undo() { const previous = undoStack.current.pop(); if (!previous || !result) return; redoStack.current.push(structuredClone(result)); setResult(previous); setDirty(true); setHistory({ undo: undoStack.current.length, redo: redoStack.current.length }) }
  function redo() { const next = redoStack.current.pop(); if (!next || !result) return; undoStack.current.push(structuredClone(result)); setResult(next); setDirty(true); setHistory({ undo: undoStack.current.length, redo: redoStack.current.length }) }

  function finishMark(kind: 'goal' | 'action' | 'no_action' | 'invalid', targetFrame = currentFrame) {
    if (!result || readonly) return
    if (!mark || mark.kind !== kind) { setMark({ kind, frame: currentFrame }); setToast(`已记录起点 F${currentFrame}，移动播放头后确认终点`); return }
    const startFrame = Math.min(mark.frame, targetFrame)
    const endFrame = Math.max(mark.frame, targetFrame)
    setMark(undefined)
    if (startFrame === endFrame) return setToast('起止帧相同，未创建区间')
    if (kind === 'invalid') {
      if (!selectedGoal || startFrame < selectedGoal.startFrame || endFrame > selectedGoal.endFrame) return setToast('无效区间必须位于当前单次任务内')
      mutate({ ...result, invalidRanges: normalizeInvalidRanges([...result.invalidRanges, { id: crypto.randomUUID(), startFrame, endFrame, reason: '视频内容无效' }]) }); return
    }
    if (kind === 'goal') {
      if (overlaps(result.goals, startFrame, endFrame)) return setToast('单次任务区间不能重叠')
      const sequence = result.nextGoalSequence
      const item: AnnotationSegment = { id: crypto.randomUUID(), sequence, code: `${workspace?.dataName || 'VLA'}-${String(sequence).padStart(3, '0')}`, type: 'goal', startFrame, endFrame, color: '#2563EB', descriptionZh: '' }
      mutate({ ...result, nextGoalSequence: sequence + 1, nextActionSequenceByGoal: { ...result.nextActionSequenceByGoal, [item.id]: 1 }, goals: [...result.goals, item].sort((a, b) => a.startFrame - b.startFrame) }); setSelectedId(item.id); return
    }
    if (!selectedGoal) return setToast('请先选择一个单次任务')
    if (startFrame < selectedGoal.startFrame || endFrame > selectedGoal.endFrame) return setToast('小目标必须位于父级单次任务内')
    const siblings = result.actions.filter((item) => item.parentId === selectedGoal.id)
    if (overlaps(siblings, startFrame, endFrame)) return setToast('同一单次任务内的小目标不能重叠')
    const sequence = result.nextActionSequenceByGoal[selectedGoal.id] || 1
    const noAction = kind === 'no_action'
    const item: AnnotationSegment = { id: crypto.randomUUID(), sequence, code: `${selectedGoal.code || selectedGoal.id}-A${String(sequence).padStart(3, '0')}`, parentId: selectedGoal.id, type: noAction ? 'no_action' : 'action', startFrame, endFrame, color: noAction ? '#64748B' : '#16A34A', descriptionZh: noAction ? '未执行有效动作' : '', descriptionEn: noAction ? 'No valid action is performed.' : undefined, systemCode: noAction ? 'NO_ACTION' : undefined, keyFrames: [], keyframeNoneConfirmed: noAction }
    mutate({ ...result, nextActionSequenceByGoal: { ...result.nextActionSequenceByGoal, [selectedGoal.id]: sequence + 1 }, actions: [...result.actions, item].sort((a, b) => a.startFrame - b.startFrame) }); setSelectedId(item.id)
  }

  function updateSelected(changes: Partial<AnnotationSegment>) {
    if (!result || !selected) return
    const key = selected.type === 'goal' ? 'goals' : 'actions'
    mutate({ ...result, [key]: result[key].map((item) => item.id === selected.id ? { ...item, ...changes } : item) })
  }

  function changeRange(target: AnnotationSegment, requestedStart: number, requestedEnd: number, remember: boolean) {
    if (!result || readonly) return
    const isGoal = target.type === 'goal'
    const siblings = (isGoal ? result.goals : result.actions.filter((item) => item.parentId === target.parentId)).filter((item) => item.id !== target.id)
    const parent = isGoal ? undefined : result.goals.find((item) => item.id === target.parentId)
    const duration = target.endFrame - target.startFrame
    const moving = requestedEnd - requestedStart === duration
    let startFrame = Math.round(requestedStart); let endFrame = Math.round(requestedEnd)
    const minimum = 1
    if (moving) { const lower = Math.max(parent?.startFrame || 0, ...siblings.filter((item) => item.endFrame <= target.startFrame).map((item) => item.endFrame)); const upper = Math.min(parent?.endFrame || result.totalFrames, ...siblings.filter((item) => item.startFrame >= target.endFrame).map((item) => item.startFrame)); startFrame = Math.max(lower, Math.min(startFrame, upper - duration)); endFrame = startFrame + duration }
    else { const lower = Math.max(parent?.startFrame || 0, ...siblings.filter((item) => item.endFrame <= target.startFrame).map((item) => item.endFrame)); const upper = Math.min(parent?.endFrame || result.totalFrames, ...siblings.filter((item) => item.startFrame >= target.endFrame).map((item) => item.startFrame)); startFrame = Math.max(lower, Math.min(startFrame, target.endFrame - minimum)); endFrame = Math.min(upper, Math.max(endFrame, target.startFrame + minimum)) }
    if (isGoal) {
      const children = result.actions.filter((item) => item.parentId === target.id)
      if (!moving && children.length) { startFrame = Math.min(startFrame, ...children.map((item) => item.startFrame)); endFrame = Math.max(endFrame, ...children.map((item) => item.endFrame)) }
      const delta = moving ? startFrame - target.startFrame : 0
      mutate({ ...result, goals: result.goals.map((item) => item.id === target.id ? { ...item, startFrame, endFrame } : item), actions: delta ? result.actions.map((item) => item.parentId === target.id ? { ...item, startFrame: item.startFrame + delta, endFrame: item.endFrame + delta, keyFrames: item.keyFrames?.map((frame) => ({ ...frame, frame: frame.frame + delta })) } : item) : result.actions }, remember)
    } else mutate({ ...result, actions: result.actions.map((item) => item.id === target.id ? { ...item, startFrame, endFrame } : item) }, remember)
  }

  function removeSelected() {
    if (!result || !selected) return
    if (selected.type === 'goal') {
      const ranges = result.invalidRanges.flatMap((range) => range.endFrame <= selected.startFrame || range.startFrame >= selected.endFrame ? [range] : [range.startFrame < selected.startFrame ? { ...range, id: crypto.randomUUID(), endFrame: selected.startFrame } : null, range.endFrame > selected.endFrame ? { ...range, id: crypto.randomUUID(), startFrame: selected.endFrame } : null].filter(Boolean) as AnnotationResult['invalidRanges'])
      mutate({ ...result, goals: result.goals.filter((item) => item.id !== selected.id), actions: result.actions.filter((item) => item.parentId !== selected.id), invalidRanges: ranges })
    }
    else mutate({ ...result, actions: result.actions.filter((item) => item.id !== selected.id) })
    setSelectedId(undefined)
  }

  async function save(showToast = true) {
    if (!result || hardReadonly || saving) return revision
    setSaving(true)
    try { const nextRevision = await annotationApi.save(taskId, result, revision); setRevision(nextRevision); setDirty(false); if (showToast) setToast('草稿已保存'); return nextRevision }
    catch (reason) { setToast(reason instanceof Error ? reason.message : '保存失败'); throw reason }
    finally { setSaving(false) }
  }

  async function submit() {
    if (!result) return
    if (!result.goals.length) return setToast('至少创建一个单次任务后才能提交')
    const gap = result.goals.map((goal) => ({ goal, gap: firstCoverageGap(goal, result) })).find((item) => item.gap)
    if (gap?.gap) { setSelectedId(gap.goal.id); seek(gap.gap.startFrame); return setToast(`单次任务存在未覆盖区间 F${gap.gap.startFrame}–F${gap.gap.endFrame}`) }
    const missingSkill = result.actions.find((item) => item.type === 'action' && !item.labelId)
    if (missingSkill) { setSelectedId(missingSkill.id); seek(missingSkill.startFrame); return setToast('普通小目标必须选择项目原子技能') }
    const fullyInvalid = result.actions.find((item) => result.invalidRanges.some((range) => range.startFrame <= item.startFrame && range.endFrame >= item.endFrame))
    if (fullyInvalid) { setSelectedId(fullyInvalid.id); return setToast('小目标被无效区间完全覆盖，请调整或删除') }
    try { const nextRevision = dirty ? await save(false) : revision; await annotationApi.submit(taskId, result, nextRevision); setSubmitted(true); setToast('任务提交成功') } catch { /* save and submit report their own errors */ }
  }

  function addComment() {
    if (!result || hardReadonly || !commentDraft.trim() || workspace?.node === 'annotation') return
    const sequence = Math.max(0, ...result.comments.map((item) => item.sequence)) + 1
    mutate({ ...result, comments: [...result.comments, { id: crypto.randomUUID(), sequence, content: commentDraft.trim().slice(0, 100), frame: currentFrame, location: selected?.code || '视频画面', status: 'open', stage: workspace?.node || 'review', draft: true }] })
    setCommentDraft('')
  }

  function updateCommentStatus(id: string, status: 'open' | 'addressed' | 'resolved') {
    if (!result || hardReadonly) return
    mutate({ ...result, comments: result.comments.map((item) => item.id === id ? { ...item, status } : item) })
  }

  function addKeyframe() {
    if (!result || !selected || selected.type !== 'action' || currentFrame < selected.startFrame || currentFrame >= selected.endFrame || !keyframeObject.trim()) return setToast('请在当前小目标范围内定位并填写对象名称')
    if (selected.keyFrames?.some((item) => item.frame === currentFrame)) return setToast('当前帧已经标记关键事件')
    const sequence = Math.max(0, ...(selected.keyFrames || []).map((item) => item.sequence)) + 1
    updateSelected({ keyFrames: [...(selected.keyFrames || []), { id: crypto.randomUUID(), sequence, frame: currentFrame, type: 'contact', objectName: keyframeObject.trim().slice(0, 80), detail: '' }], keyframeNoneConfirmed: false })
    setKeyframeObject('')
  }

  async function returnTask() {
    if (!result) return
    const unresolved = result.comments.filter((item) => item.status !== 'resolved')
    if (!unresolved.length) return setToast('退回前至少需要一条未解决批注')
    try { if (dirty) await save(false); await annotationApi.reject(taskId, `${nodeLabels[workspace?.node || 'review']}批注共 ${unresolved.length} 条`); setDirty(false); setToast('任务已退回'); window.setTimeout(() => navigate('/workbench'), 700) } catch (failure) { setToast(failure instanceof Error ? failure.message : '退回失败') }
  }

  useEffect(() => {
    if (!dirty || hardReadonly || saving || !result) return
    const snapshot = result
    const timer = window.setTimeout(() => {
      setSaving(true)
      annotationApi.save(taskId, snapshot, revision)
        .then((nextRevision) => {
          setRevision(nextRevision)
          setResult((current) => {
            if (current === snapshot) setDirty(false)
            return current
          })
        })
        .catch((reason) => setToast(reason instanceof Error ? reason.message : '自动保存失败'))
        .finally(() => setSaving(false))
    }, 1800)
    return () => window.clearTimeout(timer)
  }, [dirty, hardReadonly, result, revision, saving, taskId])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || event.repeat) return
      if (event.code === 'Space') {
        event.preventDefault()
        if (videoRef.current?.paused) videoRef.current.play()
        else videoRef.current?.pause()
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); return }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); return }
      const pointerFrame = !playing && hoverPoint ? hoverPoint.frame : currentFrame
      if (event.key.toLowerCase() === 'q' && !mark) setMark({ kind: hoverPoint?.level === 'action' || (!hoverPoint && selectedGoal) ? 'action' : 'goal', frame: pointerFrame })
      if (event.key.toLowerCase() === 'w' && !mark && selectedGoal) setMark({ kind: 'no_action', frame: pointerFrame })
      if (event.key.toLowerCase() === 'x' && !mark && selectedGoal) setMark({ kind: 'invalid', frame: pointerFrame })
      if (event.key === 'Backspace' && selectedId?.startsWith('invalid:') && result) { event.preventDefault(); mutate({ ...result, invalidRanges: result.invalidRanges.filter((item) => `invalid:${item.id}` !== selectedId) }); setSelectedId(undefined) }
      if (event.key === 'Escape') setMark(undefined)
    }
    function onKeyUp(event: KeyboardEvent) { const endFrame = !playing && hoverPoint ? hoverPoint.frame : currentFrame; if (event.key.toLowerCase() === 'q' && (mark?.kind === 'goal' || mark?.kind === 'action')) finishMark(mark.kind, endFrame); if (event.key.toLowerCase() === 'w' && mark?.kind === 'no_action') finishMark('no_action', endFrame); if (event.key.toLowerCase() === 'x' && mark?.kind === 'invalid') finishMark('invalid', endFrame) }
    window.addEventListener('keydown', onKeyDown); window.addEventListener('keyup', onKeyUp)
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp) }
  })

  if (error) return <main className="annotation-load-state"><CircleAlert size={38} /><h1>无法打开视频标注工作台</h1><p>{error}</p><button className="primary-button" type="button" onClick={() => navigate('/workbench')}>返回工作台</button></main>
  if (!workspace || !result) return <main className="annotation-load-state"><RotateCcw className="spinning" size={34} /><p>正在加载任务和标注结果...</p></main>

  function inlineSegmentEditor(item: AnnotationSegment) {
    const noAction = item.type === 'no_action'
    const labels = workspace!.labels.filter((label) => label.appliesTo === (item.type === 'goal' ? 'goal' : 'action') || label.appliesTo === 'both')
    const selectedLabel = labels.find((label) => label.id === item.labelId)
    return <div className="segment-inline-editor" onClick={(event) => event.stopPropagation()}>
      {noAction ? <div className="segment-inline-row"><div className="segment-inline-system">系统无动作</div><span className="segment-inline-duration"><b>F{item.startFrame}-F{item.endFrame}</b><small>{timeText((item.endFrame - item.startFrame) / result!.frameRate)}</small></span><button className="segment-inline-delete" type="button" disabled={readonly} onClick={removeSelected} aria-label="删除片段" title="删除片段"><Trash2 size={14} /></button></div> : <div className="segment-inline-fields">
        <div className="segment-inline-row"><label className="label-select"><select className={selectedLabel ? 'has-label-color' : ''} disabled={readonly} title={item.labelName || '请选择标签'} style={selectedLabel ? { '--selected-label-color': selectedLabel.color, '--selected-label-text': contrastTextColor(selectedLabel.color) } as React.CSSProperties : undefined} value={item.labelId || ''} onChange={(event) => { const label = labels.find((candidate) => candidate.id === event.target.value); updateSelected({ labelId: label?.id, labelName: label?.name, color: label?.color || item.color }) }}><option value="">请选择标签</option>{labels.map((label) => <option key={label.id} value={label.id} style={{ color: contrastTextColor(label.color), backgroundColor: label.color }}>{label.name}</option>)}</select></label>
        <label className="segment-content"><input disabled={readonly} value={item.descriptionZh} maxLength={300} onChange={(event) => updateSelected({ descriptionZh: event.target.value })} placeholder="输入片段内容（选填）" /></label><span className="segment-inline-duration"><b>F{item.startFrame}-F{item.endFrame}</b><small>{timeText((item.endFrame - item.startFrame) / result!.frameRate)}</small></span><button className="segment-inline-delete" type="button" disabled={readonly} onClick={removeSelected} aria-label="删除片段" title={item.type === 'goal' ? '删除单次任务及其全部小目标' : '删除片段'}><Trash2 size={14} /></button></div>
        {workspace!.node !== 'annotation' && <label className="wide"><span>英文内容（选填）</span><input disabled={readonly} value={item.descriptionEn || ''} maxLength={500} onChange={(event) => updateSelected({ descriptionEn: event.target.value })} placeholder="输入英文内容" /></label>}
      </div>}
    </div>
  }

  return <main className="annotation-page">
    <header className="annotation-header">
      <button className="annotation-back" type="button" onClick={() => navigate('/workbench')} aria-label="返回工作台"><BrandLogo compact /><ArrowLeft className="annotation-back-arrow" size={19} /></button>
      <div className="annotation-task-title"><div><strong>{workspace.dataName}</strong><span className="workflow-stage-chip">{nodeLabels[workspace.node]}</span></div><small>{workspace.taskCode} · {workspace.projectName}</small></div>
      <div className="annotation-save-state"><i className={dirty ? 'dirty' : ''} />{saving ? '正在保存' : dirty ? '有未保存修改' : `草稿已保存 · V${revision}`}</div>
      <div className="annotation-header-actions">
        {approvalStage && <button className="secondary-button" type="button" onClick={() => setCommentsOpen((value) => !value)}>全部批注（{result.comments.length}）</button>}
        <span className={readonly ? 'readonly-badge' : 'editing-badge'} title={`当前处理人：${session.account.name}`}>{readonly ? '标注内容已锁定' : '编辑模式'}</span>
        <button className="secondary-button" type="button" disabled={hardReadonly || !dirty || saving} onClick={() => save()}><Save size={15} />保存草稿</button>
        {approvalStage && <button className="secondary-button return-button" type="button" disabled={workspace.readonly || submitted} onClick={returnTask}>退回</button>}
        <button className="primary-button" type="button" disabled={hardReadonly || saving} onClick={submit}><Check size={16} />提交</button>
      </div>
    </header>

    <section className="annotation-workspace">
      <section className="video-stage">
        <div className="video-canvas"><video ref={videoRef} src={workspace.videoUrl || undefined} onTimeUpdate={(event) => setCurrentFrame(Math.round(event.currentTarget.currentTime * result.frameRate))} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />{!workspace.videoUrl && <div className="video-unavailable"><CircleAlert size={28} /><strong>视频暂不可播放</strong><span>后端返回的是对象存储地址，当前 API 尚未提供预签名播放链接</span></div>}<div className="video-controls"><div className="video-control-side"><span>{timeText(currentSeconds)} / {timeText(result.totalFrames / result.frameRate)}</span><b>F{currentFrame}</b></div><div className="video-control-center"><button type="button" onClick={() => seek(currentFrame - 1)} aria-label="上一帧" title="上一帧"><SkipBack size={18} /></button><button className="video-play" type="button" disabled={!workspace.videoUrl} onClick={() => videoRef.current?.paused ? videoRef.current.play() : videoRef.current?.pause()} aria-label={playing ? '暂停' : '播放'} title={playing ? '暂停' : '播放'}>{playing ? <Pause size={23} /> : <Play size={23} />}</button><button type="button" onClick={() => seek(currentFrame + 1)} aria-label="下一帧" title="下一帧"><SkipForward size={18} /></button></div><div className="video-control-side end"><label><select value={rate} disabled={!workspace.videoUrl} onChange={(event) => { const next = Number(event.target.value); setRate(next); if (videoRef.current) videoRef.current.playbackRate = next }}><option value="0.5">0.5×</option><option value="1">1×</option><option value="1.5">1.5×</option><option value="2">2×</option></select><ChevronDown size={13} /></label><button type="button" disabled={!workspace.videoUrl} onClick={() => videoRef.current?.requestFullscreen()} aria-label="全屏" title="全屏查看"><Expand size={18} /></button></div></div></div>
      </section>

      <aside className="annotation-inspector">
        <header><div><strong>片段列表 <b>{result.goals.length + result.actions.length}</b></strong><span>{result.goals.length} 个单次任务 · {result.actions.length} 个小目标</span></div></header>
        <div className="segment-list-columns"><span>片段</span><span>标签与描述</span><span>总时长</span></div>
        <div className="segment-tree">{result.goals.map((goal, index) => <div className="segment-group" key={goal.id}><div className={`segment-list-entry${selectedId === goal.id ? ' selected' : ''}`}><button className={selectedId === goal.id ? 'active' : ''} type="button" onClick={() => { setSelectedId(goal.id); seek(goal.startFrame) }}><i style={{ background: goal.color }} /><span><b>单次任务 {index + 1}</b><small>{goal.labelName || '未选择标签'} · {timeText((goal.endFrame - goal.startFrame) / result.frameRate)}</small></span></button>{selectedId === goal.id && inlineSegmentEditor(goal)}</div>{result.actions.filter((action) => action.parentId === goal.id).map((action, actionIndex) => <div className={`segment-list-entry child${selectedId === action.id ? ' selected' : ''}`} key={action.id}><button className={selectedId === action.id ? 'active' : ''} type="button" onClick={() => { setSelectedId(action.id); seek(action.startFrame) }}><i style={{ background: action.color }} /><span><b>小目标 {index + 1}.{actionIndex + 1}</b><small>{action.labelName || '未选择标签'} · {timeText((action.endFrame - action.startFrame) / result.frameRate)}</small></span></button>{selectedId === action.id && inlineSegmentEditor(action)}</div>)}</div>)}</div>
        {selected?.type === 'action' && <section className="keyframe-panel"><div className="keyframe-toolbar"><strong>关键帧（选填）</strong><span>F{currentFrame}</span><input value={keyframeObject} disabled={readonly} onChange={(event) => setKeyframeObject(event.target.value)} placeholder="接触对象名称" /><button type="button" disabled={readonly} onClick={addKeyframe}>标记当前帧</button></div>{selected.keyFrames?.map((frame) => <button type="button" className="keyframe-item" key={frame.id} onClick={() => seek(frame.frame)}><b>F{frame.frame}</b><span>{frame.objectName}</span>{!readonly && <X size={13} onClick={(event) => { event.stopPropagation(); updateSelected({ keyFrames: selected.keyFrames?.filter((item) => item.id !== frame.id) }) }} />}</button>)}</section>}
        {commentsOpen && <section className="comment-panel"><header><strong>全部批注</strong><button type="button" onClick={() => setCommentsOpen(false)}><X size={15} /></button></header><div className="comment-list">{result.comments.map((comment) => <article key={comment.id}><button type="button" onClick={() => seek(comment.frame)}>#{comment.sequence} · F{comment.frame}</button><p>{comment.content}</p><small>{comment.location}</small><div>{comment.status !== 'resolved' && <button type="button" disabled={hardReadonly} onClick={() => updateCommentStatus(comment.id, comment.status === 'open' ? 'addressed' : 'resolved')}>{comment.status === 'open' ? '标记已处理' : '确认解决'}</button>}{comment.status === 'resolved' && <button type="button" disabled={hardReadonly} onClick={() => updateCommentStatus(comment.id, 'open')}>重新打开</button>}</div></article>)}</div><div className="comment-create"><textarea value={commentDraft} disabled={hardReadonly} maxLength={100} onChange={(event) => setCommentDraft(event.target.value)} placeholder="输入当前帧或选中片段的批注" /><button type="button" disabled={hardReadonly || !commentDraft.trim()} onClick={addComment}>添加批注</button></div></section>}
      </aside>
    </section>

    <section className="annotation-timeline">
      <div className="annotation-label-bar"><span>片段标签</span>{selected?.type === 'no_action' ? <small>无动作由系统定义，无需选择项目标签</small> : !visibleLabels.length ? <small>当前类型无可用标签</small> : visibleLabels.map((label) => <button type="button" disabled={!selected || readonly} className={selected?.labelId === label.id ? 'active' : ''} style={{ '--label-color': label.color } as React.CSSProperties} key={label.id} onClick={() => updateSelected(selected?.labelId === label.id ? { labelId: undefined, labelName: undefined } : { labelId: label.id, labelName: label.name, color: label.color })}>{label.name}</button>)}</div>
      <header><div><strong>{draftRange ? `正在创建：${draftRange.level === 'goal' ? '单次任务' : '小目标'}` : selectedGoal ? `当前单次任务：${selectedGoal.labelName || selectedGoal.code || '未选择标签'}` : '当前创建：单次任务'}</strong><span>{draftRange ? `${timeText(draftRange.startFrame / result.frameRate)} - ${timeText(draftRange.endFrame / result.frameRate)} · 松开 Q 完成，Esc 取消` : 'Q 普通片段 · W 无动作 · X 视频无效区间'}</span></div><div>{selected && <button type="button" onClick={() => setSelectedId(undefined)}>退出预览</button>}<button type="button" disabled={readonly || !history.undo} onClick={undo} title="撤销"><Undo2 size={14} />撤销</button><button type="button" disabled={readonly || !history.redo} onClick={redo} title="重做"><Redo2 size={14} />重做</button></div></header>
      <div className="timeline-body">
        <GlobalTimeline goals={result.goals} draft={draftRange} selectedId={selectedGoal?.id} totalFrames={result.totalFrames} frameRate={result.frameRate} currentFrame={currentFrame} viewport={goalTimelineViewport} onViewportChange={setGoalViewport} onSeek={seek} />
        <TimelineLane label="单次任务" items={result.goals} childItems={result.actions} draft={draftRange} totalFrames={result.totalFrames} viewport={goalTimelineViewport} frameRate={result.frameRate} currentFrame={currentFrame} selectedId={selectedId} readonly={readonly} onHover={(frame) => hoverTimeline('goal', frame)} onRangeChange={changeRange} onViewportChange={setGoalViewport} onSeek={seek} onSelect={(item) => { videoRef.current?.pause(); setSelectedId(item.id) }} />
        {selectedGoal ? <TimelineLane label="小目标" items={visibleActions} draft={draftRange} totalFrames={result.totalFrames} viewport={goalTimelineViewport} frameRate={result.frameRate} currentFrame={currentFrame} selectedId={selectedId} invalidRanges={result.invalidRanges} readonly={readonly} onHover={(frame) => hoverTimeline('action', frame)} onRangeChange={changeRange} onViewportChange={setGoalViewport} onSeek={seek} onSelect={(item) => { videoRef.current?.pause(); setSelectedId(item.id) }} /> : <div className="annotation-lane"><span className="annotation-lane-label">小目标</span><div className="annotation-track empty"><span className="timeline-empty-hint">先选择一个单次任务片段</span></div></div>}
      </div>
    </section>
    {toast && <div className="toast">{toast}</div>}
  </main>
}
