import { useState } from 'react'
import { Modal } from './Modal'
import { annotationApi } from '../services/annotationApi'
import type { AnnotationWorkspace } from '../types/api'

type Scenes = Pick<AnnotationWorkspace, 'scene1' | 'scene2' | 'supplier'>

export function VideoSceneEditor({ workspace, canEdit, onUpdated }: { workspace: AnnotationWorkspace; canEdit: boolean; onUpdated: (scenes: Scenes) => void }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [options, setOptions] = useState<Array<{ id: number; name: string }>>([])
  const [selected, setSelected] = useState('')
  const [error, setError] = useState('')

  async function loadOptions() {
    if (!workspace.scene1 || !canEdit) return
    setOpen(true)
    setLoading(true)
    setError('')
    setOptions([])
    setSelected(workspace.scene2?.id || '')
    try { setOptions(await annotationApi.sceneOptions(workspace.projectId, workspace.scene1.id)) }
    catch (failure) { setError(failure instanceof Error ? failure.message : '场景加载失败，请重试') }
    finally { setLoading(false) }
  }

  async function save() {
    if (saving || !canEdit || !workspace.scene1 || !options.some((item) => String(item.id) === selected)) return
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
    <div className="video-scene-summary">
      <span title={workspace.scene1?.name}><small>一级场景</small><b>{workspace.scene1?.name || '未指定'}</b></span>
      <span><small>二级场景</small><button type="button" disabled={!canEdit || !workspace.scene1} onClick={() => void loadOptions()} title={!workspace.scene1 ? '该视频未关联一级场景，暂不能设置二级场景' : !canEdit ? '仅当前处理人、项目经理或管理员可修改' : '修改二级场景'}>{workspace.scene2?.name || '未指定'}{canEdit && workspace.scene1 ? ' ▾' : ''}</button></span>
    </div>
    {open && <div onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Escape' && !saving) setOpen(false) }}><Modal title="修改二级场景" onClose={() => { if (!saving) setOpen(false) }} footer={<><button className="secondary-button" disabled={saving} onClick={() => setOpen(false)}>取消</button><button className="primary-button" disabled={loading || saving || !options.some((item) => String(item.id) === selected)} onClick={() => void save()}>{saving ? '正在保存...' : '保存'}</button></>}>
      <div className="video-scene-form">
        <p>一级场景：<strong>{workspace.scene1?.name || '未指定'}</strong></p>
        <label>二级场景<select autoFocus value={selected} disabled={loading || saving} onChange={(event) => setSelected(event.target.value)}><option value="">请选择二级场景</option>{options.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <small>{loading ? '正在加载场景...' : options.length ? '只能选择当前一级场景下的二级场景。' : '当前一级场景下暂无可选的二级场景。'}</small>
        {error && <div role="alert">{error}<button type="button" disabled={loading || saving} onClick={() => void loadOptions()}>重新加载候选</button></div>}
      </div>
    </Modal></div>}
  </>
}
