// Lista única de sucursales. Antes estaba duplicada en InventarioSemanal,
// PedidosStikers y el script de sincronización, con formatos distintos.

// `interna` es la bodega: tiene inventario y se sincroniza igual que una
// sucursal, pero no es un punto de venta. No debe aparecer nunca en lo que ve
// un mayorista —ni en la consulta de inventario, ni al armar un pedido, ni en
// los números de WhatsApp— y por eso se separa en dos listas en vez de
// filtrarla a mano en cada pantalla.
export const SUCURSALES = [
  { slug: 'leon',           nombre: 'León',            activa: true  },
  { slug: 'san-luis',       nombre: 'San Luis Potosí', activa: true  },
  { slug: 'aguascalientes', nombre: 'Aguascalientes',  activa: true  },
  { slug: 'torreon',        nombre: 'Torreón',         activa: false },
  { slug: 'bodega',         nombre: 'Bodega',          activa: true, interna: true },
  // Ferias no es una tienda fija: es el puesto que se monta en las ferias de
  // enero, agosto y octubre. Vende de verdad, pero un mayorista no le pide a
  // ella, asi que tambien va por dentro. `estacional` cambia como se calcula
  // su surtido: un ritmo diario promediado sobre el año no significa nada
  // cuando ocho meses estan cerrados.
  { slug: 'ferias',         nombre: 'Ferias',          activa: true, interna: true, estacional: true },
]

/** Las que ve un mayorista. Nunca incluye la bodega. */
export const SUCURSALES_PUBLICAS = SUCURSALES.filter(s => !s.interna)

export const SUCURSALES_ACTIVAS = SUCURSALES_PUBLICAS.filter(s => s.activa)

/** Las que tienen inventario sincronizado, bodega incluida. Solo uso interno. */
export const SUCURSALES_CON_INVENTARIO = SUCURSALES.filter(s => s.activa)

export const BODEGA = SUCURSALES.find(s => s.slug === 'bodega')

export function nombreSucursal(slug) {
  return SUCURSALES.find(s => s.slug === slug)?.nombre || slug
}

// Normaliza un teléfono mexicano al formato que espera wa.me: 52 + 10 dígitos.
// Acepta "477 123 4567", "+52 477 123 4567", "044 477...", "5214771234567".
export function telefonoWhatsApp(valor) {
  if (!valor) return ''
  let d = String(valor).replace(/\D/g, '')
  // Se compara también la longitud: hay ladas nacionales que empiezan con 52,
  // y recortar por prefijo a secas rompería esos números.
  if (d.length === 13 && (d.startsWith('521') || d.startsWith('044') || d.startsWith('045'))) d = d.slice(3)
  else if (d.length === 12 && d.startsWith('52')) d = d.slice(2)
  if (d.length !== 10) return ''                 // no es un numero mexicano valido
  return `52${d}`
}
