import { annotationDataApi } from './annotationDataApi'
import type { ProjectVideoQuery, VideoListItem } from '../types/api'

// Used only for filters not provided by the server. Fetch every candidate page before filtering/paging.
export async function collectProjectVideos(projectId: string, query: ProjectVideoQuery, signal: AbortSignal, onProgress: (loaded: number, total: number) => void) {
  const items = new Map<string, VideoListItem>()
  let page = 1
  let pages: number
  do {
    signal.throwIfAborted()
    const result = await annotationDataApi.list(projectId, { ...query, page, pageSize: 100 })
    signal.throwIfAborted()
    result.items.forEach((item) => items.set(item.id, item))
    onProgress(items.size, result.total)
    pages = result.pages
    if (pages > 10000) throw new Error('数据量超出接口可查询范围，请先缩小筛选条件')
    if (result.page < page) break
    page += 1
  } while (page <= pages)
  return [...items.values()]
}
