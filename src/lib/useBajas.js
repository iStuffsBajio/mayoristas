// Lo que se puede HACER con un modelo desde cualquier tabla del panel: darlo
// de baja (la ✕) y editarlo (el ✏️: nota, nombre, código, costo, precios).
// Todo lo que se cambia queda en la bitácora, que escribe el servidor.
//
// La ✕ nació en Inventarios. El dueño pidió el 2026-11-19 tenerla en todas las
// pestañas donde se ven modelos: «a veces estoy en Surtido o en Bodega y
// necesito dar de baja un modelo y tengo que ir a Inventarios». Y ese mismo día
// lo demás: «que las tablas y menús pueda editar cosas y todo lo que edite se
// registre en el reporte». Vive aquí para que haya UNA forma de hacer cada
// cosa, no una por pantalla.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useAjustes } from './useAjustes'
import { guardarAjuste, ediciones as pedirEdiciones, guardarEdicion as mandarEdicion, apuntarCambio } from './api'
import { juntarEdiciones, porCodigo as agruparPorCodigo } from './ediciones'

const claveOcultar = codigo => `ocultar|${String(codigo).trim().toUpperCase()}`

/**
 * `pantalla` dice desde dónde se hizo cada cambio, para la bitácora.
 * `inventarios` ({ slug: inventario }, opcional) deja que el editor enseñe el
 * valor que hoy tiene Eleventa y que el reporte diga qué ya quedó hecho.
 */
export function useBajas({ pantalla = '', inventarios = null } = {}) {
  const { token, isAdmin, session } = useAuth()
  const ajustes = useAjustes(token)
  const { setCorrecciones } = ajustes
  const [bajando, setBajando] = useState(null)
  // { texto, codigo } — el código para poder deshacer desde el propio aviso:
  // fuera de Inventarios el renglón desaparece al pulsar, y sin deshacer a la
  // mano un dedazo obligaría a ir a buscarlo a otra pestaña.
  const [aviso, setAviso] = useState(null)

  // Dar de baja es una decisión de negocio: sólo el administrador. Editar, el
  // administrador y bodega —bodega es quien sabe el costo—. El backend lo
  // vuelve a comprobar; esto sólo evita enseñar botones que va a rechazar.
  const puede = !!isAdmin && !!token
  const puedeEditar = !!token && (!!isAdmin || session?.branch === 'bodega')

  // ── Ediciones y bitácora ──
  const [listaEdiciones, setListaEdiciones] = useState([])
  const [bitacora, setBitacora] = useState([])
  const [editando, setEditando] = useState(null)   // la fila abierta en el editor

  useEffect(() => {
    if (!puedeEditar) return
    let vivo = true
    pedirEdiciones(token)
      .then(r => { if (vivo && r) { setListaEdiciones(r.ediciones ?? []); setBitacora(r.bitacora ?? []) } })
      .catch(() => { /* sin red, la tabla se ve en crudo */ })
    return () => { vivo = false }
  }, [token, puedeEditar])

  const edicionesJuntas = useMemo(() => juntarEdiciones(listaEdiciones), [listaEdiciones])
  const edicionesPorCodigo = useMemo(() => agruparPorCodigo(edicionesJuntas), [edicionesJuntas])

  const anotarLocal = useCallback(renglones => {
    if (renglones?.length) setBitacora(b => [...[...renglones].reverse(), ...b])
  }, [])

  /** Guarda lo cambiado en el editor. Devuelve el número de cambios o lanza. */
  const guardarEdicion = async (fila, cambios, nota = '') => {
    const codigo = String(fila.codigo).trim().toUpperCase()
    const r = await mandarEdicion({ codigo, producto: fila.producto ?? '', pantalla, nota, cambios }, token)
    // Lo de este código y de esta persona se sustituye por lo que contestó el
    // servidor, que es lo que de verdad quedó guardado.
    const quien = r?.renglones?.[0]?.quien ?? r?.ediciones?.[0]?.quien
    if (r?.cambios) {
      setListaEdiciones(previas => [
        ...previas.filter(e => !(String(e.codigo).toUpperCase() === codigo && (!quien || e.quien === quien))),
        ...(r.ediciones ?? []),
      ])
      anotarLocal(r.renglones)
    }
    return r?.cambios ?? 0
  }

  /** Apunta en la bitácora un cambio de cantidad (su estado vive en el navegador). */
  const apuntarCantidad = (fila, antes, despues, donde = pantalla) => {
    if (!puedeEditar || antes === despues) return
    apuntarCambio({ tipo: 'cantidad', codigo: fila.codigo, producto: fila.producto ?? '', pantalla: donde, antes, despues }, token)
      .then(r => anotarLocal(r?.renglon ? [r.renglon] : []))
      .catch(() => {})
  }

  // ── Dar de baja ──
  const darDeBaja = async fila => {
    if (!fila?.codigo) return
    setAviso(null)
    setBajando(fila.codigo)
    try {
      await guardarAjuste({ codigo: fila.codigo, motivo: 'dado-de-baja', producto: fila.producto, pantalla }, token)
      // Se refleja de inmediato sin esperar a recargar: la clave es la misma
      // que arma `claveDe` en `ajustes.js`.
      const clave = claveOcultar(fila.codigo)
      const cuando = new Date().toISOString()
      setCorrecciones(prev => ({
        ...prev,
        [clave]: {
          clave, tipo: 'ocultar', codigo: String(fila.codigo).trim().toUpperCase(),
          producto: fila.producto, motivo: 'dado-de-baja', cuando,
        },
      }))
      anotarLocal([{ id: `local-${cuando}`, cuando, codigo: fila.codigo, producto: fila.producto, tipo: 'baja',
                     antes: null, despues: 'dado-de-baja', pantalla, quien: isAdmin ? 'admin' : session?.branch }])
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
    const cuando = new Date().toISOString()
    anotarLocal([{ id: `local-${cuando}`, cuando, codigo, tipo: 'baja', antes: 'dado-de-baja', despues: null, pantalla,
                   quien: isAdmin ? 'admin' : session?.branch }])
    // Sin motivo, el backend retira el ajuste: la misma puerta, al revés.
    if (token) await guardarAjuste({ codigo, motivo: null, pantalla }, token).catch(() => {})
  }

  return {
    ...ajustes, puede, bajando, aviso, setAviso, darDeBaja, deshacerBaja,
    puedeEditar, pantalla, inventarios,
    ediciones: edicionesJuntas, edicionesPorCodigo, bitacora,
    editando, abrirEditor: setEditando, cerrarEditor: () => setEditando(null),
    guardarEdicion, apuntarCantidad,
  }
}
