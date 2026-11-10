import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  revisiones, guardarIncidencia, guardarAjuste, guardarCfg, borrarCfg,
} from '../lib/api'
import { estadoDe, codigosDeFicha, MOTIVOS, ESTADOS } from '../lib/ajustes'
import { useAjustes } from '../lib/useAjustes'
import { descargarBajas } from '../lib/exportarBajas'
import Bandeja from './Bandeja'
import { exportarRevisiones } from '../lib/exportarRevisiones'
import { SUCURSALES_ACTIVAS, SUCURSALES, BODEGA, nombreSucursal } from '../lib/sucursales'
import { inventarioJsonUrl } from '../lib/s3'
import { agruparPorModelo, alternativasDe } from '../lib/variantes'
import { codigosHuerfanos } from '../lib/anomalias'
import { agruparHuerfanos } from '../lib/lotes'
import { discrepanciasDeNombre } from '../lib/nombres'
import { patronesDeEscritura } from '../lib/patrones'
import { fichaDeCodigo, fichaDeLote, fichaDePatron, fichaDeNombre } from '../lib/fichas'

/**
 * La pestaña de Revisar: una BANDEJA de incidencias.
 *
 * ── Qué había antes, y por qué se quitó ─────────────────────────────────────
 *
 * Un recorrido de una ficha cada vez: el problema en una frase, qué se sabe,
 * una pregunta de sí o no, y qué pasa con cada respuesta. Funcionaba, y por
 * eso la primera vez se dejó puesto. Esa fue la equivocación. El dueño pidió
 * rediseñar la forma de operar, y dio las dos razones:
 *
 *   1. **«No se guardaban registros de los movimientos.»** Sólo quedaba el
 *      último estado de cada caso, así que no había forma de saber quién lo
 *      movió, cuándo, ni cuántas veces había vuelto. Ahora cada caso lleva su
 *      historial, y lo escribe el BACKEND con la sesión en la mano: un
 *      registro que el navegador pudiera redactar a gusto no probaría nada.
 *
 *   2. **«El llenado era muy obsoleto, era muy tedioso.»** Abrir la ficha,
 *      leer, pulsar, escribir el motivo a mano, pasar a la siguiente. Ciento
 *      doce veces. El objetivo que puso no es que funcione: es que
 *      **cualquiera lo haga el doble de rápido**.
 *
 * Lo que NO se tiró fue la información. Todo lo que enseñaba la ficha —lo que
 * se sabe, la tabla, los códigos, qué pasa si sí y si no, las otras fundas del
 * mismo teléfono— es la EVIDENCIA, y una decisión sin la evidencia delante es
 * la que se contesta mal. Vive ahora en el panel de detalle, al lado de la
 * lista. Lo que se quitó fue la obligación de pasar por ella de una en una.
 *
 * ── Qué se guarda y qué no ──────────────────────────────────────────────────
 *
 * Nada de lo que se arregla: los hallazgos salen de los datos, así que al
 * corregirlo en la caja desaparecen solos y el caso se cierra sin que nadie lo
 * marque. Se guarda lo que el dato no puede deducir —el estado, el motivo, de
 * quién es, para cuándo, el historial y los comentarios— y vive en el
 * servidor, no en el navegador: esta bandeja la trabajan las sucursales y lo
 * que conteste León tiene que llegar aquí. Cada quien escribe sólo su archivo
 * y al leerlos se juntan.
 */

const FERIAS = SUCURSALES.find(s => s.estacional)
const CLAVE = 'istuffs_revisar_marcas'
const CLAVE_VIEJA = 'istuffs_revisar_ignorados'

/** { huella: { estado, nota, motivo, fecha, por, historial, comentarios } } */
const leerMarcas = () => {
  try {
    const guardado = localStorage.getItem(CLAVE)
    if (guardado) return JSON.parse(guardado)
    const viejo = JSON.parse(localStorage.getItem(CLAVE_VIEJA) ?? '[]')
    return Object.fromEntries(viejo.map(id => [id, { estado: 'no' }]))
  } catch { return {} }
}

const guardarMarcas = m => {
  try { localStorage.setItem(CLAVE, JSON.stringify(m)) } catch { /* modo privado */ }
}

const bajar = async url => {
  const r = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' })
  if (!r.ok) throw new Error(String(r.status))
  return r.json()
}

export default function RevisarPanel() {
  const { token, session, isAdmin } = useAuth()
  const quien = isAdmin ? 'admin' : session?.branch

  const [inv, setInv] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [marcas, setMarcas] = useState(leerMarcas)
  const [sinRed, setSinRed] = useState(false)
  const [guardandoInc, setGuardandoInc] = useState(null)

  const plazas = useMemo(
    () => [BODEGA, ...SUCURSALES_ACTIVAS, ...(FERIAS ? [FERIAS] : [])], [])

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const pares = await Promise.all(plazas.map(async p =>
        [p.slug, await bajar(inventarioJsonUrl(p.slug)).catch(() => null)]))
      if (vivo) {
        setInv(Object.fromEntries(pares.filter(([, j]) => j)))
        setCargando(false)
      }
    })()
    return () => { vivo = false }
  }, [plazas])

  // Las respuestas de todos. Si el servidor no contesta se sigue con la copia
  // del navegador: se puede trabajar, pero se avisa de que no se comparte.
  useEffect(() => {
    if (!token) return
    let vivo = true
    revisiones(token)
      .then(r => { if (vivo && r?.marcas) { setMarcas(r.marcas); guardarMarcas(r.marcas); setSinRed(false) } })
      .catch(() => { if (vivo) setSinRed(true) })
    return () => { vivo = false }
  }, [token])

  /**
   * Guarda el estado de una incidencia.
   *
   * La clave es la HUELLA, no el id del hallazgo. Para tres de las cuatro
   * reglas son lo mismo; para un lote la huella incluye sus códigos, y ésa es
   * la diferencia que impide que un lote con otro contenido herede la
   * respuesta del anterior y entre a la bandeja ya contestado.
   *
   * El historial NO se arma aquí. Lo escribe el backend: el autor y la hora
   * los pone con la sesión en la mano, y un registro de movimientos que el
   * cliente pudiera redactar no serviría como registro.
   */
  const guardar = useCallback(async (inc, campos) => {
    const huella = inc.huella
    setGuardandoInc(huella)
    try {
      const r = await guardarIncidencia(huella, campos?.estado ?? null, campos ?? {}, token)
      setMarcas(prev => {
        const siguiente = { ...prev }
        if (!campos) delete siguiente[huella]
        else {
          siguiente[huella] = {
            ...(prev[huella] ?? {}), ...campos,
            fecha: new Date().toISOString(), por: quien,
            // El historial que devuelve el servidor manda sobre el local. Si
            // no contesta con él se deja el que había: inventar un renglón
            // aquí daría un historial que no está en el archivo.
            ...(r?.registro?.historial ? { historial: r.registro.historial } : {}),
            ...(r?.registro?.comentarios ? { comentarios: r.registro.comentarios } : {}),
          }
          delete siguiente[huella].comentario
        }
        guardarMarcas(siguiente)
        return siguiente
      })
      setSinRed(false)
    } catch {
      // Sin red se deja constancia en pantalla y NO se toca el estado local:
      // enseñar la incidencia como guardada cuando no salió sería peor que el
      // fallo, porque al recargar manda lo del servidor y se perdería.
      setSinRed(true)
    }
    setGuardandoInc(null)
  }, [token, quien])

  /**
   * Lo mismo, para varias de golpe.
   *
   * Es la mitad del rediseño: marcar catorce casos y asignarlos a una persona
   * con una fecha es un gesto, no catorce. Se manda de una en una porque cada
   * una escribe su propio renglón de historial, que es justo lo que no se
   * puede agrupar sin perderlo.
   */
  const guardarVarias = useCallback(async (incidencias, campos) => {
    setGuardandoInc('bloque')
    const ahora = new Date().toISOString()
    let fallo = false
    for (const inc of incidencias) {
      await guardarIncidencia(inc.huella, campos.estado, campos, token)
        .catch(() => { fallo = true })
    }
    setMarcas(prev => {
      const s = { ...prev }
      for (const inc of incidencias) {
        s[inc.huella] = { ...(prev[inc.huella] ?? {}), ...campos, fecha: ahora, por: quien }
      }
      guardarMarcas(s)
      return s
    })
    setSinRed(fallo)
    setGuardandoInc(null)
    // Se recargan del servidor para traer el historial que escribió él. Sin
    // esto el panel de detalle enseñaría los casos del bloque sin su último
    // movimiento, y el historial es la razón de ser de esto.
    if (token && !fallo) {
      revisiones(token).then(r => {
        if (r?.marcas) { setMarcas(r.marcas); guardarMarcas(r.marcas) }
      }).catch(() => setSinRed(true))
    }
  }, [token, quien])

  /** Una excepción o una entrada del catálogo. */
  const cfg = useCallback(async (id, campos) => {
    setGuardandoInc(id)
    try {
      await guardarCfg(id, campos, token)
      setMarcas(prev => {
        const s = { ...prev, [id]: { ...(prev[id] ?? {}), ...campos, fecha: new Date().toISOString(), por: quien } }
        guardarMarcas(s)
        return s
      })
      setSinRed(false)
    } catch { setSinRed(true) }
    setGuardandoInc(null)
  }, [token, quien])

  const revocarCfg = useCallback(async id => {
    setGuardandoInc(id)
    try {
      await borrarCfg(id, token)
      setMarcas(prev => {
        const s = { ...prev }
        delete s[id]
        guardarMarcas(s)
        return s
      })
      setSinRed(false)
    } catch { setSinRed(true) }
    setGuardandoInc(null)
  }, [token])

  // Las correcciones ya hechas. Lo ajustado deja de preguntarse: si ya
  // dijiste que ese código no existe, volver a sacarlo mañana es justo lo que
  // hace que la bandeja deje de mirarse.
  //
  // Se cargan con el mismo gancho que usa el dashboard. Con dos cargadores
  // distintos bastaría con que uno se quedara atrás para que el error
  // siguiera saliendo en esa pantalla y la corrección pareciera rota.
  const { correcciones, ocultos, descontinuados, setCorrecciones } = useAjustes(token)

  /**
   * Marca uno o varios códigos como que ya no existen.
   *
   * Se pinta al momento y se manda después, igual que las respuestas: el
   * trabajo va al ritmo de quien corrige, no al de la red.
   *
   * Al corregir se deja también el caso en «lo reviso yo» con su motivo, para
   * que el movimiento quede en el historial. Corregir sin apuntarlo sacaba el
   * caso de la pantalla sin dejar rastro de quién lo sacó.
   */
  const corregir = useCallback(async (codigos, producto, motivo, inc) => {
    const ahora = new Date().toISOString()
    setCorrecciones(c => {
      const s = { ...c }
      for (const cod of codigos) {
        const clave = `ocultar|${String(cod).toUpperCase()}`
        s[clave] = { clave, tipo: 'ocultar', codigo: String(cod).toUpperCase(), producto, motivo, cuando: ahora, quien }
      }
      return s
    })
    if (inc) {
      await guardar(inc, {
        estado: 'revisando', motivo: 'se-dio-de-baja',
        nota: `Dado de baja aquí: ${codigos.join(', ')}`,
      })
    }
    if (!token) return
    for (const cod of codigos) {
      await guardarAjuste({ codigo: cod, motivo, producto }, token).catch(() => setSinRed(true))
    }
  }, [token, quien, setCorrecciones, guardar])

  const deshacer = async codigo => {
    setCorrecciones(c => {
      const s = { ...c }
      delete s[`ocultar|${String(codigo).toUpperCase()}`]
      return s
    })
    if (token) await guardarAjuste({ codigo, motivo: null }, token).catch(() => setSinRed(true))
  }

  const { grupos, existencias } = useMemo(() => {
    const todos = new Map(), ex = {}
    for (const [slug, j] of Object.entries(inv ?? {})) {
      for (const p of j?.productos ?? []) {
        const c = String(p.Codigo ?? '').trim()
        if (!c) continue
        if (!todos.has(c)) todos.set(c, { Codigo: c, Producto: p.Producto })
        ;(ex[c] ??= {})[slug] = Number(p.Existencia) || 0
      }
    }
    return { grupos: agruparPorModelo([...todos.values()]), existencias: ex }
  }, [inv])

  // Todos los casos. El reporte sale de aquí: lo contestado es justo lo que
  // hay que analizar después.
  const todos = useMemo(() => {
    if (!inv?.[BODEGA.slug]) return []
    const tiendas = Object.fromEntries(
      Object.entries(inv).filter(([s]) => s !== BODEGA.slug))

    // Lo que bodega descontinuó y las tiendas están liquidando NO es un error:
    // es justo el escenario por el que el sistema reclamaba códigos «que bodega
    // no tiene». Se aparta ANTES de agrupar, no después, porque los lotes se
    // forman con lo que llega: filtrar un lote ya armado dejaba a medias a los
    // que tenían algún código marcado y otro no. Los marca el dueño en
    // «Depurar» (flag `descontinuado_bodega`, 2026-11-09); sigue siendo un
    // código normal que se vende y cuenta, sólo deja de salir aquí.
    const huerfanos = codigosHuerfanos({ inventarios: tiendas, bodega: inv[BODEGA.slug], grupos })
      .filter(h => !descontinuados.has(String(h.codigo).trim().toUpperCase()))
    const patrones = patronesDeEscritura({ inventarios: inv })
    const nombres = discrepanciasDeNombre({ inventarios: inv })

    // Las palabras que ya explica un patrón no se vuelven a preguntar de una
    // en una: sería la misma pregunta doscientas veces.
    const explicados = new Set(patrones.flatMap(p => p.codigos))

    const items = []

    // Lo que se contesta igual va junto. Preguntar código por código sacaba
    // 112 fichas y la mayoría se respondían con la misma frase a mano.
    const { lotes, sueltos } = agruparHuerfanos({ huerfanos, inventarios: tiendas })
    for (const l of lotes) items.push(fichaDeLote(l))
    for (const h of sueltos) items.push(fichaDeCodigo(h))

    for (const p of patrones) items.push(fichaDePatron(p))

    for (const n of nombres) {
      if (explicados.has(n.codigo)) continue
      if (n.fuente !== 'conflicto' && n.severidad !== 'media') continue
      items.push(fichaDeNombre(n))
    }

    return items
  }, [inv, grupos, descontinuados])

  /**
   * Lo ya corregido no se vuelve a sacar.
   *
   * Va aquí y no dentro de la bandeja porque la corrección es un ajuste del
   * dato —vive en `ajustes/`— y la bandeja sólo sabe de incidencias. Mezclarlo
   * allí haría que un caso corregido contara como abierto en las cuentas del
   * encabezado.
   */
  const vivos = useMemo(() => todos.filter(x => {
    const cs = codigosDeFicha(x)
    // Se va si TODOS sus códigos están dados de baja o descontinuados: con uno
    // que siga siendo un problema de verdad, la ficha se queda.
    return cs.length === 0 || cs.some(c => !ocultos.has(c) && !descontinuados.has(c))
  }), [todos, ocultos, descontinuados])

  const alternativas = useCallback(
    (codigo, producto) => alternativasDe(codigo, producto, grupos, existencias),
    [grupos, existencias])

  // Lo corregido aquí que la caja todavía no ha tocado. No desaparece: se
  // muda de «Atención» a esta bandeja, con su antigüedad. Sin eso, corregir
  // sería una forma cómoda de esconder problemas.
  //
  // Va aquí arriba y no junto a donde se dibuja: debajo del `return` de
  // «cargando», React cuenta un hook de menos en el primer dibujo y la
  // pantalla se cae entera con el error #310. Lo cazó `npm run verificar`.
  const pendientes = useMemo(() => {
    const out = []
    for (const a of Object.values(correcciones)) {
      const e = estadoDe(a, inv ?? {})
      if (e.estado === ESTADOS.PENDIENTE) out.push({ ...a, ...e })
    }
    return out.sort((x, y) => y.dias - x.dias)
  }, [correcciones, inv])

  if (cargando) return <p className="tablero-cargando">Leyendo el catálogo de las cinco plazas…</p>

  return (
    <div className="revisar">
      <header className="revisar-avance">
        {sinRed && (
          <span className="revisar-sinred" role="status">
            Sin conexión: lo que contestes no se está compartiendo
          </span>
        )}
        {isAdmin && (
          <button type="button" className="revisar-bajar"
                  style={{ marginInlineStart: 'auto' }}
                  onClick={() => exportarRevisiones(vivos, marcas)}>
            Descargar reporte
          </button>
        )}
      </header>

      <Bandeja hallazgos={vivos} registros={marcas} inventarios={inv ?? {}}
               onGuardar={guardar} onGuardarVarias={guardarVarias}
               onCfg={cfg} onRevocarCfg={revocarCfg} onCorregir={corregir}
               alternativas={alternativas} quien={quien}
               guardando={guardandoInc} />

      {pendientes.length > 0 && (
        <section className="rev-pendientes">
          <h3>
            Corregidos aquí, pendientes en la caja
            <span className="rev-pendientes-cuenta">{pendientes.length}</span>
            {/* El Excel, para llevarlo a la caja. La pagina NO puede borrar
                un codigo de Eleventa -el respaldo manda- asi que lo que si
                puede es llevar el control de lo que hay que borrar y
                ponerlo en papel. Una hoja por plaza, porque el trabajo es
                de cada tienda. */}
            <button type="button" className="rev-saltar" data-bajar-excel
                    style={{ marginInlineStart: 'auto' }}
                    onClick={() => {
                      const r = descargarBajas(correcciones, inv ?? {})
                      if (!r) setSinRed(false)
                    }}>
              Bajar la lista en Excel
            </button>
          </h3>
          <p>
            Ya no se reclaman en el panel. Se quitan solos de esta lista cuando el respaldo
            llegue sin ellos: nadie tiene que marcar nada como hecho.
          </p>
          <ul>
            {pendientes.map(p => (
              <li key={p.clave} className={p.insiste ? 'insiste' : undefined}>
                <span className="rev-pend-codigo">{p.codigo}</span>
                <span className="rev-pend-producto" title={p.producto}>{p.producto}</span>
                <span className="rev-pend-motivo">{MOTIVOS[p.motivo] ?? p.motivo}</span>
                <span className="rev-pend-donde">
                  {p.plazas.map(s => nombreSucursal(s)).join(' · ')}
                </span>
                <span className="rev-pend-dias">
                  {p.dias === 0 ? 'hoy' : `${p.dias} d`}
                </span>
                <button type="button" className="rev-saltar" onClick={() => deshacer(p.codigo)}>
                  Deshacer
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="tablero-nota">
        Cada movimiento queda apuntado con quién y cuándo, y lo escribe el servidor.{' '}
        <strong>Corregir</strong> saca el caso del panel y lo pasa a la lista de arriba: no
        desaparece, espera ahí hasta que el respaldo de la caja llegue sin el error, y entonces
        se retira solo.
      </p>
    </div>
  )
}
