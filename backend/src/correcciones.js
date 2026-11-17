// Los ajustes del administrador al corte, del lado del servidor.
//
// La regla de cómo se aplican vive en `src/lib/correcciones.js`; aquí, qué se
// acepta guardar. Va aparte de las rutas para poder probarlo sin S3.
//
// Se guardan en `caja/correcciones.json` —privado, como todo `caja/`—:
// `{ <plaza>: { <id>: ajuste } }`. Nunca se borra un ajuste: deshacerlo lo
// marca con quién y cuándo, y se queda como precedente.

const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0)

export const MOTIVOS_DE_AJUSTE = new Set([
  'no-registrado', 'sin-concepto', 'concepto-equivocado', 'monto-equivocado', 'duplicado', 'otro',
])
export const CATEGORIAS_DE_AJUSTE = new Set(['gasto', 'sueldo', 'comision', 'entrada'])
export const ACCIONES_DE_AJUSTE = new Set(['agregar', 'anular', 'sustituir'])

/**
 * 🔒 La huella de un movimiento. Escrita dos veces a la fuerza —también en
 * `src/lib/correcciones.js`—; `test/correcciones.test.js` las pone frente a
 * frente.
 */
export function huellaDe(m, repeticion = 0) {
  if (m?.id) return `p:${m.id}`
  return `e:${m?.f ?? ''}|${m?.tipo ?? ''}|${num(m?.monto)}|${String(m?.concepto ?? '').trim()}|${repeticion}`
}

export function conHuella(movimientos = []) {
  const vistas = new Map()
  return (movimientos ?? []).map(m => {
    const base = huellaDe(m, 0)
    if (m?.id) return { ...m, ref: base }
    const n = vistas.get(base) ?? 0
    vistas.set(base, n + 1)
    return { ...m, ref: huellaDe(m, n) }
  })
}

const esFecha = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? ''))
const masDias = (f, n) => { const d = new Date(`${f}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const enSemana = (f, lunes) => esFecha(f) && f >= lunes && f <= masDias(lunes, 6)

function montoValido(v) {
  if (v === null || v === undefined || String(v).trim() === '') return null
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * 100) / 100
}

/**
 * Valida un ajuste nuevo y devuelve `{ ajuste }` o `{ error }`.
 *
 * `movimientos` son los de la plaza tal como los ve la pantalla —los del punto
 * de venta y los capturados en la página—, y `vigentes` los ajustes que ya
 * existen. El autor, la hora y el original los pone ESTE lado: lo que mande el
 * navegador no cuenta como prueba.
 */
export function validarAjuste(cuerpo, { semana, movimientos = [], vigentes = [], quien, ahora = new Date().toISOString(), id }) {
  const accion = String(cuerpo?.accion ?? '')
  if (!ACCIONES_DE_AJUSTE.has(accion)) return { error: 'Acción de ajuste desconocida.' }

  const motivo = String(cuerpo?.motivo ?? '')
  if (!MOTIVOS_DE_AJUSTE.has(motivo)) return { error: 'Elige por qué se hace el ajuste.' }

  // Sin nota no se guarda: un ajuste sin explicación es justo lo que esto
  // existe para evitar.
  const nota = String(cuerpo?.nota ?? '').trim().slice(0, 500)
  if (!nota) return { error: 'Escribe una nota que explique el ajuste.' }

  let original = null, ref = null
  if (accion === 'anular' || accion === 'sustituir') {
    ref = String(cuerpo?.ref ?? '')
    const m = conHuella(movimientos).find(x => x.ref === ref)
    if (!m) return { error: 'Ese movimiento ya no está en la caja: vuelve a cargar la página.' }
    if (m.tipo === 'faltante') return { error: 'Un faltante no se ajusta desde aquí: no resta de lo esperado.' }
    if (m.origen === 'ajuste') return { error: 'Un movimiento de ajuste se deshace, no se ajusta.' }
    if (!enSemana(m.f, semana)) return { error: 'Ese movimiento no es de esta semana.' }
    if (vigentes.some(c => !c.deshecho && c.ref === ref)) {
      return { error: 'Ese movimiento ya tiene un ajuste: deshazlo antes de hacer otro.' }
    }
    original = { f: m.f, tipo: m.tipo, monto: num(m.monto), concepto: String(m.concepto ?? ''), origen: m.origen ?? 'eleventa' }
  }

  let nuevo = null
  if (accion === 'agregar' || accion === 'sustituir') {
    const n = cuerpo?.nuevo ?? {}
    const f = String(n.f ?? original?.f ?? '')
    if (!enSemana(f, semana)) return { error: 'El día del movimiento tiene que caer en la semana del corte.' }
    const categoria = String(n.categoria ?? '')
    if (!CATEGORIAS_DE_AJUSTE.has(categoria)) return { error: 'Elige qué es el movimiento: gasto, sueldo, comisión u otra entrada.' }
    const monto = montoValido(n.monto)
    if (monto === null) return { error: 'El monto tiene que ser un número mayor que cero.' }
    const concepto = String(n.concepto ?? '').trim().slice(0, 160)
    if (!concepto) return { error: 'Todo movimiento lleva concepto.' }
    nuevo = { f, categoria, monto, concepto }
  }

  return {
    ajuste: {
      id, semana, accion, motivo, nota,
      ...(ref ? { ref, original } : {}),
      ...(nuevo ? { nuevo } : {}),
      quien, cuando: ahora,
    },
  }
}

/** Deshace un ajuste sin borrarlo: se queda con quién y cuándo. */
export function deshacerAjuste(ajuste, { quien, ahora = new Date().toISOString() }) {
  if (!ajuste) return { error: 'Ese ajuste no existe.' }
  if (ajuste.deshecho) return { error: 'Ese ajuste ya estaba deshecho.' }
  return { ajuste: { ...ajuste, deshecho: { quien, cuando: ahora } } }
}
