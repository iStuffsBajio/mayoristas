// El Excel de la sugerencia de surtido.
//
// Un solo libro con todo lo que muestra el panel: una portada con los números
// grandes y una hoja por tema. La idea es que se pueda mandar por correo y
// que quien lo abra entienda qué está viendo sin que nadie se lo explique.

import XLSX from 'xlsx-js-style'
import { diasEnCatalogo } from './surtido.js'
import {
  C, estiloTitulo, estiloSubtitulo, estiloCifra, estiloEtiqueta, estiloNota,
  estiloSeccion, estiloEncabezado, estiloCelda, hojaDeTabla, celda,
  nombreArchivo,
} from './excelEstilo.js'

const MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
             'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

const hoy = () => {
  const d = new Date()
  return `${d.getDate()} de ${MES[d.getMonth()]} de ${d.getFullYear()}`
}

// ── Portada ──────────────────────────────────────────────────────────────────

/** Cuatro tarjetas como las del panel: número grande arriba, etiqueta debajo. */
function tarjetas(hoja, fila, datos) {
  datos.forEach((d, i) => {
    const c0 = i * 2
    const refNum = XLSX.utils.encode_cell({ r: fila, c: c0 })
    const refEtq = XLSX.utils.encode_cell({ r: fila + 1, c: c0 })
    celda(hoja, refNum, d.valor, estiloCifra(d.color), 'n')
    celda(hoja, refEtq, d.etiqueta, estiloEtiqueta, 's')
    // La celda vecina va vacía pero con el mismo estilo: al combinarlas, el
    // borde del recuadro se dibuja entero y no medio.
    celda(hoja, XLSX.utils.encode_cell({ r: fila, c: c0 + 1 }), '', estiloCifra(d.color), 's')
    celda(hoja, XLSX.utils.encode_cell({ r: fila + 1, c: c0 + 1 }), '', estiloEtiqueta, 's')
  })

  const merges = []
  datos.forEach((_, i) => {
    merges.push({ s: { r: fila, c: i * 2 }, e: { r: fila, c: i * 2 + 1 } })
    merges.push({ s: { r: fila + 1, c: i * 2 }, e: { r: fila + 1, c: i * 2 + 1 } })
  })
  return merges
}

function hojaPortada({ sucursal, meta, conteos, notas }) {
  const hoja = {}
  const ANCHO = 8
  const merges = []

  celda(hoja, 'A1', 'SUGERENCIA DE SURTIDO', estiloTitulo, 's')
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: ANCHO - 1 } })

  celda(hoja, 'A2',
    `${sucursal}  ·  temporada ${meta.esAlta ? 'alta' : 'baja'}, cubre ${meta.cobertura} días  ·  generado el ${hoy()}`,
    estiloSubtitulo, 's')
  merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: ANCHO - 1 } })

  merges.push(...tarjetas(hoja, 3, [
    { valor: conteos.modelos,  etiqueta: 'modelos a pedir',     color: C.verde },
    { valor: conteos.piezas,   etiqueta: 'piezas en total',     color: C.tinta },
    { valor: conteos.muestras, etiqueta: 'sin venta y en cero', color: C.ambar },
    { valor: meta.diasHistorial, etiqueta: 'días de historial', color: C.tinta },
  ]))

  celda(hoja, 'A7', 'Qué hay en cada hoja', estiloSeccion, 's')

  const filas = [
    ['Pedir por venta',      conteos.modelos,  'Se mueven y no alcanzan para la cobertura'],
    ['Sin venta y agotados', conteos.muestras, 'Nunca se vendieron y están en cero: 1 de muestra'],
    ['Bodega',               conteos.bodega,   'Lo que piden las plazas contra lo que hay'],
    ['Recién llegados',      conteos.nuevos,   'Menos de un año en el catálogo y aún sin venta'],
    ['Depurar',              conteos.depurar,  'Más de un año sin una sola venta y ocupando lugar'],
  ]
  const enc = ['Hoja', 'Modelos', 'Qué contiene']
  enc.forEach((t, i) => celda(hoja, XLSX.utils.encode_cell({ r: 8, c: i }), t, estiloEncabezado, 's'))
  filas.forEach((f, r) => {
    f.forEach((v, i) => celda(hoja, XLSX.utils.encode_cell({ r: 9 + r, c: i }),
      v, estiloCelda(r, { num: i === 1 }), typeof v === 'number' ? 'n' : 's'))
  })
  merges.push(...filas.map((_, r) => ({ s: { r: 9 + r, c: 2 }, e: { r: 9 + r, c: ANCHO - 1 } })))

  celda(hoja, 'A16', 'Cómo se calcula', estiloSeccion, 's')
  notas.forEach((n, i) => {
    celda(hoja, XLSX.utils.encode_cell({ r: 17 + i, c: 0 }), n, estiloNota, 's')
    // Las celdas vecinas del renglon combinado necesitan existir, si no la
    // combinacion se descarta al abrir.
    for (let c = 1; c < ANCHO; c++) {
      celda(hoja, XLSX.utils.encode_cell({ r: 17 + i, c }), '', estiloNota, 's')
    }
    merges.push({ s: { r: 17 + i, c: 0 }, e: { r: 17 + i, c: ANCHO - 1 } })
  })

  hoja['!merges'] = merges
  hoja['!cols'] = [
    { wch: 22 }, { wch: 11 }, { wch: 16 }, { wch: 11 },
    { wch: 16 }, { wch: 11 }, { wch: 16 }, { wch: 11 },
  ]
  hoja['!rows'] = [
    { hpt: 34 }, { hpt: 20 }, { hpt: 8 },
    { hpt: 40 }, { hpt: 20 }, { hpt: 10 },
    { hpt: 20 }, { hpt: 18 }, ...Array(5).fill({ hpt: 17 }),
    { hpt: 10 }, { hpt: 10 }, { hpt: 20 },
    // Excel no ajusta solo el alto de una celda combinada, asi que se calcula:
    // en el ancho de A a H caben unos 114 caracteres por linea.
    ...notas.map(n => ({ hpt: Math.max(16, Math.ceil(n.length / 114) * 13 + 4) })),
  ]
  return hoja
}

// ── Hojas de detalle ─────────────────────────────────────────────────────────

/**
 * Columnas de la hoja de pedido. Si hay inventario de bodega se añaden dos al
 * final: de poco sirve saber que hacen falta 8 piezas si no se ve en el mismo
 * renglón si bodega las tiene o hay que comprarlas fuera.
 */
const colsVenta = (bodegaStock) => [
  { titulo: 'Código',           valor: f => f.codigo,     ancho: 12 },
  { titulo: 'Modelo',           valor: f => f.producto,   ancho: 40 },
  { titulo: 'Existencia',       valor: f => f.existencia, num: true },
  { titulo: 'Piezas al día',    valor: f => Number(f.ritmo.toFixed(3)), num: true, formato: '0.000' },
  { titulo: 'Días que aguanta', valor: f => (f.cobertura === null ? '' : Math.floor(f.cobertura)), num: true,
    // En rojo lo que no llega a la semana: eso es lo que de verdad corre prisa.
    color: f => (f.cobertura !== null && f.cobertura < 7 ? C.rosa : C.tintaSuave) },
  { titulo: 'PEDIR',            valor: f => f.sugerido,   num: true, fuerte: true, color: C.verde },
  ...(bodegaStock ? [
    { titulo: 'En bodega', valor: f => (bodegaStock[f.codigo] ?? ''), num: true,
      color: f => (bodegaStock[f.codigo] ? C.tinta : C.rosa) },
    { titulo: '¿De dónde sale?', ancho: 20,
      valor: f => etiquetaOrigen(f, bodegaStock),
      color: f => {
        const hay = bodegaStock[f.codigo]
        if (hay === undefined || hay === 0) return C.rosa
        return hay >= f.sugerido ? C.verde : C.ambar
      } },
  ] : []),
]

/** De dónde puede salir lo que se pide: de bodega, en parte, o de compra. */
function etiquetaOrigen(f, bodegaStock) {
  const hay = bodegaStock[f.codigo]
  if (hay === undefined) return 'Comprar: bodega no lo maneja'
  if (hay === 0)         return 'Comprar: bodega en cero'
  if (hay >= f.sugerido) return 'Bodega lo cubre'
  return `Bodega cubre ${hay}, faltan ${f.sugerido - hay}`
}

const COLS_MUESTRA = [
  { titulo: 'Código', valor: f => f.codigo,   ancho: 12 },
  { titulo: 'Modelo', valor: f => f.producto, ancho: 40 },
  { titulo: 'PEDIR',  valor: () => 1, num: true, fuerte: true, color: C.ambar },
]

const ESTADOS = {
  cubre:       'Surte todo',
  parcial:     'Alcanza solo para parte',
  agotada:     'Bodega en cero',
  'no-maneja': 'Bodega no lo maneja',
}

const COLS_BODEGA = [
  { titulo: 'Código',  valor: b => b.codigo,   ancho: 12 },
  { titulo: 'Modelo',  valor: b => b.producto, ancho: 40 },
  { titulo: 'Piden',   valor: b => b.piden,  num: true },
  { titulo: 'En bodega', valor: b => (b.existe ? b.tiene : ''), num: true,
    color: b => (b.tiene === 0 ? C.rosa : C.tinta) },
  { titulo: 'Falta',   valor: b => b.falta,  num: true, fuerte: true,
    color: b => (b.falta > 0 ? C.rosa : C.verde) },
  { titulo: 'Estado',  valor: b => ESTADOS[b.estado] ?? b.estado, ancho: 24,
    color: b => (b.estado === 'cubre' ? C.verde : b.estado === 'parcial' ? C.ambar : C.rosa) },
  { titulo: 'Sucursales que lo piden', valor: b => b.sucursales.length, num: true },
  { titulo: 'Se quedan sin él',        valor: b => b.sucursalesSinCubrir, num: true,
    color: b => (b.sucursalesSinCubrir > 0 ? C.rosa : C.tintaTenue) },
]

const COLS_DEPURAR = [
  { titulo: 'Código',         valor: d => d.codigo,   ancho: 12 },
  { titulo: 'Modelo',         valor: d => d.producto, ancho: 40 },
  { titulo: 'Piezas paradas', valor: d => d.existencia, num: true, fuerte: true, color: C.ambar },
  { titulo: 'Entró al catálogo', valor: d => d.alta ?? '', ancho: 16 },
  { titulo: 'Dónde están',    valor: d => (d.plazas ?? []).map(p => p.slug).join(', '), ancho: 28 },
]

const COLS_NUEVOS = [
  { titulo: 'Código',         valor: d => d.codigo,   ancho: 12 },
  { titulo: 'Modelo',         valor: d => d.producto, ancho: 40 },
  { titulo: 'Piezas',         valor: d => d.existencia, num: true },
  { titulo: 'Entró al catálogo', valor: d => d.alta ?? '', ancho: 16 },
  { titulo: 'Días que lleva', valor: d => diasEnCatalogo(d.alta) ?? '', num: true,
    color: d => { const n = diasEnCatalogo(d.alta); return n !== null && n < 90 ? C.verde : C.tintaSuave } },
]

// ── Entrada ──────────────────────────────────────────────────────────────────

export function descargarSurtido({ sucursal, meta, porVenta, muestras, bodega, depurar, nuevos = [], bodegaStock = null }) {
  const libro = XLSX.utils.book_new()

  const conteos = {
    modelos:  porVenta.length,
    piezas:   porVenta.reduce((a, f) => a + f.sugerido, 0),
    muestras: muestras.length,
    bodega:   bodega.length,
    depurar:  depurar.length,
    nuevos:   nuevos.length,
  }

  const notas = [
    'El ritmo sale de dividir lo vendido entre los días CON DATO, no entre los del calendario: si una sucursal estuvo semanas sin subir respaldo, esas semanas no diluyen el ritmo de las que sí se midieron.',
    'Pedir = ritmo diario × días de cobertura − lo que ya hay. En temporada alta la cobertura se duplica.',
    'Los meses importados de Eleventa traen la venta real. Los medidos por la sincronización son un piso: un resurtido el mismo día tapa la salida, y la diferencia medida ronda el 19%.',
    'Los stickers no aparecen: bodega los imprime cuando hacen falta, no se almacenan.',
    'La hoja Pedir por venta trae al final de donde sale cada pieza: si bodega la cubre, si la cubre a medias o si hay que comprarla fuera.',
    'La hoja Depurar solo se llena con 90 días o más de historial, y solo con modelos que lleven más de un año en el catálogo: uno recién llegado que aún no vende está en Recién llegados, no estancado.',
    'La fecha de entrada sale del primer movimiento registrado en bodega, que es donde se da de alta todo antes de repartirlo a las sucursales.',
  ]

  XLSX.utils.book_append_sheet(libro, hojaPortada({ sucursal, meta, conteos, notas }), 'Panel')
  XLSX.utils.book_append_sheet(libro, hojaDeTabla(colsVenta(bodegaStock), porVenta), 'Pedir por venta')
  XLSX.utils.book_append_sheet(libro, hojaDeTabla(COLS_MUESTRA, muestras), 'Sin venta y agotados')
  XLSX.utils.book_append_sheet(libro, hojaDeTabla(COLS_BODEGA, bodega), 'Bodega')
  XLSX.utils.book_append_sheet(libro, hojaDeTabla(COLS_NUEVOS, nuevos), 'Recién llegados')
  XLSX.utils.book_append_sheet(libro, hojaDeTabla(COLS_DEPURAR, depurar), 'Depurar')

  const fecha = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(libro, `surtido-${nombreArchivo(sucursal)}-${fecha}.xlsx`)
}
