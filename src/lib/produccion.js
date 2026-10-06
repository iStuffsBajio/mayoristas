// Productos que la bodega fabrica en vez de comprar.
//
// Los stickers no se almacenan: se imprimen cuando hacen falta, así que para
// efectos de surtido son infinitos. Si se tratan como cualquier otra pieza,
// el panel acaba diciendo cosas falsas: que bodega "no maneja" el Stiker
// Pequeño cuando hay 52 pedidos, o que una sucursal está agotada de algo que
// se produce en media hora.
//
// Se identifican por CÓDIGO y no por departamento, porque el departamento no
// es de fiar: el mismo SP aparece unas veces en "stikers" y otras en
// "- Sin Departamento -", y el ST, que lleva 400 piezas vendidas, está
// siempre en el segundo.
//
// Para dar de alta un código nuevo de producción, basta con añadirlo aquí.

export const CODIGOS_PRODUCCION = new Set([
  'SP',   // Stiker Pequeño
  'ST',   // Stiker Diseño
  'SPE',  // Stikers personalizados
])

// Red de seguridad para códigos nuevos que nadie se acordó de añadir arriba.
// Solo mira el nombre, que es lo que sí escribe siempre quien da de alta el
// producto.
const PATRON = /\bstikers?\b|\bstickers?\b/i

/** True si el producto se fabrica y no tiene sentido pedirlo a bodega. */
export function seProduce(codigo, producto = '') {
  if (CODIGOS_PRODUCCION.has(String(codigo ?? '').trim().toUpperCase())) return true
  return PATRON.test(String(producto ?? ''))
}

/** Separa una lista en lo que se compra y lo que se produce. */
export function separarProduccion(filas) {
  const compra = [], produccion = []
  for (const f of filas) (seProduce(f.codigo, f.producto) ? produccion : compra).push(f)
  return { compra, produccion }
}
