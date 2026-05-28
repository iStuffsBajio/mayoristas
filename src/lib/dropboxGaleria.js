import { getAccessToken } from './dropbox'

async function dbx(endpoint, body) {
  const token = await getAccessToken()
  const res = await fetch(`https://api.dropboxapi.com/2/${endpoint}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.text().catch(() => res.status)
    throw new Error(`Dropbox /${endpoint}: ${err}`)
  }
  return res.json()
}

const IMAGE_EXT = /\.(jpg|jpeg|png|webp|gif|bmp)$/i

export async function listDropboxImages(folderPath) {
  if (!folderPath) return []
  try {
    const data = await dbx('files/list_folder', { path: folderPath, limit: 100 })
    return (data.entries || []).filter(e => e['.tag'] === 'file' && IMAGE_EXT.test(e.name))
  } catch (e) {
    console.error('[DropboxGaleria] list_folder:', e.message)
    return []
  }
}

export async function getDropboxImageUrl(path) {
  const data = await dbx('files/get_temporary_link', { path })
  return data.link
}

export async function listDropboxImagesWithUrls(folderPath) {
  const entries = await listDropboxImages(folderPath)
  if (entries.length === 0) return []
  const results = await Promise.allSettled(
    entries.map(async e => ({
      name:     e.name,
      path:     e.path_lower,
      filename: e.name,
      url:      await getDropboxImageUrl(e.path_lower),
    }))
  )
  return results
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value)
}
