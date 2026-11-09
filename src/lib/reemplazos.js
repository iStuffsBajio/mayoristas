// Qué se vendió justo después de cancelar un ticket.
//
// Lo propuso el dueño el 2026-11-08, y lo propuso bien —reconociendo la
// trampa antes de que nadie se la señalara—:
//
//   «Cancelo un iPhone 14 en 3 piezas. Y después doy de alta un iPhone 14 en
//    TPU. Pero es el ticket exactamente siguiente después de cancelar. En
//    realidad nadie dice que es el reemplazo. Pero si el modelo coincide, sí
//    es posible hacer una especie de regla.»
//
// Esa última frase es todo el diseño. Eleventa NO enlaza una cancelación con
// la venta que la sustituyó: ese dato no existe en ninguna tabla. Lo que sí
// existe es la hora, el cajero y los productos, y con eso se puede SOSPECHAR.
//
// ── La línea que no se cruza ──────────────────────────────────────────────
//
// Esto devuelve una sospecha, nunca un hecho, y por eso:
//
//   · **No alimenta ninguna cifra.** No suma, no resta, no corrige nada. Si
//     un día alguien la mete en una cuenta, esa cuenta pasa a estar basada en
//     una suposición sin que se note, que es exactamente la clase de error
//     que este proyecto lleva arreglando desde el principio.
//   · **Sale siempre con su motivo y su confianza**, para que quien lo lea
//     pueda estar en desacuerdo. Una sospecha sin el porqué se lee como un
//     dato.
//   · **Cuando no hay nada que sospechar, se dice que no lo hay** en vez de
//     emparejar con lo que sea. Un emparejado falso es peor que ninguno:
//     enseña con toda seguridad algo que no pasó, y nadie lo revisa porque la
//     pantalla se ve perfecta. Ya costó caro con las fotos de los mockups.

import { claveModelo, tipoDeFunda } from './variantes.js'

/**
 * Minutos que puede tardar el reemplazo.
 *
 * Es el único número inventado de aquí, y conviene saberlo. Treinta minutos
 * es lo que tarda un cliente en elegir otra funda con el mostrador delante;
 * más allá, lo que venga después ya no tiene por qué tener nada que ver y
 * emparejarlo sería ruido con apariencia de dato.
 */
export const MINUTOS_PARA_REEMPLAZO = 30

const num = v => Number(v) || 0
const hora = t => new Date(String(t ?? '').replace(' ', 'T')).getTime()

/** Los modelos que toca un ticket, sin repetir. */
function modelosDe(lineas = []) {
  const m = new Map()
  for (const l of lineas) {
    const clave = claveModelo(l.producto ?? l.nombre ?? '')
    if (!clave) continue
    if (!m.has(clave)) m.set(clave, [])
    m.get(clave).push(l)
  }
  return m
}

/**
 * Empareja cada ticket CANCELADO con lo que se vendió justo después.
 *
 * `tickets` son `{ id, folio, cuando, cancelado, cajero }` y `lineasPorTicket`
 * un mapa `id -> [{ codigo, producto, piezas, importe }]`.
 *
 * Devuelve una fila por cancelación, con o sin pareja: una cancelación sin
 * reemplazo también es un dato —y de los que más importan, porque es venta
 * que se fue por la puerta—.
 */
export function reemplazosDeCancelados({
  tickets = [], lineasPorTicket = {}, minutos = MINUTOS_PARA_REEMPLAZO,
} = {}) {
  const ordenados = [...tickets]
    .filter(t => t.cuando)
    .sort((a, b) => hora(a.cuando) - hora(b.cuando))

  const out = []

  for (let i = 0; i < ordenados.length; i++) {
    const c = ordenados[i]
    if (!c.cancelado) continue

    const suyas = lineasPorTicket[c.id] ?? []
    const modelosC = modelosDe(suyas)

    // El candidato es el SIGUIENTE ticket no cancelado del MISMO cajero
    // dentro de la ventana. Del mismo cajero porque dos mostradores atienden
    // a la vez: el ticket siguiente en el tiempo puede ser de otro cliente
    // que no tiene nada que ver.
    let candidato = null
    for (let j = i + 1; j < ordenados.length; j++) {
      const n = ordenados[j]
      if ((hora(n.cuando) - hora(c.cuando)) > minutos * 60000) break
      if (n.cancelado) continue
      if (c.cajero && n.cajero && c.cajero !== n.cajero) continue
      candidato = n
      break
    }

    const fila = {
      cancelado: {
        id: c.id, folio: c.folio, cuando: c.cuando, cajero: c.cajero,
        piezas: suyas.reduce((a, l) => a + num(l.piezas), 0),
        importe: suyas.reduce((a, l) => a + num(l.importe), 0),
        productos: suyas.map(l => ({ codigo: l.codigo, producto: l.producto, piezas: num(l.piezas) })),
      },
      reemplazo: null,
      confianza: 'ninguna',
      porque: 'No se vendió nada después en la ventana: la venta se fue.',
    }

    if (candidato) {
      const lineasN = lineasPorTicket[candidato.id] ?? []
      const modelosN = modelosDe(lineasN)
      const comunes = [...modelosC.keys()].filter(k => modelosN.has(k))
      const minutosDespues = Math.round((hora(candidato.cuando) - hora(c.cuando)) / 60000)

      fila.reemplazo = {
        id: candidato.id, folio: candidato.folio, cuando: candidato.cuando,
        minutosDespues,
        piezas: lineasN.reduce((a, l) => a + num(l.piezas), 0),
        importe: lineasN.reduce((a, l) => a + num(l.importe), 0),
        productos: lineasN.map(l => ({ codigo: l.codigo, producto: l.producto, piezas: num(l.piezas) })),
      }

      if (comunes.length) {
        // El caso que describió: mismo teléfono, otra funda.
        const cambioDeTipo = comunes.some(k => {
          const tiposC = new Set((modelosC.get(k) ?? []).map(l => tipoDeFunda(l.producto)))
          return (modelosN.get(k) ?? []).some(l => !tiposC.has(tipoDeFunda(l.producto)))
        })
        fila.confianza = 'probable'
        fila.modelos = comunes
        fila.porque = cambioDeTipo
          ? `El mismo teléfono (${comunes.join(', ')}) y otro tipo de funda, ${minutosDespues} min después.`
          : `El mismo teléfono (${comunes.join(', ')}), ${minutosDespues} min después.`
      } else {
        // Hay venta justo después pero de otra cosa. Se enseña igual, porque
        // puede ser el reemplazo -el cliente se llevó algo distinto- pero no
        // se dice que lo sea.
        fila.confianza = 'dudosa'
        fila.porque = `Se vendió otra cosa ${minutosDespues} min después, de otro modelo. Puede no tener relación.`
      }
    }

    out.push(fila)
  }

  return out.sort((a, b) => String(b.cancelado.cuando).localeCompare(String(a.cancelado.cuando)))
}

/** Las cuentas, para el encabezado. Nunca en pesos de la venta: son sospechas. */
export function resumirReemplazos(filas = []) {
  return {
    cancelados: filas.length,
    conReemplazoProbable: filas.filter(f => f.confianza === 'probable').length,
    dudosos: filas.filter(f => f.confianza === 'dudosa').length,
    // La cifra que sí es un hecho: lo cancelado sin NADA después. Eso es
    // venta que salió por la puerta y no volvió.
    sinNadaDespues: filas.filter(f => f.confianza === 'ninguna').length,
    importeSinReemplazo: filas
      .filter(f => f.confianza === 'ninguna')
      .reduce((a, f) => a + num(f.cancelado.importe), 0),
  }
}
