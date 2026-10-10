import { ArrowLeft, CircleAlert, Database, Download, Eye, Search } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { PaginationJump } from '../components/PaginationJump'
import { annotationDataApi } from '../services/annotationDataApi'
import { projectApi } from '../services/managementApi'
import type { SessionResponse, VideoListItem } from '../types/api'
import { FleetSyncModal } from './ProjectManagementPage'
import { formatDateTime } from '../utils/date'
import { nodeLabels, nodeToneByLabel } from '../utils/node'
import { summarizeInvalidIntervals } from '../utils/invalidReason'

const videoStatusTabs = [{ value: '', label: '全部' }, { value: 'pending', label: '待处理' }, { value: 'in_progress', label: '处理中' }, { value: 'describing', label: '模型描述中' }, { value: 'cutting', label: '切割中' }, { value: 'completed', label: '已完成' }, { value: 'cancelled', label: '已作废' }, { value: 'abnormal', label: '异常' }]
const videoStatusLabels: Record<string, string> = { pending: '待处理', assigned: '待处理', processing: '处理中', in_progress: '处理中', describing: '模型描述中', cutting: '切割中', completed: '已完成', cancelled: '已作废', abnormal: '异常' }
const workTypeLabels = { normal: '正常流转', returned: '退回返修' }
function clockDuration(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '—'
  const totalSeconds = Math.max(0, Math.round(value))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return hours ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}` : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
function milliseconds(value: number | null) { return value === null ? '—' : clockDuration(value / 1000) }

function VideoInvalidReasons({ video }: { video: VideoListItem }) {
  const { reasons, sampleCount } = summarizeInvalidIntervals(video.invalidIntervalList)
  return <div className="video-invalid-reasons">
    {sampleCount > 0 && <span>样例片段 {sampleCount} 个</span>}
    <span className={sampleCount > 0 ? 'secondary' : undefined} title={reasons || undefined}>{reasons || '-'}</span>
  </div>
}

export function AnnotationDataPage({ session }: { session: SessionResponse }) {
  const { projectId = '' } = useParams()
  const navigate = useNavigate()
  const [items, setItems] = useState<VideoListItem[]>([])
  const [projectName, setProjectName] = useState('项目视频')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filenameInput, setFilenameInput] = useState('')
  const [filename, setFilename] = useState('')
  const [personNameInput, setPersonNameInput] = useState('')
  const [personName, setPersonName] = useState('')
  const [selectedVideos, setSelectedVideos] = useState<{ projectId: string; ids: Set<string> }>({ projectId, ids: new Set() })
  const [exporting, setExporting] = useState(false)
  const [loadedQueryKey, setLoadedQueryKey] = useState('')
  const [videoStatus, setVideoStatus] = useState('')
  const [assigneeInput, setAssigneeInput] = useState('')
  const [currentAssigneeId, setCurrentAssigneeId] = useState('')
  const [createdAtStart, setCreatedAtStart] = useState('')
  const [createdAtEnd, setCreatedAtEnd] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  // 各状态数量随列表请求一起返回（total），不再为每个 tab 单独发一次查询；带上筛选条件指纹，条件变化时旧数字自动失效
  const totalsKey = `${projectId}|${filename}|${personName}|${currentAssigneeId}|${createdAtStart}|${createdAtEnd}`
  const [statusTotals, setStatusTotals] = useState<{ key: string; values: Record<string, number> }>({ key: '', values: {} })
  const videoStatusTotals = statusTotals.key === totalsKey ? statusTotals.values : {}
  const [fleetOpen, setFleetOpen] = useState(false)
  const [toast, setToast] = useState('')
  const queryKey = JSON.stringify([projectId, filename, personName, videoStatus, currentAssigneeId, createdAtStart, createdAtEnd, page, pageSize])
  const tableLoading = loading || loadedQueryKey !== queryKey
  const selectedVideoIds = selectedVideos.projectId === projectId ? selectedVideos.ids : new Set<string>()
  const selectableItems = items.filter((item) => item.id)
  const allPageSelected = !tableLoading && selectableItems.length > 0 && selectableItems.every((item) => selectedVideoIds.has(item.id))
  const somePageSelected = !tableLoading && selectableItems.some((item) => selectedVideoIds.has(item.id))

  const loadVideos = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const result = await annotationDataApi.list(projectId, { filename, personName, status: videoStatus, currentAssigneeId, createdAtStart, createdAtEnd, page, pageSize })
      setItems(result.items); setLoadedQueryKey(queryKey); setTotal(result.total); setPages(Math.max(1, result.pages)); setStatusTotals((current) => ({ key: totalsKey, values: current.key === totalsKey ? { ...current.values, [videoStatus]: result.total } : { [videoStatus]: result.total } }))
    } catch (reason) { setItems([]); setLoadedQueryKey(queryKey); setError(reason instanceof Error ? reason.message : '项目视频加载失败') }
    finally { setLoading(false) }
  }, [createdAtEnd, createdAtStart, currentAssigneeId, filename, page, pageSize, personName, projectId, queryKey, totalsKey, videoStatus])

  useEffect(() => {
    let active = true
    annotationDataApi.list(projectId, { filename, personName, status: videoStatus, currentAssigneeId, createdAtStart, createdAtEnd, page, pageSize }).then((result) => {
      if (!active) return
      setItems(result.items); setLoadedQueryKey(queryKey); setTotal(result.total); setPages(Math.max(1, result.pages)); setStatusTotals((current) => ({ key: totalsKey, values: current.key === totalsKey ? { ...current.values, [videoStatus]: result.total } : { [videoStatus]: result.total } })); setError('')
    }).catch((reason) => { if (active) { setItems([]); setLoadedQueryKey(queryKey); setError(reason instanceof Error ? reason.message : '项目视频加载失败') } }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [createdAtEnd, createdAtStart, currentAssigneeId, filename, page, pageSize, personName, projectId, queryKey, totalsKey, videoStatus])
  useEffect(() => { projectApi.list().then((projects) => setProjectName(projects.find((item) => item.id === projectId)?.name || '项目视频')).catch(() => undefined) }, [projectId])
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 2500); return () => window.clearTimeout(timer) }, [toast])

  async function fleetSynced(message: string) { setFleetOpen(false); setStatusTotals({ key: totalsKey, values: {} }); await loadVideos(); setToast(message) }
  function applySearch() { setPage(1); setFilename(filenameInput.trim()); setPersonName(personNameInput.trim()); setCurrentAssigneeId(assigneeInput.trim()) }
  function resetFilters() { setFilenameInput(''); setFilename(''); setPersonNameInput(''); setPersonName(''); setVideoStatus(''); setAssigneeInput(''); setCurrentAssigneeId(''); setCreatedAtStart(''); setCreatedAtEnd(''); setPage(1) }
  function toggleSelection(ids: string[], checked: boolean) {
    setSelectedVideos((current) => {
      const next = new Set(current.projectId === projectId ? current.ids : [])
      ids.forEach((id) => { if (checked) next.add(id); else next.delete(id) })
      return { projectId, ids: next }
    })
  }
  async function exportSelected() {
    if (!selectedVideoIds.size || exporting) return
    setExporting(true)
    try {
      const { blob, filename } = await annotationDataApi.exportVideos(projectId, [...selectedVideoIds])
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url; anchor.download = filename
      document.body.appendChild(anchor); anchor.click(); anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setToast('CSV 导出成功')
    } catch (reason) { setToast(reason instanceof Error ? reason.message : '视频导出失败') }
    finally { setExporting(false) }
  }
  function preview(video: VideoListItem) {
    const effectiveProjectId = video.projectId || projectId
    if (effectiveProjectId && video.id) navigate(`/projects/${encodeURIComponent(effectiveProjectId)}/videos/${encodeURIComponent(video.id)}/annotation?readonly=1`)
  }

  return <AppShell user={session.account}><section className="management-page"><section className="management-panel panel">
    <header className="management-toolbar annotation-data-heading"><div className="detail-title"><button className="icon-button bordered" type="button" onClick={() => navigate('/projects')} aria-label="返回项目管理"><ArrowLeft size={17} /></button><div><h2>{projectName}</h2><p>项目视频管理 · {projectId}</p></div></div><span>共 {total} 条视频，可按视频状态、采集人、处理人和创建时间排查</span></header>
    <div className="annotation-data-tabs"><div className="status-segments">{videoStatusTabs.map((item) => <button key={item.value || 'all'} type="button" className={videoStatus === item.value ? 'active' : ''} onClick={() => { setVideoStatus(item.value); setPage(1) }}>{item.label}{videoStatusTotals[item.value] == null ? null : <span>{videoStatusTotals[item.value]}</span>}</button>)}</div><div className="project-video-toolbar-actions"><button className="secondary-button" type="button" disabled={!selectedVideoIds.size || exporting} onClick={() => void exportSelected()}><Download size={16} />{exporting ? '正在导出...' : '导出 CSV'}</button><button className="primary-button" type="button" onClick={() => setFleetOpen(true)}><Database size={16} />从 Fleet 同步</button></div></div>
    <div className="management-filters project-video-filters">
      <label><span>视频名称</span><div className="filter-control"><Search size={16} /><input value={filenameInput} onChange={(event) => setFilenameInput(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && applySearch()} placeholder="请输入视频文件名" /></div></label>
      <label><span>采集人</span><div className="filter-control"><input value={personNameInput} onChange={(event) => setPersonNameInput(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && applySearch()} placeholder="请输入采集人姓名" /></div></label>
      <label><span>当前处理人 ID</span><div className="filter-control"><input type="number" min="1" step="1" value={assigneeInput} onChange={(event) => setAssigneeInput(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && applySearch()} placeholder="请输入处理人 ID" /></div></label>
      <label><span>创建时间（开始）</span><div className="filter-control"><input type="date" value={createdAtStart} onChange={(event) => { setCreatedAtStart(event.target.value); setPage(1) }} /></div></label>
      <label><span>创建时间（结束）</span><div className="filter-control"><input type="date" value={createdAtEnd} onChange={(event) => { setCreatedAtEnd(event.target.value); setPage(1) }} /></div></label>
      <button className="primary-button compact" type="button" onClick={applySearch}>查询</button><button className="secondary-button compact" type="button" onClick={resetFilters}>重置</button>
    </div>
    {error && <div className="error-banner"><CircleAlert size={18} /><span>{error}</span><button type="button" onClick={loadVideos}>重新加载</button></div>}
    <div className="management-table-wrap"><table className="management-table annotation-data-table project-video-table"><thead><tr><th className="video-selection-column"><input type="checkbox" aria-label="全选当前页视频" checked={allPageSelected} ref={(element) => { if (element) element.indeterminate = somePageSelected && !allPageSelected }} disabled={tableLoading || exporting || !selectableItems.length} onChange={(event) => toggleSelection(selectableItems.map((item) => item.id), event.target.checked)} /></th><th>视频名称</th><th>一级场景</th><th>二级场景</th><th>供应商</th><th>状态</th><th>作业节点</th><th>流转类型</th><th>视频时长</th><th>有效片段时长</th><th>无效片段时长</th><th className="video-invalid-reasons-column">无效原因</th><th>设备 MAC</th><th>采集人</th><th>单次任务数</th><th>小目标数</th><th>处理人</th><th>创建时间</th><th>更新时间</th><th>操作</th></tr></thead><tbody>
      {tableLoading ? <tr><td colSpan={20}><div className="management-empty">正在加载项目视频...</div></td></tr> : items.map((video) => <tr className={selectedVideoIds.has(video.id) ? 'selected-row' : undefined} key={video.id}>
        <td className="video-selection-column"><input type="checkbox" aria-label={`选择视频 ${video.filename}`} checked={selectedVideoIds.has(video.id)} disabled={!video.id || exporting} onChange={(event) => toggleSelection([video.id], event.target.checked)} /></td>
        <td><div className="entity-name"><strong title={video.filename}>{video.filename}</strong><small>{video.externalVideoId || video.videoId || `视频记录 #${video.id}`}</small></div></td>
        <td title={video.scene1?.name}>{video.scene1?.name || '-'}</td><td title={video.scene2?.name}>{video.scene2?.name || '-'}</td><td title={video.supplier?.name}>{video.supplier?.name || '-'}</td>
        <td><span className={`status-tag ${video.videoStatus}`}>{videoStatusLabels[video.videoStatus] || video.videoStatus || '-'}</span></td>
        <td><span className={`node-tag ${nodeToneByLabel(nodeLabels[video.currentNode])}`}>{nodeLabels[video.currentNode]}</span></td><td><span className={`work-type-tag ${video.workType}`}>{workTypeLabels[video.workType]}</span></td>
        <td>{clockDuration(video.duration)}</td><td>{milliseconds(video.effectiveDurationMs)}</td><td>{milliseconds(video.invalidDurationMs)}</td><td className="video-invalid-reasons-column"><VideoInvalidReasons video={video} /></td><td title={video.deviceId}>{video.deviceId || '-'}</td><td title={video.personName}>{video.personName || '-'}</td><td>{video.atomicTaskCount}</td><td>{video.atomicActionCount}</td><td>{video.currentAssigneeName || video.currentAssigneeId || '未分配'}</td><td>{formatDateTime(video.createdAt)}</td><td>{formatDateTime(video.updatedAt)}</td>
        <td><div className="row-actions"><button type="button" disabled={!video.id} onClick={() => preview(video)}><Eye size={15} />预览</button></div></td>
      </tr>)}
      {!tableLoading && !items.length && <tr><td colSpan={20}><div className="management-empty"><CircleAlert size={32} />暂无符合条件的项目视频</div></td></tr>}
    </tbody></table></div>
    <footer className="management-footer"><span>共 {total} 条{selectedVideoIds.size > 0 && <> · 已选 {selectedVideoIds.size} 条（含其他页）<button className="clear-video-selection" type="button" disabled={exporting} onClick={() => setSelectedVideos({ projectId, ids: new Set() })}>清空选择</button></>}</span><PaginationJump page={page} pages={pages} disabled={tableLoading} onChange={(next) => { setLoading(true); setPage(next) }} pageSize={pageSize} onPageSizeChange={(size) => { setLoading(true); setPageSize(size); setPage(1) }} /></footer>
  </section></section>{fleetOpen && <FleetSyncModal projectId={projectId} projectName={projectName} onClose={() => setFleetOpen(false)} onSynced={fleetSynced} />}{toast && <div className="toast">{toast}</div>}</AppShell>
}
