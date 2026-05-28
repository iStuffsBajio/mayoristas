import { useState } from 'react'
import { AuthProvider } from './context/AuthContext'
import { SiteConfigProvider, useSiteConfig } from './context/SiteConfigContext'
import { useAuth } from './context/AuthContext'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
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

  return (
    <div style={{ borderBottom: '1px solid rgba(0,0,0,0.08)', backgroundColor: '#fff', position: 'sticky', top: 57, zIndex: 40 }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex gap-1 overflow-x-auto">
        {visibles.map(tab => {
          const isActive = active === tab.id
          return (
            <button key={tab.id} onClick={() => onChange(tab.id)}
              className="flex items-center gap-2 px-5 py-3.5 text-sm font-semibold transition-all relative whitespace-nowrap"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: isActive ? (tab.id === 'admin' ? '#D51A7A' : '#00BCF2') : 'rgba(0,0,0,0.45)', borderBottom: isActive ? `2px solid ${tab.id === 'admin' ? '#D51A7A' : '#00BCF2'}` : '2px solid transparent', marginBottom: -1, flexShrink: 0 }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = '#0A0A0A' }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = 'rgba(0,0,0,0.45)' }}>
              <span>{tab.emoji}</span>
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

  return (
    <div className="bg-white min-h-screen font-sans" style={{ color: '#0A0A0A' }}>
      <Navbar onLoginClick={() => setShowLogin(true)} />
      <TabBar active={safeTab} onChange={setActiveTab} />
      <main>
        {safeTab === 'inventario'  && <><Hero /><InventarioSemanal onLoginClick={() => setShowLogin(true)} /></>}
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
