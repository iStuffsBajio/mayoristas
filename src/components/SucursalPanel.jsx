import { useState } from 'react'
import { ALTO_BARRA, ALTO_TABS } from './Navbar'
import { useAuth } from '../context/AuthContext'
import { BotonSeccion } from './AdminPanel'
import SurtidoPanel from './SurtidoPanel'
import RevisarPanel from './RevisarPanel'

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
const SECCIONES = [
  { id: 'revisar', icono: '🔍', titulo: 'Revisar', sub: 'Códigos y nombres, uno a uno' },
  { id: 'surtido', icono: '🚚', titulo: 'Surtido', sub: 'Lo que te toca recibir' },
]

export default function SucursalPanel() {
  const { session, branchName } = useAuth()
  const [seccion, setSeccion] = useState('revisar')
  const plaza = session?.branch ?? null

  return (
    <div className="mx-auto w-full" style={{ maxWidth: 1344, padding: '0 var(--marco) 60px' }}>
      <header className="sucursal-cabecera">
        <h2>{branchName}</h2>
        <p>Lo que marques aquí lo ve administración al momento.</p>
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
        <nav className="admin-menu-barra flex gap-0.5 justify-center overflow-x-auto"
             style={{ scrollbarWidth: 'none' }}>
          {SECCIONES.map(s => (
            <BotonSeccion key={s.id} s={s} activa={seccion === s.id} onClick={() => setSeccion(s.id)} />
          ))}
        </nav>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
        {seccion === 'revisar' && <RevisarPanel />}
        {seccion === 'surtido' && <SurtidoPanel ambito="sucursales" plaza={plaza} />}
      </div>
    </div>
  )
}
