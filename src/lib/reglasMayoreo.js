// Las reglas de mayoreo de cada ticket, y los cobros con tarjeta o
// transferencia con su referencia.
//
// ── 🔒 Las dos reglas las puso el dueño el 2026-11-09 ─────────────────────
//
//   1. «No pueden registrar una venta a precio de mayoreo si no viene
//      acompañada de una funda o una mica de hidrogel.» Un ticket con alguna
//      línea a mayoreo tiene que llevar al menos una funda o un hidrogel.
//
//   2. «Siempre que un ticket se cobre con un mayorista, debe ser igual al
//      número de productos que está comprando. Por ejemplo, compra dos fundas
//      y un sticker, y el mayorista debe venir tres veces.» Las piezas de la
//      etiqueta del mayorista —la línea a $0.01— tienen que sumar lo mismo que
//      las piezas de todo lo demás del ticket.
//
// Cuentan TODOS los productos del ticket, no sólo los tres tipos que cuentan
// como pieza en el corte: el ejemplo del dueño mete un sticker, y «el número
// de productos que está comprando» es lo que se lleva el cliente.
//
// Esto SEÑALA tickets; no corrige ninguna cifra. Las piezas y el dinero siguen
// saliendo de `agregarVentas`.
//
// ── Los cobros con tarjeta o transferencia ────────────────────────────────
//
// Eleventa guarda en `VENTATICKETS.REFERENCIA` lo que se teclea al cobrar con
// tarjeta o transferencia. Con eso se puede casar cada cobro con el estado de
// cuenta del banco. Un cobro electrónico sin referencia es el que no se va a
// poder encontrar, y se dice.

import { claseDeLinea, tipoDePieza, horaDe } from './ventasTicket.js'

const limpio = v => String(v ?? '').trim()
const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0)
const esSi = v => limpio(v).toLowerCase() === 't' || v === true || v === 1

/** Lo que significa cada motivo, para la pantalla. */
export const MOTIVOS_DE_MAYOREO = {
  'mayoreo-sin-funda': 'Precio de mayoreo sin una funda ni una mica de hidrogel en el ticket',
  'etiquetas-no-cuadran': 'El mayorista no viene tantas veces como productos se compraron',
}

/** Las formas de pago que no son efectivo. `m` es mixto: una parte es efectivo. */
export const FORMAS_ELECTRONICAS = { t: 'Tarjeta', s: 'Transferencia', m: 'Mixto' }

const dentroDe = (desdeDia, cuando) => {
  if (!desdeDia) return true
  const h = horaDe(cuando)
  return !!h && h.dia >= desdeDia
}
const horaTexto = h => (h ? `${String(h.hora).padStart(2, '0')}:${String(h.minuto).padStart(2, '0')}` : '')

/**
 * Los tickets que rompen alguna de las dos reglas.
 *
 * `tickets` son `{ id, folio, cuando, cancelado, cajero }` y `lineas`
 * `{ ticket, codigo, producto, depto, cantidad, total, mayoreo }`, las mismas
 * de `agregarVentas`. Los cancelados no cuentan: no son una venta.
 */
export function incidenciasDeMayoreo({ tickets = [], lineas = [], desdeDia = null } = {}) {
  const porTicket = new Map()
  for (const l of lineas ?? []) {
    if (num(l.cantidad) === 0) continue
    const k = String(l.ticket)
    if (!porTicket.has(k)) porTicket.set(k, [])
    porTicket.get(k).push(l)
  }

  const out = []
  for (const t of tickets ?? []) {
    if (esSi(t.cancelado) || !dentroDe(desdeDia, t.cuando)) continue
    const ls = porTicket.get(String(t.id))
    if (!ls?.length) continue

    let etiquetas = 0, piezas = 0, importe = 0, mayoreo = false, fundaOMica = false, mayorista = null
    const tipos = { fundas: 0, hidrogel: 0, stickers: 0, otros: 0 }
    for (const l of ls) {
      const n = num(l.cantidad)
      if (claseDeLinea(l) === 'etiqueta') {
        etiquetas += n
        mayorista ??= limpio(l.producto) || limpio(l.codigo)
        continue
      }
      piezas += n
      importe += num(l.total)
      if (esSi(l.mayoreo)) mayoreo = true
      const tipo = tipoDePieza(l)
      if (tipo === 'funda') { tipos.fundas += n; fundaOMica = true }
      else if (tipo === 'hidrogel') { tipos.hidrogel += n; fundaOMica = true }
      else if (tipo === 'sticker') tipos.stickers += n
      else tipos.otros += n
    }

    const motivos = []
    if (mayoreo && !fundaOMica) motivos.push('mayoreo-sin-funda')
    if (etiquetas > 0 && etiquetas !== piezas) motivos.push('etiquetas-no-cuadran')
    if (!motivos.length) continue

    const h = horaDe(t.cuando)
    out.push({
      f: h?.dia ?? null, hora: horaTexto(h), folio: limpio(t.folio) || limpio(t.id),
      cajero: limpio(t.cajero) || null,
      mayorista, piezas, etiquetas, tipos, importe, mayoreo, motivos,
    })
  }
  return out.sort((a, b) => String(b.f).localeCompare(String(a.f)) || b.hora.localeCompare(a.hora))
}

/**
 * Los cobros con tarjeta, transferencia o mixtos, con su referencia.
 *
 * `tickets` traen además `total` y `referencia`. En un mixto el importe es el
 * del ticket entero: Eleventa no guarda por ticket cuánto fue con tarjeta.
 */
export function cobrosElectronicos({ tickets = [], desdeDia = null } = {}) {
  const out = []
  for (const t of tickets ?? []) {
    const forma = limpio(t.formaPago).toLowerCase()
    if (!FORMAS_ELECTRONICAS[forma]) continue
    if (esSi(t.cancelado) || !dentroDe(desdeDia, t.cuando)) continue
    const h = horaDe(t.cuando)
    out.push({
      f: h?.dia ?? null, hora: horaTexto(h), folio: limpio(t.folio) || limpio(t.id),
      forma, total: num(t.total), referencia: limpio(t.referencia),
    })
  }
  return out.sort((a, b) => String(a.f).localeCompare(String(b.f)) || a.hora.localeCompare(b.hora))
}

// ── Los tickets que pueden pagar comisión ─────────────────────────────────
//
// La nómina (2026-11-11) paga comisión por un CRUCE de productos —funda, mica
// de hidrogel, sticker— dentro del MISMO ticket, a precio público. La cuenta
// con el 7% y los precios mínimos vive en `src/lib/nomina.js`, porque son
// parámetros que el administrador cambia; aquí sólo se apartan los tickets que
// PUEDEN pagarla, con sus líneas y lo que se cobró por pieza.
//
// Se descartan sin mirar precios: los cancelados, los que llevan mayorista y
// los que no juntan dos tipos distintos. El piso de `PISO_COMISIONABLE` sólo
// adelgaza el archivo: ningún mínimo del dueño está por debajo de $100.

export const PISO_COMISIONABLE = 100
const TIPOS_COMISION = new Set(['funda', 'hidrogel', 'sticker'])

export function ticketsComisionables({ tickets = [], lineas = [], desdeDia = null, piso = PISO_COMISIONABLE } = {}) {
  const porTicket = new Map()
  for (const l of lineas ?? []) {
    if (num(l.cantidad) <= 0) continue
    const k = String(l.ticket)
    if (!porTicket.has(k)) porTicket.set(k, [])
    porTicket.get(k).push(l)
  }
  const out = []
  for (const t of tickets ?? []) {
    if (esSi(t.cancelado) || !dentroDe(desdeDia, t.cuando)) continue
    const ls = porTicket.get(String(t.id))
    if (!ls?.length || ls.some(l => claseDeLinea(l) === 'etiqueta')) continue
    const utiles = ls.map(l => ({
      codigo: limpio(l.codigo), producto: limpio(l.producto), tipo: tipoDePieza(l),
      cantidad: num(l.cantidad), precio: Math.round((num(l.total) / num(l.cantidad)) * 100) / 100,
      mayoreo: esSi(l.mayoreo),
    })).filter(l => TIPOS_COMISION.has(l.tipo))
    const tipos = new Set(utiles.filter(l => !l.mayoreo && l.precio >= piso).map(l => l.tipo))
    if (tipos.size < 2) continue
    const h = horaDe(t.cuando)
    out.push({ id: limpio(t.id), folio: limpio(t.folio) || limpio(t.id), f: h?.dia ?? null, hora: horaTexto(h), cajero: limpio(t.cajero), lineas: utiles })
  }
  return out.sort((a, b) => String(b.f).localeCompare(String(a.f)) || b.hora.localeCompare(a.hora))
}
