import { Eye, EyeOff, KeyRound, LockKeyhole, MessageSquareText, Phone, UserRound } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import loginHero from '../assets/login-hero.jpg'
import { BrandLogo } from '../components/BrandLogo'
import { Modal } from '../components/Modal'
import { runtimeConfig } from '../config/runtime'
import { authApi } from '../services/api'

type LoginMode = 'password' | 'sms'

export function LoginPage({ onLogin }: { onLogin: () => void }) {
  const navigate = useNavigate()
  const [mode] = useState<LoginMode>('password')
  const [username, setUsername] = useState(runtimeConfig.apiMode === 'mock' ? 'zhanghaitao' : '')
  const [password, setPassword] = useState(runtimeConfig.apiMode === 'mock' ? '123456' : '')
  const [showPassword, setShowPassword] = useState(false)
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [challengeId, setChallengeId] = useState('')
  const [countdown, setCountdown] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [forgotOpen, setForgotOpen] = useState(false)
  const [resetStep, setResetStep] = useState<1 | 2>(1)
  const [resetAccount, setResetAccount] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [maskedPhone, setMaskedPhone] = useState('')
  const [resetCode, setResetCode] = useState('')
  const [newPassword, setNewPassword] = useState('')

  useEffect(() => {
    if (countdown <= 0) return
    const timer = window.setTimeout(() => setCountdown((value) => value - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [countdown])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (mode === 'password' && (!username.trim() || !password)) return setError('请输入登录账号和密码')
    if (mode === 'sms' && (!/^1\d{10}$/.test(phone) || code.length !== 6)) return setError('请输入正确的手机号和 6 位验证码')
    setLoading(true)
    try {
      if (mode === 'password') await authApi.login(username, password)
      else await authApi.smsLogin(phone, code, challengeId)
      onLogin()
      navigate('/workbench', { replace: true })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '登录失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  async function sendSms() {
    if (!/^1\d{10}$/.test(phone)) return setError('请输入正确的手机号码')
    setError('')
    try {
      const challenge = await authApi.requestSmsCode(phone)
      setChallengeId(challenge.challengeId)
      setCountdown(60)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '验证码发送失败')
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
    if (resetCode.length !== 6 || newPassword.length < 6) return setError('请输入 6 位验证码和至少 6 位的新密码')
    try {
      await authApi.confirmPasswordReset({ resetToken, code: resetCode, newPassword })
      setForgotOpen(false)
      setResetStep(1)
      setError('')
    } catch (reason) { setError(reason instanceof Error ? reason.message : '密码重置失败') }
  }

  return (
    <main className="login-page">
      <img className="login-visual" src={loginHero} alt="智能机器人参与多模态数据生产" />
      <div className="login-overlay" />
      <section className="login-brand-content">
        <BrandLogo inverse />
        <h1>具身智能数据生产平台</h1>
        <p>培训、标注、质检、审核、验收全流程协同</p>
        <div className="login-capabilities"><span>数据闭环</span><span>多角色协同</span><span>全流程质控</span></div>
      </section>
      <section className="login-card" aria-label="登录">
        <div className="login-card-title"><span className="login-title-icon"><KeyRound size={22} /></span><div><h2>欢迎登录</h2><p>登录 iLabel++ 开始数据生产作业</p></div></div>
        <div className="login-tabs" role="tablist">
          <button className={mode === 'password' ? 'active' : ''} type="button"><LockKeyhole size={16} />密码登录</button>
          <button className={mode === 'sms' ? 'active' : ''} type="button" disabled title="当前后端 API 尚未提供短信登录"><MessageSquareText size={16} />验证码登录</button>
        </div>
        <form onSubmit={submit}>
          {mode === 'password' ? <>
            <label className="form-field"><span>账号</span><div className="input-wrap"><UserRound size={18} /><input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="请输入登录账号" autoComplete="username" /></div></label>
            <label className="form-field"><span>密码</span><div className="input-wrap"><LockKeyhole size={18} /><input value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? 'text' : 'password'} placeholder="请输入登录密码" autoComplete="current-password" /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? '隐藏密码' : '显示密码'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
            <div className="login-options"><label><input type="checkbox" />记住账号</label><button type="button" disabled title="当前后端 API 尚未提供密码找回">忘记密码</button></div>
          </> : <>
            <label className="form-field"><span>手机号</span><div className="input-wrap"><Phone size={18} /><b>+86</b><input value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, '').slice(0, 11))} inputMode="numeric" placeholder="请输入手机号" /></div></label>
            <label className="form-field"><span>验证码</span><div className="input-wrap"><MessageSquareText size={18} /><input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" placeholder="请输入 6 位验证码" /><button className="code-button" type="button" disabled={countdown > 0} onClick={sendSms}>{countdown ? `${countdown}s` : '获取验证码'}</button></div></label>
          </>}
          <div className="form-message" role="alert">{error}</div>
          <button className="primary-button login-button" type="submit" disabled={loading}>{loading ? '正在登录...' : '登录并进入工作台'}</button>
        </form>
        {runtimeConfig.apiMode === 'mock' && <p className="mock-hint">Mock 环境已开启，可使用预填账号直接登录</p>}
      </section>
      <footer className="login-footer">© 2026 iLabel++ All Rights Reserved</footer>
      {forgotOpen && <Modal title="找回登录密码" onClose={() => setForgotOpen(false)} footer={<><button className="secondary-button" type="button" onClick={() => resetStep === 2 ? setResetStep(1) : setForgotOpen(false)}>{resetStep === 2 ? '上一步' : '取消'}</button><button className="primary-button" type="button" onClick={nextResetStep}>{resetStep === 1 ? '发送验证码' : '确认重置'}</button></>}>
        <div className="reset-steps"><span className="active">1 账号验证</span><i /><span className={resetStep === 2 ? 'active' : ''}>2 设置新密码</span></div>
        {resetStep === 1 ? <label className="form-field"><span>登录账号</span><div className="input-wrap"><UserRound size={18} /><input value={resetAccount} onChange={(event) => setResetAccount(event.target.value)} placeholder="请输入登录账号" /></div></label> : <div className="reset-fields"><p>验证码已发送至 <strong>{maskedPhone}</strong></p><label className="form-field"><span>验证码</span><div className="input-wrap"><MessageSquareText size={18} /><input value={resetCode} onChange={(event) => setResetCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="请输入 6 位验证码" /></div></label><label className="form-field"><span>新密码</span><div className="input-wrap"><LockKeyhole size={18} /><input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="至少 6 位字符" /></div></label></div>}
        {error && <div className="form-message">{error}</div>}
      </Modal>}
    </main>
  )
}
