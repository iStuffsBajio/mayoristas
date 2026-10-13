// Orden por columna, compartido por las tablas del panel.
//
// Un clic ordena de mayor a menor, que es lo que casi siempre se quiere —ver
// primero lo que más urge— y otro clic invierte. El mismo criterio en todas,
// para no tener que recordar cuál hace qué.

import { useState } from 'react'

export function useOrdenTabla(campoInicial = null) {
  const [campo, setCampo] = useState(campoInicial)
  const [dir, setDir] = useState(-1)   // -1 de mayor a menor, 1 al revés

  const alternar = c => {
    if (c === campo) setDir(d => -d)
    else { setCampo(c); setDir(-1) }
  }

  const ordenar = filas => {
    if (!campo) return filas
    const valor = f => {
      const v = typeof campo === 'function' ? campo(f) : f[campo]
      return v
    }
    return [...filas].sort((a, b) => {
      const va = valor(a), vb = valor(b)
      // Lo que no tiene valor se va al final SIEMPRE, mire uno donde mire:
      // un «—» arriba de la lista no es información, es estorbo.
      const na = va === null || va === undefined || va === ''
      const nb = vb === null || vb === undefined || vb === ''
      if (na && nb) return 0
      if (na) return 1
      if (nb) return -1
      if (typeof va === 'string' || typeof vb === 'string') {
        return String(va).localeCompare(String(vb)) * (dir === -1 ? 1 : -1)
      }
      return (va - vb) * dir
    })
  }

  const limpiar = () => { setCampo(campoInicial); setDir(-1) }

  return { campo, dir, alternar, ordenar, limpiar }
}
