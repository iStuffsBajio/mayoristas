// El mismo código escrito distinto en cada plaza.
//
// Un código es la clave estable de un producto; el nombre se teclea a mano en
// cada caja. Con cinco cajas, el mismo SGA07T acaba siendo «GALAXY A07 TPU
// CASE» en cuatro sitios y «SAMSUNG A07 TPU CASE» en el quinto. Son 266
// códigos, así que no es una rareza.
//
// ── Quién manda ─────────────────────────────────────────────────────────────
//
// **Bodega y León** son la referencia: bodega lleva el catálogo maestro y León
// es la plaza que mejor lo mantiene. Cuando los dos coinciden, ése es el
// nombre bueno y lo demás se corrige.
//
// Hizo falta que fueran los DOS porque bodega sola no basta. Tiene erratas
// propias: escribió «GALAXYA A52» con una letra de más, y «GOOGLE PIXEL 10 PRO
// XL TPU» sin la palabra CASE que las cuatro plazas sí ponen. Tomarla como
// única autoridad convertía sus erratas en la regla.
//
// Si los dos se contradicen, eso mismo es el hallazgo: no se corrige a nadie
// sin que una persona decida cuál de las dos referencias vale.
//
// Sin ninguna de las dos, decide la mayoría de las plazas restantes. Y si hay
// empate no se señala a nadie: no hay criterio para decir quién se equivoca.
//
// ── No todas las diferencias son errores ────────────────────────────────────
//
// Esto obligó a clasificarlas en vez de listarlas a secas:
//
//   SGA17T  bodega   «GALAXY A17 TPU CASE»
//           León     «GALAXY A17/A26/A27 TPU CASE»
//
// León no se equivocó: sabe que esa funda sirve para tres teléfonos y bodega
// no lo tiene anotado. Marcarlo como «error de León» es al revés, y además esa
// información hace falta para proponer alternativas.

const MAYUS = s => String(s ?? '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Sin espacios de más ni signos sueltos: «A56 / A36» y «A56/A36» son lo mismo. */
const sinFormato = s => MAYUS(s).replace(/\s*\/\s*/g, '/').replace(/[^A-Z0-9/]+/g, ' ').replace(/\s+/g, ' ').trim()

/** Además, con las dos formas de nombrar cada marca unificadas. */
const sinMarca = s => sinFormato(s).replace(/\bGALAXY\b/g, 'SAMSUNG').replace(/\bPOCCO\b/g, 'POCO')

/**
 * Los teléfonos que lista un nombre: «A56/A36/A37» son tres.
 *
 * Antes se quita lo que describe la FUNDA, porque «3 IN 1» aporta dos
 * números que no son teléfonos y falseaban la cuenta.
 */
// «PLUS» NO entra: es parte del nombre del teléfono —X5C PLUS, iPhone 15
// Plus—, no un tipo de funda.
const TIPO_FUNDA = /\b(TPU|HARD|DUO|SMART|CASE|CASE2|3 ?EN ?1|3 ?IN ?1|MILITAR|TRANSPARENTE|CRISTAL|GLASS|LAMINA|FUNDA|PROTECTOR|USO RUDO|ARMOR|CLEAR)\b/g
const modelosDe = s => new Set(
  sinMarca(s).replace(TIPO_FUNDA, ' ').split(/[\s/]+/).filter(t => /\d/.test(t)))

/** Las plazas que mandan, en orden. */
export const REFERENCIAS = ['bodega', 'leon']

export const CLASE = {
  FORMATO:        'formato',
  MARCA:          'marca',
  COMPATIBILIDAD: 'compatibilidad',
  OTRO:           'otro',
}

const PESO = { [CLASE.FORMATO]: 0, [CLASE.MARCA]: 1, [CLASE.COMPATIBILIDAD]: 2, [CLASE.OTRO]: 3 }

/**
 * En qué se diferencian dos nombres del mismo código.
 *
 * Va de lo más inocuo a lo más serio: si quitando los espacios ya son
 * iguales, no hace falta mirar más.
 */
export function claseDeDiferencia(a, b) {
  if (sinFormato(a) === sinFormato(b)) return CLASE.FORMATO
  if (sinMarca(a) === sinMarca(b)) return CLASE.MARCA

  // Uno nombra más teléfonos que el otro y los contiene todos: no es un error
  // de escritura, es que uno sabe algo que el otro no.
  const ma = modelosDe(a), mb = modelosDe(b)
  const contiene = (x, y) => y.size > 0 && [...y].every(t => x.has(t))
  if (ma.size !== mb.size && (contiene(ma, mb) || contiene(mb, ma))) return CLASE.COMPATIBILIDAD

  return CLASE.OTRO
}

/**
 * Códigos escritos distinto según la plaza, con cuál es el nombre bueno.
 *
 * `inventarios` es { slug: json } de TODAS las plazas, bodega incluida.
 */
export function discrepanciasDeNombre({ inventarios }) {
  const porCodigo = new Map()

  for (const [slug, inv] of Object.entries(inventarios ?? {})) {
    for (const p of inv?.productos ?? []) {
      const c = String(p.Codigo ?? '').trim().toUpperCase()
      const n = String(p.Producto ?? '').trim()
      if (!c || !n) continue
      if (!porCodigo.has(c)) porCodigo.set(c, { codigo: c, plazas: {} })
      porCodigo.get(c).plazas[slug] = n
    }
  }

  const out = []

  for (const e of porCodigo.values()) {
    const plazas = Object.entries(e.plazas)
    if (plazas.length < 2) continue
    if (new Set(plazas.map(([, n]) => MAYUS(n))).size === 1) continue

    const refs = REFERENCIAS.filter(s => e.plazas[s])

    // ── La compatibilidad no se discute: gana quien liste más ───────────
    //
    // Si bodega dice que el MAGIC 7 LITE sirve también para el X9C, bodega
    // tiene razón; si en otro código es León quien lista más, es al revés.
    // No es que una se equivoque: es que a las demás les falta la
    // actualización.
    //
    // Esto resuelve solo la mayoría de los choques entre las dos
    // referencias, que si no acababan todos en «decidir a mano».
    // Se compara entre NOMBRES distintos, no entre plazas. Si tres plazas
    // escriben el mismo «HONOR X6/X6S», eso es un solo nombre: exigir que una
    // plaza tuviera más que todas las demás dejaba sin resolver justo los
    // casos en que la mayoría ya tiene la compatibilidad bien puesta.
    const porNombre = new Map()
    for (const [slug, nombre] of plazas) {
      const k = sinMarca(nombre)
      if (!porNombre.has(k)) porNombre.set(k, { slug, nombre, n: modelosDe(nombre).size })
    }
    const masCompleto = [...porNombre.values()].sort((a, b) => b.n - a.n)
    const hayGanador = masCompleto.length > 1 && masCompleto[0].n > masCompleto[1].n

    let referencia = null
    let fuente = null

    if (hayGanador && plazas.some(([, n]) => claseDeDiferencia(n, masCompleto[0].nombre) === CLASE.COMPATIBILIDAD)) {
      referencia = masCompleto[0].nombre
      fuente = `compatibilidad:${masCompleto[0].slug}`
    } else if (refs.length === 2 && sinMarca(e.plazas[refs[0]]) !== sinMarca(e.plazas[refs[1]])) {
      // Se compara con `sinMarca`, no en crudo. «GALAXY A07» y «SAMSUNG A07»
      // son el mismo producto: bodega escribe GALAXY en sus 192 productos
      // Samsung y las cuatro tiendas escriben SAMSUNG en el 92-98% de los
      // suyos. Tratarlo como un choque entre referencias convertía una
      // convención distinta en 171 decisiones que nadie tiene que tomar.
      // Las dos referencias se contradicen y no es cuestión de compatibilidad:
      // eso sí es el hallazgo, y no se corrige a nadie hasta que una persona
      // decida cuál vale.
      out.push({
        codigo: e.codigo,
        referencia: null,
        fuente: 'conflicto',
        corregirEn: 'referencias',
        severidad: 'media',
        fuera: refs.map(slug => ({ slug, nombre: e.plazas[slug], clase: claseDeDiferencia(e.plazas[refs[0]], e.plazas[refs[1]]) })),
        clase: claseDeDiferencia(e.plazas[refs[0]], e.plazas[refs[1]]),
      })
      continue
    } else {
      referencia = refs.length ? e.plazas[refs[0]] : null
      fuente = refs.length === 2 ? 'bodega+leon' : refs[0] ?? null
    }

    if (!referencia) {
      // Sin referencia, decide la mayoría; con empate no se señala a nadie.
      const cuenta = new Map()
      for (const [, n] of plazas) cuenta.set(MAYUS(n), (cuenta.get(MAYUS(n)) ?? 0) + 1)
      const top = Math.max(...cuenta.values())
      if ([...cuenta.values()].filter(v => v === top).length > 1) continue
      const ganador = [...cuenta.entries()].find(([, v]) => v === top)[0]
      referencia = plazas.find(([, n]) => MAYUS(n) === ganador)[1]
      fuente = 'mayoria'
    }

    // Cuando manda la compatibilidad, la referencia puede ser cualquier plaza,
    // así que se compara contra ella y no se exceptúa a nadie.
    const exentas = fuente?.startsWith('compatibilidad') ? [masCompleto[0].slug] : refs

    const fuera = plazas
      .filter(([slug, n]) => !exentas.includes(slug) && MAYUS(n) !== MAYUS(referencia))
      .map(([slug, nombre]) => ({ slug, nombre, clase: claseDeDiferencia(nombre, referencia) }))

    if (!fuera.length) continue

    // La clase del renglón es la más seria de sus diferencias.
    const clase = fuera.reduce((a, f) => (PESO[f.clase] > PESO[a] ? f.clase : a), CLASE.FORMATO)

    // Jerarquía: un nombre nunca es un error grave. Lo grave son los códigos,
    // que van en `anomalias.js`. Aquí lo más serio es un nombre que apunta a
    // OTRO teléfono; lo demás es pedir una corrección de escritura.
    const severidad = clase === CLASE.OTRO ? 'media' : 'baja'

    out.push({ codigo: e.codigo, referencia, fuente, corregirEn: 'sucursal', severidad, fuera, clase })
  }

  // Lo más serio primero, y los conflictos de referencia por delante de todo:
  // mientras no se resuelvan, no hay nombre bueno contra el que corregir.
  const orden = x => (x.fuente === 'conflicto' ? -1 : 3 - PESO[x.clase])
  return out.sort((a, b) => orden(a) - orden(b) || a.codigo.localeCompare(b.codigo))
}

/**
 * Cuántas diferencias pone cada plaza, y de qué tipo.
 *
 * Sirve para ver lo que un listado de cientos de renglones esconde: que una
 * plaza entera escriba «SAMSUNG» donde las demás escriben «GALAXY» no son
 * doscientos errores sueltos, es una costumbre que se corrige de una vez.
 */
export function porPlaza(discrepancias) {
  const r = {}
  for (const d of discrepancias ?? []) {
    for (const f of d.fuera) {
      const e = (r[f.slug] ??= { slug: f.slug, total: 0 })
      e.total++
      e[f.clase] = (e[f.clase] ?? 0) + 1
    }
  }
  return Object.values(r).sort((a, b) => b.total - a.total)
}
