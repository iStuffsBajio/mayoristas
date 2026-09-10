// Lista única de sucursales. Antes estaba duplicada en InventarioSemanal,
// PedidosStikers y el script de sincronización, con formatos distintos.

export const SUCURSALES = [
  { slug: 'leon',           nombre: 'León',            activa: true  },
  { slug: 'san-luis',       nombre: 'San Luis Potosí', activa: true  },
  { slug: 'aguascalientes', nombre: 'Aguascalientes',  activa: true  },
  { slug: 'torreon',        nombre: 'Torreón',         activa: false },
]

export const SUCURSALES_ACTIVAS = SUCURSALES.filter(s => s.activa)

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
