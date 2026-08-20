import {
  ChevronDown, FolderKanban, LayoutDashboard, LogOut, Menu, Tags, UsersRound,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { authApi } from '../services/api'
import type { User } from '../types/api'
import { BrandLogo } from './BrandLogo'

interface Props { user: User; children: ReactNode }

const menus = [
  { label: '工作台', icon: LayoutDashboard, path: '/workbench' },
  { label: '项目管理', icon: FolderKanban, path: '/projects' },
  { label: '标签管理', icon: Tags, path: '/labels' },
  { label: '团队与成员', icon: UsersRound, path: '/team-members' },
]

export function AppShell({ user, children }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const currentMenu = menus.find((item) => item.path && location.pathname.startsWith(item.path))

  async function logout() {
    await authApi.logout()
    window.location.assign('/login')
  }

  return (
    <div className={`app-layout${collapsed ? ' collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar-brand"><BrandLogo compact={collapsed} /></div>
        <nav aria-label="主导航">
          {menus.map(({ label, icon: Icon, path }) => (
            <button key={label} className={path && location.pathname.startsWith(path) ? 'active' : ''} type="button" title={collapsed ? label : undefined} onClick={() => path && navigate(path)}>
              <Icon size={19} /><span>{label}</span>
            </button>
          ))}
        </nav>
      </aside>
      <header className="topbar">
        <div className="topbar-left">
          <button className="icon-button" type="button" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? '展开菜单' : '收起菜单'}><Menu size={20} /></button>
          <span className="breadcrumb">{currentMenu?.label || 'iLabel++'}</span>
        </div>
        <div className="topbar-actions">
          {/* <button className="icon-button" type="button" aria-label="帮助"><CircleHelp size={19} /></button>
          <button className="icon-button has-dot" type="button" aria-label="通知"><Bell size={19} /></button> */}
          <span className="topbar-divider" />
          <div className="profile-menu">
            <button className="profile-trigger" type="button" onClick={() => setProfileOpen((value) => !value)} aria-expanded={profileOpen}>
              <span className="avatar">{user.name.slice(-2)}</span>
              <span className="profile-copy"><strong>{user.name}</strong><small>{user.roleLabels.join(' / ')}</small></span>
              <ChevronDown size={14} />
            </button>
            {profileOpen && <div className="profile-dropdown">
              {/* <button type="button"><UserRound size={16} />个人资料</button> */}
              <button type="button" onClick={logout}><LogOut size={16} />退出登录</button>
            </div>}
          </div>
        </div>
      </header>
      <main className="app-main">{children}</main>
    </div>
  )
}
