// Subida de imágenes de pedidos.
//
// Este módulo YA NO HABLA CON DROPBOX, y no debe volver a hacerlo desde el
// navegador. Antes guardaba el app key, el app secret y un refresh token en
// variables VITE_, que Vite compila dentro del JavaScript público. Se comprobó
// que ese token no estaba limitado a una carpeta de aplicación: daba acceso a
// la raíz de la cuenta personal de Dropbox, donde viven los respaldos del
// punto de venta.
//
// Ahora la imagen se manda al backend, que es quien tiene las credenciales y
// quien decide en qué carpeta cae. Se conserva el nombre de este archivo para
// no tocar los imports de las pantallas de pedidos.

import { subirDiseno, apiConfigurada } from './api'

export const dropboxConfigured = apiConfigurada

/**
 * Sube la imagen de un pedido y devuelve la carpeta donde quedó.
 *
 * Antes devolvía la ruta completa del Dropbox y las pantallas la recortaban.
 * Ahora el backend devuelve solo la carpeta, así que el dato interno no sale
 * del servidor.
 */
export async function uploadStikerDropbox(slug, file, clienteName, modelo = '') {
  const { carpeta } = await subirDiseno(slug, file, clienteName, modelo)
  return carpeta
}
