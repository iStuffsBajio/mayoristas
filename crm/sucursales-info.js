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

// Dictado por el dueño el 2026-11-12. El horario va como lo dijo, sin
// reinterpretarlo: «todas las sucursales, de 10:30 am a 8 pm; los domingos se
// cierra a las 5 pm sólo en temporada alta, y los días antes de Navidad y Reyes
// puede variar». Torreón tiene el suyo.
const HORARIO_GENERAL =
  'De 10:30 am a 8:00 pm. Los domingos en temporada alta cerramos a las 5:00 pm, ' +
  'y en los días antes de Navidad y Reyes el horario puede variar.'

export const INFO = {
  leon: {
    domicilio: '5 de Mayo 216, Local 40, planta baja, Centro, 37000 León de los Aldama, Gto.',
    mapa: 'https://www.google.com/maps?cid=14956553425641100087',
    horario: HORARIO_GENERAL,
  },
  'san-luis': {
    domicilio: 'Álvaro Obregón 457, interior 403, planta baja, 78000 San Luis Potosí, S.L.P.',
    mapa: 'https://www.google.com/maps?cid=1284843947524365285',
    horario: HORARIO_GENERAL,
  },
  aguascalientes: {
    domicilio: '5 de Mayo 219, local 143, Zona Centro, 20000 Aguascalientes, Ags.',
    mapa: 'https://www.google.com/maps?cid=13669738669457645926',
    horario: HORARIO_GENERAL,
  },
  torreon: {
    domicilio: 'Av. Hidalgo 1334, local 133, Primitivo Centro, 27000 Torreón, Coah.',
    // Torreón no tiene ficha en Google Maps (2026-11-12). Este es un enlace de
    // BÚSQUEDA por la dirección: cae en esa calle, no en la puerta. Cuando exista
    // la ficha, se cambia por su enlace con `cid`.
    mapa: 'https://www.google.com/maps/search/?api=1&query=' +
      encodeURIComponent('Av Hidalgo 1334, Primitivo Centro, 27000 Torreón, Coah.'),
    horario:
      'De lunes a jueves de 10:00 am a 7:00 pm, y de viernes a domingo de 10:00 am a 7:30 pm.',
  },
}

/**
 * Lo que se sabe de una tienda, o un error que le dice al modelo qué hacer.
 * Nunca rellena un campo que falte.
 */
export function datosDeSucursal({ plaza, info = INFO } = {}) {
  const i = info[plaza]
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
