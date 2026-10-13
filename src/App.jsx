import { useState } from 'react'
import { AuthProvider } from './context/AuthContext'
import { SiteConfigProvider, useSiteConfig } from './context/SiteConfigContext'
import { useAuth } from './context/AuthContext'
import Navbar, { ALTO_BARRA, ALTO_TABS } from './components/Navbar'
import Hero from './components/Hero'
import Mosaico from './components/Mosaico'
import InventarioSemanal from './components/InventarioSemanal'
import Personalizer from './components/Personalizer'
import PedidosStikers from './components/PedidosStikers'
import AdminPanel from './components/AdminPanel'
import Footer from './components/Footer'
import LoginModal from './components/LoginModal'

// ── Pestaña con relieve ──────────────────────────────────────────────────────
//
// El volumen sale de tres capas, no de una sombra suelta:
//   · un degradado vertical, claro arriba y oscuro abajo, que simula la luz;
//   · una línea blanca por dentro del borde superior, que es el brillo del
//     canto;
//   · una sombra por fuera, abajo, que la despega del fondo.
// Al presionar se invierte: la sombra se mete adentro y el botón baja un
// pixel. Son los colores de la marca, sólo que con cuerpo.
const TONO = { admin: '#D51A7A', normal: '#0288AD' }

function Pestana({ tab, activa, onClick }) {
  const tono = tab.id === 'admin' ? TONO.admin : TONO.normal
  const grad = tab.id === 'admin'
    ? 'linear-gradient(180deg, #E8318C 0%, #D51A7A 55%, #B81266 100%)'
    : 'linear-gradient(180deg, #19C9F7 0%, #00BCF2 55%, #0098C4 100%)'

  const reposo = {
    background: activa ? grad : 'linear-gradient(180deg, #FFFFFF 0%, #F2F6F8 100%)',
    color: activa ? '#fff' : 'rgba(16,22,25,0.66)',
    border: '1px solid ' + (activa ? 'rgba(0,0,0,0.12)' : 'rgba(16,22,25,0.11)'),
    boxShadow: activa
      ? `inset 0 1px 0 rgba(255,255,255,0.42), 0 2px 5px ${tono}59, 0 1px 1px rgba(16,22,25,0.14)`
      : 'inset 0 1px 0 rgba(255,255,255,0.9), 0 1px 2px rgba(16,22,25,0.09)',
    transform: 'translateY(0)',
  }

  const aplicar = (el, e) => Object.assign(el.style, e)

  return (
    <button type="button" onClick={onClick}
      className="flex items-center gap-1.5 whitespace-nowrap"
      style={{
        ...reposo,
        padding: '0 15px', height: 28, borderRadius: 999,
        fontSize: 13, fontWeight: activa ? 650 : 500,
        cursor: 'pointer', flexShrink: 0,
        transition: 'transform .12s, box-shadow .12s, background .15s, color .15s',
        textShadow: activa ? '0 1px 1px rgba(0,0,0,0.18)' : 'none',
      }}
      onMouseEnter={e => aplicar(e.currentTarget, {
        transform: 'translateY(-1px)',
        boxShadow: activa
          ? `inset 0 1px 0 rgba(255,255,255,0.42), 0 4px 10px ${tono}6E, 0 1px 1px rgba(16,22,25,0.14)`
          : 'inset 0 1px 0 rgba(255,255,255,0.95), 0 3px 7px rgba(16,22,25,0.13)',
        color: activa ? '#fff' : '#101619',
      })}
      onMouseLeave={e => aplicar(e.currentTarget, reposo)}
      onMouseDown={e => aplicar(e.currentTarget, {
        transform: 'translateY(1px)',
        boxShadow: activa
          ? `inset 0 2px 4px rgba(0,0,0,0.26), 0 1px 1px ${tono}3D`
          : 'inset 0 2px 4px rgba(16,22,25,0.16)',
      })}
      onMouseUp={e => aplicar(e.currentTarget, reposo)}>
      <span style={{ fontSize: 13.5, lineHeight: 1 }}>{tab.emoji}</span>
      <span>{tab.label}</span>
    </button>
  )
}

function TabBar({ active, onChange }) {
  const { config } = useSiteConfig()
  const { isAdmin } = useAuth()
  const { tabs } = config

  const visibles = [
    tabs.inventario?.visible !== false && { id: 'inventario', label: tabs.inventario?.label || 'Consulta de Inventario', emoji: tabs.inventario?.emoji || '📋' },
    tabs.personaliza?.visible !== false && { id: 'personaliza', label: tabs.personaliza?.label || 'Diseña tu Funda',        emoji: tabs.personaliza?.emoji || '📱' },
    tabs.stikers?.visible     !== false && { id: 'stikers',     label: tabs.stikers?.label     || 'Pedidos de Stickers',    emoji: tabs.stikers?.emoji     || '🏷️' },
    isAdmin && { id: 'admin', label: 'Panel Admin', emoji: '⚙️' },
  ].filter(Boolean)

  // Pestañas con relieve. El plano anterior pesaba tan poco que no se leían
  // como botones; esto les da cuerpo sin cambiar la paleta: el degradado de
  // marca en la activa, y en las demás un volumen claro hecho con una luz
  // arriba y una sombra abajo. El relieve sube al pasar el ratón y se hunde
  // al presionar, que es lo que hace que una cosa se sienta botón.
  return (
    <div style={{
      borderBottom: '1px solid rgba(16,22,25,0.07)',
      backgroundColor: 'rgba(255,255,255,0.86)',
      backdropFilter: 'saturate(180%) blur(14px)',
      WebkitBackdropFilter: 'saturate(180%) blur(14px)',
      position: 'sticky', top: ALTO_BARRA, zIndex: 40,
    }}>
      {/* El alto se fija con la constante, no se deja al azar del relleno: el
          panel de administración pega su menú justo debajo contando con ella. */}
      <div className="max-w-6xl mx-auto px-4 flex gap-2 justify-center items-center overflow-x-auto"
           style={{ height: ALTO_TABS }}>
        {visibles.map(tab => <Pestana key={tab.id} tab={tab} activa={active === tab.id} onClick={() => onChange(tab.id)} />)}
      </div>
    </div>
  )
}

function AppContent() {
  const [showLogin, setShowLogin] = useState(false)
  const [activeTab, setActiveTab] = useState('inventario')
  const { isAdmin } = useAuth()
  const { config } = useSiteConfig()

  // If active tab was hidden by admin, switch to first visible
  const tabVisible = (id) => {
    if (id === 'admin') return isAdmin
    return config.tabs[id]?.visible !== false
  }
  const safeTab = tabVisible(activeTab) ? activeTab : 'inventario'

  // Navega a una pestaña y deja la vista arriba. Si se pasa un ancla, baja a él.
  const irA = (tab, ancla) => {
    setActiveTab(tab)
    requestAnimationFrame(() => {
      const el = ancla && document.getElementById(ancla)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      else window.scrollTo({ top: 0, behavior: 'smooth' })
    })
  }

  return (
    // Sin fondo propio: este contenedor cubre toda la pantalla y su blanco
    // tapaba el degradado de marca que vive en el body.
    <div className="min-h-screen font-sans" style={{ color: '#101619' }}>
      <Navbar onLoginClick={() => setShowLogin(true)} />
      <TabBar active={safeTab} onChange={setActiveTab} />
      <main>
        {safeTab === 'inventario' && (
          <>
            <Hero onExplorar={() => irA('inventario', 'tabla-inventario')}
                  onPersonalizar={() => irA('personaliza')} />
            <Mosaico onIr={irA} />
            <InventarioSemanal onLoginClick={() => setShowLogin(true)} />
          </>
        )}
        {safeTab === 'personaliza' && <Personalizer />}
        {safeTab === 'stikers'     && <PedidosStikers />}
        {safeTab === 'admin'       && isAdmin && <AdminPanel />}
      </main>
      <Footer />
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <SiteConfigProvider>
        <AppContent />
      </SiteConfigProvider>
    </AuthProvider>
  )
}
