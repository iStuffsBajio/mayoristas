// Departamentos que no son producto vendible y se filtran al leer.
//
// Se hace en el origen, al leer el respaldo o el reporte de ventas, para que
// no lleguen ni al inventario publicado ni a las estadísticas. Filtrarlo más
// tarde, en cada pantalla, es la forma segura de que alguna se olvide.
//
// Qué NO se filtra, aunque no sea una marca de celular: el hidrogel. Son
// micas que se compran y se almacenan como cualquier funda —960 piezas
// vendidas en el último año y casi 2000 en bodega— y dejarlas fuera quitaría
// de las sugerencias de surtido uno de los productos que más se mueve.

// Los clientes se leen de `ventasTicket.js`, que es quien los clasifica en las
// ventas: dos listas aparte acabaron diferentes —Torreón lo escribe en singular
// y uno de los dos filtros no lo conocía—.
import { DEPTOS_MAYORISTAS, esPrecioDeEtiqueta } from '../../src/lib/ventasTicket.js'

export const DEPTOS_OCULTOS = new Set([
  ...DEPTOS_MAYORISTAS,   // son nombres de clientes, no productos
  '- sin departamento -', // cajón de sastre: ahí caen los stickers y restos
  '- comunes -',          // "- Producto Comun -", la venta suelta sin código real
  'cajas de luz',         // mobiliario de exhibición, no mercancía
])

/**
 * ¿Este producto es en realidad un mayorista apuntado?
 *
 * Por departamento, que es lo normal, o por precio: el dueño definió que lo
 * que se procesa a $0.01 es del esquema de mayoristas. Sólo se oculta si no
 * tiene existencia —una etiqueta nunca la tiene—: un producto de verdad con el
 * precio mal capturado en $0.01 y piezas en el mostrador tiene que verse, que
 * es justo la clase de error que hay que poder encontrar.
 */
export const esEtiquetaDeCliente = ({ depto, pventa, existencia }) =>
  DEPTOS_MAYORISTAS.has(String(depto ?? '').trim().toLowerCase())
  || (esPrecioDeEtiqueta(pventa) && !(Number(existencia) > 0))

/** Normaliza para comparar sin acentos ni mayúsculas. */
export const deptoOculto = valor => DEPTOS_OCULTOS.has(
  String(valor ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
)
