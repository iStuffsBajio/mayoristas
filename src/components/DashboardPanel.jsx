import { useState, useEffect, useMemo } from 'react'
import { SUCURSALES_ACTIVAS, SUCURSALES, BODEGA } from '../lib/sucursales'
import { inventarioJsonUrl, historialUrl, estadisticasUrl } from '../lib/s3'
import { turnos as pedirTurnos, apiConfigurada } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { resumir, consolidarEstadisticas } from '../lib/estadisticas'
import { analizarAgotados, piezasPerdidas, DIAS_SIN_COMPRAR } from '../lib/compras'
import { resumirSemana, semanaPasada, formatoRango } from '../lib/personal'
import { clasePorModelo, agotadosPorUbicacion } from '../lib/clases'
import { ritmoPonderado } from '../lib/ritmo'
import { reservas, ESTADOS, ORIGENES, ENTREGA } from '../lib/reservas'
import { useAjustes } from '../lib/useAjustes'
import { diasDesde } from '../lib/fechas'
import { sinOcultos, estadoDe, ESTADOS as ESTADOS_AJUSTE } from '../lib/ajustes'
import { esTemporadaAlta } from '../lib/surtido'
import { separarProtectores, esProtector } from '../lib/familias'
import { promedioEntrePlazas, desviaciones, valorDe } from '../lib/precios'
import BarrasAgotados from './BarrasAgotados'
import { Seccion, Cifra as CifraCasa, Cifras, TEMAS } from './Diseno'

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

/**
 * 🔒 Días que puede llevar un inventario sin actualizarse antes de avisar.
 *
 * DOS, y el motivo es de la operación, no del código: **las tiendas cierran y
 * suben su respaldo a partir de las 20:30**. Así que durante todo el día de
 * trabajo el respaldo más fresco que puede existir es el de AYER, y eso es lo
 * normal, no un problema.
 *
 * Avisar a un día haría saltar la alerta en las cuatro plazas cada mañana, y
 * una alerta que sale siempre deja de leerse —que es peor que no tenerla,
 * porque el día que salga de verdad tampoco se va a leer—.
 *
 * Dos días sí significa que algo se atoró: o la tienda no cerró, o el
 * respaldo no subió, o la corrida falló.
 */
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

// La cuenta vive en `lib/fechas.js`, compartida con la pestaña de
// Inventarios. Estaba escrita aqui aparte y con `new Date(iso)`, que lee una
// fecha sin hora como medianoche UTC: a las 21:00 de Mexico eso daba un dia
// de mas, asi que esta pantalla decia «lleva 2 dias sin actualizarse» y la de
// al lado «ayer», leyendo las dos la misma fecha.
const diasDesdeISO = diasDesde

export default function DashboardPanel({ onIrA }) {
  const { token } = useAuth()
  const [datos, setDatos]       = useState(null)
  const [turnos, setTurnos]     = useState(null)
  const [cargando, setCargando] = useState(true)

  const sucursales = SUCURSALES_ACTIVAS

  // Lo corregido en Revisar deja de reclamarse aquí. Es la mitad del trato:
  // si el dashboard sigue gritando lo que ya dijiste que no existe, corregir
  // no sirve de nada.
  const { correcciones, ocultos } = useAjustes(token)

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
    () => separarProtectores(sinOcultos(agotados?.filas, ocultos)), [agotados, ocultos])

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

  // ── Reservas: qué reponer ANTES de que se agote ───────────────────────
  //
  // El ritmo va PONDERADO, no promediado sobre todo el historial: un modelo
  // que dobló su venta este mes se surtía al ritmo del año pasado y se
  // vaciaba a los pocos días de haberlo surtido. Ver `ritmo.js`.
  const porAgotarse = useMemo(() => {
    if (!datos || !datos[BODEGA.slug]?.inv) return null

    const ritmoPorPlaza = Object.fromEntries(sucursales.map(s => [
      s.slug,
      ritmoPonderado({ est: datos[s.slug]?.est, hist: datos[s.slug]?.hist }).tasa,
    ]))
    const historiales = [...sucursales.map(s => datos[s.slug]?.hist), datos[FERIAS?.slug]?.hist]

    const r = reservas({
      inventarios: Object.fromEntries(sucursales.map(s => [s.slug, datos[s.slug]?.inv])),
      bodega: datos[BODEGA.slug].inv,
      ritmoPorPlaza,
      clase: clasePorModelo(historiales),
      alta: esTemporadaAlta(),
    })
    // Lo mismo aquí: un código corregido no vuelve a pedir reposición.
    const filas = sinOcultos(r.filas, ocultos)
    const cuenta = e => filas.filter(f => f.estado === e).length
    return {
      filas,
      resumen: {
        ...r.resumen,
        cero: cuenta(ESTADOS.CERO),
        urge: cuenta(ESTADOS.URGE),
        reponer: cuenta(ESTADOS.REPONER),
        pesosAlDia: filas.filter(f => f.estado === ESTADOS.CERO)
          .reduce((a, f) => a + f.pesosAlDia, 0),
        nacional: filas.filter(f => f.origen === ORIGENES.NACIONAL).length,
      },
    }
  }, [datos, sucursales, ocultos])

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
      // La fecha que vale es la del RESPALDO de la tienda, no la de la
      // corrida. `generado` es de hoy siempre -la sincronización pasa cuatro
      // veces al día pase lo que pase-, así que este aviso no saltaba nunca:
      // la bodega llevaba ocho días sin respaldo y la pantalla callaba,
      // mientras toda la compra se calculaba con esas existencias.
      const inv = datos[s.slug]?.inv
      const d = diasDesdeISO(inv?.respaldo?.fecha ?? inv?.generado)
      if (d === null) out.push({ tono: 'grave', texto: `${s.nombre} no tiene inventario publicado`, ir: 'inventarios' })
      else if (d >= DIAS_INVENTARIO_VIEJO) out.push({ tono: 'grave', texto: `El inventario de ${s.nombre} lleva ${d} días sin actualizarse`, ir: 'inventarios' })
    }

    if (agotados) {
      const claseA = porUbicacion?.reduce((n, u) => n + u.A, 0) ?? 0
      if (claseA > 0) out.push({ tono: 'grave', texto: `${claseA} ${claseA === 1 ? 'modelo' : 'modelos'} de clase A en cero`, ir: 'bodega', foco: { vista: 'agotados', filtro: 'claseA' } })
      if (agotados.perdidas > 0) out.push({ tono: 'aviso', texto: `Unas ${agotados.perdidas} piezas perdidas por estar agotado`, ir: 'bodega', foco: { vista: 'agotados', filtro: 'perdidas' } })
      const protEnCero = agotadosProtector.length
      if (protEnCero > 0) out.push({ tono: 'aviso', texto: `${protEnCero} ${protEnCero === 1 ? 'mica o hidrogel' : 'micas o hidrogeles'} en cero`, ir: 'bodega', foco: { vista: 'agotados' } })
      if (agotados.inactivos?.length) out.push({ tono: 'aviso', texto: `${agotados.inactivos.length} modelos que se venden y bodega no compra hace ${DIAS_SIN_COMPRAR}+ días`, ir: 'bodega', foco: { vista: 'agotados', filtro: 'inactivos' } })
    }

    // Lo que está en cero TENIENDO existencia en bodega no es un problema de
    // compra: es un traslado que no se hizo. Se dice aparte porque la acción
    // es otra y es gratis.
    if (porAgotarse?.filas?.length) {
      const enBodega = porAgotarse.filas.filter(f => f.estado === ESTADOS.CERO && f.enBodega > 0)
      if (enBodega.length) {
        out.push({
          tono: 'grave',
          texto: `${enBodega.length} ${enBodega.length === 1 ? 'modelo en cero que bodega SÍ tiene' : 'modelos en cero que bodega SÍ tiene'}: es surtir, no comprar`,
          ir: 'surtido',
        })
      }
      if (porAgotarse.resumen.nacional > 0) {
        out.push({
          tono: 'aviso',
          texto: `${porAgotarse.resumen.nacional} ${porAgotarse.resumen.nacional === 1 ? 'modelo no alcanza' : 'modelos no alcanzan'} a esperar el pedido de ${ENTREGA.proveedor} días`,
          ir: 'bodega',
        })
      }
    }

    // Lo corregido no se esconde: se muda. Si desapareciera del todo, esto
    // sería una forma cómoda de no arreglar nada.
    const pendientes = Object.values(correcciones)
      .map(a => estadoDe(a, Object.fromEntries(
        [...sucursales, BODEGA].map(s => [s.slug, datos[s.slug]?.inv]))))
      .filter(e => e.estado === ESTADOS_AJUSTE.PENDIENTE)
    if (pendientes.length) {
      const viejos = pendientes.filter(e => e.insiste).length
      out.push({
        tono: viejos ? 'grave' : 'aviso',
        texto: viejos
          ? `${viejos} ${viejos === 1 ? 'código corregido lleva' : 'códigos corregidos llevan'} más de tres semanas sin arreglarse en la caja`
          : `${pendientes.length} ${pendientes.length === 1 ? 'código corregido aquí, pendiente' : 'códigos corregidos aquí, pendientes'} en la caja`,
        ir: 'revisar',
      })
    }

    if (personal?.filas?.length) {
      const conRetardo = personal.filas.filter(f => f.retardos > 0)
      if (conRetardo.length) out.push({ tono: 'aviso', texto: `${conRetardo.length} ${conRetardo.length === 1 ? 'persona acumuló retardos' : 'personas acumularon retardos'} la semana pasada`, ir: 'personal' })
    }

    return out
  }, [datos, agotados, agotadosProtector, porUbicacion, personal, porAgotarse, correcciones, sucursales])

  if (cargando) return <p className="tablero-cargando">Reuniendo la información de todas las secciones…</p>

  const rankSeparado = separarProtectores(ventas?.ranking)
  const topVentas = rankSeparado.fundas.slice(0, 5)
  const topProtector = rankSeparado.protectores.slice(0, 5)
  const topPerdidas = (agotados?.fugas ?? []).filter(f => !esProtector(f.codigo, f.producto)).slice(0, 4)

  return (
    <div className="tablero">

      {/* ── Lo que pide una decisión ────────────────────────────────── */}
      <Seccion tema={alertas.some(a => a.tono === 'grave') ? 'agotado' : alertas.length ? 'alerta' : 'dinero'}
               titulo="Atención" sub="Lo que pide una decisión hoy"
               extra={alertas.length ? `${alertas.length} ${alertas.length === 1 ? 'aviso' : 'avisos'}` : '✓ al día'}>
        {alertas.length === 0 ? (
          <p className="tablero-ok">Nada urgente. Los inventarios están al día y no hay modelos de clase A en cero.</p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
            {alertas.map((a, i) => (
              <li key={i} className={`alerta alerta-${a.tono}`}>
                <span className="alerta-marca" aria-hidden="true" />
                <span className="alerta-texto">{a.texto}</span>
                {onIrA && <button type="button" onClick={() => onIrA(a.ir, a.foco)}>Ver</button>}
              </li>
            ))}
          </ul>
        )}
      </Seccion>

      {/* ── Antes de que se agote ───────────────────────────────────── */}
      {porAgotarse?.filas?.length > 0 && (
        <Seccion tema="agotado" titulo="Antes de que se agote"
                 sub={`Lo que no aguanta hasta la próxima surtida, al ritmo de las últimas semanas. Pedir al proveedor tarda ${ENTREGA.proveedor} días; al nacional, ${ENTREGA.nacional}.`}>
          <Cifras style={{ marginBottom: 12 }}>
            <CifraCasa tema="agotado" titulo="En cero vendiéndose" valor={porAgotarse.resumen.cero} />
            <CifraCasa tema="comprar" titulo="Por debajo de su objetivo" valor={porAgotarse.resumen.reponer} />
            {porAgotarse.resumen.pesosAlDia > 0 && (
              <CifraCasa tema="alerta" titulo="De mayoreo que se deja de vender al día"
                         valor={`$${Math.round(porAgotarse.resumen.pesosAlDia).toLocaleString('es-MX')}`} />
            )}
          </Cifras>

          <ul className="reservas-lista">
            {porAgotarse.filas.slice(0, 8).map(f => (
              <li key={`${f.plaza}|${f.codigo}`}>
                <span className={'reservas-chip ' + f.estado}>
                  {f.estado === ESTADOS.CERO ? 'en cero' : f.estado === ESTADOS.URGE ? 'hoy' : `${Math.round(f.dias)} d`}
                </span>
                <span className="reservas-clase">{f.clase}</span>
                <span className="reservas-modelo" title={f.producto}>{f.producto}</span>
                <span className="reservas-plaza">
                  {sucursales.find(s => s.slug === f.plaza)?.nombre ?? f.plaza}
                </span>
                <span className="reservas-pedir">pedir {f.falta}</span>
                {/* De dónde sale es la mitad de la decisión: si está en
                    bodega es mandar una caja; si no, hay que elegir entre
                    esperar 40 días o pagar más por 4. */}
                <span className={'reservas-origen ' + f.origen}>
                  {f.origen === ORIGENES.BODEGA ? `bodega tiene ${f.enBodega}`
                    : f.origen === ORIGENES.NACIONAL ? `nacional · ${ENTREGA.nacional} d`
                    : `proveedor · ${ENTREGA.proveedor} d`}
                </span>
              </li>
            ))}
          </ul>

          {porAgotarse.filas.length > 8 && onIrA && (
            <button type="button" className="reservas-mas" onClick={() => onIrA('surtido')}>
              Ver los {porAgotarse.filas.length} en Surtido
            </button>
          )}
        </Seccion>
      )}

      {/* ── Las cifras de la semana ─────────────────────────────────── */}
      <Cifras>
        <Cifra tema="ventas" n={ventas?.totalSalidas} que="Piezas vendidas" nota="últimos 30 días" />
        <Cifra tema="ventas" n={ventas?.modelosConMovimiento} que="Modelos con salida" nota="últimos 30 días" />
        <Cifra tema="agotado" n={agotadosFunda.length} que="Fundas en cero" nota="en alguna tienda" />
        {perdidoEnPesos
          ? <Cifra tema="alerta" n={perdidoEnPesos} pesos que="Perdidos" nota={`${agotados.perdidas} piezas que se habrían vendido`} />
          : <Cifra tema="alerta" n={agotados?.perdidas} que="Piezas perdidas" nota="por estar agotado" />}
      </Cifras>

      <div className="tablero-rejilla">

        {/* ── Agotados por ubicación ────────────────────────────────── */}
        {porUbicacion && <BarrasAgotados datos={porUbicacion} />}

        {/* ── Lo que más sale ───────────────────────────────────────── */}
        {topVentas.length > 0 && (
          <Tarjeta tema="ventas" titulo="Fundas que más salen" sub="Piezas en los últimos 30 días">
            <Ranking
              filas={topVentas.map(r => ({ nombre: r.producto || r.codigo, valor: r.salidas }))}
              color={TEMAS.ventas.fuerte} />
          </Tarjeta>
        )}

        {/* ── Lo que más cuesta tener agotado ───────────────────────── */}
        {topPerdidas.length > 0 && (
          <Tarjeta tema="agotado" titulo="Fundas que más cuesta tener agotadas" sub="Piezas que se habrían vendido">
            <Ranking
              filas={topPerdidas.map(f => ({ nombre: f.producto, valor: piezasPerdidas(f) }))}
              color={TEMAS.agotado.fuerte} />
          </Tarjeta>
        )}

        {/* ── Micas e hidrogel, con su propio control ───────────────── */}
        {topProtector.length > 0 && (
          <Tarjeta tema="inventario" titulo="Micas e hidrogel" sub="Se controlan aparte de las fundas">
            <Ranking
              filas={topProtector.map(r => ({ nombre: r.producto || r.codigo, valor: r.salidas }))}
              color={TEMAS.inventario.fuerte} />
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
          <Tarjeta tema="alerta" titulo="Precios fuera de la raya" sub="Comparado con la mediana de las otras plazas">
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
          <Tarjeta tema="neutro" titulo="Personal" sub={`Acumulado de la semana del ${formatoRango(rango)}`}>
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
        <Tarjeta tema="inventario" titulo="Inventarios" sub="Piezas y última publicación">
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

// Las cifras y las tarjetas usan el diseño de la casa (`Diseno.jsx`): cada una
// con el color de su tema, el mismo que tiene en su pestaña.
function Cifra({ n, que, nota, tema, pesos }) {
  return (
    <CifraCasa tema={tema} titulo={que} sub={nota}
               valor={n == null ? '—' : (pesos ? '$' : '') + Math.round(n).toLocaleString('es-MX')} />
  )
}

function Tarjeta({ tema, titulo, sub, children }) {
  return <Seccion tema={tema} titulo={titulo} sub={sub}>{children}</Seccion>
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
