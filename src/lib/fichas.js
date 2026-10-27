// Las fichas de la cola de revision.
//
// Viven fuera del componente para poder probarlas: cada una tiene que traer
// una pregunta contestable con si o no, redactada de modo que el SI sea
// aplicar la propuesta. Si la pregunta se pudiera contestar con «depende», la
// ficha esta mal escrita, y eso no lo detecta ningun compilador.

import { nombreSucursal, SUCURSALES } from './sucursales.js'
import { MOTIVO } from './anomalias.js'

const pct = (n, total) => (total > 0 ? Math.round((n / total) * 100) : 0)

const lista = xs => (xs.length <= 1
  ? (xs[0] ?? '')
  : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`)

const nombresDe = slugs => lista(slugs.map(nombreSucursal))

/**
 * El sitio de cada ficha en la cola: por lo que hay que HACER con ella, no por
 * cuántas piezas tiene.
 *
 * La primera versión ordenaba por piezas paradas y con los lotes salió al
 * revés de lo que el dueño contestó de verdad el 2026-10-27:
 *
 *   · el lote de los 30 códigos sin existencia —una respuesta, cero riesgo,
 *     se ejecuta el mismo día— tiene **0 piezas**, así que caía al último
 *     puesto de los cuatro;
 *   · el de los colores que bodega ya no surte —que mandó **ignorar**— tiene
 *     53 y subía al primero.
 *
 * Así que el orden no lo decide el peso: lo decide la decisión que ya está
 * tomada. De arriba abajo, lo que se ejecuta sin pensar, lo que cuesta dinero
 * cada semana que nadie lo contesta, lo que hay que decidir, lo que sólo se
 * anota y lo que se ignora. Dentro de un mismo paso sí manda el peso.
 *
 * 🔒 Cambiar este orden cambia en qué trabaja la gente primero: se avisa.
 */
export const PASO = {
  BORRAR:    { n: 0, clave: 'borrar',    etiqueta: 'Se borra y se acabó' },
  VIVO:      { n: 1, clave: 'vivo',      etiqueta: 'Se vende y bodega no lo tiene' },
  DUPLICADO: { n: 2, clave: 'duplicado', etiqueta: 'Dos códigos, un teléfono' },
  DECIDIR:   { n: 3, clave: 'decidir',   etiqueta: 'Hay que decidirlo' },
  ANOTAR:    { n: 4, clave: 'anotar',    etiqueta: 'Sólo anotar' },
  IGNORAR:   { n: 5, clave: 'ignorar',   etiqueta: 'Se ignora' },
  NOMBRE:    { n: 6, clave: 'nombre',    etiqueta: 'Orden y limpieza' },
}

// Va en la ficha y no en un mapa aparte del componente: el orden sale de los
// mismos hechos que la redacción, y separarlos deja que uno cambie sin el otro.
const paso = p => ({ orden: p.n, paso: p.clave, etiqueta: p.etiqueta })

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
    ...paso(PASO.NOMBRE),
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

const MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
             'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** «agosto de 2025», o «sin venta conocida» cuando no la hay. */
const cuando = iso => {
  if (!iso) return 'sin venta conocida'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? 'sin venta conocida' : `${MES[d.getMonth()]} de ${d.getFullYear()}`
}

/** Cuánto hace de la venta más reciente del lote entero. */
const masRecienteEn = codigos => {
  const dias = codigos.map(h => h.diasSinVender).filter(d => typeof d === 'number')
  if (!dias.length) return null
  return Math.min(...dias)
}

const meses = d => Math.max(1, Math.round(d / 30))

/**
 * Las redacciones de cada clase de lote.
 *
 * El `sí` tiene que mandar hacer algo concreto sobre TODOS los códigos, y el
 * `no` tiene que pedir exactamente el dato que impide volver a proponerlo:
 * un lote mal contestado se vuelve a proponer entero.
 */
const REDACCION = {
  tono: l => ({
    titulo: `Bodega ya no surte estos ${l.codigos.length} colores`,
    contexto: [
      `Los ${l.codigos.length} son un producto que bodega SÍ tiene, en otro color`,
      'Bodega no tiene ninguno de estos códigos: se quedó sólo con un color',
      `Quedan ${l.piezas} piezas de colores que no se pueden reponer`,
    ],
    pregunta: `¿Bodega dejó de surtir estos ${l.codigos.length} colores?`,
    siHacer: `Vender lo que quede de los ${l.codigos.length} códigos y darlos de baja; el color que sigue vivo es el de bodega.`,
    noHacer: 'Alguno de esos colores se sigue manejando, y hay que decir cuál y si bodega tiene que darlo de alta.',
    noPide: 'Cuáles se siguen manejando y con qué código',
  }),
  'sin-existencia': l => ({
    titulo: `${l.codigos.length} códigos sin existencia y sin de dónde resurtir`,
    contexto: [
      'Bodega no tiene ninguno de estos códigos',
      'No queda existencia en ninguna plaza: no hay nada que agotar',
      'Ocupan sitio en el catálogo y vuelven a salir en cada revisión',
    ],
    pregunta: `¿Se eliminan los ${l.codigos.length} códigos del catálogo?`,
    siHacer: `Borrar los ${l.codigos.length} códigos en cada plaza donde sigan dados de alta.`,
    noHacer: 'Alguno se queda, y hay que decir cuál y por qué.',
    noPide: 'Cuáles se quedan y de dónde se van a resurtir',
  }),
  'varias-plazas': l => {
    const d = masRecienteEn(l.codigos)
    return {
      titulo: `${l.codigos.length} modelos que bodega descontinuó`,
      contexto: [
        `Los ${l.codigos.length} los tienen dos plazas o más, y bodega ninguno`,
        d === null
          ? 'A ninguno se le conoce una venta, descontando los recuentos de inventario'
          : `Ni el más vivo se ha vendido en ${meses(d)} meses, descontando los recuentos de inventario`,
        'Que el mismo código esté en varias cajas y no se mueva en ninguna no es un fallo de captura: es una baja en bodega',
        `Quedan ${l.piezas} piezas paradas`,
      ],
      pregunta: `¿Bodega descontinuó estos ${l.codigos.length} modelos?`,
      siHacer: `Vender lo que quede de los ${l.codigos.length} códigos y darlos de baja en las plazas que los tengan.`,
      noHacer: 'Alguno se sigue comprando, y entonces bodega tiene que darlo de alta.',
      noPide: 'Cuáles se siguen comprando y por qué',
    }
  },
  'una-plaza': l => {
    const d = masRecienteEn(l.codigos)

    // Si casi todos son de una plaza estacional, hay que decirlo. Ferias
    // cierra ocho meses al año, así que «lleva meses sin venderse» ahí no
    // prueba lo mismo que en una tienda abierta todo el año: parte de esos
    // meses la caseta estaba cerrada.
    const estacionales = SUCURSALES.filter(s => s.estacional).map(s => s.slug)
    // `altaEn` lo pone `lotes.js`; aqui se cae a las plazas con existencia por
    // si llega una ficha armada a mano. Sin el respaldo, un lote sin ese campo
    // tumbaba la pantalla entera en vez de salir sin el aviso.
    const dondeEsta = h => h.altaEn ?? Object.keys(h.plazas ?? {})
    const deEstacional = l.codigos.filter(h => {
      const d = dondeEsta(h)
      return d.length > 0 && d.every(s => estacionales.includes(s))
    })
    const aviso = deEstacional.length >= l.codigos.length / 2
      ? `${deEstacional.length} de los ${l.codigos.length} están sólo en ${nombresDe([...new Set(deEstacional.flatMap(dondeEsta))])}, que cierra ocho meses al año: ahí llevar meses sin venderse prueba menos`
      : null

    return {
      titulo: `${l.codigos.length} códigos sueltos en un solo mostrador`,
      contexto: [
        'Cada uno está en una sola plaza, y bodega no tiene ninguno',
        d === null
          ? 'A ninguno se le conoce una venta, descontando los recuentos de inventario'
          : `El más reciente lleva ${meses(d)} meses sin venderse`,
        'Al estar en una sola plaza la prueba es más floja que en los otros lotes: puede ser una baja de bodega o un alta que sólo hizo esa tienda',
        ...(aviso ? [aviso] : []),
        `Son ${l.piezas} piezas`,
      ],
      pregunta: `¿Se dan de baja los ${l.codigos.length} en cuanto se agoten?`,
      siHacer: `Vender lo que quede y luego borrar los ${l.codigos.length} códigos de la plaza que los tiene.`,
      noHacer: 'Alguno se queda, y hay que decir cuál y de dónde se resurte.',
      noPide: 'Cuáles se quedan y de dónde se resurten',
    }
  },
}

/**
 * Lo que el dueño dejó dicho de cada lote, el 2026-10-27, mirando el reporte:
 *
 *   · sin existencia  → borrarlos, con la lista de en qué plaza borrar cada uno
 *   · un solo mostrador → qué códigos y en qué sucursal, y lo decide él
 *   · bodega los descontinuó → no hacer nada, sólo guardar la nota, porque
 *     «próximamente esos serán los nuevos descontinuados»
 *   · colores que bodega no surte → ignorarlos
 *
 * 🔒 Es una decisión de negocio, no una preferencia de pantalla.
 */
const PASO_DE_CLASE = {
  'sin-existencia': PASO.BORRAR,
  'una-plaza':      PASO.DECIDIR,
  'varias-plazas':  PASO.ANOTAR,
  tono:             PASO.IGNORAR,
}

/**
 * Un lote: una pregunta que ordena muchos códigos de golpe.
 *
 * Lleva el detalle código a código a propósito. Un «sí» que da de baja veinte
 * códigos sin enseñar cuáles no es una respuesta, es un cheque en blanco, y
 * el reporte lo reparte luego como un renglón por código.
 */
export function fichaDeLote(lote) {
  const r = REDACCION[lote.clase](lote)
  const filas = Object.entries(lote.porPlaza)
    .sort((a, b) => b[1] - a[1])
    .map(([s, n]) => [nombreSucursal(s), String(n)])

  return {
    id: lote.id,
    bloque: 'codigo',
    lote: true,
    chip: `${lote.codigos.length} códigos de una vez`,
    tabla: filas.length ? { cabeceras: ['Plaza', 'Códigos'], filas } : null,
    detalle: lote.codigos.map(h => {
      const piezas = h.piezas > 0 ? `${h.piezas} pz` : 'sin existencia'
      const bodega = lote.clase === 'tono' && h.cubiertoPor ? ` · bodega surte ${h.cubiertoPor.codigo}` : ''
      return `${h.codigo} · ${h.producto} · ${piezas} · última venta ${cuando(h.ultimaVenta)}${bodega}`
    }),
    plazas: lote.plazas,
    codigos: lote.codigos,
    peso: lote.piezas,
    ...paso(PASO_DE_CLASE[lote.clase] ?? PASO.DECIDIR),
    ...r,
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

  // Un suelto no trae clase de lote, así que su sitio sale de su propio
  // motivo. Sin existencia no hay nada que decidir —se borra—, y un duplicado
  // va delante aunque se siga vendiendo: mientras los dos códigos existan,
  // todo lo que se cuente de ese teléfono sale repartido en dos.
  const suPaso = h.motivo === MOTIVO.DUPLICADO ? PASO.DUPLICADO
    : h.piezas === 0 ? PASO.BORRAR
    : h.motivo === MOTIVO.SIN_ALTA ? PASO.VIVO
    : PASO.DECIDIR

  const comun = {
    id: `cod|${h.codigo}`,
    bloque: 'codigo',
    chip: `${h.codigo} · ${h.piezas} pz · se movió por última vez ${h.ultimo ?? 'sin registro'}`,
    tabla: filas.length ? { cabeceras: ['Plaza', 'Existencia'], filas } : null,
    plazas: slugs,
    codigo: h.codigo,
    producto: h.producto,
    // Igual que un lote, pero de uno. Así el reporte reparte todas las fichas
    // con el mismo código y no necesita saber cuál es de qué clase.
    codigos: [h],
    peso: h.piezas,
    ...paso(suPaso),
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
      ...paso(PASO.NOMBRE),
      codigo: n.codigo,
      codigos: [{ codigo: n.codigo, producto: n.referencia ?? n.fuera?.[0]?.nombre ?? '', piezas: 0 }],
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
    ...paso(PASO.NOMBRE),
    codigo: n.codigo,
    codigos: [{ codigo: n.codigo, producto: n.referencia ?? n.fuera?.[0]?.nombre ?? '', piezas: 0 }],
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
