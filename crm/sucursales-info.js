// Los datos públicos de cada tienda: lo que el bot dice cuando alguien pregunta
// «¿dónde están?», «¿a qué hora abren?» o «mándame la ubicación».
//
// Hasta el 2026-11-12 el sistema sólo conocía el NOMBRE de cada sucursal. El
// dueño probó el bot preguntando por el domicilio y no tuvo con qué contestar.
//
// ── Reglas que no se rompen ─────────────────────────────────────────────────
//
// 1. **Lo que no está aquí, el bot no lo dice.** Un horario inventado manda a
//    alguien a una puerta cerrada, y eso es peor que decir «la tienda te lo
//    confirma». Un campo `null` significa «no se sabe», nunca «no hay».
//
// 2. **Toda plaza del bot tiene que estar en esta lista**, aunque sea con
//    `null`: así añadir una tienda obliga a decidir qué se dice de ella.
//    `reglas.test.js` lo comprueba.
//
// 3. **El enlace de mapa va limpio.** El que se copia de Google Maps trae
//    medio kilómetro de rastreadores (`entry=ttu&g_ep=…`). Se usa el `cid`, el
//    identificador del negocio en Google, que sale del propio enlace largo:
//    la parte hexadecimal después de los dos puntos, pasada a decimal.
//
// Todo esto es información que cualquiera ve en Google. No lleva nada privado.

export const INFO = {
  leon: {
    domicilio: '5 de Mayo 216, Local 40, planta baja, Centro, 37000 León de los Aldama, Gto.',
    mapa: 'https://www.google.com/maps?cid=14956553425641100087',
    horario: null,
  },

  // Pendientes de que el dueño pase el enlace de Google Maps, el domicilio y el
  // horario de cada una. Mientras tanto el bot dice que la tienda se lo confirma.
  'san-luis': null,
  aguascalientes: null,
  torreon: null,
}

/**
 * Lo que se sabe de una tienda, o un error que le dice al modelo qué hacer.
 * Nunca rellena un campo que falte.
 */
export function datosDeSucursal({ plaza } = {}) {
  const i = INFO[plaza]
  if (!i) {
    return {
      error: 'sin-datos',
      nota: 'De esa tienda todavía no tengo domicilio ni horario. No los inventes: dile que la tienda se los confirma y ofrece pasarlo con ella.',
    }
  }
  const salida = { plaza }
  const falta = []
  for (const campo of ['domicilio', 'mapa', 'horario']) {
    if (i[campo]) salida[campo] = i[campo]
    else falta.push(campo)
  }
  if (falta.length) {
    salida.nota = `No tengo ${falta.join(' ni ')} de esta tienda: no lo inventes, di que la tienda se lo confirma.`
  }
  return salida
}
