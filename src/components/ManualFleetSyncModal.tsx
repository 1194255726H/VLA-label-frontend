import { ChevronDown, CircleAlert, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { fleetApi } from '../services/managementApi'
import { annotationDataApi } from '../services/annotationDataApi'
import type { FleetManualPage, FleetManualQuery, FleetManualVideo } from '../types/api'
import { formatDateTime } from '../utils/date'
import { fleetSyncStatusLabels, fleetVideoSelectable } from '../utils/fleetSync'
import { Modal } from './Modal'
import { PaginationJump } from './PaginationJump'
import { useRangeSelection } from '../hooks/useRangeSelection'

type Props = { projectId: string; projectName: string; supplierName?: string; onClose: () => void; onSynced: (message: string) => void | Promise<void> }

export function ManualFleetSyncModal({ projectId, projectName, supplierName, onClose, onSynced }: Props) {
  const [keywordInput, setKeywordInput] = useState('')
  const [personInput, setPersonInput] = useState('')
  const [personName, setPersonName] = useState('')
  const [scene1Id, setScene1Id] = useState('')
  const [scene2Id, setScene2Id] = useState('')
  const [advanced, setAdvanced] = useState(false)
  const [sceneRefresh, setSceneRefresh] = useState(0)
  const [scenes, setScenes] = useState<{ key: string; items: Awaited<ReturnType<typeof annotationDataApi.sceneFilters>>; error: string }>({ key: '', items: [], error: '' })
  const sceneKey = `${projectId}:${sceneRefresh}`
  const sceneLoading = scenes.key !== sceneKey
  const sceneOptions = sceneLoading ? [] : scenes.items
  const sceneChildren = sceneOptions.find((scene) => scene.id === scene1Id)?.children || []
  const [keyword, setKeyword] = useState('')
  const [syncStatus, setSyncStatus] = useState<FleetManualQuery['syncStatus']>('unsynced')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [refresh, setRefresh] = useState(0)
  const [selected, setSelected] = useState<Map<number, FleetManualVideo>>(new Map())
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState('')
  const [result, setResult] = useState<{ key: string; data?: FleetManualPage; error: string }>({ key: '', error: '' })
  const requestKey = JSON.stringify([projectId, keyword, personName, syncStatus, scene1Id, scene2Id, page, pageSize, refresh])
  const loading = result.key !== requestKey
  const data = !loading ? result.data : undefined
  const items = data?.items || []
  const error = !loading ? result.error : ''
  const selectable = items.filter(fleetVideoSelectable)
  const rowSelection = useRangeSelection(selectable.map((item) => item.fleetVideoId), requestKey)
  const allSelected = selectable.length > 0 && selectable.every((item) => selected.has(item.fleetVideoId))
  const someSelected = selectable.some((item) => selected.has(item.fleetVideoId))

  useEffect(() => {
    let active = true
    fleetApi.unsyncedVideos(projectId, { keyword, personName, syncStatus, scene1Id, scene2Id, page, pageSize }).then((data) => {
      if (!active) return
      setResult({ key: requestKey, data, error: '' })
      setSelected((current) => {
        const next = new Map(current)
        data.items.forEach((item) => { if (!fleetVideoSelectable(item)) next.delete(item.fleetVideoId); else if (next.has(item.fleetVideoId)) next.set(item.fleetVideoId, item) })
        return next
      })
    }).catch((reason) => { if (active) setResult({ key: requestKey, error: reason instanceof Error ? reason.message : '手动同步数据加载失败' }) })
    return () => { active = false }
  }, [keyword, page, pageSize, personName, projectId, requestKey, scene1Id, scene2Id, syncStatus])

  useEffect(() => {
    if (!advanced || scenes.key === sceneKey) return
    let active = true
    annotationDataApi.sceneFilters(projectId).then((items) => { if (active) setScenes({ key: sceneKey, items, error: '' }) })
      .catch((reason) => { if (active) setScenes({ key: sceneKey, items: [], error: reason instanceof Error ? reason.message : '场景加载失败' }) })
    return () => { active = false }
  }, [advanced, projectId, sceneKey, scenes.key])

  function resetSelection() { rowSelection.reset(); setPage(1); setSelected(new Map()); setSyncError('') }
  function search() { resetSelection(); setKeyword(keywordInput.trim()); setPersonName(personInput.trim()) }
  function reset() { resetSelection(); setKeywordInput(''); setPersonInput(''); setKeyword(''); setPersonName(''); setScene1Id(''); setScene2Id(''); setSyncStatus('unsynced') }
  function toggle(video: FleetManualVideo, checked: boolean, shiftKey: boolean) {
    if (syncing || loading || !fleetVideoSelectable(video)) return
    const ids = new Set(rowSelection.range(video.fleetVideoId, shiftKey))
    setSelected((current) => { const next = new Map(current); selectable.filter((item) => ids.has(item.fleetVideoId)).forEach((item) => { if (checked) next.set(item.fleetVideoId, item); else next.delete(item.fleetVideoId) }); return next })
  }
  function togglePage(checked: boolean) {
    if (syncing || loading) return
    setSelected((current) => { const next = new Map(current); selectable.forEach((item) => { if (checked) next.set(item.fleetVideoId, item); else next.delete(item.fleetVideoId) }); return next })
  }
  function close() { if (!syncing) onClose() }
  async function sync() {
    if (syncing || loading || !selected.size) return
    const videoIds = [...selected.values()].filter(fleetVideoSelectable).map((item) => item.fleetVideoId)
    if (!videoIds.length) return
    setSyncing(true); setSyncError('')
    try {
      const result = await fleetApi.sync(projectId, { videoIds })
      setSelected(new Map())
      await onSynced(`手动同步完成：新增 ${result.createdCount}，更新 ${result.updatedCount}，跳过 ${result.skippedCount}`)
    } catch (reason) { setSyncError(reason instanceof Error ? reason.message : '手动同步失败，请重试'); setRefresh((current) => current + 1) }
    finally { setSyncing(false) }
  }

  return <div onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Escape') { event.preventDefault(); close() } }}>
    <Modal title="手动同步数据" onClose={close} footer={<><button className="secondary-button" type="button" disabled={syncing || loading} onClick={() => setRefresh((current) => current + 1)}><RefreshCw size={14} />刷新列表</button><button className="secondary-button" type="button" disabled={syncing} onClick={close}>取消</button><button className="primary-button" type="button" disabled={syncing || loading || !selected.size} onClick={() => void sync()}>{syncing ? '正在同步...' : `手动同步（${selected.size} 条）`}</button></>}>
      <div className="manual-sync-dialog">
        <p className="manual-sync-intro">用于补充自动同步遗漏或失败的数据。{projectName}{supplierName ? ` · ${supplierName}` : ''}</p>
        <form className="manual-sync-filters" onSubmit={(event) => { event.preventDefault(); search() }}>
          <fieldset disabled={syncing}><div className="manual-sync-filter-row">
            <label><span>数据名称</span><input aria-label="同步数据名称" value={keywordInput} placeholder="请输入数据名称" onChange={(event) => setKeywordInput(event.target.value)} /></label>
            <label><span>同步状态</span><select aria-label="同步状态" value={syncStatus} onChange={(event) => { resetSelection(); setSyncStatus(event.target.value as FleetManualQuery['syncStatus']) }}><option value="">全部状态</option>{(['unsynced', 'syncing', 'synced', 'failed'] as const).map((status) => <option key={status} value={status}>{fleetSyncStatusLabels[status]}</option>)}</select></label>
            <button className="manual-sync-advanced" type="button" aria-expanded={advanced} onClick={() => setAdvanced((value) => !value)}>高级筛选<ChevronDown size={14} /></button>
          </div>
          {advanced && <div className="manual-sync-filter-row">
            <label><span>采集人</span><input aria-label="同步数据采集人" value={personInput} placeholder="请输入采集人" onChange={(event) => setPersonInput(event.target.value)} /></label>
            <label><span>场景</span><select aria-label="同步一级场景" value={scene1Id} disabled={sceneLoading} onChange={(event) => { resetSelection(); setScene1Id(event.target.value); setScene2Id('') }}><option value="">{sceneLoading ? '正在加载场景...' : '全部一级场景'}</option>{sceneOptions.map((scene) => <option key={scene.id} value={scene.id}>{scene.name}</option>)}</select></label>
            <label><span>二级场景</span><select aria-label="同步二级场景" value={scene2Id} disabled={!scene1Id || !sceneChildren.length} onChange={(event) => { resetSelection(); setScene2Id(event.target.value) }}><option value="">全部二级场景</option>{sceneChildren.map((scene) => <option key={scene.id} value={scene.id}>{scene.name}</option>)}</select></label>
          </div>}
          <div className="manual-sync-query-actions"><button className="primary-button compact" type="submit">查询</button><button className="secondary-button compact" type="button" onClick={reset}>重置</button></div></fieldset>
        </form>
        {advanced && !sceneLoading && scenes.error && <div className="manual-sync-error" role="alert">场景筛选加载失败：{scenes.error}<button type="button" disabled={syncing} onClick={() => setSceneRefresh((value) => value + 1)}>重新加载场景</button></div>}
        {(error || syncError) && <div className="manual-sync-error" role="alert"><CircleAlert size={15} />{syncError || error}{error && <button type="button" onClick={() => setRefresh((value) => value + 1)}>重试</button>}</div>}
        <div className="manual-sync-table-wrap"><table className="management-table manual-sync-table"><thead><tr><th><input type="checkbox" aria-label="全选当前页可同步数据" checked={allSelected} ref={(element) => { if (element) element.indeterminate = someSelected && !allSelected }} disabled={syncing || loading || !selectable.length} onChange={(event) => togglePage(event.target.checked)} /></th><th className="video-name-column">数据名称</th><th>场景</th><th>采集人</th><th>采集时间</th><th>同步状态</th><th>失败原因</th></tr></thead><tbody>
          {loading ? <tr><td colSpan={7}><div className="management-empty">正在加载同步数据...</div></td></tr> : items.map((video) => {
            const selectable = fleetVideoSelectable(video)
            const scene = [video.scene1Name, video.scene2Name].filter(Boolean).join(' / ') || '-'
            return <tr className={!selectable ? 'unselectable' : selected.has(video.fleetVideoId) ? 'selected-row' : ''} key={video.fleetVideoId}><td><input type="checkbox" aria-label={`选择同步数据 ${video.filename}`} checked={selected.has(video.fleetVideoId)} disabled={syncing || !selectable} onChange={(event) => toggle(video, event.target.checked, (event.nativeEvent as MouseEvent).shiftKey)} /></td><td className="video-name-column"><strong title={video.filename}>{video.filename || '-'}</strong></td><td title={scene}>{scene}</td><td title={video.personName}>{video.personName || '-'}</td><td>{video.collectedAt ? formatDateTime(video.collectedAt) : '-'}</td><td><span className={`manual-sync-status ${video.syncStatus}`}>{fleetSyncStatusLabels[video.syncStatus]}</span></td><td title={video.failureReason}>{video.failureReason || '-'}</td></tr>
          })}
          {!loading && !items.length && <tr><td colSpan={7}><div className="management-empty">{error ? '同步数据加载失败，请重试' : '暂无符合条件的数据'}</div></td></tr>}
        </tbody></table></div>
        <div className="manual-sync-pagination"><span>共 {data?.total ?? result.data?.total ?? 0} 条 · 已选 {selected.size} 条{selected.size > 0 && <button type="button" disabled={syncing} onClick={() => setSelected(new Map())}>清空选择</button>}</span><PaginationJump page={page} pages={loading ? Math.max(page, result.data?.pages || 1) : data?.pages || 1} disabled={syncing || loading} onChange={setPage} pageSize={pageSize} onPageSizeChange={(size) => { setPage(1); setPageSize(size) }} /></div>
      </div>
    </Modal>
  </div>
}
