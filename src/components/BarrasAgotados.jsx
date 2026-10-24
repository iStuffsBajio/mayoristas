import { useMemo, useState } from 'react'
import { CLASE_A, CLASE_B } from '../lib/clases'

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

const TONOS = { A: '#73104a', B: '#bd2278', C: '#e578ad' }

const ROTULO = {
  A: `Clase A · ${CLASE_A}+ piezas al mes`,
  B: `Clase B · ${CLASE_B} a ${CLASE_A} al mes`,
  C: `Clase C · menos de ${CLASE_B}`,
}

export default function BarrasAgotados({ datos, titulo = 'Agotados por ubicación' }) {
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

  return (
    <figure className="grafica">
      <figcaption>
        <h4>{titulo}</h4>
        <p>Modelos en cero, por clase de venta</p>
      </figcaption>

      {hay ? (
        <div className="grafica-filas">
          {datos.map(d => (
            <div className="grafica-fila" key={d.slug}>
              <span className="grafica-nombre">{d.nombre}</span>

              <div className="grafica-pista" role="img"
                   aria-label={`${d.nombre}: ${d.total} modelos agotados — ${d.A} de clase A, ${d.B} de clase B, ${d.C} de clase C`}>
                {['A', 'B', 'C'].map(c => d[c] > 0 && (
                  <span
                    key={c}
                    className="grafica-tramo"
                    style={{ width: `${(d[c] / tope) * 100}%`, background: TONOS[c] }}
                    onMouseEnter={() => setSobre({ slug: d.slug, clase: c, n: d[c], nombre: d.nombre })}
                    onMouseLeave={() => setSobre(null)}
                  />
                ))}
              </div>

              {/* La cifra escrita es obligatoria, no decorativa: es lo que
                  compensa el bajo contraste del tono más claro. */}
              <span className="grafica-cifra">{d.total}</span>
            </div>
          ))}
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
    </figure>
  )
}
