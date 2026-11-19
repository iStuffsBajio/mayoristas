// Lo editado de cada modelo desde las tablas, y la bitácora de cambios.
//
// Las reglas del servidor viven en `backend/src/ediciones.js`; las dos listas
// de tipos tienen que decir lo mismo y `backend/test/ediciones.test.js` las
// pone frente a frente.
//
// Un nombre, código, costo o precio editado aquí NO cambia el dato: Eleventa
// manda y el inventario se regenera del respaldo. Es una instrucción que queda
// PENDIENTE y se cierra sola cuando el respaldo ya trae el valor, igual que la
// ✕ (`ajustes.js`). La nota es otra cosa: es para no olvidar qué hacer, y no
// está pendiente de nada.

const limpio = c => String(c ?? '').trim().toUpperCase()

/** Lo que se puede editar, con su nombre en pantalla. `plaza`: es de una tienda. */
export const TIPOS_EDICION = {
  nota:    { plaza: false, texto: 'Nota' },
  nombre:  { plaza: false, texto: 'Nombre correcto' },
  codigo:  { plaza: false, texto: 'Código correcto' },
  costo:   { plaza: false, texto: 'Costo (bodega)' },
  precio:  { plaza: true,  texto: 'Precio al público' },
  mayoreo: { plaza: true,  texto: 'Precio de mayoreo' },
}

/** Los tipos que sólo viven en la bitácora (su estado está en otro sitio). */
export const TEXTO_TIPO_BITACORA = {
  ...Object.fromEntries(Object.entries(TIPOS_EDICION).map(([k, v]) => [k, v.texto])),
  cantidad: 'Cantidad a pedir',
  baja: 'Dar de baja',
  descontinuado: 'Descontinuado en bodega',
}

/** Las plazas con lista de precios propia. Bodega no vende: su precio no sirve. */
export const PLAZAS_DE_PRECIO = ['leon', 'san-luis', 'aguascalientes', 'torreon', 'ferias']

export const ESTADOS_EDICION = {
  NOTA: 'nota',
  PENDIENTE: 'pendiente',   // falta hacerlo en Eleventa
  HECHO: 'hecho',           // el respaldo ya trae el valor
}

const esMonto = t => t === 'costo' || t === 'precio' || t === 'mayoreo'

/** Junta las ediciones de todos: por clave, gana la más reciente. */
export function juntarEdiciones(lista) {
  const out = {}
  for (const e of lista ?? []) {
    const previa = out[e.clave]
    if (!previa || String(e.cuando) > String(previa.cuando)) out[e.clave] = e
  }
  return out
}

/** Las ediciones de cada código. */
export function porCodigo(ediciones) {
  const m = new Map()
  for (const e of Object.values(ediciones ?? {})) {
    const c = limpio(e.codigo)
    if (!m.has(c)) m.set(c, [])
    m.get(c).push(e)
  }
  return m
}

const productoDe = (inv, codigo) => (inv?.productos ?? []).find(p => limpio(p.Codigo) === limpio(codigo))

/**
 * ¿Ya está hecho en Eleventa? Se LEE del respaldo, no lo marca nadie: si no se
 * detecta que se corrigió, sigue pendiente.
 *
 * `inventarios` es { slug: inventario }, bodega incluida.
 */
export function estadoEdicion(e, inventarios) {
  if (e.tipo === 'nota') return ESTADOS_EDICION.NOTA
  const invs = inventarios ?? {}
  const hecho = (() => {
    if (e.tipo === 'nombre') {
      const donde = Object.values(invs).map(inv => productoDe(inv, e.codigo)).filter(Boolean)
      return donde.length > 0 && donde.every(p => limpio(p.Producto).replace(/\s+/g, ' ') === limpio(e.valor))
    }
    if (e.tipo === 'codigo') {
      const viejo = Object.values(invs).some(inv => productoDe(inv, e.codigo))
      const nuevo = Object.values(invs).some(inv => productoDe(inv, e.valor))
      return nuevo && !viejo
    }
    if (e.tipo === 'costo') return Number(productoDe(invs.bodega, e.codigo)?.Costo) === Number(e.valor)
    if (e.tipo === 'precio') return Number(productoDe(invs[e.plaza], e.codigo)?.Precio) === Number(e.valor)
    if (e.tipo === 'mayoreo') return Number(productoDe(invs[e.plaza], e.codigo)?.Mayoreo) === Number(e.valor)
    return false
  })()
  return hecho ? ESTADOS_EDICION.HECHO : ESTADOS_EDICION.PENDIENTE
}

/** Cómo se lee un valor en pantalla y en el Excel. */
export function textoValor(tipo, valor) {
  if (valor === null || valor === undefined || valor === '') return '—'
  if (esMonto(tipo)) return `$${Number(valor).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  return String(valor)
}

/** «Precio al público (León)», «Nota»… */
export function textoTipo(tipo, plaza, nombrePlaza = p => p) {
  const base = TEXTO_TIPO_BITACORA[tipo] ?? tipo
  return plaza ? `${base} (${nombrePlaza(plaza)})` : base
}

/**
 * Lo editado de un código en una línea, para la columna «Cambios» de los
 * Excel de cada pantalla. Lo hecho ya no se repite: lo que importa es lo que
 * falta.
 */
export function resumenDeCodigo(lista, inventarios, nombrePlaza) {
  return (lista ?? [])
    .filter(e => e.tipo !== 'nota')
    .map(e => {
      const st = estadoEdicion(e, inventarios)
      return `${textoTipo(e.tipo, e.plaza, nombrePlaza)}: ${textoValor(e.tipo, e.valor)}${st === ESTADOS_EDICION.HECHO ? ' (ya en Eleventa)' : ' (pendiente en Eleventa)'}`
    })
    .join(' · ')
}

/** La nota de un código, o ''. */
export const notaDe = lista => (lista ?? []).find(e => e.tipo === 'nota')?.valor ?? ''

/**
 * Lo que hay que mandar al servidor desde el formulario: sólo lo que cambió,
 * comparado contra lo que había. `actual` es { clave → valor } y `formulario`
 * igual. Devuelve [{ tipo, plaza, valor }].
 */
export function cambiosDelFormulario(actual, formulario) {
  const out = []
  for (const [clave, v] of Object.entries(formulario ?? {})) {
    const [tipo, plaza] = clave.split('@')
    const antes = actual?.[clave] ?? ''
    const ahora = String(v ?? '').trim()
    const igual = esMonto(tipo) && antes !== '' && ahora !== ''
      ? Number(String(ahora).replace(/[$,\s]/g, '')) === Number(antes)
      : String(antes).trim() === ahora
    if (!igual) out.push({ tipo, ...(plaza ? { plaza } : {}), valor: ahora === '' ? null : ahora })
  }
  return out
}

/**
 * Para los Excel de cada pantalla: una función código → { nota, cambios }.
 * Con ella, cada reporte trae marcado lo que se editó del modelo, al lado del
 * dato —«cuando busco la info en el archivo ya se me olvida lo que debo hacer»—.
 */
export function marcasDe(edicionesPorCodigo, inventarios, nombrePlaza) {
  return codigo => {
    const lista = edicionesPorCodigo?.get(String(codigo ?? '').trim().toUpperCase()) ?? []
    return { nota: notaDe(lista), cambios: resumenDeCodigo(lista, inventarios, nombrePlaza) }
  }
}

/** Las dos columnas que se añaden a una hoja de `hojaDeTabla`. Sin marcas, ninguna. */
export function columnasDeMarcas(marcas, codigoDe = f => f.codigo) {
  if (!marcas) return []
  return [
    { titulo: 'Nota', valor: f => marcas(codigoDe(f)).nota, ancho: 34 },
    { titulo: 'Cambios registrados', valor: f => marcas(codigoDe(f)).cambios, ancho: 46 },
  ]
}
