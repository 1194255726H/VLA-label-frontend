import { useState } from 'react'
import type { AnnotationSegment } from '../types/api'
import { editSelectedDescriptions } from '../utils/segmentDescription'

export function SegmentDescriptionFields({ segment, editing, onSave, onCancel }: { segment: AnnotationSegment; editing: boolean; onSave: (changes: Partial<AnnotationSegment>) => void; onCancel: () => void }) {
  const [zh, setZh] = useState(segment.descriptionZh)
  const [en, setEn] = useState(segment.descriptionEn || '')
  if (!editing) return <div className="segment-description-fields"><span>{segment.descriptionZh || '暂无中文描述'}</span><span>{segment.descriptionEn || '暂无英文描述'}</span></div>
  return <div className="segment-description-fields" onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Escape') { event.preventDefault(); onCancel() } }}>
    <label><span>中文描述</span><textarea autoFocus aria-label="中文描述" value={zh} onChange={(event) => setZh(event.target.value)} /></label>
    <label><span>英文描述</span><textarea aria-label="英文描述" value={en} onChange={(event) => setEn(event.target.value)} /></label>
    <div className="segment-description-edit-actions"><button type="button" onClick={onCancel}>取消</button><button type="button" onClick={() => onSave(editSelectedDescriptions(segment, zh, en))}>保存</button></div>
  </div>
}
