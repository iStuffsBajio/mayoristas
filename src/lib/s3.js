import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

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
