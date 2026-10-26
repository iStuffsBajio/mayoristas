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

/**
 * La cola de revisión: un hallazgo a la vez, con su tabla, para ir puliendo
 * el catálogo decisión por decisión.
 *
 * La primera versión era una lista de 140 renglones. Ante 140 renglones nadie
 * empieza. Ante uno con su tabla al lado, se contesta y se pasa al siguiente.
 *
 * ── Agrupar antes de preguntar ──────────────────────────────────────────────
 *
 * Lo que más importa de esta pantalla no es el orden, es el TAMAÑO de cada
 * pregunta. «GALAXY o SAMSUNG» no son 189 correcciones sueltas: es una
 * convención de bodega contra otra de las tiendas, una sola respuesta que
 * ordena 240 renglones. Esos patrones salen de `patrones.js` y van como un
 * hallazgo único, con el reparto de cada plaza a la vista para poder decidir
 * mirando el dato y no la intuición.
 *
 * Lo mismo con los códigos muertos: los descontinuados que ya no tienen
 * piezas se preguntan de una vez, porque la respuesta es la misma para todos.
 *
 * ── Qué se guarda y qué no ──────────────────────────────────────────────────
 *
 * Nada de lo que se arregla. Los hallazgos salen de los datos, así que al
 * corregirlo en la caja desaparecen solos en la siguiente sincronización: no
 * hay que marcar nada como hecho ni puede quedarse desincronizado.
 *
 * Se guardan sólo las dos marcas que el dato no puede deducir:
 *
 *   · **pendiente** — alguien ya lo está corrigiendo, con una nota para saber
 *     quién o en qué quedó. Sin esto, mañana vuelve a salir igual que ayer y
 *     no hay forma de distinguir «no lo he visto» de «está en marcha».
 *   · **no es error** — una decisión que contradice al detector y que, si no
 *     se recordara, volvería a preguntarse cada día.
 *
 * **Viven en el servidor, no en el navegador.** Esta cola la contestan las
 * sucursales, no sólo quien administra: guardadas en el navegador, lo que
 * contestara León se quedaba en la máquina de León y aquí no llegaba nada. El
 * backend las parte por persona —cada quien escribe sólo su archivo— y al
 * leerlas las junta, así que dos personas contestando a la vez no se pisan.
 *
 * El navegador guarda una copia por si no hay red: se sigue pudiendo trabajar
 * y lo marcado se ve, aunque no se comparta hasta que vuelva la conexión.
 *
 * ── El orden ────────────────────────────────────────────────────────────────
 *
 * Primero los códigos, que es la alerta sensible y mueve dinero. Después los
 * nombres, que son orden y limpieza. Dentro de cada bloque, lo que más
 * resuelve de una vez. Lo marcado como pendiente va al final: ya tiene dueño.
 */

const FERIAS = SUCURSALES.find(s => s.estacional)
const CLAVE = 'istuffs_revisar_marcas'
const CLAVE_VIEJA = 'istuffs_revisar_ignorados'

/** { id: { estado: 'pendiente' | 'ignorado', nota, fecha } } */
const leerMarcas = () => {
  try {
    const guardado = localStorage.getItem(CLAVE)
    if (guardado) return JSON.parse(guardado)
    // La primera versión sólo guardaba una lista de ignorados.
    const viejo = JSON.parse(localStorage.getItem(CLAVE_VIEJA) ?? '[]')
    return Object.fromEntries(viejo.map(id => [id, { estado: 'ignorado' }]))
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

const pct = (n, total) => (total > 0 ? Math.round((n / total) * 100) : 0)

const lista = xs => (xs.length <= 1
  ? (xs[0] ?? '')
  : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`)

export default function RevisarPanel() {
  const { token, session, isAdmin } = useAuth()
  const quien = isAdmin ? 'admin' : session?.branch
  const [inv, setInv] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [i, setI] = useState(0)
  const [marcas, setMarcas] = useState(leerMarcas)
  const [sinRed, setSinRed] = useState(false)
  const [editando, setEditando] = useState(false)
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
  // del navegador: se puede trabajar, pero se avisa de que no se está
  // compartiendo.
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

  // Todos los casos, contestados o no. El Excel sale de aquí y no de la cola:
  // un análisis que sólo mire lo que sigue en la lista deja fuera justo lo que
  // alguien decidió que no era error, que es la mitad de la historia.
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

    // ── Códigos: la alerta sensible ─────────────────────────────────────
    const muertos = huerfanos.filter(h => h.motivo === MOTIVO.DESCONTINUADO && h.piezas === 0)
    const enBloque = new Set(muertos.length >= 3 ? muertos.map(h => h.codigo) : [])

    for (const h of huerfanos) {
      if (!enBloque.has(h.codigo)) items.push(fichaDeCodigo(h))
    }
    if (enBloque.size) items.push(fichaDeMuertos(muertos))

    // ── Nombres: orden y limpieza, lo que más ordena primero ────────────
    for (const p of patrones) items.push(fichaDePatron(p))

    for (const n of nombres) {
      if (explicados.has(n.codigo)) continue
      if (n.fuente !== 'conflicto' && n.severidad !== 'media') continue
      items.push(fichaDeNombre(n))
    }

    return items
  }, [inv, grupos])

  // Lo pendiente no se esconde —sigue sin arreglarse— pero va al final: ya
  // tiene quien lo esté viendo, y lo que no ha mirado nadie pesa más.
  const cola = useMemo(() => {
    const pendiente = x => (marcas[x.id]?.estado === 'pendiente' ? 1 : 0)
    return todos
      .filter(x => marcas[x.id]?.estado !== 'ignorado')
      .sort((a, b) => pendiente(a) - pendiente(b)
        || (a.bloque === b.bloque
          ? b.peso - a.peso
          : a.bloque === 'codigo' ? -1 : 1))
  }, [todos, marcas])

  if (cargando) return <p className="tablero-cargando">Leyendo el catálogo de las cinco plazas…</p>

  const total = cola.length
  const ignorados = Object.values(marcas).filter(m => m?.estado === 'ignorado').length
  const pendientes = cola.filter(x => marcas[x.id]?.estado === 'pendiente').length

  const volverAMostrar = () => {
    setMarcas(m => {
      const s = Object.fromEntries(
        Object.entries(m).filter(([, v]) => v?.estado !== 'ignorado'))
      guardarMarcas(s)
      return s
    })
    setI(0)
  }

  if (!total) {
    return (
      <section className="tarjeta revisar-fin">
        <h4>No queda nada por revisar</h4>
        <p className="tarjeta-sub">
          {ignorados > 0
            ? `Hay ${ignorados} ${ignorados === 1 ? 'hallazgo marcado' : 'hallazgos marcados'} como «no es error».`
            : 'El catálogo está en orden.'}
        </p>
        {ignorados > 0 && (
          <button type="button" className="boton-tono" onClick={volverAMostrar}>
            Volver a mostrarlos
          </button>
        )}
      </section>
    )
  }

  const pos = Math.min(i, total - 1)
  const item = cola[pos]
  const marca = marcas[item.id]

  const marcar = (estado, nota) => {
    const limpia = nota?.trim() || ''
    setMarcas(m => {
      const s = { ...m }
      if (!estado) delete s[item.id]
      else s[item.id] = { estado, nota: limpia, fecha: new Date().toISOString(), por: quien }
      guardarMarcas(s)
      return s
    })
    // Se pinta ya y se manda después: contestar casos va al ritmo de quien
    // contesta, no al de la red. Si el envío falla se avisa arriba, porque al
    // recargar manda lo que haya en el servidor y esa marca se perdería.
    if (token) guardarRevision(item.id, estado, limpia, token).catch(() => setSinRed(true))
  }

  const irA = n => { setEditando(false); setI(Math.max(0, Math.min(n, total - 1))) }

  const abrirNota = () => { setBorrador(marca?.nota ?? ''); setEditando(true) }

  const guardarPendiente = () => {
    marcar('pendiente', borrador)
    setEditando(false)
    // La cola se reordena -lo pendiente baja al final-, así que quedarse en el
    // mismo sitio ya enseña el siguiente.
    setI(n => Math.min(n, total - 1))
  }

  const alt = item.codigo
    ? alternativasDe(item.codigo, item.producto, grupos, existencias).slice(0, 3)
    : []

  return (
    <div className="revisar">
      <header className="revisar-avance">
        <span className="revisar-cuenta"><strong>{pos + 1}</strong> de {total}</span>
        <span className="revisar-barra" aria-hidden="true">
          <span style={{ width: `${(pos / total) * 100}%` }} />
        </span>
        {sinRed && (
          <span className="revisar-sinred" role="status">
            Sin conexión con el servidor: lo que marques no se está compartiendo
          </span>
        )}
        {pendientes > 0 && <span className="revisar-pendientes">{pendientes} pendientes</span>}
        {isAdmin && (
          <button type="button" className="revisar-bajar"
                  onClick={() => exportarRevisiones(todos, marcas)}>
            Descargar los {todos.length} casos
          </button>
        )}
        <span className={'revisar-sello sello-' + item.bloque}>
          {item.bloque === 'codigo' ? 'Código' : 'Nombre'}
        </span>
      </header>

      <section className={'tarjeta revisar-ficha' + (marca?.estado === 'pendiente' ? ' es-pendiente' : '')}>
        {marca?.estado === 'pendiente' && (
          <p className="rev-marca">
            <strong>En corrección</strong>
            <span>
              desde el {comoFecha(marca.fecha)}
              {marca.por && ` · lo marcó ${marca.por === 'admin' ? 'administración' : nombreSucursal(marca.por)}`}
            </span>
            {marca.nota && <em>«{marca.nota}»</em>}
          </p>
        )}
        {item.chip && <p className="rev-chip">{item.chip}</p>}
        <h4>{item.titulo}</h4>
        <p className="rev-veredicto">{item.veredicto}</p>

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

        <p className="rev-propuesta"><span>Propuesta</span> {item.accion}</p>

        {editando ? (
          <div className="rev-nota">
            <label htmlFor="rev-nota-campo">
              ¿Quién lo está corrigiendo, o en qué quedó? (opcional)
            </label>
            <textarea
              id="rev-nota-campo"
              rows={2}
              value={borrador}
              autoFocus
              placeholder="Ej.: lo corrige Brenda en León esta semana"
              onChange={e => setBorrador(e.target.value)} />
            <div className="rev-botones">
              <button type="button" className="boton-tinta" onClick={guardarPendiente}>
                Guardar como pendiente
              </button>
              <button type="button" className="rev-saltar" onClick={() => setEditando(false)}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="rev-botones">
            <button type="button" className="boton-tinta" onClick={abrirNota}>
              {marca?.estado === 'pendiente' ? 'Cambiar la nota' : 'Lo voy a corregir'}
            </button>
            {marca?.estado === 'pendiente' && (
              <button type="button" className="boton-tono" onClick={() => marcar(null)}>
                Quitar pendiente
              </button>
            )}
            <button type="button" className="boton-tono" onClick={() => marcar('ignorado')}>
              No es error
            </button>
            <button type="button" className="rev-saltar" onClick={() => irA(pos + 1)}>
              Saltar
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
        No hace falta marcar nada como hecho: los hallazgos salen de los datos, así que al
        corregirlo en la caja desaparecen solos en la siguiente sincronización. «Pendiente»
        es sólo para saber que ya hay alguien en ello.
        {ignorados > 0 && (
          <> Hay {ignorados} marcados como «no es error».{' '}
            <button type="button" className="grafica-tabla-boton" onClick={volverAMostrar}>
              Volver a mostrarlos
            </button>
          </>
        )}
      </p>
    </div>
  )
}

// ── Las fichas ───────────────────────────────────────────────────────────────

const nombresDe = slugs => lista(slugs.map(nombreSucursal))

/** Un patrón de escritura: una decisión que ordena muchos renglones. */
function fichaDePatron(p) {
  const otras = p.filas.filter(f => !p.corrigen.includes(f.slug)).map(f => f.slug)

  const titulo = p.falta
    ? `${nombresDe(p.corrigen)} ${p.corrigen.length === 1 ? 'omite' : 'omiten'} «${p.b}»`
    : `${nombresDe(otras)} ${otras.length === 1 ? 'escribe' : 'escriben'} «${p.gana}»; `
      + `${nombresDe(p.corrigen)} «${p.pierde}»`

  const veredicto = p.falta
    ? `El resto del catálogo lleva «${p.b}» en estos ${p.codigos.length} códigos. `
      + 'No es otra forma de escribirlo: falta la palabra.'
    : p.alcance === 'catalogo'
      ? `Es una costumbre de plaza, no ${p.renglones} descuidos sueltos: se ve en el catálogo `
        + `entero, no sólo donde chocan. Una respuesta ordena ${p.renglones} renglones.`
      : `Aparece en ${p.codigos.length} códigos. Una respuesta ordena ${p.renglones} renglones.`

  const cabeceras = p.falta
    ? ['Plaza', `Con «${p.b}»`, 'Sin ella']
    : ['Plaza', `«${p.a}»`, `«${p.b}»`]

  const filas = p.filas.map(f => (p.falta
    ? [nombreSucursal(f.slug), String(f.b), f.sin ? String(f.sin) : '—']
    : [nombreSucursal(f.slug),
       f.a ? `${f.a} (${pct(f.a, f.total)}%)` : '0',
       f.b ? `${f.b} (${pct(f.b, f.total)}%)` : '0']))

  return {
    id: p.id,
    bloque: 'nombre',
    chip: `1 decisión · ${p.renglones} renglones`,
    titulo,
    veredicto,
    tabla: { cabeceras, filas },
    plazas: p.corrigen,
    accion: p.falta
      ? `Añadir «${p.b}» en ${nombresDe(p.corrigen)}`
      : `Unificar en «${p.gana}»: corregir ${nombresDe(p.corrigen)}`,
    peso: p.renglones,
  }
}

/** Los descontinuados sin una sola pieza: la respuesta es la misma para todos. */
function fichaDeMuertos(muertos) {
  const porPlaza = {}
  for (const h of muertos) {
    for (const s of Object.keys(h.plazas ?? {})) porPlaza[s] = (porPlaza[s] ?? 0) + 1
  }
  const filas = Object.entries(porPlaza).map(([s, n]) => [nombreSucursal(s), String(n)])

  return {
    id: 'cod|muertos',
    bloque: 'codigo',
    chip: `${muertos.length} códigos de una vez`,
    titulo: `${muertos.length} códigos descontinuados y sin una sola pieza`,
    veredicto: 'Bodega no los tiene, llevan medio año o más sin moverse y no queda existencia '
      + 'en ninguna plaza. No hay nada que agotar: sólo ocupan sitio en el catálogo.',
    tabla: filas.length ? { cabeceras: ['Plaza', 'Códigos'], filas } : null,
    plazas: Object.keys(porPlaza),
    detalle: muertos.map(h => `${h.codigo} · ${h.producto}`),
    accion: 'Eliminar los códigos del catálogo de cada plaza',
    peso: muertos.length,
  }
}

/** Un código huérfano: la alerta sensible, de una en una. */
function fichaDeCodigo(h) {
  const titulo = h.motivo === MOTIVO.DUPLICADO ? 'Bodega ya lo cubre con otro código'
    : h.motivo === MOTIVO.SIN_ALTA ? 'Se mueve y bodega no lo tiene de alta'
    : 'Descontinuado: no hay de dónde resurtirlo'

  const veredicto = h.motivo === MOTIVO.DUPLICADO
    ? `Bodega atiende ese teléfono con ${h.cubiertoPor.codigo} — ${h.cubiertoPor.producto}, `
      + 'del mismo tipo de funda. Si es el mismo producto, este código sobra.'
    : h.motivo === MOTIVO.SIN_ALTA
      ? 'Ningún código de bodega cubre ese teléfono con ese tipo de funda, y éste sigue '
        + 'moviéndose. O bodega lo da de alta, o se decide que no se maneja.'
      : `Bodega no lo tiene y lleva ${h.diasSinMover ?? '—'} días sin moverse. `
        + 'Lo que quede se agota y el código se elimina.'

  const filas = Object.entries(h.plazas).map(([s, n]) => [nombreSucursal(s), `${n} pz`])

  return {
    id: `cod|${h.codigo}`,
    bloque: 'codigo',
    chip: `${h.codigo} · ${h.piezas} pz · se movió por última vez ${h.ultimo ?? 'sin registro'}`,
    titulo,
    veredicto,
    tabla: filas.length ? { cabeceras: ['Plaza', 'Existencia'], filas } : null,
    plazas: Object.keys(h.plazas),
    accion: h.accion,
    codigo: h.codigo,
    producto: h.producto,
    peso: h.piezas,
  }
}

/** Un nombre suelto que ningún patrón explica. */
function fichaDeNombre(n) {
  if (n.fuente === 'conflicto') {
    return {
      id: `nom|${n.codigo}`,
      bloque: 'nombre',
      chip: `${n.codigo} · las dos referencias`,
      titulo: 'Bodega y León no coinciden, y no es compatibilidad',
      veredicto: 'Las dos referencias del catálogo se contradicen. Mientras no se elija una, '
        + 'no hay nombre bueno contra el que corregir a las demás plazas.',
      tabla: {
        cabeceras: ['Plaza', 'Lo que tiene escrito'],
        filas: n.fuera.map(f => [nombreSucursal(f.slug), f.nombre]),
      },
      plazas: n.fuera.map(f => f.slug),
      accion: 'Elegir cuál de las dos vale y corregir la otra',
      peso: 0,
    }
  }

  return {
    id: `nom|${n.codigo}`,
    bloque: 'nombre',
    chip: `${n.codigo} · apunta a otro teléfono`,
    titulo: 'El nombre no es sólo otra forma de escribirlo',
    veredicto: `La referencia (${n.fuente}) dice «${n.referencia}». Lo que tienen las plazas `
      + 'de abajo nombra otro aparato o lleva una errata, y eso rompe cualquier comparación.',
    tabla: {
      cabeceras: ['Plaza', 'Lo que tiene escrito'],
      filas: [['Catálogo', n.referencia], ...n.fuera.map(f => [nombreSucursal(f.slug), f.nombre])],
      destacar: 0,
    },
    plazas: n.fuera.map(f => f.slug),
    accion: `Corregir en ${nombresDe(n.fuera.map(f => f.slug))}`,
    peso: 0,
  }
}
