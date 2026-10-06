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

export const DEPTOS_OCULTOS = new Set([
  'mayoristas',           // son nombres de clientes, no productos
  '- sin departamento -', // cajón de sastre: ahí caen los stickers y restos
  '- comunes -',          // "- Producto Comun -", la venta suelta sin código real
  'cajas de luz',         // mobiliario de exhibición, no mercancía
])

/** Normaliza para comparar sin acentos ni mayúsculas. */
export const deptoOculto = valor => DEPTOS_OCULTOS.has(
  String(valor ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
)
