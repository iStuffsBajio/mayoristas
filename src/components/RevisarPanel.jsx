import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { revisiones, guardarRevision } from '../lib/api'
import { exportarRevisiones } from '../lib/exportarRevisiones'
import { SUCURSALES_ACTIVAS, SUCURSALES, BODEGA, nombreSucursal } from '../lib/sucursales'
import { inventarioJsonUrl } from '../lib/s3'
import { agruparPorModelo, alternativasDe } from '../lib/variantes'
import { codigosHuerfanos, MOTIVO } from '../lib/anomalias'
import { discrepanciasDeNombre } from '../lib/nombres'
import { patronesDeEscritura } from '../lib/patrones'
import { fichaDeCodigo, fichaDeMuertos, fichaDePatron, fichaDeNombre } from '../lib/fichas'

/**
 * La cola de revisión: un problema a la vez, con una pregunta que se contesta
 * sí o no.
 *
 * La primera versión era una lista de 140 renglones. La segunda ya iba de uno
 * en uno, pero sólo describía: enseñaba el hallazgo y dejaba al lector decidir
 * qué hacer con él. Describir no es preguntar, y una pantalla que describe se
 * lee y se cierra.
 *
 * Ahora cada ficha tiene cuatro partes y siempre las mismas:
 *
 *   1. **El problema**, en una frase.
 *   2. **Qué se sabe**: los hechos que lo sostienen, sin adjetivos. Tres
 *      plazas tienen este código, bodega no lo tiene, bodega sí tiene este
 *      otro para el mismo teléfono.
 *   3. **La pregunta**, redactada de modo que **sí signifique «aplica la
 *      propuesta»**. Eso es lo que permite que la respuesta se convierta sola
 *      en una instrucción concreta en vez de quedarse en una opinión.
 *   4. **Qué pasa con cada respuesta**, escrito antes de contestar.
 *
 * ── Por qué el «no» obliga a explicar ───────────────────────────────────────
 *
 * Un «sí» ya lleva la solución dentro: la propuesta. Un «no» sólo dice que la
 * propuesta no vale, y eso deja el problema igual que estaba y además hace
 * que el detector vuelva a proponer lo mismo mañana. Por eso el «no» no se
 * puede guardar vacío: hace falta decir cómo se resuelve, y eso es lo que
 * convierte la cola en algo de lo que se aprende.
 *
 * ── Qué se guarda y qué no ──────────────────────────────────────────────────
 *
 * Nada de lo que se arregla: los hallazgos salen de los datos, así que al
 * corregirlo en la caja desaparecen solos. Se guardan las respuestas, que el
 * dato no puede deducir, y viven en el servidor, no en el navegador: esta cola
 * la contestan las sucursales y lo que conteste León tiene que llegar aquí.
 * Cada quien escribe sólo su archivo y al leerlos se juntan.
 */

const FERIAS = SUCURSALES.find(s => s.estacional)
const CLAVE = 'istuffs_revisar_marcas'
const CLAVE_VIEJA = 'istuffs_revisar_ignorados'

/** { id: { estado: 'si' | 'no', nota, fecha, por } } */
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

const comoFecha = iso => {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

const bajar = async url => {
  const r = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' })
  if (!r.ok) throw new Error(String(r.status))
  return r.json()
}

/** Las marcas viejas hablaban de pendiente/ignorado; se leen como sí/no. */
const respuestaDe = marca => {
  if (!marca) return null
  if (marca.estado === 'si' || marca.estado === 'pendiente') return 'si'
  if (marca.estado === 'no' || marca.estado === 'ignorado') return 'no'
  return null
}

export default function RevisarPanel() {
  const { token, session, isAdmin } = useAuth()
  const quien = isAdmin ? 'admin' : session?.branch

  const [inv, setInv] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [i, setI] = useState(0)
  const [marcas, setMarcas] = useState(leerMarcas)
  const [sinRed, setSinRed] = useState(false)
  const [eligiendo, setEligiendo] = useState(null)   // 'si' | 'no' | null
  const [borrador, setBorrador] = useState('')

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

  // Todos los casos, contestados o no. El reporte sale de aquí y no de la
  // cola: lo contestado es justo lo que hay que analizar después.
  const todos = useMemo(() => {
    if (!inv?.[BODEGA.slug]) return []
    const tiendas = Object.fromEntries(
      Object.entries(inv).filter(([s]) => s !== BODEGA.slug))

    const huerfanos = codigosHuerfanos({ inventarios: tiendas, bodega: inv[BODEGA.slug], grupos })
    const patrones = patronesDeEscritura({ inventarios: inv })
    const nombres = discrepanciasDeNombre({ inventarios: inv })

    // Las palabras que ya explica un patrón no se vuelven a preguntar de una
    // en una: sería la misma pregunta doscientas veces.
    const explicados = new Set(patrones.flatMap(p => p.codigos))

    const items = []

    const muertos = huerfanos.filter(h => h.motivo === MOTIVO.DESCONTINUADO && h.piezas === 0)
    const enBloque = new Set(muertos.length >= 3 ? muertos.map(h => h.codigo) : [])

    for (const h of huerfanos) {
      if (!enBloque.has(h.codigo)) items.push(fichaDeCodigo(h))
    }
    if (enBloque.size) items.push(fichaDeMuertos(muertos))

    for (const p of patrones) items.push(fichaDePatron(p))

    for (const n of nombres) {
      if (explicados.has(n.codigo)) continue
      if (n.fuente !== 'conflicto' && n.severidad !== 'media') continue
      items.push(fichaDeNombre(n))
    }

    return items
  }, [inv, grupos])

  // Lo contestado no se esconde —contestar no lo arregla— pero va al final:
  // lo que no ha mirado nadie es lo que hace falta mirar.
  const cola = useMemo(() => {
    const hecho = x => (marcas[x.id] ? 1 : 0)
    return [...todos].sort((a, b) => hecho(a) - hecho(b)
      || (a.bloque === b.bloque
        ? b.peso - a.peso
        : a.bloque === 'codigo' ? -1 : 1))
  }, [todos, marcas])

  if (cargando) return <p className="tablero-cargando">Leyendo el catálogo de las cinco plazas…</p>

  const total = cola.length
  if (!total) {
    return (
      <section className="tarjeta revisar-fin">
        <h4>No hay nada que revisar</h4>
        <p className="tarjeta-sub">El catálogo de las cinco plazas concuerda.</p>
      </section>
    )
  }

  const contestados = cola.filter(x => marcas[x.id]).length
  const pos = Math.min(i, total - 1)
  const item = cola[pos]
  const marca = marcas[item.id]
  const respuesta = respuestaDe(marca)

  const irA = n => {
    setEligiendo(null)
    setBorrador('')
    setI(Math.max(0, Math.min(n, total - 1)))
  }

  const elegir = sino => {
    setEligiendo(sino)
    setBorrador(marca?.nota ?? '')
  }

  // El «no» sin explicación no se guarda: deja el problema igual y hace que
  // mañana se vuelva a proponer lo mismo.
  const faltaExplicar = eligiendo === 'no' && !borrador.trim()

  const guardar = () => {
    if (faltaExplicar) return
    const nota = borrador.trim()
    setMarcas(m => {
      const s = { ...m, [item.id]: { estado: eligiendo, nota, fecha: new Date().toISOString(), por: quien } }
      guardarMarcas(s)
      return s
    })
    // Se pinta ya y se manda después: contestar va al ritmo de quien contesta,
    // no al de la red. Si el envío falla se avisa arriba, porque al recargar
    // manda lo que haya en el servidor y esa respuesta se perdería.
    if (token) guardarRevision(item.id, eligiendo, nota, token).catch(() => setSinRed(true))
    setEligiendo(null)
    setBorrador('')
    setI(n => Math.min(n + 1, total - 1))
  }

  const alt = item.codigo
    ? alternativasDe(item.codigo, item.producto, grupos, existencias).slice(0, 3)
    : []

  return (
    <div className="revisar">
      <header className="revisar-avance">
        <span className="revisar-cuenta"><strong>{pos + 1}</strong> de {total}</span>
        <span className="revisar-barra" aria-hidden="true">
          <span style={{ width: `${(contestados / total) * 100}%` }} />
        </span>
        {sinRed && (
          <span className="revisar-sinred" role="status">
            Sin conexión: lo que contestes no se está compartiendo
          </span>
        )}
        <span className="revisar-pendientes">{contestados} contestados</span>
        {isAdmin && (
          <button type="button" className="revisar-bajar"
                  onClick={() => exportarRevisiones(todos, marcas)}>
            Descargar reporte
          </button>
        )}
        <span className={'revisar-sello sello-' + item.bloque}>
          {item.bloque === 'codigo' ? 'Código' : 'Nombre'}
        </span>
      </header>

      <section className={'tarjeta revisar-ficha' + (respuesta ? ' es-contestada' : '')}>
        {respuesta && (
          <p className={'rev-marca marca-' + respuesta}>
            <strong>{respuesta === 'si' ? 'Contestado: sí' : 'Contestado: no'}</strong>
            <span>
              {comoFecha(marca.fecha)}
              {marca.por && ` · ${marca.por === 'admin' ? 'administración' : nombreSucursal(marca.por)}`}
            </span>
            <em>{respuesta === 'si' ? item.siHacer : marca.nota}</em>
          </p>
        )}

        {item.chip && <p className="rev-chip">{item.chip}</p>}
        <h4>{item.titulo}</h4>

        <div className="rev-saber">
          <p className="rev-subtitulo">Qué se sabe</p>
          <ul>{item.contexto.map(c => <li key={c}>{c}</li>)}</ul>
        </div>

        {item.tabla && (
          <table className="rev-tabla">
            <thead>
              <tr>
                {item.tabla.cabeceras.map((c, n) => (
                  <th key={n} scope="col" className={n ? 'num' : ''}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {item.tabla.filas.map((f, n) => (
                <tr key={n} className={item.tabla.destacar === n ? 'destacada' : ''}>
                  {f.map((celda, m) => (m === 0
                    ? <th key={m} scope="row">{celda}</th>
                    : <td key={m} className="num">{celda}</td>))}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {item.detalle && (
          <details className="rev-detalle">
            <summary>Ver los códigos ({item.detalle.length})</summary>
            <ul>{item.detalle.map(d => <li key={d}>{d}</li>)}</ul>
          </details>
        )}

        {alt.length > 0 && (
          <div className="rev-alternativas">
            <p className="rev-subtitulo">Otras fundas del mismo teléfono, con existencia</p>
            <ul>
              {alt.map(a => (
                <li key={a.codigo}>
                  <span className="rev-codigo">{a.codigo}</span>
                  <span className="rev-nombre">{a.producto}</span>
                  <span className="rev-dato">
                    {a.total} pz · {Object.entries(a.donde).filter(([, n]) => n > 0)
                      .map(([s, n]) => `${nombreSucursal(s)} ${n}`).join(', ')}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="rev-pregunta">
          <h5>{item.pregunta}</h5>
          <ul className="rev-consecuencias">
            <li><span className="rev-si">Sí</span> {item.siHacer}</li>
            <li><span className="rev-no">No</span> {item.noHacer}</li>
          </ul>
        </div>

        {eligiendo ? (
          <div className="rev-nota">
            <label htmlFor="rev-nota-campo">
              {eligiendo === 'si'
                ? '¿Algo que añadir o que investigar después? (opcional)'
                : `${item.noPide} (obligatorio)`}
            </label>
            <textarea
              id="rev-nota-campo"
              rows={eligiendo === 'si' ? 2 : 3}
              value={borrador}
              autoFocus
              aria-invalid={faltaExplicar || undefined}
              placeholder={eligiendo === 'si'
                ? 'Ej.: lo cambia Brenda esta semana'
                : 'Sin esto no se puede guardar: el problema se queda igual'}
              onChange={e => setBorrador(e.target.value)} />
            {faltaExplicar && (
              <p className="rev-falta" role="status">
                Un «no» sin explicación deja el problema igual y mañana se vuelve a proponer.
              </p>
            )}
            <div className="rev-botones">
              <button type="button" className="boton-tinta" onClick={guardar} disabled={faltaExplicar}>
                Guardar respuesta
              </button>
              <button type="button" className="rev-saltar" onClick={() => setEligiendo(null)}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="rev-botones">
            <button type="button" className="rev-responde rev-es-si" onClick={() => elegir('si')}>
              Sí
            </button>
            <button type="button" className="rev-responde rev-es-no" onClick={() => elegir('no')}>
              No
            </button>
            <button type="button" className="rev-saltar" onClick={() => irA(pos + 1)}>
              {respuesta ? 'Siguiente' : 'Lo veo después'}
            </button>
            {pos > 0 && (
              <button type="button" className="rev-saltar" onClick={() => irA(pos - 1)}>
                Atrás
              </button>
            )}
          </div>
        )}
      </section>

      <p className="tablero-nota">
        Contestar no corrige nada: los hallazgos salen de los datos y desaparecen solos cuando
        el catálogo cambia en la caja. Lo que queda aquí es el porqué de cada decisión, que es
        lo que sirve para que el mismo error no se repita.
      </p>
    </div>
  )
}
