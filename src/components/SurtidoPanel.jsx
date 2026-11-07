import { useState, useEffect, useMemo } from 'react'
import { SUCURSALES_ACTIVAS, SUCURSALES, BODEGA } from '../lib/sucursales'
import { inventarioJsonUrl, historialUrl, estadisticasUrl } from '../lib/s3'
import {
  velocidadDiaria, velocidadCombinada, calcularSurtido, analizarBodega,
  candidatosADepurar, esTemporadaAlta, COBERTURA, MOTIVOS,
  DIAS_PARA_CONFIAR, DIAS_PARA_DEPURAR, DIAS_EN_CATALOGO, diasEnCatalogo,
  DIAS_RECIEN_LLEGADO, mapaDeAltas,
  mesesActivos, proximaFeria, calcularSurtidoFeria, MARGENES, MARGEN_FERIA,
} from '../lib/surtido'
import { descargarSurtido } from '../lib/exportarSurtido'
import { calcularCompraBodega, analizarAgotados, MESES_COBERTURA, MESES_RECIENTES, MESES_CORTOS, DIAS_SIN_COMPRAR, piezasPerdidas } from '../lib/compras'
import { separarProduccion } from '../lib/produccion'
import { useOrdenTabla } from '../lib/orden'
import { clasePorModelo, agotadosPorUbicacion } from '../lib/clases'
import BarrasAgotados from './BarrasAgotados'
import { useAuth } from '../context/AuthContext'
import { useSurtidos } from '../lib/useSurtidos'
import { cuadrar, lineasDesdeSurtido, resumirFolios, puedeSurtir, veBodega, ESTADOS as ESTADOS_SURTIDO, DIAS_PARA_DAR_DE_ALTA } from '../lib/surtidos'
import { salidasEntre } from '../lib/radiografia'
import {
  interpretar, conAjuste, aplicarAjustes, resumirAjustes, limpiarAmbito,
  leerGuardado, guardar,
} from '../lib/ajusteCompra'

// Para la columna de reparto: «leon 9 · slp 4» cabe, los nombres largos no.
const NOMBRE_CORTO = {
  leon: 'León', 'san-luis': 'SLP', aguascalientes: 'Ags', torreon: 'Torreón',
}

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

// Cada vista pertenece a un ámbito. Mirar lo de sucursales y lo de bodega en
// la misma fila de pestañas obligaba a leer el título para saber de qué se
// estaba hablando; el panel las separa en dos secciones y cada una pide solo
// las suyas.
const VISTAS = [
  { id: 'venta',      etiqueta: 'Pedir por venta',         ambito: 'sucursales' },
  { id: 'muestra',    etiqueta: 'Sin venta y agotados',    ambito: 'sucursales' },
  { id: 'candidatos', etiqueta: 'Se venden en tienda',     ambito: 'sucursales' },
  { id: 'nuevos',     etiqueta: 'Recién llegados',         ambito: 'sucursales' },
  { id: 'depurar',    etiqueta: 'Depurar',                 ambito: 'sucursales' },
  { id: 'bodega',     etiqueta: 'Lo que puede surtir',     ambito: 'bodega' },
  { id: 'compras',    etiqueta: '🛒 Comprar al proveedor', ambito: 'bodega' },
  { id: 'agotados',   etiqueta: '⚠ Agotados que duelen',   ambito: 'bodega' },
]

function Pildora({ activa, onClick, children, tenue }) {
  // El botón de la casa, en `.chip-plaza`: blanco por dentro, trazo y letra
  // en degradado. Antes era una píldora rellena de cian y verde, que es el
  // único sitio donde seguía viva esa paleta.
  return (
    <button type="button" onClick={onClick}
            className={'chip-plaza' + (activa ? ' activa' : '')}
            aria-pressed={activa}
            style={tenue ? { opacity: 0.75 } : undefined}>
      <span className="chip-plaza-texto">{children}</span>
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

// `num` se saca del resto a proposito: si cae en `...r` acaba escupido al
// <th> como atributo del DOM y React avisa en consola de cada cabecera
// numerica. No rompe nada, pero llena la consola de ruido y el dia que haya
// un error de verdad no se va a ver. Solo se nota mirando un navegador.
const Th = ({ children, campo, valor, orden, num, ...r }) => {
  const activa = orden && campo && orden.campo === campo
  const puedeOrdenar = !!(orden && campo)

  return (
    <th {...r}
      onClick={puedeOrdenar ? () => orden.alternar(campo, valor) : undefined}
      aria-sort={!puedeOrdenar ? undefined : activa ? (orden.dir === -1 ? 'descending' : 'ascending') : 'none'}
      title={puedeOrdenar ? 'Clic para ordenar' : r.title}
      style={{
        textAlign: num ? 'right' : 'left', padding: '9px 10px', fontWeight: 700,
        color: activa ? TINTA : TINTA_SUAVE, fontSize: 11,
        borderBottom: '1px solid ' + LINEA, whiteSpace: 'nowrap',
        cursor: puedeOrdenar ? 'pointer' : 'default',
        userSelect: 'none',
        ...r.style,
      }}>
      {children}
      {puedeOrdenar && (
        <span style={{ marginLeft: 4, fontSize: 9, color: activa ? ROSA : 'rgba(133,152,161,0.5)' }}>
          {activa ? (orden.dir === -1 ? '▼' : '▲') : '⇅'}
        </span>
      )}
    </th>
  )
}

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

/**
 * La cantidad a pedir, editable con doble clic.
 *
 * Doble clic y no un clic: la tabla se ordena y se recorre a golpe de ratón,
 * y con un solo clic se abriría una celda cada vez que alguien quiere mirar.
 * El doble clic es deliberado, que es lo que tiene que ser cambiar una
 * compra.
 *
 * Tres cosas que parecen detalle y no lo son:
 *
 *   · **Escape cancela.** Sin salida, el único camino para deshacer un
 *     tecleo a medias es escribir el número viejo de memoria.
 *   · **Vaciar quita el ajuste**, no pone cero. Un cero escrito sí es cero
 *     -«de éste no pidas ninguno»-, y los dos casos existen.
 *   · **La sugerencia original se sigue viendo** cuando hay ajuste. Un número
 *     cambiado sin referencia no se puede revisar.
 */
/**
 * Lo que llevas cambiado a mano, y cómo deshacerlo.
 *
 * Importa que esté a la vista. Los ajustes se guardan en el navegador y
 * sobreviven a cerrar la pestaña, así que sin este aviso alguien puede bajar
 * dentro de dos semanas un Excel con los ajustes de hoy puestos y no
 * entender por qué los números no son los que calcula la pantalla. La cifra
 * de al lado -cuánto suma o resta sobre lo sugerido- es la que lo delata de
 * un vistazo.
 */
function AvisoAjustes({ filas, ambito, onLimpiar }) {
  const r = resumirAjustes(filas)
  if (!r.cuantos) return null

  const signo = r.diferencia > 0 ? '+' : ''
  return (
    <div style={{
      display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap',
      border: '1px solid #BAE6FD', background: 'rgba(2,136,173,0.07)',
      borderRadius: 14, padding: '10px 14px', marginBottom: 12,
    }}>
      <span style={{ fontSize: 12, color: '#0A5B73', flex: 1 }}>
        <strong>{r.cuantos} {r.cuantos === 1 ? 'cantidad cambiada' : 'cantidades cambiadas'} a mano</strong>
        {r.subidas > 0 && <> · {r.subidas} {r.subidas === 1 ? 'subida' : 'subidas'}</>}
        {r.bajadas > 0 && <> · {r.bajadas} {r.bajadas === 1 ? 'bajada' : 'bajadas'}</>}
        {r.diferencia !== 0 && (
          <> · <strong>{signo}{r.diferencia} piezas</strong> sobre lo sugerido</>
        )}
        . El Excel sale con estos números.
      </span>
      <button type="button" onClick={() => onLimpiar(ambito)}
              style={{ fontSize: 11, color: '#0A5B73', background: 'none', border: 'none',
                       cursor: 'pointer', textDecoration: 'underline', fontWeight: 700 }}>
        Volver a lo sugerido
      </button>
    </div>
  )
}

function CeldaPedir({ fila, ambito, onCambiar, color = VERDE }) {
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState('')
  const [error, setError] = useState(null)

  const abrir = () => {
    setTexto(String(fila.sugerido ?? ''))
    setError(null)
    setEditando(true)
  }

  const cerrar = guardando => {
    if (!guardando) { setEditando(false); setError(null); return }
    const r = interpretar(texto)
    if (!r.ok) { setError(r.porque); return }
    onCambiar(ambito, fila.codigo, r.quitar ? null : r.valor)
    setEditando(false)
    setError(null)
  }

  if (editando) {
    return (
      <td style={{ padding: '4px 6px', textAlign: 'right' }}>
        <input
          autoFocus
          value={texto}
          onChange={e => { setTexto(e.target.value); setError(null) }}
          onBlur={() => cerrar(true)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); cerrar(true) }
            if (e.key === 'Escape') { e.preventDefault(); cerrar(false) }
          }}
          title={error || 'Enter para guardar · Escape para cancelar · vacío quita el ajuste'}
          style={{
            width: 72, textAlign: 'right', fontWeight: 800, fontSize: 13,
            padding: '3px 6px', borderRadius: 8,
            border: '1.5px solid ' + (error ? ROSA : '#0288AD'),
            fontVariantNumeric: 'tabular-nums', color: TINTA,
          }} />
        {error && (
          <div style={{ fontSize: 10, color: ROSA, maxWidth: 150, lineHeight: 1.3 }}>{error}</div>
        )}
      </td>
    )
  }

  return (
    <td onDoubleClick={abrir}
        data-pedir={fila.codigo}
        data-ajustado={fila.ajustado ? '1' : '0'}
        title={fila.ajustado
          ? `Lo cambiaste tú. La cuenta decía ${fila.sugeridoOriginal}. Doble clic para volver a cambiarlo; vacío lo deja como estaba.`
          : 'Doble clic para cambiar la cantidad'}
        style={{
          padding: '7px 10px', textAlign: 'right', cursor: 'pointer',
          color: fila.ajustado ? '#0288AD' : color, fontWeight: 800,
          fontVariantNumeric: 'tabular-nums',
          // Un subrayado punteado: dice «esto se puede tocar» sin gritar.
          textDecoration: 'underline dotted',
          textUnderlineOffset: 3,
        }}>
      {fila.sugerido || (fila.sugerido === 0 ? '0' : '—')}
      {fila.ajustado && (
        <span style={{ display: 'block', fontSize: 10, fontWeight: 600, color: TINTA_TENUE }}>
          antes {fila.sugeridoOriginal}
        </span>
      )}
    </td>
  )
}

const Modelo = ({ f }) => (
  <>
    <Celda>
      <span style={{ display: 'block', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.producto}</span>
    </Celda>
    <td style={{ padding: '7px 10px', color: TINTA_TENUE, fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>{f.codigo}</td>
  </>
)

/**
 * `foco` llega desde el tablero cuando se pulsa «Ver» en una alerta. Sin él,
 * el boton solo cambiaba de seccion y dejaba al dueno buscando a mano cual de
 * los 86 renglones era el que le estaban senalando.
 *
 * Trae `{ vista, filtro }`: la pestana que abrir y que subconjunto marcar.
 */
/**
 * Lo que ya salio de bodega, y si llego.
 *
 * El estado no lo marca nadie: lo decide el respaldo de la tienda. Cuando el
 * ALTA aparece -hasta cuatro dias, que puso el dueño- el folio cuadra o
 * enseña la diferencia; pasados esos dias sin aparecer, es otro problema y se
 * dice distinto: nadie lo ha dado de alta.
 */
function Folios({ cuadres, resumen, onCerrar, puedeCerrar }) {
  const COLOR = {
    [ESTADOS_SURTIDO.CUADRA]:     VERDE,
    [ESTADOS_SURTIDO.DIFERENCIA]: ROSA,
    [ESTADOS_SURTIDO.TARDE]:      AMBAR,
    [ESTADOS_SURTIDO.EN_CAMINO]:  TINTA_TENUE,
  }
  const TEXTO = {
    [ESTADOS_SURTIDO.CUADRA]:     'Cuadra',
    [ESTADOS_SURTIDO.DIFERENCIA]: 'Diferencia',
    [ESTADOS_SURTIDO.TARDE]:      'Sin dar de alta',
    [ESTADOS_SURTIDO.EN_CAMINO]:  'En camino',
  }

  const abiertos = cuadres.filter(c => !c.cerrado)
  if (!abiertos.length) return null

  return (
    <section style={{ border: '1px solid ' + LINEA, borderRadius: 22, padding: '18px 20px', marginBottom: 18 }}>
      <h4 style={{ fontSize: 13, fontWeight: 800, color: TINTA, margin: '0 0 4px' }}>
        Lo que ya salio de bodega
      </h4>
      <p style={{ fontSize: 11.5, color: TINTA_SUAVE, margin: '0 0 14px', lineHeight: 1.55 }}>
        {resumen.enCamino > 0 && <>{resumen.enCamino} en camino. </>}
        {resumen.diferencia > 0 && (
          <><strong style={{ color: ROSA }}>{resumen.diferencia} con diferencia</strong>
            {resumen.piezasQueFaltan > 0 && <> ({resumen.piezasQueFaltan} piezas que faltan)</>}. </>
        )}
        {resumen.tarde > 0 && (
          <><strong style={{ color: AMBAR }}>{resumen.tarde} sin dar de alta</strong> pasados los {DIAS_PARA_DAR_DE_ALTA} dias. </>
        )}
        Nadie cuenta nada a mano: el conteo es el alta que hace la tienda en su propia caja, y se
        compara descontando lo que vendio mientras recibia.
      </p>

      <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {abiertos.map(c => (
          <li key={c.folio} data-folio={c.folio} data-estado={c.estado}
              style={{ borderTop: '1px solid ' + LINEA, paddingTop: 10 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: COLOR[c.estado] }}>
                {TEXTO[c.estado]}
              </span>
              <span style={{ fontSize: 12.5, color: TINTA, fontWeight: 700 }}>
                {NOMBRE_CORTO[c.destino] ?? c.destino}
              </span>
              <span style={{ fontSize: 11.5, color: TINTA_TENUE, flex: 1 }}>
                {c.folio} · {c.dias === 0 ? 'hoy' : `hace ${c.dias} d`} ·
                {' '}{c.piezasQueSalieron} pz salieron
                {c.estado !== ESTADOS_SURTIDO.EN_CAMINO && c.estado !== ESTADOS_SURTIDO.TARDE
                  && <>, {c.piezasQueEntraron} entraron</>}
              </span>
              {puedeCerrar && (
                <button type="button" onClick={() => onCerrar(c.folio)}
                        style={{ fontSize: 11, color: TINTA_SUAVE, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                  Dar por visto
                </button>
              )}
            </div>

            {/* Solo las lineas que no cuadran. Las que cuadran no hay que
                mirarlas, y enseñarlas esconderia las dos que importan. */}
            {c.conDiferencia.length > 0 && (
              <ul style={{ listStyle: 'none', margin: '8px 0 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {c.conDiferencia.slice(0, 6).map(f => (
                  <li key={f.codigo} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 10, fontSize: 11.5 }}>
                    {/* El CODIGO delante: una diferencia de piezas es alerta
                        sensible, y eso se persigue por codigo, no por nombre. */}
                    <span style={{ fontWeight: 800, color: TINTA, minWidth: '8ch' }}>{f.codigo}</span>
                    <span style={{ color: TINTA_SUAVE, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          title={f.producto}>{f.producto}</span>
                    <span style={{ fontWeight: 800, color: f.diferencia < 0 ? ROSA : AMBAR, whiteSpace: 'nowrap' }}>
                      {f.diferencia < 0 ? `faltan ${-f.diferencia}` : `sobran ${f.diferencia}`}
                      {' '}<span style={{ color: TINTA_TENUE, fontWeight: 600 }}>
                        (salieron {f.piezas}, entraron {f.entraron})
                      </span>
                    </span>
                  </li>
                ))}
                {c.filas.some(f => f.sinVender) && (
                  <li style={{ fontSize: 11, color: AMBAR }}>
                    Sin el archivo de venta de esa plaza, estas cuentas no descuentan lo que se
                    vendio mientras recibia: la diferencia puede ser mercancia que se vendio.
                  </li>
                )}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

export default function SurtidoPanel({ ambito = 'todo', foco = null, plaza = null }) {
  const sucursales = SUCURSALES_ACTIVAS
  const opciones = useMemo(() => [TODAS, ...sucursales, ...(FERIAS ? [FERIAS] : [])], [sucursales])

  // La sucursal entra ya con la suya puesta: abrir en «todas» la obliga a
  // buscarse en una lista cada vez.
  const [sel, setSel]       = useState(plaza ?? TODAS.slug)
  const [vista, setVistaCruda] = useState(foco?.vista || (ambito === 'bodega' ? 'compras' : 'venta'))

  // El filtro que pidio la alerta. Se puede quitar desde la pantalla: una vez
  // visto lo senalado, lo normal es querer ver el resto.
  const [filtroFoco, setFiltroFoco] = useState(foco?.filtro ?? null)

  // Si llega un foco nuevo -se pulsa otra alerta sin salir del panel- manda el
  // nuevo, no el que estaba puesto.
  useEffect(() => {
    if (!foco) return
    if (foco.vista) setVistaCruda(foco.vista)
    setFiltroFoco(foco.filtro ?? null)
  }, [foco])
  const [altaManual, setAltaManual] = useState(null)   // null = automático
  const [margen, setMargen] = useState(MARGEN_FERIA)
  // Un solo orden para todo el panel. Al cambiar de vista se olvida, porque
  // las columnas son otras y mantenerlo dejaría la tabla ordenada por un
  // campo que ya no está a la vista.
  const ord = useOrdenTabla(null)

  // Cambiar de vista limpia el orden: las columnas son otras y dejarlo puesto
  // ordenaría por un campo que ya no está a la vista.
  const setVista = v => { ord.limpiar(); setVistaCruda(v) }
  const [datos, setDatos]   = useState(null)
  const [cargando, setCargando] = useState(true)

  // El registro de lo que ya salio. Va por capacidad y no por «admin»: cuando
  // exista el usuario del encargado de bodega lo hereda sin tocar esto.
  const { token, isAdmin, session } = useAuth()
  const { folios, registrar, cerrar, sinRed: sinRedSurtidos } = useSurtidos(token)

  // Por CAPACIDAD, no por «admin». Estaba atado a admin y con eso el usuario
  // del encargado de bodega -que es quien manda la mercancía- no habría
  // podido registrar nada, aunque el backend sí le dejara.
  const puedeRegistrar = puedeSurtir({ isAdmin, plaza: session?.branch })

  // Una tienda no ve lo de bodega. Va por SESION y no por el ambito de la
  // pantalla: el administrador mira el surtido de las sucursales con
  // `ambito="sucursales"` y ahi si debe verlo todo.
  const conBodega = veBodega({ isAdmin, plaza: session?.branch })
  // Los ajustes a mano sobre lo que se va a pedir. Se leen del navegador una
  // sola vez: si se leyeran en cada dibujo, escribir una cifra la pisaria con
  // la guardada en el dibujo siguiente.
  const [ajustes, setAjustes] = useState(() =>
    leerGuardado(typeof window === 'undefined' ? null : window.localStorage))

  const cambiarAjuste = (ambito, codigo, valor) => {
    setAjustes(previos => {
      const nuevos = conAjuste(previos, ambito, codigo, valor)
      guardar(typeof window === 'undefined' ? null : window.localStorage, nuevos)
      return nuevos
    })
  }

  const quitarAjustes = ambito => {
    setAjustes(previos => {
      const nuevos = limpiarAmbito(previos, ambito)
      guardar(typeof window === 'undefined' ? null : window.localStorage, nuevos)
      return nuevos
    })
  }

  const [registrando, setRegistrando] = useState(false)
  const [avisoSurtido, setAvisoSurtido] = useState(null)

  useEffect(() => {
    let cancelado = false
    setCargando(true)
    ;(async () => {
      const bajar = async url => {
        try { const r = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' }); return r.ok ? await r.json() : null }
        catch { return null }
      }
      const slugs = [...sucursales.map(s => s.slug), BODEGA.slug, ...(FERIAS ? [FERIAS.slug] : [])]
      // La estadistica diaria entra aqui por una sola razon: sin ella no se
      // puede saber cuanto vendio la tienda mientras recibia, y restar
      // existencias a secas acusa de piezas que se vendieron. Ver
      // `lib/surtidos.js`.
      const pares = await Promise.all(slugs.map(async slug => [slug, {
        inv:  await bajar(inventarioJsonUrl(slug)),
        hist: await bajar(historialUrl(slug)),
        est:  await bajar(estadisticasUrl(slug)),
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
  const esTodas = sel === TODAS.slug

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

  // La vista de una sucursal usa su propia tabla; la de "Todas" SUMA las tres.
  //
  // Antes juntaba existencias y ritmos y volvía a calcular sobre el total, y
  // eso respondía otra pregunta: «¿alcanza entre todas?». Con el iPhone 15 Pro
  // Max, León tenía 5 y le faltaban 9, San Luis tenía 12 y Aguascalientes 9;
  // el total daba 26 y «Todas» decía que no pidieras nada. Pero el cliente que
  // entra en León no compra de la repisa de San Luis. En junto pedía 720
  // piezas donde las sucursales pedían 1,447.
  //
  // Sumar las filas ya calculadas es coherente por construcción: lo que dice
  // «Todas» es exactamente lo que dicen las tres juntas, y de paso se ve de
  // dónde sale cada pieza.
  const filas = useMemo(() => {
    if (!datos) return []
    if (esFeria) return feria ? separarProduccion(feria.filas).compra : []
    if (sel !== TODAS.slug) return porSucursal[sel] ?? []

    const juntos = new Map()
    for (const s of sucursales) {
      for (const f of porSucursal[s.slug] ?? []) {
        const e = juntos.get(f.codigo) ?? {
          codigo: f.codigo, producto: f.producto,
          existencia: 0, vendidas: 0, ritmo: 0, objetivo: 0, sugerido: 0,
          motivo: f.motivo, plazas: [],
        }
        e.existencia += f.existencia
        e.vendidas   += f.vendidas
        e.ritmo      += f.ritmo
        e.objetivo   += f.objetivo
        e.sugerido   += f.sugerido
        if (f.sugerido > 0) e.plazas.push({ slug: s.slug, piezas: f.sugerido, existencia: f.existencia })
        // El motivo del renglón junto es el de quien de verdad pide algo.
        if (f.sugerido > 0 && e.motivo !== MOTIVOS.VENTA) e.motivo = f.motivo
        juntos.set(f.codigo, e)
      }
    }

    const filasJuntas = [...juntos.values()].map(e => ({
      ...e,
      cobertura: e.ritmo > 0 ? e.existencia / e.ritmo : null,
    }))

    return separarProduccion(filasJuntas).compra
  }, [datos, sel, porSucursal, sucursales, esFeria, feria])

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

  // Desde cuándo existe cada modelo en la empresa: la fecha más temprana de
  // todas las plazas, marcando cuáles son sólo una cota inferior. El detalle
  // está en mapaDeAltas, que es donde importa.
  const altas = useMemo(() => {
    if (!datos) return {}
    const porSuc = {}
    for (const s of sucursales) porSuc[s.slug] = datos[s.slug]?.inv?.productos ?? []
    porSuc.bodega = bodegaInv?.productos ?? []
    return mapaDeAltas(porSuc)
  }, [datos, sucursales, bodegaInv])

  const depurar = useMemo(() => candidatosADepurar(porSucursal, diasHistorial, altas), [porSucursal, diasHistorial, altas])

  // Bodega, recien llegados y depurar se calculan sobre las tiendas fijas. Con
  // Ferias elegida no vienen a cuento, asi que se esconden en vez de enseñar
  // numeros que no son de lo que se esta mirando.
  const vistasVisibles = useMemo(
    () => {
      const delAmbito = VISTAS.filter(v => ambito === 'todo' || v.ambito === ambito)
      if (esFeria) return delAmbito.filter(v => ['venta', 'muestra', 'candidatos'].includes(v.id))
      return delAmbito.filter(v =>
        v.id !== 'candidatos' &&
        // Comprar es una decisión del negocio entero, no de una plaza: solo
        // tiene sentido mirándolo todo junto.
        (!['compras', 'agotados'].includes(v.id) || sel === TODAS.slug))
    },
    [esFeria, sel, ambito],
  )

  useEffect(() => {
    if (!vistasVisibles.some(v => v.id === vista)) setVista(vistasVisibles[0]?.id ?? 'venta')
  }, [vistasVisibles, vista])

  // Qué pedirle al proveedor para que bodega aguante los próximos meses. Usa
  // el historial de TODAS las plazas, ferias incluida, porque la compra es
  // para el negocio entero.
  const compras = useMemo(() => {
    if (!datos || !bodegaInv) return null
    const historiales = [...sucursales.map(s => datos[s.slug]?.hist), datos[FERIAS?.slug]?.hist]
    const inventarios = Object.fromEntries(sucursales.map(s => [s.slug, datos[s.slug]?.inv]))
    const r = calcularCompraBodega({ historiales, inventarios, productosBodega: bodegaInv.productos })
    // Lo mismo aqui: el ajuste entra antes de la tabla y del Excel.
    const conAjustes = aplicarAjustes(r.filas, ajustes, 'compra')
    // Y el total se vuelve a sumar de las filas AJUSTADAS. La libreria lo
    // calculo con las originales, asi que dejarlo tal cual ponia la cabecera
    // a decir una cifra y la tabla otra, sin que nada avisara.
    return {
      ...r,
      filas: conAjustes,
      totalPiezas: conAjustes.reduce((a, f) => a + (Number(f.sugerido) || 0), 0),
    }
  }, [datos, sucursales, bodegaInv, ajustes])

  // Modelos en cero que siguen vendiéndose y siguen vigentes. No es lo mismo
  // que algo se acabe porque ya nadie lo pide que porque se surtió mal.
  const agotados = useMemo(() => {
    if (!datos || !bodegaInv) return null
    const inventarios = Object.fromEntries(sucursales.map(s => [s.slug, datos[s.slug]?.inv]))
    const historiales = [...sucursales.map(s => datos[s.slug]?.hist), datos[FERIAS?.slug]?.hist]
    return analizarAgotados({ inventarios, historiales, productosBodega: bodegaInv.productos })
  }, [datos, sucursales, bodegaInv])

  // Cuantos modelos en cero tiene cada ubicacion, repartidos por clase de
  // venta. Ferias queda fuera a proposito: cierra ocho meses al ano, asi que
  // su «agotado» no significa lo mismo que el de una tienda abierta.
  const porUbicacion = useMemo(() => {
    if (!agotados || !datos) return null
    const historiales = [...sucursales.map(s => datos[s.slug]?.hist), datos[FERIAS?.slug]?.hist]
    const clases = clasePorModelo(historiales)
    return agotadosPorUbicacion(agotados.filas, clases, sucursales, BODEGA)
  }, [agotados, datos, sucursales])

  // Lo que la alerta queria ensenar. Cada filtro dice tambien POR QUE, para
  // que quien llega desde el tablero entienda que esta mirando.
  const FOCOS = useMemo(() => ({
    claseA: {
      texto: 'modelos de clase A en cero',
      nota: 'Clase A es lo que vende 5 o más piezas al mes: 69 modelos que son el 58% de la venta.',
      filtrar: (filas, clases) => filas.filter(f => (clases?.[f.codigo] ?? 'C') === 'A'),
    },
    perdidas: {
      texto: 'los que más piezas están costando',
      nota: 'Ordenados por piezas que se habrían vendido: días agotado × lo que vendía al mes.',
      filtrar: filas => filas.filter(f => piezasPerdidas(f) > 0)
        .sort((a, b) => piezasPerdidas(b) - piezasPerdidas(a)),
    },
    inactivos: {
      texto: `los que se venden y bodega no compra hace ${DIAS_SIN_COMPRAR}+ días`,
      nota: 'La fuga no está en la tienda: está en que nadie los repuso.',
      filtrar: filas => filas.filter(f => f.bodegaDias !== null && f.bodegaDias >= DIAS_SIN_COMPRAR && f.vendiaAlMes > 0),
    },
  }), [])

  const focoActivo = filtroFoco ? FOCOS[filtroFoco] : null

  const filasAgotados = useMemo(() => {
    if (!agotados) return []
    if (!focoActivo) return agotados.filas
    const historiales = [...sucursales.map(s => datos?.[s.slug]?.hist), datos?.[FERIAS?.slug]?.hist]
    return focoActivo.filtrar(agotados.filas, clasePorModelo(historiales))
  }, [agotados, focoActivo, datos, sucursales])

  const comprasVenta = useMemo(
    () => (compras ? separarProduccion(compras.filas).compra.filter(f => f.sugerido > 0) : []),
    [compras],
  )

  // El ambito del surtido es la PLAZA: «mandar 50 a Leon» y «mandar 50 a San
  // Luis» son dos decisiones distintas y no pueden pisarse.
  const ambitoSurtido = `surtido:${sel}`

  const porVenta = useMemo(() => {
    const base = filas
      .filter(f => f.motivo === MOTIVOS.VENTA && f.sugerido > 0)
      .sort((a, b) => b.sugerido - a.sugerido || a.cobertura - b.cobertura)
    // El ajuste se aplica ANTES de que las filas lleguen a ningun sitio: asi
    // la tabla, los totales y el Excel salen del mismo numero. Ajustando solo
    // la tabla, el Excel seguiria bajando la sugerencia y nadie lo notaria
    // hasta tener el pedido delante.
    return aplicarAjustes(base, ajustes, ambitoSurtido)
  }, [filas, ajustes, ambitoSurtido])
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
    depurar: depurar.filas,
    nuevos: depurar.nuevos,
    candidatos: esFeria ? candidatos : null,
    esFeria,
    // Todo lo de bodega sale del libro para una sucursal. El boton dice
    // «completo» y lo era: se llevaba el plan de compra al proveedor, los
    // agotados con su dinero perdido y el stock entero de bodega.
    //
    // Van en LISTA VACIA y no en null: `descargarSurtido` hace `bodega.length`
    // sin mirar, y un null le reventaria en la cara a quien pulse el boton.
    bodega:      conBodega ? bodega : [],
    agotados:    conBodega ? (agotados?.filas ?? []) : [],
    compras:     conBodega ? (compras?.filas ?? []) : [],
    bodegaStock: conBodega ? bodegaStock : null,
    fuga:        conBodega ? (agotados ?? null) : null,
  })

  // Cada folio, cuadrado contra el respaldo de su destino.
  //
  // El gancho va AQUI, por encima de los returns tempranos: un useMemo
  // colocado despues de un `if (cargando) return` cambia el numero de ganchos
  // entre dibujos y deja la pantalla entera en blanco. Ya paso una vez.
  const cuadres = useMemo(() => {
    if (!datos) return []
    const hoy = new Date()
    return Object.values(folios).map(f => {
      const d = datos[f.destino]
      // Lo que la tienda vendio desde que salio la caja. Sin este termino la
      // cuenta sale corta y acusa de piezas que estan en una bolsa de cliente.
      const desde = String(f.cuando).slice(0, 10)
      const vendidas = d?.est ? salidasEntre(d.est, desde, hoy.toISOString().slice(0, 10)) : null
      return { ...cuadrar(f, { inventarioDestino: d?.inv, vendidas, hoy }), cerrado: f.cerrado ?? null }
    }).sort((a, b) => String(b.cuando).localeCompare(String(a.cuando)))
  }, [folios, datos])

  const resumenFolios = useMemo(() => resumirFolios(cuadres), [cuadres])

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

      <AvisoAjustes filas={porVenta} ambito={ambitoSurtido} onLimpiar={quitarAjustes} />

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <Dato valor={porVenta.length} etiqueta="modelos a pedir" nota="porque se venden" color={VERDE} />
        <Dato valor={piezasVenta} etiqueta="piezas en total" />
        <Dato valor={muestras.length} etiqueta="sin venta y en cero" nota="1 pieza de muestra" color={AMBAR} />
        {/* Los días de historial ya no se enseñan: era el del calendario más
            largo en todas las vistas, y el dato no cambia ninguna decisión.
            El número se sigue usando por dentro, para el aviso de historial
            corto y para no proponer depurar sin medición suficiente. */}
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
              <Th campo="producto" orden={ord}>Modelo</Th><Th campo="codigo" orden={ord}>Código</Th>
              <Th campo="existencia" orden={ord} num style={{ textAlign: 'right' }}>Tiene</Th>
              <Th campo="ritmo" orden={ord} num style={{ textAlign: 'right' }} title="Piezas que salen al día, sobre todo el historial">Ritmo</Th>
              <Th campo="cobertura" orden={ord} num style={{ textAlign: 'right' }} title="Días que aguanta con lo que tiene">Aguanta</Th>
              <Th campo="sugerido" orden={ord} num style={{ textAlign: 'right' }}>Pedir</Th>
              {esTodas && <Th title="De dónde sale cada pieza del total">Para quién</Th>}
              {esFeria && <Th campo="esteMes" orden={ord} num style={{ textAlign: 'right' }} title="Piezas vendidas en lo que va de esta feria">Este mes</Th>}
              {conBodega && bodegaStock && !esFeria && <Th campo="enBodega" valor={f => bodegaStock[f.codigo] ?? null} orden={ord} num style={{ textAlign: 'right' }} title="Existencia en bodega de ese modelo">En bodega</Th>}
            </>}>
              {ord.ordenar(porVenta).slice(0, TOPE).map((f, i) => (
                <tr key={f.codigo + i} style={{ background: i % 2 ? '#FBFDFD' : '#fff' }}>
                  <Modelo f={f} />
                  <Celda num>{f.existencia}</Celda>
                  <Celda num color={TINTA_SUAVE}>{f.ritmo.toFixed(2)}</Celda>
                  <Celda num color={f.cobertura !== null && f.cobertura < 7 ? ROSA : TINTA_SUAVE}>
                    {f.cobertura === null ? '—' : `${Math.floor(f.cobertura)} d`}
                  </Celda>
                  <CeldaPedir fila={f} ambito={ambitoSurtido} onCambiar={cambiarAjuste} />
                  {esTodas && (
                    <Celda color={TINTA_SUAVE}>
                      {(f.plazas ?? []).map(p => `${NOMBRE_CORTO[p.slug] ?? p.slug} ${p.piezas}`).join(' · ') || '—'}
                    </Celda>
                  )}
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
            : <Tabla encabezados={<><Th campo="producto" orden={ord}>Modelo</Th><Th campo="codigo" orden={ord}>Código</Th><Th campo="sugerido" orden={ord} num style={{ textAlign: 'right' }}>Pedir</Th></>}>
                {ord.ordenar(muestras).slice(0, TOPE).map((f, i) => (
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
                <Th campo="producto" orden={ord}>Modelo</Th><Th campo="codigo" orden={ord}>Código</Th>
                <Th campo="existencia" orden={ord} num style={{ textAlign: 'right' }}>En la feria</Th>
                <Th campo="enTiendas" orden={ord} num style={{ textAlign: 'right' }}>Vendidas en tienda</Th>
              </>}>
                {ord.ordenar(candidatos).slice(0, TOPE).map((f, i) => (
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
              {' '}La columna de {MESES_CORTOS} meses dice si se pide hoy, pero sale en cero cuando el
              modelo lleva tiempo agotado —no hay qué vender—. Para esos la que vale
              es <strong>Vendía/mes</strong>, que mide los tres meses anteriores a que se acabara: eso es
              lo que se está perdiendo cada mes que siga así.
            </Aviso>

            {porUbicacion && (
              <div style={{ marginBottom: 14 }}>
                <BarrasAgotados datos={porUbicacion} />
              </div>
            )}

            {/* Cuando se llega desde una alerta, se dice QUE se esta viendo y
                se deja quitarlo: una vez visto lo senalado, lo normal es
                querer ver el resto. */}
            {focoActivo && (
              <div className="foco-aviso">
                <span className="foco-marca" />
                <span>
                  Mostrando <strong>{filasAgotados.length}</strong> {focoActivo.texto}.
                  <br /><span className="foco-nota">{focoActivo.nota}</span>
                </span>
                <button type="button" onClick={() => setFiltroFoco(null)}>Ver los {agotados.filas.length}</button>
              </div>
            )}

            {agotados.perdidas > 0 && (
              <div style={{ marginBottom: 14, padding: '13px 15px', borderRadius: 16, background: 'rgba(196,21,111,0.06)', border: '1.5px solid rgba(196,21,111,0.28)' }}>
                <p style={{ fontSize: 13.5, fontWeight: 800, color: ROSA, margin: 0 }}>
                  ⚠ Unas {agotados.perdidas} piezas perdidas por estar agotado
                </p>
                <p style={{ fontSize: 12, color: TINTA_SUAVE, margin: '5px 0 0', lineHeight: 1.55 }}>
                  Repartidas en {agotados.fugas.length} modelos.
                  {agotados.fugas[0] && (
                    <> El más caro es <strong style={{ color: TINTA }}>{agotados.fugas[0].producto}</strong>:
                    {' '}{agotados.fugas[0].diasAgotado} días en cero vendiendo {agotados.fugas[0].vendiaAlMes.toFixed(1)} al mes.</>
                  )}
                  {agotados.inactivos.length > 0 && (
                    <> De todos ellos, <strong style={{ color: ROSA }}>{agotados.inactivos.length} llevan
                    más de {DIAS_SIN_COMPRAR} días sin que bodega los mueva</strong>: ahí la fuga no es de
                    surtido, es que nadie los ha comprado.</>
                  )}
                </p>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
              <Dato valor={agotados.perdidas} etiqueta="piezas perdidas" nota="por estar en cero" color={ROSA} />
              <Dato valor={agotados.compra.length} etiqueta="bodega no puede surtir" nota="comprar o mover entre plazas" color={ROSA} />
              <Dato valor={agotados.reparto.length} etiqueta="solo repartir" nota="bodega sí tiene" color={AMBAR} />
              <Dato valor={agotados.normal.length} etiqueta="con relevo" nota="ya hay generación nueva" color={TINTA_TENUE} />
            </div>

            <Tabla encabezados={<>
              <Th campo="producto" orden={ord}>Modelo</Th><Th campo="codigo" orden={ord}>Código</Th>
              <Th campo="plazasEnCero" orden={ord} num style={{ textAlign: 'right' }}>En cero</Th>
              <Th campo="diasAgotado" orden={ord} num style={{ textAlign: 'right' }} title="Días desde el último movimiento">Días</Th>
              <Th campo="vendioCorto" orden={ord} num style={{ textAlign: 'right' }} title={`Piezas vendidas en los últimos ${MESES_CORTOS} meses`}>Vendió 3 m</Th>
              <Th campo="vendiaAlMes" orden={ord} num style={{ textAlign: 'right' }} title="Piezas al mes en los tres meses previos a quedarse sin stock. Es lo que se está perdiendo cada mes que sigue agotado.">Vendía/mes</Th>
              <Th campo="perdidas" valor={piezasPerdidas} orden={ord} num style={{ textAlign: 'right' }} title="Ritmo que llevaba por los días que lleva sin stock">Perdidas</Th>
              <Th campo="bodega" orden={ord} num style={{ textAlign: 'right' }}>Bodega</Th>
              <Th>Qué hacer</Th>
            </>}>
              {ord.ordenar(filasAgotados).slice(0, TOPE).map((a, i) => (
                <tr key={a.codigo + i} style={{ background: i % 2 ? '#FBFDFD' : '#fff' }}>
                  <Modelo f={a} />
                  <Celda num color={a.plazasConStock === 0 ? ROSA : AMBAR}>
                    {a.plazasEnCero}/{a.plazasEnCero + a.plazasConStock}
                  </Celda>
                  <Celda num color={a.diasAgotado > 30 ? ROSA : TINTA_SUAVE}>{a.diasAgotado ?? '—'}</Celda>
                  <Celda num fuerte color={'#0288AD'}>{a.vendioCorto}</Celda>
                  <Celda num color={a.vendiaAlMes >= 2 ? ROSA : TINTA_SUAVE}
                         title="Piezas al mes en los tres meses previos a quedarse sin stock">
                    {a.vendiaAlMes.toFixed(1)}
                  </Celda>
                  <Celda num fuerte color={piezasPerdidas(a) >= 5 ? ROSA : TINTA_SUAVE}>
                    {piezasPerdidas(a) || '—'}
                  </Celda>
                  <Celda num color={a.bodega > 0 ? VERDE : ROSA}>{a.existeEnBodega ? a.bodega : '—'}</Celda>
                  <Celda color={a.estado === 'compra' ? ROSA : a.estado === 'reparto' ? AMBAR : TINTA_TENUE}>
                    {a.estado === 'compra'
                      ? (a.plazasConStock > 0
                          ? `Mover de otra plaza o comprar: bodega en cero, ${a.plazasConStock} ${a.plazasConStock === 1 ? 'plaza tiene' : 'plazas tienen'}`
                          : 'Comprar: no hay en ninguna parte')
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
            {/* Una línea, y el método debajo sólo si se pide.
                Esto ocupaba seis párrafos fijos. Cinco de los seis explicaban
                CÓMO se calcula, y eso no cambia de un día para otro: se lee
                una vez y a partir de ahí es un muro que hay que saltar para
                llegar a la tabla. Lo que sí es noticia -un mes sin dato- se
                queda fuera del plegable, porque avisa de que la cuenta de hoy
                vale menos. */}
            <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 16, background: 'rgba(94,148,34,0.05)', border: '1px solid rgba(94,148,34,0.25)' }}>
              <p style={{ fontSize: 12.5, color: TINTA, margin: 0, lineHeight: 1.5 }}>
                <strong>Compra para que bodega aguante {compras.nMeses} meses</strong>
                {compras.alta && <span style={{ color: ROSA, fontWeight: 700 }}> · temporada alta</span>}
                <span style={{ color: TINTA_SUAVE }}>
                  {' '}— cubre {compras.objetivo.join(' y ')}, con la referencia
                  de {compras.referencia.join(' y ')}.
                </span>
              </p>

              {/* Esto NO se pliega: dice que la cuenta de hoy sale coja. */}
              {compras.faltantes.length > 0 && (
                <p style={{ fontSize: 11, color: AMBAR, margin: '6px 0 0' }}>
                  Sin dato para {compras.faltantes.join(', ')}: la referencia de esos meses sale incompleta.
                </p>
              )}

              <details data-metodo-compra style={{ marginTop: 6 }}>
                <summary style={{ fontSize: 11, color: TINTA_SUAVE, cursor: 'pointer', listStyle: 'revert' }}>
                  Cómo se calcula esta compra
                </summary>
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <p style={{ fontSize: 11, color: TINTA_SUAVE, margin: 0, lineHeight: 1.5 }}>
                    La referencia son los mismos meses del año pasado, en todas las plazas y ferias juntas.
                    Comparar contra el mes pasado no diría nada sobre diciembre.
                  </p>

                  {/* La plaza sin historial entra aquí y no arriba: es una
                      condición que lleva meses igual y seguirá igual hasta
                      que cumpla el año. Enseñarla fija cada día la convertía
                      en ruido, y el dueño pidió ocultarla. */}
                  {compras.estimadas.length > 0 && (
                    <p style={{ fontSize: 11, color: TINTA_SUAVE, margin: 0, lineHeight: 1.5 }}>
                      {compras.estimadas.map(e => (
                        <span key={e.plaza}>
                          <strong>{e.plaza}</strong> no tiene dato de {e.meses.join(', ')} —empezó a medirse
                          en {e.desde}— así que su aporte va estimado en unas <strong>{e.piezas} piezas</strong>:
                          su propio ritmo, corregido por la temporada
                          (×{compras.factorTemporada.toFixed(2)}) que midieron las plazas que sí tienen esos
                          meses. Dejarla en cero sería decir que no vendió nada, y es la plaza que más vende.{' '}
                        </span>
                      ))}
                    </p>
                  )}

                  <p style={{ fontSize: 11, color: TINTA_SUAVE, margin: 0, lineHeight: 1.5 }}>
                    Cada modelo se compra por lo que vendió él, no por lo que vendió su familia: una funda de
                    iPhone 13 no se sustituye con una de iPhone 17.
                    Se detectaron <strong>{compras.cambios.length} relevos</strong> de generación en el propio
                    catálogo, confirmados con la fecha de alta, y sirven para dos cosas: estimar un modelo
                    recién llegado y avisar de cuáles conviene vigilar.
                  </p>
                  <p style={{ fontSize: 11, color: TINTA_SUAVE, margin: 0, lineHeight: 1.5 }}>
                    Un modelo recién llegado no tiene historial propio y el cálculo lo daría por cero, así que
                    nadie lo compraría hasta que ya se hubiera agotado. Para esos se usa lo que vendió la
                    generación inmediatamente anterior —una sola, no todas sumadas— y sólo si consta su fecha
                    real de entrada. Y se marca con ⚡ lo que se está agotando más rápido de lo que la
                    referencia predecía: ahí es donde la cuenta se queda corta sola, y suele pasar justo con
                    lo nuevo.
                  </p>
                </div>
              </details>
            </div>

            <AvisoAjustes filas={compras.filas} ambito="compra" onLimpiar={quitarAjustes} />

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
              <Dato valor={compras.filas.filter(f => f.sugerido > 0).length} etiqueta="modelos a comprar" color={VERDE} />
              <Dato valor={compras.totalPiezas} etiqueta="piezas en total" />
              <Dato valor={compras.adelantados.length} etiqueta="se agotan antes" nota="de lo previsto" color={AMBAR} />
              <Dato valor={compras.nuevosEstimados.length} etiqueta="modelos nuevos" nota="estimados con la anterior" color={'#0288AD'} />
              <Dato valor={compras.conRelevo.length} etiqueta="con relevo" nota="ya hay generación nueva" color={TINTA_TENUE} />
            </div>

            <Tabla encabezados={<>
              <Th campo="codigo" orden={ord}>Código</Th><Th campo="producto" orden={ord}>Modelo</Th>
              <Th campo="existencia" orden={ord} num style={{ textAlign: 'right' }} title="Existencia actual en bodega">Inventario</Th>
              <Th campo="vendidas2m" orden={ord} num style={{ textAlign: 'right' }} title="Piezas vendidas en los últimos 2 meses, todas las plazas">Ventas 2 m</Th>
              <Th campo="sugerido" orden={ord} num style={{ textAlign: 'right' }}>COMPRAR</Th>
              <Th campo="plazasEnCero" orden={ord} num style={{ textAlign: 'right' }} title="En cuántas sucursales está en cero">Agotado en</Th>
              <Th campo="diasAgotado" orden={ord} num style={{ textAlign: 'right' }} title="Días desde el último movimiento">Días</Th>
              <Th>Observaciones</Th>
            </>}>
              {ord.ordenar(compras.filas).slice(0, TOPE).map((f, i) => (
                <tr key={f.codigo + i} style={{ background: i % 2 ? '#FBFDFD' : '#fff' }}>
                  <td style={{ padding: '7px 10px', color: TINTA_TENUE, fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>{f.codigo}</td>
                  <Celda>
                    <span style={{ display: 'block', maxWidth: 230, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.producto}
                    </span>
                  </Celda>
                  <Celda num color={f.enCatalogo ? (f.existencia === 0 ? ROSA : TINTA) : ROSA}
                         title={f.enCatalogo ? undefined : 'Bodega no maneja este código'}>
                    {f.enCatalogo ? f.existencia : '—'}
                  </Celda>
                  <Celda num color={'#0288AD'}>{f.vendidas2m || '—'}</Celda>
                  <CeldaPedir fila={f} ambito="compra" onCambiar={cambiarAjuste} />
                  <Celda num color={f.plazasEnCero === f.plazasTotal && f.plazasTotal > 0 ? ROSA : AMBAR}>
                    {f.plazasTotal ? `${f.plazasEnCero}/${f.plazasTotal}` : '—'}
                  </Celda>
                  <Celda num color={f.diasAgotado > 30 ? ROSA : TINTA_SUAVE}>{f.diasAgotado ?? '—'}</Celda>
                  <Celda color={f.seAdelanta ? AMBAR : TINTA_TENUE}>
                    <span style={{ display: 'block', maxWidth: 330, fontSize: 11.5, lineHeight: 1.35 }}>
                      {f.seAdelanta && <strong>⚡ </strong>}
                      {f.observaciones || '—'}
                    </span>
                  </Celda>
                </tr>
              ))}
            </Tabla>

            {compras.conRelevo.length > 0 && (
              <>
                <p style={{ fontSize: 12, fontWeight: 700, color: TINTA, margin: '4px 0 8px' }}>
                  Modelos que ya tienen generación nueva
                </p>
                <p style={{ fontSize: 11, color: TINTA_TENUE, margin: '0 0 8px', lineHeight: 1.5 }}>
                  Se siguen comprando: quien trae un iPhone 13 necesita funda de iPhone 13, no de 17.
                  Están aquí para que decidas si moderar el pedido cuando notes que la venta cae.
                </p>
                <Tabla encabezados={<>
                  <Th campo="producto" orden={ord}>Modelo</Th><Th campo="codigo" orden={ord}>Código</Th>
                  <Th campo="piezas" orden={ord} num style={{ textAlign: 'right' }}>Vendió</Th>
                  <Th>Generación nueva</Th>
                </>}>
                  {ord.ordenar(compras.conRelevo).slice(0, 60).map((d, i) => (
                    <tr key={d.codigo + i} style={{ background: i % 2 ? '#FBFDFD' : '#fff' }}>
                      <Modelo f={d} />
                      <Celda num color={TINTA_SUAVE}>{d.piezas}</Celda>
                      <Celda color={TINTA_SUAVE}>{d.sustitutoNombre}</Celda>
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
              <Th campo="producto" orden={ord}>Modelo</Th><Th campo="codigo" orden={ord}>Código</Th>
              <Th campo="piden" orden={ord} num style={{ textAlign: 'right' }}>Piden</Th>
              <Th campo="tiene" orden={ord} num style={{ textAlign: 'right' }}>Bodega</Th>
              <Th campo="falta" orden={ord} num style={{ textAlign: 'right' }}>Falta</Th>
              <Th campo="estado" orden={ord}>Estado</Th>
            </>}>
              {ord.ordenar(bodega).slice(0, TOPE).map((b, i) => (
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
            Modelos que entraron hace menos de {DIAS_RECIEN_LLEGADO} días y todavía no se han
            vendido. No son inventario muerto: todavía no se han visto vender, que no es lo mismo.
            Por eso no aparecen en Depurar. Sólo entran los que tienen fecha de entrada real: si
            un modelo ya existía cuando arranca el historial de su sucursal, no hay forma de saber
            cuándo llegó y no se cuenta como nuevo.
          </Aviso>
          {depurar.nuevos.length === 0
            ? <p style={{ fontSize: 13, color: TINTA_TENUE }}>
                {depurar.suficiente ? 'No hay modelos recién llegados sin venta.' : 'Hace falta más historial para separarlos.'}
              </p>
            : <Tabla encabezados={<>
                <Th campo="producto" orden={ord}>Modelo</Th><Th campo="codigo" orden={ord}>Código</Th>
                <Th campo="existencia" orden={ord} num style={{ textAlign: 'right' }}>Piezas</Th>
                <Th campo="alta" orden={ord}>Entró</Th>
                <Th campo="alta" orden={ord} num style={{ textAlign: 'right' }}>Lleva</Th>
              </>}>
                {ord.ordenar(depurar.nuevos).slice(0, TOPE).map((d, i) => {
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
              {depurar.nuevos.length > 0 && ` Otros ${depurar.nuevos.length} tampoco se han vendido, pero llegaron hace menos de ${DIAS_RECIEN_LLEGADO} días y están en «Recién llegados».`}
              {depurar.sinFecha > 0 && ` ${depurar.sinFecha} quedan fuera por no saber cuándo entraron.`}
            </Aviso>
            <Tabla encabezados={<>
              <Th campo="producto" orden={ord}>Modelo</Th><Th campo="codigo" orden={ord}>Código</Th>
              <Th campo="existencia" orden={ord} num style={{ textAlign: 'right' }}>Piezas paradas</Th>
              <Th campo="alta" orden={ord}>Entró</Th><Th>Dónde</Th>
            </>}>
              {ord.ordenar(depurar.filas).slice(0, TOPE).map((d, i) => (
                <tr key={d.codigo + i} style={{ background: i % 2 ? '#FBFDFD' : '#fff' }}>
                  <Modelo f={d} />
                  <Celda num fuerte color={AMBAR}>{d.existencia}</Celda>
                  {/* El «antes de» avisa de que no es la entrada real: el modelo
                      ya estaba cuando arranca el historial, así que lleva ESO o
                      más. Para depurar sirve igual, porque es una edad mínima. */}
                  <Celda color={TINTA_SUAVE}>
                    {d.alta ? (d.piso ? `antes de ${d.alta}` : d.alta) : '—'}
                  </Celda>
                  <Celda color={TINTA_SUAVE}>{d.plazas.map(p => p.slug).join(', ')}</Celda>
                </tr>
              ))}
            </Tabla>
          </>)}

      <Folios cuadres={cuadres} resumen={resumenFolios}
              onCerrar={async f => { try { await cerrar(f) } catch { setAvisoSurtido('No se pudo cerrar el folio.') } }}
              puedeCerrar={puedeRegistrar} />

      {avisoSurtido && <Aviso>{avisoSurtido}</Aviso>}
      {sinRedSurtidos && (
        <Aviso>
          No se pudieron leer los surtidos registrados. Una lista vacia aqui diria que no hay nada
          pendiente, y lo que pasa es que no se pudo mirar.
        </Aviso>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      {/* Registrar lo que sale.
          Parte de lo CALCULADO y no de un formulario en blanco: lo que se
          registra tiene que ser lo que se mando, y teclear doscientos codigos
          a mano es la forma mas segura de que esto no se llene nunca.
          Pide una plaza concreta porque el «antes» es de UN inventario: desde
          «Todas» no hay destino contra el que comparar. */}
      {puedeRegistrar && !esFeria && vista === 'venta' && (
        sel === TODAS.slug ? (
          <p style={{ fontSize: 11.5, color: TINTA_TENUE, margin: 0 }}>
            Para registrar un surtido, elige primero la tienda a la que va: lo que se compara
            despues es el inventario de ESA tienda.
          </p>
        ) : porVenta.length === 0 ? null : (
          <button type="button" disabled={registrando}
            onClick={async () => {
              setAvisoSurtido(null)
              setRegistrando(true)
              try {
                const lineas = lineasDesdeSurtido(porVenta)
                const f = await registrar({
                  // Quién lo registró, de verdad: el folio es una bitácora y
                  // firmarlo todo como «admin» la vacía de la mitad de su
                  // valor. El backend lo vuelve a resolver de la sesión, así
                  // que esto no es el permiso: es la etiqueta.
                  destino: sel, lineas, quien: isAdmin ? 'admin' : session?.branch,
                  inventarioDestino: datos?.[sel]?.inv,
                })
                setAvisoSurtido(`Registrado el folio ${f.folio}: ${lineas.length} codigos, `
                  + `${lineas.reduce((a, l) => a + l.piezas, 0)} piezas. Se comprobara solo cuando `
                  + `${nombreSel} lo de de alta.`)
              } catch (e) {
                setAvisoSurtido(e?.message || 'No se pudo registrar el surtido.')
              }
              setRegistrando(false)
            }}
            className="px-4 py-2 text-sm font-semibold transition-all"
            style={{ borderRadius: 999, border: '1.5px solid transparent', cursor: registrando ? 'wait' : 'pointer', fontWeight: 800, color: '#101619', background: 'linear-gradient(#fff, #fff) padding-box, var(--degradado-letra) border-box' }}>
            {registrando ? 'Registrando...' : `Registrar este surtido a ${nombreSel}`}
          </button>
        )
      )}

      {(
        <button type="button" onClick={exportar}
          className="px-4 py-2 text-sm font-semibold transition-all"
          style={{ borderRadius: 999, border: '1.5px solid transparent', cursor: 'pointer', fontWeight: 800, color: '#101619', background: 'linear-gradient(#fff, #fff) padding-box, var(--degradado-letra) border-box' }}>
          Bajar el reporte completo en Excel
        </button>
      )}
      </div>

      <p style={{ fontSize: 11, color: TINTA_TENUE, margin: '14px 0 0', lineHeight: 1.55, paddingTop: 12, borderTop: '1px solid ' + LINEA }}>
        El ritmo sale de dividir lo vendido entre los días con dato, no entre los del calendario: si una
        sucursal estuvo semanas sin subir respaldo, esas semanas no diluyen el ritmo de las que sí se
        midieron. Los meses importados de Eleventa cuentan con la venta real; los medidos por la
        sincronización son un piso, porque un resurtido el mismo día tapa la salida.
      </p>
    </div>
  )
}
