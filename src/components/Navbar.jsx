import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

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
export const ALTO_BARRA = 60

// Alto de la barra de pestañas que va debajo de ésta. Vive aquí y no en App
// para que el panel de administración pueda pegar su propio menú bajo las dos
// sin importar de App, que lo importa a él: eso sería un círculo.
export const ALTO_TABS = 40

export default function Navbar({ onLoginClick }) {
  const { session, logout, branchName } = useAuth()

  return (
    <nav className="sticky top-0 z-50"
      /* Blanco sobre el fondo de la página: eso ya separa. La línea de un
         pixel que había debajo era la cuarta de la página y ninguna hacía
         falta. */
      style={{ backgroundColor: '#ffffff' }}>
      {/* Altura fija y exportada: la barra de pestañas se ancla justo debajo
          con `top: ALTO_BARRA`. Si se cambia aquí y allí no, se encima. */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center gap-3 sm:gap-4"
        style={{ height: ALTO_BARRA }}>

        {/* Solo el logotipo. Ya trae el nombre dentro, así que repetirlo al
            lado duplicaba la marca y le quitaba peso. */}
        <a href="#" style={{ textDecoration: 'none', flexShrink: 0, display: 'block' }}>
          <img src="/logo-istuffs.png" alt="iStuffs Custom Cases"
            style={{ height: 40, width: 'auto', display: 'block' }} />
        </a>

        {/* Un hueco en vez del buscador. El de aquí se quitó: el inventario
            tiene el suyo, dentro de la pantalla donde se busca, y tener dos
            campos que hacen lo mismo obligaba a adivinar cuál usar. */}
        <div className="flex-1" />

        {/* Un carrito con un «3» encima que no contaba nada: ni había
            pedido ni se podía abrir. Un número inventado en la barra es peor
            que no tener barra. Fuera hasta que el pedido exista de verdad. */}
        <div className="flex items-center gap-1" style={{ flexShrink: 0 }}>
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
