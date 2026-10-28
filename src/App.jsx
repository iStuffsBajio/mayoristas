import { useState } from 'react'
import { useEntradas } from './lib/entradas'
import { AuthProvider } from './context/AuthContext'
import { SiteConfigProvider, useSiteConfig } from './context/SiteConfigContext'
import { useAuth } from './context/AuthContext'
import Navbar, { ALTO_BARRA, ALTO_TABS } from './components/Navbar'
import Escenario from './components/Escenario'
import Oficios from './components/Oficios'
import Personalizer from './components/Personalizer'
import PedidosStikers from './components/PedidosStikers'
import AdminPanel from './components/AdminPanel'
import SucursalPanel from './components/SucursalPanel'
import Footer from './components/Footer'
import LoginModal from './components/LoginModal'

// ── Pestaña ──────────────────────────────────────────────────────────────────
//
// La letra lleva el degradado del logotipo impreso -naranja, magenta, morado,
// azul y cian- y el botón no se rellena de color: la que está abierta se dice
// con un trazo, no con un fondo. Antes la activa era una píldora de color
// sólido con la letra en blanco, y el degradado de la marca sólo aparecía en
// el titular.
//
// El texto va en su propio <span> porque hacen falta los dos fondos a la vez:
// uno recortado a la letra y otro al borde. En el mismo elemento no caben.
//
// El hundido al presionar (scale .97) se queda: es lo que hace que una cosa
// se sienta pulsada, y cuesta nada.

function Pestana({ tab, activa, onClick }) {
  return (
    <button type="button" onClick={onClick}
            className={'pestana' + (activa ? ' activa' : '')}
            aria-current={activa ? 'page' : undefined}>
      <span className="pestana-texto">{tab.label}</span>
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
    tabs.inventario?.visible !== false && { id: 'inventario', label: tabs.inventario?.label || 'Mayorista · Consulta' },
    tabs.personaliza?.visible !== false && { id: 'personaliza', label: tabs.personaliza?.label || 'Cliente · Diseña tu funda' },
    tabs.stikers?.visible     !== false && { id: 'stikers',     label: tabs.stikers?.label     || 'Cliente · Stickers' },
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
        {/* La tabla «Inventario de la semana» vivía aquí abajo y se quitó:
            preguntaba lo mismo que la portada -plaza y modelo- y la portada
            ya contesta con la foto, la plaza y las piezas. El componente
            sigue en el repositorio; volver a ponerlo es esta línea.

            Con él se fue el botón de cargar el Excel a mano, que era de las
            sucursales y no de los mayoristas. Hoy el inventario se publica
            solo cuatro veces al día; si hace falta la carga manual, su sitio
            es «Mi panel», no la página pública. */}
        {safeTab === 'inventario' && (
          <>
            <Escenario onIr={irA} />
            <Oficios onIr={irA} />
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
