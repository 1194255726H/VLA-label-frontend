import { Archive, ChevronDown, CircleAlert, Edit3, Eye, Pause, Play, Plus, RotateCcw, Search, Square, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { AppShell } from '../components/AppShell'
import { Modal } from '../components/Modal'
import { labelApi, projectApi, teamApi } from '../services/managementApi'
import type { LabelLibrary, ManagedProject, Member, ProjectPayload, ProjectStatus, SessionResponse, Team } from '../types/api'

const statusLabels: Record<ProjectStatus, string> = { 'not-started': '未启动', running: '进行中', paused: '已暂停', finished: '已结束', archived: '已归档' }
const statusActions: Record<ProjectStatus, Array<{ label: string; status: ProjectStatus; icon: typeof Play }>> = {
  'not-started': [{ label: '启动', status: 'running', icon: Play }], running: [{ label: '暂停', status: 'paused', icon: Pause }, { label: '结束', status: 'finished', icon: Square }], paused: [{ label: '恢复', status: 'running', icon: RotateCcw }, { label: '结束', status: 'finished', icon: Square }], finished: [{ label: '归档', status: 'archived', icon: Archive }], archived: [],
}
const emptyForm: ProjectPayload = { name: '', desc: '', teams: [], owner: '', deliveryAt: '', completionNode: '验收', assignmentStrategy: 'manual_claim', labelLibraryIds: [] }

function duration(value: number) { if (!value) return '-'; const hours = Math.floor(value / 3600); const minutes = Math.floor(value % 3600 / 60); return `${hours}时${minutes}分` }

export function ProjectManagementPage({ session }: { session: SessionResponse }) {
  const [items, setItems] = useState<ManagedProject[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<ProjectStatus | 'all'>('all')
  const [keywordInput, setKeywordInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [team, setTeam] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [step, setStep] = useState<1 | 2>(1)
  const [editingId, setEditingId] = useState<string>()
  const [form, setForm] = useState<ProjectPayload>(emptyForm)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [teams, setTeams] = useState<Team[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [labelLibraries, setLabelLibraries] = useState<LabelLibrary[]>([])

  useEffect(() => { Promise.all([projectApi.list(), teamApi.getData(), labelApi.list()]).then(([projects, teamData, libraries]) => { setItems(projects); setTeams(teamData.teams); setMembers(teamData.members); setLabelLibraries(libraries) }).finally(() => setLoading(false)) }, [])
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 2500); return () => clearTimeout(timer) }, [toast])

  const counts = useMemo(() => Object.fromEntries(Object.keys(statusLabels).map((key) => [key, items.filter((item) => item.status === key).length])), [items])
  const filtered = useMemo(() => items.filter((item) => (status === 'all' || item.status === status) && (!keyword || `${item.name}${item.code}`.toLowerCase().includes(keyword.toLowerCase())) && (!team || item.teams.includes(team))), [items, keyword, status, team])

  function openCreate() { setEditingId(undefined); setForm(emptyForm); setStep(1); setError(''); setModalOpen(true) }
  function openEdit(item: ManagedProject) { setEditingId(item.id); setForm({ projectId: item.id, name: item.name, desc: item.desc, teams: [...(item.teamIds || [])], owner: item.ownerId || '', deliveryAt: item.deliveryAt, completionNode: item.completionNode, assignmentStrategy: item.assignmentStrategy || 'manual_claim', labelLibraryIds: [...item.labelLibraryIds] }); setStep(1); setError(''); setModalOpen(true) }
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('')
    if (step === 1) { if (!form.name.trim() || !form.teams.length || !form.owner || !form.deliveryAt) return setError('请完整填写项目名称、团队、负责人和交付时间'); setStep(2); return }
    if (!form.completionNode) return setError('请选择任务结束节点')
    try { setItems(await projectApi.save({ ...form, projectId: editingId })); setModalOpen(false); setToast(editingId ? '项目已更新' : '项目创建成功') } catch (reason) { setError(reason instanceof Error ? reason.message : '项目保存失败') }
  }
  async function changeStatus(item: ManagedProject, next: ProjectStatus) {
    try { setItems(await projectApi.setStatus(item.id, next)); setToast(`${item.name}已${statusLabels[next]}`) } catch (reason) { setToast(reason instanceof Error ? reason.message : '状态变更失败') }
  }
  async function removeProject(item: ManagedProject) { if (!window.confirm(`确认删除项目“${item.name}”？`)) return; try { setItems(await projectApi.delete(item.id)); setToast('项目已删除') } catch (reason) { setToast(reason instanceof Error ? reason.message : '项目删除失败') } }

  return <AppShell user={session.account}>
    <section className="management-page">
      <section className="management-panel panel">
        <header className="management-toolbar">
          <div className="status-segments"><button className={status === 'all' ? 'active' : ''} onClick={() => setStatus('all')} type="button">全部 <span>{items.length}</span></button>{Object.entries(statusLabels).map(([key, label]) => <button className={status === key ? 'active' : ''} onClick={() => setStatus(key as ProjectStatus)} type="button" key={key}>{label} <span>{counts[key] || 0}</span></button>)}</div>
          <button className="primary-button" type="button" onClick={openCreate}><Plus size={16} />创建项目</button>
        </header>
        <div className="management-filters">
          <label><span>项目名称</span><div className="filter-control"><Search size={16} /><input value={keywordInput} onChange={(event) => setKeywordInput(event.target.value)} placeholder="请输入项目名称或编号" /></div></label>
          <label><span>所属团队</span><div className="filter-control select"><select value={team} onChange={(event) => setTeam(event.target.value)}><option value="">全部团队</option>{teams.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select><ChevronDown size={14} /></div></label>
          <button className="primary-button compact" type="button" onClick={() => setKeyword(keywordInput.trim())}>查询</button><button className="secondary-button compact" type="button" onClick={() => { setKeywordInput(''); setKeyword(''); setTeam('') }}>重置</button>
        </div>
        <div className="management-table-wrap"><table className="management-table project-table"><thead><tr><th>项目名称</th><th>状态</th><th>团队</th><th>标注人数</th><th>数据量</th><th>有效时长</th><th>单次任务数</th><th>小目标数</th><th>完成节点</th><th>进度</th><th>负责人</th><th>交付时间</th><th>操作</th></tr></thead><tbody>
          {loading ? <tr><td colSpan={13}><div className="management-empty">正在加载项目...</div></td></tr> : filtered.map((item) => <tr key={item.id}><td><div className="entity-name"><strong>{item.name}</strong><small>{item.code}</small></div></td><td><span className={`project-status ${item.status}`}>{statusLabels[item.status]}</span></td><td title={item.teams.join('、')}>{item.teams.join('、')}</td><td>{item.memberCount}</td><td>{item.dataCount}</td><td>{duration(item.validDuration)}</td><td>{item.goalCount}</td><td>{item.actionCount}</td><td><span className="node-tag blue">{item.completionNode}</span></td><td><div className="progress-cell"><span><i style={{ width: `${item.progress}%` }} /></span><b>{item.progress}%</b></div></td><td>{item.owner}</td><td><span className={new Date(item.deliveryAt) < new Date() && item.status !== 'finished' ? 'risk-date' : ''}>{item.deliveryAt}</span></td><td><div className="row-actions"><button type="button" onClick={() => { window.location.hash = `/projects/${encodeURIComponent(item.id)}/annotation-data` }}><Eye size={15} />查看</button><button type="button" onClick={() => openEdit(item)}><Edit3 size={15} />编辑</button>{statusActions[item.status].map(({ label, status: next, icon: Icon }) => <button key={label} type="button" onClick={() => changeStatus(item, next)}><Icon size={15} />{label}</button>)}<button className="danger-action" type="button" onClick={() => removeProject(item)}><Trash2 size={15} />删除</button></div></td></tr>)}
          {!loading && !filtered.length && <tr><td colSpan={13}><div className="management-empty"><CircleAlert size={32} />未找到匹配项目</div></td></tr>}
        </tbody></table></div>
        <footer className="management-footer"><span>共 {filtered.length} 条</span><div className="pagination"><button disabled type="button">‹</button><strong>1</strong><button disabled type="button">›</button><span>10条/页</span></div></footer>
      </section>
    </section>
    {modalOpen && <Modal title={editingId ? '编辑项目' : '创建项目'} onClose={() => setModalOpen(false)} footer={<><button className="secondary-button" type="button" onClick={() => step === 2 ? setStep(1) : setModalOpen(false)}>{step === 2 ? '上一步' : '取消'}</button><button className="primary-button" type="submit" form="project-form">{step === 1 ? '下一步' : editingId ? '保存' : '创建项目'}</button></>}>
      <form id="project-form" className="project-form" onSubmit={submit}>
        <div className="form-steps"><span className="active">1 基本信息</span><i /><span className={step === 2 ? 'active' : ''}>2 项目配置</span></div>
        {step === 1 ? <div className="modal-form-grid"><label><span>项目名称 <i className="required-mark">*</i></span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="请输入项目名称" /></label><label><span>交付时间 <i className="required-mark">*</i></span><input type="date" value={form.deliveryAt} onChange={(e) => setForm({ ...form, deliveryAt: e.target.value })} /></label><label><span>所属团队 <i className="required-mark">*</i></span><select value={form.teams[0] || ''} onChange={(e) => setForm({ ...form, teams: e.target.value ? [e.target.value] : [] })}><option value="">请选择团队</option>{teams.filter((item) => item.enabled).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label><span>项目负责人 <i className="required-mark">*</i></span><select value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })}><option value="">请选择负责人</option>{members.filter((item) => item.enabled && item.roles.includes('项目经理')).map((item) => <option key={item.accountId} value={item.accountId}>{item.name}</option>)}</select></label><label className="wide"><span>项目描述</span><textarea value={form.desc} maxLength={500} onChange={(e) => setForm({ ...form, desc: e.target.value })} placeholder="请输入项目背景和范围" /></label></div> : <div className="modal-form-grid"><label><span>任务结束节点 <i className="required-mark">*</i></span><select value={form.completionNode} onChange={(e) => setForm({ ...form, completionNode: e.target.value as ProjectPayload['completionNode'] })}><option>质检</option><option>审核</option><option>验收</option></select></label><label><span>分配策略</span><select value={form.assignmentStrategy} onChange={(e) => setForm({ ...form, assignmentStrategy: e.target.value as ProjectPayload['assignmentStrategy'] })}><option value="manual_claim">人工领取</option><option value="load_balance">负载均衡</option><option value="round_robin">轮询分配</option></select></label><fieldset className="wide checkbox-group"><legend>关联标签库</legend>{labelLibraries.filter((library) => library.enabled).map((library) => <label key={library.id}><input type="checkbox" checked={form.labelLibraryIds.includes(library.id)} onChange={(e) => setForm({ ...form, labelLibraryIds: e.target.checked ? [...form.labelLibraryIds, library.id] : form.labelLibraryIds.filter((id) => id !== library.id) })} />{library.name}</label>)}</fieldset></div>}
        {error && <p className="inline-error">{error}</p>}
      </form>
    </Modal>}
    {toast && <div className="toast">{toast}</div>}
  </AppShell>
}
