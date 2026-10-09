import { useRef, useState } from 'react'
import { Modal } from './Modal'
import { annotationApi } from '../services/annotationApi'
import type { AnnotationWorkspace } from '../types/api'

export type VideoScenes = Pick<AnnotationWorkspace, 'scene1' | 'scene2' | 'supplier'>
type SceneWorkspace = VideoScenes & Pick<AnnotationWorkspace, 'projectId' | 'videoId'>
type Option = { id: number; name: string }

export function VideoSceneEditor({ workspace, canEdit, onUpdated, variant = 'video' }: {
  workspace: SceneWorkspace; canEdit: boolean; onUpdated: (scenes: VideoScenes) => void; variant?: 'video' | 'table'
}) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'edit' | 'create'>('edit')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [options, setOptions] = useState<Option[]>([])
  const [selected, setSelected] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [createdName, setCreatedName] = useState('')
  const [suppliers, setSuppliers] = useState<Option[]>([])
  const [suppliersLoading, setSuppliersLoading] = useState(false)
  const [createError, setCreateError] = useState('')
  const [form, setForm] = useState({ name: '', supplierId: '', description: '' })
  const optionsRequestRef = useRef(0)
  const suppliersRequestRef = useRef(0)
  const sceneText = workspace.scene1 || workspace.scene2
    ? `${workspace.scene1?.name || '未指定'} / ${workspace.scene2?.name || '未指定'}` : '-'
  const fleetId = workspace.scene2?.code || workspace.scene2?.fleetSceneId || workspace.scene1?.code || workspace.scene1?.fleetSceneId
  const selectionValid = options.some((item) => String(item.id) === selected)

  function close() {
    if (saving) return
    optionsRequestRef.current += 1
    suppliersRequestRef.current += 1
    setOpen(false)
  }

  async function loadOptions(selectName = '') {
    if (!workspace.scene1) { setError('该视频未关联一级场景，暂不能设置二级场景。'); return }
    const requestId = ++optionsRequestRef.current
    setLoading(true)
    setError('')
    try {
      const items = await annotationApi.sceneOptions(workspace.projectId, workspace.scene1.id)
      if (requestId !== optionsRequestRef.current) return
      setOptions(items)
      if (selectName) {
        const created = items.find((item) => item.name === selectName)
        setSelected(created ? String(created.id) : '')
        if (created) setCreatedName('')
        else setError('场景已新增，候选列表暂未包含新场景，请重新加载候选。')
      }
    } catch (failure) {
      if (requestId === optionsRequestRef.current) setError(`${selectName ? '场景已新增，但候选列表加载失败：' : ''}${failure instanceof Error ? failure.message : '场景加载失败，请重试'}`)
    } finally { if (requestId === optionsRequestRef.current) setLoading(false) }
  }

  function openEditor() {
    if (!canEdit) return
    setOpen(true)
    setMode('edit')
    setNotice('')
    setCreatedName('')
    setOptions([])
    setSelected(workspace.scene2?.id || '')
    setLoading(false)
    void loadOptions()
  }

  async function loadSuppliers() {
    const requestId = ++suppliersRequestRef.current
    setSuppliersLoading(true)
    setCreateError('')
    try {
      const items = await annotationApi.sceneSuppliers(workspace.projectId)
      if (requestId !== suppliersRequestRef.current) return
      setSuppliers(items)
      const currentId = workspace.supplier?.fleetSupplierId || workspace.supplier?.id || ''
      setForm((current) => ({ ...current, supplierId: items.some((item) => String(item.id) === current.supplierId) ? current.supplierId : items.some((item) => String(item.id) === currentId) ? currentId : '' }))
    } catch (failure) {
      if (requestId === suppliersRequestRef.current) setCreateError(failure instanceof Error ? failure.message : '供应商加载失败，请重试')
    } finally { if (requestId === suppliersRequestRef.current) setSuppliersLoading(false) }
  }

  function openCreate() {
    setMode('create')
    setForm({ name: '', supplierId: '', description: '' })
    setSuppliers([])
    void loadSuppliers()
  }

  async function create() {
    if (saving || suppliersLoading || !canEdit || !workspace.scene1 || !form.name.trim() || !suppliers.some((item) => String(item.id) === form.supplierId)) return
    const name = form.name.trim()
    if (options.some((item) => item.name === name)) { setCreateError('同一级场景下已存在该名称，请使用其他名称。'); return }
    setSaving(true)
    setCreateError('')
    try {
      await annotationApi.createScene2({ scene1Id: workspace.scene1.id, ...form, name })
      setCreatedName(name)
      setMode('edit')
      setSelected('')
      setNotice(`“${name}”已新增，点击保存应用到当前视频。`)
      await loadOptions(name)
    } catch (failure) { setCreateError(failure instanceof Error ? failure.message : '新增失败，请重试') }
    finally { setSaving(false) }
  }

  async function save() {
    if (saving || loading || !canEdit || !workspace.scene1 || !selectionValid) return
    setSaving(true)
    setError('')
    try {
      const scenes = await annotationApi.updateScene2(workspace.projectId, workspace.videoId, Number(selected))
      onUpdated(scenes)
      setOpen(false)
    } catch (failure) { setError(failure instanceof Error ? failure.message : '修改失败，请重试') }
    finally { setSaving(false) }
  }

  return <>
    {variant === 'table' ? <button type="button" className="workbench-scene-info" disabled={!canEdit} onClick={openEditor} title={`修改场景：${sceneText}`}>
      <strong>{sceneText}</strong>{fleetId && <small title={`FleetID: ${fleetId}`}>FleetID: {fleetId}</small>}
    </button> : <div className="video-scene-summary">
      <span title={workspace.scene1?.name}><small>一级场景</small><b>{workspace.scene1?.name || '未指定'}</b></span>
      <span><small>二级场景</small><button type="button" disabled={!canEdit || !workspace.scene1} onClick={openEditor} title={!workspace.scene1 ? '该视频未关联一级场景，暂不能设置二级场景' : !canEdit ? '仅当前处理人、项目经理或管理员可修改' : '修改二级场景'}>{workspace.scene2?.name || '未指定'}{canEdit && workspace.scene1 ? ' ▾' : ''}</button></span>
    </div>}
    {open && <div onKeyDown={(event) => {
      event.stopPropagation()
      if (event.key === 'Escape' && !saving) { if (mode === 'create') setMode('edit'); else close() }
    }}><Modal title={mode === 'create' ? '新增二级场景' : '修改场景'} onClose={close} footer={mode === 'create' ? <>
      <button className="secondary-button" type="button" disabled={saving} onClick={() => setMode('edit')}>返回</button>
      <button className="primary-button" type="button" disabled={saving || suppliersLoading || !form.name.trim() || !suppliers.some((item) => String(item.id) === form.supplierId)} onClick={() => void create()}>{saving ? '正在新增...' : '新增并选择'}</button>
    </> : <>
      <button className="secondary-button" type="button" disabled={saving} onClick={close}>取消</button>
      <button className="primary-button" type="button" disabled={loading || saving || !selectionValid} onClick={() => void save()}>{saving ? '正在保存...' : '保存'}</button>
    </>}>
      <div className="video-scene-form">
        {mode === 'edit' && <p className="scene-original">原场景：<strong>{sceneText}</strong></p>}
        <div className="scene-parent"><span>一级场景</span><strong>{workspace.scene1?.name || '未指定'}</strong></div>
        {mode === 'edit' ? <>
          <label><span className="scene-field-heading"><span>二级场景 <i className="required-mark">*</i></span><button type="button" hidden disabled={loading || saving || !workspace.scene1} onClick={openCreate}>新增</button></span>
            <select autoFocus aria-label="二级场景" value={selected} disabled={loading || saving || !workspace.scene1} onChange={(event) => setSelected(event.target.value)}><option value="">请选择二级场景</option>{options.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          </label>
          <small>{loading ? '正在加载场景...' : options.length ? '只能选择当前一级场景下的二级场景。' : '当前一级场景下暂无可选的二级场景。'}</small>
          {notice && <p className="scene-notice" role="status">{notice}</p>}
          {error && <div role="alert">{error}{workspace.scene1 && <button type="button" disabled={loading || saving} onClick={() => void loadOptions(createdName)}>重新加载候选</button>}</div>}
        </> : <>
          <label><span>二级场景名称 <i className="required-mark">*</i></span><input autoFocus value={form.name} disabled={saving} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="请输入二级场景名称" /></label>
          <label><span>供应商 <i className="required-mark">*</i></span><select aria-label="供应商" value={form.supplierId} disabled={saving || suppliersLoading} onChange={(event) => setForm({ ...form, supplierId: event.target.value })}><option value="">{suppliersLoading ? '正在加载供应商...' : '请选择供应商'}</option>{suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          {!suppliersLoading && !suppliers.length && <small>当前项目暂无可用供应商。</small>}
          <label><span>场景说明（选填）</span><textarea value={form.description} disabled={saving} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="请输入场景说明" /></label>
          {createError && <div role="alert">{createError}{!suppliers.length && <button type="button" disabled={saving || suppliersLoading} onClick={() => void loadSuppliers()}>重新加载供应商</button>}</div>}
        </>}
      </div>
    </Modal></div>}
  </>
}
