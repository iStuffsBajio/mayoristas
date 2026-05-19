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

export const s3Configured = !!(
  import.meta.env.VITE_S3_BUCKET &&
  import.meta.env.VITE_S3_ACCESS_KEY &&
  import.meta.env.VITE_S3_SECRET_KEY
)
