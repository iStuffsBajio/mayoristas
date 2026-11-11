// Consultar un modelo: cuánto vende, dónde, y si lo que vende es de fiar.
//
// Lo pidió el dueño el 2026-11-09 para el usuario de BODEGA: «hay que agregar
// para que pueda consultar un modelo en específico las ventas, o de los más
// vendidos». Bodega surte y compra, y para decidir cuánto mandar de algo hace
// falta mirarlo de cerca, no sólo en la lista de «Pedir».
//
// ── Lo que bodega puede ver aquí, y lo que no ──────────────────────────────
//
// Sale SÓLO de `estadisticas.json`, `historial.json` e `inventario.json`, que
// son públicos. NO usa `ventas/` —la venta línea por línea—, que lleva la
// lista de mayoristas del negocio y que bodega tiene vedada con un 403. Es la
// misma ficha que ve el administrador en Ventas, sin un dato más.
//
// ── Y la existencia al lado de la venta ────────────────────────────────────
//
// La otra mitad de lo que preguntó: el HONOR X8D salía en «Pedir» con una o
// dos piezas, «pero quiero saber si eso se debe a que estaba agotado o si
// realmente es un número confiable». Una venta baja con mercancía en el
// mostrador es poca demanda; una venta baja con el mostrador vacío no dice
// nada de la demanda. Cada plaza enseña lo que TIENE junto a lo que VENDIÓ.

import { useEffect, useMemo, useState } from 'react'
import { SUCURSALES_PUBLICAS, BODEGA } from '../lib/sucursales'
import { estadisticasUrl, historialUrl, inventarioJsonUrl, agotadosUrl } from '../lib/s3'
import { modelosQueCoinciden, fichaDeVentas, catalogoDeVentas } from '../lib/buscarVentas'
import { FichaCodigo } from './EstadisticasPanel'
import { existenciasDeCodigo, agotadosDeCodigo } from '../lib/rotacion'

const TINTA       = '#101619'
const TINTA_SUAVE = '#4A5A61'
const TINTA_TENUE = '#8598A1'
const LINEA       = '#D6E0E4'

const RANGOS = [30, 60]

export default function ConsultaModelo() {
  // Las tiendas que VENDEN, Torreón incluida aunque un mayorista no la vea.
  const plazas = useMemo(() => SUCURSALES_PUBLICAS, [])
  const [porSucursal, setPorSucursal] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [clave, setClave] = useState(null)
  const [rango, setRango] = useState(30)

  useEffect(() => {
    let vivo = true
    const bajar = async url => {
      const r = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' })
      if (!r.ok) throw new Error(String(r.status))
      return r.json()
    }
    ;(async () => {
      const pares = await Promise.all(plazas.map(async p => [p.slug, {
        est:  await bajar(estadisticasUrl(p.slug)).catch(() => null),
        hist: await bajar(historialUrl(p.slug)).catch(() => null),
        inv:  await bajar(inventarioJsonUrl(p.slug)).catch(() => null),
        // Los días en cero, del kárdex. Puede faltar —antes de la primera
        // sincronización que los mide— y entonces la ficha lo dice.
        ago:  await bajar(agotadosUrl(p.slug)).catch(() => null),
      }]))
      const invBodega = await bajar(inventarioJsonUrl(BODEGA.slug)).catch(() => null)
      if (!vivo) return

      setPorSucursal({ ...Object.fromEntries(pares), [BODEGA.slug]: { inv: invBodega } })
      setCargando(false)
    })()
    return () => { vivo = false }
  }, [plazas])

  const buscando = busqueda.trim().length >= 2
  const coincidencias = useMemo(
    () => (buscando && porSucursal ? modelosQueCoinciden({ porSucursal, consulta: busqueda }) : []),
    [buscando, porSucursal, busqueda])

  // Escribir y no tocar nada más ya enseña la ficha de la primera
  // coincidencia: es lo que se busca casi siempre.
  const claveVista = clave ?? coincidencias[0]?.clave ?? null

  const ficha = useMemo(
    () => (claveVista && porSucursal
      ? fichaDeVentas({ porSucursal, clave: claveVista, plazas, rango })
      : null),
    [claveVista, porSucursal, plazas, rango])

  // Los más vendidos del rango, sumando las plazas. Es lo que se ve sin
  // haber escrito nada, y cada renglón abre su ficha.
  const top = useMemo(() => {
    if (!porSucursal) return []
    const cat = catalogoDeVentas(porSucursal)
    const suma = {}
    const desde = new Date()
    desde.setDate(desde.getDate() - rango)
    const corte = desde.toISOString().slice(0, 10)
    for (const p of plazas) {
      for (const d of porSucursal[p.slug]?.est?.dias ?? []) {
        if (d.f < corte) continue
        for (const [k, n] of Object.entries(d.m ?? {})) suma[k] = (suma[k] || 0) + (Number(n) || 0)
      }
    }
    return Object.entries(suma)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([k, n]) => ({ clave: k, producto: cat[k] || k, piezas: n }))
  }, [porSucursal, plazas, rango])

  // Las mismas cuentas que la ficha del administrador en Ventas: salen de
  // `lib/rotacion.js`, no de un cálculo propio de esta pantalla.
  const existenciasDe = useMemo(() => {
    if (!ficha?.codigo || !porSucursal) return null
    const inv = Object.fromEntries(
      [...plazas.map(p => p.slug), BODEGA.slug].map(slug => [slug, porSucursal[slug]?.inv ?? null]))
    return existenciasDeCodigo(ficha.codigo, inv)
  }, [ficha, porSucursal, plazas])

  const agotadosDe = useMemo(() => {
    if (!ficha?.codigo || !porSucursal) return null
    return agotadosDeCodigo(ficha.codigo,
      Object.fromEntries(plazas.map(p => [p.slug, porSucursal[p.slug]?.ago ?? null])))
  }, [ficha, porSucursal, plazas])

  if (cargando) {
    return <p style={{ fontSize: 13, color: TINTA_TENUE }}>Leyendo la venta de las tiendas…</p>
  }

  return (
    <div data-consulta-modelo style={{ background: '#fff', borderRadius: 30, border: '1px solid ' + LINEA,
                                        padding: '24px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ fontSize: 12, color: TINTA_SUAVE, margin: 0, lineHeight: 1.5 }}>
        Cuánto vende un modelo en cada tienda, y cuánto tiene cada una. Al lado de cada venta
        va la existencia de hoy: una venta baja con mercancía en el mostrador es poca demanda,
        pero <strong>con el mostrador en cero no dice nada</strong> —no se vendió porque no había—.
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          aria-label="Buscar un modelo por nombre o código"
          data-buscar-modelo
          value={busqueda}
          onChange={e => { setBusqueda(e.target.value); setClave(null) }}
          placeholder="Buscar: x8d, iphone 15, SGA17T…"
          style={{ flex: '1 1 240px', padding: '10px 14px', borderRadius: 999, border: '1.5px solid ' + LINEA,
                   fontSize: 14, fontFamily: 'inherit', outline: 'none' }} />
        {RANGOS.map(r => (
          <button key={r} type="button" onClick={() => setRango(r)}
                  className={rango === r ? 'chip-plaza activa' : 'chip-plaza'}>
            {r} días
          </button>
        ))}
      </div>

      {buscando && coincidencias.length > 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {coincidencias.slice(0, 8).map(m => (
            <button key={m.clave} type="button" onClick={() => setClave(m.clave)}
                    className={claveVista === m.clave ? 'chip-plaza activa' : 'chip-plaza'}
                    style={{ fontSize: 11.5 }}>
              {m.producto}
            </button>
          ))}
        </div>
      )}

      {buscando && !coincidencias.length && (
        <p style={{ fontSize: 12.5, color: TINTA_TENUE, margin: 0 }}>
          Ningún modelo con salidas coincide con «{busqueda}». El archivo de movimiento sólo
          tiene los códigos que han bajado de existencia alguna vez, no todo el catálogo.
        </p>
      )}

      {ficha && (buscando || clave) && (
        <FichaCodigo ficha={ficha} rango={rango} existencias={existenciasDe} agotados={agotadosDe} />
      )}

      {!buscando && !clave && top.length > 0 && (
        <div data-mas-vendidos>
          <h4 style={{ fontSize: 13, fontWeight: 800, color: TINTA, margin: '0 0 8px' }}>
            Los más vendidos en {rango} días, en las tiendas
          </h4>
          <ol style={{ margin: 0, paddingInlineStart: 22, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {top.map(m => (
              <li key={m.clave} style={{ fontSize: 12.5 }}>
                <button type="button" onClick={() => setClave(m.clave)} data-abrir-modelo={m.clave}
                        style={{ background: 'none', border: 'none', padding: 0, font: 'inherit',
                                 color: TINTA, cursor: 'pointer', textAlign: 'start' }}>
                  {m.producto} <span style={{ color: TINTA_TENUE }}>· {m.piezas} pz</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}

      {clave && !buscando && (
        <button type="button" onClick={() => setClave(null)} className="rev-saltar"
                style={{ alignSelf: 'flex-start' }}>
          ← Volver a los más vendidos
        </button>
      )}
    </div>
  )
}
