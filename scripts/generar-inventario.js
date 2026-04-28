// Ejecutar con: node scripts/generar-inventario.js
// Genera archivos de ejemplo en public/inventarios/[sucursal]/inventario.xlsx

import * as XLSX from 'xlsx'
import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC = path.join(__dirname, '..', 'public', 'inventarios')

const inventarios = {
  leon: [
    { Modelo: 'Crystal Frost Pro',  Tipo: 'Funda Transparente',  Compatibilidad: 'iPhone 15 Pro',        Existencias: 45, Precio: 299 },
    { Modelo: 'Magma Shield',        Tipo: 'Funda Premium',        Compatibilidad: 'Samsung Galaxy S24',   Existencias: 23, Precio: 349 },
    { Modelo: 'Midnight Matte',      Tipo: 'Funda Minimalista',    Compatibilidad: 'iPhone 15 / Plus',     Existencias: 65, Precio: 249 },
    { Modelo: 'Neon Splash',         Tipo: 'Edición Especial',     Compatibilidad: 'Universal (5 tallas)', Existencias: 9,  Precio: 399 },
    { Modelo: 'Forged Carbon',       Tipo: 'Ultra-Resistente',     Compatibilidad: 'Google Pixel 8',       Existencias: 30, Precio: 449 },
    { Modelo: 'AquaGuard Plus',      Tipo: 'Funda Impermeable',    Compatibilidad: 'iPhone 14 Series',     Existencias: 7,  Precio: 529 },
    { Modelo: 'Slim Pro Max',        Tipo: 'Ultra-Delgada',        Compatibilidad: 'iPhone 15 Pro Max',    Existencias: 52, Precio: 199 },
    { Modelo: 'Galaxy Armor',        Tipo: 'Funda Resistente',     Compatibilidad: 'Samsung Galaxy S23',   Existencias: 18, Precio: 379 },
    { Modelo: 'Carbon Shield',       Tipo: 'Funda Premium',        Compatibilidad: 'Xiaomi 14 Pro',        Existencias: 11, Precio: 489 },
    { Modelo: 'Glam Case',           Tipo: 'Funda Brillante',      Compatibilidad: 'iPhone 14 / 14 Pro',   Existencias: 35, Precio: 289 },
    { Modelo: 'Retro Wave',          Tipo: 'Edición Limitada',     Compatibilidad: 'iPhone 13 Series',     Existencias: 4,  Precio: 359 },
    { Modelo: 'Sport Armor',         Tipo: 'Funda Deportiva',      Compatibilidad: 'Universal',            Existencias: 27, Precio: 319 },
  ],
}

for (const [sucursal, rows] of Object.entries(inventarios)) {
  const dir = path.join(PUBLIC, sucursal)
  fs.mkdirSync(dir, { recursive: true })

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows)

  ws['!cols'] = [
    { wch: 22 },
    { wch: 22 },
    { wch: 28 },
    { wch: 14 },
    { wch: 10 },
  ]

  XLSX.utils.book_append_sheet(wb, ws, `Inventario ${sucursal.charAt(0).toUpperCase() + sucursal.slice(1)}`)
  const filePath = path.join(dir, 'inventario.xlsx')
  XLSX.writeFile(wb, filePath)
  console.log(`✓ ${filePath}`)
}

console.log('\nArchivos generados. Copia el patrón para otras sucursales.')
