import { useState, useEffect, useMemo } from 'react'
import { SUCURSALES_ACTIVAS, SUCURSALES, BODEGA } from '../lib/sucursales'
import { inventarioJsonUrl, historialUrl, estadisticasUrl } from '../lib/s3'
import { turnos as pedirTurnos, apiConfigurada } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { resumir, consolidarEstadisticas } from '../lib/estadisticas'
import { analizarAgotados, piezasPerdidas, DIAS_SIN_COMPRAR } from '../lib/compras'
import { resumirSemana, semanaPasada, formatoRango } from '../lib/personal'
import { clasePorModelo, agotadosPorUbicacion } from '../lib/clases'
import { separarProtectores, esProtector } from '../lib/familias'
import { promedioEntrePlazas, desviaciones, valorDe } from '../lib/precios'
import BarrasAgotados from './BarrasAgotados'

/**
 * Dashboard: lo más importante de cada sección, en una sola pantalla.
 *
 * No calcula nada propio. Llama a las mismas funciones que usan los paneles
 * —`resumir`, `analizarAgotados`, `resumirSemana`— para que un número aquí no
 * pueda contradecir al de su pestaña. Si una regla cambia, cambia en los dos
 * sitios a la vez porque es la misma función.
 *
 * El orden no es casual: primero lo que exige una decisión hoy (las alertas),
 * después el panorama. Un dashboard que empieza por el gráfico bonito obliga
 * a buscar el problema.
 */

const FERIAS = SUCURSALES.find(s => s.estacional)

// Cuántos días puede llevar un inventario sin actualizarse antes de que deje
// de ser de fiar. La corrida automática publica cuatro veces al día, así que
// más de un día parado significa que algo se atoró.
const DIAS_INVENTARIO_VIEJO = 2

const bajar = async url => {
  const r = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' })
  if (!r.ok) throw new Error(String(r.status))
  return r.json()
}

/**
 * Eleventa guarda los nombres como los teclearon: «daniela coronilla». En una
 * pantalla que se enseña, eso se lee como descuido.
 */
const comoNombre = s => String(s ?? '')
  .toLocaleLowerCase('es-MX')
  .replace(/(^|\s)(\p{L})/gu, (_, e, l) => e + l.toLocaleUpperCase('es-MX'))

const diasDesdeISO = (iso, hoy = new Date()) => {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return Math.floor((hoy - d) / 86400000)
}

export default function DashboardPanel({ onIrA }) {
  const { token } = useAuth()
  const [datos, setDatos]       = useState(null)
  const [turnos, setTurnos]     = useState(null)
  const [cargando, setCargando] = useState(true)

  const sucursales = SUCURSALES_ACTIVAS

  useEffect(() => {
    let cancelado = false
    setCargando(true)
    ;(async () => {
      const slugs = [...sucursales.map(s => s.slug), BODEGA.slug, ...(FERIAS ? [FERIAS.slug] : [])]
      const pares = await Promise.all(slugs.map(async slug => [slug, {
        inv:  await bajar(inventarioJsonUrl(slug)).catch(() => null),
        hist: await bajar(historialUrl(slug)).catch(() => null),
        est:  await bajar(estadisticasUrl(slug)).catch(() => null),
      }]))
      if (!cancelado) setDatos(Object.fromEntries(pares))

      // Los turnos van por el backend, no por S3: llevan nombres de personas.
      if (apiConfigurada) {
        try {
          const d = await pedirTurnos(token)
          if (!cancelado) setTurnos(d?.turnos ?? [])
        } catch { if (!cancelado) setTurnos([]) }
      }
      if (!cancelado) setCargando(false)
    })()
    return () => { cancelado = true }
  }, [sucursales, token])

  // ── Ventas de los últimos 30 días, las tres tiendas juntas ────────────
  const ventas = useMemo(() => {
    if (!datos) return null
    const ests = sucursales.map(s => datos[s.slug]?.est).filter(Boolean)
    if (!ests.length) return null
    return resumir(consolidarEstadisticas(ests), 30)
  }, [datos, sucursales])

  // ── Agotados ──────────────────────────────────────────────────────────
  const agotados = useMemo(() => {
    if (!datos || !datos[BODEGA.slug]?.inv) return null
    const inventarios = Object.fromEntries(sucursales.map(s => [s.slug, datos[s.slug]?.inv]))
    const historiales = [...sucursales.map(s => datos[s.slug]?.hist), datos[FERIAS?.slug]?.hist]
    return analizarAgotados({ inventarios, historiales, productosBodega: datos[BODEGA.slug].inv.productos })
  }, [datos, sucursales])

  // Micas e hidrogel se controlan aparte: se venden, se reponen y se miden
  // distinto que una funda. Ocho códigos de 581 que pesan el 8.3% de la venta
  // y ocupan cuatro de los cinco primeros puestos del ranking; mezclados,
  // tapan a las fundas que de verdad mueven el mostrador.
  const { fundas: agotadosFunda, protectores: agotadosProtector } = useMemo(
    () => separarProtectores(agotados?.filas), [agotados])

  const porUbicacion = useMemo(() => {
    if (!agotados || !datos) return null
    const historiales = [...sucursales.map(s => datos[s.slug]?.hist), datos[FERIAS?.slug]?.hist]
    return agotadosPorUbicacion(agotadosFunda, clasePorModelo(historiales), sucursales, BODEGA)
  }, [agotados, agotadosFunda, datos, sucursales])

  // ── Precios ───────────────────────────────────────────────────────────
  //
  // Bodega queda fuera a proposito: sus precios no se mantienen porque no
  // vende, y meterla arruinaria la referencia.
  const precios = useMemo(() => {
    if (!datos) return null
    const soloTiendas = Object.fromEntries(sucursales.map(s => [s.slug, datos[s.slug]?.inv]))
    const pr = promedioEntrePlazas(soloTiendas)
    return Object.keys(pr).length ? pr : null
  }, [datos, sucursales])

  const fueraDePrecio = useMemo(() => {
    if (!precios) return []
    const nombres = Object.fromEntries(sucursales.map(s => [s.slug, s.nombre]))
    return desviaciones(precios, { nombres }).slice(0, 6)
  }, [precios, sucursales])

  // Lo que cuesta en pesos tener agotado lo que se vendia. Sin precios
  // publicados vale null y la pantalla sigue hablando en piezas: un cero aqui
  // se leeria como «no pierdes nada», que es lo contrario de la verdad.
  const perdidoEnPesos = useMemo(() => {
    if (!precios || !agotados?.fugas?.length) return null
    const total = agotados.fugas.reduce((a, f) => a + valorDe(f.codigo, piezasPerdidas(f), precios), 0)
    return total > 0 ? Math.round(total) : null
  }, [precios, agotados])

  // ── Personal: la semana pasada, que es la única completa ──────────────
  const rango = useMemo(() => semanaPasada(), [])
  const personal = useMemo(
    () => (turnos?.length ? resumirSemana(turnos, rango) : null),
    [turnos, rango])

  // ── Alertas: sólo lo que pide una decisión hoy ────────────────────────
  const alertas = useMemo(() => {
    const out = []
    if (!datos) return out

    // Un inventario parado es la alerta más importante: si éste falla, todos
    // los demás números de la pantalla están mirando al pasado.
    for (const s of [...sucursales, BODEGA]) {
      const gen = datos[s.slug]?.inv?.generado
      const d = diasDesdeISO(gen)
      if (d === null) out.push({ tono: 'grave', texto: `${s.nombre} no tiene inventario publicado`, ir: 'inventarios' })
      else if (d >= DIAS_INVENTARIO_VIEJO) out.push({ tono: 'grave', texto: `El inventario de ${s.nombre} lleva ${d} días sin actualizarse`, ir: 'inventarios' })
    }

    if (agotados) {
      const claseA = porUbicacion?.reduce((n, u) => n + u.A, 0) ?? 0
      if (claseA > 0) out.push({ tono: 'grave', texto: `${claseA} ${claseA === 1 ? 'modelo' : 'modelos'} de clase A en cero`, ir: 'bodega' })
      if (agotados.perdidas > 0) out.push({ tono: 'aviso', texto: `Unas ${agotados.perdidas} piezas perdidas por estar agotado`, ir: 'bodega' })
      const protEnCero = agotadosProtector.length
      if (protEnCero > 0) out.push({ tono: 'aviso', texto: `${protEnCero} ${protEnCero === 1 ? 'mica o hidrogel' : 'micas o hidrogeles'} en cero`, ir: 'bodega' })
      if (agotados.inactivos?.length) out.push({ tono: 'aviso', texto: `${agotados.inactivos.length} modelos que se venden y bodega no compra hace ${DIAS_SIN_COMPRAR}+ días`, ir: 'bodega' })
    }

    if (personal?.filas?.length) {
      const conRetardo = personal.filas.filter(f => f.retardos > 0)
      if (conRetardo.length) out.push({ tono: 'aviso', texto: `${conRetardo.length} ${conRetardo.length === 1 ? 'persona acumuló retardos' : 'personas acumularon retardos'} la semana pasada`, ir: 'personal' })
    }

    return out
  }, [datos, agotados, agotadosProtector, porUbicacion, personal, sucursales])

  if (cargando) return <p className="tablero-cargando">Reuniendo la información de todas las secciones…</p>

  const rankSeparado = separarProtectores(ventas?.ranking)
  const topVentas = rankSeparado.fundas.slice(0, 5)
  const topProtector = rankSeparado.protectores.slice(0, 5)
  const topPerdidas = (agotados?.fugas ?? []).filter(f => !esProtector(f.codigo, f.producto)).slice(0, 4)

  return (
    <div className="tablero">

      {/* ── Lo que pide una decisión ────────────────────────────────── */}
      <section className="tablero-alertas">
        <h3>Atención</h3>
        {alertas.length === 0 ? (
          <p className="tablero-ok">Nada urgente. Los inventarios están al día y no hay modelos de clase A en cero.</p>
        ) : (
          <ul>
            {alertas.map((a, i) => (
              <li key={i} className={`alerta alerta-${a.tono}`}>
                <span className="alerta-marca" aria-hidden="true" />
                <span className="alerta-texto">{a.texto}</span>
                {onIrA && <button type="button" onClick={() => onIrA(a.ir)}>Ver</button>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Las cifras de la semana ─────────────────────────────────── */}
      <div className="tablero-cifras">
        <Cifra n={ventas?.totalSalidas} que="piezas vendidas" nota="últimos 30 días" />
        <Cifra n={ventas?.modelosConMovimiento} que="modelos con salida" nota="últimos 30 días" />
        <Cifra n={agotadosFunda.length} que="fundas en cero" nota="en alguna tienda" />
        {perdidoEnPesos
          ? <Cifra n={perdidoEnPesos} pesos que="perdidos" nota={`${agotados.perdidas} piezas que se habrían vendido`} tono="alerta" />
          : <Cifra n={agotados?.perdidas} que="piezas perdidas" nota="por estar agotado" tono="alerta" />}
      </div>

      <div className="tablero-rejilla">

        {/* ── Agotados por ubicación ────────────────────────────────── */}
        {porUbicacion && <BarrasAgotados datos={porUbicacion} />}

        {/* ── Lo que más sale ───────────────────────────────────────── */}
        {topVentas.length > 0 && (
          <Tarjeta titulo="Fundas que más salen" sub="Piezas en los últimos 30 días">
            <Ranking
              filas={topVentas.map(r => ({ nombre: r.producto || r.codigo, valor: r.salidas }))}
              color="var(--cian)" />
          </Tarjeta>
        )}

        {/* ── Lo que más cuesta tener agotado ───────────────────────── */}
        {topPerdidas.length > 0 && (
          <Tarjeta titulo="Fundas que más cuesta tener agotadas" sub="Piezas que se habrían vendido">
            <Ranking
              filas={topPerdidas.map(f => ({ nombre: f.producto, valor: piezasPerdidas(f) }))}
              color="var(--magenta)" />
          </Tarjeta>
        )}

        {/* ── Micas e hidrogel, con su propio control ───────────────── */}
        {topProtector.length > 0 && (
          <Tarjeta titulo="Micas e hidrogel" sub="Se controlan aparte de las fundas">
            <Ranking
              filas={topProtector.map(r => ({ nombre: r.producto || r.codigo, valor: r.salidas }))}
              color="var(--naranja)" />
            <p className="tablero-nota">
              {agotadosProtector.length > 0
                ? `${agotadosProtector.length} en cero en alguna tienda.`
                : 'Ninguna en cero.'}
              {' '}No entran en las clases A/B/C ni en el gráfico de agotados: se venden y se
              reponen con reglas distintas, y mezcladas tapaban a las fundas en los rankings.
            </p>
          </Tarjeta>
        )}

        {/* ── Precios que se salen de la raya ───────────────────────── */}
        {fueraDePrecio.length > 0 && (
          <Tarjeta titulo="Precios fuera de la raya" sub="Comparado con la mediana de las otras plazas">
            <ul className="tablero-precios">
              {fueraDePrecio.map(d => (
                <li key={`${d.codigo}|${d.slug}`}>
                  <span className="precio-producto" title={d.producto}>{d.producto}</span>
                  <span className="precio-plaza">{d.plaza}</span>
                  <span className={'precio-dif' + (d.dif > 0 ? ' alto' : ' bajo')}>
                    {d.dif > 0 ? '+' : ''}{Math.round(d.dif * 100)}%
                  </span>
                </li>
              ))}
            </ul>
            <p className="tablero-nota">
              Casi siempre es un precio mal capturado en una caja. No entran los
              productos de menos de $100 al mayoreo, donde unos pesos no dicen nada.
            </p>
          </Tarjeta>
        )}

        {/* ── Personal ──────────────────────────────────────────────── */}
        {personal?.filas?.length > 0 && (
          <Tarjeta titulo="Personal" sub={`Acumulado de la semana del ${formatoRango(rango)}`}>
            <ul className="tablero-personas">
              {personal.filas.map(f => (
                <li key={`${f.slug}|${f.persona}`}>
                  <span className="persona-nombre" title={comoNombre(f.persona)}>{comoNombre(f.persona)}</span>
                  <span className="persona-plaza">{f.sucursal}</span>
                  {/* El saldo lleva signo: negativo es que abrió antes. Un
                      acumulado sin signo se lee siempre como castigo. */}
                  <span className={'persona-saldo' + (f.saldoMin > 0 ? ' tarde' : f.saldoMin < 0 ? ' antes' : '')}>
                    {f.saldoMin > 0 ? '+' : ''}{Math.round(f.saldoMin)} min
                  </span>
                </li>
              ))}
            </ul>
            <p className="tablero-nota">
              En positivo, minutos de retraso acumulados; en negativo, de adelanto.
              Sólo cuenta la primera apertura del día de cada plaza.
            </p>
          </Tarjeta>
        )}

        {/* ── Estado de los inventarios ─────────────────────────────── */}
        <Tarjeta titulo="Inventarios" sub="Piezas y última publicación">
          <ul className="tablero-plazas">
            {[...sucursales, BODEGA].map(s => {
              const inv = datos?.[s.slug]?.inv
              const piezas = (inv?.productos ?? []).reduce((a, p) => a + (Number(p.Existencia) || 0), 0)
              const d = diasDesdeISO(inv?.generado)
              return (
                <li key={s.slug}>
                  <span className="plaza-nombre">{s.nombre}</span>
                  <span className="plaza-piezas">{inv ? piezas.toLocaleString('es-MX') : '—'}</span>
                  <span className={'plaza-dias' + (d !== null && d >= DIAS_INVENTARIO_VIEJO ? ' viejo' : '')}>
                    {d === null ? 'sin publicar' : d === 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`}
                  </span>
                </li>
              )
            })}
          </ul>
        </Tarjeta>
      </div>
    </div>
  )
}

// ── Piezas sueltas ────────────────────────────────────────────────────────

function Cifra({ n, que, nota, tono, pesos }) {
  return (
    <div className={'cifra' + (tono ? ` cifra-${tono}` : '')}>
      <p className="cifra-n">
        {n == null ? '—' : (pesos ? '$' : '') + Math.round(n).toLocaleString('es-MX')}
      </p>
      <p className="cifra-que">{que}</p>
      <p className="cifra-nota">{nota}</p>
    </div>
  )
}

function Tarjeta({ titulo, sub, children }) {
  return (
    <section className="tarjeta">
      <h4>{titulo}</h4>
      {sub && <p className="tarjeta-sub">{sub}</p>}
      {children}
    </section>
  )
}

/**
 * Barras de una sola serie: no llevan leyenda porque el título ya dice qué
 * miden, y la cifra va escrita al lado en tinta, no en el color de la barra.
 */
function Ranking({ filas, color }) {
  const tope = Math.max(1, ...filas.map(f => f.valor))
  return (
    <ul className="ranking">
      {filas.map(f => (
        <li key={f.nombre}>
          <span className="ranking-nombre" title={f.nombre}>{f.nombre}</span>
          <span className="ranking-pista">
            <span className="ranking-barra" style={{ width: `${(f.valor / tope) * 100}%`, background: color }} />
          </span>
          <span className="ranking-valor">{f.valor.toLocaleString('es-MX')}</span>
        </li>
      ))}
    </ul>
  )
}
