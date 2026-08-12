import logo from '../assets/ilabel-logo.svg'

type Props = { compact?: boolean; inverse?: boolean }

export function BrandLogo({ compact = false, inverse = false }: Props) {
  return (
    <div className={`brand-logo${compact ? ' compact' : ''}${inverse ? ' inverse' : ''}`} aria-label="iLabel++">
      <img className="brand-mark" src={logo} alt="" aria-hidden="true" />
      {!compact && <span>iLabel++</span>}
    </div>
  )
}
