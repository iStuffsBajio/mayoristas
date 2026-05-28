import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

// Galería: índice de imágenes del catálogo
// Las imágenes se guardan en S3 bajo galeria/{tipo}/{filename}
// El índice se guarda en galeria/{tipo}/index.json (array de filenames)

const BUCKET = import.meta.env.VITE_S3_BUCKET
const REGION = import.meta.env.VITE_S3_REGION || 'us-east-1'

const s3 = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId:     import.meta.env.VITE_S3_ACCESS_KEY     || '',
    secretAccessKey: import.meta.env.VITE_S3_SECRET_KEY || '',
  },
})

export function inventarioUrl(slug) {
  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/inventarios/${slug}/inventario.xlsx`
}

export async function uploadInventario(slug, file) {
  const key = `inventarios/${slug}/inventario.xlsx`
  const body = await file.arrayBuffer()
  await s3.send(new PutObjectCommand({
    Bucket:      BUCKET,
    Key:         key,
    Body:        new Uint8Array(body),
    ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }))
  return inventarioUrl(slug)
}

export async function uploadStiker(slug, file, clienteName) {
  const ext    = file.name.split('.').pop() || 'jpg'
  const fecha  = new Date().toISOString().slice(0, 10)
  const nombre = clienteName.trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '')
  const key    = `stikers/${slug}/${fecha}_${nombre}.${ext}`
  const body   = await file.arrayBuffer()
  await s3.send(new PutObjectCommand({
    Bucket:      BUCKET,
    Key:         key,
    Body:        new Uint8Array(body),
    ContentType: file.type || 'image/jpeg',
  }))
  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`
}

export const s3Configured = !!(
  import.meta.env.VITE_S3_BUCKET &&
  import.meta.env.VITE_S3_ACCESS_KEY &&
  import.meta.env.VITE_S3_SECRET_KEY
)

// ── Galería de catálogo ────────────────────────────────────────────────────

function galeriaBaseUrl(tipo) {
  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/galeria/${tipo}`
}

export async function loadGaleriaIndex(tipo) {
  try {
    const res = await fetch(`${galeriaBaseUrl(tipo)}/index.json?t=${Date.now()}`)
    if (!res.ok) return []
    const filenames = await res.json()
    return filenames.map(filename => ({
      filename,
      url: `${galeriaBaseUrl(tipo)}/${filename}`,
    }))
  } catch {
    return []
  }
}

async function saveGaleriaIndex(tipo, filenames) {
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: `galeria/${tipo}/index.json`,
    Body: JSON.stringify(filenames),
    ContentType: 'application/json',
  }))
}

export async function uploadGaleriaImage(tipo, file) {
  const ext      = file.name.split('.').pop() || 'jpg'
  const filename = `${Date.now()}.${ext}`
  const key      = `galeria/${tipo}/${filename}`
  const body     = await file.arrayBuffer()
  await s3.send(new PutObjectCommand({
    Bucket:      BUCKET,
    Key:         key,
    Body:        new Uint8Array(body),
    ContentType: file.type || 'image/jpeg',
  }))
  const current  = await loadGaleriaIndex(tipo)
  await saveGaleriaIndex(tipo, [...current.map(i => i.filename), filename])
  return { filename, url: `${galeriaBaseUrl(tipo)}/${filename}` }
}

export async function removeGaleriaImage(tipo, filename) {
  const current = await loadGaleriaIndex(tipo)
  await saveGaleriaIndex(tipo, current.map(i => i.filename).filter(f => f !== filename))
}
