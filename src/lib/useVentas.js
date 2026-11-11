// La venta línea por línea de cada plaza, para el panel.
//
// Viene del backend y no de S3 porque `ventas/` es un prefijo PRIVADO: lleva
// los nombres de los mayoristas y el de quién cobró cada ticket. Sólo
// administrador.
//
import { useEffect, useMemo, useState } from 'react'
import { ventas as pedirVentas } from './api'

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
    if (!token) { setCargando(false); return }
    let vivo = true
    setCargando(true)
    ;(async () => {
      const pares = await Promise.all(clave.split(',').filter(Boolean).map(async slug => {
        try {
          return [slug, await pedirVentas(slug, token)]
        } catch (e) {
          // Un 403 es «esta pantalla no es para ti» y hay que decirlo. Un 404
          // es «esa plaza no se ha extraído todavía», que NO es lo mismo que
          // «no vendió nada» y no puede acabar pintado como un cero: por eso
          // cae en null y la sección se la salta, en vez de enseñarla vacía.
          if (e?.codigo === 403 && vivo) setSinPermiso(true)
          return [slug, null]
        }
      }))
      if (!vivo) return
      setPorPlaza(Object.fromEntries(pares))
      setCargando(false)
    })()
    return () => { vivo = false }
  }, [token, clave])

  return useMemo(() => ({ porPlaza, cargando, sinPermiso }), [porPlaza, cargando, sinPermiso])
}
