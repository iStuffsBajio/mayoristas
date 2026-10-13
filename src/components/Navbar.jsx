import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

const SearchIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
  </svg>
)
const CartIcon = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="21" r="1" /><circle cx="19" cy="21" r="1" />
    <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
  </svg>
)
const UserIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
  </svg>
)
const LogoutIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
)

/** Alto de la barra. La de pestañas se pega justo debajo usando este valor. */
export const ALTO_BARRA = 52

// Alto de la barra de pestañas que va debajo de ésta. Vive aquí y no en App
// para que el panel de administración pueda pegar su propio menú bajo las dos
// sin importar de App, que lo importa a él: eso sería un círculo.
export const ALTO_TABS = 40

export default function Navbar({ onLoginClick }) {
  const { session, logout, branchName } = useAuth()
  const [query, setQuery]   = useState('')
  const cartCount = 3

  return (
    <nav className="sticky top-0 z-50"
      style={{ backgroundColor: '#ffffff', borderBottom: '1px solid rgba(16,22,25,0.05)' }}>
      {/* Altura fija y exportada: la barra de pestañas se ancla justo debajo
          con `top: ALTO_BARRA`. Si se cambia aquí y allí no, se encima. */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center gap-3 sm:gap-4"
        style={{ height: ALTO_BARRA }}>

        {/* Solo el logotipo. Ya trae el nombre dentro, así que repetirlo al
            lado duplicaba la marca y le quitaba peso. */}
        <a href="#" style={{ textDecoration: 'none', flexShrink: 0, display: 'block' }}>
          <img src="/logo-istuffs.png" alt="iStuffs Custom Cases"
            style={{ height: 34, width: 'auto', display: 'block' }} />
        </a>

        {/* Search */}
        <div className="flex-1 relative">
          <span className="absolute left-3 top-1/2 pointer-events-none" style={{ color: 'rgba(0,0,0,0.3)', transform: 'translateY(-50%)' }}>
            <SearchIcon />
          </span>
          <input type="text" placeholder="Buscar fundas, accesorios, modelos..."
            value={query} onChange={e => setQuery(e.target.value)}
            className="w-full text-sm outline-none transition-all"
            style={{ backgroundColor: 'rgba(0,0,0,0.035)', border: '1px solid rgba(16,22,25,0.05)', borderRadius: '999px', padding: '6px 14px 6px 32px', fontSize: 13, color: '#101619' }}
            onFocus={e => { e.target.style.borderColor = 'rgba(0,188,242,0.5)'; e.target.style.backgroundColor = 'rgba(0,188,242,0.03)' }}
            onBlur={e => { e.target.style.borderColor = 'rgba(16,22,25,0.05)'; e.target.style.backgroundColor = 'rgba(0,0,0,0.04)' }}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1" style={{ flexShrink: 0 }}>
          <button className="relative p-1.5 rounded-full transition-colors"
            style={{ color: 'rgba(0,0,0,0.55)', background: 'none', border: 'none', cursor: 'pointer' }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(16,22,25,0.05)'; e.currentTarget.style.color = '#0A0A0A' }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'rgba(0,0,0,0.55)' }}>
            <CartIcon />
            <span className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full text-white flex items-center justify-center font-bold"
              style={{ fontSize: 9, background: 'linear-gradient(135deg, #D51A7A, #FF6B1A)' }}>{cartCount}</span>
          </button>

          {/* Login / sesión activa */}
          {session ? (
            <div className="flex items-center gap-2 ml-1">
              {/* Indicador de sesión */}
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                style={{ backgroundColor: 'rgba(0,188,242,0.08)', border: '1px solid rgba(0,188,242,0.2)' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#00BCF2', display: 'inline-block' }} />
                <span className="text-xs font-semibold" style={{ color: '#007aad' }}>
                  {branchName}
                </span>
              </div>
              {/* Botón logout */}
              <button
                onClick={logout}
                title="Cerrar sesión"
                className="flex items-center gap-1.5 p-1.5 rounded-full transition-colors text-xs font-medium"
                style={{ color: 'rgba(0,0,0,0.45)', background: 'none', border: 'none', cursor: 'pointer' }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(213,26,122,0.07)'; e.currentTarget.style.color = '#D51A7A' }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'rgba(0,0,0,0.45)' }}>
                <LogoutIcon />
              </button>
            </div>
          ) : (
            <button
              onClick={onLoginClick}
              className="flex items-center gap-1.5 ml-1 transition-all"
              style={{ padding: '5px 13px', fontSize: 13, fontWeight: 500, backgroundColor: 'rgba(16,22,25,0.045)', border: '1px solid rgba(16,22,25,0.05)', borderRadius: '999px', color: 'rgba(0,0,0,0.6)', cursor: 'pointer' }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(16,22,25,0.05)'; e.currentTarget.style.color = '#0A0A0A' }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(16,22,25,0.05)'; e.currentTarget.style.color = 'rgba(0,0,0,0.6)' }}>
              <UserIcon />
              <span className="hidden sm:block">Sucursales</span>
            </button>
          )}
        </div>
      </div>
    </nav>
  )
}
