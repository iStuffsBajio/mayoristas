import { useState } from 'react'
import { ALTO_BARRA, ALTO_TABS } from './Navbar'
import { useAuth } from '../context/AuthContext'
import { BotonSeccion } from './AdminPanel'
import SurtidoPanel from './SurtidoPanel'
import RevisarPanel from './RevisarPanel'
import MovimientoPanel from './MovimientoPanel'

/**
 * Lo que ve una sucursal con su sesión.
 *
 * Hasta ahora, entrar con la contraseña de una plaza no abría ninguna
 * pantalla: el panel era sólo de administración y lo demás era la página
 * pública. Pero la cola de revisión la contestan ellos —son quienes saben si
 * un código de su caja sobra o si el nombre está mal escrito—, y pedirles que
 * lo digan por teléfono para que alguien más lo teclee es perder justo el dato
 * que vale.
 *
 * Son dos secciones, no el panel entero:
 *
 *   · **Revisar** — la misma cola, con las mismas respuestas. Lo que marcan
 *     aquí lo ve administración, y al revés.
 *   · **Surtido** — lo que les toca recibir, abierto ya en su plaza.
 *
 * Fuera quedan ventas, personal, compras de bodega y la configuración del
 * sitio: no son suyas. El backend no se fía de esto —comprueba la sesión en
 * cada petición—, esto sólo evita enseñar puertas que no se pueden abrir.
 */
const SECCIONES_TIENDA = [
  { id: 'revisar', icono: '🔍', titulo: 'Revisar', sub: 'Códigos y nombres, uno a uno' },
  { id: 'surtido', icono: '🚚', titulo: 'Surtido', sub: 'Lo que te toca recibir' },
]

/**
 * Bodega no es una tienda, y enseñarle lo mismo sería un error de bulto: «lo
 * que te toca recibir» es exactamente lo contrario de su trabajo.
 *
 * Lo suyo es al revés —qué mandar a cada plaza y qué comprar al proveedor— y
 * es quien registra las salidas, que ya le deja hacer `puedeSurtir`.
 */
const SECCIONES_BODEGA = [
  { id: 'surtido', icono: '🚚', titulo: 'Surtir', sub: 'Qué mandar a cada tienda, y registrarlo' },
  // «Comprar» estuvo aquí y se quitó: bodega NO compra, sólo surte. Tener
  // ahí una sección de compras al proveedor era enseñar una decisión que no
  // es suya. En su sitio va lo que sí necesita antes de armar una caja.
  { id: 'movimiento', icono: '📈', titulo: 'Qué se mueve', sub: 'Lo que vuela y lo que sobra, por tienda' },
  { id: 'revisar', icono: '🔍', titulo: 'Revisar', sub: 'Códigos y nombres, uno a uno' },
]

export default function SucursalPanel() {
  const { session, branchName } = useAuth()
  const plaza = session?.branch ?? null
  const esBodega = plaza === 'bodega'

  const SECCIONES = esBodega ? SECCIONES_BODEGA : SECCIONES_TIENDA
  const [seccion, setSeccion] = useState(SECCIONES[0].id)

  return (
    <div className="mx-auto w-full" style={{ maxWidth: 1344, padding: '0 var(--marco) 60px' }}>
      <header className="sucursal-cabecera">
        <h2>{branchName}</h2>
        <p>
          {esBodega
            ? 'Lo que registres aquí se comprueba solo contra el respaldo de la tienda que lo recibe.'
            : 'Lo que marques aquí lo ve administración al momento.'}
        </p>
      </header>

      {/* El mismo menú que el panel de administración, con dos entradas. El
          `top` suma las dos barras de arriba, igual que allí. */}
      <div style={{
        position: 'sticky', top: ALTO_BARRA + ALTO_TABS, zIndex: 30,
        marginBottom: 18,
        borderBottom: '1px solid rgba(16,22,25,0.06)',
        backgroundColor: 'rgba(255,255,255,0.88)',
        backdropFilter: 'saturate(180%) blur(14px)',
        WebkitBackdropFilter: 'saturate(180%) blur(14px)',
      }}>
        {/* Sin `justify-center`: centrado y con desbordamiento, el navegador
            recorta por los dos lados y a la parte de la IZQUIERDA no se llega
            ni arrastrando -desaparecían Dashboard y Ventas, que son las dos
            primeras, y nadie encontraba la sección-. El centrado se hace con
            márgenes automáticos en el CSS: centra cuando caben y deja llegar a
            las dos puntas cuando no. */}
        <nav className="admin-menu-barra flex gap-1 overflow-x-auto"
             style={{ scrollbarWidth: 'none' }}>
          {SECCIONES.map(s => (
            <BotonSeccion key={s.id} s={s} activa={seccion === s.id} onClick={() => setSeccion(s.id)} />
          ))}
        </nav>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
        {seccion === 'revisar' && <RevisarPanel />}
        {/* Bodega entra sin plaza fija: tiene que poder elegir a cuál manda.
            Una tienda entra ya en la suya, que es lo único que le incumbe. */}
        {seccion === 'surtido' && (
          <SurtidoPanel ambito="sucursales" plaza={esBodega ? null : plaza} />
        )}
        {seccion === 'movimiento' && esBodega && <MovimientoPanel />}
      </div>
    </div>
  )
}
