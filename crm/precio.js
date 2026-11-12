// Los precios, que son del DUEÑO y no de la caja.
//
// ── Por qué no se leen de Eleventa ──────────────────────────────────────────
//
// Porque los de Eleventa están mal, y de dos formas a la vez. Medido el
// 2026-10-30 sobre los tres inventarios:
//
//   · El IVA no se captura igual. De 1,951 precios con decimales, 1,850
//     (94.8%) dan un número redondo al multiplicarlos por 1.16 —129.3103 ×
//     1.16 = 150.0000—. Son capturas SIN IVA mezcladas con capturas finales
//     dentro de la misma plaza.
//   · Y aun normalizando el IVA, 171 de 782 códigos no coinciden entre
//     plazas. El HARD CASE figura a 220 en León, 200 en San Luis y 230 en
//     Aguascalientes. No son tres precios: son dos errores de captura.
//
// El precio de verdad es por TIPO de producto y lo puso el dueño. Son diez
// números. Leerlos de la caja era construir sobre arena: cotizar 129 donde se
// cobra 150 es un 16% por debajo, por escrito, y el chat se ve perfecto.
//
// Los de Eleventa siguen sirviendo para lo que servían —valorar inventario y
// detectar capturas torcidas con `desviaciones()` en `src/lib/precios.js`—,
// pero no para decirle un número a un cliente.
//
// ── El público manda ────────────────────────────────────────────────────────
//
// La publicidad va casi toda a público, no a mayoristas: quien escribe quiere
// una funda para su teléfono, no doce piezas. Por eso `precioDe()` da el
// precio al público por omisión y el de mayoreo sólo cuando se le pide.

import { esProtector } from '../src/lib/familias.js'

/**
 * 🔒 CONFIRMAR — Lista del dueño, 2026-10-30. Cambiar cualquiera de estos
 * números cambia lo que se cobra en el mostrador. No se toca sin preguntar.
 *
 * `mayoreo: null` no es gratis ni es cero: es que no hay precio de mayoreo
 * dado para ese tipo. El bot lo dice, no lo inventa.
 */
export const TIPOS = {
  'tpu':               { nombre: 'TPU',                      publico: 250,  mayoreo: 150 },
  'hard':              { nombre: 'Hard',                     publico: 220,  mayoreo: 130 },
  'uso-rudo':          { nombre: 'Uso rudo 3 en 1',          publico: 300,  mayoreo: 190 },
  'mica-hd':           { nombre: 'Hidrogel HD',              publico: 150,  mayoreo: null },
  'mica-mate':         { nombre: 'Hidrogel mate',            publico: 180,  mayoreo: null },
  'mica-privacidad':   { nombre: 'Hidrogel privacidad',      publico: 200,  mayoreo: null },
  'mica-uso-rudo':     { nombre: 'Mica HD uso rudo',         publico: 200,  mayoreo: null },

  'mica-tablet-hd':    { nombre: 'Mica hidrogel tablet HD',  publico: 300,  mayoreo: null },
  'mica-tablet-mate':  { nombre: 'Mica hidrogel mate tablet',publico: 300,  mayoreo: null },

  // 🔒 REMATE — modelos viejos. Su precio de lista es más alto, pero se están
  // sacando al precio del TPU. `antes` no es adorno: es verdad y el bot lo
  // puede decir, que es el único descuento honesto que tiene para ofrecer.
  //
  // Sin precio de mayoreo: de estos no se dio, y un revendedor que pregunte
  // por un modelo viejo concreto es raro. La tienda lo cotiza.
  'tpu-cristal':       { nombre: 'TPU cristal', publico: 250, mayoreo: null, remate: true, antes: 300 },
  'duo':               { nombre: 'Duo',         publico: 250, mayoreo: null, remate: true, antes: 260 },
}

/**
 * 🔒 Lo que baja la mica al llevarla junto con una funda, en cualquiera de sus
 * presentaciones. El descuento va sobre la MICA, no sobre el total.
 */
export const DESCUENTO_COMBO = 30

/** Los tipos que son protector de pantalla y no funda. */
const ES_MICA = new Set([
  'mica-hd', 'mica-mate', 'mica-privacidad', 'mica-uso-rudo',
  'mica-tablet-hd', 'mica-tablet-mate',
])

export const esMica = tipo => ES_MICA.has(tipo)

/**
 * El tipo de un producto, deducido del nombre del catálogo.
 *
 * El orden importa y no es decorativo:
 *
 *   · Los protectores van PRIMERO. «HD USO RUDO» (HDR) no dice «mica» en
 *     ninguna parte, pero está en `CODIGOS_PROTECTOR`; si se mirara «uso
 *     rudo» antes, una mica de 200 se cotizaría como funda de 300.
 *   · Dentro de los protectores, «tablet» antes que «mate»: «MICA HIDROGEL
 *     MATE TABLET» lleva las dos palabras y es la de tablet.
 *   · «3 en 1» antes que «TPU» y «HARD», porque hay nombres que traen las dos
 *     cosas.
 *
 * **MILITAR no es uso rudo.** Los doce «MILITAR TPU CASE» del catálogo valen
 * 250 en las tres plazas, no 300: son TPU con otro acabado. Meterlos en uso
 * rudo cotizaba 50 pesos de más por pieza en 69 piezas de inventario. Lo que
 * sí es uso rudo es el «3 EN 1», y son 36 códigos, todos a 300 en las tres.
 *
 * Devuelve null para lo que no es ni funda ni mica —el exhibidor, los
 * stickers—, que no se anuncia.
 */
export function tipoDe(codigo, nombre) {
  const n = String(nombre ?? '').toUpperCase()

  if (esProtector(codigo, nombre)) {
    if (/TABLET/.test(n))               return /\bMATE\b/.test(n) ? 'mica-tablet-mate' : 'mica-tablet-hd'
    if (/PRIVACIDAD|ANTIESPIA/.test(n)) return 'mica-privacidad'
    if (/\bMATE\b/.test(n))             return 'mica-mate'
    if (/USO RUDO/.test(n))             return 'mica-uso-rudo'
    return 'mica-hd'
  }

  // Cristal antes que TPU: «TPU CRISTAL» lleva las dos palabras y es su
  // propio tipo. Las tres plazas lo tienen a 300, no a 250: son 15 códigos y
  // cotizarlos como TPU normal dejaba 50 pesos por pieza en la mesa.
  if (/\bCRISTAL\b/.test(n))     return 'tpu-cristal'
  // TPU antes que uso rudo: «MILITAR TPU CASE» lleva las dos y es TPU.
  if (/\bTPU\b/.test(n))         return 'tpu'
  if (/3 ?[EI]N ?1|USO RUDO/.test(n)) return 'uso-rudo'
  if (/\bDUO\b/.test(n))         return 'duo'
  if (/\bHARD\b/.test(n))        return 'hard'
  return null
}

/** Motivos por los que no hay número, y qué contesta el bot. */
export const TEXTO_MOTIVO = {
  'tipo-desconocido': 'ese producto no tiene precio de lista, lo confirma la tienda',
  'sin-confirmar':    'ese tipo de producto todavía no tiene precio de lista confirmado, lo confirma la tienda',
  'sin-mayoreo':      'de ese tipo no hay precio de mayoreo en lista, lo confirma la tienda',
}

/**
 * El precio de un producto.
 *
 * `cliente` es 'publico' (por omisión) o 'mayoreo'.
 * `combo` en true aplica el descuento, y SÓLO tiene efecto sobre una mica:
 * el descuento es sobre la mica que se lleva junto con una funda.
 *
 * Devuelve `{ decir, monto, tipo, nombreTipo, esMica, combo, porQueNo }`.
 * Con `decir: false` NO hay número, y el bot dice `porQueNo` en vez de
 * estimar, redondear o aplicarle un impuesto por su cuenta.
 */
export function precioDe({ codigo, nombre, cliente = 'publico', combo = false } = {}) {
  const tipo = tipoDe(codigo, nombre)

  if (!tipo) {
    return { decir: false, monto: null, tipo: null, porQueNo: TEXTO_MOTIVO['tipo-desconocido'] }
  }

  const t = TIPOS[tipo]
  const base = cliente === 'mayoreo' ? t.mayoreo : t.publico
  const comun = { tipo, nombreTipo: t.nombre, esMica: esMica(tipo), cliente }

  if (base == null) {
    // Dos huecos distintos: el tipo no tiene lista todavía, o la tiene para
    // público y no para mayoreo. Se dicen distinto porque son cosas distintas.
    const motivo = t.publico == null ? 'sin-confirmar' : 'sin-mayoreo'
    return { ...comun, decir: false, monto: null, combo: false, porQueNo: TEXTO_MOTIVO[motivo] }
  }

  // El combo baja la mica. Una funda no baja por llevar mica.
  const aplicaCombo = combo && esMica(tipo)
  const monto = aplicaCombo ? base - DESCUENTO_COMBO : base

  return {
    ...comun,
    decir: true,
    monto,
    combo: aplicaCombo,
    // El remate sólo es remate contra el precio al público. En mayoreo no hay
    // nada con qué comparar, así que no se anuncia como rebaja.
    ...(t.remate && cliente === 'publico' && { remate: true, antes: t.antes }),
    porQueNo: null,
  }
}

/**
 * Lo que cuesta llevar funda y mica juntas.
 *
 * Existe como función propia porque el descuento es del PAQUETE y sumar dos
 * llamadas a `precioDe` sin pasarle `combo` da el precio sin descuento sin que
 * nada avise. Devuelve `decir: false` si cualquiera de las dos piezas no tiene
 * precio: un total a medias es peor que ningún total.
 */
export function precioCombo({ funda, mica, cliente = 'publico' } = {}) {
  const f = precioDe({ ...funda, cliente })
  const m = precioDe({ ...mica, cliente, combo: true })

  if (!f.decir || !m.decir) {
    return { decir: false, monto: null, funda: f, mica: m, porQueNo: (!f.decir ? f : m).porQueNo }
  }
  return {
    decir: true,
    monto: f.monto + m.monto,
    funda: f,
    mica: m,
    ahorro: DESCUENTO_COMBO,
    porQueNo: null,
  }
}
