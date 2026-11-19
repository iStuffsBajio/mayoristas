// Dar de baja un código —la ✕ junto al código— desde CUALQUIER pantalla.
//
// Nació en Inventarios. El dueño pidió el 2026-11-19 tenerla en todas las
// pestañas donde se ven modelos: «a veces estoy en Surtido o en Bodega y
// necesito dar de baja un modelo y tengo que ir a Inventarios». Vive aquí para
// que haya UNA forma de dar de baja y no una por pantalla: la misma nota
// (`ocultar` con motivo `dado-de-baja` en `ajustes/<quien>.json`), la misma
// clave y el mismo deshacer. Lo dado de baja aparece en «Lo que has dado de
// baja» de Inventarios y en Revisar como pendiente de borrar en la caja.

import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useAjustes } from './useAjustes'
import { guardarAjuste } from './api'

const claveOcultar = codigo => `ocultar|${String(codigo).trim().toUpperCase()}`

export function useBajas() {
  const { token, isAdmin } = useAuth()
  const ajustes = useAjustes(token)
  const { setCorrecciones } = ajustes
  const [bajando, setBajando] = useState(null)
  // { texto, codigo } — el código para poder deshacer desde el propio aviso:
  // fuera de Inventarios el renglón desaparece al pulsar, y sin deshacer a la
  // mano un dedazo obligaría a ir a buscarlo a otra pestaña.
  const [aviso, setAviso] = useState(null)

  // Dar de baja es una decisión de negocio: sólo el administrador. El backend
  // lo vuelve a comprobar; esto sólo evita enseñar el botón.
  const puede = !!isAdmin && !!token

  const darDeBaja = async fila => {
    if (!fila?.codigo) return
    setAviso(null)
    setBajando(fila.codigo)
    try {
      await guardarAjuste({ codigo: fila.codigo, motivo: 'dado-de-baja', producto: fila.producto }, token)
      // Se refleja de inmediato sin esperar a recargar: la clave es la misma
      // que arma `claveDe` en `ajustes.js`.
      const clave = claveOcultar(fila.codigo)
      setCorrecciones(prev => ({
        ...prev,
        [clave]: {
          clave, tipo: 'ocultar', codigo: String(fila.codigo).trim().toUpperCase(),
          producto: fila.producto, motivo: 'dado-de-baja', cuando: new Date().toISOString(),
        },
      }))
      setAviso({
        codigo: fila.codigo,
        texto: `${fila.codigo} dado de baja. Deja de contar en las listas, y en Revisar queda pendiente de borrarlo en la caja de cada plaza.`,
      })
    } catch (e) {
      setAviso({ texto: e?.mensaje || 'No se pudo dar de baja. Comprueba la sesión.' })
    }
    setBajando(null)
  }

  /** Devuelve un código a las listas. Se pinta al momento y se manda después. */
  const deshacerBaja = async codigo => {
    const clave = claveOcultar(codigo)
    setCorrecciones(prev => {
      const s = { ...prev }
      delete s[clave]
      return s
    })
    setAviso(a => (a?.codigo === codigo ? null : a))
    // Sin motivo, el backend retira el ajuste: la misma puerta, al revés.
    if (token) await guardarAjuste({ codigo, motivo: null }, token).catch(() => {})
  }

  return { ...ajustes, puede, bajando, aviso, setAviso, darDeBaja, deshacerBaja }
}
