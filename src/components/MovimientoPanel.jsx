// Qué se mueve en cada tienda, para decidir qué mandarle.
//
// Sustituye a «Comprar» en el panel de bodega. Bodega no compra —lo dijo el
// dueño— y tener ahí una sección de compras al proveedor era enseñar una
// decisión que no es suya.
//
// Lo que sí necesita antes de armar una caja es esto, con sus palabras: «qué
// modelos son los que se mueven más en cada sucursal, y de los modelos nuevos
// cuáles se están agotando más rápidamente».
//
// Las tres listas, y la tercera es la que nadie pide:
//
//   · **Se están agotando** — recién llegados que ya se vacían. Urgente,
//     porque un modelo nuevo sin historial que ya vuela entró bien.
//   · **Lo que más se mueve** — el ritmo de cada plaza, no sus piezas.
//   · **No hace falta mandar** — tiene existencia y está parado. Es la que
//     libera sitio: meter diez de algo parado deja fuera diez de algo que
//     vuela.
//
// Las cuentas viven en `lib/movimiento.js`, con pruebas.

import { useEffect, useMemo, useState } from 'react'
import { SUCURSALES_ACTIVAS } from '../lib/sucursales'
import { inventarioJsonUrl, historialUrl, estadisticasUrl } from '../lib/s3'
import {
  loQueMasSeMueve, nuevosQueVuelan, loQueNoMandar, porModeloYPlaza, DIAS_PARA_QUEMARSE,
} from '../lib/movimiento'
import { DIAS_RECIEN_LLEGADO } from '../lib/surtido'

const TINTA       = '#101619'
const TINTA_SUAVE = '#4A5A61'
const TINTA_TENUE = '#8598A1'
const LINEA       = '#D6E0E4'
const ROSA        = '#C4156F'
const VERDE       = '#5E9422'
const AMBAR       = '#B45309'

const CORTO = {
  leon: 'León', 'san-luis': 'SLP', aguascalientes: 'Ags', torreon: 'Torreón', ferias: 'Ferias',
}

const uno = n => (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10)

function Caja({ titulo, nota, color, children }) {
  return (
    <section style={{ border: '1px solid ' + LINEA, borderRadius: 22, padding: '18px 20px' }}>
      <h4 style={{ fontSize: 13, fontWeight: 800, color: color ?? TINTA, margin: '0 0 4px' }}>
        {titulo}
      </h4>
      <p style={{ fontSize: 11.5, color: TINTA_SUAVE, margin: '0 0 14px', lineHeight: 1.55 }}>
        {nota}
      </p>
      {children}
    </section>
  )
}

/** Una fila de modelo, con lo que hace falta para decidir. */
function Fila({ f, destacar }) {
  return (
    <li style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: 10,
                 alignItems: 'baseline', fontSize: 12 }}>
      {/* El CÓDIGO delante: la caja se arma por código, no por nombre. */}
      <span style={{ fontWeight: 800, color: destacar ?? TINTA, minWidth: '8ch',
                     fontVariantNumeric: 'tabular-nums' }}>
        {f.codigo}
      </span>
      <span style={{ color: TINTA_SUAVE, overflow: 'hidden', textOverflow: 'ellipsis',
                     whiteSpace: 'nowrap' }} title={f.producto}>
        {f.producto || '—'}
      </span>
      <span style={{ color: TINTA_TENUE, whiteSpace: 'nowrap' }}>
        {uno(f.ritmo)}/día · quedan {f.existencia}
      </span>
      <span style={{ fontWeight: 800, whiteSpace: 'nowrap', minWidth: '6ch', textAlign: 'right',
                     color: f.dias === null ? TINTA_TENUE : f.dias <= DIAS_PARA_QUEMARSE ? ROSA : TINTA }}>
        {f.dias === null ? '—' : `${Math.round(f.dias)} d`}
      </span>
    </li>
  )
}

function PorPlaza({ datos, plazas, vacio, destacar }) {
  const con = plazas.filter(p => (datos[p.slug] ?? []).length)
  if (!con.length) {
    return <p style={{ fontSize: 12, color: TINTA_TENUE, margin: 0 }}>{vacio}</p>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {con.map(p => (
        <div key={p.slug}>
          <p style={{ fontSize: 11.5, fontWeight: 800, color: TINTA, margin: '0 0 6px' }}>
            {p.nombre}
            <span style={{ fontWeight: 600, color: TINTA_TENUE }}> · {datos[p.slug].length}</span>
          </p>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
            {datos[p.slug].slice(0, 8).map(f => (
              <Fila key={f.codigo} f={f} destacar={destacar} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

export default function MovimientoPanel() {
  const plazas = useMemo(() => SUCURSALES_ACTIVAS, [])
  const [porPlaza, setPorPlaza] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [grupo, setGrupo] = useState('funda')

  useEffect(() => {
    let cancelado = false
    setCargando(true)
    ;(async () => {
      const bajar = async url => {
        try {
          const r = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' })
          return r.ok ? await r.json() : null
        } catch { return null }
      }
      const pares = await Promise.all(plazas.map(async p => [p.slug, {
        inv:  await bajar(inventarioJsonUrl(p.slug)),
        hist: await bajar(historialUrl(p.slug)),
        est:  await bajar(estadisticasUrl(p.slug)),
      }]))
      if (!cancelado) { setPorPlaza(Object.fromEntries(pares)); setCargando(false) }
    })()
    return () => { cancelado = true }
  }, [plazas])

  // Los ganchos van todos arriba, por encima del return temprano: uno
  // colocado después cambia el número entre dibujos y deja la pantalla en
  // blanco. Ya pasó dos veces en este proyecto.
  const urgentes = useMemo(
    () => (porPlaza ? nuevosQueVuelan(porPlaza, { grupo }) : {}), [porPlaza, grupo])
  const top = useMemo(
    () => (porPlaza ? loQueMasSeMueve(porPlaza, { grupo }) : {}), [porPlaza, grupo])
  const sobra = useMemo(
    () => (porPlaza ? loQueNoMandar(porPlaza, { grupo }) : {}), [porPlaza, grupo])
  const red = useMemo(
    () => (porPlaza ? porModeloYPlaza(porPlaza, { grupo }) : []), [porPlaza, grupo])

  if (cargando) {
    return (
      <div style={{ backgroundColor: '#fff', borderRadius: 30, border: '1px solid ' + LINEA, padding: '24px 22px' }}>
        <p style={{ fontSize: 13, color: TINTA_TENUE, margin: 0 }}>Midiendo el movimiento de cada tienda...</p>
      </div>
    )
  }

  return (
    <div data-movimiento
         style={{ backgroundColor: '#fff', borderRadius: 30, border: '1px solid ' + LINEA,
                  padding: '24px 22px', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <p style={{ fontSize: 12, color: TINTA_SUAVE, margin: 0, lineHeight: 1.5 }}>
          Lo que de verdad se mueve en cada mostrador, para decidir qué meter en la caja. El ritmo
          es el ponderado: la mitad del peso en las últimas cuatro semanas, no el promedio de todo
          el historial —con el promedio plano se agotaban modelos recién surtidos—.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {[['funda', 'Fundas'], ['protector', 'Micas e hidrogel']].map(([k, t]) => (
          <button key={k} type="button" onClick={() => setGrupo(k)}
                  className={grupo === k ? 'chip-plaza activa' : 'chip-plaza'}>
            {t}
          </button>
        ))}
      </div>

      <Caja titulo="Se están agotando, y son nuevos" color={ROSA}
            nota={`Llegaron hace menos de ${DIAS_RECIEN_LLEGADO} días y ya les quedan ${DIAS_PARA_QUEMARSE} o menos. Un modelo nuevo no tiene historial que lo respalde: si ya se vacía, es que entró bien y conviene reforzarlo ahora, no en el surtido del mes.`}>
        <PorPlaza datos={urgentes} plazas={plazas} destacar={ROSA}
                  vacio="Ningún recién llegado se está agotando. Es buena noticia: lo que entró, entró con existencia suficiente." />
      </Caja>

      <Caja titulo="Lo que más se mueve en cada tienda" color={VERDE}
            nota="Por velocidad, no por piezas acumuladas: las piezas premian al modelo viejo, que lleva más tiempo sumando. Lo que decide una caja es a qué ritmo se vacía el mostrador.">
        <PorPlaza datos={top} plazas={plazas} destacar={VERDE}
                  vacio="Sin venta medida todavía en ninguna plaza." />
      </Caja>

      <Caja titulo="No hace falta mandar" color={AMBAR}
            nota="Tienen existencia y llevan sin moverse. Es la lista que libera sitio: meter diez de algo parado es dejar fuera diez de algo que vuela.">
        <PorPlaza datos={sobra} plazas={plazas} destacar={AMBAR}
                  vacio="Todo lo que hay en mostrador se está moviendo." />
      </Caja>

      {red.length > 0 && (
        <Caja titulo="El mismo modelo, en todas las plazas"
              nota="Es la vista que de verdad decide una caja: un modelo puede volar en una tienda y estar parado en otra, y eso no se ve mirando una plaza cada vez.">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ color: TINTA_TENUE, fontSize: 10.5 }}>
                  <th style={{ textAlign: 'left', fontWeight: 600, padding: '4px 0' }}>Código</th>
                  <th style={{ textAlign: 'left', fontWeight: 600 }}>Modelo</th>
                  {plazas.map(p => (
                    <th key={p.slug} style={{ fontWeight: 600, textAlign: 'right', minWidth: 74 }}>
                      {CORTO[p.slug] ?? p.nombre}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {red.map(e => (
                  <tr key={e.codigo} style={{ borderTop: '1px solid ' + LINEA }}>
                    <td style={{ padding: '6px 0', fontWeight: 800, color: TINTA, whiteSpace: 'nowrap' }}>
                      {e.codigo}
                    </td>
                    <td style={{ color: TINTA_SUAVE, maxWidth: 200, overflow: 'hidden',
                                 textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.producto}>
                      {e.producto || '—'}
                    </td>
                    {plazas.map(p => {
                      const v = e.plazas[p.slug]
                      // Sin ritmo pero CON existencia es «no mandar»; sin las
                      // dos cosas es «no lo tiene», que es lo contrario.
                      const parado = v && v.ritmo === 0 && v.existencia > 0
                      return (
                        <td key={p.slug} style={{ textAlign: 'right', whiteSpace: 'nowrap',
                                                  color: parado ? AMBAR : TINTA }}>
                          {!v ? <span style={{ color: TINTA_TENUE }}>—</span> : (
                            <>
                              <strong>{uno(v.ritmo)}</strong>
                              <span style={{ color: TINTA_TENUE }}>/{v.existencia}</span>
                            </>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 11, color: TINTA_TENUE, margin: '10px 0 0' }}>
            Cada celda: <strong>ritmo al día</strong> / piezas que quedan. En ámbar, las plazas que
            tienen existencia y no lo mueven.
          </p>
        </Caja>
      )}
    </div>
  )
}
