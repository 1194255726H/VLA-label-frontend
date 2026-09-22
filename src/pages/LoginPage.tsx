import { Eye, EyeOff, LockKeyhole, MessageSquareText, UserRound } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import loginHero from '../assets/login-hero.jpg'
import { Modal } from '../components/Modal'
import { runtimeConfig } from '../config/runtime'
import { authApi } from '../services/api'

export function LoginPage({ onLogin }: { onLogin: () => void }) {
  const navigate = useNavigate()
  const [username, setUsername] = useState(runtimeConfig.apiMode === 'mock' ? 'zhanghaitao' : '')
  const [password, setPassword] = useState(runtimeConfig.apiMode === 'mock' ? '123456' : '')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [forgotOpen, setForgotOpen] = useState(false)
  const [resetStep, setResetStep] = useState<1 | 2>(1)
  const [resetAccount, setResetAccount] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [maskedPhone, setMaskedPhone] = useState('')
  const [resetCode, setResetCode] = useState('')
  const [newPassword, setNewPassword] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (!username.trim() || !password) return setError('请输入登录账号和密码')
    setLoading(true)
    try {
      await authApi.login(username, password)
      onLogin()
      navigate('/workbench', { replace: true })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '登录失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  async function nextResetStep() {
    setError('')
    if (resetStep === 1) {
      if (!resetAccount.trim()) return setError('请输入登录账号')
      try {
        const challenge = await authApi.requestPasswordReset(resetAccount)
        setResetToken(challenge.resetToken)
        setMaskedPhone(challenge.maskedPhone)
        setResetStep(2)
      } catch (reason) { setError(reason instanceof Error ? reason.message : '账号验证失败') }
      return
    }
    if (resetCode.length !== 6 || newPassword.length < 8) return setError('请输入 6 位验证码和至少 8 位的新密码')
    try {
      await authApi.confirmPasswordReset({ resetToken, code: resetCode, newPassword })
      setForgotOpen(false)
      setResetStep(1)
      setError('')
    } catch (reason) { setError(reason instanceof Error ? reason.message : '密码重置失败') }
  }

  return (
    <main className="login-page">
      <img className="login-background-visual" src={loginHero} alt="" aria-hidden="true" />
      <div className="login-shell">
        <section className="login-hero" aria-label="平台介绍">
          <div className="hero-content">
            <div className="hero-copy">
              <p className="hero-eyebrow">西部创源</p>
              <h1>VLA Forge</h1>
              <p className="hero-desc">培训与数据标注全流程协同</p>
              <p className="hero-capabilities" aria-label="平台能力"><span>数据闭环</span><span>多角色协同</span><span>全流程质控</span></p>
            </div>
          </div>
        </section>
        <section className="login-panel" aria-label="登录区域">
          <div className="login-card">
            <div className="login-card-header"><h2>欢迎登录</h2></div>
            <div className="tabs page-tabs login-mode-tabs" role="tablist" aria-label="登录方式">
              <button className="login-mode-tab active" type="button" role="tab" id="passwordLoginTab" aria-controls="loginForm" aria-selected="true">密码登录</button>
              {/* <button className="login-mode-tab" type="button" role="tab" disabled title="当前后端 API 尚未提供短信登录">验证码登录</button> */}
            </div>
            <form className="login-form" id="loginForm" role="tabpanel" aria-labelledby="passwordLoginTab" noValidate onSubmit={submit}>
              <label className="login-field" data-required="true">
                <span>账号</span>
                <span className="field-input">
                  <UserRound className="field-icon" size={22} aria-hidden="true" />
                  <input className="control" id="username" name="username" type="text" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="请输入账号" autoComplete="username" autoFocus />
                </span>
              </label>
              <label className="login-field" data-required="true">
                <span>密码</span>
                <span className="field-input has-action">
                  <LockKeyhole className="field-icon" size={22} aria-hidden="true" />
                  <input className="control" id="password" name="password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="请输入登录密码" autoComplete="current-password" />
                  <button className="field-action" type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? '隐藏密码' : '显示密码'}>{showPassword ? <EyeOff size={20} /> : <Eye size={20} />}</button>
                </span>
              </label>
              <div className="login-options">
                <p className="login-error-message" role="alert" aria-live="assertive" hidden={!error}>{error}</p>
                <button className="text-action" type="button" onClick={() => { setError(''); setForgotOpen(true) }}>忘记密码</button>
              </div>
              <button className="login-submit" type="submit" disabled={loading}>{loading ? '正在登录...' : '登录并进入工作台'}</button>
            </form>
            {runtimeConfig.apiMode === 'mock' && <p className="mock-hint">Mock 环境已开启，可使用预填账号直接登录</p>}
          </div>
        </section>
      </div>
      <p className="page-copyright">© 2026 西部创源 All Rights Reserved</p>
      {forgotOpen && <Modal title="找回登录密码" onClose={() => setForgotOpen(false)} footer={<><button className="secondary-button" type="button" onClick={() => resetStep === 2 ? setResetStep(1) : setForgotOpen(false)}>{resetStep === 2 ? '上一步' : '取消'}</button><button className="primary-button" type="button" onClick={nextResetStep}>{resetStep === 1 ? '发送验证码' : '确认重置'}</button></>}>
        <div className="reset-steps"><span className="active">1 账号验证</span><i /><span className={resetStep === 2 ? 'active' : ''}>2 设置新密码</span></div>
        {resetStep === 1 ? <label className="form-field"><span>登录账号</span><div className="input-wrap"><UserRound size={18} /><input value={resetAccount} onChange={(event) => setResetAccount(event.target.value)} placeholder="请输入登录账号" /></div></label> : <div className="reset-fields"><p>验证码已发送至 <strong>{maskedPhone}</strong></p><label className="form-field"><span>验证码</span><div className="input-wrap"><MessageSquareText size={18} /><input value={resetCode} onChange={(event) => setResetCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="请输入 6 位验证码" /></div></label><label className="form-field"><span>新密码</span><div className="input-wrap"><LockKeyhole size={18} /><input type="password" minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="至少 8 位字符" /></div></label></div>}
        {error && <div className="form-message">{error}</div>}
      </Modal>}
    </main>
  )
}
