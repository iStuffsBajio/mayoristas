import { useState } from 'react'
import { AuthProvider } from './context/AuthContext'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import InventarioSemanal from './components/InventarioSemanal'
import Personalizer from './components/Personalizer'
import PedidosStikers from './components/PedidosStikers'
import Footer from './components/Footer'
import LoginModal from './components/LoginModal'

const TABS = [
  { id: 'inventario',  label: 'Consulta de Inventario',  emoji: '📋' },
  { id: 'personaliza', label: 'Diseña tu Funda',         emoji: '📱' },
  { id: 'stikers',     label: 'Pedidos de Stickers',     emoji: '🏷️' },
]

function TabBar({ active, onChange }) {
  return (
    <div style={{ borderBottom: '1px solid rgba(0,0,0,0.08)', backgroundColor: '#fff', position: 'sticky', top: 57, zIndex: 40 }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex gap-1">
        {TABS.map(tab => {
          const isActive = active === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className="flex items-center gap-2 px-5 py-3.5 text-sm font-semibold transition-all relative"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: isActive ? '#00BCF2' : 'rgba(0,0,0,0.45)',
                borderBottom: isActive ? '2px solid #00BCF2' : '2px solid transparent',
                marginBottom: -1,
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = '#0A0A0A' }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = 'rgba(0,0,0,0.45)' }}
            >
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
  const [activeTab, setActiveTab]  = useState('inventario')

  return (
    <div className="bg-white min-h-screen font-sans" style={{ color: '#0A0A0A' }}>
      <Navbar onLoginClick={() => setShowLogin(true)} />
      <TabBar active={activeTab} onChange={setActiveTab} />
      <main>
        {activeTab === 'inventario' && (
          <>
            <Hero />
            <InventarioSemanal onLoginClick={() => setShowLogin(true)} />
          </>
        )}
        {activeTab === 'personaliza' && <Personalizer />}
        {activeTab === 'stikers'     && <PedidosStikers />}
      </main>
      <Footer />
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
