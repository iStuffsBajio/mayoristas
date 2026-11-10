// Las piezas del diseño de la casa: secciones con el color de su tema, cifras
// grandes y tablas como las de Inventarios.
//
// Nacieron en el corte semanal y el dueño las pidió para todo el panel el
// 2026-11-10: «se me hace muy intuitivo y muy fácil de comprender… tiene más
// cuerpo y puedo distinguir de mejor manera cada sección». Lo que hace que se
// lea así no es el adorno: cada cosa va en su caja, la caja dice de qué es por
// su color, y el mismo tema lleva el mismo color en todas las pestañas.
//
// Los temas —de qué habla una sección, no de qué color «queda bonito»—:
//
//   ventas azul · inventario verde azulado · agotado rosa · comprar morado
//   dinero verde · revisar/alerta ámbar · neutro tinta
//
// Y los conceptos del dinero del corte siguen en `coloresCaja.js`, de donde
// salen también estos colores: una sola paleta para todo.

import { COLORES, FONDO_CABECERA } from '../lib/coloresCaja'

export const TEMAS = {
  ventas:     COLORES.ventas,
  inventario: COLORES.electronico,
  agotado:    COLORES.comisiones,
  comprar:    COLORES.sueldo,
  dinero:     COLORES.entradas,
  alerta:     COLORES.alerta,
  neutro:     COLORES.caja,
}

const LINEA = '#D6E0E4'
const TINTA_SUAVE = '#4A5A61'
const TINTA_TENUE = '#8598A1'

const tema = t => (typeof t === 'string' ? TEMAS[t] ?? TEMAS.neutro : t ?? TEMAS.neutro)

/**
 * Una sección con el color de su tema: cabecera teñida con el título, la nota
 * y lo que vaya a la derecha (un total, un botón), y el contenido debajo.
 */
export function Seccion({ tema: t, titulo, sub, extra, children, sinRelleno = false, style, cuerpo, ...resto }) {
  const c = tema(t)
  return (
    <section {...resto} style={{ border: '1px solid ' + c.borde, borderRadius: 20, overflow: 'hidden', background: '#fff', minWidth: 0, ...style }}>
      {(titulo || extra) && (
        <header style={{
          background: c.suave, borderBottom: '1px solid ' + c.borde, padding: '10px 16px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        }}>
          <span style={{ minWidth: 0 }}>
            {titulo && <strong style={{ display: 'block', color: c.fuerte, fontSize: 13, fontWeight: 800 }}>{titulo}</strong>}
            {sub && <span style={{ display: 'block', fontSize: 11, color: TINTA_SUAVE, marginTop: 2, lineHeight: 1.45 }}>{sub}</span>}
          </span>
          {extra && <span style={{ color: c.fuerte, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{extra}</span>}
        </header>
      )}
      <div style={sinRelleno ? cuerpo : { padding: '12px 16px', ...cuerpo }}>{children}</div>
    </section>
  )
}

/** Una cifra grande con el color de su tema: lo primero que se lee. */
export function Cifra({ tema: t, titulo, valor, sub, style, ...resto }) {
  const c = tema(t)
  return (
    <div {...resto} style={{
      flex: '1 1 160px', minWidth: 140, padding: '10px 14px', borderRadius: 16,
      background: c.suave, borderLeft: '4px solid ' + c.fuerte, ...style,
    }}>
      {titulo && <div style={{ fontSize: 11, color: TINTA_SUAVE, fontWeight: 600 }}>{titulo}</div>}
      <div style={{ fontSize: 20, fontWeight: 800, color: c.fuerte, fontVariantNumeric: 'tabular-nums', lineHeight: 1.25 }}>{valor}</div>
      {sub && <div style={{ fontSize: 10.5, color: TINTA_TENUE, marginTop: 2, lineHeight: 1.4 }}>{sub}</div>}
    </div>
  )
}

/** Una fila de cifras que se acomoda sola. */
export const Cifras = ({ children, style, ...resto }) => (
  <div {...resto} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', ...style }}>{children}</div>
)

/** El contenedor de tabla de la casa, el de Inventarios. */
export const CajaDeTabla = ({ children, alto, style }) => (
  <div style={{ border: '1px solid ' + LINEA, borderRadius: 14, overflow: 'hidden', background: '#fff', ...style }}>
    <div style={{ overflowX: 'auto', ...(alto ? { maxHeight: alto, overflowY: 'auto' } : {}) }}>{children}</div>
  </div>
)

export { FONDO_CABECERA }
