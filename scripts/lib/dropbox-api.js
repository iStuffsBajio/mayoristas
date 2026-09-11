// Acceso a Dropbox desde Node, para cuando la sincronización corre en un
// servidor y no hay carpeta de Dropbox montada en disco.
//
// Usa el mismo refresh token que ya tiene la página. Un refresh token no
// caduca, así que no hay que renovarlo a mano cada cierto tiempo.

import fs from 'node:fs'

const API     = 'https://api.dropboxapi.com/2'
const CONTENT = 'https://content.dropboxapi.com/2'

let tokenCache = { valor: null, expira: 0 }

export async function getAccessToken() {
  if (tokenCache.valor && Date.now() < tokenCache.expira) return tokenCache.valor

  const refresh = process.env.DROPBOX_REFRESH_TOKEN || process.env.VITE_DROPBOX_REFRESH_TOKEN
  const key     = process.env.DROPBOX_APP_KEY       || process.env.VITE_DROPBOX_APP_KEY
  const secret  = process.env.DROPBOX_APP_SECRET    || process.env.VITE_DROPBOX_APP_SECRET
  if (!refresh || !key || !secret) {
    throw new Error('Faltan DROPBOX_REFRESH_TOKEN, DROPBOX_APP_KEY o DROPBOX_APP_SECRET')
  }

  const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: refresh,
      client_id:     key,
      client_secret: secret,
    }),
  })
  if (!res.ok) throw new Error(`Dropbox no entregó token (${res.status}): ${await res.text()}`)

  const data = await res.json()
  // Se renueva un minuto antes de que expire, por si el reloj va desfasado
  tokenCache = { valor: data.access_token, expira: Date.now() + (data.expires_in - 60) * 1000 }
  return tokenCache.valor
}

async function api(endpoint, body) {
  const token = await getAccessToken()
  const res = await fetch(`${API}/${endpoint}`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Dropbox /${endpoint} (${res.status}): ${await res.text()}`)
  return res.json()
}

/** Lista todos los archivos de una carpeta, incluidas sus subcarpetas. */
export async function listarArchivos(rutaCarpeta) {
  const archivos = []
  let data = await api('files/list_folder', { path: rutaCarpeta, recursive: true, limit: 2000 })
  archivos.push(...data.entries)
  while (data.has_more) {
    data = await api('files/list_folder/continue', { cursor: data.cursor })
    archivos.push(...data.entries)
  }
  return archivos.filter(e => e['.tag'] === 'file')
}

/** Descarga un archivo de Dropbox a una ruta local. */
export async function descargar(rutaDropbox, destinoLocal) {
  const token = await getAccessToken()
  const res = await fetch(`${CONTENT}/files/download`, {
    method:  'POST',
    headers: {
      Authorization:     `Bearer ${token}`,
      'Dropbox-API-Arg': JSON.stringify({ path: rutaDropbox }),
    },
  })
  if (!res.ok) throw new Error(`Descarga falló (${res.status}): ${await res.text()}`)
  fs.writeFileSync(destinoLocal, Buffer.from(await res.arrayBuffer()))
  return destinoLocal
}

// Es función y no constante a propósito: los imports se evalúan antes del
// cuerpo del script que la usa, así que una constante se calcularía antes de
// que se cargue el archivo .env y siempre daría falso.
export function dropboxConfigurado() {
  return !!(
    (process.env.DROPBOX_REFRESH_TOKEN || process.env.VITE_DROPBOX_REFRESH_TOKEN) &&
    (process.env.DROPBOX_APP_KEY       || process.env.VITE_DROPBOX_APP_KEY) &&
    (process.env.DROPBOX_APP_SECRET    || process.env.VITE_DROPBOX_APP_SECRET)
  )
}
