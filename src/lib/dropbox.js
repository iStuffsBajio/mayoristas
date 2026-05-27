const TOKEN  = import.meta.env.VITE_DROPBOX_TOKEN || ''
const FOLDER = '/Espacio familiar/IMPRESORA UV/7 PEDIDOS PAGINA WEB'

const SLUG_FOLDER = {
  'leon':           'Leon',
  'san-luis':       'San Luis',
  'aguascalientes': 'Aguascalientes',
  'torreon':        'Torreon',
}

export async function uploadStikerDropbox(slug, file, clienteName) {
  const ext    = file.name.split('.').pop() || 'jpg'
  const fecha  = new Date().toISOString().slice(0, 10)
  const nombre = clienteName.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-áéíóúÁÉÍÓÚñÑ]/g, '')
  const folder = SLUG_FOLDER[slug] || slug
  const path   = `${FOLDER}/${folder}/${fecha}_${nombre}.${ext}`

  const buf = await file.arrayBuffer()

  const res = await fetch('https://content.dropboxapi.com/2/files/upload', {
    method: 'POST',
    headers: {
      'Authorization':    `Bearer ${TOKEN}`,
      'Dropbox-API-Arg':  JSON.stringify({ path, mode: 'add', autorename: true }),
      'Content-Type':     'application/octet-stream',
    },
    body: buf,
  })

  if (!res.ok) {
    const err = await res.text().catch(() => res.status)
    console.error('[Dropbox] Error al subir:', res.status, err)
    throw new Error(`Dropbox ${res.status}: ${err}`)
  }
  const data = await res.json()
  console.log('[Dropbox] Subido en:', data.path_display)
  return data.path_display
}

export const dropboxConfigured = !!TOKEN
