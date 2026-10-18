// Encontrar el respaldo más reciente de una sucursal.
//
// Lo usan los dos scripts que leen Eleventa: el de inventarios y el de
// turnos. Vive aquí y no duplicado en cada uno porque los dos tienen que
// elegir EL MISMO archivo: si divergen, el panel enseña existencias de un día
// y puntualidad de otro sin que nada avise.
//
// Dos orígenes:
//   local    — la carpeta de Dropbox sincronizada en el disco (tu máquina)
//   dropbox  — la API, para GitHub Actions, donde no hay unidad A:

import fs from 'node:fs'
import path from 'node:path'
import { listarArchivos, descargar } from './dropbox-api.js'

export const BACKUPS_DIR =
  process.env.INVENTARIO_BACKUPS_DIR || 'A:\\Dropbox\\Espacio familiar\\RESPALDOS SUCURSALES'

export const BACKUPS_DROPBOX =
  process.env.INVENTARIO_BACKUPS_DROPBOX || '/Espacio familiar/RESPALDOS SUCURSALES'

/** La fecha que lleva el nombre: respaldo-13-10-26.fbk → 2026-10-13. */
export function fechaDelNombre(archivo) {
  const m = /(\d{2})-(\d{2})-(\d{2})/.exec(path.basename(archivo))
  return m ? `20${m[3]}-${m[2]}-${m[1]}` : null
}

// Se usa statSync (no dirent) porque los archivos "solo en línea" de Dropbox
// son reparse points y dirent.isFile() los reporta como false.
export function buscarFbkLocal(dir, acc = []) {
  for (const nombre of fs.readdirSync(dir)) {
    const p = path.join(dir, nombre)
    let st
    try { st = fs.statSync(p) } catch { continue }
    if (st.isDirectory()) buscarFbkLocal(p, acc)
    else if (st.isFile() && /\.fbk$/i.test(nombre)) {
      acc.push({
        nombre,
        origen: p,
        fecha:  fechaDelNombre(nombre) || st.mtime.toISOString().slice(0, 10),
        marca:  st.mtime.toISOString(),
      })
    }
  }
  return acc
}

export async function buscarFbkDropbox(carpeta) {
  const entradas = await listarArchivos(`${BACKUPS_DROPBOX}/${carpeta}`)
  return entradas
    .filter(e => /\.fbk$/i.test(e.name))
    .map(e => ({
      nombre: e.name,
      origen: e.path_lower,
      fecha:  fechaDelNombre(e.name) || e.server_modified.slice(0, 10),
      marca:  e.server_modified,
      tamano: e.size,
    }))
}

/** El respaldo más reciente de una sucursal, sea cual sea el origen. */
export async function ultimoRespaldo(carpeta, origen) {
  let todos
  if (origen === 'local') {
    const dir = path.join(BACKUPS_DIR, carpeta)
    if (!fs.existsSync(dir)) throw new Error(`No existe la carpeta ${dir}`)
    todos = buscarFbkLocal(dir)
  } else {
    todos = await buscarFbkDropbox(carpeta)
  }
  if (todos.length === 0) throw new Error(`Sin archivos .fbk en ${carpeta}`)
  // Más reciente por fecha del nombre (respaldo-DD-MM-YY); desempata por fecha real
  todos.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.marca.localeCompare(a.marca))
  return todos[0]
}

/** Deja el .fbk en disco listo para gbak, descargándolo si hace falta. */
export async function obtenerArchivo(respaldo, workDir, origen) {
  if (origen === 'local') return respaldo.origen
  const destino = path.join(workDir, respaldo.nombre)
  await descargar(respaldo.origen, destino)
  return destino
}

/** Local si la carpeta existe en el disco; si no, Dropbox. */
export const origenPorDefecto = () => (fs.existsSync(BACKUPS_DIR) ? 'local' : 'dropbox')
