import { useState, useEffect, useMemo } from 'react'
import { SUCURSALES } from '../lib/sucursales'
import { inventarioJsonUrl, estadisticasUrl } from '../lib/s3'
import { salidasPorCodigo, sumarSalidas } from '../lib/estadisticas'
import { nivelStock, COLOR_NIVEL, UMBRAL_VERDE, UMBRAL_NARANJA } from './StockBadge'
import { descargarInventario, descargarInventarioConsolidado } from '../lib/exportarInventario'

const TINTA       = '#101619'
const TINTA_SUAVE = '#4A5A61'
const TINTA_TENUE = '#8598A1'
const LINEA       = '#D6E0E4'
const ROSA        = '#C4156F'

const TODAS = { slug: 'todas', nombre: 'Todas las sucursales' }

// El orden es el de urgencia, porque este panel existe para resurtir: lo que
// falta va primero y lo que sobra al final.
const FILTROS = [
  { id: 'todos',    etiqueta: 'Todos',                          prueba: () => true },
  { id: 'agotado',  etiqueta: 'Agotados',                       prueba: n => n <= 0 },
  { id: 'urgente',  etiqueta: `Urgente (1–${UMBRAL_NARANJA - 1})`, prueba: n => n > 0 && n < UMBRAL_NARANJA },
  { id: 'bajo',     etiqueta: `Limitado (${UMBRAL_NARANJA}–${UMBRAL_VERDE - 1})`, prueba: n => n >= UMBRAL_NARANJA && n < UMBRAL_VERDE },
  { id: 'ok',       etiqueta: `En stock (≥ ${UMBRAL_VERDE})`,   prueba: n => n >= UMBRAL_VERDE },
]

const ORDENES = [
  { id: 'vendidos', etiqueta: 'Más vendidos primero' },
  { id: 'menor',    etiqueta: 'Menos existencia primero' },
  { id: 'mayor',    etiqueta: 'Más existencia primero' },
  { id: 'nombre',   etiqueta: 'Por nombre' },
]

// Entre modelos que tienen todos 1, 2 o 3 piezas, ordenar por existencia no
// dice nada. Lo que separa lo urgente de verdad de lo urgente de adorno es
// cuánto se vendió, así que ese es el orden con el que abre.
const ORDEN_INICIAL = 'vendidos'

const TOPE_EN_PANTALLA = 150

// ── Piezas ────────────────────────────────────────────────────────────────────

function Pildora({ activa, onClick, children, tenue }) {
  return (
    <button type="button" onClick={onClick}
      className="px-3.5 py-1.5 text-xs font-semibold transition-all"
      style={activa
        ? { background: 'linear-gradient(135deg, #00BCF2, #8DC63F)', borderRadius: 999, color: '#fff', border: 'none', cursor: 'pointer', boxShadow: '0 3px 12px rgba(0,188,242,0.22)' }
        : { backgroundColor: 'rgba(16,22,25,0.05)', border: '1px solid ' + LINEA, borderRadius: 999, color: tenue ? TINTA_TENUE : TINTA_SUAVE, cursor: 'pointer', background: 'none' }}>
      {children}
    </button>
  )
}

function BotonExcel({ onClick, children }) {
  return (
    <button type="button" onClick={onClick}
      className="px-4 py-2 text-sm font-semibold transition-all"
      style={{ background: 'linear-gradient(135deg, #5E9422, #8DC63F)', borderRadius: 999, color: '#fff', border: 'none', cursor: 'pointer', boxShadow: '0 4px 14px rgba(94,148,34,0.22)' }}>
      {children}
    </button>
  )
}

/** La existencia con su color de semáforo. Un guion si el modelo no existe ahí. */
function Existencia({ n, size = 13 }) {
  if (n === undefined) return <span style={{ color: '#C8D4D9', fontSize: size }}>—</span>
  if (n <= 0) return <span style={{ color: ROSA, fontWeight: 800, fontSize: size }}>0</span>
  return (
    <span style={{ color: COLOR_NIVEL[nivelStock(n)], fontWeight: 700, fontSize: size, fontVariantNumeric: 'tabular-nums' }}>
      {n}
    </span>
  )
}

/** Piezas vendidas en un plazo. El cero se apaga para que no compita con los
 *  números que sí importan. */
function Venta({ n }) {
  if (!n) return <span style={{ color: '#C8D4D9', fontSize: 12.5 }}>0</span>
  return <span style={{ color: TINTA, fontWeight: 700, fontSize: 12.5, fontVariantNumeric: 'tabular-nums' }}>{n}</span>
}

function Contador({ n, etiqueta, color, activo, onClick }) {
  return (
    <button type="button" onClick={onClick}
      style={{
        flex: 1, minWidth: 92, padding: '10px 12px', textAlign: 'left', cursor: 'pointer',
        background: activo ? 'rgba(0,188,242,0.06)' : '#fff',
        border: `1px solid ${activo ? 'rgba(0,188,242,0.45)' : LINEA}`,
        borderRadius: 16,
      }}>
      <div style={{ fontSize: 20, fontWeight: 800, color, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{n}</div>
      <div style={{ fontSize: 11, color: TINTA_SUAVE, marginTop: 2 }}>{etiqueta}</div>
    </button>
  )
}

/** Días desde el respaldo, con el mismo criterio que usa la página pública. */
function antiguedad(inv) {
  const f = inv?.respaldo?.fecha
  if (!f) return null
  const [y, m, d] = f.split('-').map(Number)
  const dias = Math.floor((Date.now() - new Date(y, m - 1, d).getTime()) / 86400000)
  return { dias, fecha: f }
}

function colorAntiguedad(dias) {
  return dias === null ? TINTA_TENUE : dias <= 1 ? '#5E9422' : dias <= 3 ? '#B45309' : '#DC2626'
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export default function InventariosPanel() {
  const activas  = useMemo(() => SUCURSALES.filter(s => s.activa), [])
  const opciones = useMemo(() => [TODAS, ...activas], [activas])

  const [sel, setSel]         = useState(TODAS.slug)
  const [filtro, setFiltro]   = useState('urgente')
  const [orden, setOrden]     = useState(ORDEN_INICIAL)
  const [soloConVenta, setSoloConVenta] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [inventarios, setInventarios] = useState(null)
  const [estadisticas, setEstadisticas] = useState(null)
  const [cargando, setCargando]       = useState(true)

  useEffect(() => {
    let cancelado = false
    setCargando(true)
    ;(async () => {
      const bajar = async url => {
        try {
          const res = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' })
          return res.ok ? await res.json() : null
        } catch { return null }
      }
      // Las estadísticas van en la misma tanda: son el archivo que ya alimenta
      // el panel de movimiento y pesan unos pocos KB.
      const pares = await Promise.all(activas.map(async s => [s.slug, {
        inv:  await bajar(inventarioJsonUrl(s.slug)),
        est:  await bajar(estadisticasUrl(s.slug)),
      }]))
      if (cancelado) return
      setInventarios(Object.fromEntries(pares.map(([k, v]) => [k, v.inv])))
      setEstadisticas(Object.fromEntries(pares.map(([k, v]) => [k, v.est])))
      setCargando(false)
    })()
    return () => { cancelado = true }
  }, [activas])

  const esTodas = sel === TODAS.slug
  const sucursal = opciones.find(o => o.slug === sel) ?? TODAS

  // Piezas que salieron en los dos plazos, por código. En la vista consolidada
  // se suman las tres plazas, igual que las existencias.
  const ventas = useMemo(() => {
    if (!estadisticas) return { v7: {}, v30: {} }
    const fuentes = esTodas
      ? activas.map(s => estadisticas[s.slug])
      : [estadisticas[sel]]
    return {
      v7:  sumarSalidas(fuentes.map(e => salidasPorCodigo(e, 7))),
      v30: sumarSalidas(fuentes.map(e => salidasPorCodigo(e, 30))),
    }
  }, [estadisticas, sel, esTodas, activas])

  const hayVentas = useMemo(() => Object.keys(ventas.v30).length > 0, [ventas])

  // Una sola lista, con la misma forma en las dos vistas: la de sucursal trae
  // `existencia` y la consolidada trae `porSucursal` y `total`.
  const filas = useMemo(() => {
    if (!inventarios) return []

    if (!esTodas) {
      return (inventarios[sel]?.productos ?? []).map(p => {
        const codigo = String(p.Codigo ?? '').trim()
        return {
          codigo,
          producto:   String(p.Producto ?? '').trim(),
          existencia: Number(p.Existencia) || 0,
          v7:         ventas.v7[codigo] ?? 0,
          v30:        ventas.v30[codigo] ?? 0,
        }
      })
    }

    // Consolidado: se cruza por código, que es la clave estable entre plazas.
    const porClave = new Map()
    for (const s of activas) {
      for (const p of inventarios[s.slug]?.productos ?? []) {
        const codigo = String(p.Codigo ?? '').trim()
        const clave  = codigo || `nombre:${String(p.Producto ?? '').trim().toUpperCase()}`
        if (!clave || clave === 'nombre:') continue
        const fila = porClave.get(clave) ?? {
          codigo,
          producto: String(p.Producto ?? '').trim(),
          porSucursal: {},
          total: 0,
          v7:  ventas.v7[codigo] ?? 0,
          v30: ventas.v30[codigo] ?? 0,
        }
        const n = Number(p.Existencia) || 0
        fila.porSucursal[s.slug] = n
        fila.total += n
        if (!fila.producto) fila.producto = String(p.Producto ?? '').trim()
        porClave.set(clave, fila)
      }
    }
    return [...porClave.values()]
  }, [inventarios, sel, esTodas, activas, ventas])

  const valorDe = f => (esTodas ? f.total : f.existencia)

  const conteos = useMemo(() => {
    const c = {}
    for (const f of FILTROS) c[f.id] = filas.filter(x => f.prueba(valorDe(x))).length
    return c
  }, [filas, esTodas])

  // Los que cumplen el filtro de existencia, antes de mirar la venta. Sirve
  // para enseñar cuántos quedan fuera al exigir que se vendan.
  const porExistencia = useMemo(() => {
    const prueba = FILTROS.find(f => f.id === filtro)?.prueba ?? (() => true)
    return filas.filter(f => prueba(valorDe(f)))
  }, [filas, filtro, esTodas])

  const visibles = useMemo(() => {
    const q = busqueda.trim().toUpperCase()

    const lista = porExistencia.filter(f =>
      (!soloConVenta || !hayVentas || f.v30 > 0) &&
      (!q || f.producto.toUpperCase().includes(q) || f.codigo.toUpperCase().includes(q))
    )

    const porNombre = (a, b) => a.producto.localeCompare(b.producto)
    if (orden === 'nombre')   return lista.sort(porNombre)
    // A igualdad de venta, primero el que tiene menos piezas: es el que se
    // queda sin nada antes.
    if (orden === 'vendidos') return lista.sort((a, b) => b.v30 - a.v30 || valorDe(a) - valorDe(b) || porNombre(a, b))
    const dir = orden === 'menor' ? 1 : -1
    return lista.sort((a, b) => (valorDe(a) - valorDe(b)) * dir || porNombre(a, b))
  }, [porExistencia, orden, busqueda, soloConVenta, hayVentas, esTodas])

  const etiquetaFiltro = FILTROS.find(f => f.id === filtro)?.etiqueta ?? 'todos'

  const exportar = () => {
    if (esTodas) descargarInventarioConsolidado(visibles, activas, etiquetaFiltro)
    else descargarInventario(visibles, sucursal.nombre, etiquetaFiltro)
  }

  const faltantes = inventarios ? activas.filter(s => !inventarios[s.slug]).map(s => s.nombre) : []

  return (
    <div style={{ backgroundColor: '#fff', borderRadius: 30, border: '1px solid ' + LINEA, padding: '24px 22px', boxShadow: '0 2px 12px rgba(16,22,25,0.04)' }}>

      <div style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, fontWeight: 800, color: TINTA, margin: '0 0 4px' }}>📦 Existencias por sucursal</h3>
        <p style={{ fontSize: 12, color: TINTA_SUAVE, margin: 0, lineHeight: 1.5 }}>
          El inventario que la página está mostrando ahora mismo. Arranca filtrado por lo
          urgente, que es lo que sirve para salir a resurtir.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {opciones.map(s => (
          <Pildora key={s.slug} activa={sel === s.slug} onClick={() => setSel(s.slug)}>
            {s.slug === TODAS.slug ? 'Todas' : s.nombre}
          </Pildora>
        ))}
      </div>

      {cargando && <p style={{ fontSize: 13, color: TINTA_TENUE }}>Cargando existencias...</p>}

      {!cargando && filas.length === 0 && (
        <div style={{ padding: '14px 16px', borderRadius: 16, background: 'rgba(196,21,111,0.05)', border: '1px solid rgba(196,21,111,0.18)' }}>
          <p style={{ fontSize: 13, color: ROSA, fontWeight: 700, margin: 0 }}>Sin inventario para {sucursal.nombre}</p>
          <p style={{ fontSize: 12, color: TINTA_SUAVE, margin: '4px 0 0' }}>
            La sincronización no ha publicado el archivo de esta sucursal.
          </p>
        </div>
      )}

      {!cargando && filas.length > 0 && (
        <>
          {faltantes.length > 0 && esTodas && (
            <p style={{ fontSize: 11.5, color: '#B45309', margin: '0 0 12px', lineHeight: 1.5 }}>
              El consolidado va sin {faltantes.join(' ni ')}: no se pudo leer su inventario.
            </p>
          )}

          {/* Frescura de cada archivo: un número viejo aquí es peor que no tenerlo. */}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 14, fontSize: 11 }}>
            {(esTodas ? activas : [sucursal]).map(s => {
              const a = antiguedad(inventarios[s.slug])
              return (
                <span key={s.slug} style={{ color: TINTA_TENUE }}>
                  {s.nombre}:{' '}
                  <strong style={{ color: colorAntiguedad(a?.dias ?? null), fontWeight: 700 }}>
                    {a === null ? 'sin fecha'
                      : a.dias === 0 ? 'hoy'
                      : a.dias === 1 ? 'ayer'
                      : `hace ${a.dias} días`}
                  </strong>
                </span>
              )
            })}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            <Contador n={conteos.agotado} etiqueta="agotados"  color={ROSA}      activo={filtro === 'agotado'} onClick={() => setFiltro('agotado')} />
            <Contador n={conteos.urgente} etiqueta="urgentes"  color="#D51A7A"   activo={filtro === 'urgente'} onClick={() => setFiltro('urgente')} />
            <Contador n={conteos.bajo}    etiqueta="limitados" color="#d97706"   activo={filtro === 'bajo'}    onClick={() => setFiltro('bajo')} />
            <Contador n={conteos.ok}      etiqueta="en stock"  color="#16a34a"   activo={filtro === 'ok'}      onClick={() => setFiltro('ok')} />
            <Contador n={conteos.todos}   etiqueta="modelos"   color={TINTA}     activo={filtro === 'todos'}   onClick={() => setFiltro('todos')} />
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
            <input
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar modelo o código..."
              style={{ flex: 1, minWidth: 190, padding: '8px 14px', fontSize: 13, borderRadius: 999, border: '1px solid ' + LINEA, outline: 'none', color: TINTA }}
            />
            {busqueda && (
              <Pildora tenue onClick={() => setBusqueda('')}>Limpiar</Pildora>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
            {ORDENES.map(o => (
              <Pildora key={o.id} activa={orden === o.id} onClick={() => setOrden(o.id)}>{o.etiqueta}</Pildora>
            ))}
            {hayVentas && (
              <>
                <span style={{ width: 1, height: 20, background: LINEA }} />
                <Pildora activa={soloConVenta} onClick={() => setSoloConVenta(!soloConVenta)}
                         titulo="Esconde los modelos que no se movieron en 30 días">
                  {soloConVenta ? '✓ ' : ''}Solo los que se venden
                </Pildora>
              </>
            )}
          </div>

          <p style={{ fontSize: 12, color: TINTA_SUAVE, margin: '0 0 10px' }}>
            <strong style={{ color: TINTA }}>{visibles.length}</strong> modelos en «{etiquetaFiltro}»
            {soloConVenta && hayVentas && !busqueda && porExistencia.length > visibles.length && (
              <> con venta en 30 días <span style={{ color: TINTA_TENUE }}>
                — los otros {porExistencia.length - visibles.length} están bajos pero nadie los pide
              </span></>
            )}
            {busqueda && ` que coinciden con "${busqueda}"`}
            {visibles.length > TOPE_EN_PANTALLA && ` — se listan los primeros ${TOPE_EN_PANTALLA}`}
          </p>

          <div style={{ border: '1px solid ' + LINEA, borderRadius: 18, overflow: 'hidden', marginBottom: 14 }}>
            <div style={{ maxHeight: 460, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead style={{ position: 'sticky', top: 0, background: '#F7FAFB', zIndex: 1 }}>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '9px 12px', fontWeight: 700, color: TINTA_SUAVE, fontSize: 11, borderBottom: '1px solid ' + LINEA }}>Modelo</th>
                    <th style={{ textAlign: 'left', padding: '9px 8px', fontWeight: 700, color: TINTA_SUAVE, fontSize: 11, borderBottom: '1px solid ' + LINEA }}>Código</th>
                    {esTodas
                      ? <>
                          {activas.map(s => (
                            <th key={s.slug} style={{ textAlign: 'right', padding: '9px 8px', fontWeight: 700, color: TINTA_SUAVE, fontSize: 11, borderBottom: '1px solid ' + LINEA, whiteSpace: 'nowrap' }}>
                              {s.nombre.split(' ')[0]}
                            </th>
                          ))}
                          <th style={{ textAlign: 'right', padding: '9px 8px', fontWeight: 700, color: TINTA_SUAVE, fontSize: 11, borderBottom: '1px solid ' + LINEA }}>Total</th>
                        </>
                      : <th style={{ textAlign: 'right', padding: '9px 8px', fontWeight: 700, color: TINTA_SUAVE, fontSize: 11, borderBottom: '1px solid ' + LINEA }}>Existencia</th>}
                    {hayVentas && <>
                      <th title="Piezas que salieron en los últimos 7 días"
                          style={{ textAlign: 'right', padding: '9px 8px', fontWeight: 700, color: TINTA_SUAVE, fontSize: 11, borderBottom: '1px solid ' + LINEA, borderLeft: '1px solid ' + LINEA, whiteSpace: 'nowrap' }}>
                        7 días
                      </th>
                      <th title="Piezas que salieron en los últimos 30 días"
                          style={{ textAlign: 'right', padding: '9px 12px', fontWeight: 700, color: TINTA_SUAVE, fontSize: 11, borderBottom: '1px solid ' + LINEA, whiteSpace: 'nowrap' }}>
                        30 días
                      </th>
                    </>}
                  </tr>
                </thead>
                <tbody>
                  {visibles.slice(0, TOPE_EN_PANTALLA).map((f, i) => (
                    <tr key={(f.codigo || f.producto) + i} style={{ background: i % 2 ? '#FBFDFD' : '#fff' }}>
                      <td style={{ padding: '7px 12px', color: TINTA, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {f.producto}
                      </td>
                      <td style={{ padding: '7px 8px', color: TINTA_TENUE, fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>
                        {f.codigo}
                      </td>
                      {esTodas
                        ? <>
                            {activas.map(s => (
                              <td key={s.slug} style={{ padding: '7px 8px', textAlign: 'right' }}>
                                <Existencia n={f.porSucursal[s.slug]} />
                              </td>
                            ))}
                            <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 800, color: TINTA, fontVariantNumeric: 'tabular-nums' }}>
                              {f.total}
                            </td>
                          </>
                        : <td style={{ padding: '7px 8px', textAlign: 'right' }}>
                            <Existencia n={f.existencia} size={13.5} />
                          </td>}
                      {hayVentas && <>
                        <td style={{ padding: '7px 8px', textAlign: 'right', borderLeft: '1px solid ' + LINEA }}>
                          <Venta n={f.v7} />
                        </td>
                        <td style={{ padding: '7px 12px', textAlign: 'right' }}>
                          <Venta n={f.v30} />
                        </td>
                      </>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <BotonExcel onClick={exportar}>
              Bajar estos {visibles.length} modelos en Excel
            </BotonExcel>
            <span style={{ fontSize: 11, color: TINTA_TENUE }}>
              el Excel trae la lista completa, no solo los {TOPE_EN_PANTALLA} de pantalla
            </span>
          </div>

          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid ' + LINEA }}>
            {esTodas && (
              <p style={{ fontSize: 11, color: TINTA_TENUE, margin: '0 0 6px', lineHeight: 1.55 }}>
                El guion (—) es un modelo que esa sucursal no maneja; el cero es que lo maneja y se
                acabó. No es lo mismo al resurtir, y por eso el total suma solo donde el modelo existe.
              </p>
            )}
            {hayVentas && (
              <p style={{ fontSize: 11, color: TINTA_TENUE, margin: 0, lineHeight: 1.55 }}>
                Las dos columnas de venta son un piso, no una cifra exacta: salen de comparar el
                inventario de cada día contra el anterior, así que si un modelo baja y se resurte el
                mismo día, esa salida no se alcanza a ver. Para decidir qué pedir sirven igual, porque
                lo que importa es cuáles se mueven y cuáles no.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
