// La salud del canal: si el bot puede o no mandar por WhatsApp, a la vista.
//
// ── Por qué existe ──────────────────────────────────────────────────────────
//
// El 2026-11-12 el token temporal de Meta venció. Desde ese momento ningún
// mensaje salía —«Authentication Error», código 190— y NADA avisó: el webhook
// seguía contestando 200, la cola se vaciaba, y cada cliente que escribía se
// quedaba sin respuesta uno por uno. Se supo porque alguien probó a mano.
//
// Un fallo que deja TODO el canal mudo no puede esperar a que alguien lo
// note. Cuando Meta rechaza un envío por algo que no se arregla solo —el
// token, un permiso, la cuenta bloqueada—, el trabajador lo apunta aquí
// (`crm/salud.js`) y el panel lo enseña arriba, en rojo, a quien abra
// Clientes. Además deja un renglón `CRM_ALARMA` en el registro, del que cuelga
// la alarma de `infra/crm-alarmas.json`.
//
// ── Por qué en un archivo y no sólo en CloudWatch ───────────────────────────
//
// La alarma avisa al correo del dueño. Quien está en el mostrador contestando
// clientes no lee ese correo, y es quien tiene que saber que lo que escriba no
// va a salir. El archivo es lo que el backend puede leer sin permisos nuevos.
//
// Vive en el BACKEND por lo mismo que `clientes.js`: lo usan los dos lados
// —el trabajador escribe, el panel lee— y el zip del backend no lleva `crm/`.
//
// `crm/salud.json`, PRIVADO como todo `crm/`.

export const LLAVE_SALUD = 'crm/salud.json'

/** Las clases de problema que se guardan. Las mismas que disparan la alarma. */
export const CLASES_DE_SALUD = ['token', 'permiso', 'cuenta', 'configuracion']

const TITULO = {
  token: 'El acceso de WhatsApp venció',
  permiso: 'A la app de Meta le falta un permiso',
  cuenta: 'Meta tiene detenida la cuenta de WhatsApp',
  configuracion: 'Al bot le faltan sus credenciales de WhatsApp',
}

const ahoraIso = ahora => new Date(ahora ?? Date.now()).toISOString()

/**
 * Apunta un problema. Si ya estaba, conserva DESDE cuándo —que es lo que
 * importa: cuánto lleva mudo— y actualiza la última vez que se vio y cuántas.
 */
export function anotarProblema(archivo, clase, { motivo = null, codigo = null } = {}, { ahora } = {}) {
  if (!CLASES_DE_SALUD.includes(clase)) return archivo ?? { problemas: {} }
  const hora = ahoraIso(ahora)
  const problemas = { ...(archivo?.problemas ?? {}) }
  const previo = problemas[clase]
  problemas[clase] = {
    desde: previo?.desde ?? hora,
    visto: hora,
    veces: (previo?.veces ?? 0) + 1,
    motivo: String(motivo ?? '').slice(0, 200) || null,
    codigo: Number(codigo) || null,
  }
  return { problemas, actualizado: hora }
}

/** Sin problemas. Devuelve el MISMO objeto si ya no había, para no escribir. */
export function despejar(archivo, { ahora } = {}) {
  if (!archivo || !Object.keys(archivo.problemas ?? {}).length) return archivo ?? null
  return { problemas: {}, actualizado: ahoraIso(ahora) }
}

/**
 * Lo que el panel enseña: una lista, vacía si todo está bien.
 *
 * Tolera cualquier cosa en el archivo —no existe, está a medias, lo escribió
 * una versión vieja—: un aviso roto no puede tumbar la bandeja.
 */
export function saludParaElPanel(archivo) {
  const p = archivo?.problemas
  if (!p || typeof p !== 'object') return []
  return CLASES_DE_SALUD
    .filter(clase => p[clase]?.desde)
    .map(clase => ({
      clase, titulo: TITULO[clase],
      desde: p[clase].desde, visto: p[clase].visto ?? p[clase].desde,
      motivo: p[clase].motivo ?? null, codigo: p[clase].codigo ?? null,
    }))
}
