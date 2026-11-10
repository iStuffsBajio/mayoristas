// Las correcciones, para cualquier pantalla que las necesite.
//
// Vive aparte porque las piden al menos dos: Revisar, donde se hacen, y el
// dashboard, donde tienen que dejar de verse. Si cada una las cargara por su
// cuenta bastaría con que una se olvidara para que el error siguiera saliendo
// ahí y la corrección pareciera rota.

import { useEffect, useMemo, useState } from 'react'
import { ajustes as pedirAjustes } from './api'
import { juntarAjustes, codigosOcultos, codigosDescontinuados } from './ajustes'

/**
 * Devuelve las correcciones de todos, ya juntadas, y el conjunto de códigos
 * que el panel no debe volver a reclamar.
 *
 * Sin sesión o sin red devuelve vacío: una pantalla que no puede leer los
 * ajustes enseña el dato en crudo, que es lo honesto. Lo contrario -esconder
 * por si acaso- taparía problemas de verdad.
 */
export function useAjustes(token) {
  const [correcciones, setCorrecciones] = useState({})

  useEffect(() => {
    if (!token) return
    let vivo = true
    pedirAjustes(token)
      .then(r => {
        if (!vivo || !r?.ajustes) return
        const porQuien = {}
        for (const a of r.ajustes) (porQuien[a.quien] ??= []).push(a)
        setCorrecciones(juntarAjustes(porQuien))
      })
      .catch(() => { /* sin red se trabaja con el dato crudo */ })
    return () => { vivo = false }
  }, [token])

  const ocultos = useMemo(() => codigosOcultos(correcciones), [correcciones])
  // Lo que bodega descontinuó: no se esconde, pero la cola de revisión deja de
  // reclamarlo. Ver `codigosDescontinuados`.
  const descontinuados = useMemo(() => codigosDescontinuados(correcciones), [correcciones])

  return { correcciones, ocultos, descontinuados, setCorrecciones }
}
