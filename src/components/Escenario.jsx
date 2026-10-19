import { useEffect, useMemo, useRef, useState } from 'react'
import { inventarioJsonUrl } from '../lib/s3'
import { SUCURSALES_ACTIVAS } from '../lib/sucursales'
import { coincideCon } from '../lib/buscar'

/**
 * El escenario partido.
 *
 * La idea: en esta página, la funda que el cliente busca —con las existencias
 * que de verdad hay— es la mitad fija de la pantalla. La otra mitad se lee.
 *
 * Eso no es una composición bonita, es el negocio: el mayorista de dos calles
 * más allá no puede enseñarte su inventario de ahora mismo, te dice que
 * llames. Aquí la funda se queda quieta y el stock se mueve.
 *
 * Lo vivo: escribes un modelo y la pieza de la derecha cambia a ESA funda, con
 * lo que hay hoy en cada tienda. Sale del inventario real y de las 83 imágenes
 * de producto propias; sin JavaScript sigue siendo una lista legible.
 */

const PIEZA = '/mockups'

/** Lo que no es funda no tiene mockup y no entra al escenario. */
const SIN_FUNDA = /MICA|HIDROGEL|STIKER|STICKER|PAQUETE|CINTA|HOJA/i

// Los marcados `vacio` salieron del PSD como una silueta blanca sin contorno
// ni cámara. Se saltan: una mancha con un nombre debajo no enseña nada.

export default function Escenario({ onIr }) {
  const [piezas, setPiezas]   = useState([])
  const [stock, setStock]     = useState({})
  const [busca, setBusca]     = useState('')
  const [elegida, setElegida] = useState(null)
  const campoRef = useRef(null)

  // El índice de mockups y el inventario de cada tienda. Si algo falla, la
  // sección sigue en pie con lo que haya: nunca se queda en blanco.
  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const r = await fetch(`${PIEZA}/indice.json`, { cache: 'no-store' })
        const j = await r.json()
        if (vivo) setPiezas((j.mockups ?? []).filter(m => !m.vacio && !SIN_FUNDA.test(m.nombre)))
      } catch { /* sin índice, el escenario enseña la pieza por defecto */ }

      const porPlaza = {}
      await Promise.all(SUCURSALES_ACTIVAS.map(async s => {
        try {
          const r = await fetch(`${inventarioJsonUrl(s.slug)}?t=${Date.now()}`, { cache: 'no-store' })
          const j = await r.json()
          for (const p of j.productos ?? []) {
            const c = String(p.Codigo ?? '').trim()
            if (!c) continue
            ;(porPlaza[c] ??= {})[s.slug] = Number(p.Existencia) || 0
          }
        } catch { /* una plaza sin publicar no detiene a las demás */ }
      }))
      if (vivo) setStock(porPlaza)
    })()
    return () => { vivo = false }
  }, [])

  const resultados = useMemo(() => {
    if (!busca.trim()) return []
    return piezas.filter(coincideCon(busca, m => [m.nombre, m.codigo])).slice(0, 6)
  }, [piezas, busca])

  // La pieza en escena: la buscada, la elegida, o la que más vende.
  const enEscena = elegida
    ?? resultados[0]
    ?? piezas[0]
    ?? { codigo: 'I13T', nombre: 'iPhone 13 TPU Case', piezas: 0 }

  const hay = stock[enEscena.codigo] ?? {}
  const total = Object.values(hay).reduce((a, b) => a + b, 0)

  const elegir = m => { setElegida(m); setBusca('') }

  return (
    <section className="escenario" aria-labelledby="titulo-escenario">

      {/* ── La mitad que se lee ───────────────────────────────────────── */}
      <div className="escenario-texto">
        <div className="escenario-dentro">
          <h1 id="titulo-escenario" className="rotulo escenario-titulo" data-entra>
            Fundas al mayoreo<br /><em>en el Bajío</em>
          </h1>

          <p className="escenario-entrada" data-entra style={{ '--retraso': '70ms' }}>
            Mira lo que hay ahora mismo en León, San Luis Potosí y Aguascalientes.
            El inventario se publica cuatro veces al día, así que puedes prometerle
            algo a tu cliente aunque la tienda ya haya cerrado.
          </p>

          {/* Lo vivo. Un campo, resultados reales, y la pieza cambia. */}
          <div className="escenario-buscar" data-entra style={{ '--retraso': '140ms' }}>
            <label htmlFor="busca-modelo" className="escenario-etiqueta">
              Busca tu modelo
            </label>
            <input
              id="busca-modelo"
              ref={campoRef}
              type="search"
              value={busca}
              onChange={e => { setBusca(e.target.value); setElegida(null) }}
              placeholder="a16, iphone 15, moto g24…"
              autoComplete="off"
            />
            {resultados.length > 0 && (
              <ul className="escenario-resultados">
                {resultados.map(m => (
                  <li key={m.codigo}>
                    <button type="button" onClick={() => elegir(m)}>
                      <span>{m.nombre}</span>
                      <span className="escenario-piezas">
                        {(stock[m.codigo] ? Object.values(stock[m.codigo]).reduce((a, b) => a + b, 0) : 0)} pz
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button type="button" className="escenario-accion" data-entra
                  style={{ '--retraso': '210ms' }}
                  onClick={() => onIr?.('inventario', 'tabla-inventario')}>
            Ver todas las existencias
          </button>
        </div>
      </div>

      {/* ── La mitad que no se mueve ──────────────────────────────────── */}
      <div className="escenario-campo">
        <div className="escenario-pieza">
          <img
            key={enEscena.codigo}
            src={`${PIEZA}/${enEscena.codigo}.png`}
            alt={`Funda para ${enEscena.nombre}`}
            width="900" height="1880"
            onError={e => { e.currentTarget.style.visibility = 'hidden' }}
          />
        </div>

        <div className="escenario-ficha">
          <p className="escenario-modelo">{enEscena.nombre}</p>
          <p className="escenario-stock">
            {total > 0
              ? <>{total} piezas · {Object.entries(hay).filter(([, n]) => n > 0)
                  .map(([s]) => SUCURSALES_ACTIVAS.find(x => x.slug === s)?.nombre).join(' · ') || 'en bodega'}</>
              : 'Sin existencia hoy'}
          </p>
        </div>
      </div>
    </section>
  )
}
