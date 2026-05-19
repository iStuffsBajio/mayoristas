import { useState } from 'react'
import { AuthProvider } from './context/AuthContext'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import InventarioSemanal from './components/InventarioSemanal'
import InventoryGrid from './components/InventoryGrid'
import Personalizer from './components/Personalizer'
import Footer from './components/Footer'
import LoginModal from './components/LoginModal'

function AppContent() {
  const [showLogin, setShowLogin] = useState(false)

  return (
    <div className="bg-white min-h-screen font-sans" style={{ color: '#0A0A0A' }}>
      <Navbar onLoginClick={() => setShowLogin(true)} />
      <main>
        <Hero />
        <InventarioSemanal onLoginClick={() => setShowLogin(true)} />
        <InventoryGrid />
        <Personalizer />
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
