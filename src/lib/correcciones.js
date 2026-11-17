// Los ajustes del administrador al corte de una semana.
//
// Lo pidió el dueño el 2026-11-17, con el corte de Aguascalientes delante: la
// tienda dejó gastos «sin concepto en la caja» y no registró el sueldo, y el
// corte no había forma de cuadrarlo sin tocar lo que dice Eleventa. Lo que
// pidió, con sus palabras: «meter ajustes de administrador que quede
// registrado que son ajustes y agregar nota … sin alterar el registro del
// eleventa», «hacer movimientos adicionales, o bien cancelarlos y sustituir el
// concepto correcto», «dejando el precedente de que se hizo un ajuste en esa
// semana. Y saber por qué se hizo».
//
// ── Tres decisiones ────────────────────────────────────────────────────────
//
// 1. **Lo de Eleventa no se toca.** `caja/<plaza>.json` se regenera del
//    respaldo varias veces al día: cualquier cosa escrita encima se borraría
//    esa misma tarde. Los ajustes viven aparte (`caja/correcciones.json`) y se
//    aplican AL LEER, igual que `caja/ajustes.json` y `ajustes/` del
//    inventario. Lo original sigue a la vista, tachado, al lado del ajuste.
//
// 2. **Un movimiento de Eleventa no trae identificador**, así que se le da una
//    HUELLA: día, tipo, monto, concepto y, si hay dos idénticos, cuál de ellos
//    es. Si la tienda corrige el movimiento en su caja, la huella deja de
//    existir y el ajuste se queda HUÉRFANO: no se aplica —restar la sustitución
//    sobre un original que ya no está restaría dos veces— y se dice en
//    pantalla para que alguien lo mire.
//
// 3. **Deshacer no borra.** Un ajuste deshecho se queda en la lista, tachado,
//    con quién y cuándo lo deshizo. Es lo que pidió: el precedente. Un registro
//    que se puede borrar sin rastro no prueba nada.

const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0)

/** Por qué se ajustó: lista cerrada, para poder contarlos sin tres maneras de escribir lo mismo. */
export const MOTIVOS_DE_AJUSTE = [
  { id: 'no-registrado',       texto: 'No se registró en el punto de venta' },
  { id: 'sin-concepto',        texto: 'Se registró sin concepto' },
  { id: 'concepto-equivocado', texto: 'Concepto o tipo equivocado' },
  { id: 'monto-equivocado',    texto: 'Monto equivocado' },
  { id: 'duplicado',           texto: 'Se registró dos veces' },
  { id: 'otro',                texto: 'Otro' },
]
export const textoMotivo = id => MOTIVOS_DE_AJUSTE.find(m => m.id === id)?.texto ?? id

/**
 * Qué es el movimiento que mete el ajuste. El corte lo pone en su lista por
 * esta categoría, no por cómo esté escrito el concepto; `tipo` es el que usa
 * el flujo de efectivo para sumar entradas y salidas.
 */
export const CATEGORIAS_DE_AJUSTE = {
  gasto:    { texto: 'Gasto',         tipo: 'gasto' },
  sueldo:   { texto: 'Sueldo',        tipo: 'adelanto' },
  comision: { texto: 'Comisión',      tipo: 'otra-salida' },
  entrada:  { texto: 'Otra entrada',  tipo: 'entrada' },
}

/** Las acciones: añadir lo que faltó, anular lo que sobra, o sustituirlo por lo correcto. */
export const ACCIONES_DE_AJUSTE = {
  agregar:   'Movimiento agregado',
  anular:    'Movimiento anulado',
  sustituir: 'Movimiento sustituido',
}

/**
 * La huella de cada movimiento, en el orden en que llegan.
 *
 * 🔒 Escrita dos veces a la fuerza —también en `backend/src/correcciones.js`,
 * que comprueba que lo que se anula existe—. `backend/test/correcciones.test.js`
 * las pone frente a frente: si se separan, un ajuste guardado por el servidor
 * no encontraría su movimiento en la pantalla.
 */
export function huellaDe(m, repeticion = 0) {
  if (m?.id) return `p:${m.id}`
  return `e:${m?.f ?? ''}|${m?.tipo ?? ''}|${num(m?.monto)}|${String(m?.concepto ?? '').trim()}|${repeticion}`
}

/** Los movimientos con su `ref`. Dos idénticos el mismo día se distinguen por cuál va primero. */
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

/** El movimiento que mete un ajuste, listo para sumarse como cualquier otro. */
export function movimientoDeAjuste(c) {
  const cat = CATEGORIAS_DE_AJUSTE[c?.nuevo?.categoria] ?? CATEGORIAS_DE_AJUSTE.gasto
  return {
    f: c.nuevo.f, tipo: cat.tipo, categoria: c.nuevo.categoria,
    monto: num(c.nuevo.monto), concepto: String(c.nuevo.concepto ?? ''),
    origen: 'ajuste', ref: `a:${c.id}`, correccion: c.id,
  }
}

/**
 * Aplica los ajustes vigentes a los movimientos de una plaza.
 *
 * Devuelve los movimientos que CUENTAN —sin los anulados y con los añadidos—,
 * más los ajustes con su estado: `aplicado`, `deshecho` o `huerfano`.
 */
export function aplicarCorrecciones(movimientos = [], correcciones = []) {
  const lista = conHuella(movimientos)
  const porRef = new Map(lista.map(m => [m.ref, m]))
  const fuera = new Set()
  const agregados = []
  const estado = []

  const ordenadas = [...(Array.isArray(correcciones) ? correcciones : Object.values(correcciones ?? {}))]
    .filter(c => c && c.id)
    .sort((a, b) => String(a.cuando ?? '').localeCompare(String(b.cuando ?? '')))

  for (const c of ordenadas) {
    if (c.deshecho) { estado.push({ ...c, estado: 'deshecho' }); continue }
    if (c.accion === 'anular' || c.accion === 'sustituir') {
      const original = porRef.get(c.ref)
      // El original ya no está —la tienda lo corrigió en su caja— o ya lo
      // tocó otro ajuste: no se aplica nada, ni la mitad.
      if (!original || fuera.has(c.ref)) { estado.push({ ...c, estado: 'huerfano' }); continue }
      fuera.add(c.ref)
    }
    if ((c.accion === 'agregar' || c.accion === 'sustituir') && c.nuevo) agregados.push(movimientoDeAjuste(c))
    estado.push({ ...c, estado: 'aplicado' })
  }

  return {
    movimientos: [...lista.filter(m => !fuera.has(m.ref)), ...agregados],
    correcciones: estado,
  }
}

/** Los ajustes de una semana, del más reciente al más viejo. */
export function correccionesDeSemana(correcciones = [], lunes) {
  return (correcciones ?? [])
    .filter(c => c.semana === lunes)
    .sort((a, b) => String(b.cuando ?? '').localeCompare(String(a.cuando ?? '')))
}

/** Lo que mueve un ajuste en lo esperado en caja: + sube, − baja. */
export function efectoDe(c) {
  const signo = m => (m?.tipo === 'entrada' || m?.categoria === 'entrada' ? 1 : -1)
  let e = 0
  if ((c.accion === 'anular' || c.accion === 'sustituir') && c.original) e -= signo(c.original) * num(c.original.monto)
  if ((c.accion === 'agregar' || c.accion === 'sustituir') && c.nuevo) {
    e += signo({ categoria: c.nuevo.categoria }) * num(c.nuevo.monto)
  }
  return Math.round(e * 100) / 100
}
