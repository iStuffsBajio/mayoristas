import { useState } from 'react'
import { AuthProvider } from './context/AuthContext'
import { SiteConfigProvider, useSiteConfig } from './context/SiteConfigContext'
import { useAuth } from './context/AuthContext'
import Navbar, { ALTO_BARRA } from './components/Navbar'
import Hero from './components/Hero'
import Mosaico from './components/Mosaico'
import InventarioSemanal from './components/InventarioSemanal'
import Personalizer from './components/Personalizer'
import PedidosStikers from './components/PedidosStikers'
import AdminPanel from './components/AdminPanel'
import Footer from './components/Footer'
import LoginModal from './components/LoginModal'

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

  // Barra fina y centrada, al estilo de la de Apple: pesa poco y deja que
  // mande el contenido. Antes era una fila de pestañas con subrayado grueso
  // alineada a la izquierda, que competía con el titular.
  return (
    <div style={{
      borderBottom: '1px solid rgba(16,22,25,0.06)',
      backgroundColor: 'rgba(255,255,255,0.82)',
      backdropFilter: 'saturate(180%) blur(14px)',
      WebkitBackdropFilter: 'saturate(180%) blur(14px)',
      position: 'sticky', top: ALTO_BARRA, zIndex: 40,
    }}>
      <div className="max-w-6xl mx-auto px-4 flex gap-1 justify-center overflow-x-auto">
        {visibles.map(tab => {
          const isActive = active === tab.id
          const tono = tab.id === 'admin' ? '#D51A7A' : '#0288AD'
          return (
            <button key={tab.id} onClick={() => onChange(tab.id)}
              className="flex items-center gap-1.5 whitespace-nowrap"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '11px 16px', fontSize: 13.5,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? tono : 'rgba(16,22,25,0.62)',
                flexShrink: 0, transition: 'color .15s',
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = '#101619' }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = 'rgba(16,22,25,0.62)' }}>
              <span style={{ fontSize: 14 }}>{tab.emoji}</span>
              <span>{tab.label}</span>
            </button>
          )
        })}
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
