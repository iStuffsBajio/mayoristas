// Una costumbre, no doscientos errores.
//
// `nombres.js` encuentra códigos escritos distinto. Mirados de uno en uno son
// 268 renglones y nadie empieza. Mirados juntos, casi todos son la MISMA
// decisión repetida:
//
//     Bodega      GALAXY    192 (100%)   SAMSUNG     0
//     León        GALAXY     15 (8%)     SAMSUNG   173 (92%)
//     San Luis    GALAXY      4 (2%)     SAMSUNG   204 (98%)
//
// Eso no son 171 correcciones: es una convención de bodega contra otra de las
// tiendas, y se resuelve con una respuesta. Este módulo encuentra ese tipo de
// cambio de palabra y lo presenta como un solo hallazgo, con la cuenta de cada
// plaza para poder decidir mirando el reparto real.
//
// ── Cómo se encuentra ───────────────────────────────────────────────────────
//
// Para cada código escrito de dos formas, se comparan palabra por palabra. Si
// toda la diferencia es UNA palabra por OTRA —GALAXY por SAMSUNG, POCCO por
// POCO— eso es un cambio. Si lo único que cambia es que a un lado le falta una
// palabra —CASE, PLUS—, también, y se anota como palabra que sobra o falta.
//
// Un cambio que aparece en menos de `MINIMO_CODIGOS` códigos no es una
// costumbre: es un caso suelto y se revisa solo, con su propia ficha.

const MAYUS = s => String(s ?? '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const palabras = s => MAYUS(s).replace(/[^A-Z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean)

/** Por debajo de esto es un caso suelto, no una costumbre. */
export const MINIMO_CODIGOS = 3

/**
 * La palabra que cambia entre dos nombres, o null si cambia más de una.
 *
 * Devuelve `[a, b]` con las dos formas, o `[null, b]` cuando a un lado le
 * falta la palabra. El orden es alfabético para que el mismo cambio tenga
 * siempre la misma identidad, lo mire quien lo mire.
 */
export function cambioEntre(nombreA, nombreB) {
  const a = palabras(nombreA), b = palabras(nombreB)
  const sa = new Set(a), sb = new Set(b)
  const soloA = a.filter(t => !sb.has(t))
  const soloB = b.filter(t => !sa.has(t))

  if (soloA.length === 1 && soloB.length === 1) return [soloA[0], soloB[0]].sort()
  if (soloA.length === 0 && soloB.length === 1) return [null, soloB[0]]
  if (soloB.length === 0 && soloA.length === 1) return [null, soloA[0]]
  return null
}

/**
 * Los cambios de palabra que se repiten, con cómo los reparte cada plaza.
 *
 * `inventarios` es { slug: json } de todas las plazas, bodega incluida.
 */
export function patronesDeEscritura({ inventarios }) {
  const plazas = Object.entries(inventarios ?? {}).filter(([, v]) => v?.productos)
  if (plazas.length < 2) return []

  // Qué nombre le pone cada plaza a cada código.
  const porCodigo = new Map()
  for (const [slug, inv] of plazas) {
    for (const p of inv.productos) {
      const c = String(p.Codigo ?? '').trim().toUpperCase()
      const n = String(p.Producto ?? '').trim()
      if (!c || !n) continue
      if (!porCodigo.has(c)) porCodigo.set(c, {})
      porCodigo.get(c)[slug] = n
    }
  }

  // Cada cambio de palabra, con los códigos donde aparece.
  const cambios = new Map()
  for (const [codigo, enPlazas] of porCodigo) {
    const formas = [...new Set(Object.values(enPlazas).map(MAYUS))]
    if (formas.length < 2) continue
    for (let i = 0; i < formas.length; i++) {
      for (let j = i + 1; j < formas.length; j++) {
        const par = cambioEntre(formas[i], formas[j])
        if (!par) continue
        const id = `${par[0] ?? ''}>${par[1]}`
        if (!cambios.has(id)) cambios.set(id, { id, a: par[0], b: par[1], codigos: new Set() })
        cambios.get(id).codigos.add(codigo)
      }
    }
  }

  const out = []

  for (const c of cambios.values()) {
    if (c.codigos.size < MINIMO_CODIGOS) continue

    // Cuando las dos formas son palabras de verdad, se cuenta en el catálogo
    // entero de cada plaza: así se ve si es una costumbre de la plaza o sólo
    // de estos códigos. Cuando lo que cambia es una palabra que falta, contar
    // el catálogo no dice nada, y se cuenta sólo donde hay choque.
    const enCatalogo = c.a !== null && !/\d/.test(c.a) && !/\d/.test(c.b)
    const codigos = [...c.codigos]

    const filas = []
    for (const [slug, inv] of plazas) {
      const mira = enCatalogo
        ? inv.productos
        : inv.productos.filter(p => codigos.includes(String(p.Codigo ?? '').trim().toUpperCase()))

      let na = 0, nb = 0
      for (const p of mira) {
        const t = new Set(palabras(p.Producto))
        if (c.a !== null && t.has(c.a)) na++
        if (t.has(c.b)) nb++
      }
      const total = enCatalogo ? na + nb : mira.length
      if (!total) continue
      filas.push({ slug, a: na, b: nb, total, sin: enCatalogo ? 0 : total - nb })
    }

    if (filas.length < 2) continue

    // Gana la forma que más producto tiene detrás. No es que una plaza mande:
    // es que lo razonable es mover a la minoría, no a la mayoría.
    const totalA = filas.reduce((s, f) => s + f.a, 0)
    const totalB = filas.reduce((s, f) => s + f.b, 0)
    const gana = c.a === null ? c.b : (totalB >= totalA ? c.b : c.a)
    const pierde = c.a === null ? null : (gana === c.b ? c.a : c.b)

    // Las plazas que tendrían que cambiar algo.
    const corrigen = filas.filter(f =>
      c.a === null ? f.sin > 0 : (gana === c.b ? f.a > 0 : f.b > 0))

    if (!corrigen.length) continue

    out.push({
      id: `pat|${c.id}`,
      a: c.a, b: c.b,
      gana, pierde,
      falta: c.a === null,
      alcance: enCatalogo ? 'catalogo' : 'codigos',
      codigos,
      filas: filas.sort((x, y) => (y.a + y.b) - (x.a + x.b)),
      corrigen: corrigen.map(f => f.slug),
      // Cuántos renglones de producto limpia esta sola decisión.
      renglones: corrigen.reduce((s, f) =>
        s + (c.a === null ? f.sin : (gana === c.b ? f.a : f.b)), 0),
    })
  }

  return out.sort((x, y) => y.renglones - x.renglones)
}
