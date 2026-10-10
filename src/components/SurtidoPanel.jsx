import { useState, useEffect, useMemo } from 'react'
import { SUCURSALES_ACTIVAS, SUCURSALES, BODEGA } from '../lib/sucursales'
import { inventarioJsonUrl, historialUrl } from '../lib/s3'
import {
  velocidadDiaria, velocidadCombinada, calcularSurtido, analizarBodega,
  candidatosADepurar, esTemporadaAlta, COBERTURA, MOTIVOS,
  DIAS_PARA_CONFIAR, DIAS_PARA_DEPURAR, DIAS_EN_CATALOGO, diasEnCatalogo,
  mesesActivos, proximaFeria, calcularSurtidoFeria, MARGENES, MARGEN_FERIA,
} from '../lib/surtido'
import { descargarSurtido } from '../lib/exportarSurtido'
import { calcularCompras, analizarAgotados, MESES_COBERTURA, MESES_RECIENTES } from '../lib/compras'
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

const MES = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
             'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

// Ferias no entra en el consolidado ni en el analisis de bodega: su surtido se
// calcula de otra forma y mezclarla falsearia a las tiendas fijas.
const FERIAS = SUCURSALES.find(s => s.estacional)

const VISTAS = [
  { id: 'venta',   etiqueta: 'Pedir por venta' },
  { id: 'muestra', etiqueta: 'Sin venta y agotados' },
  { id: 'candidatos', etiqueta: 'Se venden en tienda' },
  { id: 'bodega',  etiqueta: 'Bodega' },
  { id: 'nuevos',  etiqueta: 'Recién llegados' },
  { id: 'depurar', etiqueta: 'Depurar' },
  { id: 'compras', etiqueta: '🛒 Comprar para bodega' },
  { id: 'agotados', etiqueta: '⚠ Agotados que duelen' },
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
  const opciones = useMemo(() => [TODAS, ...sucursales, ...(FERIAS ? [FERIAS] : [])], [sucursales])

  const [sel, setSel]       = useState(TODAS.slug)
  const [vista, setVista]   = useState('venta')
  const [altaManual, setAltaManual] = useState(null)   // null = automático
  const [margen, setMargen] = useState(MARGEN_FERIA)
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
      const slugs = [...sucursales.map(s => s.slug), BODEGA.slug, ...(FERIAS ? [FERIAS.slug] : [])]
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

  const esFeria = !!FERIAS && sel === FERIAS.slug

  // Ferias se calcula contra lo que vendio en esa misma feria los años
  // anteriores, no contra un ritmo diario: ocho meses del año esta cerrada.
  const feria = useMemo(() => {
    if (!esFeria || !datos?.[FERIAS.slug]?.hist) return null
    const hist = datos[FERIAS.slug].hist
    const objetivo = proximaFeria(hist)
    if (!objetivo) return null
    const inv = datos[FERIAS.slug].inv

    // Lo que han vendido las tiendas fijas en todo su historial. Es el dato
    // que la feria puede aprovechar; al revés no, y por eso el consolidado de
    // tiendas no mira nunca a ferias.
    const enTiendas = velocidadCombinada(sucursales.map(s => datos[s.slug]?.hist)).piezas

    return {
      objetivo,
      meses: mesesActivos(hist),
      ...calcularSurtidoFeria({ productos: inv?.productos ?? [], historial: hist, objetivo, ventaTiendas: enTiendas, margen }),
    }
  }, [esFeria, datos, sucursales, margen])

  // La vista de una sucursal usa su propia tabla; la de "Todas" se arma
  // sumando existencias y ritmos de las tres.
  const filas = useMemo(() => {
    if (!datos) return []
    if (esFeria) return feria ? separarProduccion(feria.filas).compra : []
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
  }, [datos, sel, porSucursal, sucursales, cobertura, esFeria, feria])

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

  // Bodega, recien llegados y depurar se calculan sobre las tiendas fijas. Con
  // Ferias elegida no vienen a cuento, asi que se esconden en vez de enseñar
  // numeros que no son de lo que se esta mirando.
  const vistasVisibles = useMemo(
    () => (esFeria
      ? VISTAS.filter(v => ['venta', 'muestra', 'candidatos'].includes(v.id))
      // Comprar es una decisión del negocio entero, no de una plaza: solo
      // tiene sentido mirándolo todo junto.
      : VISTAS.filter(v => v.id !== 'candidatos' && (!['compras', 'agotados'].includes(v.id) || sel === TODAS.slug))),
    [esFeria, sel],
  )

  useEffect(() => {
    if (!vistasVisibles.some(v => v.id === vista)) setVista('venta')
  }, [vistasVisibles, vista])

  // Qué pedirle al proveedor para que bodega aguante los próximos meses. Usa
  // el historial de TODAS las plazas, ferias incluida, porque la compra es
  // para el negocio entero.
  const compras = useMemo(() => {
    if (!datos || !bodegaInv) return null
    const historiales = [...sucursales.map(s => datos[s.slug]?.hist), datos[FERIAS?.slug]?.hist]
    return calcularCompras({ historiales, productosBodega: bodegaInv.productos })
  }, [datos, sucursales, bodegaInv])

  // Modelos en cero que siguen vendiéndose y siguen vigentes. No es lo mismo
  // que algo se acabe porque ya nadie lo pide que porque se surtió mal.
  const agotados = useMemo(() => {
    if (!datos || !bodegaInv) return null
    const inventarios = Object.fromEntries(sucursales.map(s => [s.slug, datos[s.slug]?.inv]))
    const historiales = [...sucursales.map(s => datos[s.slug]?.hist), datos[FERIAS?.slug]?.hist]
    return analizarAgotados({ inventarios, historiales, productosBodega: bodegaInv.productos })
  }, [datos, sucursales, bodegaInv])

  const comprasVenta = useMemo(
    () => (compras ? separarProduccion(compras.filas).compra.filter(f => f.sugerido > 0) : []),
    [compras],
  )

  const porVenta  = useMemo(() => filas.filter(f => f.motivo === MOTIVOS.VENTA && f.sugerido > 0).sort((a, b) => b.sugerido - a.sugerido || a.cobertura - b.cobertura), [filas])
  const muestras  = useMemo(() => filas.filter(f => f.motivo === MOTIVOS.SIN_VENTA_CERO).sort((a, b) => a.producto.localeCompare(b.producto)), [filas])
  const candidatos = useMemo(() => filas.filter(f => f.motivo === MOTIVOS.CANDIDATO).sort((a, b) => b.enTiendas - a.enTiendas), [filas])

  const piezasVenta = porVenta.reduce((a, f) => a + f.sugerido, 0)
  const nombreSel = opciones.find(o => o.slug === sel)?.nombre ?? ''

  // Se baja el libro entero, no solo la vista que se está mirando: las cuatro
  // hojas se leen juntas al decidir un pedido.
  const exportar = () => descargarSurtido({
    sucursal: nombreSel,
    meta: esFeria
      ? { cobertura: feria?.diasRestantes ?? 0, esAlta: false, diasHistorial, margen }
      : { cobertura, esAlta, diasHistorial },
    porVenta,
    muestras,
    bodega,
    depurar: depurar.filas,
    nuevos: depurar.nuevos,
    agotados: agotados?.filas ?? [],
    candidatos: esFeria ? candidatos : null,
    bodegaStock,
    esFeria,
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

      {/* Ferias: su propio contexto, porque no se rige por temporada alta */}
      {esFeria && feria && (
        <div style={{ marginBottom: 14, padding: '12px 14px', borderRadius: 16, background: 'rgba(2,136,173,0.05)', border: '1px solid rgba(2,136,173,0.25)' }}>
          <p style={{ fontSize: 13, color: TINTA, margin: '0 0 4px', fontWeight: 700 }}>
            Feria de {MES[feria.objetivo.mes]} {feria.objetivo.anio}
            {feria.objetivo.enCurso && <span style={{ color: VERDE }}> · en curso</span>}
          </p>
          <p style={{ fontSize: 11.5, color: TINTA_SUAVE, margin: 0, lineHeight: 1.55 }}>
            Es la misma cuenta que para una tienda —ritmo por días de cobertura, menos lo que ya hay—
            con dos ajustes. El ritmo se mide por <strong style={{ color: TINTA }}>día abierto</strong>,
            no del calendario: dividir entre 365 daría 4 piezas al día cuando en enero vende 52.
            Y la cobertura son los <strong style={{ color: TINTA }}>{feria.diasRestantes} días</strong> que
            le quedan a esta feria, no 30 fijos.
          </p>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 8, fontSize: 11, color: TINTA_SUAVE }}>
            <span>Ediciones anteriores: <strong style={{ color: TINTA }}>{feria.ediciones}</strong>
              {feria.periodos.length > 0 && ` (${feria.periodos.join(', ')})`}, {feria.diasPrevios} días abiertos</span>
            {feria.diasActuales > 0 && <span>Esta lleva <strong style={{ color: TINTA }}>{feria.diasActuales} días</strong></span>}
            <span>Referencia: <strong style={{ color: TINTA }}>{Math.round(feria.totalEsperado)} piezas</strong></span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(2,136,173,0.2)' }}>
            <span style={{ fontSize: 11.5, color: TINTA_SUAVE }}>
              Margen de seguridad: pide <strong style={{ color: TINTA }}>{Math.round(margen * 100)}%</strong> sobre lo proyectado
            </span>
            <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
              {MARGENES.map(m => (
                <Pildora key={m} activa={margen === m} onClick={() => setMargen(m)}>{Math.round(m * 100)}%</Pildora>
              ))}
            </div>
          </div>
          <p style={{ fontSize: 11, color: TINTA_TENUE, margin: '6px 0 0', lineHeight: 1.5 }}>
            Sin margen la cuenta sale justa, y justa quiere decir acabar la feria en cero. Lo que sobra
            vuelve a bodega y se vende en otra plaza; lo que falta es una venta perdida que no vuelve.
          </p>
          {feria.diasActuales > 0 && (
            <p style={{ fontSize: 11, color: TINTA_TENUE, margin: '6px 0 0', lineHeight: 1.5 }}>
              Lo que va vendido en esta edición pesa <strong style={{ color: TINTA_SUAVE }}>{Math.round(feria.peso * 100)}%</strong> del
              ritmo; el resto lo pone el historial. Al principio manda lo viejo, porque dos días de ventas
              no son una tendencia, y conforme avanza el mes manda lo de ahora.
            </p>
          )}
          <p style={{ fontSize: 11, color: TINTA_TENUE, margin: '6px 0 0' }}>
            Meses con feria detectados: {feria.meses.map(m => `${MES[m.mes]} (${m.veces})`).join(' · ')}
          </p>
        </div>
      )}

      {/* Temporada */}
      {!esFeria && (
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
      )}

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
        {vistasVisibles.map(v => (
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
              {esFeria && <Th num style={{ textAlign: 'right' }} title="Piezas vendidas en lo que va de esta feria">Este mes</Th>}
              {bodegaStock && !esFeria && <Th num style={{ textAlign: 'right' }} title="Existencia en bodega de ese modelo">En bodega</Th>}
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
                  {esFeria && <Celda num color={f.esteMes > 0 ? '#0288AD' : TINTA_TENUE}>{f.esteMes || '—'}</Celda>}
                  {bodegaStock && !esFeria && (() => {
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

      {/* ── Se venden en tienda pero nunca han ido a la feria ── */}
      {vista === 'candidatos' && (
        <>
          <Aviso tono="info">
            Modelos que las tiendas sí venden y que nunca se han llevado a esta feria. No se
            sugiere cantidad: lo que se vende en mostrador no dice cuánto se venderá en un
            puesto de feria. Es para que decidas cuáles vale la pena probar.
          </Aviso>
          {candidatos.length === 0
            ? <p style={{ fontSize: 13, color: TINTA_TENUE }}>No hay modelos en este caso.</p>
            : <Tabla encabezados={<>
                <Th>Modelo</Th><Th>Código</Th>
                <Th num style={{ textAlign: 'right' }}>En la feria</Th>
                <Th num style={{ textAlign: 'right' }}>Vendidas en tienda</Th>
              </>}>
                {candidatos.slice(0, TOPE).map((f, i) => (
                  <tr key={f.codigo + i} style={{ background: i % 2 ? '#FBFDFD' : '#fff' }}>
                    <Modelo f={f} />
                    <Celda num color={f.existencia > 0 ? TINTA : TINTA_TENUE}>{f.existencia}</Celda>
                    <Celda num fuerte color={VERDE}>{f.enTiendas}</Celda>
                  </tr>
                ))}
              </Tabla>}
        </>
      )}

      {/* ── Agotados que duelen ── */}
      {vista === 'agotados' && (!agotados
        ? <Aviso>Hace falta el inventario de bodega para cruzarlo.</Aviso>
        : <>
            <Aviso tono="info">
              Modelos en cero que <strong>se siguen vendiendo</strong> y <strong>siguen vigentes</strong>.
              Que algo se acabe porque ya nadie lo pide es normal; que se acabe lo que sí se pide es una
              venta rechazada cada vez. Solo entra lo vendido en los últimos {MESES_RECIENTES} meses:
              sin ese filtro la lista se llenaba de modelos con dos años agotados que nadie repuso porque
              ya no se buscan. Los días salen del último movimiento registrado.
            </Aviso>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
              <Dato valor={agotados.compra.length} etiqueta="hay que comprar" nota="nadie tiene" color={ROSA} />
              <Dato valor={agotados.reparto.length} etiqueta="solo repartir" nota="bodega sí tiene" color={AMBAR} />
              <Dato valor={agotados.normal.length} etiqueta="con relevo" nota="ya hay generación nueva" color={TINTA_TENUE} />
            </div>

            <Tabla encabezados={<>
              <Th>Modelo</Th><Th>Código</Th>
              <Th num style={{ textAlign: 'right' }}>En cero</Th>
              <Th num style={{ textAlign: 'right' }} title="Días desde el último movimiento">Días</Th>
              <Th num style={{ textAlign: 'right' }} title={`Piezas vendidas en los últimos ${MESES_RECIENTES} meses`}>Vendió</Th>
              <Th num style={{ textAlign: 'right' }}>Bodega</Th>
              <Th>Qué hacer</Th>
            </>}>
              {agotados.filas.slice(0, TOPE).map((a, i) => (
                <tr key={a.codigo + i} style={{ background: i % 2 ? '#FBFDFD' : '#fff' }}>
                  <Modelo f={a} />
                  <Celda num color={a.plazasConStock === 0 ? ROSA : AMBAR}>
                    {a.plazasEnCero}/{a.plazasEnCero + a.plazasConStock}
                  </Celda>
                  <Celda num color={a.diasAgotado > 30 ? ROSA : TINTA_SUAVE}>{a.diasAgotado ?? '—'}</Celda>
                  <Celda num fuerte color={'#0288AD'}>{a.vendioReciente}</Celda>
                  <Celda num color={a.bodega > 0 ? VERDE : ROSA}>{a.existeEnBodega ? a.bodega : '—'}</Celda>
                  <Celda color={a.estado === 'compra' ? ROSA : a.estado === 'reparto' ? AMBAR : TINTA_TENUE}>
                    {a.estado === 'compra' ? 'Comprar: nadie tiene'
                     : a.estado === 'reparto' ? `Repartir: bodega tiene ${a.bodega}`
                     : `Relevo: ${a.sucesorNombre}`}
                  </Celda>
                </tr>
              ))}
            </Tabla>
          </>)}

      {/* ── Comprar para bodega ── */}
      {vista === 'compras' && (!compras
        ? <Aviso>Hace falta el inventario de bodega para calcular la compra.</Aviso>
        : <>
            <div style={{ marginBottom: 14, padding: '12px 14px', borderRadius: 16, background: 'rgba(94,148,34,0.05)', border: '1px solid rgba(94,148,34,0.25)' }}>
              <p style={{ fontSize: 13, color: TINTA, margin: '0 0 4px', fontWeight: 700 }}>
                Compra para que bodega aguante {compras.nMeses} meses
                {compras.alta && <span style={{ color: ROSA }}> · temporada alta</span>}
              </p>
              <p style={{ fontSize: 11.5, color: TINTA_SUAVE, margin: 0, lineHeight: 1.55 }}>
                Cubre <strong style={{ color: TINTA }}>{compras.objetivo.join(' y ')}</strong>, y la referencia
                es lo que se vendió en <strong style={{ color: TINTA }}>{compras.referencia.join(' y ')}</strong> —
                los mismos meses del año pasado, en todas las plazas y ferias juntas. Comparar contra el mes
                pasado no diría nada sobre diciembre.
              </p>
              {compras.faltantes.length > 0 && (
                <p style={{ fontSize: 11, color: AMBAR, margin: '6px 0 0' }}>
                  Sin dato para {compras.faltantes.join(', ')}: la referencia de esos meses sale incompleta.
                </p>
              )}
              <p style={{ fontSize: 11, color: TINTA_TENUE, margin: '6px 0 0', lineHeight: 1.5 }}>
                La demanda de una generación vieja se compra en la nueva: si el año pasado se vendieron
                fundas de Galaxy A16 y hoy existe la A17, se compra A17.
                Se detectaron <strong style={{ color: TINTA_SUAVE }}>{compras.cambios.length} relevos</strong> del
                propio catálogo, confirmados con la fecha de alta — no con una regla inventada por marca.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
              <Dato valor={comprasVenta.length} etiqueta="modelos a comprar" color={VERDE} />
              <Dato valor={comprasVenta.reduce((a, f) => a + f.sugerido, 0)} etiqueta="piezas en total" />
              <Dato valor={compras.descartados.length} etiqueta="no se compran" nota="generación vieja" color={AMBAR} />
            </div>

            <Tabla encabezados={<>
              <Th>Modelo</Th><Th>Código</Th>
              <Th num style={{ textAlign: 'right' }}>En bodega</Th>
              <Th num style={{ textAlign: 'right' }} title="Piezas vendidas en los mismos meses del año pasado">Demanda</Th>
              <Th num style={{ textAlign: 'right' }}>COMPRAR</Th>
              <Th>Hereda de</Th>
            </>}>
              {comprasVenta.slice(0, TOPE).map((f, i) => (
                <tr key={f.codigo + i} style={{ background: i % 2 ? '#FBFDFD' : '#fff' }}>
                  <Modelo f={f} />
                  <Celda num color={f.enCatalogo ? TINTA : ROSA}
                         title={f.enCatalogo ? undefined : 'Bodega no maneja este código: hay que darlo de alta'}>
                    {f.enCatalogo ? f.existencia : 'alta'}
                  </Celda>
                  <Celda num color={TINTA_SUAVE}>{Math.round(f.esperado)}</Celda>
                  <Celda num fuerte color={VERDE}>{f.sugerido}</Celda>
                  <Celda color={TINTA_TENUE}>
                    {f.heredado.length ? f.heredado.map(h => h.codigo).join(', ') : '—'}
                  </Celda>
                </tr>
              ))}
            </Tabla>

            {compras.descartados.length > 0 && (
              <>
                <p style={{ fontSize: 12, fontWeight: 700, color: TINTA, margin: '4px 0 8px' }}>
                  No se compran: la demanda pasó a la generación nueva
                </p>
                <Tabla encabezados={<>
                  <Th>Modelo</Th><Th>Código</Th>
                  <Th num style={{ textAlign: 'right' }}>Vendió</Th>
                  <Th>Se compra en su lugar</Th>
                </>}>
                  {compras.descartados.slice(0, 60).map((d, i) => (
                    <tr key={d.codigo + i} style={{ background: i % 2 ? '#FBFDFD' : '#fff' }}>
                      <Modelo f={d} />
                      <Celda num color={TINTA_SUAVE}>{d.piezas}</Celda>
                      <Celda color={VERDE}>{d.sustitutoNombre}</Celda>
                    </tr>
                  ))}
                </Tabla>
              </>
            )}
          </>)}

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
