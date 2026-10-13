// Orden por columna, compartido por las tablas del panel.
//
// Un clic ordena de mayor a menor, que es lo que casi siempre se quiere —ver
// primero lo que más urge— y otro clic invierte. El mismo criterio en todas,
// para no tener que recordar cuál hace qué.

import { useState } from 'react'

/**
 * La columna activa se guarda como CLAVE DE TEXTO, nunca como función.
 *
 * Esto no es un capricho de estilo. React trata cualquier función que llegue a
 * un `setState` como función de actualización: en vez de guardarla, la ejecuta
 * pasándole el estado anterior. Las columnas calculadas —«En bodega», las de
 * cada sucursal— guardaban su accesor, así que al hacer clic React llamaba
 * `f => bodegaStock[f.codigo]` con `null` y la página entera se quedaba en
 * blanco con un «Cannot read properties of null».
 *
 * Con una clave de texto para identificar y la función aparte, eso no puede
 * volver a pasar. De paso arregla otra cosa: comparar funciones por identidad
 * fallaba siempre, porque una flecha declarada dentro del render es nueva en
 * cada pasada, y esas columnas nunca se marcaban como activas ni invertían.
 */
export function useOrdenTabla(claveInicial = null) {
  const [orden, setOrden] = useState({ clave: claveInicial, valor: null, dir: -1 })

  const alternar = (clave, valor) => setOrden(o => (
    o.clave === clave
      ? { ...o, dir: -o.dir }
      : { clave, valor: valor ?? null, dir: -1 }
  ))

  const limpiar = () => setOrden({ clave: claveInicial, valor: null, dir: -1 })

  const ordenar = filas => {
    if (!orden.clave) return filas
    const leer = orden.valor ?? (f => f[orden.clave])

    return [...filas].sort((a, b) => {
      const va = leer(a), vb = leer(b)
      // Lo que no tiene valor se va al final SIEMPRE, mire uno donde mire: un
      // «—» arriba de la lista no es información, es estorbo.
      const na = va === null || va === undefined || va === ''
      const nb = vb === null || vb === undefined || vb === ''
      if (na && nb) return 0
      if (na) return 1
      if (nb) return -1
      if (typeof va === 'string' || typeof vb === 'string') {
        return String(va).localeCompare(String(vb)) * (orden.dir === -1 ? 1 : -1)
      }
      return (va - vb) * orden.dir
    })
  }

  return { campo: orden.clave, dir: orden.dir, alternar, ordenar, limpiar }
}
