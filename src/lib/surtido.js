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

export const esTemporadaAlta = (fecha = new Date()) => MESES_ALTA.includes(fecha.getMonth() + 1)

/** Por qué se sugiere lo que se sugiere. La pantalla lo traduce a palabras. */
export const MOTIVOS = {
  VENTA:         'venta',          // sale a este ritmo y no alcanza
  SIN_VENTA_CERO:'sin-venta-cero', // nunca se vendió y está agotado
  SUFICIENTE:    'suficiente',     // alcanza para la cobertura
  DEPURAR:       'depurar',        // nunca se vendió y sigue ocupando lugar
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
export function candidatosADepurar(porSucursal, diasHistorial = 0) {
  // Sin historial suficiente no se propone nada. Devolver una lista larga y
  // equivocada es peor que no devolver ninguna: alguien podría darle de baja
  // a medio catálogo.
  if (diasHistorial < DIAS_PARA_DEPURAR) {
    return { suficiente: false, dias: diasHistorial, faltan: DIAS_PARA_DEPURAR - diasHistorial, filas: [] }
  }

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

  const filas = [...porCodigo.values()]
    .filter(e => e.vendidas === 0 && e.existencia > 0)
    .sort((a, b) => b.existencia - a.existencia || a.producto.localeCompare(b.producto))

  return { suficiente: true, dias: diasHistorial, faltan: 0, filas }
}
