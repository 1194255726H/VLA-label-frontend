import { ChevronRight, CircleAlert, Edit3, FolderKanban, KeyRound, Plus, Search, Trash2, Upload, UserRound, UsersRound } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { AppShell } from '../components/AppShell'
import { Modal } from '../components/Modal'
import { PaginationJump } from '../components/PaginationJump'
import { teamApi } from '../services/managementApi'
import type { Member, SessionResponse, Team, TeamMembersData } from '../types/api'

const roles = ['管理员', '项目经理', '标注员', '质检员', '审核员', '验收员']

export function TeamMembersPage({ session }: { session: SessionResponse }) {
  const [data, setData] = useState<TeamMembersData>({ teams: [], members: [], projects: [] })
  const [loading, setLoading] = useState(true)
  const [selectedTeam, setSelectedTeam] = useState('all')
  const [teamSearch, setTeamSearch] = useState('')
  const [tab, setTab] = useState<'members' | 'projects'>('members')
  const [keywordInput, setKeywordInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [teamModal, setTeamModal] = useState(false)
  const [editingTeam, setEditingTeam] = useState<Team>()
  const [teamName, setTeamName] = useState('')
  const [teamDesc, setTeamDesc] = useState('')
  const [memberModal, setMemberModal] = useState(false)
  const [editingMember, setEditingMember] = useState<Member>()
  const [memberForm, setMemberForm] = useState({ name: '', account: '', email: '', password: '', team: '', roles: [] as string[] })
  const [passwordMember, setPasswordMember] = useState<Member>()
  const [newPassword, setNewPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  useEffect(() => { teamApi.getData().then(setData).finally(() => setLoading(false)) }, [])
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 2500); return () => clearTimeout(timer) }, [toast])
  const selectedTeamName = data.teams.find((item) => item.id === selectedTeam)?.name
  const visibleMembers = useMemo(() => data.members.filter((item) => (!selectedTeamName || item.team === selectedTeamName) && (!keyword || `${item.name}${item.account}${item.email}`.toLowerCase().includes(keyword.toLowerCase())) && (!roleFilter || item.roles.includes(roleFilter)) && (!statusFilter || String(item.enabled) === statusFilter)), [data.members, keyword, roleFilter, selectedTeamName, statusFilter])
  const memberPages = Math.max(1, Math.ceil(visibleMembers.length / pageSize))
  const currentMemberPage = Math.min(page, memberPages)
  const pagedMembers = visibleMembers.slice((currentMemberPage - 1) * pageSize, currentMemberPage * pageSize)
  const scopeMembers = data.members.filter((item) => !selectedTeamName || item.team === selectedTeamName)
  const scopeProjects = data.projects.filter((item) => !selectedTeamName || item.teams.includes(selectedTeamName))

  function openTeam(item?: Team) { setEditingTeam(item); setTeamName(item?.name || ''); setTeamDesc(item?.desc || ''); setError(''); setTeamModal(true) }
  async function saveTeam(event: FormEvent) { event.preventDefault(); if (!teamName.trim()) return setError('请输入团队名称'); try { setData(await teamApi.saveTeam({ id: editingTeam?.id, name: teamName.trim(), desc: teamDesc.trim(), enabled: editingTeam?.enabled ?? true })); setTeamModal(false); setToast(editingTeam ? '团队已更新' : '团队创建成功') } catch (reason) { setError(reason instanceof Error ? reason.message : '团队保存失败') } }
  function openMember(item?: Member) { setEditingMember(item); setMemberForm({ name: item?.name || '', account: item?.account || '', email: item?.email || '', password: '', team: item?.teamId || (selectedTeam === 'all' ? '' : selectedTeam), roles: item?.roles || [] }); setError(''); setMemberModal(true) }
  async function saveMember(event: FormEvent) { event.preventDefault(); if (!memberForm.name || !memberForm.account || !memberForm.email || !memberForm.team || !memberForm.roles.length || (!editingMember && memberForm.password.length < 8)) return setError('请完整填写必填项，初始密码至少 8 位'); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(memberForm.email)) return setError('请输入正确的邮箱地址'); try { setData(await teamApi.saveMember({ accountId: editingMember?.accountId, ...memberForm })); setMemberModal(false); setToast(editingMember ? '成员已更新' : '成员添加成功') } catch (reason) { setError(reason instanceof Error ? reason.message : '成员保存失败') } }
  async function toggleMember(item: Member) { try { setData(await teamApi.setMemberStatus(item.accountId, !item.enabled)); setToast(`${item.name}已${item.enabled ? '停用' : '启用'}`) } catch (reason) { setToast(reason instanceof Error ? reason.message : '状态修改失败') } }
  function openChangePassword(item: Member) { setPasswordMember(item); setNewPassword(''); setPasswordError(''); setPasswordSaving(false) }
  async function changePassword(event: FormEvent) {
    event.preventDefault()
    if (!passwordMember) return
    if (newPassword.length < 8) return setPasswordError('新密码至少 8 位')
    setPasswordSaving(true)
    setPasswordError('')
    try { await teamApi.setMemberPassword(passwordMember.accountId, newPassword); setPasswordMember(undefined); setNewPassword(''); setToast('密码修改成功') }
    catch (reason) { setPasswordError(reason instanceof Error ? reason.message : '密码修改失败') }
    finally { setPasswordSaving(false) }
  }
  async function toggleTeam(item: Team) { try { setData(await teamApi.setTeamStatus(item.id, !item.enabled)); setToast(`${item.name}已${item.enabled ? '停用' : '启用'}`) } catch (reason) { setToast(reason instanceof Error ? reason.message : '团队状态修改失败') } }
  async function removeTeam(item: Team) { if (!window.confirm(`确认删除团队“${item.name}”？删除后成员将变为未分配团队。`)) return; try { setData(await teamApi.deleteTeam(item.id)); setSelectedTeam('all'); setToast('团队已删除') } catch (reason) { setToast(reason instanceof Error ? reason.message : '团队删除失败') } }
  async function removeMember(item: Member) { if (!window.confirm(`确认删除成员“${item.name}”？`)) return; try { setData(await teamApi.deleteMember(item.accountId)); setToast('成员已删除') } catch (reason) { setToast(reason instanceof Error ? reason.message : '成员删除失败') } }

  return <AppShell user={session.account}>
    <section className="management-page team-page">
      <aside className="team-tree panel">
        <header><h2>团队</h2><button className="primary-button compact" type="button" onClick={() => openTeam()}><Plus size={15} />添加团队</button></header>
        <div className="team-search"><Search size={16} /><input value={teamSearch} onChange={(e) => setTeamSearch(e.target.value)} placeholder="搜索团队名称" /></div>
        <nav><button className={selectedTeam === 'all' ? 'active' : ''} type="button" onClick={() => { setSelectedTeam('all'); setPage(1) }}><span><UsersRound size={17} />全部团队</span><b>{data.members.length}</b></button>{data.teams.filter((item) => item.name.includes(teamSearch)).map((item) => <button className={selectedTeam === item.id ? 'active' : ''} type="button" key={item.id} onClick={() => { setSelectedTeam(item.id); setPage(1) }}><span><UsersRound size={17} />{item.name}</span><b>{data.members.filter((member) => member.team === item.name).length}</b><ChevronRight size={14} /></button>)}</nav>
        {selectedTeam !== 'all' && (() => { const current = data.teams.find((item) => item.id === selectedTeam); return current ? <div className="current-team-actions"><button className="edit-current-team" type="button" onClick={() => openTeam(current)}><Edit3 size={14} />编辑</button><button className="edit-current-team" type="button" onClick={() => toggleTeam(current)}>{current.enabled ? '停用' : '启用'}</button><button className="edit-current-team danger-action" type="button" onClick={() => removeTeam(current)}><Trash2 size={14} />删除</button></div> : null })()}
      </aside>
      <div className="team-main">
        <section className="scope-summary panel"><div><span>当前范围</span><strong>{selectedTeamName || '全部团队'}</strong></div><i /><div><span>团队总数</span><strong>{selectedTeamName ? 1 : data.teams.length} 个</strong></div><div><span>成员总数</span><strong>{scopeMembers.length}</strong></div><div><span>启用成员</span><strong>{scopeMembers.filter((item) => item.enabled).length}</strong></div><div><span>关联项目</span><strong>{scopeProjects.length}</strong></div></section>
        <section className="management-panel panel team-workspace">
          <header className="management-toolbar team-tabs"><div><button className={tab === 'members' ? 'active' : ''} onClick={() => setTab('members')} type="button">人员管理</button><button className={tab === 'projects' ? 'active' : ''} onClick={() => setTab('projects')} type="button">项目分布</button></div><div><button className="secondary-button" type="button" disabled title="当前后端 API 尚未提供成员导入"><Upload size={15} />导入成员</button><button className="primary-button" type="button" onClick={() => openMember()}><Plus size={16} />添加成员</button></div></header>
          {tab === 'members' ? <>
            <div className="management-filters"><label><span>成员</span><div className="filter-control"><Search size={16} /><input value={keywordInput} onChange={(e) => setKeywordInput(e.target.value)} placeholder="姓名、账号或邮箱" /></div></label><label><span>角色</span><div className="filter-control select"><select value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(1) }}><option value="">全部角色</option>{roles.map((role) => <option key={role}>{role}</option>)}</select></div></label><label><span>状态</span><div className="filter-control select"><select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}><option value="">全部状态</option><option value="true">启用</option><option value="false">停用</option></select></div></label><button className="primary-button compact" type="button" onClick={() => { setKeyword(keywordInput.trim()); setPage(1) }}>查询</button><button className="secondary-button compact" onClick={() => { setKeyword(''); setKeywordInput(''); setRoleFilter(''); setStatusFilter(''); setPage(1) }}>重置</button></div>
            <div className="management-table-wrap"><table className="management-table member-table"><thead><tr><th>成员</th><th>团队</th><th>角色</th><th>账号</th><th>邮箱</th><th>项目数</th><th>状态</th><th>添加日期</th><th>操作</th></tr></thead><tbody>{loading ? <tr><td colSpan={9}><div className="management-empty">正在加载成员...</div></td></tr> : pagedMembers.map((item) => <tr key={item.accountId}><td><div className="member-identity"><span>{item.name.slice(-2)}</span><strong>{item.name}</strong></div></td><td>{item.team || '未分配团队'}</td><td><div className="role-list">{item.roles.map((role) => <span key={role}>{role}</span>)}</div></td><td>{item.account}</td><td>{item.email || '-'}</td><td>{item.projects.length}</td><td><button className={`status-switch ${item.enabled ? 'on' : ''}`} type="button" onClick={() => toggleMember(item)} aria-label={item.enabled ? '停用成员' : '启用成员'}><i /></button><span className="switch-label">{item.enabled ? '启用' : '停用'}</span></td><td>{item.joinedAt}</td><td><div className="row-actions"><button type="button" onClick={() => openMember(item)}><Edit3 size={15} />编辑</button><button type="button" onClick={() => openChangePassword(item)}><KeyRound size={15} />修改密码</button><button className="danger-action" type="button" onClick={() => removeMember(item)}><Trash2 size={15} />删除</button></div></td></tr>)}{!loading && !visibleMembers.length && <tr><td colSpan={9}><div className="management-empty"><CircleAlert size={32} />暂无符合条件的成员</div></td></tr>}</tbody></table></div><footer className="management-footer"><span>共 {visibleMembers.length} 条</span><PaginationJump page={page} pages={memberPages} disabled={loading} onChange={setPage} pageSize={pageSize} onPageSizeChange={(size) => { setPageSize(size); setPage(1) }} /></footer>
          </> : <><div className="distribution-metrics"><div><FolderKanban size={20} /><span>关联项目</span><strong>{scopeProjects.length}</strong></div><div><UsersRound size={20} /><span>项目成员</span><strong>{scopeProjects.reduce((sum, item) => sum + item.memberCount, 0)}</strong></div><div><UserRound size={20} /><span>作业角色</span><strong>{scopeProjects.reduce((sum, item) => sum + item.annotatorCount + item.reviewerCount + item.qualityCount + item.acceptorCount, 0)}</strong></div></div><div className="management-table-wrap"><table className="management-table"><thead><tr><th>项目名称</th><th>人员数</th><th>项目经理</th><th>标注员</th><th>质检员</th><th>审核员</th><th>验收员</th><th>团队</th></tr></thead><tbody>{scopeProjects.map((item) => <tr key={item.projectId}><td><strong>{item.projectName}</strong></td><td>{item.memberCount}</td><td>{item.managerCount}</td><td>{item.annotatorCount}</td><td>{item.reviewerCount}</td><td>{item.qualityCount}</td><td>{item.acceptorCount}</td><td>{item.teams.join('、')}</td></tr>)}</tbody></table></div></>}
        </section>
      </div>
    </section>
    {teamModal && <Modal title={editingTeam ? '编辑团队' : '添加团队'} onClose={() => setTeamModal(false)} footer={<><button className="secondary-button" onClick={() => setTeamModal(false)}>取消</button><button className="primary-button" type="submit" form="team-form">保存</button></>}><form id="team-form" className="single-column-form" onSubmit={saveTeam}><label><span>团队名称 <i className="required-mark">*</i></span><input value={teamName} onChange={(e) => setTeamName(e.target.value)} maxLength={120} placeholder="请输入团队名称" /></label><label><span>团队描述</span><textarea value={teamDesc} onChange={(e) => setTeamDesc(e.target.value)} maxLength={200} placeholder="请输入团队职责或协作范围" /></label><small className="char-count">{teamDesc.length}/200</small>{error && <p className="inline-error">{error}</p>}</form></Modal>}
        {memberModal && <Modal title={editingMember ? '编辑成员' : '添加成员'} onClose={() => setMemberModal(false)} footer={<><button className="secondary-button" onClick={() => setMemberModal(false)}>取消</button><button className="primary-button" type="submit" form="member-form">保存</button></>}><form id="member-form" className="modal-form-grid member-form" onSubmit={saveMember}><label><span>姓名 <i className="required-mark">*</i></span><input value={memberForm.name} onChange={(e) => setMemberForm({ ...memberForm, name: e.target.value })} placeholder="请输入姓名" /></label><label><span>邮箱 <i className="required-mark">*</i></span><input type="email" value={memberForm.email} onChange={(e) => setMemberForm({ ...memberForm, email: e.target.value })} placeholder="请输入邮箱地址" /></label><label><span>账号 <i className="required-mark">*</i></span><input value={memberForm.account} disabled={Boolean(editingMember)} onChange={(e) => setMemberForm({ ...memberForm, account: e.target.value })} placeholder="请输入账号" /></label>{!editingMember && <label><span>初始密码 <i className="required-mark">*</i></span><input type="password" minLength={8} value={memberForm.password} onChange={(e) => setMemberForm({ ...memberForm, password: e.target.value })} placeholder="至少 8 位" /></label>}<label><span>所属团队 <i className="required-mark">*</i></span><select value={memberForm.team} onChange={(e) => setMemberForm({ ...memberForm, team: e.target.value })}><option value="">请选择团队</option>{data.teams.filter((item) => item.enabled).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><fieldset className="wide checkbox-group"><legend>角色 <i className="required-mark">*</i></legend>{roles.map((role) => <label key={role}><input type="checkbox" checked={memberForm.roles.includes(role)} onChange={(e) => setMemberForm({ ...memberForm, roles: e.target.checked ? [...memberForm.roles, role] : memberForm.roles.filter((item) => item !== role) })} />{role}</label>)}</fieldset>{error && <p className="inline-error wide">{error}</p>}</form></Modal>}
    {passwordMember && <Modal title="修改密码" onClose={() => { if (!passwordSaving) setPasswordMember(undefined) }} footer={<><button className="secondary-button" type="button" disabled={passwordSaving} onClick={() => setPasswordMember(undefined)}>取消</button><button className="primary-button" type="submit" form="password-form" disabled={passwordSaving}>{passwordSaving ? '正在修改...' : '确认修改'}</button></>}><form id="password-form" className="single-column-form password-form" onSubmit={changePassword}><div className="password-member-summary"><span>{passwordMember.name.slice(-2)}</span><div><strong>{passwordMember.name}</strong><small>{passwordMember.account}</small></div></div><label><span>新密码 <i className="required-mark">*</i></span><input autoFocus type="password" minLength={8} autoComplete="new-password" value={newPassword} disabled={passwordSaving} onChange={(event) => { setNewPassword(event.target.value); if (passwordError) setPasswordError('') }} placeholder="请输入至少 8 位的新密码" /></label><small className="password-rule-hint">密码至少 8 位，请避免使用常见密码或纯数字密码。</small>{passwordError && <p className="inline-error">{passwordError}</p>}</form></Modal>}
    {toast && <div className="toast">{toast}</div>}
  </AppShell>
}
