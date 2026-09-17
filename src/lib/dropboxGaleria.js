// Galería del catálogo.
//
// Antes este módulo hablaba con la API de Dropbox desde el navegador, con el
// token que venía en el JavaScript público. Ahora pide la lista al backend,
// que además solo abre las carpetas declaradas en su lista blanca: aunque
// alguien manipule la petición, no puede pedir el contenido de cualquier parte
// del Dropbox.
//
// El backend devuelve enlaces temporales de Dropbox, así que las imágenes se
// siguen viendo sin exponer la cuenta.

import { galeria } from './api'

/** Imágenes de una carpeta del catálogo: { name, filename, url }. */
export async function listDropboxImagesWithUrls(folderPath) {
  return galeria(folderPath)
}
