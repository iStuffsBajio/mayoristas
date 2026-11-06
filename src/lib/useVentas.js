// La venta línea por línea de cada plaza, para el panel.
//
// Viene del backend y no de S3 porque `ventas/` es un prefijo PRIVADO: lleva
// los nombres de los mayoristas y el de quién cobró cada ticket. Sólo
// administrador.
//
// ── Por qué el fetch está aquí y no en `api.js` ───────────────────────────
//
// Debería estar en `api.js`, con los demás. Está aquí porque ese archivo lo
// está editando otra sesión a la vez y meter esto dentro habría atado este
// trabajo a un archivo que no se puede confirmar todavía. En cuanto los dos
// árboles converjan, esto se muda a `api.js` y se borra el fetch de abajo.
// Se deja escrito para que no parezca un descuido.

import { useEffect, useMemo, useState } from 'react'

const BASE = String(import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')

/**
 * Baja la venta de varias plazas.
 *
 * Devuelve `{ porPlaza, cargando, sinPermiso }`. Una plaza sin archivo cae en
 * `null` por su cuenta y las demás siguen: que a una le falte la extracción no
 * puede dejar la pantalla entera en blanco.
 */
export function useVentas(token, plazas) {
  const [porPlaza, setPorPlaza] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [sinPermiso, setSinPermiso] = useState(false)

  // Sin esto, pasar un array nuevo en cada dibujo relanza la descarga para
  // siempre. Ya pasó con otra pantalla.
  const clave = plazas.join(',')

  useEffect(() => {
    if (!token || !BASE) { setCargando(false); return }
    let vivo = true
    setCargando(true)
    ;(async () => {
      const pares = await Promise.all(clave.split(',').filter(Boolean).map(async slug => {
        try {
          const r = await fetch(`${BASE}/ventas?plaza=${encodeURIComponent(slug)}`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          // Un 403 es «esta pantalla no es para ti» y hay que decirlo; un 404
          // es «esa plaza no se ha extraido todavia», que no es lo mismo que
          // «no vendio nada» y tampoco puede salir como un cero.
          if (r.status === 403) { if (vivo) setSinPermiso(true); return [slug, null] }
          if (!r.ok) return [slug, null]
          return [slug, await r.json()]
        } catch { return [slug, null] }
      }))
      if (!vivo) return
      setPorPlaza(Object.fromEntries(pares))
      setCargando(false)
    })()
    return () => { vivo = false }
  }, [token, clave])

  return useMemo(() => ({ porPlaza, cargando, sinPermiso }), [porPlaza, cargando, sinPermiso])
}
