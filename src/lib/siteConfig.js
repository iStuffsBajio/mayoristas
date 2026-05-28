import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const BUCKET = import.meta.env.VITE_S3_BUCKET || ''
const REGION = import.meta.env.VITE_S3_REGION || 'us-east-1'
const KEY    = 'config/site.json'

const s3 = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId:     import.meta.env.VITE_S3_ACCESS_KEY || '',
    secretAccessKey: import.meta.env.VITE_S3_SECRET_KEY || '',
  },
})

export const DEFAULT_CONFIG = {
  tabs: {
    inventario: { visible: true, label: 'Consulta de Inventario', emoji: '📋' },
    personaliza: { visible: true, label: 'Diseña tu Funda',        emoji: '📱' },
    stikers:     { visible: true, label: 'Pedidos de Stickers',    emoji: '🏷️' },
  },
  hero: {
    badge:     '✦ Nueva Colección 2025',
    subtitulo: 'Fundas premium y accesorios tecnológicos con diseños únicos. Disponible en León, San Luis Potosí, Aguascalientes y Torreón.',
    boton1:    'Explorar Catálogo',
    boton2:    'Personalizar mi Funda →',
    stats: [
      { value: '500+', label: 'Diseños' },
      { value: '4',    label: 'Sucursales' },
      { value: '98%',  label: 'Satisfacción' },
    ],
  },
  colores: {
    primario:   '#D51A7A',
    secundario: '#FF6B1A',
    acento:     '#00BCF2',
    acento2:    '#8DC63F',
    gradientes: {
      principal: { angulo: 135, color1: '#D51A7A', color2: '#FF6B1A' },
      acento:    { angulo: 135, color1: '#00BCF2', color2: '#8DC63F' },
    },
  },
  footer: {
    descripcion: 'Tu destino de accesorios tecnológicos premium. Diseño, calidad y personalización en un solo lugar.',
    copyright:   '© 2025 iStuffs. Todos los derechos reservados.',
  },
  dropboxCatalogos: {
    fundas:          '/Espacio familiar/IMPRESORA UV/CATALOGOS/Fundas',
    personalizados:  '/Espacio familiar/IMPRESORA UV/CATALOGOS/Personalizados',
  },
}

export function gradStr(g) {
  if (!g) return 'linear-gradient(135deg, #D51A7A, #FF6B1A)'
  const stops = [g.color1, g.color2, g.color3].filter(Boolean).join(', ')
  return `linear-gradient(${g.angulo ?? 135}deg, ${stops})`
}

export async function loadSiteConfig() {
  try {
    const res = await fetch(
      `https://${BUCKET}.s3.${REGION}.amazonaws.com/${KEY}?t=${Date.now()}`
    )
    if (!res.ok) return DEFAULT_CONFIG
    const saved = await res.json()
    // Deep merge: default values fill any missing keys from older configs
    return {
      ...DEFAULT_CONFIG,
      ...saved,
      tabs:    { ...DEFAULT_CONFIG.tabs,    ...saved.tabs },
      hero:    { ...DEFAULT_CONFIG.hero,    ...saved.hero,    stats: saved.hero?.stats    || DEFAULT_CONFIG.hero.stats },
      colores: { ...DEFAULT_CONFIG.colores, ...saved.colores },
      footer:  { ...DEFAULT_CONFIG.footer,  ...saved.footer },
    }
  } catch {
    return DEFAULT_CONFIG
  }
}

export async function saveSiteConfig(config) {
  await s3.send(new PutObjectCommand({
    Bucket:      BUCKET,
    Key:         KEY,
    Body:        new TextEncoder().encode(JSON.stringify(config, null, 2)),
    ContentType: 'application/json',
  }))
}
