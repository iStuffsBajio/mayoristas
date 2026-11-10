// El corte semanal de las sucursales, listo para pintar.
//
// Vive aparte por lo mismo que `useCaja`: lo piden dos pantallas —la de cada
// tienda y la del administrador— y si cada una lo cargara por su cuenta, una
// podría quedarse con cuentas distintas de la otra.
//
// Una tienda recibe sólo su plaza; el administrador, todas. Quien decide es el
// servidor (`GET /corte`): aquí no se filtra nada que haya que proteger.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { corte as pedirCorte, guardarConteo, guardarFondoCaja } from './api'
import { PLAZAS_CORTE, bloquesDeCorte } from './corte'
import { hoyLocal } from './fechas'
import { INICIO_HISTORIAL, semanaDe } from './caja'


const comoFecha = f => { const [y, m, d] = String(f).split('-').map(Number); return new Date(y, m - 1, d) }
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const correr = (fecha, dias) => { const d = comoFecha(fecha); d.setDate(d.getDate() + dias); return iso(d) }

/**
 * `plaza` en `null` pide lo que le toque a la sesión: la suya a una tienda,
 * todas al administrador.
 */
export function useCorte(token, plaza = null) {
  const [datos, setDatos]       = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError]       = useState(null)
  const [vuelta, setVuelta]     = useState(0)

  // La fecha de HOY sale del calendario de aquí, no de UTC: pasadas las 18:00
  // de México `toISOString()` ya es mañana, y la semana en curso saltaba a la
  // siguiente. Ver `hoyLocal` en `fechas.js`.
  const hoy = useMemo(() => hoyLocal(), [vuelta])
  const [referencia, setReferencia] = useState(hoy)

  useEffect(() => {
    if (!token) { setCargando(false); return }
    let vivo = true
    setCargando(true)
    pedirCorte(plaza, token)
      .then(r => { if (vivo) { setDatos(r); setError(null) } })
      // Un fallo se DICE. Una semana vacía se lee como «no se vendió», que es
      // lo contrario de «no pude mirar».
      .catch(e => { if (vivo) setError(e.message || 'No se pudo leer el corte.') })
      .finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
  }, [token, plaza, vuelta])

  const plazas = useMemo(() => PLAZAS_CORTE
    .filter(p => datos?.plazas?.[p.slug])
    .map(p => {
      const d = datos.plazas[p.slug]
      const calculo = bloquesDeCorte({
        plaza: p, fecha: referencia,
        caja: d.caja, ventas: d.ventas, params: d.parametros, conteos: d.conteos ?? {},
      })
      return {
        ...p, ...calculo,
        parametros: d.parametros,
        ventas: d.ventas,
        // Un archivo que no existe llega como `{}`: «no se ha extraído», que NO
        // es «no se vendió nada».
        sinDatos: !d.caja?.hayDatos,
        respaldo: d.caja?.respaldo ?? null,
      }
    }), [datos, referencia])

  /** Corre la vista `n` semanas, sin pasar de la actual ni del inicio del corte. */
  const mover = useCallback(n => {
    setReferencia(r => {
      const sig = correr(r, n * 7)
      if (sig > hoy) return hoy
      if (semanaDe(sig).desde < semanaDe(INICIO_HISTORIAL).desde) return r
      return sig
    })
  }, [hoy])

  const esActual = semanaDe(referencia).desde === semanaDe(hoy).desde
  const hayAnterior = semanaDe(correr(referencia, -7)).desde >= semanaDe(INICIO_HISTORIAL).desde

  const guardar = useCallback(async ({ plaza: p, semana, cantidades, observaciones }) => {
    const r = await guardarConteo({ plaza: p, semana, cantidades, observaciones }, token)
    // Se pinta lo que el servidor guardó, con su autor y su hora, sin esperar a
    // otra lectura: es lo que dice quién contó y cuándo.
    setDatos(d => ({
      ...d,
      plazas: { ...d.plazas, [p]: { ...d.plazas[p], conteos: { ...(d.plazas[p].conteos ?? {}), [semana]: r.registro } } },
    }))
    return r.registro
  }, [token])

  /** El administrador asigna el fondo de una plaza; se pinta lo que guardó el servidor. */
  const guardarFondo = useCallback(async (p, fondoFijo) => {
    const r = await guardarFondoCaja({ sucursal: p, fondoFijo }, token)
    setDatos(d => ({
      ...d,
      plazas: { ...d.plazas, [p]: { ...d.plazas[p], parametros: { ...(d.plazas[p].parametros ?? {}), fondoFijo: r.fondoFijo } } },
    }))
    return r.fondoFijo
  }, [token])

  const recargar = useCallback(() => setVuelta(v => v + 1), [])

  return { plazas, cargando, error, hoy, referencia, mover, esActual, hayAnterior, guardar, guardarFondo, recargar, hoyServidor: datos?.hoy ?? null }
}

