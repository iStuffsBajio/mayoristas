// Códigos de sucursal que bodega no tiene dados de alta.
//
// ── La premisa ──────────────────────────────────────────────────────────────
//
// Bodega lleva el catálogo maestro: si compra algo, lo da de alta. Así que un
// código que vive en una tienda y NO existe en bodega es, casi siempre, una de
// dos cosas. Son entre 80 y 131 por plaza, así que no es una rareza.
//
// ── Escenario 1: descontinuado ──────────────────────────────────────────────
//
// Bodega borró el código para que no vuelva a aparecer al comprar, y se dejó
// en la tienda sólo para agotar lo que quedaba. No hay forma de resurtirlo —ni
// bodega ni otra plaza tienen— así que lo correcto es **eliminar el código**
// cuando se acabe. Son las variantes de color y tipo: SALMON, VERDE, MORADO,
// DUO, HARD, con movimientos de 2023 y 2025.
//
// ── Escenario 2: anomalía ───────────────────────────────────────────────────
//
// El código existe y se mueve, pero bodega no lo tiene. Dos sabores:
//
//   · **Duplicado**: otro código de bodega ya cubre ese teléfono. El caso real
//     que lo destapó: `SGA353` (SAMSUNG A35 3 IN 1) vive en las tiendas, pero
//     bodega tiene `SGA553` (SAMSUNG A55/**A35** 3 IN 1), que es el mismo
//     producto para dos aparatos. El código suelto sobra.
//
//   · **Sin alta**: nadie más lo cubre y se sigue moviendo. Suele ser un
//     modelo nuevo que la tienda dio de alta por su cuenta —REALME 16 5G,
//     VIVO V30 LITE— y bodega todavía no. Hay que darlo de alta o decidir que
//     no se maneja.
//
// Ninguno se borra solo. Todos salen como **pendiente de confirmación**:
// borrar un código es irreversible y la decisión es del dueño.

import { clavesDe, tipoDeFunda } from './variantes.js'

/**
 * 🔒 Días sin movimiento a partir de los cuales un código sin respaldo en
 * bodega se considera descontinuado y no una novedad.
 *
 * `Alta` no sirve para esto: es el primer movimiento del historial, no la
 * fecha de entrada, así que prueba antigüedad mínima pero nunca que algo sea
 * reciente. El último movimiento sí dice si todavía se mueve.
 */
export const DIAS_DESCONTINUADO = 180

export const MOTIVO = {
  DUPLICADO:     'duplicado',
  SIN_ALTA:      'sin-alta',
  DESCONTINUADO: 'descontinuado',
}

const dias = (iso, hoy) => {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return Math.floor((hoy - d) / 86400000)
}

/**
 * Códigos que viven en una tienda y no en bodega, con qué hacer con cada uno.
 *
 * `inventarios` es { slug: json } de las tiendas; `bodega` es su json. Los
 * `grupos` vienen de `agruparPorModelo` sobre TODO el catálogo.
 */
export function codigosHuerfanos({ inventarios, bodega, grupos, hoy = new Date() }) {
  const enBodega = new Map()
  for (const p of bodega?.productos ?? []) {
    const c = String(p.Codigo ?? '').trim()
    if (c) enBodega.set(c.toUpperCase(), p)
  }

  // Qué teléfonos cubre bodega, para saber si un código suelto ya está
  // atendido por otro. Es lo que destapa los duplicados tipo A35.
  // La clave lleva el TIPO de funda además del teléfono: dos «3 en 1» del
  // mismo aparato sobran, pero un TPU y un militar del mismo aparato son
  // productos distintos y ninguno sobra. Sin el tipo, el detector proponía
  // borrar el iPhone 12 militar porque bodega tiene el 3 en 1.
  const cubiertosPorBodega = new Map()
  for (const p of bodega?.productos ?? []) {
    const tipo = tipoDeFunda(p.Producto ?? '')
    for (const clave of clavesDe(p.Producto ?? '')) {
      const k = `${clave}|${tipo}`
      if (!cubiertosPorBodega.has(k)) cubiertosPorBodega.set(k, p)
    }
  }

  // Dónde hay existencia de cada código, en cualquier plaza.
  const porCodigo = new Map()
  for (const [slug, inv] of Object.entries(inventarios ?? {})) {
    for (const p of inv?.productos ?? []) {
      const c = String(p.Codigo ?? '').trim()
      if (!c) continue
      const e = porCodigo.get(c) ?? { codigo: c, producto: p.Producto, plazas: {}, ultimo: null }
      e.plazas[slug] = Number(p.Existencia) || 0
      if (p.UltimoMov && (!e.ultimo || p.UltimoMov > e.ultimo)) e.ultimo = p.UltimoMov
      porCodigo.set(c, e)
    }
  }

  const out = []
  for (const e of porCodigo.values()) {
    if (enBodega.has(e.codigo.toUpperCase())) continue

    const piezas = Object.values(e.plazas).reduce((a, b) => a + b, 0)
    const sinMover = dias(e.ultimo, hoy)

    // ¿Bodega cubre ese teléfono con otro código?
    let cubre = null
    const miTipo = tipoDeFunda(e.producto ?? '')
    for (const clave of clavesDe(e.producto ?? '')) {
      const p = cubiertosPorBodega.get(`${clave}|${miTipo}`)
      if (p && String(p.Codigo).trim().toUpperCase() !== e.codigo.toUpperCase()) { cubre = p; break }
    }

    const motivo = cubre ? MOTIVO.DUPLICADO
      : (sinMover !== null && sinMover >= DIAS_DESCONTINUADO) ? MOTIVO.DESCONTINUADO
      : MOTIVO.SIN_ALTA

    out.push({
      codigo: e.codigo,
      producto: e.producto,
      plazas: Object.fromEntries(Object.entries(e.plazas).filter(([, n]) => n > 0)),
      piezas,
      ultimo: e.ultimo,
      diasSinMover: sinMover,
      motivo,
      cubiertoPor: cubre ? { codigo: String(cubre.Codigo).trim(), producto: cubre.Producto } : null,
      // Nada se borra solo. Lo que sale de aquí es una propuesta.
      accion: cubre ? 'Confirmar si sobra: bodega ya lo cubre'
        : motivo === MOTIVO.DESCONTINUADO
          ? (piezas > 0 ? 'Agotar lo que queda y eliminar el código' : 'Eliminar el código')
          : 'Confirmar: darlo de alta en bodega o dejar de manejarlo',
    })
  }

  // Primero lo que tiene piezas de por medio, que es donde hay dinero parado.
  const orden = { [MOTIVO.DUPLICADO]: 0, [MOTIVO.SIN_ALTA]: 1, [MOTIVO.DESCONTINUADO]: 2 }
  return out.sort((a, b) => orden[a.motivo] - orden[b.motivo] || b.piezas - a.piezas)
}

/** Resumen por motivo, para la cabecera de la pantalla. */
export function resumirHuerfanos(filas) {
  const r = { total: 0, piezas: 0 }
  for (const m of Object.values(MOTIVO)) r[m] = 0
  for (const f of filas ?? []) {
    r.total++
    r.piezas += f.piezas
    r[f.motivo]++
  }
  return r
}
