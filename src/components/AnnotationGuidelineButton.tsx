import { FileText } from 'lucide-react'
import { useState } from 'react'
import type { AnnotationGuideline } from '../types/api'
import { downloadAnnotationGuideline } from '../services/annotationGuidelineApi'

export function AnnotationGuidelineButton({ guideline, onError }: { guideline?: AnnotationGuideline | null; onError: (message: string) => void }) {
  const [downloading, setDownloading] = useState(false)
  if (!guideline?.url) return null
  if (guideline.type === 'link') {
    let href: string | undefined
    try { const url = new URL(guideline.url); if (url.protocol === 'https:' && !url.username && !url.password) href = url.href } catch { /* Invalid stored links show an error when clicked. */ }
    return <a className="secondary-button annotation-guideline-button" href={href} target="_blank" rel="noopener noreferrer" title={guideline.displayName || '标注规则'} onClick={(event) => { if (!href) { event.preventDefault(); onError('标注规则链接必须是有效的 HTTPS 地址') } }}><FileText size={15} />标注规则</a>
  }
  async function download() {
    if (downloading || !guideline) return
    setDownloading(true)
    try { await downloadAnnotationGuideline(guideline) }
    catch (reason) { onError(reason instanceof Error ? reason.message : '标注规则下载失败') }
    finally { setDownloading(false) }
  }
  return <button className="secondary-button annotation-guideline-button" type="button" title={guideline.displayName || '标注规则'} disabled={downloading} onClick={() => void download()}><FileText size={15} />{downloading ? '下载中...' : '标注规则'}</button>
}
