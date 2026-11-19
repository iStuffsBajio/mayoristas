import { useMemo, useState } from 'react'
import { CLASE_A, CLASE_B } from '../lib/clases'
import { TEMAS } from './Diseno'

/**
 * Agotados por ubicación: barras apiladas, un renglón por plaza.
 *
 * La forma la decide el trabajo del dato: comparar magnitudes entre categorías
 * y, dentro de cada una, cómo se reparte. Eso son barras apiladas.
 *
 * ── El color ────────────────────────────────────────────────────────────────
 *
 * A, B y C no son tres cosas distintas: son la MISMA cosa en tres grados. Por
 * eso van en un solo tono del magenta de la marca, de oscuro a claro, y no en
 * tres colores. Un arcoíris aquí diría que son categorías independientes.
 *
 * Los tres pasos salieron del validador de la guía de visualización, no de
 * mirarlos. Separación para vista normal 17.3 y para daltonismo 13.6, las dos
 * por encima del mínimo.
 *
 * El tono claro se queda en 2.68:1 contra el blanco, por debajo del 3:1. Se
 * intentó oscurecerlo y entonces B y C se volvían indistinguibles, que es un
 * fallo peor y que no se puede compensar. Como el aviso de contraste SÍ se
 * compensa, esta gráfica lleva obligatoriamente la cifra escrita en cada
 * barra y una tabla debajo. Si se quitan, el gráfico deja de ser legible.
 */

export const TONOS = { A: '#73104a', B: '#bd2278', C: '#e578ad' }

export const ROTULO = {
  A: `Clase A · ${CLASE_A}+ piezas al mes`,
  B: `Clase B · ${CLASE_B} a ${CLASE_A} al mes`,
  C: `Clase C · menos de ${CLASE_B}`,
}

/**
 * `onElegir` hace la gráfica PULSABLE: la ubicación entera desde su nombre, o
 * una clase desde su tramo. Lo pidió el dueño el 2026-11-19: «veo cuántos de
 * cada clase pero en dónde está el desglose». Una barra que dice 55 sin dejar
 * ver cuáles son los 55 es un número para mirar, no para trabajar.
 * `elegido` ({ slug, clase }) marca lo que está puesto; volver a pulsarlo lo
 * quita.
 */
export default function BarrasAgotados({ datos, titulo = 'Agotados por ubicación', elegido = null, onElegir = null }) {
  const [sobre, setSobre] = useState(null)
  const [tabla, setTabla] = useState(false)

  // Todas las barras se escalan contra el mismo máximo, o comparar no
  // significa nada. Se redondea hacia arriba para que la escala no cambie de
  // sitio con cada actualización.
  const tope = useMemo(() => {
    const max = Math.max(0, ...(datos ?? []).map(d => d.total))
    return Math.max(10, Math.ceil(max / 10) * 10)
  }, [datos])

  if (!datos?.length) return null

  const hay = datos.some(d => d.total > 0)
  const pulsable = typeof onElegir === 'function'
  const elegir = (slug, clase = null) => {
    const igual = elegido?.slug === slug && (elegido?.clase ?? null) === clase
    onElegir(igual ? null : { slug, clase })
  }
  // Sin `font: inherit`: pisaría el tamaño de `.grafica-nombre` y el nombre
  // saldría más grande que en la gráfica sin pulsar.
  const boton = { border: 0, padding: 0, margin: 0, fontFamily: 'inherit', cursor: 'pointer', background: 'none', textAlign: 'left' }

  return (
    // Con la cabecera del tema «agotado» del diseño de la casa (`Diseno.jsx`):
    // en el tablero se distingue de un vistazo de lo que es venta o inventario.
    <figure className="grafica" style={{ padding: 0, overflow: 'hidden', border: '1px solid ' + TEMAS.agotado.borde, borderRadius: 20 }}>
      <figcaption style={{ background: TEMAS.agotado.suave, borderBottom: '1px solid ' + TEMAS.agotado.borde, padding: '10px 16px', margin: 0 }}>
        <h4 style={{ color: TEMAS.agotado.fuerte, fontSize: 13, fontWeight: 800, margin: 0 }}>{titulo}</h4>
        <p style={{ margin: '2px 0 0', fontSize: 11 }}>
          Modelos en cero, por clase de venta{pulsable && ' · pulsa una ubicación o un tramo para ver cuáles son'}
        </p>
      </figcaption>
      <div style={{ padding: '14px 16px' }}>

      {hay ? (
        <div className="grafica-filas">
          {datos.map(d => {
            const esta = elegido?.slug === d.slug
            // Lo que no está elegido se apaga, no desaparece: sigue haciendo
            // falta para comparar.
            const apagada = elegido && !esta
            return (
            <div className="grafica-fila" key={d.slug} data-fila-ubicacion={d.slug}
                 style={{ opacity: apagada ? 0.4 : 1, transition: 'opacity 160ms ease' }}>
              {pulsable
                ? <button type="button" className="grafica-nombre" data-ubicacion-agotados={d.slug}
                          aria-pressed={esta && !elegido?.clase}
                          title={`Ver los ${d.total} modelos en cero de ${d.nombre}`}
                          onClick={() => elegir(d.slug)}
                          style={{ ...boton, color: esta ? TEMAS.agotado.fuerte : undefined, fontWeight: esta ? 800 : undefined,
                                   textDecoration: 'underline', textDecorationColor: TEMAS.agotado.borde, textUnderlineOffset: 3 }}>
                    {d.nombre}
                  </button>
                : <span className="grafica-nombre">{d.nombre}</span>}

              <div className="grafica-pista" role={pulsable ? 'group' : 'img'}
                   aria-label={`${d.nombre}: ${d.total} modelos agotados — ${d.A} de clase A, ${d.B} de clase B, ${d.C} de clase C`}>
                {['A', 'B', 'C'].map(c => {
                  if (!(d[c] > 0)) return null
                  const estilo = {
                    width: `${(d[c] / tope) * 100}%`, background: TONOS[c],
                    // Con una clase elegida, las otras dos de la fila se apagan.
                    opacity: esta && elegido?.clase && elegido.clase !== c ? 0.3 : 1,
                  }
                  const sobreEsto = {
                    onMouseEnter: () => setSobre({ slug: d.slug, clase: c, n: d[c], nombre: d.nombre }),
                    onMouseLeave: () => setSobre(null),
                  }
                  return pulsable
                    ? <button type="button" key={c} className="grafica-tramo" data-tramo-agotados={`${d.slug}:${c}`}
                              aria-pressed={esta && elegido?.clase === c}
                              aria-label={`${d.nombre}, clase ${c}: ${d[c]} modelos`}
                              onClick={() => elegir(d.slug, c)} {...sobreEsto}
                              style={{ ...boton, ...estilo }} />
                    : <span key={c} className="grafica-tramo" style={estilo} {...sobreEsto} />
                })}
              </div>

              {/* La cifra escrita es obligatoria, no decorativa: es lo que
                  compensa el bajo contraste del tono más claro. */}
              <span className="grafica-cifra">{d.total}</span>
            </div>
            )
          })}
        </div>
      ) : (
        <p className="grafica-vacia">Ninguna ubicación tiene modelos en cero.</p>
      )}

      {sobre && (
        <p className="grafica-aviso">
          <span className="grafica-punto" style={{ background: TONOS[sobre.clase] }} />
          {sobre.nombre}: <strong>{sobre.n}</strong> {sobre.n === 1 ? 'modelo' : 'modelos'} de {ROTULO[sobre.clase].toLowerCase()}
        </p>
      )}

      <div className="grafica-pie">
        <ul className="grafica-leyenda">
          {['A', 'B', 'C'].map(c => (
            <li key={c}>
              <span className="grafica-punto" style={{ background: TONOS[c] }} />
              {ROTULO[c]}
            </li>
          ))}
        </ul>
        <button type="button" className="grafica-tabla-boton" onClick={() => setTabla(t => !t)}>
          {tabla ? 'Ocultar tabla' : 'Ver como tabla'}
        </button>
      </div>

      {/* La tabla no es un extra: es la otra mitad del remedio al contraste,
          y además es la forma de leer el dato sin depender del color. */}
      {tabla && (
        <table className="grafica-tabla">
          <thead>
            <tr>
              <th scope="col">Ubicación</th>
              <th scope="col">Clase A</th>
              <th scope="col">Clase B</th>
              <th scope="col">Clase C</th>
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            {datos.map(d => (
              <tr key={d.slug}>
                <th scope="row">{d.nombre}</th>
                <td>{d.A}</td><td>{d.B}</td><td>{d.C}</td>
                <td><strong>{d.total}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="grafica-nota">La barra se escala sobre {tope} modelos.</p>
      </div>
    </figure>
  )
}
