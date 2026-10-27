// Las fichas de la cola de revision.
//
// Viven fuera del componente para poder probarlas: cada una tiene que traer
// una pregunta contestable con si o no, redactada de modo que el SI sea
// aplicar la propuesta. Si la pregunta se pudiera contestar con «depende», la
// ficha esta mal escrita, y eso no lo detecta ningun compilador.

import { nombreSucursal } from './sucursales.js'
import { MOTIVO } from './anomalias.js'

const pct = (n, total) => (total > 0 ? Math.round((n / total) * 100) : 0)

const lista = xs => (xs.length <= 1
  ? (xs[0] ?? '')
  : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`)

const nombresDe = slugs => lista(slugs.map(nombreSucursal))

/** Un patrón de escritura: una decisión que ordena muchos renglones. */
export function fichaDePatron(p) {
  // Cuántos productos hay que tocar de verdad. Lo trae ya contado
  // `patrones.js` y contarlo otra vez aquí salía mal: `f.b` es la CUENTA de la
  // segunda forma, no la palabra, así que compararla con `p.gana` era siempre
  // falso y el número salía de las plazas equivocadas, sin que nada fallara.
  const conProducto = p.renglones

  // El reparto, en vez de «las demás plazas»: cuando TODAS tienen algo que
  // corregir —y pasa, porque en una costumbre casi siempre quedan rezagados en
  // las otras— «las demás» era una lista vacía y el renglón salía a medias.
  const ganaEsB = p.falta || p.gana === p.b
  const cuantos = f => (p.falta ? f.sin : (ganaEsB ? f.a : f.b))
  const reparto = p.filas
    .filter(f => p.corrigen.includes(f.slug) && cuantos(f) > 0)
    .sort((x, y) => cuantos(y) - cuantos(x))   // primero quien más tiene que corregir
    .map(f => `${nombreSucursal(f.slug)} ${cuantos(f)}`)
    .join(', ')
  const sumaGana = p.filas.reduce((s, f) => s + (ganaEsB ? f.b : f.a), 0)

  const titulo = p.falta
    ? `${nombresDe(p.corrigen)} ${p.corrigen.length === 1 ? 'omite' : 'omiten'} «${p.b}» en el nombre`
    : `El mismo producto se escribe de dos formas: «${p.a}» y «${p.b}»`

  const contexto = p.falta
    ? [
      `${p.codigos.length} códigos llevan «${p.b}» en unas plazas y no en otras`,
      `Falta en ${conProducto} ${conProducto === 1 ? 'nombre' : 'nombres'}: ${reparto}`,
      `El resto del catálogo sí lo lleva: ${sumaGana} productos`,
    ]
    : [
      `«${p.gana}» es la forma mayoritaria: ${sumaGana} productos entre las cinco plazas`,
      `«${p.pierde}» queda en ${conProducto}: ${reparto}`,
      p.alcance === 'catalogo'
        ? 'Se ve en el catálogo entero, no sólo donde los dos códigos chocan: es una costumbre, no un descuido suelto'
        : `Aparece en ${p.codigos.length} códigos`,
    ]

  const cabeceras = p.falta
    ? ['Plaza', `Con «${p.b}»`, 'Sin ella']
    : ['Plaza', `«${p.a}»`, `«${p.b}»`]

  const filas = p.filas.map(f => (p.falta
    ? [nombreSucursal(f.slug), String(f.b), f.sin ? String(f.sin) : '—']
    : [nombreSucursal(f.slug),
       f.a ? `${f.a} (${pct(f.a, f.total)}%)` : '0',
       f.b ? `${f.b} (${pct(f.b, f.total)}%)` : '0']))

  return {
    id: p.id,
    bloque: 'nombre',
    chip: `Una respuesta ordena ${p.renglones} renglones`,
    titulo,
    contexto,
    tabla: { cabeceras, filas },
    plazas: p.corrigen,
    pregunta: p.falta
      ? `¿Debe llevar «${p.b}» también en ${nombresDe(p.corrigen)}?`
      : `¿El nombre bueno es «${p.gana}»?`,
    siHacer: p.falta
      ? `Añadir «${p.b}» a ${conProducto} nombres: ${reparto}.`
      : `Cambiar «${p.pierde}» por «${p.gana}» en ${conProducto} productos: ${reparto}.`,
    noHacer: 'Entonces el nombre bueno es otro y hay que decir cuál.',
    noPide: 'Cuál es el nombre que vale y por qué',
    peso: p.renglones,
  }
}

/** Los descontinuados sin una sola pieza: la respuesta es la misma para todos. */
export function fichaDeMuertos(muertos) {
  const porPlaza = {}
  for (const h of muertos) {
    for (const s of Object.keys(h.plazas ?? {})) porPlaza[s] = (porPlaza[s] ?? 0) + 1
  }
  const filas = Object.entries(porPlaza).map(([s, n]) => [nombreSucursal(s), String(n)])

  return {
    id: 'cod|muertos',
    bloque: 'codigo',
    chip: `${muertos.length} códigos de una vez`,
    titulo: `${muertos.length} códigos sin existencia y sin de dónde resurtir`,
    contexto: [
      'Bodega no tiene ninguno de estos códigos',
      'Llevan medio año o más sin un solo movimiento',
      'No queda existencia en ninguna plaza: no hay nada que agotar',
    ],
    tabla: filas.length ? { cabeceras: ['Plaza', 'Códigos'], filas } : null,
    detalle: muertos.map(h => `${h.codigo} · ${h.producto}`),
    plazas: Object.keys(porPlaza),
    pregunta: `¿Se eliminan los ${muertos.length} códigos del catálogo?`,
    siHacer: `Borrar los ${muertos.length} códigos en cada plaza donde sigan dados de alta.`,
    noHacer: 'Entonces alguno se queda, y hay que decir cuál y por qué.',
    noPide: 'Cuáles se quedan y de dónde se van a resurtir',
    peso: muertos.length,
  }
}

/** Un código huérfano: la alerta sensible, de una en una. */
export function fichaDeCodigo(h) {
  const slugs = Object.keys(h.plazas)
  const donde = slugs.length
    ? `${slugs.length} ${slugs.length === 1 ? 'plaza lo tiene' : 'plazas lo tienen'}: `
      + Object.entries(h.plazas).map(([s, n]) => `${nombreSucursal(s)} ${n} pz`).join(', ')
    : 'Ninguna plaza tiene existencia'

  const filas = Object.entries(h.plazas).map(([s, n]) => [nombreSucursal(s), `${n} pz`])
  const comun = {
    id: `cod|${h.codigo}`,
    bloque: 'codigo',
    chip: `${h.codigo} · ${h.piezas} pz · se movió por última vez ${h.ultimo ?? 'sin registro'}`,
    tabla: filas.length ? { cabeceras: ['Plaza', 'Existencia'], filas } : null,
    plazas: slugs,
    codigo: h.codigo,
    producto: h.producto,
    peso: h.piezas,
  }

  if (h.motivo === MOTIVO.DUPLICADO) {
    const c = h.cubiertoPor
    return {
      ...comun,
      titulo: 'Dos códigos para el mismo teléfono',
      contexto: [
        donde,
        `Bodega no tiene ${h.codigo}`,
        `Bodega sí tiene ${c.codigo} — ${c.producto}, para el mismo teléfono y el mismo tipo de funda`,
      ],
      pregunta: `¿${h.codigo} y ${c.codigo} son el mismo producto?`,
      siHacer: `Cambiar ${h.codigo} por ${c.codigo} en ${nombresDe(slugs)} y dar de baja ${h.codigo}.`,
      noHacer: `Son productos distintos: bodega tiene que dar de alta ${h.codigo}.`,
      noPide: 'En qué se diferencian, para no volver a proponerlo',
    }
  }

  if (h.motivo === MOTIVO.SIN_ALTA) {
    return {
      ...comun,
      titulo: 'Se vende y bodega no lo tiene de alta',
      contexto: [
        donde,
        'Bodega no tiene este código ni ningún otro para ese teléfono con ese tipo de funda',
        `Se movió por última vez ${h.ultimo ?? 'sin registro'}`,
      ],
      pregunta: '¿Se va a seguir manejando este modelo?',
      siHacer: `Dar de alta ${h.codigo} en bodega, con este mismo código.`,
      noHacer: 'Dejar de surtirlo: agotar lo que queda y dar de baja el código.',
      noPide: 'Por qué se deja de manejar',
    }
  }

  const quedan = h.piezas > 0
  return {
    ...comun,
    titulo: 'Descontinuado: no hay de dónde resurtirlo',
    contexto: [
      donde,
      `Lleva ${h.diasSinMover ?? '—'} días sin moverse`,
      'Bodega no lo tiene, así que no hay de dónde reponerlo',
    ],
    pregunta: quedan
      ? `¿Se da de baja en cuanto se agoten las ${h.piezas} piezas que quedan?`
      : '¿Se elimina el código del catálogo?',
    siHacer: quedan
      ? `Vender lo que queda y luego borrar ${h.codigo} en ${nombresDe(slugs)}.`
      : `Borrar ${h.codigo} del catálogo de cada plaza.`,
    noHacer: 'Entonces se sigue manejando, y hace falta de dónde resurtirlo.',
    noPide: 'De dónde se va a resurtir, o por qué se mantiene',
  }
}

/** Un nombre suelto que ningún patrón explica. */
export function fichaDeNombre(n) {
  if (n.fuente === 'conflicto') {
    const [a, b] = n.fuera
    return {
      id: `nom|${n.codigo}`,
      bloque: 'nombre',
      chip: `${n.codigo} · las dos referencias se contradicen`,
      titulo: 'Bodega y León no le ponen el mismo nombre',
      contexto: [
        `${nombreSucursal(a.slug)} lo tiene como «${a.nombre}»`,
        `${nombreSucursal(b.slug)} lo tiene como «${b.nombre}»`,
        'Las dos son referencia del catálogo, así que no hay contra cuál corregir a las demás',
      ],
      tabla: {
        cabeceras: ['Plaza', 'Lo que tiene escrito'],
        filas: n.fuera.map(f => [nombreSucursal(f.slug), f.nombre]),
      },
      plazas: n.fuera.map(f => f.slug),
      pregunta: `¿El nombre bueno es el de ${nombreSucursal(a.slug)}: «${a.nombre}»?`,
      siHacer: `Corregir ${nombreSucursal(b.slug)} a «${a.nombre}».`,
      noHacer: `Entonces vale el de ${nombreSucursal(b.slug)}, u otro distinto.`,
      noPide: 'Cuál es el nombre que vale y por qué',
      peso: 0,
    }
  }

  return {
    id: `nom|${n.codigo}`,
    bloque: 'nombre',
    chip: `${n.codigo} · el nombre apunta a otro teléfono`,
    titulo: 'El nombre no es sólo otra forma de escribirlo',
    contexto: [
      `El catálogo (${n.fuente}) lo llama «${n.referencia}»`,
      ...n.fuera.map(f => `${nombreSucursal(f.slug)} lo llama «${f.nombre}»`),
      'La diferencia no es de escritura: nombra otro aparato o lleva una errata',
    ],
    tabla: {
      cabeceras: ['Plaza', 'Lo que tiene escrito'],
      filas: [['Catálogo', n.referencia], ...n.fuera.map(f => [nombreSucursal(f.slug), f.nombre])],
      destacar: 0,
    },
    plazas: n.fuera.map(f => f.slug),
    pregunta: `¿El nombre bueno es «${n.referencia}»?`,
    siHacer: `Corregir el nombre en ${nombresDe(n.fuera.map(f => f.slug))}.`,
    noHacer: 'Entonces el bueno es otro y hay que decir cuál.',
    noPide: 'Cuál es el nombre que vale y por qué',
    peso: 0,
  }
}
