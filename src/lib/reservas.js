// Qué reponer ANTES de que se agote, y de dónde sacarlo.
//
// ── Por qué existe ──────────────────────────────────────────────────────────
//
// Hasta ahora se surtía cuando ya se habían agotado dos o tres modelos clase
// A: es decir, cuando la venta ya se perdió y encima hay que esperar el
// traslado. Esto da la vuelta al disparo: avisa cuando a un modelo le quedan
// menos días de los que tarda en llegar su reposición.
//
// ── Los dos relojes, que es lo que decide todo ──────────────────────────────
//
// Pedir al proveedor tarda **40 días**. El proveedor nacional -la competencia-
// tarda **4**, y deja menos margen, pero el dueño lo usa a propósito: prefiere
// ganar menos que quedarle mal a un mayorista.
//
// Con esos dos números la pantalla puede decir algo que antes se decidía de
// memoria: si a un modelo le quedan menos de 40 días de venta y la bodega no
// tiene, el pedido normal NO LLEGA. O sale nacional, o se pierde la venta.
// Esa frase es toda la razón de ser de este archivo.

/**
 * 🔒 Lo que tarda cada camino en poner una funda en el mostrador.
 *
 * `traslado` es de bodega a tienda, y es el único que no está medido: se
 * surte cuando hace falta, así que vale como estimación prudente hasta que se
 * registren los traspasos.
 */
export const ENTREGA = { proveedor: 40, nacional: 4, traslado: 2 }

/**
 * 🔒 Días que debe aguantar cada clase. Los pidió el dueño así: en temporada
 * baja de veinte días a un mes, y en alta más, porque es cuando se vacía todo.
 *
 * La clase pondera a propósito: el 70-80% de la venta está en A y B, y un C
 * con dos meses de inventario es dinero parado en el estante equivocado.
 */
export const COBERTURA_TIENDA = {
  baja: { A: 30, B: 25, C: 20 },
  alta: { A: 60, B: 45, C: 30 },
}

/**
 * 🔒 Y en bodega, el doble de lo que tarda el pedido para la clase A.
 *
 * Es la regla del dueño tal cual: «me gusta tener incluso hasta el doble de
 * lo que tardaría un pedido en llegar», porque ahí se sostiene casi toda la
 * venta. 2 × 40 = 80.
 */
export const COBERTURA_BODEGA = { A: ENTREGA.proveedor * 2, B: 60, C: 40 }

export const ESTADOS = {
  CERO:    'cero',     // en cero y vendiéndose: la venta se está perdiendo ya
  URGE:    'urge',     // no aguanta ni lo que tarda el traslado
  REPONER: 'reponer',  // por debajo de su objetivo de cobertura
  OK:      'ok',
}

/** De dónde puede salir la reposición. */
export const ORIGENES = {
  BODEGA:    'bodega',    // hay en bodega: es un traslado y llega en días
  NACIONAL:  'nacional',  // no hay y el pedido de 40 días no llega a tiempo
  PROVEEDOR: 'proveedor', // no hay, pero da tiempo a pedirlo bien
}

const num = v => Number(v) || 0

/** Días que aguanta una existencia a un ritmo dado. `null` si no se vende. */
export const diasQueAguanta = (existencia, ritmo) =>
  ritmo > 0 ? num(existencia) / ritmo : null

/**
 * Las reservas de la red, modelo por modelo y plaza por plaza.
 *
 * `inventarios` es { slug: json } de las tiendas, `bodega` su json,
 * `ritmoPorPlaza` { slug: { codigo: piezas/día } } y `clase` { codigo: 'A' }.
 *
 * Devuelve una fila por plaza y modelo que necesite algo, nunca por los que
 * están bien: una lista de doscientos renglones verdes no la mira nadie.
 */
export function reservas({
  inventarios, bodega, ritmoPorPlaza, clase, nombres = {},
  alta = false, cobertura = null,
}) {
  const objetivos = cobertura ?? (alta ? COBERTURA_TIENDA.alta : COBERTURA_TIENDA.baja)

  // Lo que hay en bodega, por código: decide si la reposición es un traslado
  // o una compra.
  const enBodega = {}
  for (const p of bodega?.productos ?? []) {
    const c = String(p.Codigo ?? '').trim()
    if (c) enBodega[c] = num(p.Existencia)
  }

  // El ritmo de toda la red por código, para saber si un pedido de 40 días
  // llega a tiempo: la pregunta no es si aguanta ESTA tienda, es si aguanta
  // el conjunto mientras el proveedor fabrica.
  const ritmoRed = {}
  for (const tasas of Object.values(ritmoPorPlaza ?? {})) {
    for (const [c, t] of Object.entries(tasas ?? {})) ritmoRed[c] = (ritmoRed[c] || 0) + t
  }

  const existenciaRed = {}
  for (const inv of [...Object.values(inventarios ?? {}), bodega]) {
    for (const p of inv?.productos ?? []) {
      const c = String(p.Codigo ?? '').trim()
      if (c) existenciaRed[c] = (existenciaRed[c] || 0) + num(p.Existencia)
    }
  }

  const filas = []

  for (const [slug, inv] of Object.entries(inventarios ?? {})) {
    const tasas = ritmoPorPlaza?.[slug] ?? {}

    for (const p of inv?.productos ?? []) {
      const codigo = String(p.Codigo ?? '').trim()
      if (!codigo) continue

      const ritmo = tasas[codigo] ?? 0
      // Lo que no se vende no se repone. Un cero aquí no es un problema de
      // abasto, es un modelo que no mueve.
      if (ritmo <= 0) continue

      const existencia = num(p.Existencia)
      const cl = clase?.[codigo] ?? 'C'
      const objetivo = objetivos[cl] ?? objetivos.C
      const dias = diasQueAguanta(existencia, ritmo)

      const estado = existencia === 0 ? ESTADOS.CERO
        : dias < ENTREGA.traslado ? ESTADOS.URGE
        : dias < objetivo ? ESTADOS.REPONER
        : ESTADOS.OK
      if (estado === ESTADOS.OK) continue

      const hay = enBodega[codigo] ?? 0
      const falta = Math.max(0, Math.ceil(ritmo * objetivo - existencia))

      // El reparto de la verdad: si bodega no tiene y a la RED le quedan
      // menos días de los que tarda el proveedor, el pedido normal no llega.
      const diasRed = diasQueAguanta(existenciaRed[codigo] ?? 0, ritmoRed[codigo] ?? 0)
      const origen = hay > 0 ? ORIGENES.BODEGA
        : (diasRed !== null && diasRed < ENTREGA.proveedor) ? ORIGENES.NACIONAL
        : ORIGENES.PROVEEDOR

      filas.push({
        plaza: slug,
        codigo,
        producto: nombres[codigo] || String(p.Producto ?? '').trim(),
        clase: cl,
        existencia,
        ritmo,
        dias,
        objetivo,
        falta,
        // Nunca se promete más de lo que hay: el resto es compra, no traslado.
        desdeBodega: Math.min(falta, hay),
        enBodega: hay,
        diasRed,
        estado,
        origen,
        // Lo que cuesta no hacer nada, al día. Es lo que ordena la lista:
        // primero lo que más dinero deja de entrar.
        piezasAlDia: ritmo,
        pesosAlDia: ritmo * num(p.Mayoreo || p.Precio),
      })
    }
  }

  // Lo que más duele primero: en cero antes que bajo, y dentro de cada grupo
  // lo que más venta deja de hacer cada día.
  const orden = { [ESTADOS.CERO]: 0, [ESTADOS.URGE]: 1, [ESTADOS.REPONER]: 2 }
  filas.sort((a, b) => orden[a.estado] - orden[b.estado] || b.pesosAlDia - a.pesosAlDia)

  const cuenta = e => filas.filter(f => f.estado === e).length
  return {
    filas,
    resumen: {
      cero: cuenta(ESTADOS.CERO),
      urge: cuenta(ESTADOS.URGE),
      reponer: cuenta(ESTADOS.REPONER),
      // Lo que se está perdiendo HOY por lo que ya está en cero.
      pesosAlDia: filas.filter(f => f.estado === ESTADOS.CERO)
        .reduce((a, f) => a + f.pesosAlDia, 0),
      nacional: filas.filter(f => f.origen === ORIGENES.NACIONAL).length,
    },
  }
}
