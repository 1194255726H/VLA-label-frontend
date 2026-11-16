import { runtimeConfig } from '../config/runtime'
import type { AnnotationGuideline } from '../types/api'

export function resolveAnnotationFileUrl(url: string) {
  const backendPath = url.startsWith('/') && !url.startsWith('//')
  const fileUrl = new URL(backendPath ? `${runtimeConfig.apiBaseUrl}${url}` : url, window.location.href)
  if (!['https:', 'http:'].includes(fileUrl.protocol)) throw new Error('标注规则文件地址无效')
  return fileUrl
}

export async function downloadAnnotationGuideline(guideline: AnnotationGuideline) {
  const apiOrigin = new URL(runtimeConfig.apiBaseUrl || window.location.origin, window.location.href).origin
  const fileUrl = resolveAnnotationFileUrl(guideline.url)
  const response = await fetch(fileUrl.href, { credentials: fileUrl.origin === apiOrigin ? 'include' : 'omit' })
  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as { message?: string }
    throw new Error(data.message || `标注规则下载失败（${response.status}）`)
  }
  const disposition = response.headers.get('Content-Disposition') || ''
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  let filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || guideline.displayName || '标注规则'
  if (encoded) { try { filename = decodeURIComponent(encoded) } catch { /* Use the available plain filename. */ } }
  const objectUrl = URL.createObjectURL(await response.blob())
  const anchor = document.createElement('a')
  try {
    anchor.href = objectUrl; anchor.download = filename
    document.body.appendChild(anchor); anchor.click()
  } finally { anchor.remove(); URL.revokeObjectURL(objectUrl) }
}
