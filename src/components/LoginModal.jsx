import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

const SUCURSALES = [
  { name: 'León',            slug: 'leon' },
  { name: 'San Luis Potosí', slug: 'san-luis' },
  { name: 'Aguascalientes',  slug: 'aguascalientes' },
  { name: 'Torreón',         slug: 'torreon' },
]

const EyeOpen = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
  </svg>
)
const EyeClosed = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
    <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
    <line x1="2" y1="2" x2="22" y2="22" />
  </svg>
)
const LockIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
)

export default function LoginModal({ onClose }) {
  const { login } = useAuth()
  const [branch, setBranch]     = useState(SUCURSALES[0])
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setTimeout(() => {
      const result = login(branch.slug, password)
      if (result.ok) {
        onClose()
      } else {
        setError(result.msg || 'Contraseña incorrecta.')
        setPassword('')
      }
      setLoading(false)
    }, 350)
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{ backgroundColor: '#fff', borderRadius: 32, padding: '40px 36px 36px', width: '100%', maxWidth: 400, boxShadow: '0 32px 80px rgba(0,0,0,0.18)', position: 'relative', animation: 'modalIn 0.2s ease' }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          style={{ position: 'absolute', top: 18, right: 20, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(0,0,0,0.3)', fontSize: 22, lineHeight: 1, padding: '0 4px' }}
        >
          ×
        </button>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ width: 48, height: 48, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', background: 'linear-gradient(135deg, rgba(0,188,242,0.1), rgba(141,198,63,0.1))', color: '#00BCF2' }}>
            <LockIcon />
          </div>
          <span
            style={{ fontSize: 28, fontWeight: 900, display: 'block', background: 'linear-gradient(135deg, #00BCF2, #8DC63F)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}
          >
            iStuffs
          </span>
          <p style={{ fontSize: 13, color: '#888', marginTop: 4 }}>
            Acceso para administrar inventario
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Sucursal */}
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#888', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Sucursal
            </label>
            <div style={{ position: 'relative' }}>
              <select
                value={branch.slug}
                onChange={e => { setBranch(SUCURSALES.find(s => s.slug === e.target.value)); setError('') }}
                style={{ width: '100%', padding: '11px 40px 11px 16px', borderRadius: 999, border: '1.5px solid rgba(0,0,0,0.1)', backgroundColor: '#f7f8fa', fontSize: 14, color: '#0A0A0A', appearance: 'none', cursor: 'pointer', outline: 'none', fontFamily: 'inherit' }}
                onFocus={e => (e.target.style.borderColor = 'rgba(0,188,242,0.5)')}
                onBlur={e => (e.target.style.borderColor = 'rgba(0,0,0,0.1)')}
              >
                {SUCURSALES.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
              </select>
              <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'rgba(0,0,0,0.35)', fontSize: 12 }}>▼</span>
            </div>
          </div>

          {/* Contraseña */}
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#888', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Contraseña
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => { setPassword(e.target.value); setError('') }}
                placeholder="Ingresa tu contraseña"
                required
                autoFocus
                style={{ width: '100%', padding: '11px 44px 11px 16px', borderRadius: 999, border: `1.5px solid ${error ? 'rgba(213,26,122,0.5)' : 'rgba(0,0,0,0.1)'}`, backgroundColor: error ? 'rgba(213,26,122,0.03)' : '#f7f8fa', fontSize: 14, color: '#0A0A0A', outline: 'none', fontFamily: 'inherit', transition: 'border-color 0.15s' }}
                onFocus={e => !error && (e.target.style.borderColor = 'rgba(0,188,242,0.5)')}
                onBlur={e => !error && (e.target.style.borderColor = 'rgba(0,0,0,0.1)')}
              />
              <button
                type="button"
                onClick={() => setShowPass(v => !v)}
                style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(0,0,0,0.35)', padding: 4 }}
              >
                {showPass ? <EyeClosed /> : <EyeOpen />}
              </button>
            </div>
            {error && (
              <p style={{ fontSize: 12, color: '#D51A7A', marginTop: 7, paddingLeft: 4 }}>
                ⚠ {error}
              </p>
            )}
          </div>

          {/* Botón */}
          <button
            type="submit"
            disabled={loading || !password.trim()}
            style={{ width: '100%', padding: '13px 0', marginTop: 4, background: (loading || !password.trim()) ? 'rgba(0,0,0,0.07)' : 'linear-gradient(135deg, #D51A7A, #FF6B1A)', borderRadius: 999, border: 'none', color: (loading || !password.trim()) ? 'rgba(0,0,0,0.28)' : 'white', fontSize: 15, fontWeight: 700, cursor: (loading || !password.trim()) ? 'default' : 'pointer', transition: 'all 0.2s', boxShadow: (loading || !password.trim()) ? 'none' : '0 6px 20px rgba(213,26,122,0.3)', fontFamily: 'inherit' }}
            onMouseEnter={e => { if (!loading && password.trim()) e.currentTarget.style.transform = 'scale(1.02)' }}
            onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
          >
            {loading ? 'Verificando...' : 'Ingresar'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: 11, color: '#ccc', marginTop: 20 }}>
          Solo personal autorizado de iStuffs
        </p>
      </div>

      <style>{`
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.96) translateY(8px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  )
}
