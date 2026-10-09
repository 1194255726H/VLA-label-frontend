import { MoveDiagonal2, RotateCcw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react'
import {
  annotationLayoutLimits, DEFAULT_ANNOTATION_LAYOUT, fitAnnotationLayout, LAYOUT_SPLITTER_SIZE,
  readAnnotationLayout, saveAnnotationLayout,
} from '../utils/annotationLayout'
import type { AnnotationLayout } from '../utils/annotationLayout'

type ResizeDirection = 'horizontal' | 'vertical' | 'both'
type Drag = {
  pointerId: number; direction: ResizeDirection; x: number; y: number
  width: number; height: number; initial: AnnotationLayout; previous: AnnotationLayout
}

export function ResizableAnnotationLayout({ video, inspector, timeline }: {
  video: (resetButton: ReactNode) => ReactNode; inspector: ReactNode; timeline: ReactNode
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<Drag | null>(null)
  const [layout, setLayout] = useState(readAnnotationLayout)
  const layoutRef = useRef(layout)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [dragging, setDragging] = useState<ResizeDirection | null>(null)
  const effective = size.width && size.height ? fitAnnotationLayout(layout, size.width, size.height) : layout
  const limits = annotationLayoutLimits(size.width, size.height)

  const updateLayout = useCallback((next: AnnotationLayout) => {
    layoutRef.current = next
    setLayout(next)
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(() => {
      setSize({ width: container.clientWidth, height: container.clientHeight })
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const finishDrag = useCallback((cancel = false) => {
    const drag = dragRef.current
    if (!drag) return
    dragRef.current = null
    if (cancel) updateLayout(drag.previous)
    else saveAnnotationLayout(layoutRef.current)
    setDragging(null)
  }, [updateLayout])

  useEffect(() => {
    if (!dragging) return
    const root = document.documentElement
    const previousCursor = root.style.cursor
    const previousUserSelect = root.style.userSelect
    root.style.cursor = dragging === 'both' ? 'nwse-resize' : dragging === 'horizontal' ? 'col-resize' : 'row-resize'
    root.style.userSelect = 'none'
    const onBlur = () => finishDrag()
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); finishDrag(true) }
    }
    window.addEventListener('blur', onBlur)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      root.style.cursor = previousCursor
      root.style.userSelect = previousUserSelect
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [dragging, finishDrag])

  function startDrag(event: PointerEvent<HTMLElement>, direction: ResizeDirection) {
    if (event.button !== 0 || dragRef.current) return
    const container = containerRef.current
    if (!container) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const width = container.clientWidth
    const height = container.clientHeight
    dragRef.current = {
      pointerId: event.pointerId, direction, x: event.clientX, y: event.clientY, width, height,
      initial: fitAnnotationLayout(layoutRef.current, width, height), previous: layoutRef.current,
    }
    setDragging(direction)
  }

  function moveDrag(event: PointerEvent<HTMLElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const next = {
      videoRatio: drag.direction === 'vertical' ? drag.initial.videoRatio
        : drag.initial.videoRatio + (event.clientX - drag.x) / Math.max(1, drag.width - LAYOUT_SPLITTER_SIZE),
      workspaceRatio: drag.direction === 'horizontal' ? drag.initial.workspaceRatio
        : drag.initial.workspaceRatio + (event.clientY - drag.y) / Math.max(1, drag.height - LAYOUT_SPLITTER_SIZE),
    }
    // Preserve the user's preferred ratio on the axis that was not dragged.
    const fitted = fitAnnotationLayout(next, drag.width, drag.height)
    updateLayout({
      videoRatio: drag.direction === 'vertical' ? drag.previous.videoRatio : fitted.videoRatio,
      workspaceRatio: drag.direction === 'horizontal' ? drag.previous.workspaceRatio : fitted.workspaceRatio,
    })
  }

  function endDrag(event: PointerEvent<HTMLElement>, cancel = false) {
    if (dragRef.current?.pointerId !== event.pointerId) return
    if (!cancel) moveDrag(event)
    finishDrag(cancel)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  function resizeWithKeyboard(event: KeyboardEvent<HTMLElement>, direction: ResizeDirection) {
    if (dragRef.current) return
    const horizontal = direction !== 'vertical' && ['ArrowLeft', 'ArrowRight'].includes(event.key)
    const vertical = direction !== 'horizontal' && ['ArrowUp', 'ArrowDown'].includes(event.key)
    if (!horizontal && !vertical && !['Home', 'End'].includes(event.key)) return
    event.preventDefault()
    event.stopPropagation()
    const next = { ...effective }
    const step = event.shiftKey ? 0.05 : 0.01
    if (horizontal) next.videoRatio += event.key === 'ArrowRight' ? step : -step
    if (vertical) next.workspaceRatio += event.key === 'ArrowDown' ? step : -step
    if (event.key === 'Home' || event.key === 'End') {
      if (direction !== 'vertical') next.videoRatio = event.key === 'Home' ? limits.videoMin : limits.videoMax
      if (direction !== 'horizontal') next.workspaceRatio = event.key === 'Home' ? limits.workspaceMin : limits.workspaceMax
    }
    const fitted = fitAnnotationLayout(next, size.width, size.height)
    if (direction === 'vertical') fitted.videoRatio = layout.videoRatio
    if (direction === 'horizontal') fitted.workspaceRatio = layout.workspaceRatio
    updateLayout(fitted)
    saveAnnotationLayout(fitted)
  }

  const pointerHandlers = {
    onPointerMove: moveDrag,
    onPointerUp: (event: PointerEvent<HTMLElement>) => endDrag(event),
    onPointerCancel: (event: PointerEvent<HTMLElement>) => endDrag(event, true),
    onLostPointerCapture: () => finishDrag(),
  }

  return <div ref={containerRef} className={`annotation-layout${dragging ? ' resizing' : ''}`} style={{
      gridTemplateRows: `minmax(0, ${effective.workspaceRatio}fr) ${LAYOUT_SPLITTER_SIZE}px minmax(0, ${1 - effective.workspaceRatio}fr)`,
    }}>
      <section className="annotation-workspace" style={{
        gridTemplateColumns: `minmax(0, ${effective.videoRatio}fr) ${LAYOUT_SPLITTER_SIZE}px minmax(0, ${1 - effective.videoRatio}fr)`,
      }}>
        <div className="annotation-video-pane" id="annotation-video-pane">
          {video(<button type="button" title="重置布局" aria-label="重置布局" onClick={() => {
            finishDrag(true)
            updateLayout({ ...DEFAULT_ANNOTATION_LAYOUT })
            saveAnnotationLayout(DEFAULT_ANNOTATION_LAYOUT)
          }}><RotateCcw size={18} /></button>)}
        </div>
        <div className="annotation-splitter column" role="separator" tabIndex={0} aria-label="调整视频与片段列表宽度" aria-orientation="vertical" aria-controls="annotation-video-pane"
          aria-valuemin={Math.round(limits.videoMin * 100)} aria-valuemax={Math.round(limits.videoMax * 100)} aria-valuenow={Math.round(effective.videoRatio * 100)} title="左右拖拽调整宽度" {...pointerHandlers} onPointerDown={(event) => startDrag(event, 'horizontal')} onKeyDown={(event) => resizeWithKeyboard(event, 'horizontal')} />
        {inspector}
      </section>
      <div className="annotation-splitter row" role="separator" tabIndex={0} aria-label="调整工作区与时间轴高度" aria-orientation="horizontal" aria-controls="annotation-timeline-pane"
        aria-valuemin={Math.round(limits.workspaceMin * 100)} aria-valuemax={Math.round(limits.workspaceMax * 100)} aria-valuenow={Math.round(effective.workspaceRatio * 100)} title="上下拖拽调整高度" {...pointerHandlers} onPointerDown={(event) => startDrag(event, 'vertical')} onKeyDown={(event) => resizeWithKeyboard(event, 'vertical')} />
      <button type="button" className="annotation-resize-corner" title="拖拽调整视频宽度和工作区高度" aria-label="调整视频宽度和工作区高度" style={{
        left: `calc((100% - ${LAYOUT_SPLITTER_SIZE}px) * ${effective.videoRatio})`,
        top: `calc((100% - ${LAYOUT_SPLITTER_SIZE}px) * ${effective.workspaceRatio})`,
      }} {...pointerHandlers} onPointerDown={(event) => startDrag(event, 'both')} onKeyDown={(event) => resizeWithKeyboard(event, 'both')}><MoveDiagonal2 size={10} /></button>
      <div className="annotation-timeline-pane" id="annotation-timeline-pane">{timeline}</div>
    </div>
}
