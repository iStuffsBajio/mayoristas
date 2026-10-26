import { useState } from 'react'
import { useEntradas } from './lib/entradas'
import { AuthProvider } from './context/AuthContext'
import { SiteConfigProvider, useSiteConfig } from './context/SiteConfigContext'
import { useAuth } from './context/AuthContext'
import Navbar, { ALTO_BARRA, ALTO_TABS } from './components/Navbar'
import Escenario from './components/Escenario'
import Oficios from './components/Oficios'
import InventarioSemanal from './components/InventarioSemanal'
import Personalizer from './components/Personalizer'
import PedidosStikers from './components/PedidosStikers'
import AdminPanel from './components/AdminPanel'
import SucursalPanel from './components/SucursalPanel'
import Footer from './components/Footer'
import LoginModal from './components/LoginModal'

// ── Pestaña ──────────────────────────────────────────────────────────────────
//
// Plana a propósito. La versión anterior era una píldora con degradado de
// marca, relieve y un emoji delante; se veía como un botón de otra década y
// peleaba con el resto de la página. Aquí el estado activo se dice con una
// sola cosa -tinta llena y una barra debajo- y lo demás es texto.
//
// El hundido al presionar (scale .97) se queda: es lo que hace que una cosa
// se sienta pulsada, y cuesta nada.

function Pestana({ tab, activa, onClick }) {
  return (
    <button type="button" onClick={onClick}
            className={'pestana' + (activa ? ' activa' : '')}
            aria-current={activa ? 'page' : undefined}>
      {tab.label}
    </button>
  )
}

function TabBar({ active, onChange }) {
  const { config } = useSiteConfig()
  const { isAdmin, session } = useAuth()
  // Una sucursal con sesion tiene su propia pantalla: contesta la cola de
  // revision y mira su surtido. Antes, entrar con su contrasena no abria nada.
  const esSucursal = !!session?.branch && !isAdmin
  const { tabs } = config

  const visibles = [
    tabs.inventario?.visible !== false && { id: 'inventario', label: tabs.inventario?.label || 'Inventario' },
    tabs.personaliza?.visible !== false && { id: 'personaliza', label: tabs.personaliza?.label || 'Diseña tu funda' },
    tabs.stikers?.visible     !== false && { id: 'stikers',     label: tabs.stikers?.label     || 'Stickers' },
    isAdmin && { id: 'admin', label: 'Panel Admin' },
    esSucursal && { id: 'sucursal', label: 'Mi panel' },
  ].filter(Boolean)

  return (
    <div className="barra-pestanas" style={{ top: ALTO_BARRA }}>
      {/* El alto se fija con la constante, no se deja al azar del relleno: el
          panel de administración pega su menú justo debajo contando con ella. */}
      <div className="barra-pestanas-dentro" style={{ height: ALTO_TABS }}>
        {visibles.map(tab => <Pestana key={tab.id} tab={tab} activa={active === tab.id} onClick={() => onChange(tab.id)} />)}
      </div>
    </div>
  )
}

function AppContent() {
  const [showLogin, setShowLogin] = useState(false)
  const [activeTab, setActiveTab] = useState('inventario')
  const { isAdmin, vencida, session } = useAuth()
  const { config } = useSiteConfig()

  // If active tab was hidden by admin, switch to first visible
  const tabVisible = (id) => {
    if (id === 'admin') return isAdmin
    if (id === 'sucursal') return !!session?.branch && !isAdmin
    return config.tabs[id]?.visible !== false
  }
  const safeTab = tabVisible(activeTab) ? activeTab : 'inventario'

  // Navega a una pestaña y deja la vista arriba. Si se pasa un ancla, baja a él.
  // Las entradas se vuelven a montar al cambiar de pestaña: el contenido es
  // otro y los observadores viejos ya no miran nada.
  useEntradas(safeTab)

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
    <div className="min-h-screen">
      <Navbar onLoginClick={() => setShowLogin(true)} />
      {/* Una sesión caducada se dice UNA vez y arriba, no la deja adivinar
          cada sección con su propio mensaje. Un token dura ocho horas. */}
      {vencida && (
        <div className="sesion-vencida" role="status">
          <span>Tu sesión expiró. Vuelve a iniciar sesión para ver el panel.</span>
          <button type="button" onClick={() => setShowLogin(true)}>Iniciar sesión</button>
        </div>
      )}

      <TabBar active={safeTab} onChange={setActiveTab} />
      <main>
        {safeTab === 'inventario' && (
          <>
            <Escenario onIr={irA} />
            <Oficios onIr={irA} />
            <InventarioSemanal onLoginClick={() => setShowLogin(true)} />
          </>
        )}
        {safeTab === 'personaliza' && <Personalizer />}
        {safeTab === 'stikers'     && <PedidosStikers />}
        {safeTab === 'admin'       && isAdmin && <AdminPanel />}
        {safeTab === 'sucursal'    && !isAdmin && session?.branch && <SucursalPanel />}
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
