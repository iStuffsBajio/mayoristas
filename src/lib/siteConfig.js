// La lectura es un archivo público en S3 y no necesita credencial. La
// escritura pasa por el backend, que valida que la sesión sea de
// administrador: antes bastaba con tener la llave de S3 del bundle, y esa
// llave la tenía cualquier visitante.
import { guardarConfig } from './api'

const BUCKET = import.meta.env.VITE_S3_BUCKET || ''
const REGION = import.meta.env.VITE_S3_REGION || 'us-east-1'
const KEY    = 'config/site.json'

export const DEFAULT_CONFIG = {
  tabs: {
    // Cada pestaña dice de entrada para quién es: la página la abren
    // mayoristas que vienen a consultar existencias y clientes que vienen a
    // encargar algo suyo, y antes las tres sonaban igual de genéricas.
    inventario:  { visible: true, label: 'Mayorista · Consulta' },
    personaliza: { visible: true, label: 'Cliente · Diseña tu funda' },
    stikers:     { visible: true, label: 'Cliente · Stickers' },
  },
  hero: {
    badge:     'Portal de mayoristas',
    // El titular va partido: la segunda mitad se pinta con el degradado.
    titulo1:   'Consulta y pide',
    titulo2:   'a cualquier hora',
    subtitulo: 'Que un horario no detenga tu venta. Revisa existencias de León, San Luis Potosí y Aguascalientes y manda tu pedido cuando lo necesites, aunque la tienda ya haya cerrado.',
    boton1:    'Ver existencias',
    boton2:    'Armar mi pedido →',
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
    copyright:   '© 2026 iStuffs Custom Cases. Todos los derechos reservados.',
  },
  dropboxCatalogos: {
    fundas:          '/Espacio familiar/IMPRESORA UV/CATALOGOS/Fundas',
    personalizados:  '/Espacio familiar/IMPRESORA UV/CATALOGOS/Personalizados',
  },
  // Número de WhatsApp de cada sucursal. Si una queda vacía se usa `general`.
  // Estos valores son el respaldo por si no se puede leer la configuración
  // remota. El panel admin los sobreescribe desde S3.
  whatsapp: {
    general:        '5213315381571',
    leon:           '4776639890',
    'san-luis':     '4445011007',
    aguascalientes: '4493946507',
    torreon:        '',
  },
}

export function gradStr(g) {
  if (!g) return 'linear-gradient(135deg, #D51A7A, #FF6B1A)'
  const stops = [g.color1, g.color2, g.color3].filter(Boolean).join(', ')
  return `linear-gradient(${g.angulo ?? 135}deg, ${stops})`
}

// Queda en true si el ultimo intento de leer config/site.json fallo. El panel
// admin lo usa para avisar que los cambios guardados no llegan a los visitantes.
export let configRemotaInaccesible = false

export async function loadSiteConfig() {
  try {
    const res = await fetch(
      `https://${BUCKET}.s3.${REGION}.amazonaws.com/${KEY}?t=${Date.now()}`
    )
    if (!res.ok) { configRemotaInaccesible = res.status === 403; return DEFAULT_CONFIG }
    configRemotaInaccesible = false
    const saved = await res.json()
    // Deep merge: default values fill any missing keys from older configs
    return {
      ...DEFAULT_CONFIG,
      ...saved,
      tabs:    { ...DEFAULT_CONFIG.tabs,    ...saved.tabs },
      hero:    { ...DEFAULT_CONFIG.hero,    ...saved.hero,    stats: saved.hero?.stats    || DEFAULT_CONFIG.hero.stats },
      colores: { ...DEFAULT_CONFIG.colores, ...saved.colores },
      footer:  { ...DEFAULT_CONFIG.footer,  ...saved.footer },
      whatsapp: { ...DEFAULT_CONFIG.whatsapp, ...saved.whatsapp },
      dropboxCatalogos: { ...DEFAULT_CONFIG.dropboxCatalogos, ...saved.dropboxCatalogos },
    }
  } catch {
    return DEFAULT_CONFIG
  }
}

export async function saveSiteConfig(config, token) {
  await guardarConfig(config, token)
}
