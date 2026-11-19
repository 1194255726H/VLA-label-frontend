import { useEffect, useRef, useState } from 'react'
import { copyPermissions } from '../utils/videoCopy'
import { Modal } from './Modal'
import { SearchableSelect } from './SearchableSelect'
import { productApi } from '../services/productApi'
import { projectApi } from '../services/managementApi'
import { copyVideos, type VideoCopyItem } from '../services/videoCopyApi'
import type { ManagedProject, Product, SessionResponse } from '../types/api'

function unavailable(status: string, kind: string) {
  return ['not_started', 'not-started', 'running'].includes(status) ? '' : `${kind}${status === 'paused' ? '已暂停' : status === 'archived' ? '已归档' : status === 'finished' ? '已结束' : '状态不可接收数据'}`
}

export function VideoCopyModal({ ids, currentProductId, session, onClose, onCopied }: {
  ids: string[]; currentProductId?: string; session: SessionResponse; onClose: () => void; onCopied: (successfulIds: string[]) => void
}) {
  const [products, setProducts] = useState<Product[]>([])
  const [productId, setProductId] = useState('')
  const [datasets, setDatasets] = useState<{ productId: string; items: ManagedProject[] }>({ productId: '', items: [] })
  const [datasetId, setDatasetId] = useState('')
  const [loading, setLoading] = useState(true)
  const [datasetError, setDatasetError] = useState('')
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [datasetReload, setDatasetReload] = useState(0)
  const [copyAnnotation, setCopyAnnotation] = useState(false)
  const [runPreAnnotation, setRunPreAnnotation] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [results, setResults] = useState<VideoCopyItem[]>([])
  const [started, setStarted] = useState(false)
  const permissions = copyPermissions(session)
  const validProduct = products.find((item) => item.id === productId && !unavailable(item.status, '项目'))
  const validDataset = datasets.productId === productId && datasets.items.find((item) => item.id === datasetId && !unavailable(item.status, '数据集'))
  const canSubmit = Boolean(permissions.allowed && validProduct && validDataset && !busy && !loading && !datasetError)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const all: Product[] = []
        let page = 1, pages = 1
        do { const result = await productApi.list({ page, pageSize: 100, ...(!permissions.admin ? { ownerId: session.account.id } : {}) }); all.push(...result.items); pages = result.pages; page += 1 } while (page <= pages)
        if (!active) return
        setProducts(all)
        setProductId(all.some((item) => item.id === currentProductId && !unavailable(item.status, '项目')) ? currentProductId! : '')
        setError('')
      } catch (failure) { if (active) setError(failure instanceof Error ? failure.message : '目标项目加载失败') }
      finally { if (active) setLoading(false) }
    }
    void load()
    return () => { active = false }
  }, [currentProductId, permissions.admin, session.account.id, reload])

  useEffect(() => {
    if (!productId) return
    let active = true
    projectApi.list(productId).then((items) => { if (active) { setDatasets({ productId, items }); setDatasetError('') } })
      .catch((failure) => { if (active) setDatasetError(failure instanceof Error ? failure.message : '目标数据集加载失败') })
    return () => { active = false }
  }, [productId, datasetReload])

  async function execute(sourceIds: string[]) {
    if (!canSubmit || busyRef.current || !sourceIds.length) return
    busyRef.current = true; setBusy(true); setStarted(true); setError(''); setProgress({ done: 0, total: sourceIds.length })
    const collected: VideoCopyItem[] = []
    const requested = new Set(sourceIds)
    setResults((old) => old.filter((item) => !requested.has(String(item.source_video_id))))
    try {
      for (let offset = 0; offset < sourceIds.length; offset += 200) {
        const batch = sourceIds.slice(offset, offset + 200)
        const response = await copyVideos(datasetId, batch, { copyAnnotation, runPreAnnotation, reason })
        // Trust only explicit per-item outcomes; never retry successful or unconfirmed requests automatically.
        collected.push(...response.items)
        setResults((old) => [...old, ...response.items]); setProgress({ done: Math.min(offset + batch.length, sourceIds.length), total: sourceIds.length })
      }
    } catch (failure) {
      const status = (failure as { status?: number })?.status
      const rejected = status !== undefined && status >= 400 && status < 500
      setError(`${failure instanceof Error ? failure.message : '复制请求失败'}。${rejected ? '本批请求未执行，已停止后续批次；修改条件后可关闭弹窗重新发起。' : '已停止后续批次；本次请求的复制结果可能尚未确认，请检查目标数据集，避免重复复制。'}`)
    } finally {
      busyRef.current = false; setBusy(false)
      onCopied(collected.filter((item) => item.success).map((item) => String(item.source_video_id)))
    }
  }
  const failed = results.filter((item) => !item.success)
  const successCount = results.filter((item) => item.success).length
  return <Modal title="复制数据" onClose={() => { if (!busyRef.current) onClose() }} footer={<>
    <button className="secondary-button" type="button" disabled={busy} onClick={onClose}>{started ? '关闭' : '取消'}</button>
    {started ? failed.length > 0 && <button className="primary-button" type="button" disabled={!canSubmit} onClick={() => void execute(failed.map((item) => String(item.source_video_id)))}>重试失败项（{failed.length}）</button> : <button className="primary-button" type="button" disabled={!canSubmit} onClick={() => void execute(ids)}>确认复制</button>}
  </>}><div className="video-copy-dialog">
    <p>已选择 <strong>{ids.length}</strong> 条数据</p>
    <fieldset className="project-form-fields modal-form-grid" disabled={busy || started}>
      <div className="project-field wide"><span>目标项目 <i className="required-mark">*</i></span><SearchableSelect label="目标项目" required value={productId} loading={loading} disabled={busy || started} options={products.map((item) => ({ id: item.id, name: item.name, disabled: Boolean(unavailable(item.status, '项目')), disabledReason: unavailable(item.status, '项目') }))} onChange={(id) => { setProductId(id); setDatasetId(''); setDatasetError('') }} /></div>
      <div className="project-field wide"><span>目标数据集 <i className="required-mark">*</i></span><SearchableSelect key={productId} label="目标数据集" required value={datasetId} disabled={!validProduct || busy || started} loading={Boolean(productId && !datasetError && datasets.productId !== productId)} options={(datasets.productId === productId ? datasets.items : []).map((item) => ({ id: item.id, name: item.name, disabled: Boolean(unavailable(item.status, '数据集')), disabledReason: unavailable(item.status, '数据集') }))} onChange={setDatasetId} /></div>
      <div className="project-field wide"><span>复制范围 <i className="required-mark">*</i></span><label><input type="radio" name="copy-range" checked={!copyAnnotation} onChange={() => setCopyAnnotation(false)} />仅复制原始数据</label><label><input type="radio" name="copy-range" checked={copyAnnotation} onChange={() => { setCopyAnnotation(true); setRunPreAnnotation(false) }} />复制原始数据及标注结果</label><small>标注结果取最新已提交版本，在目标数据集中保存为草稿；没有已提交版本时仅复制原始数据。</small></div>
      {!copyAnnotation && <label className="wide video-copy-pre-annotation"><input type="checkbox" checked={runPreAnnotation} onChange={(event) => setRunPreAnnotation(event.target.checked)} />对复制的数据执行 AI 预处理</label>}
      <label className="wide project-field"><span>复制原因（选填）</span><textarea maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="最多 500 字" /></label>
    </fieldset>
    {datasetError && <p className="inline-error">{datasetError}<button type="button" disabled={busy} onClick={() => { setDatasetError(''); setDatasetReload((value) => value + 1) }}>重新加载数据集</button></p>}
    {error && <p className="inline-error" role="alert">{error}{!started && <button type="button" onClick={() => { setLoading(true); setReload((value) => value + 1) }}>重新加载项目</button>}</p>}
    {busy && <div role="status" aria-live="polite"><p>正在复制，已处理 {progress.done} / {progress.total} 条，请勿关闭页面</p><progress max={progress.total || 1} value={progress.done} /></div>}
    {started && <section className="video-copy-results" aria-live="polite"><p>已成功 {successCount} 条，失败 {failed.length} 条</p><ul>{results.map((item) => <li className={item.success ? 'copy-success' : 'inline-error'} key={item.source_video_id}>数据 #{item.source_video_id}：{item.success ? `复制成功（新数据 #${item.video_id}）${copyAnnotation && !item.annotation_copied ? '；没有已提交标注，已仅复制原始数据' : ''}` : item.message || (item.code === 'copy_conflict' ? '复制冲突，请稍后重试' : '复制失败')}</li>)}</ul></section>}
  </div></Modal>
}
