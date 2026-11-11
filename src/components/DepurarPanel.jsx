// Depurar el catálogo: lo que se puede sacar, lo que se está liquidando y lo
// que no se toca, con los candados a la vista.
//
// Lo pidió el dueño el 2026-11-09 en cuatro pestañas —modelos de salida, sin
// rotación de más de un año, obsoletos en ceros y marca o departamento— y con
// una regla por delante de todas: nada con piezas en la red ni con ventas en el
// último año se da de baja. Las cuentas están en `lib/depuracion.js` y el
// candado que MANDA en `backend/src/bajas.js`; esto sólo las pinta, y dice
// POR QUÉ algo no se puede, porque un botón apagado sin motivo se lee como un
// fallo de la página.
//
// ── Lo que esto NO hace ────────────────────────────────────────────────────
//
// No borra nada de Eleventa. Dar de baja APUNTA la decisión —va a `ajustes/`,
// igual que la ✕— y arma la lista de lo que cada tienda borra en su caja; el
// estado se cierra solo cuando el código deja de salir en el respaldo. Y
// marcar un modelo como descontinuado tampoco lo oculta: sigue vendiéndose y
// contando, sólo deja de salir en la cola de revisión como si fuera un error.

import { TEMAS } from './Diseno'
import { Fragment, useEffect, useMemo, useState, useCallback } from 'react'
import { SUCURSALES, nombreSucursal } from '../lib/sucursales'
import { inventarioJsonUrl, historialUrl } from '../lib/s3'
import { useAuth } from '../context/AuthContext'
import { useAjustes } from '../lib/useAjustes'
import { guardarAjustes, guardarBajas } from '../lib/api'
import { useOrdenTabla } from '../lib/orden'
import { diasDesde } from '../lib/fechas'
import {
  reunirCatalogo, modelosDeSalida, sinRotacion, obsoletosEnCeros, porCategoria, resumirDepuracion,
  DIAS_MINIMOS_PARA_BAJA, DIAS_CATEGORIA_SIN_MOVIMIENTO, PLAZAS_CON_STOCK,
} from '../lib/depuracion'
import { MOTIVO_DESCONTINUADO, TIPOS } from '../lib/ajustes'
import { descargarDepuracion } from '../lib/exportarDepuracion'
import { descargarBajas } from '../lib/exportarBajas'

const TINTA       = '#101619'
const TINTA_SUAVE = '#4A5A61'
const TINTA_TENUE = '#8598A1'
const LINEA       = '#D6E0E4'
const ROSA        = '#C4156F'
const VERDE       = '#4B7A1B'
const AMBAR       = '#B45309'

/** Cuántos renglones se pintan de golpe; el resto se pide con «mostrar más». */
const PAGINA = 150

/** Cuántos códigos viajan en una petición al servidor. */
const LOTE = 400

const fmtN = n => Number(n || 0).toLocaleString('es-MX')

// ── Piezas pequeñas ───────────────────────────────────────────────────────

function Pildora({ activa, onClick, children, ...resto }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={activa}
            className={'chip-plaza' + (activa ? ' activa' : '')} {...resto}>
      <span className="chip-plaza-texto">{children}</span>
    </button>
  )
}

function Dato({ valor, etiqueta, nota, color }) {
  return (
    <div style={{ flex: 1, minWidth: 130, padding: '12px 15px', borderRadius: 16,
                  background: /^#[0-9a-f]{6}$/i.test(color ?? '') ? color + '14' : 'rgba(16,22,25,0.04)',
                  borderLeft: '4px solid ' + (color || TINTA) }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || TINTA, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{valor}</div>
      <div style={{ fontSize: 12, color: TINTA_SUAVE, marginTop: 3 }}>{etiqueta}</div>
      {nota && <div style={{ fontSize: 11, color: TINTA_TENUE, marginTop: 2 }}>{nota}</div>}
    </div>
  )
}

/** Una caja de aviso. `tono`: ámbar para lo que impide, neutro para lo que explica. */
function Caja({ tono = 'neutro', titulo, children, ...resto }) {
  const ambar = tono === 'ambar'
  return (
    <div {...resto} style={{
      padding: '11px 14px', borderRadius: 16, lineHeight: 1.55, fontSize: 12,
      background: ambar ? 'rgba(180,83,9,0.07)' : 'rgba(16,22,25,0.03)',
      border: '1px solid ' + (ambar ? 'rgba(180,83,9,0.28)' : LINEA),
      borderLeft: '5px solid ' + (ambar ? AMBAR : TEMAS.neutro.borde),
      color: TINTA_SUAVE,
    }}>
      {titulo && <strong style={{ display: 'block', color: ambar ? AMBAR : TINTA, fontSize: 12.5, marginBottom: 2 }}>{titulo}</strong>}
      {children}
    </div>
  )
}

/** Encabezado que ordena al hacer clic. `aria-sort` es lo que `verificar` busca. */
function Th({ campo, orden, valor, children, num, title }) {
  const activa = orden.campo === campo
  return (
    <th scope="col" title={title ?? 'Clic para ordenar'}
        aria-sort={activa ? (orden.dir === -1 ? 'descending' : 'ascending') : 'none'}
        onClick={() => orden.alternar(campo, valor)}
        style={{
          textAlign: num ? 'right' : 'left', padding: '8px 8px', fontWeight: 700, fontSize: 11,
          color: activa ? TINTA : TINTA_SUAVE, borderBottom: '1px solid ' + LINEA,
          whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none',
        }}>
      {children}
      <span style={{ marginLeft: 4, fontSize: 9, color: activa ? ROSA : 'rgba(133,152,161,0.5)' }}>
        {activa ? (orden.dir === -1 ? '▼' : '▲') : '⇅'}
      </span>
    </th>
  )
}

const Td = ({ children, num, color, fuerte, title, mono }) => (
  <td title={title} style={{
    padding: '6px 8px', fontSize: 12, textAlign: num ? 'right' : 'left', color: color || TINTA,
    fontWeight: fuerte ? 700 : 400, fontVariantNumeric: num ? 'tabular-nums' : 'normal',
    fontFamily: mono ? 'ui-monospace, monospace' : 'inherit', verticalAlign: 'top',
  }}>{children}</td>
)

/**
 * Un botón con forma de botón.
 *
 * Las clases `rev-saltar` y `rev-bajar` de la bandeja de Revisar no valen
 * aquí: la primera es un botón fantasma —texto sin forma, a propósito— y la
 * segunda no existe. Con ellas, «Dar de baja definitiva» se veía como una
 * línea de texto gris y no como lo que es: lo más importante de la pantalla.
 *
 *   · `primario`   la acción que cambia algo, en el color de acento
 *   · `secundario` lo que ayuda: bajar, elegir, mostrar más
 *   · `fantasma`   lo que se descarta: cancelar, cerrar, quitar la selección
 */
function Boton({ tipo = 'secundario', style, disabled, children, ...resto }) {
  const colores = {
    primario:   { background: 'var(--accent)',  color: 'var(--accent-ink)' },
    secundario: { background: 'var(--surface)', color: 'var(--ink)' },
    fantasma:   { background: 'transparent',    color: 'var(--muted)' },
  }[tipo]
  return (
    <button type="button" disabled={disabled} {...resto}
            style={{
              border: 0, borderRadius: 999, padding: '9px 16px', fontSize: 12.5, fontWeight: 700,
              fontFamily: 'inherit', whiteSpace: 'nowrap', lineHeight: 1.2,
              cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1,
              ...colores, ...style,
            }}>
      {children}
    </button>
  )
}

const Casilla = ({ marcada, onChange, deshabilitada, etiqueta }) => (
  <input type="checkbox" checked={marcada} disabled={deshabilitada} aria-label={etiqueta}
         onChange={e => onChange(e.target.checked)}
         style={{ width: 15, height: 15, cursor: deshabilitada ? 'not-allowed' : 'pointer' }} />
)

/** «hace 5 días», «nunca», «ayer», para una última venta. */
const haceCuanto = f => {
  if (f.diasSinVender === null) return 'nunca'
  if (f.diasSinVender === 0) return 'hoy'
  if (f.diasSinVender === 1) return 'ayer'
  if (f.diasSinVender < 60) return `hace ${f.diasSinVender} d`
  if (f.diasSinVender < 730) return `hace ${Math.round(f.diasSinVender / 30)} meses`
  return `hace ${(f.diasSinVender / 365).toFixed(1)} años`
}

/** «León 3 · San Luis 2»: dónde hay piezas. */
const dondeHay = f => Object.entries(f.stock ?? {})
  .filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])
  .map(([slug, n]) => `${nombreSucursal(slug)} ${n}`).join(' · ')

const RAZONES = {
  'sin-alta':         { texto: 'Bodega lo descontinuó',          color: ROSA },
  'agotado-largo':    { texto: 'En cero en bodega hace tiempo',   color: AMBAR },
  'agotado-reciente': { texto: 'En cero hace poco: se resurte',   color: TINTA_TENUE },
}

// ═══════════════════════════════════════════════════════════════════════════
//  El panel
// ═══════════════════════════════════════════════════════════════════════════

export default function DepurarPanel() {
  const { token } = useAuth()
  const { correcciones, ocultos, descontinuados, setCorrecciones } = useAjustes(token)

  const [datos, setDatos] = useState(null)
  const [vista, setVista] = useState('salida')
  const [sinRed, setSinRed] = useState(false)

  // Los inventarios de las seis plazas y su historial. Cada descarga cae en
  // null por su cuenta: que a una le falte un archivo no puede tumbar la
  // pantalla —y es justo lo que pasa hoy con Torreón—. Esa ausencia se dice
  // arriba y bloquea las bajas; no se esconde.
  useEffect(() => {
    let cancelado = false
    const bajar = async url => {
      const r = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' })
      if (!r.ok) throw new Error('sin-datos')
      return r.json()
    }
    ;(async () => {
      const pares = await Promise.all(SUCURSALES.map(async s => [s.slug, {
        inv:  await bajar(inventarioJsonUrl(s.slug)).catch(() => null),
        hist: await bajar(historialUrl(s.slug)).catch(() => null),
      }]))
      if (cancelado) return
      setDatos({
        inv:  Object.fromEntries(pares.map(([s, d]) => [s, d.inv])),
        hist: Object.fromEntries(pares.map(([s, d]) => [s, d.hist])),
      })
    })()
    return () => { cancelado = true }
  }, [])

  const catalogo = useMemo(
    () => (datos ? reunirCatalogo({ inventarios: datos.inv, historiales: datos.hist, descontinuados }) : null),
    [datos, descontinuados])

  const bloqueos = useMemo(() => ({
    plazasSinInventario: catalogo?.plazasSinInventario ?? [],
    plazasSinVenta: catalogo?.plazasSinVenta ?? [],
  }), [catalogo])

  const resumen = useMemo(
    () => (catalogo ? resumirDepuracion({ filas: catalogo.filas, ...bloqueos }) : null),
    [catalogo, bloqueos])

  // Qué plazas llevan menos de un año de historial en Eleventa: de ellas no se
  // puede afirmar «ni una venta en 365 días» sobre lo que hicieron antes. Se
  // calcula del dato y no se escribe a mano, para que el aviso se apague solo
  // el día que ya no haga falta.
  const historialCorto = useMemo(() => {
    if (!datos) return []
    return PLAZAS_CON_STOCK.map(slug => {
      const altas = (datos.inv[slug]?.productos ?? []).map(p => p.Alta).filter(Boolean).sort()
      const desde = altas[0] ?? null
      return { slug, desde, dias: desde ? diasDesde(desde) : null }
    }).filter(x => x.dias !== null && x.dias < DIAS_MINIMOS_PARA_BAJA)
  }, [datos])

  /**
   * Marca o desmarca varios códigos como descontinuados en bodega.
   *
   * Se pinta al momento y se manda después, igual que el resto de la cola. Y se
   * manda por lotes de una sola petición: cada petición lee el archivo, lo
   * modifica y lo reescribe entero, así que varias a la vez se pisan y
   * marcar 146 modelos una por una perdía marcas sin avisar.
   */
  const marcar = useCallback(async (filas, poner) => {
    const ahora = new Date().toISOString()
    setCorrecciones(c => {
      const s = { ...c }
      for (const f of filas) {
        const codigo = String(f.codigo).toUpperCase()
        const clave = `${TIPOS.DESCONTINUADO}|${codigo}`
        if (poner) {
          s[clave] = { clave, tipo: TIPOS.DESCONTINUADO, codigo, producto: f.producto,
                       motivo: MOTIVO_DESCONTINUADO, cuando: ahora, quien: 'admin' }
        } else delete s[clave]
      }
      return s
    })
    if (!token) return
    try {
      const items = filas.map(f => ({ codigo: f.codigo, producto: f.producto }))
      for (let i = 0; i < items.length; i += LOTE) {
        await guardarAjustes({
          items: items.slice(i, i + LOTE), tipo: TIPOS.DESCONTINUADO,
          motivo: poner ? MOTIVO_DESCONTINUADO : null,
        }, token)
      }
      setSinRed(false)
    } catch { setSinRed(true) }
  }, [token, setCorrecciones])

  /** Pide la baja definitiva al servidor, que es quien comprueba el candado. */
  const darDeBaja = useCallback(async (codigos, dias) => {
    const aceptados = [], rechazados = []
    try {
      for (let i = 0; i < codigos.length; i += LOTE) {
        const r = await guardarBajas({ codigos: codigos.slice(i, i + LOTE), dias }, token)
        aceptados.push(...r.aceptados)
        rechazados.push(...r.rechazados)
      }
      setSinRed(false)
    } catch (e) {
      // 409 = falta el inventario de alguna plaza: no se escribió nada.
      if (aceptados.length) {
        setCorrecciones(c => { const s = { ...c }; for (const a of aceptados) s[a.clave] = a; return s })
      }
      return { error: e.message || 'No se pudo registrar.', plazas: e.datos?.plazasSinInventario ?? [], aceptados: aceptados.length, rechazados }
    }
    setCorrecciones(c => { const s = { ...c }; for (const a of aceptados) s[a.clave] = a; return s })
    return { aceptados: aceptados.length, rechazados }
  }, [token, setCorrecciones])

  if (!datos || !catalogo) {
    return <p className="tablero-cargando">Leyendo el inventario de las seis plazas…</p>
  }

  const VISTAS = [
    { id: 'salida',     titulo: 'Modelos de salida',     n: resumen.salida },
    { id: 'rotacion',   titulo: 'Sin rotación > 1 año',  n: resumen.sinRotacion },
    { id: 'obsoletos',  titulo: 'Obsoletos en ceros',    n: resumen.obsoletos },
    { id: 'categorias', titulo: 'Por marca o depto.',    n: null },
  ]

  return (
    <div data-depurar style={{ background: '#fff', borderRadius: 30, border: '1px solid ' + LINEA, padding: '24px 22px',
                                display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* La cabecera con la franja del tema «revisar»: depurar es decidir qué
          sale del catálogo, y se distingue de lo que es venta o inventario. */}
      <div style={{ borderLeft: '5px solid ' + TEMAS.alerta.fuerte, background: TEMAS.alerta.suave, borderRadius: 14, padding: '10px 14px' }}>
        <h3 style={{ fontSize: 13.5, fontWeight: 800, color: TEMAS.alerta.fuerte, margin: 0 }}>
          Depurar: lo que sale del catálogo
        </h3>
      </div>
      <p style={{ fontSize: 12.5, color: TINTA_SUAVE, margin: 0, lineHeight: 1.6 }}>
        Lo que hay que sacar del catálogo y lo que se está liquidando. <strong>No se borra nada de
        Eleventa</strong>: dar de baja apunta la decisión y arma la lista de lo que cada tienda borra en
        su caja, y se cierra sola cuando el código deja de salir en el respaldo. Nada con piezas en la red
        ni con ventas en el último año se puede dar de baja.
      </p>

      {sinRed && (
        <Caja tono="ambar" titulo="Sin conexión con el servidor" role="status">
          Lo que marques se ve aquí pero no se está compartiendo.
        </Caja>
      )}

      {/* Lo que impide, ANTES de las listas. Sin esto, una lista de «obsoletos»
          con todos los botones apagados parece rota. */}
      {!catalogo.inventarioCompleto && (
        <Caja tono="ambar" data-bloqueo-inventario
              titulo={`Falta el inventario de ${catalogo.plazasSinInventario.map(nombreSucursal).join(', ')}`}>
          Su existencia no está en el «stock global», y una cifra a la que le falta una plaza no se
          distingue de una buena. Mientras tanto <strong>no se puede dar de baja ningún código</strong>.
          Se arregla solo en cuanto la sincronización publique ese inventario.
        </Caja>
      )}
      {catalogo.plazasSinVenta.length > 0 && (
        <Caja tono="ambar" titulo={`${catalogo.plazasSinVenta.map(nombreSucursal).join(', ')} todavía no publica su última venta`}>
          La sincronización la añade en su próxima corrida. Hasta entonces no se puede probar que algo
          no se vendió en esa plaza, y los códigos que tiene no se pueden dar de baja.
        </Caja>
      )}
      {historialCorto.length > 0 && (
        <Caja titulo="Historial corto">
          {historialCorto.map(h => `${nombreSucursal(h.slug)} lleva ${h.dias} días en Eleventa (desde ${h.desde})`).join('; ')}.
          Una venta suya anterior no se ve; por eso un código sólo se da por muerto si ya existía en el
          resto de la red hace más de un año.
        </Caja>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {VISTAS.map(v => (
          <Pildora key={v.id} activa={vista === v.id} onClick={() => setVista(v.id)} data-depurar-vista={v.id}>
            {v.titulo}{v.n !== null && <span style={{ marginInlineStart: 6, fontWeight: 800 }}>{v.n}</span>}
          </Pildora>
        ))}
      </div>

      {vista === 'salida' && (
        <Salidas filas={catalogo.filas} marcar={marcar} descargar={() => descargarDepuracion({
          salida: modelosDeSalida(catalogo.filas), rotacion: [], obsoletos: [], categorias: [], ...bloqueos })} />
      )}
      {vista === 'rotacion' && (
        <SinRotacion filas={catalogo.filas} descargar={() => descargarDepuracion({
          salida: [], rotacion: sinRotacion(catalogo.filas).filter(f => f.probado), obsoletos: [], categorias: [], ...bloqueos })} />
      )}
      {vista === 'obsoletos' && (
        <Obsoletos filas={catalogo.filas} bloqueos={bloqueos} darDeBaja={darDeBaja} ocultos={ocultos}
                   correcciones={correcciones} inventarios={datos.inv}
                   descargar={dias => descargarDepuracion({
                     salida: [], rotacion: [], categorias: [], dias,
                     obsoletos: obsoletosEnCeros(catalogo.filas, { dias, ...bloqueos }), ...bloqueos })} />
      )}
      {vista === 'categorias' && (
        <Categorias filas={catalogo.filas} bloqueos={bloqueos} darDeBaja={darDeBaja} ocultos={ocultos}
                    correcciones={correcciones} inventarios={datos.inv}
                    descargar={() => descargarDepuracion({
                      salida: [], rotacion: [], obsoletos: [],
                      categorias: porCategoria(catalogo.filas, { ...bloqueos }), ...bloqueos })} />
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: '1px solid ' + LINEA, paddingTop: 14 }}>
        <Boton tipo="secundario" data-bajar-depuracion
                onClick={() => descargarDepuracion({
                  salida: modelosDeSalida(catalogo.filas),
                  rotacion: sinRotacion(catalogo.filas).filter(f => f.probado),
                  obsoletos: obsoletosEnCeros(catalogo.filas, { ...bloqueos }),
                  categorias: porCategoria(catalogo.filas, { ...bloqueos }),
                  ...bloqueos,
                })}>
          Bajar el reporte completo (las cuatro hojas)
        </Boton>
        <span style={{ fontSize: 11, color: TINTA_TENUE, alignSelf: 'center' }}>
          {resumen.salidaMarcados} modelos marcados como descontinuados · {catalogo.soloEnHistorial > 0
            ? `${fmtN(catalogo.soloEnHistorial)} códigos con venta registrada ya no existen en ninguna caja`
            : 'todos los códigos con venta existen en alguna caja'}
        </span>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
//  1. Modelos de salida
// ═══════════════════════════════════════════════════════════════════════════

function Salidas({ filas, marcar, descargar }) {
  const todas = useMemo(() => modelosDeSalida(filas), [filas])
  const [razon, setRazon] = useState('liquidacion')
  const [estado, setEstado] = useState('todos')
  const [buscar, setBuscar] = useState('')
  const [sel, setSel] = useState(() => new Set())
  const [cuantas, setCuantas] = useState(PAGINA)
  const orden = useOrdenTabla('stockTiendas')

  const cuenta = r => todas.filter(f => r.includes(f.razon)).length
  const GRUPOS = {
    liquidacion: ['sin-alta', 'agotado-largo'],
    'sin-alta': ['sin-alta'],
    'agotado-largo': ['agotado-largo'],
    'agotado-reciente': ['agotado-reciente'],
    todas: ['sin-alta', 'agotado-largo', 'agotado-reciente'],
  }

  const visibles = useMemo(() => {
    const q = buscar.trim().toUpperCase()
    return todas.filter(f =>
      GRUPOS[razon].includes(f.razon)
      && (estado === 'todos' || (estado === 'marcados') === f.descontinuado)
      && (!q || f.codigo.toUpperCase().includes(q) || String(f.producto).toUpperCase().includes(q)))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todas, razon, estado, buscar])

  const ordenadas = useMemo(() => orden.ordenar(visibles), [visibles, orden.campo, orden.dir])
  const aPintar = ordenadas.slice(0, cuantas)
  const elegidas = ordenadas.filter(f => sel.has(f.codigo))
  const sinMarcar = elegidas.filter(f => !f.descontinuado)
  const marcadas = elegidas.filter(f => f.descontinuado)

  const alternar = (codigo, poner) => setSel(s => { const n = new Set(s); poner ? n.add(codigo) : n.delete(codigo); return n })
  const hecho = async (lista, poner) => { await marcar(lista, poner); setSel(new Set()) }

  return (
    <div data-vista-depurar="salida" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Caja titulo="Qué es esta lista">
        Modelos con <strong>bodega en cero y piezas todavía en las tiendas</strong>. No son todos lo mismo:
        si bodega ni siquiera lo tiene en su catálogo, lo descontinuó y se está liquidando; si lo tiene en
        cero desde hace poco, es un faltante normal que bodega resurte y hay que <strong>comprarlo</strong>,
        no liquidarlo. Marcarlos como descontinuados no los oculta ni los borra: sigue vendiéndose, sólo
        deja de reclamarse en Revisar como si fuera un error.
      </Caja>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Dato valor={cuenta(['sin-alta'])} etiqueta="descontinuados por bodega" color={ROSA}
              nota="ni están en su catálogo" />
        <Dato valor={cuenta(['agotado-largo'])} etiqueta="en cero hace tiempo" color={AMBAR}
              nota="más de 180 días" />
        <Dato valor={cuenta(['agotado-reciente'])} etiqueta="se resurten" color={TINTA_TENUE}
              nota="en cero hace poco" />
        <Dato valor={fmtN(todas.filter(f => GRUPOS.liquidacion.includes(f.razon)).reduce((a, f) => a + f.stockTiendas, 0))}
              etiqueta="piezas por liquidar" nota="en la lista de liquidación" />
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {[['liquidacion', 'En liquidación'], ['sin-alta', 'Descontinuados'], ['agotado-largo', 'En cero hace tiempo'],
          ['agotado-reciente', 'Se resurten'], ['todas', 'Todos']].map(([id, t]) => (
          <Pildora key={id} activa={razon === id} onClick={() => { setRazon(id); setSel(new Set()); setCuantas(PAGINA) }}>{t}</Pildora>
        ))}
        <span style={{ width: 1, height: 18, background: LINEA, margin: '0 4px' }} />
        {[['todos', 'Todos'], ['por-marcar', 'Por marcar'], ['marcados', 'Ya marcados']].map(([id, t]) => (
          <Pildora key={id} activa={estado === id} onClick={() => { setEstado(id === 'por-marcar' ? 'por-marcar' : id); setSel(new Set()) }}>{t}</Pildora>
        ))}
        <input value={buscar} onChange={e => { setBuscar(e.target.value); setSel(new Set()) }}
               placeholder="Buscar un código o modelo…" aria-label="Buscar en modelos de salida"
               style={{ flex: '1 1 180px', minWidth: 160, padding: '7px 14px', fontSize: 12.5, borderRadius: 999,
                        border: '1px solid ' + LINEA, outline: 'none', color: TINTA }} />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Boton tipo="secundario" data-marcar-visibles
                onClick={() => setSel(new Set(ordenadas.map(f => f.codigo)))}>
          Elegir los {ordenadas.length} de la lista
        </Boton>
        {sel.size > 0 && <Boton tipo="fantasma" onClick={() => setSel(new Set())}>Quitar la selección ({sel.size})</Boton>}
        <Boton tipo="primario" data-marcar-descontinuado
                disabled={!sinMarcar.length}
                style={!sinMarcar.length ? { opacity: .45, cursor: 'not-allowed' } : undefined}
                onClick={() => hecho(sinMarcar, true)}>
          Marcar como descontinuados en bodega{sinMarcar.length ? ` (${sinMarcar.length})` : ''}
        </Boton>
        {marcadas.length > 0 && (
          <Boton tipo="secundario" data-quitar-marca onClick={() => hecho(marcadas, false)}>
            Quitar la marca ({marcadas.length})
          </Boton>
        )}
        <Boton tipo="secundario" style={{ marginInlineStart: 'auto' }} onClick={descargar}>Bajar esta hoja</Boton>
      </div>

      {ordenadas.length === 0 ? (
        <p style={{ fontSize: 12.5, color: TINTA_TENUE, margin: 0 }}>Nada con esos filtros.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ width: 28 }} />
                <Th campo="codigo" orden={orden}>Código</Th>
                <Th campo="producto" orden={orden}>Modelo</Th>
                <Th campo="categoria" orden={orden}>Marca</Th>
                <Th campo="stockTiendas" orden={orden} num title="Piezas que quedan en las tiendas">En tiendas</Th>
                <Th campo="razon" orden={orden}>En bodega</Th>
                <Th campo="diasSinVender" orden={orden} valor={f => f.diasSinVender} title="Cuánto hace de la última venta">Última venta</Th>
                <Th campo="descontinuado" orden={orden} valor={f => Number(f.descontinuado)}>Estado</Th>
              </tr>
            </thead>
            <tbody>
              {aPintar.map((f, i) => (
                <tr key={f.codigo} data-fila-depurar={f.codigo} style={{ background: i % 2 ? '#FBFDFD' : '#fff' }}>
                  <td style={{ padding: '6px 4px 6px 8px' }}>
                    <Casilla marcada={sel.has(f.codigo)} onChange={p => alternar(f.codigo, p)} etiqueta={`Elegir ${f.codigo}`} />
                  </td>
                  <Td mono fuerte>{f.codigo}</Td>
                  <Td>{f.producto}</Td>
                  <Td color={TINTA_SUAVE}>{f.categoria}</Td>
                  <Td num title={dondeHay(f)} fuerte>{f.stockTiendas}</Td>
                  <Td color={RAZONES[f.razon].color}>
                    {RAZONES[f.razon].texto}
                    {f.razon === 'agotado-largo' && f.diasEnCeroBodega !== null && ` (${f.diasEnCeroBodega} d)`}
                  </Td>
                  <Td color={TINTA_SUAVE}>{haceCuanto(f)}</Td>
                  <Td color={f.descontinuado ? VERDE : TINTA_TENUE} fuerte={f.descontinuado}>
                    {f.descontinuado ? '✓ marcado' : '—'}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
          {ordenadas.length > cuantas && (
            <Boton tipo="secundario" style={{ marginTop: 10 }} onClick={() => setCuantas(c => c + PAGINA)}>
              Mostrar {Math.min(PAGINA, ordenadas.length - cuantas)} más ({ordenadas.length - cuantas} sin ver)
            </Boton>
          )}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
//  2. Sin rotación
// ═══════════════════════════════════════════════════════════════════════════

function SinRotacion({ filas, descargar }) {
  const todas = useMemo(() => sinRotacion(filas), [filas])
  const probadas = todas.filter(f => f.probado)
  const sinPrueba = todas.filter(f => !f.probado)
  const [buscar, setBuscar] = useState('')
  const [cuantas, setCuantas] = useState(PAGINA)
  const orden = useOrdenTabla('stockGlobal')

  const visibles = useMemo(() => {
    const q = buscar.trim().toUpperCase()
    return probadas.filter(f => !q || f.codigo.toUpperCase().includes(q) || String(f.producto).toUpperCase().includes(q))
  }, [probadas, buscar])
  const ordenadas = useMemo(() => orden.ordenar(visibles), [visibles, orden.campo, orden.dir])

  return (
    <div data-vista-depurar="rotacion" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Caja titulo="Qué es esta lista">
        Piezas que <strong>no se han vendido en un año</strong> en ningún sitio de la red, para acordar
        retirarlas de la exhibición o rematarlas. La última venta sale del kárdex de Eleventa, no del
        último movimiento: un recuento de inventario no la rejuvenece. Sólo entran los códigos que llevan
        al menos un año en el catálogo; uno más nuevo no ha tenido tiempo de venderse.
      </Caja>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Dato valor={probadas.length} etiqueta="códigos sin rotación" color={AMBAR} />
        <Dato valor={fmtN(probadas.reduce((a, f) => a + f.stockGlobal, 0))} etiqueta="piezas paradas" />
        <Dato valor={probadas.filter(f => f.diasSinVender === null).length} etiqueta="nunca se han vendido"
              nota="con al menos un año aquí" />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar un código o modelo…"
               aria-label="Buscar en sin rotación"
               style={{ flex: '1 1 180px', minWidth: 160, padding: '7px 14px', fontSize: 12.5, borderRadius: 999,
                        border: '1px solid ' + LINEA, outline: 'none', color: TINTA }} />
        <Boton tipo="secundario" onClick={descargar}>Bajar esta hoja</Boton>
      </div>

      {ordenadas.length === 0 ? (
        <p style={{ fontSize: 12.5, color: TINTA_TENUE, margin: 0 }}>Nada con esos filtros.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <Th campo="codigo" orden={orden}>Código</Th>
                <Th campo="producto" orden={orden}>Modelo</Th>
                <Th campo="categoria" orden={orden}>Marca</Th>
                <Th campo="stockGlobal" orden={orden} num>Piezas</Th>
                <th style={{ textAlign: 'left', padding: '8px', fontSize: 11, color: TINTA_SUAVE, borderBottom: '1px solid ' + LINEA }}>Dónde</th>
                <Th campo="diasSinVender" orden={orden} valor={f => f.diasSinVender}>Última venta</Th>
                <Th campo="diasEnCatalogo" orden={orden} num title="Días desde su primer movimiento">En catálogo</Th>
              </tr>
            </thead>
            <tbody>
              {ordenadas.slice(0, cuantas).map((f, i) => (
                <tr key={f.codigo} data-fila-depurar={f.codigo} style={{ background: i % 2 ? '#FBFDFD' : '#fff' }}>
                  <Td mono fuerte>{f.codigo}</Td>
                  <Td>{f.producto}</Td>
                  <Td color={TINTA_SUAVE}>{f.categoria}</Td>
                  <Td num fuerte>{f.stockGlobal}</Td>
                  <Td color={TINTA_SUAVE}>{dondeHay(f)}</Td>
                  <Td color={AMBAR}>{haceCuanto(f)}</Td>
                  <Td num color={TINTA_SUAVE}>{f.diasEnCatalogo !== null ? `${f.diasEnCatalogo} d` : '—'}</Td>
                </tr>
              ))}
            </tbody>
          </table>
          {ordenadas.length > cuantas && (
            <Boton tipo="secundario" style={{ marginTop: 10 }} onClick={() => setCuantas(c => c + PAGINA)}>
              Mostrar {Math.min(PAGINA, ordenadas.length - cuantas)} más ({ordenadas.length - cuantas} sin ver)
            </Boton>
          )}
        </div>
      )}

      {sinPrueba.length > 0 && (
        <details data-sin-prueba={sinPrueba.length}>
          <summary style={{ fontSize: 12, color: TINTA_SUAVE, cursor: 'pointer', lineHeight: 1.5 }}>
            {sinPrueba.length} códigos más no tienen un año en el catálogo: sin ventas, pero no se puede afirmar que no rotan
          </summary>
          <p style={{ fontSize: 11.5, color: TINTA_SUAVE, margin: '6px 0 0', lineHeight: 1.6 }}>
            {sinPrueba.slice(0, 40).map(f => `${f.codigo} (${f.diasEnCatalogo ?? '?'} d)`).join(' · ')}
            {sinPrueba.length > 40 && ` · y ${sinPrueba.length - 40} más`}
          </p>
        </details>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
//  3. Obsoletos en ceros
// ═══════════════════════════════════════════════════════════════════════════

/**
 * El cuadro de confirmación de una baja. Dice qué se va a hacer, y sobre todo
 * lo que NO: nada se borra de Eleventa.
 */
function Confirmar({ n, ejemplos, dias, enCurso, onSi, onNo, titulo }) {
  return (
    <Caja tono="ambar" data-confirmar-baja titulo={titulo ?? `¿Dar de baja ${n} ${n === 1 ? 'código' : 'códigos'}?`}>
      Se apunta la decisión y cada tienda recibe en su Excel lo que tiene que <strong>borrar en su caja</strong>:
      la página no borra nada de Eleventa. El servidor vuelve a comprobar que ninguno tenga piezas en la red
      ni ventas en los últimos {dias} días, y rechaza los que no pasen.
      {ejemplos.length > 0 && (
        <span style={{ display: 'block', marginTop: 4, color: TINTA_TENUE }}>
          {ejemplos.slice(0, 6).join(' · ')}{n > 6 ? ` · y ${n - 6} más` : ''}
        </span>
      )}
      <span style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <Boton tipo="primario" data-confirmar-si disabled={enCurso} onClick={onSi}>
          {enCurso ? 'Registrando…' : 'Sí, dar de baja'}
        </Boton>
        <Boton tipo="fantasma" disabled={enCurso} onClick={onNo}>Cancelar</Boton>
      </span>
    </Caja>
  )
}

/** Lo que contestó el servidor, sin esconder lo rechazado. */
function Resultado({ r, correcciones, inventarios, onCerrar }) {
  if (!r) return null
  return (
    <Caja tono={r.error || r.rechazados?.length ? 'ambar' : 'neutro'} data-resultado-baja
          titulo={r.error ? 'No se registró' : `Se apuntaron ${r.aceptados} ${r.aceptados === 1 ? 'baja' : 'bajas'}`}>
      {r.error && <span style={{ display: 'block' }}>{r.error}</span>}
      {!r.error && r.aceptados > 0 && (
        <span style={{ display: 'block' }}>
          Cada tienda tiene ahora en su lista lo que debe borrar de su caja. En cuanto el respaldo llegue
          sin el código, el renglón se cierra solo.
        </span>
      )}
      {r.rechazados?.length > 0 && (
        <details style={{ marginTop: 4 }} open>
          <summary style={{ cursor: 'pointer' }}>{r.rechazados.length} no pasaron el candado del servidor</summary>
          <ul style={{ margin: '4px 0 0', paddingInlineStart: 18 }}>
            {r.rechazados.slice(0, 12).map(x => (
              <li key={x.codigo}><strong>{x.codigo}</strong>: {x.motivos.slice(0, 2).join('; ')}</li>
            ))}
          </ul>
        </details>
      )}
      <span style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        {r.aceptados > 0 && (
          <Boton tipo="secundario"
                  onClick={() => descargarBajas(correcciones, inventarios)}>
            Bajar el Excel de bajas por tienda
          </Boton>
        )}
        <Boton tipo="fantasma" onClick={onCerrar}>Cerrar</Boton>
      </span>
    </Caja>
  )
}

function Obsoletos({ filas, bloqueos, darDeBaja, ocultos, correcciones, inventarios, descargar }) {
  const [dias, setDias] = useState(DIAS_MINIMOS_PARA_BAJA)
  const [elegido, setMostrar] = useState(null)
  const [buscar, setBuscar] = useState('')
  const [sel, setSel] = useState(() => new Set())
  const [confirmando, setConfirmando] = useState(false)
  const [enCurso, setEnCurso] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [cuantas, setCuantas] = useState(PAGINA)
  const orden = useOrdenTabla('diasSinVender')

  // Tres estados, no dos: lo que ya se pidió dar de baja sigue existiendo en
  // la caja hasta que alguien lo borre, y no se puede volver a elegir como si
  // nada. Pedirlo dos veces es inofensivo pero confunde: parece que no pasó.
  const todas = useMemo(
    () => obsoletosEnCeros(filas, { dias, ...bloqueos }).map(f => ({
      ...f,
      estado: ocultos.has(f.codigo.toUpperCase()) ? 'pedida' : f.puede ? 'listo' : 'no',
    })),
    [filas, dias, bloqueos, ocultos])
  const listos = todas.filter(f => f.estado === 'listo')
  // Por defecto se enseñan los que se pueden. Pero si no hay NINGUNO —que es
  // justo lo que pasa mientras falta el inventario de una plaza—, una lista
  // vacía no explica nada: se enseñan los que todavía no, con su motivo, que
  // es lo que hace falta leer.
  const mostrar = elegido ?? (listos.length ? 'listo' : 'no')
  const visibles = useMemo(() => {
    const q = buscar.trim().toUpperCase()
    return todas.filter(f =>
      (mostrar === 'todos' || f.estado === mostrar)
      && (!q || f.codigo.toUpperCase().includes(q) || String(f.producto).toUpperCase().includes(q)))
  }, [todas, mostrar, buscar])
  const ordenadas = useMemo(() => orden.ordenar(visibles), [visibles, orden.campo, orden.dir])
  const elegidos = ordenadas.filter(f => f.estado === 'listo' && sel.has(f.codigo))

  const incompleto = bloqueos.plazasSinInventario.length > 0
  const alternar = (c, p) => setSel(s => { const n = new Set(s); p ? n.add(c) : n.delete(c); return n })

  const confirmar = async () => {
    setEnCurso(true)
    const r = await darDeBaja(elegidos.map(f => f.codigo), dias)
    setEnCurso(false); setConfirmando(false); setResultado(r); setSel(new Set())
  }

  return (
    <div data-vista-depurar="obsoletos" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Caja titulo="Qué es esta lista">
        Códigos <strong>sin una sola pieza en toda la red</strong> y con la última venta de hace más de un
        año (o que nunca se vendieron y llevan más de un año aquí). Estos son los únicos que se pueden dar de
        baja. «No todavía» dice por qué: casi nunca es la venta, suele ser que falta el inventario de una
        plaza o que el código es demasiado nuevo para afirmar que no vende.
      </Caja>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Dato valor={listos.length} etiqueta="se pueden dar de baja" color={listos.length ? VERDE : TINTA_TENUE} />
        <Dato valor={todas.filter(f => f.estado === 'no').length} etiqueta="todavía no" color={AMBAR} nota="con su motivo" />
        {todas.some(f => f.estado === 'pedida') && (
          <Dato valor={todas.filter(f => f.estado === 'pedida').length} etiqueta="ya pedidas"
                nota="falta borrarlas en la caja" />
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 11.5, color: TINTA_SUAVE }}>Sin venta desde hace más de</span>
        {[[DIAS_MINIMOS_PARA_BAJA, 'un año'], [730, 'dos años']].map(([d, t]) => (
          <Pildora key={d} activa={dias === d} onClick={() => { setDias(d); setSel(new Set()) }} data-umbral={d}>{t}</Pildora>
        ))}
        <span style={{ width: 1, height: 18, background: LINEA, margin: '0 4px' }} />
        {[['listo', 'Se pueden'], ['no', 'Todavía no'], ['pedida', 'Ya pedidas'], ['todos', 'Todos']].map(([id, t]) => (
          <Pildora key={id} activa={mostrar === id} onClick={() => { setMostrar(id); setSel(new Set()) }}>{t}</Pildora>
        ))}
        <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar…" aria-label="Buscar en obsoletos"
               style={{ flex: '1 1 140px', minWidth: 120, padding: '7px 14px', fontSize: 12.5, borderRadius: 999,
                        border: '1px solid ' + LINEA, outline: 'none', color: TINTA }} />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Boton tipo="secundario"
                onClick={() => setSel(new Set(ordenadas.filter(f => f.estado === 'listo').map(f => f.codigo)))}>
          Elegir los {ordenadas.filter(f => f.estado === 'listo').length} que se pueden
        </Boton>
        {sel.size > 0 && <Boton tipo="fantasma" onClick={() => setSel(new Set())}>Quitar la selección</Boton>}
        <Boton tipo="primario" data-dar-baja
                disabled={!elegidos.length || incompleto}
                style={!elegidos.length || incompleto ? { opacity: .45, cursor: 'not-allowed' } : undefined}
                title={incompleto ? 'Falta el inventario de una plaza' : undefined}
                onClick={() => { setResultado(null); setConfirmando(true) }}>
          Dar de baja definitiva{elegidos.length ? ` (${elegidos.length})` : ''}
        </Boton>
        <Boton tipo="secundario" style={{ marginInlineStart: 'auto' }} onClick={() => descargar(dias)}>Bajar esta hoja</Boton>
      </div>

      {incompleto && (
        <Caja tono="ambar">
          El botón está apagado: falta el inventario de {bloqueos.plazasSinInventario.map(nombreSucursal).join(', ')}.
          Sin él, una pieza suya no se vería en el stock global.
        </Caja>
      )}

      {confirmando && (
        <Confirmar n={elegidos.length} ejemplos={elegidos.map(f => f.codigo)} dias={Math.max(DIAS_MINIMOS_PARA_BAJA, dias)}
                   enCurso={enCurso} onSi={confirmar} onNo={() => setConfirmando(false)} />
      )}
      <Resultado r={resultado} correcciones={correcciones} inventarios={inventarios} onCerrar={() => setResultado(null)} />

      {ordenadas.length === 0 ? (
        <p style={{ fontSize: 12.5, color: TINTA_TENUE, margin: 0 }}>Nada con esos filtros.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ width: 28 }} />
                <Th campo="codigo" orden={orden}>Código</Th>
                <Th campo="producto" orden={orden}>Modelo</Th>
                <Th campo="categoria" orden={orden}>Marca</Th>
                <Th campo="diasSinVender" orden={orden} valor={f => f.diasSinVender}>Última venta</Th>
                <Th campo="diasEnCatalogo" orden={orden} num title="Días desde su primer movimiento">En catálogo</Th>
                <Th campo="estado" orden={orden}>¿Se puede?</Th>
              </tr>
            </thead>
            <tbody>
              {ordenadas.slice(0, cuantas).map((f, i) => (
                <tr key={f.codigo} data-fila-depurar={f.codigo} data-puede={f.estado === 'listo' ? 'si' : 'no'}
                    style={{ background: i % 2 ? '#FBFDFD' : '#fff' }}>
                  <td style={{ padding: '6px 4px 6px 8px' }}>
                    <Casilla marcada={sel.has(f.codigo)} deshabilitada={f.estado !== 'listo'} etiqueta={`Elegir ${f.codigo}`}
                             onChange={p => alternar(f.codigo, p)} />
                  </td>
                  <Td mono fuerte>{f.codigo}</Td>
                  <Td>{f.producto}</Td>
                  <Td color={TINTA_SUAVE}>{f.categoria}</Td>
                  <Td color={TINTA_SUAVE}>{haceCuanto(f)}</Td>
                  <Td num color={TINTA_SUAVE}>{f.diasEnCatalogo !== null ? `${f.diasEnCatalogo} d` : '—'}</Td>
                  <Td color={f.estado === 'listo' ? VERDE : f.estado === 'pedida' ? TINTA_SUAVE : AMBAR} fuerte={f.estado === 'listo'}>
                    {f.estado === 'listo' ? 'Sí'
                      : f.estado === 'pedida' ? <span style={{ fontSize: 11 }}>Baja pedida: falta borrarlo en la caja</span>
                      : <span style={{ fontWeight: 400, fontSize: 11 }}>No todavía: {f.bloqueos.slice(0, 2).join('; ')}</span>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
          {ordenadas.length > cuantas && (
            <Boton tipo="secundario" style={{ marginTop: 10 }} onClick={() => setCuantas(c => c + PAGINA)}>
              Mostrar {Math.min(PAGINA, ordenadas.length - cuantas)} más ({ordenadas.length - cuantas} sin ver)
            </Boton>
          )}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
//  4. Por marca o departamento
// ═══════════════════════════════════════════════════════════════════════════

function Categorias({ filas, bloqueos, darDeBaja, ocultos, correcciones, inventarios, descargar }) {
  const orden = useOrdenTabla('diasSinVender')
  const todas = useMemo(
    () => porCategoria(filas, { dias: DIAS_CATEGORIA_SIN_MOVIMIENTO, ...bloqueos }), [filas, bloqueos])
  const ordenadas = useMemo(() => orden.ordenar(todas), [todas, orden.campo, orden.dir])
  const [abierta, setAbierta] = useState(null)
  const [confirmando, setConfirmando] = useState(null)
  const [enCurso, setEnCurso] = useState(false)
  const [resultado, setResultado] = useState(null)
  const incompleto = bloqueos.plazasSinInventario.length > 0
  // Una categoría cuyos códigos ya se pidieron dar de baja no se vuelve a ofrecer.
  const pedida = c => c.codigosLista.length > 0 && c.codigosLista.every(f => ocultos.has(f.codigo.toUpperCase()))
  const enteras = todas.filter(c => c.completa && !pedida(c))

  const confirmar = async cat => {
    setEnCurso(true)
    const r = await darDeBaja(cat.codigosLista.map(f => f.codigo), DIAS_CATEGORIA_SIN_MOVIMIENTO)
    setEnCurso(false); setConfirmando(null); setResultado(r)
  }

  const impide = c => {
    const partes = []
    if (c.conStock) partes.push(`${c.conStock} de ${c.codigos} ${c.conStock === 1 ? 'código tiene' : 'códigos tienen'} piezas (${fmtN(c.stock)})`)
    if (c.conVentaReciente) partes.push(`${c.conVentaReciente} ${c.conVentaReciente === 1 ? 'se vendió' : 'se vendieron'} en los últimos dos años`)
    const otros = c.bloqueados.length - c.conStock - c.conVentaReciente
    if (otros > 0 && !partes.length) partes.push(`${c.bloqueados.length} sin prueba suficiente`)
    return partes.join('; ')
  }

  return (
    <div data-vista-depurar="categorias" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Caja titulo="Qué es esta lista">
        Una marca o departamento sólo se puede dar de baja <strong>entero</strong> si cada uno de sus códigos
        pasa el candado: sin una pieza en la red y sin venta en dos años. Basta una pieza o una venta reciente
        para que no. Una marca con mucho tiempo sin vender pero con piezas todavía <strong>no se borra</strong>:
        se liquida primero (mira «Sin rotación»). El departamento viene de Eleventa; donde no viaja se
        deduce del nombre del producto.
      </Caja>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Dato valor={todas.length} etiqueta="marcas o departamentos" />
        <Dato valor={enteras.length} etiqueta="se pueden dar de baja enteras" color={enteras.length ? VERDE : TINTA_TENUE} />
        <Boton tipo="secundario" style={{ alignSelf: 'center', marginInlineStart: 'auto' }} onClick={descargar}>Bajar esta hoja</Boton>
      </div>

      {confirmando && (
        <Confirmar n={confirmando.codigos} ejemplos={confirmando.codigosLista.map(f => f.codigo)} dias={DIAS_CATEGORIA_SIN_MOVIMIENTO}
                   enCurso={enCurso} onSi={() => confirmar(confirmando)} onNo={() => setConfirmando(null)}
                   titulo={`¿Dar de baja ${confirmando.categoria} entera (${confirmando.codigos} ${confirmando.codigos === 1 ? 'código' : 'códigos'})?`} />
      )}
      <Resultado r={resultado} correcciones={correcciones} inventarios={inventarios} onCerrar={() => setResultado(null)} />

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <Th campo="categoria" orden={orden}>Marca o departamento</Th>
              <Th campo="codigos" orden={orden} num>Códigos</Th>
              <Th campo="stock" orden={orden} num>Piezas</Th>
              <Th campo="diasSinVender" orden={orden} valor={c => c.diasSinVender}>Última venta</Th>
              <Th campo="completa" orden={orden} valor={c => Number(c.completa)}>¿Entera?</Th>
              <th style={{ textAlign: 'left', padding: '8px', fontSize: 11, color: TINTA_SUAVE, borderBottom: '1px solid ' + LINEA }}>Qué lo impide</th>
            </tr>
          </thead>
          <tbody>
            {ordenadas.map((c, i) => (
              <Fragment key={c.categoria}>
                <tr data-categoria={c.categoria} data-entera={c.completa ? 'si' : 'no'}
                    style={{ background: i % 2 ? '#FBFDFD' : '#fff', cursor: 'pointer' }}
                    onClick={() => setAbierta(abierta === c.categoria ? null : c.categoria)}>
                  <Td fuerte>{abierta === c.categoria ? '▾' : '▸'} {c.categoria}</Td>
                  <Td num>{c.codigos}</Td>
                  <Td num fuerte color={c.stock ? TINTA : TINTA_TENUE}>{fmtN(c.stock)}</Td>
                  <Td color={TINTA_SUAVE}>{c.ultimaVenta ? haceCuanto({ diasSinVender: c.diasSinVender }) : 'nunca'}</Td>
                  <Td color={c.completa ? VERDE : AMBAR} fuerte>
                    {c.completa && pedida(c) ? <span style={{ fontWeight: 400, fontSize: 11, color: TINTA_SUAVE }}>Baja pedida</span> : c.completa ? (
                      <Boton tipo="primario" data-dar-baja-categoria={c.categoria}
                              disabled={incompleto}
                              style={incompleto ? { opacity: .45, cursor: 'not-allowed' } : undefined}
                              onClick={e => { e.stopPropagation(); setResultado(null); setConfirmando(c) }}>
                        Sí · dar de baja
                      </Boton>
                    ) : 'No'}
                  </Td>
                  <Td color={TINTA_SUAVE}>{c.completa ? '' : impide(c)}</Td>
                </tr>
                {abierta === c.categoria && (
                  <tr>
                    <td colSpan={6} style={{ padding: '4px 8px 10px 22px', background: 'rgba(16,22,25,0.02)' }}>
                      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {c.codigosLista.slice(0, 40).map(f => {
                          const b = c.bloqueados.find(x => x.codigo === f.codigo)
                          return (
                            <li key={f.codigo} style={{ fontSize: 11.5, color: TINTA_SUAVE }}>
                              <strong style={{ color: TINTA, fontFamily: 'ui-monospace, monospace' }}>{f.codigo}</strong>
                              {' · '}{f.producto}{' · '}{f.stockGlobal} pz{' · '}{haceCuanto(f)}
                              {b ? <span style={{ color: AMBAR }}> — {b.bloqueos[0]}</span> : <span style={{ color: VERDE }}> — se puede</span>}
                            </li>
                          )
                        })}
                        {c.codigosLista.length > 40 && <li style={{ fontSize: 11, color: TINTA_TENUE }}>y {c.codigosLista.length - 40} más</li>}
                      </ul>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
