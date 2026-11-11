// La nómina, cargada y lista para pintar. La usan «Mi pago» de cada tienda y
// «Nómina y RH» del administrador: la misma cuenta en las dos pantallas.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { nomina as pedirNomina, guardarConfigNomina, accionNomina, subirFotoNomina } from './api'
import { configCompleta, semanaNomina, ultimoDatoPorPlaza, PLAZAS_NOMINA } from './nomina'
import { hoyLocal } from './fechas'

/** Reduce una foto a 1600 px de lado y JPEG: un recibo no necesita más, y la Lambda tiene tope. */
export async function prepararFoto(archivo) {
  const url = URL.createObjectURL(archivo)
  try {
    const img = await new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = mal; i.src = url })
    const escala = Math.min(1, 1600 / Math.max(img.width, img.height))
    const c = document.createElement('canvas')
    c.width = Math.round(img.width * escala); c.height = Math.round(img.height * escala)
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', 0.82).split(',')[1]
  } finally { URL.revokeObjectURL(url) }
}

export function useNomina(token) {
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [vuelta, setVuelta] = useState(0)

  useEffect(() => {
    if (!token) { setCargando(false); return }
    let vivo = true
    setCargando(true)
    pedirNomina(token)
      .then(r => { if (vivo) { setDatos(r); setError(null) } })
      // Un fallo se DICE: una nómina vacía se leería como «no hay nada que pagar».
      .catch(e => { if (vivo) setError(e.message || 'No se pudo leer la nómina.') })
      .finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
  }, [token, vuelta])

  const config = useMemo(() => configCompleta(datos?.config), [datos])
  const hoy = datos?.hoy ?? hoyLocal()
  const plazaSesion = datos?.plaza ?? null
  const plazas = useMemo(() => (plazaSesion ? [plazaSesion] : PLAZAS_NOMINA), [plazaSesion])
  const ultimoDato = useMemo(() => ({ ...ultimoDatoPorPlaza(datos?.turnos), ...(datos?.ultimoDato ?? {}) }), [datos])

  /** La semana de un lunes, por registro de pago. */
  const semana = useCallback(lunes => semanaNomina({
    config, estado: datos?.estado ?? {}, turnos: datos?.turnos ?? [], comisionables: datos?.comisionables ?? {},
    lunes, hoy, ultimoDato, plazas,
  }), [config, datos, hoy, ultimoDato, plazas])

  const accion = useCallback(async a => {
    const r = await accionNomina(a, token)
    setDatos(d => ({ ...d, estado: r.estado }))
    return r
  }, [token])

  const guardarConfig = useCallback(async (cfg, motivo) => {
    const r = await guardarConfigNomina(cfg, motivo, token)
    setDatos(d => ({ ...d, config: r.config }))
    setVuelta(v => v + 1)   // vuelve a leer la bitácora
    return r
  }, [token])

  const subirFoto = useCallback(async archivo => (await subirFotoNomina(await prepararFoto(archivo), token)).foto, [token])

  return {
    cargando, error, hoy, config, plazas, datos, semana, accion, guardarConfig, subirFoto,
    estado: datos?.estado ?? {}, bitacora: datos?.bitacora ?? [], comisionables: datos?.comisionables ?? {},
    recargar: () => setVuelta(v => v + 1),
  }
}
