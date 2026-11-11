// Los folios de surtido, para cualquier pantalla que los necesite.
//
// Vive aparte por lo mismo que `useAjustes`: los piden la pestaña de Surtido,
// donde se registran, y el dashboard, donde tienen que avisar. Si cada una los
// cargara por su cuenta, bastaría con que una se olvidara para que un folio
// con piezas faltantes no apareciera en ningún sitio.

import { useCallback, useEffect, useState } from 'react'
import { surtidos as pedirSurtidos, guardarSurtido, cerrarSurtido } from './api'
import { juntarFolios, nuevoFolio } from './surtidos'

/**
 * Devuelve los folios de todos, ya juntados, y cómo registrar y cerrar.
 *
 * Sin sesión o sin red devuelve vacío y lo dice con `sinRed`. Importa que lo
 * diga: una lista de surtidos vacía se lee como «no hay nada pendiente», que
 * es lo contrario de «no pude mirar».
 */
export function useSurtidos(token) {
  const [folios, setFolios] = useState({})
  const [sinRed, setSinRed] = useState(false)
  const [vuelta, setVuelta] = useState(0)

  useEffect(() => {
    if (!token) return
    let vivo = true
    pedirSurtidos(token)
      .then(r => {
        if (!vivo) return
        const porQuien = {}
        for (const f of r?.surtidos ?? []) (porQuien[f.quien] ??= []).push(f)
        setFolios(juntarFolios(porQuien))
        setSinRed(false)
      })
      .catch(() => { if (vivo) setSinRed(true) })
    return () => { vivo = false }
  }, [token, vuelta])

  const recargar = useCallback(() => setVuelta(v => v + 1), [])

  /**
   * Registra una salida.
   *
   * El folio se arma aquí con `nuevoFolio`, que es quien congela el «antes»
   * leyendo el inventario del destino. Hacerlo en el servidor no serviría: el
   * backend no tiene el inventario a la vista, y el «antes» sólo existe
   * mientras todavía es antes.
   */
  const registrar = useCallback(async ({ destino, lineas, inventarioDestino, quien }) => {
    const folio = nuevoFolio({ destino, lineas, quien, inventarioDestino })
    await guardarSurtido(folio, token)
    setFolios(f => ({ ...f, [folio.folio]: folio }))
    return folio
  }, [token])

  /** Da un folio por visto. No toca sus líneas ni su «antes». */
  const cerrar = useCallback(async folio => {
    await cerrarSurtido(folio, token)
    setFolios(f => ({ ...f, [folio]: { ...f[folio], cerrado: new Date().toISOString() } }))
  }, [token])

  return { folios, sinRed, registrar, cerrar, recargar }
}
