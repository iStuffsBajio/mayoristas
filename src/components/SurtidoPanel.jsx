import { useState, useEffect, useMemo } from 'react'
import { SUCURSALES_ACTIVAS, BODEGA } from '../lib/sucursales'
import { inventarioJsonUrl, historialUrl } from '../lib/s3'
import {
  velocidadDiaria, velocidadCombinada, calcularSurtido, analizarBodega,
  candidatosADepurar, esTemporadaAlta, COBERTURA, MOTIVOS,
  DIAS_PARA_CONFIAR, DIAS_PARA_DEPURAR, DIAS_EN_CATALOGO, diasEnCatalogo,
} from '../lib/surtido'
import { descargarSurtido } from '../lib/exportarSurtido'
import { separarProduccion } from '../lib/produccion'

const TINTA       = '#101619'
const TINTA_SUAVE = '#4A5A61'
const TINTA_TENUE = '#8598A1'
const LINEA       = '#D6E0E4'
const ROSA        = '#C4156F'
const VERDE       = '#5E9422'
const AMBAR       = '#B45309'

const TODAS = { slug: 'todas', nombre: 'Todas las sucursales' }
const TOPE = 150

const VISTAS = [
  { id: 'venta',   etiqueta: 'Pedir por venta' },
  { id: 'muestra', etiqueta: 'Sin venta y agotados' },
  { id: 'bodega',  etiqueta: 'Bodega' },
  { id: 'nuevos',  etiqueta: 'Recién llegados' },
  { id: 'depurar', etiqueta: 'Depurar' },
]

function Pildora({ activa, onClick, children, titulo }) {
  return (
    <button type="button" onClick={onClick} title={titulo}
      className="px-3.5 py-1.5 text-xs font-semibold transition-all"
      style={activa
        ? { background: 'linear-gradient(135deg, #00BCF2, #8DC63F)', borderRadius: 999, color: '#fff', border: 'none', cursor: 'pointer', boxShadow: '0 3px 12px rgba(0,188,242,0.22)' }
        : { backgroundColor: 'rgba(16,22,25,0.05)', border: '1px solid ' + LINEA, borderRadius: 999, color: TINTA_SUAVE, cursor: 'pointer', background: 'none' }}>
      {children}
    </button>
  )
}

function Dato({ valor, etiqueta, nota, color }) {
  return (
    <div style={{ flex: 1, minWidth: 104, padding: '12px 14px', background: '#fff', border: '1px solid ' + LINEA, borderRadius: 16 }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: color || TINTA, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{valor}</div>
      <div style={{ fontSize: 11.5, color: TINTA_SUAVE, marginTop: 2 }}>{etiqueta}</div>
      {nota && <div style={{ fontSize: 10.5, color: TINTA_TENUE, marginTop: 1 }}>{nota}</div>}
    </div>
  )
}

function Aviso({ tono = AMBAR, children }) {
  const fondo = tono === AMBAR ? 'rgba(180,83,9,0.06)' : 'rgba(0,188,242,0.05)'
  const borde = tono === AMBAR ? 'rgba(180,83,9,0.22)' : 'rgba(0,188,242,0.25)'
  return (
    <div style={{ padding: '12px 14px', borderRadius: 16, background: fondo, border: '1px solid ' + borde, marginBottom: 14 }}>
      <p style={{ fontSize: 11.5, color: tono === AMBAR ? AMBAR : TINTA_SUAVE, margin: 0, lineHeight: 1.55 }}>{children}</p>
    </div>
  )
}

const Th = ({ children, ...r }) => (
  <th {...r} style={{ textAlign: r.num ? 'right' : 'left', padding: '9px 10px', fontWeight: 700, color: TINTA_SUAVE, fontSize: 11, borderBottom: '1px solid ' + LINEA, whiteSpace: 'nowrap', ...r.style }}>
    {children}
  </th>
)

function Tabla({ children, encabezados }) {
  return (
    <div style={{ border: '1px solid ' + LINEA, borderRadius: 18, overflow: 'hidden', marginBottom: 14 }}>
      <div style={{ maxHeight: 440, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead style={{ position: 'sticky', top: 0, background: '#F7FAFB', zIndex: 1 }}>
            <tr>{encabezados}</tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  )
}

const Celda = ({ children, num, fuerte, color, title }) => (
  <td title={title} style={{ padding: '7px 10px', textAlign: num ? 'right' : 'left', color: color || TINTA, fontWeight: fuerte ? 800 : 400, fontVariantNumeric: num ? 'tabular-nums' : 'normal' }}>
    {children}
  </td>
)

const Modelo = ({ f }) => (
  <>
    <Celda>
      <span style={{ display: 'block', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.producto}</span>
    </Celda>
    <td style={{ padding: '7px 10px', color: TINTA_TENUE, fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>{f.codigo}</td>
  </>
)

export default function SurtidoPanel() {
  const sucursales = SUCURSALES_ACTIVAS
  const opciones = useMemo(() => [TODAS, ...sucursales], [sucursales])

  const [sel, setSel]       = useState(TODAS.slug)
  const [vista, setVista]   = useState('venta')
  const [altaManual, setAltaManual] = useState(null)   // null = automático
  const [datos, setDatos]   = useState(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let cancelado = false
    setCargando(true)
    ;(async () => {
      const bajar = async url => {
        try { const r = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' }); return r.ok ? await r.json() : null }
        catch { return null }
      }
      const slugs = [...sucursales.map(s => s.slug), BODEGA.slug]
      const pares = await Promise.all(slugs.map(async slug => [slug, {
        inv:  await bajar(inventarioJsonUrl(slug)),
        hist: await bajar(historialUrl(slug)),
      }]))
      if (!cancelado) { setDatos(Object.fromEntries(pares)); setCargando(false) }
    })()
    return () => { cancelado = true }
  }, [sucursales])

  const autoAlta  = esTemporadaAlta()
  const esAlta    = altaManual === null ? autoAlta : altaManual
  const cobertura = esAlta ? COBERTURA.alta : COBERTURA.baja

  // Una tabla de surtido por sucursal, siempre las tres: el consolidado y el
  // análisis de bodega las necesitan todas aunque se esté mirando una sola.
  const porSucursal = useMemo(() => {
    if (!datos) return {}
    const r = {}
    for (const s of sucursales) {
      const inv = datos[s.slug]?.inv
      if (!inv) continue
      // Lo que bodega fabrica no entra: pedir stickers a bodega no significa
      // nada, los imprime cuando hacen falta.
      r[s.slug] = separarProduccion(calcularSurtido({
        productos: inv.productos,
        velocidad: velocidadDiaria(datos[s.slug]?.hist),
        cobertura,
      }).filas).compra
    }
    return r
  }, [datos, sucursales, cobertura])

  const diasHistorial = useMemo(() => {
    if (!datos) return 0
    return velocidadCombinada(sucursales.map(s => datos[s.slug]?.hist)).dias
  }, [datos, sucursales])

  // La vista de una sucursal usa su propia tabla; la de "Todas" se arma
  // sumando existencias y ritmos de las tres.
  const filas = useMemo(() => {
    if (!datos) return []
    if (sel !== TODAS.slug) return porSucursal[sel] ?? []

    const vel = velocidadCombinada(sucursales.map(s => datos[s.slug]?.hist))
    const juntos = new Map()
    for (const s of sucursales) {
      for (const p of datos[s.slug]?.inv?.productos ?? []) {
        const c = String(p.Codigo ?? '').trim()
        if (!c) continue
        const e = juntos.get(c) ?? { Codigo: c, Producto: String(p.Producto ?? '').trim(), Existencia: 0 }
        e.Existencia += Number(p.Existencia) || 0
        juntos.set(c, e)
      }
    }
    return separarProduccion(
      calcularSurtido({ productos: [...juntos.values()], velocidad: vel, cobertura }).filas
    ).compra
  }, [datos, sel, porSucursal, sucursales, cobertura])

  // Cuántos se dejaron fuera por fabricarse, para decirlo en vez de que
  // desaparezcan sin explicación.
  const produccion = useMemo(() => {
    if (!datos || sel === TODAS.slug) return []
    const inv = datos[sel]?.inv
    if (!inv) return []
    return separarProduccion(
      calcularSurtido({ productos: inv.productos, velocidad: velocidadDiaria(datos[sel]?.hist), cobertura }).filas
    ).produccion
  }, [datos, sel, cobertura])

  const bodegaInv = datos?.[BODEGA.slug]?.inv ?? null

  // Existencia de bodega por codigo, para cruzarla en la tabla de pedido.
  const bodegaStock = useMemo(() => {
    if (!bodegaInv) return null
    const m = {}
    for (const p of bodegaInv.productos ?? []) {
      const c = String(p.Codigo ?? '').trim()
      if (c) m[c] = Number(p.Existencia) || 0
    }
    return m
  }, [bodegaInv])
  const bodega    = useMemo(() => bodegaInv ? analizarBodega(porSucursal, bodegaInv) : [], [porSucursal, bodegaInv])

  // Cuándo entró cada modelo. Se toma de bodega, que es donde se da de alta
  // todo antes de repartirlo; si una sucursal maneja algo que bodega no, se
  // usa la fecha de la propia sucursal.
  const altas = useMemo(() => {
    if (!datos) return {}
    const m = {}
    for (const s of sucursales) {
      for (const p of datos[s.slug]?.inv?.productos ?? []) {
        const c = String(p.Codigo ?? '').trim()
        if (c && p.Alta && !m[c]) m[c] = p.Alta
      }
    }
    for (const p of bodegaInv?.productos ?? []) {
      const c = String(p.Codigo ?? '').trim()
      if (c && p.Alta) m[c] = p.Alta
    }
    return m
  }, [datos, sucursales, bodegaInv])

  const depurar = useMemo(() => candidatosADepurar(porSucursal, diasHistorial, altas), [porSucursal, diasHistorial, altas])

  const porVenta  = useMemo(() => filas.filter(f => f.motivo === MOTIVOS.VENTA && f.sugerido > 0).sort((a, b) => b.sugerido - a.sugerido || a.cobertura - b.cobertura), [filas])
  const muestras  = useMemo(() => filas.filter(f => f.motivo === MOTIVOS.SIN_VENTA_CERO).sort((a, b) => a.producto.localeCompare(b.producto)), [filas])

  const piezasVenta = porVenta.reduce((a, f) => a + f.sugerido, 0)
  const nombreSel = opciones.find(o => o.slug === sel)?.nombre ?? ''

  // Se baja el libro entero, no solo la vista que se está mirando: las cuatro
  // hojas se leen juntas al decidir un pedido.
  const exportar = () => descargarSurtido({
    sucursal: nombreSel,
    meta: { cobertura, esAlta, diasHistorial },
    porVenta,
    muestras,
    bodega,
    depurar: depurar.filas,
    nuevos: depurar.nuevos,
    bodegaStock,
  })

  if (cargando) {
    return (
      <div style={{ backgroundColor: '#fff', borderRadius: 30, border: '1px solid ' + LINEA, padding: '24px 22px' }}>
        <p style={{ fontSize: 13, color: TINTA_TENUE, margin: 0 }}>Calculando sugerencia de surtido...</p>
      </div>
    )
  }

  return (
    <div style={{ backgroundColor: '#fff', borderRadius: 30, border: '1px solid ' + LINEA, padding: '24px 22px', boxShadow: '0 2px 12px rgba(16,22,25,0.04)' }}>

      <div style={{ marginBottom: 14 }}>
        <h3 style={{ fontSize: 15, fontWeight: 800, color: TINTA, margin: '0 0 4px' }}>🚚 Sugerencia de surtido</h3>
        <p style={{ fontSize: 12, color: TINTA_SUAVE, margin: 0, lineHeight: 1.5 }}>
          A qué ritmo sale cada modelo, cuántos días quieres aguantar, y cuánto falta para llegar ahí.
          Es la cuenta que harías a mano, hecha sobre todo el historial disponible.
        </p>
      </div>

      {/* Temporada */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14, padding: '10px 14px', borderRadius: 16, background: esAlta ? 'rgba(196,21,111,0.05)' : 'rgba(16,22,25,0.02)', border: '1px solid ' + (esAlta ? 'rgba(196,21,111,0.2)' : LINEA) }}>
        <span style={{ fontSize: 12.5, color: TINTA_SUAVE }}>
          Temporada <strong style={{ color: esAlta ? ROSA : TINTA }}>{esAlta ? 'alta' : 'baja'}</strong>
          {' '}· cubre <strong style={{ color: TINTA }}>{cobertura} días</strong>
          {altaManual !== null && <span style={{ color: TINTA_TENUE }}> (forzada a mano)</span>}
        </span>
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          <Pildora activa={altaManual === null} onClick={() => setAltaManual(null)}
                   titulo="Noviembre y diciembre cuentan como alta">Automático</Pildora>
          <Pildora activa={altaManual === false} onClick={() => setAltaManual(false)}>Baja</Pildora>
          <Pildora activa={altaManual === true}  onClick={() => setAltaManual(true)}>Alta</Pildora>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {opciones.map(s => (
          <Pildora key={s.slug} activa={sel === s.slug} onClick={() => setSel(s.slug)}>
            {s.slug === TODAS.slug ? 'Todas' : s.nombre}
          </Pildora>
        ))}
      </div>

      {diasHistorial < DIAS_PARA_CONFIAR && (
        <Aviso>
          Solo hay <strong>{diasHistorial} días</strong> de historial medido. El ritmo diario sale de ahí,
          así que tómalo como una primera aproximación: con un modelo que vendió 2 piezas en tres semanas,
          la diferencia entre 0.1 y 0.2 al día cambia el pedido al doble. Mejora solo conforme pasen los meses,
          y se puede acelerar importando reportes de venta viejos de Eleventa.
        </Aviso>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <Dato valor={porVenta.length} etiqueta="modelos a pedir" nota="porque se venden" color={VERDE} />
        <Dato valor={piezasVenta} etiqueta="piezas en total" />
        <Dato valor={muestras.length} etiqueta="sin venta y en cero" nota="1 pieza de muestra" color={AMBAR} />
        <Dato valor={diasHistorial} etiqueta="días de historial" />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {VISTAS.map(v => (
          <Pildora key={v.id} activa={vista === v.id} onClick={() => setVista(v.id)}>{v.etiqueta}</Pildora>
        ))}
      </div>

      {/* ── Pedir por venta ── */}
      {vista === 'venta' && (porVenta.length === 0
        ? <p style={{ fontSize: 13, color: TINTA_TENUE }}>Nada que pedir: todo lo que se vende alcanza para {cobertura} días.</p>
        : <>
            <p style={{ fontSize: 12, color: TINTA_SUAVE, margin: '0 0 10px' }}>
              <strong style={{ color: TINTA }}>{porVenta.length}</strong> modelos, <strong style={{ color: TINTA }}>{piezasVenta}</strong> piezas
              {porVenta.length > TOPE && ` — se listan los primeros ${TOPE}`}
            </p>
            <Tabla encabezados={<>
              <Th>Modelo</Th><Th>Código</Th>
              <Th num style={{ textAlign: 'right' }}>Tiene</Th>
              <Th num style={{ textAlign: 'right' }} title="Piezas que salen al día, sobre todo el historial">Ritmo</Th>
              <Th num style={{ textAlign: 'right' }} title="Días que aguanta con lo que tiene">Aguanta</Th>
              <Th num style={{ textAlign: 'right' }}>Pedir</Th>
              {bodegaStock && <Th num style={{ textAlign: 'right' }} title="Existencia en bodega de ese modelo">En bodega</Th>}
            </>}>
              {porVenta.slice(0, TOPE).map((f, i) => (
                <tr key={f.codigo + i} style={{ background: i % 2 ? '#FBFDFD' : '#fff' }}>
                  <Modelo f={f} />
                  <Celda num>{f.existencia}</Celda>
                  <Celda num color={TINTA_SUAVE}>{f.ritmo.toFixed(2)}</Celda>
                  <Celda num color={f.cobertura !== null && f.cobertura < 7 ? ROSA : TINTA_SUAVE}>
                    {f.cobertura === null ? '—' : `${Math.floor(f.cobertura)} d`}
                  </Celda>
                  <Celda num fuerte color={VERDE}>{f.sugerido}</Celda>
                  {bodegaStock && (() => {
                    const hay = bodegaStock[f.codigo]
                    const color = hay === undefined || hay === 0 ? ROSA : hay >= f.sugerido ? VERDE : AMBAR
                    return (
                      <Celda num color={color}
                             title={hay === undefined ? 'Bodega no lo maneja' : hay >= f.sugerido ? 'Bodega lo cubre' : `Bodega cubre ${hay}`}>
                        {hay === undefined ? '—' : hay}
                      </Celda>
                    )
                  })()}
                </tr>
              ))}
            </Tabla>
          </>)}

      {vista === 'venta' && produccion.length > 0 && (
        <p style={{ fontSize: 11, color: TINTA_TENUE, margin: '0 0 12px', lineHeight: 1.5 }}>
          {produccion.length === 1 ? 'Queda' : 'Quedan'} fuera {produccion.length}{' '}
          {produccion.length === 1 ? 'código' : 'códigos'} de producción ({produccion.map(p => p.codigo).join(', ')}):
          los stickers no se almacenan, bodega los imprime cuando hacen falta.
        </p>
      )}

      {/* ── Sin venta y agotados ── */}
      {vista === 'muestra' && (
        <>
          <Aviso tono="info">
            Estos nunca se han vendido <em>y</em> están en cero. Puede que no se vendan porque nunca hay:
            con una pieza en el mostrador se sale de dudas. Si en unos meses siguen sin moverse, ya hay
            argumento para darlos de baja. Son {muestras.length} piezas en total, decídelo tú.
          </Aviso>
          {muestras.length === 0
            ? <p style={{ fontSize: 13, color: TINTA_TENUE }}>No hay modelos en este caso.</p>
            : <Tabla encabezados={<><Th>Modelo</Th><Th>Código</Th><Th num style={{ textAlign: 'right' }}>Pedir</Th></>}>
                {muestras.slice(0, TOPE).map((f, i) => (
                  <tr key={f.codigo + i} style={{ background: i % 2 ? '#FBFDFD' : '#fff' }}>
                    <Modelo f={f} />
                    <Celda num fuerte color={AMBAR}>1</Celda>
                  </tr>
                ))}
              </Tabla>}
        </>
      )}

      {/* ── Bodega ── */}
      {vista === 'bodega' && (!bodegaInv
        ? <Aviso>
            La bodega todavía no sube respaldos. Ya está dada de alta: en cuanto la computadora de bodega
            deje su <code>.fbk</code> en la carpeta <code>RESPALDOS SUCURSALES/bodega</code> del Dropbox,
            la sincronización la recoge sola en la siguiente corrida y esta pestaña se llena.
            Mientras tanto el resto del panel funciona igual.
          </Aviso>
        : <>
            <p style={{ fontSize: 12, color: TINTA_SUAVE, margin: '0 0 10px' }}>
              Lo que piden las tres sucursales contra lo que hay en bodega.
            </p>
            <Tabla encabezados={<>
              <Th>Modelo</Th><Th>Código</Th>
              <Th num style={{ textAlign: 'right' }}>Piden</Th>
              <Th num style={{ textAlign: 'right' }}>Bodega</Th>
              <Th num style={{ textAlign: 'right' }}>Falta</Th>
              <Th>Estado</Th>
            </>}>
              {bodega.slice(0, TOPE).map((b, i) => (
                <tr key={b.codigo + i} style={{ background: i % 2 ? '#FBFDFD' : '#fff' }}>
                  <Modelo f={b} />
                  <Celda num>{b.piden}</Celda>
                  <Celda num color={b.tiene === 0 ? ROSA : TINTA}>{b.existe ? b.tiene : '—'}</Celda>
                  <Celda num fuerte color={b.falta > 0 ? ROSA : VERDE}>{b.falta || '—'}</Celda>
                  <Celda color={b.estado === 'cubre' ? VERDE : b.estado === 'parcial' ? AMBAR : ROSA}>
                    {b.estado === 'cubre'     ? 'Surte todo'
                     : b.estado === 'parcial' ? `No alcanza para ${b.sucursalesSinCubrir} de ${b.sucursales.length}`
                     : b.estado === 'agotada' ? 'Bodega en cero'
                     : 'Bodega no lo maneja'}
                  </Celda>
                </tr>
              ))}
            </Tabla>
          </>)}

      {/* ── Recién llegados ── */}
      {vista === 'nuevos' && (
        <>
          <Aviso tono="info">
            Modelos que entraron hace menos de un año y todavía no se han vendido. No son
            inventario muerto: todavía no se han visto vender, que no es lo mismo. Por eso no
            aparecen en Depurar. La fecha sale del primer movimiento registrado en bodega.
          </Aviso>
          {depurar.nuevos.length === 0
            ? <p style={{ fontSize: 13, color: TINTA_TENUE }}>
                {depurar.suficiente ? 'No hay modelos recién llegados sin venta.' : 'Hace falta más historial para separarlos.'}
              </p>
            : <Tabla encabezados={<>
                <Th>Modelo</Th><Th>Código</Th>
                <Th num style={{ textAlign: 'right' }}>Piezas</Th>
                <Th>Entró</Th>
                <Th num style={{ textAlign: 'right' }}>Lleva</Th>
              </>}>
                {depurar.nuevos.slice(0, TOPE).map((d, i) => {
                  const dias = diasEnCatalogo(d.alta)
                  return (
                    <tr key={d.codigo + i} style={{ background: i % 2 ? '#FBFDFD' : '#fff' }}>
                      <Modelo f={d} />
                      <Celda num>{d.existencia}</Celda>
                      <Celda color={TINTA_SUAVE}>{d.alta}</Celda>
                      <Celda num color={dias !== null && dias < 90 ? VERDE : TINTA_SUAVE}>
                        {dias === null ? '—' : `${dias} d`}
                      </Celda>
                    </tr>
                  )
                })}
              </Tabla>}
        </>
      )}

      {/* ── Depurar ── */}
      {vista === 'depurar' && (!depurar.suficiente
        ? <Aviso>
            Todavía no. Con <strong>{depurar.dias} días</strong> de historial, «nunca se vendió» solo
            significa «todavía no lo he visto vender». Al probarlo con tres semanas de datos salían
            432 códigos propuestos para dar de baja, que es medio catálogo. Faltan <strong>{depurar.faltan} días</strong> de
            medición para que esta lista valga algo, o importar reportes de venta viejos de Eleventa.
          </Aviso>
        : <>
            <Aviso tono="info">
              Códigos con más de un año en el catálogo, sin una sola venta en todo el historial y
              todavía ocupando lugar. Es una propuesta para que la revises, no una orden: un modelo
              puede estar ahí por garantía o por un cliente puntual.
              Suman {depurar.filas.reduce((a, d) => a + d.existencia, 0)} piezas paradas.
              {depurar.nuevos.length > 0 && ` Otros ${depurar.nuevos.length} tampoco se han vendido, pero llegaron hace menos de un año y están en «Recién llegados».`}
              {depurar.sinFecha > 0 && ` ${depurar.sinFecha} quedan fuera por no saber cuándo entraron.`}
            </Aviso>
            <Tabla encabezados={<>
              <Th>Modelo</Th><Th>Código</Th>
              <Th num style={{ textAlign: 'right' }}>Piezas paradas</Th>
              <Th>Entró</Th><Th>Dónde</Th>
            </>}>
              {depurar.filas.slice(0, TOPE).map((d, i) => (
                <tr key={d.codigo + i} style={{ background: i % 2 ? '#FBFDFD' : '#fff' }}>
                  <Modelo f={d} />
                  <Celda num fuerte color={AMBAR}>{d.existencia}</Celda>
                  <Celda color={TINTA_SUAVE}>{d.alta ?? '—'}</Celda>
                  <Celda color={TINTA_SUAVE}>{d.plazas.map(p => p.slug).join(', ')}</Celda>
                </tr>
              ))}
            </Tabla>
          </>)}

      {(
        <button type="button" onClick={exportar}
          className="px-4 py-2 text-sm font-semibold transition-all"
          style={{ background: 'linear-gradient(135deg, #5E9422, #8DC63F)', borderRadius: 999, color: '#fff', border: 'none', cursor: 'pointer', boxShadow: '0 4px 14px rgba(94,148,34,0.22)' }}>
          Bajar el reporte completo en Excel
        </button>
      )}

      <p style={{ fontSize: 11, color: TINTA_TENUE, margin: '14px 0 0', lineHeight: 1.55, paddingTop: 12, borderTop: '1px solid ' + LINEA }}>
        El ritmo sale de dividir lo vendido entre los días con dato, no entre los del calendario: si una
        sucursal estuvo semanas sin subir respaldo, esas semanas no diluyen el ritmo de las que sí se
        midieron. Los meses importados de Eleventa cuentan con la venta real; los medidos por la
        sincronización son un piso, porque un resurtido el mismo día tapa la salida.
      </p>
    </div>
  )
}
