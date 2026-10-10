import { useState } from 'react'
import type { AnnotationSegment } from '../types/api'
import { selectedDescriptionChoice } from '../utils/segmentDescription'
import { Modal } from './Modal'

export function SegmentDescriptionModal({ segment, onSave, onClose }: { segment: AnnotationSegment; onSave: (changes: Partial<AnnotationSegment>) => void; onClose: () => void }) {
  const [zh, setZh] = useState(() => Array.from({ length: 4 }, (_, i) => segment.descriptionCandidatesZh?.[i] || ''))
  const [en, setEn] = useState(() => Array.from({ length: 4 }, (_, i) => segment.descriptionCandidatesEn?.[i] || ''))
  const [choiceZh, setChoiceZh] = useState(() => selectedDescriptionChoice(zh, segment.descriptionZh, segment.descriptionChoiceZh))
  const [choiceEn, setChoiceEn] = useState(() => selectedDescriptionChoice(en, segment.descriptionEn || '', segment.descriptionChoiceEn))
  const [editing, setEditing] = useState<string>()
  function save() {
    onSave({ descriptionCandidatesZh: zh, descriptionCandidatesEn: en, descriptionChoiceZh: choiceZh, descriptionChoiceEn: choiceEn, descriptionZh: zh[choiceZh], descriptionEn: en[choiceEn] })
  }
  return <div onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Escape') { event.preventDefault(); onClose() } }}>
    <Modal title="片段描述" onClose={onClose} footer={<><button className="secondary-button" type="button" onClick={onClose}>取消</button><button className="primary-button" type="button" disabled={choiceZh < 0 || choiceEn < 0 || !zh[choiceZh]?.trim() || !en[choiceEn]?.trim()} onClick={save}>保存</button></>}>
      <div className="description-candidate-columns">{(['zh', 'en'] as const).map((language) => {
        const texts = language === 'zh' ? zh : en
        const choice = language === 'zh' ? choiceZh : choiceEn
        const select = language === 'zh' ? setChoiceZh : setChoiceEn
        const update = language === 'zh' ? setZh : setEn
        return <section key={language}><h3>{language === 'zh' ? '中文描述' : '英文描述'}</h3>{texts.map((text, index) => {
          const key = `${language}-${index}`
          return <article className={choice === index ? 'selected' : ''} key={key}>
            <label><input autoFocus={language === 'zh' && index === 0} type="radio" name={`description-${language}`} checked={choice === index} onChange={() => select(index)} />选项 {index + 1}</label>
            {editing === key ? <textarea autoFocus aria-label={`${language === 'zh' ? '中文' : '英文'}候选描述 ${index + 1}`} value={text} onChange={(event) => update((current) => current.map((value, i) => i === index ? event.target.value : value))} onBlur={() => setEditing(undefined)} /> : <button type="button" className="candidate-text" onClick={() => { select(index); setEditing(key) }}>{text || '暂无描述，点击编辑'}</button>}
          </article>
        })}</section>
      })}</div>
    </Modal>
  </div>
}
