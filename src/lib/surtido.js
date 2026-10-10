// Sugerencia de surtido.
//
// La pregunta que resuelve: de todo lo que está bajo, qué hay que pedir y
// cuánto. No basta con mirar la existencia —cientos de modelos están en 1 o 2
// piezas y la mayoría no se vende— ni basta con mirar la venta, porque un
// modelo que vuela pero tiene 30 piezas no urge.
//
// La cuenta es la misma que haría cualquiera a mano: a qué ritmo sale esto,
// cuántos días quiero aguantar, cuánto me falta para llegar ahí.

import { diasDePeriodo } from './estadisticas.js'

// Noviembre y diciembre: Buen Fin y Navidad. En esos meses se cubre el doble
// de días, porque reponer a medio repunte llega tarde.
export const MESES_ALTA = [11, 12]

export const COBERTURA = { baja: 30, alta: 60 }

// Con poco historial, "nunca se vendió" no significa nada: significa que
// todavía no se ha visto vender. Al probarlo con 22 días salían 432 códigos
// propuestos para dar de baja, que es una barbaridad. Hasta tener un trimestre
// medido, la propuesta de depurar se calla en vez de mentir.
export const DIAS_PARA_DEPURAR = 90

// Lo mismo, más suave, para el resto de las cuentas: por debajo de esto el
// ritmo diario es una estimación floja y la pantalla lo advierte.
export const DIAS_PARA_CONFIAR = 45

// Un modelo tiene que llevar al menos un año en el catálogo para que no
// venderse signifique algo. El Honor 600 entró en agosto y aparecía propuesto
// para dar de baja en octubre: no estaba estancado, acababa de llegar.
//
// La fecha sale del primer movimiento registrado en bodega, que es donde se
// da de alta todo antes de repartirlo a las sucursales.
export const DIAS_EN_CATALOGO = 365

export const esTemporadaAlta = (fecha = new Date()) => MESES_ALTA.includes(fecha.getMonth() + 1)

/** Por qué se sugiere lo que se sugiere. La pantalla lo traduce a palabras. */
export const MOTIVOS = {
  VENTA:         'venta',          // sale a este ritmo y no alcanza
  SIN_VENTA_CERO:'sin-venta-cero', // nunca se vendió y está agotado
  SUFICIENTE:    'suficiente',     // alcanza para la cobertura
  DEPURAR:       'depurar',        // nunca se vendió y sigue ocupando lugar
  CANDIDATO:     'candidato',      // nunca se llevó a la feria, pero vende en tienda
}

/**
 * Velocidad diaria de cada modelo sobre TODO el historial disponible.
 *
 * Se divide entre los días con dato, no entre los días del calendario: si una
 * sucursal estuvo tres semanas sin subir respaldo, esas semanas no deben
 * diluir el ritmo de las que sí se midieron.
 */
export function velocidadDiaria(historial) {
  const piezas = {}
  let dias = 0

  for (const p of historial?.periodos ?? []) {
    const d = diasDePeriodo(p)
    if (d <= 0) continue
    dias += d
    for (const [k, n] of Object.entries(p.m ?? {})) piezas[k] = (piezas[k] || 0) + n
  }

  const tasa = {}
  if (dias > 0) for (const [k, n] of Object.entries(piezas)) tasa[k] = n / dias

  return { tasa, piezas, dias }
}

/** Suma las velocidades de varias sucursales ponderando por sus días. */
export function velocidadCombinada(historiales) {
  const piezas = {}
  let dias = 0
  for (const h of historiales.filter(Boolean)) {
    const v = velocidadDiaria(h)
    // Los días se toman del que más tenga: las sucursales miden el mismo
    // calendario, no uno detrás de otro, así que sumarlos inflaría el divisor
    // y dejaría el ritmo por los suelos.
    dias = Math.max(dias, v.dias)
    for (const [k, n] of Object.entries(v.piezas)) piezas[k] = (piezas[k] || 0) + n
  }
  const tasa = {}
  if (dias > 0) for (const [k, n] of Object.entries(piezas)) tasa[k] = n / dias
  return { tasa, piezas, dias }
}

/**
 * Qué pedir de cada modelo.
 *
 * `productos` es el inventario de la sucursal; `velocidad` lo que devuelve
 * velocidadDiaria; `cobertura` los días que se quieren aguantar.
 */
export function calcularSurtido({ productos, velocidad, cobertura, bodega = null }) {
  const { tasa, piezas, dias } = velocidad

  const filas = (productos ?? []).map(p => {
    const codigo     = String(p.Codigo ?? '').trim()
    const existencia = Number(p.Existencia) || 0
    const ritmo      = tasa[codigo] ?? 0
    const vendidas   = piezas[codigo] ?? 0

    const objetivo = ritmo * cobertura
    let sugerido = Math.max(0, Math.ceil(objetivo - existencia))
    let motivo = MOTIVOS.VENTA

    if (vendidas === 0) {
      if (existencia <= 0) {
        // Nunca se vendió y no queda ninguna. Puede que no se venda porque
        // nunca hay: con una pieza en el mostrador se sale de dudas, y si
        // sigue sin moverse en unos meses, ya hay argumento para darlo de baja.
        sugerido = 1
        motivo = MOTIVOS.SIN_VENTA_CERO
      } else {
        sugerido = 0
        motivo = MOTIVOS.DEPURAR
      }
    } else if (sugerido === 0) {
      motivo = MOTIVOS.SUFICIENTE
    }

    return {
      codigo,
      producto: String(p.Producto ?? '').trim(),
      existencia,
      vendidas,
      ritmo,
      // Días que aguanta con lo que tiene. Infinito si no se vende.
      cobertura: ritmo > 0 ? existencia / ritmo : null,
      objetivo: Math.ceil(objetivo),
      sugerido,
      motivo,
      bodega: bodega ? (bodega[codigo] ?? null) : null,
    }
  })

  return { filas, diasHistorial: dias }
}

/**
 * Qué puede cubrir la bodega y en qué se está quedando corta.
 *
 * `porSucursal` es { slug: filas } ya calculadas. Se cruza la suma de lo que
 * piden todas contra lo que hay en bodega.
 */
export function analizarBodega(porSucursal, inventarioBodega) {
  const enBodega = {}
  for (const p of inventarioBodega?.productos ?? []) {
    const c = String(p.Codigo ?? '').trim()
    if (c) enBodega[c] = Number(p.Existencia) || 0
  }

  const pedido = new Map()
  for (const [slug, filas] of Object.entries(porSucursal)) {
    for (const f of filas) {
      if (f.sugerido <= 0) continue
      const e = pedido.get(f.codigo) ?? { codigo: f.codigo, producto: f.producto, piden: 0, sucursales: [] }
      e.piden += f.sugerido
      e.sucursales.push({ slug, piezas: f.sugerido })
      pedido.set(f.codigo, e)
    }
  }

  const filas = [...pedido.values()].map(e => {
    const hay = enBodega[e.codigo]
    const existe = hay !== undefined
    const tiene = hay ?? 0
    const falta = Math.max(0, e.piden - tiene)

    return {
      ...e,
      tiene,
      existe,
      falta,
      // Cuántas de las sucursales que lo piden se quedan sin él, repartiendo
      // por orden de necesidad. Es el "no alcanza para dos locales".
      sucursalesSinCubrir: contarSinCubrir(e.sucursales, tiene),
      estado: !existe ? 'no-maneja' : tiene === 0 ? 'agotada' : falta > 0 ? 'parcial' : 'cubre',
    }
  })

  return filas.sort((a, b) => b.falta - a.falta || b.piden - a.piden)
}

/** Reparte lo que hay en bodega entre quienes piden, de menor a mayor. */
function contarSinCubrir(sucursales, disponible) {
  let queda = disponible
  let sinCubrir = 0
  for (const s of [...sucursales].sort((a, b) => a.piezas - b.piezas)) {
    if (queda >= s.piezas) queda -= s.piezas
    else sinCubrir++
  }
  return sinCubrir
}

/**
 * Códigos que llevan todo el historial sin venderse y siguen ocupando lugar
 * en el catálogo. Candidatos a dar de baja, no una orden de borrarlos.
 */
export function candidatosADepurar(porSucursal, diasHistorial = 0, altas = {}, hoy = new Date()) {
  // Sin historial suficiente no se propone nada. Devolver una lista larga y
  // equivocada es peor que no devolver ninguna: alguien podría darle de baja
  // a medio catálogo.
  if (diasHistorial < DIAS_PARA_DEPURAR) {
    return { suficiente: false, dias: diasHistorial, faltan: DIAS_PARA_DEPURAR - diasHistorial, filas: [], nuevos: [], sinFecha: 0 }
  }

  const corte = new Date(hoy)
  corte.setDate(corte.getDate() - DIAS_EN_CATALOGO)
  const limite = corte.toISOString().slice(0, 10)

  const porCodigo = new Map()

  for (const [slug, filas] of Object.entries(porSucursal)) {
    for (const f of filas) {
      if (!f.codigo) continue
      const e = porCodigo.get(f.codigo) ?? { codigo: f.codigo, producto: f.producto, vendidas: 0, existencia: 0, plazas: [] }
      e.vendidas += f.vendidas
      e.existencia += f.existencia
      if (f.existencia > 0) e.plazas.push({ slug, piezas: f.existencia })
      porCodigo.set(f.codigo, e)
    }
  }

  const parados = [...porCodigo.values()].filter(e => e.vendidas === 0 && e.existencia > 0)
  const porPiezas = (a, b) => b.existencia - a.existencia || a.producto.localeCompare(b.producto)

  const conEdad = parados.map(e => ({ ...e, alta: altas[e.codigo] ?? null }))

  // Sin fecha no se opina. Son pocos y es mejor dejarlos fuera que proponer
  // dar de baja algo de lo que no se sabe cuándo llegó.
  const sinFecha = conEdad.filter(e => !e.alta).length

  return {
    suficiente: true,
    dias: diasHistorial,
    faltan: 0,
    sinFecha,
    // Llevan más de un año y no se han movido: esos sí son candidatos.
    filas: conEdad.filter(e => e.alta && e.alta <= limite).sort(porPiezas),
    // Llegaron hace menos de un año. No se han vendido todavía, que no es lo
    // mismo que no venderse.
    nuevos: conEdad.filter(e => e.alta && e.alta > limite)
      .sort((a, b) => b.alta.localeCompare(a.alta) || porPiezas(a, b)),
  }
}

/** Días que lleva un modelo en el catálogo, o null si no se sabe. */
export function diasEnCatalogo(alta, hoy = new Date()) {
  if (!alta) return null
  const [a, m, d] = alta.split('-').map(Number)
  return Math.floor((hoy - new Date(a, m - 1, d)) / 86400000)
}

// ── Sucursales estacionales ──────────────────────────────────────────────────
//
// Ferias no es una tienda abierta todo el año: monta puesto en enero, agosto y
// octubre y el resto de los meses está cerrada. Un ritmo diario promediado
// sobre el año entero no significa nada ahí —diría que vende 4 piezas al día
// cuando en enero vende 52 y en marzo ninguna— y pediría de más en temporada
// muerta y de menos justo antes de la feria.
//
// La pregunta correcta no es "cuánto vende al día" sino "cuánto vendió en esta
// misma feria los años pasados".

/** Un mes cuenta como activo si vendió al menos esta parte del mejor mes. */
const UMBRAL_ACTIVO = 0.15

const numeroDeMes = periodo => Number(periodo.split('-')[1])

/**
 * Qué meses del calendario tienen feria, mirando todo el historial.
 * Devuelve [{ mes, veces, piezas, promedio }] ordenado por mes.
 */
export function mesesActivos(historial) {
  const porMes = new Map()
  let mejor = 0

  for (const p of historial?.periodos ?? []) {
    const piezas = Object.values(p.m ?? {}).reduce((a, b) => a + b, 0)
    const n = numeroDeMes(p.p)
    const e = porMes.get(n) ?? { mes: n, veces: 0, piezas: 0, anios: [] }
    e.veces++
    e.piezas += piezas
    e.anios.push({ periodo: p.p, piezas })
    porMes.set(n, e)
    mejor = Math.max(mejor, piezas)
  }

  return [...porMes.values()]
    .map(e => ({ ...e, promedio: e.piezas / e.veces }))
    .filter(e => e.promedio >= mejor * UMBRAL_ACTIVO)
    .sort((a, b) => a.mes - b.mes)
}

/**
 * El mes para el que hay que surtir: el que está en curso si tiene feria, o
 * el siguiente que la tenga.
 */
export function proximaFeria(historial, hoy = new Date()) {
  const activos = mesesActivos(historial).map(e => e.mes)
  if (activos.length === 0) return null

  const mesHoy = hoy.getMonth() + 1
  if (activos.includes(mesHoy)) return { mes: mesHoy, anio: hoy.getFullYear(), enCurso: true }

  const siguiente = activos.find(m => m > mesHoy)
  return siguiente
    ? { mes: siguiente, anio: hoy.getFullYear(), enCurso: false }
    : { mes: activos[0], anio: hoy.getFullYear() + 1, enCurso: false }
}

/**
 * Qué pedir para una feria.
 *
 * Es la MISMA cuenta que para una tienda —ritmo por días de cobertura, menos
 * lo que ya hay— con dos ajustes que la hacen válida aquí:
 *
 * 1. El ritmo se mide por día ABIERTO, no por día del calendario. Ferias
 *    cierra ocho meses al año; dividir entre 365 daría 4 piezas al día cuando
 *    en enero vende 52, y pediría de menos justo antes de la feria.
 *
 * 2. La cobertura son los días que le quedan a ESTA feria, no 30 fijos. De
 *    nada sirve surtir para un mes si el puesto se levanta en cinco días.
 *
 * El ritmo mezcla dos fuentes. Las ediciones anteriores de este mismo mes
 * dicen qué se vende en una feria de octubre; lo que va de este mes dice qué
 * se está vendiendo en ESTA. Al principio manda el historial, porque dos días
 * de ventas no son una tendencia; conforme avanza el mes manda lo de ahora.
 */

/** A partir de medio mes, lo que va vendido pesa más que el historial. */
const DIAS_PARA_CREER_AL_MES = 15

/**
 * Cuánto se pide por encima de lo proyectado.
 *
 * Sin margen, la cuenta sale justa y "justa" quiere decir acabar la feria en
 * cero: el IPHONE 17 PRO MAX 3 IN 1 tenía 13 piezas contra 12.6 proyectadas y
 * el panel lo daba por suficiente, siendo el segundo más vendido de la feria.
 * Si vende un poco más rápido, se queda sin el modelo estrella a media feria.
 *
 * El error no es simétrico: lo que sobra se devuelve a bodega y se vende en
 * otra plaza, lo que falta es una venta perdida que no vuelve.
 */
export const MARGENES = [0, 0.15, 0.3, 0.5]
export const MARGEN_FERIA = 0.3

export function calcularSurtidoFeria({ productos, historial, objetivo, ventaTiendas = null, margen = MARGEN_FERIA, hoy = new Date() }) {
  const enCurso = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
  const periodos = historial?.periodos ?? []

  // Ediciones anteriores del mismo mes del calendario.
  const previas = periodos.filter(p => numeroDeMes(p.p) === objetivo.mes && p.p !== enCurso)
  const piezasPrevias = {}
  let diasPrevios = 0
  for (const p of previas) {
    diasPrevios += diasDePeriodo(p)
    for (const [k, n] of Object.entries(p.m ?? {})) piezasPrevias[k] = (piezasPrevias[k] || 0) + n
  }

  // Lo que va de la feria en curso, si es que está abierta.
  const actual = objetivo.enCurso ? periodos.find(p => p.p === enCurso) : null
  const piezasActuales = actual?.m ?? {}
  const diasActuales = actual ? diasDePeriodo(actual) : 0

  // Cuánto se cree a cada fuente.
  const peso = diasActuales > 0 ? Math.min(1, diasActuales / DIAS_PARA_CREER_AL_MES) : 0

  const diasDelMes = new Date(objetivo.anio, objetivo.mes, 0).getDate()
  const diasRestantes = objetivo.enCurso
    ? Math.max(1, diasDelMes - hoy.getDate())
    : diasDelMes

  const codigos = new Set([...Object.keys(piezasPrevias), ...Object.keys(piezasActuales)])
  const ritmos = {}
  for (const k of codigos) {
    const prev = diasPrevios > 0 ? (piezasPrevias[k] ?? 0) / diasPrevios : 0
    const act  = diasActuales > 0 ? (piezasActuales[k] ?? 0) / diasActuales : 0
    // Sin ediciones anteriores, lo de ahora es lo único que hay, y al revés.
    ritmos[k] = diasPrevios === 0 ? act : diasActuales === 0 ? prev : peso * act + (1 - peso) * prev
  }

  const filas = (productos ?? []).map(p => {
    const codigo     = String(p.Codigo ?? '').trim()
    const existencia = Number(p.Existencia) || 0
    const ritmo      = ritmos[codigo] ?? 0
    const vendidas   = (piezasPrevias[codigo] ?? 0) + (piezasActuales[codigo] ?? 0)
    const esteMes    = piezasActuales[codigo] ?? 0
    const enTiendas  = ventaTiendas?.[codigo] ?? 0

    const objetivoPz = ritmo * diasRestantes * (1 + margen)
    let sugerido = Math.max(0, Math.ceil(objetivoPz - existencia))
    let motivo = MOTIVOS.VENTA

    if (vendidas === 0) {
      if (enTiendas > 0) { sugerido = 0; motivo = MOTIVOS.CANDIDATO }
      else if (existencia <= 0) { sugerido = 1; motivo = MOTIVOS.SIN_VENTA_CERO }
      else { sugerido = 0; motivo = MOTIVOS.DEPURAR }
    } else if (sugerido === 0) {
      motivo = MOTIVOS.SUFICIENTE
    }

    return {
      codigo,
      producto: String(p.Producto ?? '').trim(),
      existencia,
      vendidas,
      esteMes,
      enTiendas,
      ritmo,
      // Días que aguanta con lo que tiene, al ritmo de la feria.
      cobertura: ritmo > 0 ? existencia / ritmo : null,
      objetivo: Math.ceil(objetivoPz),
      esperado: objetivoPz,
      sugerido,
      motivo,
    }
  })

  return {
    filas,
    ediciones: previas.length,
    periodos: previas.map(p => p.p),
    diasPrevios,
    diasActuales,
    diasRestantes,
    peso,
    margen,
    totalEsperado: Object.values(ritmos).reduce((a, r) => a + r * diasRestantes * (1 + margen), 0),
  }
}
