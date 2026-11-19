// Lo que se edita de un modelo desde las tablas del panel, y la bitácora de
// TODO lo que se cambia.
//
// Lo pidió el dueño el 2026-11-19: «en todas las secciones de la página me
// gustaría que las tablas y menús pueda editar cosas y todo lo que edite se
// registre en el reporte». Bajaba un Excel, y cuando volvía a él ya no se
// acordaba de qué tenía que hacer: la corrección tiene que poder hacerse en el
// momento, donde se ve el dato.
//
// ── Una capa al lado, no una edición ────────────────────────────────────────
//
// Igual que los ajustes: el inventario se regenera del respaldo de Eleventa
// varias veces al día, así que nada se escribe encima. Lo editado se guarda en
// `ediciones/<quien>.json` y se aplica al leer. Un nombre, código, costo o
// precio corregido aquí es una INSTRUCCIÓN para Eleventa —queda pendiente— y
// se cierra solo cuando el respaldo ya trae el valor.
//
// ── La bitácora la escribe el servidor ─────────────────────────────────────
//
// `bitacora/<quien>.json`. El autor y la hora salen de la sesión, no de lo que
// mande el navegador: un registro que se puede escribir a gusto no prueba nada
// (la misma regla que el historial de Revisar). Y sólo se apunta renglón
// cuando algo CAMBIA: volver a guardar lo mismo llenaría la bitácora de
// renglones iguales, que es otra forma de no tener registro.

/** Quién edita: administración y bodega —bodega es quien sabe el costo—. */
export const PUEDE_EDITAR = new Set(['admin', 'bodega'])

/**
 * Lo que se puede editar de un modelo. `plaza` dice si el valor es de UNA
 * plaza (los precios: cada tienda tiene su lista) o del modelo entero.
 */
export const TIPOS_EDICION = {
  nota:    { plaza: false },   // texto libre: lo que hay que hacer, para no olvidarlo
  nombre:  { plaza: false },   // el nombre como DEBE quedar en Eleventa
  codigo:  { plaza: false },   // el código como debe quedar
  costo:   { plaza: false },   // el costo de bodega (el costo sale de bodega)
  precio:  { plaza: true },    // precio al público de una plaza
  mayoreo: { plaza: true },    // precio de mayoreo de una plaza
}

/** Lo que sólo se APUNTA en la bitácora: su estado vive en otro sitio. */
export const TIPOS_SOLO_BITACORA = new Set(['cantidad'])

export const PLAZAS_DE_PRECIO = new Set(['leon', 'san-luis', 'aguascalientes', 'torreon', 'ferias'])

export const MAX_BITACORA = 5000
export const MAX_EDICIONES = 5000

const texto = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
export const limpiarCodigo = c => String(c ?? '').trim().toUpperCase().slice(0, 60)
export const claveEdicion = (tipo, codigo, plaza = null) =>
  `${tipo}|${limpiarCodigo(codigo)}${plaza ? `|${plaza}` : ''}`

/**
 * Valida un valor. Devuelve `{ valor }` —`null` quiere decir «quitarlo»— o
 * `{ error }`. Un campo vacío es «quitar», NUNCA cero: un costo de cero se
 * leería como «gratis», que es la misma trampa que los precios.
 */
export function validarValor(tipo, crudo) {
  if (crudo === null || crudo === undefined || String(crudo).trim() === '') return { valor: null }
  if (tipo === 'nota') return { valor: texto(crudo, 500) }
  if (tipo === 'nombre') return { valor: texto(crudo, 120).toUpperCase() }
  if (tipo === 'codigo') {
    const v = limpiarCodigo(crudo)
    if (!/^[A-Z0-9][A-Z0-9._-]*$/.test(v)) return { error: 'El código sólo lleva letras, números, punto, guion o guion bajo.' }
    return { valor: v }
  }
  if (tipo === 'costo' || tipo === 'precio' || tipo === 'mayoreo') {
    const n = Number(String(crudo).replace(/[$,\s]/g, ''))
    if (!Number.isFinite(n) || n <= 0) return { error: 'El monto tiene que ser mayor que cero.' }
    if (n > 100000) return { error: 'Ese monto parece un error de tecleo.' }
    return { valor: Math.round(n * 100) / 100 }
  }
  return { error: 'Tipo de cambio desconocido.' }
}

/**
 * Valida una petición entera ANTES de tocar nada: un lote con un cambio malo
 * no deja la mitad guardada.
 */
export function validarEdicion(cuerpo) {
  const codigo = limpiarCodigo(cuerpo?.codigo)
  if (!codigo) return { error: 'Falta el código.' }
  const cambios = Array.isArray(cuerpo?.cambios) ? cuerpo.cambios : []
  if (!cambios.length) return { error: 'No hay nada que guardar.' }
  if (cambios.length > 20) return { error: 'Demasiados cambios en una petición.' }
  const limpios = []
  for (const c of cambios) {
    const tipo = String(c?.tipo ?? '')
    const def = TIPOS_EDICION[tipo]
    if (!def) return { error: `No se puede editar «${tipo}».` }
    let plaza = null
    if (def.plaza) {
      plaza = String(c?.plaza ?? '')
      if (!PLAZAS_DE_PRECIO.has(plaza)) return { error: 'El precio es de una plaza: falta cuál.' }
    }
    const v = validarValor(tipo, c?.valor)
    if (v.error) return { error: v.error }
    limpios.push({ tipo, plaza, valor: v.valor })
  }
  return {
    codigo,
    producto: texto(cuerpo?.producto, 120),
    pantalla: texto(cuerpo?.pantalla, 40),
    nota: texto(cuerpo?.nota, 300),
    cambios: limpios,
  }
}

/**
 * Aplica los cambios al archivo de una persona y devuelve los renglones de
 * bitácora de lo que de verdad cambió. No escribe: quien llama guarda.
 */
export function aplicarEdicion(mias, v, { cuando, idBase = cuando }) {
  const renglones = []
  v.cambios.forEach((c, i) => {
    const clave = claveEdicion(c.tipo, v.codigo, c.plaza)
    const antes = mias[clave]?.valor ?? null
    if (antes === c.valor) return
    if (c.valor === null) delete mias[clave]
    else {
      mias[clave] = {
        clave, tipo: c.tipo, codigo: v.codigo, producto: v.producto,
        ...(c.plaza ? { plaza: c.plaza } : {}),
        valor: c.valor, cuando,
      }
    }
    renglones.push(renglon({
      id: `${idBase}-${i}`, cuando, codigo: v.codigo, producto: v.producto,
      tipo: c.tipo, plaza: c.plaza, antes, despues: c.valor, pantalla: v.pantalla, nota: v.nota,
    }))
  })
  return renglones
}

/** Un renglón de bitácora, con forma fija. */
export function renglon({ id, cuando, codigo, producto = '', tipo, plaza = null, antes = null, despues = null, pantalla = '', nota = '' }) {
  return {
    id, cuando, codigo: limpiarCodigo(codigo), producto: texto(producto, 120), tipo,
    ...(plaza ? { plaza } : {}), antes, despues, pantalla: texto(pantalla, 40), nota: texto(nota, 300),
  }
}

/**
 * Lo que la página APUNTA sin que el servidor guarde su estado: la cantidad a
 * pedir vive en el navegador de quien compra (`ajusteCompra.js`), pero el
 * cambio tiene que quedar en la bitácora igual.
 */
export function validarApunte(cuerpo) {
  const tipo = String(cuerpo?.tipo ?? '')
  if (!TIPOS_SOLO_BITACORA.has(tipo)) return { error: 'Eso no se apunta por aquí.' }
  const codigo = limpiarCodigo(cuerpo?.codigo)
  if (!codigo) return { error: 'Falta el código.' }
  const numero = v => (v === null || v === undefined || v === '' ? null : Number(v))
  const antes = numero(cuerpo?.antes), despues = numero(cuerpo?.despues)
  for (const n of [antes, despues]) {
    if (n !== null && (!Number.isInteger(n) || n < 0 || n > 10000)) return { error: 'Cantidad fuera de rango.' }
  }
  if (antes === despues) return { error: 'No cambió nada.' }
  return { tipo, codigo, producto: texto(cuerpo?.producto, 120), pantalla: texto(cuerpo?.pantalla, 40), antes, despues }
}

/** Añade renglones a la bitácora de una persona, con tope. */
export function anotar(bitacora, renglones) {
  const entradas = [...(Array.isArray(bitacora?.entradas) ? bitacora.entradas : []), ...renglones]
  return { entradas: entradas.slice(-MAX_BITACORA) }
}
