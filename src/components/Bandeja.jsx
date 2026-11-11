// La bandeja de incidencias: la pestaña de Revisar entera.
//
// SUSTITUYE al recorrido de «una ficha cada vez». No queda debajo: se quitó.
// Las dos razones las dio el dueño y son las que miden si esto sirvió:
//
//   1. «No se guardaban registros de los movimientos.» Antes sólo quedaba el
//      último estado de cada caso, así que no había forma de saber quién lo
//      movió, cuándo, ni cuántas veces había vuelto. El historial lo escribe
//      ahora el BACKEND, con la sesión en la mano: dejándoselo al navegador
//      cualquiera podría mandar un historial con el nombre de otro, y un
//      registro que se puede escribir a gusto no prueba nada.
//
//   2. «El llenado era muy obsoleto, era muy tedioso.» Una ficha cada vez, a
//      mano, con el motivo escrito a pulso. El objetivo que puso no es «que
//      funcione»: es que CUALQUIERA lo haga el doble de rápido. De ahí sale
//      todo lo de abajo —acciones de un clic en el renglón, selección
//      múltiple, atajos de teclado, motivos de lista cerrada y la corrección
//      sugerida— y no son adornos: cada una quita teclas.
//
// Las cuentas y el ciclo de vida viven en `lib/incidencias.js`, con pruebas.
// Aquí sólo se dibuja y se guarda.
//
// ── Lo que NO cambia, y es lo importante ─────────────────────────────────
//
// Los hallazgos se siguen recalculando del respaldo en cada carga. Esto es
// una capa de estado encima, no una tabla de incidencias: si el respaldo deja
// de producir un caso, se cierra solo. No hay incidencias zombi posibles.

import { TEMAS } from './Diseno'
import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import {
  ESTADOS, ESTADOS_QUE_SE_ELIGEN, TEXTO_ESTADO, GRAVEDADES,
  MOTIVOS_CIERRE, MOTIVOS_DESCARTE, ALCANCES, TEXTO_REGLA,
  conciliar, ordenar, resumir, reglaDe, impactoDe, ocurrenciasDe,
  tiempoMedio, saludPorPlaza, porRegla, porPlazaCuenta,
  tapadaPor, excepcionesDe, catalogoDe, agruparPorPlaza, mensajeParaSucursal,
  PREFIJO_CONFIG, huellaDe,
} from '../lib/incidencias'
import { nombreSucursal } from '../lib/sucursales'

/**
 * `conciliar` protegido.
 *
 * La bandeja vacia es un estado valido -la primera carga, o una sesion sin
 * red- y reventar ahi dejaria la pestaña en blanco, que se ve igual que un
 * fallo del servidor.
 */
function conciliarSeguro(hallazgos, registros, hoy) {
  try { return conciliar({ hallazgos, registros, hoy }) } catch { return [] }
}

const TINTA       = '#101619'
const TINTA_SUAVE = '#4A5A61'
const TINTA_TENUE = '#8598A1'
const LINEA       = '#D6E0E4'
const ROSA        = '#C4156F'
const VERDE       = '#5E9422'
const AMBAR       = '#B45309'
const AZUL        = '#0288AD'

const COLOR_ESTADO = {
  [ESTADOS.NUEVA]:      AZUL,
  [ESTADOS.REVISANDO]:  AMBAR,
  [ESTADOS.EN_ORIGEN]:  AMBAR,
  [ESTADOS.CERRADA]:    VERDE,
  [ESTADOS.DESCARTADA]: TINTA_TENUE,
  [ESTADOS.CONFLICTO]:  ROSA,
}

const COLOR_GRAVEDAD = {
  critica: ROSA, alta: AMBAR, media: AZUL, baja: TINTA_TENUE,
}

const COLOR_SEMAFORO = { verde: VERDE, ambar: AMBAR, rojo: ROSA }

const ABIERTOS = [ESTADOS.NUEVA, ESTADOS.REVISANDO, ESTADOS.EN_ORIGEN, ESTADOS.CONFLICTO]

/**
 * Las pestañas de la bandeja.
 *
 * «Por atender» va primera y es lo que se abre: lo que nadie ha mirado es lo
 * único que no puede esperar. «Cerradas» existe para que la verificación
 * automática se NOTE —si no, el trabajo que hace solo el sistema es
 * invisible— pero va al final.
 */
const PESTANAS = [
  { id: 'atender',  texto: 'Por atender',  estados: [ESTADOS.NUEVA, ESTADOS.REVISANDO] },
  { id: 'sucursal', texto: 'En sucursal',  estados: [ESTADOS.EN_ORIGEN] },
  { id: 'conflicto', texto: 'Reabiertas',  estados: [ESTADOS.CONFLICTO] },
  { id: 'descartadas', texto: 'Descartadas', estados: [ESTADOS.DESCARTADA] },
  { id: 'cerradas', texto: 'Cerradas',     estados: [ESTADOS.CERRADA] },
]

/**
 * Vistas guardadas. Son filtros con nombre y no un menú de filtros vacío,
 * porque un filtro que hay que armar cada vez no se arma: estas cuatro son
 * las preguntas que de verdad se hacen al abrir la pestaña.
 */
const VISTAS = [
  { id: 'todo',     texto: 'Todo' },
  { id: 'mias',     texto: 'Lo mío',        nota: 'asignado a mí' },
  { id: 'vencidas', texto: 'Fuera de plazo' },
  { id: 'rapidas',  texto: 'De un clic',    nota: 'sin existencia: se borran' },
]

const fecha = v => {
  if (!v) return ''
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('es-MX', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

const codigosDe = h => (h?.codigos ?? [])
  .map(c => (typeof c === 'string' ? c : c?.codigo)).filter(Boolean)

function Dato({ n, etiqueta, color, nota }) {
  return (
    <div style={{ flex: 1, minWidth: 104, padding: '10px 12px', borderRadius: 16,
                  background: /^#[0-9a-f]{6}$/i.test(color ?? '') ? color + '14' : 'rgba(16,22,25,0.04)',
                  borderLeft: '4px solid ' + (color ?? TINTA) }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: color ?? TINTA, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{n}</div>
      <div style={{ fontSize: 11, color: TINTA_SUAVE, marginTop: 2 }}>{etiqueta}</div>
      {nota && <div style={{ fontSize: 10, color: TINTA_TENUE, marginTop: 1 }}>{nota}</div>}
    </div>
  )
}

// ── El renglón ────────────────────────────────────────────────────────────

/**
 * Una incidencia en la lista.
 *
 * Lleva las acciones de un clic DENTRO del renglón. Esa es la mitad del
 * rediseño: lo que antes pedía abrir la ficha, leer la pregunta, pulsar «sí»
 * y escribir una nota —cuatro pasos por caso— aquí es un botón. El panel de
 * detalle sigue estando para cuando hace falta mirar la evidencia, pero deja
 * de ser obligatorio para mover un caso.
 *
 * `data-paso` se conserva porque es lo único por lo que se puede comprobar
 * que la cola va en orden: reordenarla no cambia cuántos hallazgos hay
 * —cambia cuáles van primero— y eso no sale en ningún número.
 */
function Fila({ inc, abierta, enCursor, marcada, onAbrir, onMarcar, onRapido, guardando }) {
  const g = GRAVEDADES[inc.gravedad]
  const h = inc.hallazgo ?? {}
  const imp = impactoDe(h)
  const oc = ocurrenciasDe(inc.registro)
  // «Se puede trabajar»: no confundir con `abierta`, que es si su panel de
  // detalle esta desplegado. Son dos cosas y compartir nombre ya costo una.
  const trabajable = ABIERTOS.includes(inc.estado)

  return (
    <li data-incidencia={inc.huella} data-estado={inc.estado}
        data-paso={h.orden ?? 9}
        aria-current={enCursor ? 'true' : undefined}
        style={{
          border: '1px solid ' + (inc.vencida ? ROSA : (abierta || enCursor) ? TINTA : LINEA),
          borderRadius: 14, padding: '9px 11px',
          background: inc.vencida ? 'rgba(196,21,111,0.04)' : marcada ? 'rgba(2,136,173,0.06)' : '#fff',
          boxShadow: abierta ? '0 0 0 1px ' + TINTA : 'none',
        }}>
      <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
        {/* Marcar para el bloque. Va fuera del area que abre el detalle: con
            el manejador en el padre, marcar abria la ficha de paso. */}
        <input type="checkbox" checked={marcada} aria-label={'Marcar ' + inc.huella}
               data-marcar={inc.huella}
               onChange={() => onMarcar(inc.huella)}
               style={{ marginTop: 3, width: 16, height: 16, flex: '0 0 auto', accentColor: AZUL }} />

        {/* El toggle mira solo si ESTA ABIERTA. Mirando tambien el cursor
            del teclado, el primer renglon nacia «activo» -el cursor arranca
            en el 0- y el primer clic lo cerraba en vez de abrirlo: el panel
            de detalle no se podia abrir con el raton y nada fallaba. */}
        <div data-abrir={inc.huella} onClick={() => onAbrir(abierta ? null : inc.huella)}
             style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, color: COLOR_GRAVEDAD[inc.gravedad] }}>
              {g.texto}
            </span>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: COLOR_ESTADO[inc.estado] }}>
              {TEXTO_ESTADO[inc.estado]}
            </span>
            {/* Lo que IDENTIFICA el caso va primero, no la etiqueta del tipo.
                La primera version enseñaba solo el titulo del paso, y con eso
                salian diecisiete renglones diciendo «Se vende y bodega no lo
                tiene de alta» sin que se pudiera distinguir cual era cual:
                una lista en la que no se puede elegir no sirve para
                trabajar. */}
            <span style={{ fontSize: 12.5, color: TINTA, flex: 1, minWidth: 180 }}>
              <strong>{h.chip || h.titulo || inc.registro?.nota || inc.huella}</strong>
              {h.chip && (h.titulo || h.etiqueta) && (
                <span style={{ color: TINTA_TENUE, fontWeight: 400 }}>
                  {' — '}{h.titulo || h.etiqueta}
                </span>
              )}
            </span>
          </div>

          {/* La segunda linea es la que convierte «un caso» en «cuanto
              duele»: plaza, piezas, veces que ha vuelto y de quien es. Sin
              ella hay que abrir cada ficha para saber si importa. */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 3,
                        fontSize: 10.5, color: TINTA_TENUE }}>
            {(h.plazas ?? []).length > 0 && (
              <span>{(h.plazas ?? []).map(nombreSucursal).join(' · ')}</span>
            )}
            {imp.piezas > 0 && <span><strong style={{ color: TINTA_SUAVE }}>{imp.piezas}</strong> pz</span>}
            {imp.codigos > 1 && <span>{imp.codigos} códigos</span>}
            {oc > 1 && <span style={{ color: ROSA, fontWeight: 700 }}>{oc}ª vez</span>}
            {inc.registro?.responsable && <span>→ {inc.registro.responsable}</span>}
            {inc.registro?.compromiso && <span>para el {inc.registro.compromiso}</span>}
            {inc.vencida && <span style={{ color: ROSA, fontWeight: 800 }}>fuera de plazo</span>}
            <span style={{ marginInlineStart: 'auto' }}>
              {inc.estado === ESTADOS.NUEVA ? 'sin mirar'
                : inc.dias === 0 ? 'hoy' : `hace ${inc.dias} d`}
            </span>
          </div>

          {/* Lo que el respaldo verificó solo. Se dice, porque si no el
              trabajo que hace el sistema por su cuenta es invisible. */}
          {inc.verificada && (
            <p style={{ fontSize: 10.5, color: VERDE, margin: '4px 0 0' }}>
              El respaldo ya no la detecta: se cerró sola, sin que nadie marcara nada.
            </p>
          )}
        </div>
      </div>

      {/* Las tres de un clic. Sin abrir nada, sin escribir nada. Descartar no
          esta aqui a proposito: pide motivo, y un descarte sin motivo es una
          alerta apagada que nadie puede revisar a la semana. */}
      {trabajable && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 7 }}>
          <Rapido texto="Reviso yo" activo={inc.estado === ESTADOS.REVISANDO}
                  onClick={() => onRapido(inc, ESTADOS.REVISANDO)} guardando={guardando} />
          <Rapido texto="A la sucursal" activo={inc.estado === ESTADOS.EN_ORIGEN}
                  onClick={() => onRapido(inc, ESTADOS.EN_ORIGEN)} guardando={guardando} />
          <button type="button" className="rev-saltar" data-detalle-de={inc.huella}
                  onClick={() => onAbrir(abierta ? null : inc.huella)}
                  style={{ fontSize: 11 }}>
            {abierta ? 'Cerrar' : 'Ver y decidir'}
          </button>
        </div>
      )}
    </li>
  )
}

function Rapido({ texto, activo, onClick, guardando }) {
  return (
    <button type="button" onClick={onClick} disabled={guardando}
            className={activo ? 'chip-plaza activa' : 'chip-plaza'}
            style={{ fontSize: 11, padding: '3px 10px' }}>
      {texto}
    </button>
  )
}

// ── El panel de detalle ───────────────────────────────────────────────────

/**
 * El panel de detalle: la evidencia y la decisión, juntas.
 *
 * Aquí vive todo lo que antes enseñaba la ficha de la cola —lo que se sabe,
 * la tabla, los códigos, qué pasa si sí y qué pasa si no, y las otras fundas
 * del mismo teléfono— porque eso es la EVIDENCIA, y una decisión sin la
 * evidencia delante es la que se contesta mal. Lo que se quitó no fue la
 * información: fue la obligación de pasar por ella una ficha a la vez.
 */
function Detalle({
  inc, catalogo, alternativas, onGuardar, onCorregir, onExcepcion,
  guardando, onCerrar,
}) {
  const r = inc.registro ?? {}
  const h = inc.hallazgo ?? {}
  const regla = reglaDe(inc.huella)
  const cat = catalogo[regla]

  const [estado, setEstado] = useState(
    ESTADOS_QUE_SE_ELIGEN.includes(r.estado) ? r.estado : ESTADOS.REVISANDO)
  const [gravedad, setGravedad] = useState(inc.gravedad)
  const [motivo, setMotivo] = useState(r.motivo ?? '')
  const [nota, setNota] = useState(r.nota ?? '')
  const [responsable, setResponsable] = useState(r.responsable ?? '')
  const [compromiso, setCompromiso] = useState(r.compromiso ?? '')
  const [comentario, setComentario] = useState('')
  const [abriendoExc, setAbriendoExc] = useState(false)

  // Al cambiar de caso el formulario se recarga con lo de ESE caso. Sin esto
  // el estado del anterior se queda puesto y se guardaria sobre el nuevo, que
  // es la peor forma de equivocarse: parece que se contesto bien.
  useEffect(() => {
    setEstado(ESTADOS_QUE_SE_ELIGEN.includes(r.estado) ? r.estado : ESTADOS.REVISANDO)
    setGravedad(inc.gravedad)
    setMotivo(r.motivo ?? '')
    setNota(r.nota ?? '')
    setResponsable(r.responsable ?? '')
    setCompromiso(r.compromiso ?? '')
    setComentario('')
    setAbriendoExc(false)
  }, [inc.huella]) // eslint-disable-line react-hooks/exhaustive-deps

  const descarta = estado === ESTADOS.DESCARTADA
  const lista = descarta ? MOTIVOS_DESCARTE : MOTIVOS_CIERRE
  // Descartar sin motivo deja una decision que nadie puede revisar a la
  // semana. El motivo es de LISTA, no de texto libre, por dos razones: se
  // elige en un gesto en vez de escribirse, y «se corrigio», «ya se
  // corrigio» y «corregido» dejan de ser tres motivos distintos cuando hay
  // que contarlos en la pantalla de causas.
  const falta = descarta && !motivo

  const cs = codigosDe(h)
  const alt = h.codigo ? (alternativas?.(h.codigo, h.producto) ?? []) : []
  const hist = [...(r.historial ?? [])].reverse()

  const guardar = () => onGuardar(inc, {
    estado, gravedad, motivo, nota, responsable, compromiso,
    ...(comentario.trim() ? { comentario: comentario.trim() } : {}),
  })

  return (
    <aside data-detalle={inc.huella}
           style={{ border: '1px solid ' + TINTA, borderRadius: 16, padding: '12px 14px',
                    display: 'flex', flexDirection: 'column', gap: 11, background: '#fff' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13.5, fontWeight: 800, color: TINTA, margin: 0 }}>
            {h.titulo || inc.huella}
          </p>
          {h.chip && <p style={{ fontSize: 11.5, color: TINTA_SUAVE, margin: '2px 0 0' }}>{h.chip}</p>}
        </div>
        <button type="button" className="rev-saltar" onClick={onCerrar}
                aria-label="Cerrar el detalle" style={{ fontSize: 11 }}>Cerrar</button>
      </div>

      {/* Qué significa esta regla. Sale del catálogo editable, así que la
          explicación la mantiene quien sabe y no está enterrada en el código. */}
      {cat && (
        <div style={{ background: 'rgba(2,136,173,0.05)', borderRadius: 12, padding: '8px 10px' }}>
          <p style={{ fontSize: 10.5, fontWeight: 800, color: AZUL, margin: 0, textTransform: 'uppercase', letterSpacing: .4 }}>
            {cat.texto}
          </p>
          <p style={{ fontSize: 11.5, color: TINTA_SUAVE, margin: '3px 0 0', lineHeight: 1.45 }}>
            {cat.significa} <strong style={{ color: TINTA }}>Suele pasar porque:</strong> {cat.causa}
          </p>
        </div>
      )}

      {/* ── La evidencia ─────────────────────────────────────────────── */}
      {(h.contexto ?? []).length > 0 && (
        <div>
          <p style={{ fontSize: 10.5, fontWeight: 800, color: TINTA_TENUE, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: .4 }}>
            Qué se sabe
          </p>
          <ul style={{ margin: 0, paddingInlineStart: 16, fontSize: 11.5, color: TINTA_SUAVE, lineHeight: 1.5 }}>
            {h.contexto.map(c => <li key={c}>{c}</li>)}
          </ul>
        </div>
      )}

      {h.tabla && (
        <table className="rev-tabla">
          <thead>
            <tr>{h.tabla.cabeceras.map((c, n) => (
              <th key={n} scope="col" className={n ? 'num' : ''}>{c}</th>
            ))}</tr>
          </thead>
          <tbody>
            {h.tabla.filas.map((f, n) => (
              <tr key={n} className={h.tabla.destacar === n ? 'destacada' : ''}>
                {f.map((celda, m) => (m === 0
                  ? <th key={m} scope="row">{celda}</th>
                  : <td key={m} className="num">{celda}</td>))}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {h.detalle && (
        <details className="rev-detalle">
          <summary>Ver los códigos ({h.detalle.length})</summary>
          <ul>{h.detalle.map(d => <li key={d}>{d}</li>)}</ul>
        </details>
      )}

      {alt.length > 0 && (
        <div className="rev-alternativas">
          <p className="rev-subtitulo">Otras fundas del mismo teléfono, con existencia</p>
          <ul>
            {alt.slice(0, 3).map(a => (
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

      {/* Lo que pasa según lo que se conteste. Era la parte más útil de la
          ficha vieja y es lo que impide contestar a ciegas. */}
      {(h.siHacer || h.noHacer) && (
        <ul style={{ margin: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4,
                     fontSize: 11.5, color: TINTA_SUAVE, lineHeight: 1.45 }}>
          {h.siHacer && <li><strong style={{ color: VERDE }}>Si sí:</strong> {h.siHacer}</li>}
          {h.noHacer && <li><strong style={{ color: ROSA }}>Si no:</strong> {h.noHacer}</li>}
        </ul>
      )}

      {/* ── La corrección sugerida, de un clic ───────────────────────── */}
      {cs.length > 0 && onCorregir && (
        <div style={{ border: '1px dashed ' + LINEA, borderRadius: 12, padding: '8px 10px' }}>
          <p style={{ fontSize: 11.5, color: TINTA, margin: '0 0 6px', lineHeight: 1.4 }}>
            <strong>Corrección sugerida.</strong> Marcar {cs.length === 1
              ? <code>{cs[0]}</code>
              : `los ${cs.length} códigos`} como que ya no existen. No toca el dato:
            el respaldo lo regenera cuatro veces al día, así que se guarda al lado y
            desaparece solo cuando la caja lo borre de verdad.
          </p>
          <button type="button" className="boton-tinta" data-corregir={inc.huella}
                  disabled={guardando}
                  onClick={() => onCorregir(cs, h.producto ?? '', 'ya-no-existe', inc)}
                  style={{ fontSize: 11.5, padding: '5px 12px' }}>
            Dar de baja {cs.length === 1 ? cs[0] : `los ${cs.length}`}
          </button>
        </div>
      )}

      {/* ── La decisión ──────────────────────────────────────────────── */}
      <div style={{ borderTop: '1px dashed ' + LINEA, paddingTop: 10,
                    display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 11, color: TINTA_SUAVE }}>
            Qué hago con esto
            <select value={estado} onChange={e => setEstado(e.target.value)}
                    data-estado-elegido
                    style={{ display: 'block', marginTop: 3, fontSize: 12, padding: '4px 6px' }}>
              {ESTADOS_QUE_SE_ELIGEN.map(e => (
                <option key={e} value={e}>{TEXTO_ESTADO[e]}</option>
              ))}
            </select>
          </label>

          <label style={{ fontSize: 11, color: TINTA_SUAVE }}>
            {descarta ? 'Por qué no es un error' : 'Motivo'}
            <select value={motivo} onChange={e => setMotivo(e.target.value)}
                    data-motivo
                    style={{ display: 'block', marginTop: 3, fontSize: 12, padding: '4px 6px',
                             border: '1px solid ' + (falta ? ROSA : LINEA) }}>
              <option value="">— elegir —</option>
              {Object.entries(lista).map(([k, t]) => (
                <option key={k} value={k}>{t}</option>
              ))}
            </select>
          </label>

          <label style={{ fontSize: 11, color: TINTA_SUAVE }}>
            Gravedad
            <select value={gravedad} onChange={e => setGravedad(e.target.value)}
                    data-gravedad
                    style={{ display: 'block', marginTop: 3, fontSize: 12, padding: '4px 6px' }}>
              {Object.entries(GRAVEDADES).map(([k, g]) => (
                <option key={k} value={k}>
                  {g.texto}{g.horas ? ` · ${g.horas} h` : ' · sin plazo'}
                </option>
              ))}
            </select>
          </label>

          <label style={{ fontSize: 11, color: TINTA_SUAVE }}>
            Quién lo corrige
            <input value={responsable} onChange={e => setResponsable(e.target.value)}
                   placeholder="nombre" data-responsable
                   style={{ display: 'block', marginTop: 3, fontSize: 12, padding: '4px 6px', width: 120 }} />
          </label>

          <label style={{ fontSize: 11, color: TINTA_SUAVE }}>
            Para cuándo
            <input type="date" value={compromiso} onChange={e => setCompromiso(e.target.value)}
                   data-compromiso
                   style={{ display: 'block', marginTop: 3, fontSize: 12, padding: '4px 6px' }} />
          </label>
        </div>

        <textarea value={nota} onChange={e => setNota(e.target.value)} rows={2}
                  data-nota
                  placeholder="Detalle, si hace falta (el motivo ya va arriba)"
                  style={{ fontSize: 12, padding: '6px 8px', borderRadius: 10,
                           border: '1px solid ' + LINEA, resize: 'vertical', fontFamily: 'inherit' }} />

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="boton-tinta" data-guardar={inc.huella}
                  disabled={guardando || falta} onClick={guardar}
                  style={{ fontSize: 11.5, padding: '6px 14px' }}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
          {inc.registro && (
            <button type="button" className="rev-saltar" onClick={() => onGuardar(inc, null)}>
              Deshacer
            </button>
          )}
          <button type="button" className="rev-saltar" onClick={() => setAbriendoExc(v => !v)}
                  data-abrir-excepcion>
            No volver a avisar…
          </button>
          {falta && (
            <span style={{ fontSize: 11, color: ROSA }}>
              Descartar pide motivo: es lo único que explica por qué dejó de avisar.
            </span>
          )}
        </div>
      </div>

      {abriendoExc && (
        <FormularioExcepcion inc={inc} regla={regla} codigos={cs}
                             onExcepcion={onExcepcion} guardando={guardando}
                             onCerrar={() => setAbriendoExc(false)} />
      )}

      {/* ── Comentarios internos ─────────────────────────────────────── */}
      <div style={{ borderTop: '1px dashed ' + LINEA, paddingTop: 10 }}>
        <p style={{ fontSize: 10.5, fontWeight: 800, color: TINTA_TENUE, margin: '0 0 5px', textTransform: 'uppercase', letterSpacing: .4 }}>
          Comentarios
        </p>
        {(r.comentarios ?? []).length > 0 && (
          <ul style={{ listStyle: 'none', margin: '0 0 6px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {r.comentarios.map((c, n) => (
              <li key={n} style={{ fontSize: 11.5, color: TINTA_SUAVE, lineHeight: 1.4 }}>
                <strong style={{ color: TINTA }}>{c.quien}</strong>
                <span style={{ color: TINTA_TENUE }}> · {fecha(c.cuando)}</span>
                <br />{c.texto}
              </li>
            ))}
          </ul>
        )}
        {/* El comentario va aparte de la nota a proposito: la nota es la razon
            oficial de la decision, y mezclarlos la borraria cada vez que
            alguien quiere apuntar algo. */}
        <input value={comentario} onChange={e => setComentario(e.target.value)}
               placeholder="Apuntar algo (se guarda al pulsar Guardar)"
               data-comentario
               style={{ width: '100%', fontSize: 12, padding: '5px 8px', borderRadius: 10,
                        border: '1px solid ' + LINEA }} />
      </div>

      {/* ── El historial: la razón de ser del rediseño ───────────────── */}
      <div style={{ borderTop: '1px dashed ' + LINEA, paddingTop: 10 }}>
        <p style={{ fontSize: 10.5, fontWeight: 800, color: TINTA_TENUE, margin: '0 0 5px', textTransform: 'uppercase', letterSpacing: .4 }}>
          Historial del caso
        </p>
        {hist.length === 0 ? (
          <p style={{ fontSize: 11.5, color: TINTA_TENUE, margin: 0 }}>
            Sin movimientos todavía. El primero se apunta al guardar.
          </p>
        ) : (
          <ol data-historial={inc.huella}
              style={{ listStyle: 'none', margin: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
            {hist.map((x, n) => (
              <li key={n} style={{ fontSize: 11.5, color: TINTA_SUAVE, lineHeight: 1.4,
                                   paddingInlineStart: 10, borderInlineStart: '2px solid ' + LINEA }}>
                <strong style={{ color: COLOR_ESTADO[x.estado] ?? TINTA }}>
                  {TEXTO_ESTADO[x.estado] ?? x.estado}
                </strong>
                <span style={{ color: TINTA_TENUE }}> · {x.quien} · {fecha(x.cuando)}</span>
                {x.motivo && <><br />{MOTIVOS_CIERRE[x.motivo] ?? MOTIVOS_DESCARTE[x.motivo] ?? x.motivo}</>}
                {x.nota && <><br /><span style={{ color: TINTA_TENUE }}>{x.nota}</span></>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </aside>
  )
}

/**
 * Una excepción: hasta dónde llega el «no me vuelvas a avisar».
 *
 * Existe porque descartar un caso suelto no sirve cuando el mismo motivo va a
 * producir veinte iguales mañana. Y lleva vencimiento porque una excepción
 * para siempre es una alerta apagada que nadie recuerda haber apagado.
 */
function FormularioExcepcion({ inc, regla, codigos, onExcepcion, guardando, onCerrar }) {
  const [alcance, setAlcance] = useState('caso')
  const [vence, setVence] = useState('')
  const [motivo, setMotivo] = useState('')
  const plazas = inc.hallazgo?.plazas ?? []
  const [plaza, setPlaza] = useState(plazas[0] ?? '')

  const puede = Boolean(motivo.trim())
    && (alcance !== 'codigo' || codigos.length > 0)
    && (alcance !== 'plaza' || Boolean(plaza))

  return (
    <div data-excepcion-nueva
         style={{ border: '1px solid ' + AMBAR, borderRadius: 12, padding: '9px 11px',
                  display: 'flex', flexDirection: 'column', gap: 7,
                  background: 'rgba(180,83,9,0.04)' }}>
      <p style={{ fontSize: 11.5, color: TINTA, margin: 0, lineHeight: 1.45 }}>
        <strong>Dejar de avisar.</strong> Se puede revocar y se puede poner fecha de
        caducidad. Sin fecha no caduca, pero queda en la lista de excepciones con su
        motivo, que es lo que impide que una alerta quede apagada y olvidada.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 11, color: TINTA_SUAVE }}>
          Hasta dónde
          <select value={alcance} onChange={e => setAlcance(e.target.value)}
                  data-alcance
                  style={{ display: 'block', marginTop: 3, fontSize: 12, padding: '4px 6px' }}>
            {Object.entries(ALCANCES).map(([k, t]) => {
              if (k === 'codigo' && !codigos.length) return null
              if (k === 'plaza' && !plazas.length) return null
              return <option key={k} value={k}>{t}</option>
            })}
          </select>
        </label>
        {alcance === 'plaza' && (
          <label style={{ fontSize: 11, color: TINTA_SUAVE }}>
            Qué plaza
            <select value={plaza} onChange={e => setPlaza(e.target.value)}
                    style={{ display: 'block', marginTop: 3, fontSize: 12, padding: '4px 6px' }}>
              {plazas.map(p => <option key={p} value={p}>{nombreSucursal(p)}</option>)}
            </select>
          </label>
        )}
        <label style={{ fontSize: 11, color: TINTA_SUAVE }}>
          Caduca el
          <input type="date" value={vence} onChange={e => setVence(e.target.value)}
                 data-vence
                 style={{ display: 'block', marginTop: 3, fontSize: 12, padding: '4px 6px' }} />
        </label>
      </div>
      <input value={motivo} onChange={e => setMotivo(e.target.value)}
             placeholder="Por qué (obligatorio)" data-motivo-excepcion
             style={{ fontSize: 12, padding: '5px 8px', borderRadius: 10,
                      border: '1px solid ' + (puede ? LINEA : AMBAR) }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="boton-tinta" data-guardar-excepcion
                disabled={guardando || !puede}
                onClick={() => {
                  onExcepcion({
                    alcance, regla, vence: vence || null, motivo: motivo.trim(),
                    huella: inc.huella,
                    codigo: alcance === 'codigo' ? codigos[0] : undefined,
                    plaza: alcance === 'plaza' ? plaza : undefined,
                  })
                  onCerrar()
                }}
                style={{ fontSize: 11.5, padding: '5px 12px' }}>
          Dejar de avisar
        </button>
        <button type="button" className="rev-saltar" onClick={onCerrar}>Cancelar</button>
      </div>
    </div>
  )
}

// ── Acciones en bloque ────────────────────────────────────────────────────

/**
 * La barra de bloque.
 *
 * Es la otra mitad del rediseño. La cola preguntaba código por código, y los
 * lotes resolvían eso sólo cuando la agrupación la decidía el sistema. Esto
 * deja agrupar A MANO lo que se contesta igual: marcar catorce y asignarlos a
 * una persona con una fecha es un gesto, no catorce.
 */
function Bloque({ cuantas, onEstado, onLimpiar, onAsignar, guardando }) {
  const [responsable, setResponsable] = useState('')
  const [compromiso, setCompromiso] = useState('')

  return (
    <div data-bloque
         style={{ position: 'sticky', top: 0, zIndex: 3,
                  border: '1px solid ' + TINTA, borderRadius: 14, padding: '9px 11px',
                  background: '#fff', display: 'flex', gap: 8, flexWrap: 'wrap',
                  alignItems: 'center', boxShadow: '0 2px 10px rgba(16,22,25,.08)' }}>
      <strong style={{ fontSize: 12, color: TINTA }}>{cuantas} marcadas</strong>
      <button type="button" className="chip-plaza" data-bloque-revisando
              disabled={guardando} onClick={() => onEstado(ESTADOS.REVISANDO)}
              style={{ fontSize: 11 }}>Las reviso yo</button>
      <button type="button" className="chip-plaza" data-bloque-origen
              disabled={guardando} onClick={() => onEstado(ESTADOS.EN_ORIGEN)}
              style={{ fontSize: 11 }}>A la sucursal</button>
      <span style={{ width: 1, height: 20, background: LINEA }} />
      <input value={responsable} onChange={e => setResponsable(e.target.value)}
             placeholder="asignar a" data-bloque-responsable
             style={{ fontSize: 11.5, padding: '4px 7px', width: 110, borderRadius: 9, border: '1px solid ' + LINEA }} />
      <input type="date" value={compromiso} onChange={e => setCompromiso(e.target.value)}
             data-bloque-compromiso
             style={{ fontSize: 11.5, padding: '4px 7px', borderRadius: 9, border: '1px solid ' + LINEA }} />
      <button type="button" className="boton-tinta" data-bloque-asignar
              disabled={guardando || (!responsable.trim() && !compromiso)}
              onClick={() => onAsignar({ responsable: responsable.trim(), compromiso })}
              style={{ fontSize: 11, padding: '5px 11px' }}>Asignar</button>
      <button type="button" className="rev-saltar" onClick={onLimpiar}
              style={{ marginInlineStart: 'auto' }}>Quitar la selección</button>
    </div>
  )
}

// ── Pendientes por sucursal ───────────────────────────────────────────────

/**
 * Lo que le toca a cada plaza, con el mensaje ya escrito.
 *
 * El mensaje se genera y no se escribe porque escribirlo a mano es justo lo
 * que no se hace: catorce códigos con su nombre y lo que hay que hacer con
 * cada uno es media hora de teclear, y media hora de teclear no ocurre nunca.
 */
function PorSucursal({ grupos, catalogo }) {
  const [copiado, setCopiado] = useState(null)

  const copiar = async g => {
    const texto = mensajeParaSucursal({
      plaza: g.plaza, nombre: g.nombre, incidencias: g.suyas, catalogo,
    })
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(g.plaza)
      setTimeout(() => setCopiado(null), 2500)
    } catch {
      // Sin permiso de portapapeles -o sin https- se abre WhatsApp con el
      // texto puesto, que llega al mismo sitio por otro camino.
      window.open('https://wa.me/?text=' + encodeURIComponent(texto), '_blank', 'noopener')
    }
  }

  if (!grupos.length) return null

  return (
    <section data-por-sucursal style={{ display: 'flex', flexDirection: 'column', gap: 8, border: '1px solid ' + TEMAS.inventario.borde, borderLeft: '5px solid ' + TEMAS.inventario.fuerte, background: TEMAS.inventario.suave, borderRadius: 18, padding: '12px 14px' }}>
      <h5 style={{ fontSize: 12.5, fontWeight: 800, color: TINTA, margin: 0 }}>
        Lo que le toca a cada plaza
      </h5>
      <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 7 }}>
        {grupos.map(g => (
          <li key={g.plaza} data-plaza-pendiente={g.plaza}
              style={{ border: '1px solid ' + LINEA, borderRadius: 14, padding: '9px 11px',
                       display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <strong style={{ fontSize: 12.5, color: TINTA, minWidth: 110 }}>{g.nombre}</strong>
            <span style={{ fontSize: 11.5, color: TINTA_SUAVE }}>
              {/* El avance va aqui porque «te faltan 3 de 11» se contesta y
                  «tienes pendientes» no. */}
              <strong style={{ color: g.suyas.length ? AMBAR : VERDE }}>{g.suyas.length}</strong>
              {' '}por corregir de {g.total}
              {g.piezas > 0 && <> · {g.piezas} pz</>}
              {g.vencidas > 0 && <span style={{ color: ROSA, fontWeight: 700 }}> · {g.vencidas} fuera de plazo</span>}
            </span>
            <div style={{ flex: 1, minWidth: 80, height: 6, borderRadius: 99, background: LINEA, overflow: 'hidden' }}>
              <div style={{ width: `${Math.round(g.avance * 100)}%`, height: '100%',
                            background: g.avance === 1 ? VERDE : AMBAR }} />
            </div>
            <button type="button" className="rev-saltar" data-whatsapp={g.plaza}
                    disabled={!g.suyas.length} onClick={() => copiar(g)}>
              {copiado === g.plaza ? '¡Copiado!' : 'Copiar mensaje'}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

// ── Análisis de causa ─────────────────────────────────────────────────────

/**
 * De dónde salen los errores.
 *
 * Una bandeja sin esto se vacía y se vuelve a llenar igual el mes siguiente.
 * Lo que dice es qué regla y qué plaza producen el trabajo, que es lo único
 * que permite que deje de producirse.
 */
function Causa({ incidencias, inventarios, hoy }) {
  const reglas = useMemo(() => porRegla(incidencias), [incidencias])
  const plazas = useMemo(() => porPlazaCuenta(incidencias), [incidencias])
  const salud = useMemo(() => saludPorPlaza(incidencias, inventarios), [incidencias, inventarios])
  const medio = useMemo(() => tiempoMedio(incidencias), [incidencias])

  return (
    <section data-causa style={{ display: 'flex', flexDirection: 'column', gap: 10, border: '1px solid ' + TEMAS.alerta.borde, borderLeft: '5px solid ' + TEMAS.alerta.fuerte, background: TEMAS.alerta.suave, borderRadius: 18, padding: '12px 14px' }}>
      <h5 style={{ fontSize: 12.5, fontWeight: 800, color: TINTA, margin: 0 }}>
        De dónde sale el trabajo
      </h5>

      <p style={{ fontSize: 11.5, color: TINTA_SUAVE, margin: 0, lineHeight: 1.5 }}>
        {medio === null
          ? 'Todavía no se ha cerrado nada, así que no hay tiempo medio de resolución que enseñar.'
          : <>Un caso tarda de media <strong style={{ color: TINTA }}>
              {medio < 48 ? `${medio} h` : `${Math.round(medio / 24)} días`}
            </strong> desde que aparece hasta que se cierra.</>}
      </p>

      {reglas.length > 0 && (
        <div>
          <p style={{ fontSize: 10.5, fontWeight: 800, color: TINTA_TENUE, margin: '0 0 5px', textTransform: 'uppercase', letterSpacing: .4 }}>
            Por regla
          </p>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {reglas.map(r => (
              <li key={r.regla} data-causa-regla={r.regla}
                  style={{ display: 'flex', gap: 8, fontSize: 11.5, color: TINTA_SUAVE, alignItems: 'baseline' }}>
                <strong style={{ color: TINTA, minWidth: 150 }}>{r.texto}</strong>
                <span><strong style={{ color: r.abiertas ? AMBAR : VERDE }}>{r.abiertas}</strong> abiertas de {r.total}</span>
                {r.piezas > 0 && <span style={{ color: TINTA_TENUE }}>{r.piezas} pz</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {plazas.length > 0 && (
        <div>
          <p style={{ fontSize: 10.5, fontWeight: 800, color: TINTA_TENUE, margin: '0 0 5px', textTransform: 'uppercase', letterSpacing: .4 }}>
            Por plaza · salud del catálogo
          </p>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {plazas.map(p => {
              const s = salud[p.plaza]
              return (
                <li key={p.plaza} data-causa-plaza={p.plaza}
                    style={{ display: 'flex', gap: 8, fontSize: 11.5, color: TINTA_SUAVE, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <strong style={{ color: TINTA, minWidth: 110 }}>{nombreSucursal(p.plaza)}</strong>
                  <span>{p.total} abiertas</span>
                  {s && (
                    <span style={{ color: COLOR_SEMAFORO[s.color], fontWeight: 700 }}>
                      {/* El % va sobre el catálogo de la plaza y no sobre el
                          total de incidencias: veinte casos en una plaza de
                          800 códigos y veinte en una de 100 no son lo mismo,
                          y contándolos a secas se ven iguales. */}
                      {Math.round(s.parte * 100)}% del catálogo limpio
                    </span>
                  )}
                  {s && <span style={{ color: TINTA_TENUE }}>{s.conIncidencia} de {s.total} códigos tocados</span>}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </section>
  )
}

// ── Excepciones y catálogo ────────────────────────────────────────────────

function Excepciones({ excepciones, onRevocar, hoy }) {
  const lista = Object.values(excepciones)
  if (!lista.length) return null
  return (
    <section data-excepciones style={{ display: 'flex', flexDirection: 'column', gap: 7, border: '1px solid ' + TEMAS.neutro.borde, borderLeft: '5px solid ' + TEMAS.neutro.fuerte, background: TEMAS.neutro.suave, borderRadius: 18, padding: '12px 14px' }}>
      <h5 style={{ fontSize: 12.5, fontWeight: 800, color: TINTA, margin: 0 }}>
        Avisos apagados a propósito
        <span style={{ marginInlineStart: 6, color: AMBAR }}>{lista.length}</span>
      </h5>
      <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {lista.map(e => {
          const caduca = e.vence && new Date(e.vence) < hoy
          return (
            <li key={e.id} data-excepcion={e.id}
                style={{ border: '1px solid ' + LINEA, borderRadius: 12, padding: '7px 10px',
                         display: 'flex', gap: 9, flexWrap: 'wrap', alignItems: 'center',
                         opacity: caduca ? .55 : 1 }}>
              <span style={{ fontSize: 11.5, color: TINTA, flex: 1, minWidth: 180 }}>
                <strong>{ALCANCES[e.alcance] ?? e.alcance}</strong>
                {e.codigo && <> · {e.codigo}</>}
                {e.plaza && <> · {nombreSucursal(e.plaza)}</>}
                {e.regla && <> · {TEXTO_REGLA[e.regla] ?? e.regla}</>}
                <br /><span style={{ color: TINTA_SUAVE }}>{e.motivo}</span>
              </span>
              <span style={{ fontSize: 10.5, color: caduca ? ROSA : TINTA_TENUE }}>
                {e.vence ? (caduca ? 'caducada' : `caduca el ${e.vence}`) : 'sin caducidad'}
                {e.por && ` · ${e.por}`}
              </span>
              <button type="button" className="rev-saltar" data-revocar={e.id}
                      onClick={() => onRevocar(e.id)}>Revocar</button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** El catálogo de códigos de error, editable. */
function Catalogo({ catalogo, onGuardar, guardando }) {
  const [abierto, setAbierto] = useState(null)
  return (
    <section data-catalogo style={{ display: 'flex', flexDirection: 'column', gap: 7, border: '1px solid ' + TEMAS.neutro.borde, borderLeft: '5px solid ' + TEMAS.neutro.fuerte, background: TEMAS.neutro.suave, borderRadius: 18, padding: '12px 14px' }}>
      <h5 style={{ fontSize: 12.5, fontWeight: 800, color: TINTA, margin: 0 }}>
        Qué significa cada error
      </h5>
      <p style={{ fontSize: 11, color: TINTA_TENUE, margin: 0, lineHeight: 1.45 }}>
        Se puede corregir. Arranca con lo medido de cada regla en vez de en blanco:
        una columna vacía no la rellena nadie si no ve para qué sirve.
      </p>
      <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {Object.values(catalogo).map(c => (
          <li key={c.regla} data-catalogo-regla={c.regla}
              style={{ border: '1px solid ' + LINEA, borderRadius: 12, padding: '7px 10px' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 11.5, color: TINTA, flex: 1, minWidth: 140 }}>{c.texto}</strong>
              {c.editado && <span style={{ fontSize: 10, color: AZUL }}>editado</span>}
              <button type="button" className="rev-saltar" data-editar-catalogo={c.regla}
                      onClick={() => setAbierto(abierto === c.regla ? null : c.regla)}>
                {abierto === c.regla ? 'Cerrar' : 'Editar'}
              </button>
            </div>
            <p style={{ fontSize: 11.5, color: TINTA_SUAVE, margin: '3px 0 0', lineHeight: 1.45 }}>
              {c.significa} <strong style={{ color: TINTA }}>Causa:</strong> {c.causa}{' '}
              <strong style={{ color: TINTA }}>Qué hacer:</strong> {c.hacer}
            </p>
            {abierto === c.regla && (
              <EditarCatalogo c={c} onGuardar={onGuardar} guardando={guardando}
                              onCerrar={() => setAbierto(null)} />
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

function EditarCatalogo({ c, onGuardar, guardando, onCerrar }) {
  const [significa, setSignifica] = useState(c.significa)
  const [causa, setCausa] = useState(c.causa)
  const [hacer, setHacer] = useState(c.hacer)
  const campo = { width: '100%', fontSize: 12, padding: '5px 8px', borderRadius: 9,
                  border: '1px solid ' + LINEA, fontFamily: 'inherit', resize: 'vertical' }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 7 }}>
      <textarea value={significa} onChange={e => setSignifica(e.target.value)} rows={2}
                placeholder="Qué significa" style={campo} />
      <textarea value={causa} onChange={e => setCausa(e.target.value)} rows={2}
                placeholder="Causa probable" style={campo} />
      <textarea value={hacer} onChange={e => setHacer(e.target.value)} rows={2}
                placeholder="Qué hacer" style={campo} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="boton-tinta" data-guardar-catalogo={c.regla}
                disabled={guardando || !significa.trim()}
                onClick={() => { onGuardar(c.regla, { significa, causa, hacer }); onCerrar() }}
                style={{ fontSize: 11.5, padding: '5px 12px' }}>Guardar</button>
        <button type="button" className="rev-saltar" onClick={onCerrar}>Cancelar</button>
      </div>
    </div>
  )
}

// ── El tablero ────────────────────────────────────────────────────────────

/** El mismo trabajo por columnas. Dice de un vistazo dónde se atasca. */
function Tablero({ incidencias, onAbrir }) {
  const cols = [
    { estado: ESTADOS.NUEVA,     color: AZUL },
    { estado: ESTADOS.REVISANDO, color: AMBAR },
    { estado: ESTADOS.EN_ORIGEN, color: AMBAR },
    { estado: ESTADOS.CONFLICTO, color: ROSA },
  ]
  return (
    <div data-tablero style={{ display: 'flex', gap: 9, overflowX: 'auto', paddingBottom: 6 }}>
      {cols.map(c => {
        const suyas = incidencias.filter(i => i.estado === c.estado)
        return (
          <div key={c.estado} data-columna={c.estado}
               style={{ flex: '1 0 190px', minWidth: 190, border: '1px solid ' + LINEA,
                        borderTop: '4px solid ' + c.color, borderRadius: 14, padding: '8px 9px',
                        background: c.color + '0D' }}>
            <p style={{ fontSize: 11, fontWeight: 800, color: c.color, margin: '0 0 7px' }}>
              {TEXTO_ESTADO[c.estado]}
              <span style={{ marginInlineStart: 5, color: TINTA_TENUE }}>{suyas.length}</span>
            </p>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
              {suyas.slice(0, 20).map(i => (
                <li key={i.huella}>
                  <button type="button" onClick={() => onAbrir(i.huella)}
                          style={{ width: '100%', textAlign: 'start', fontSize: 11,
                                   padding: '6px 8px', borderRadius: 9, cursor: 'pointer',
                                   border: '1px solid ' + (i.vencida ? ROSA : LINEA),
                                   background: '#fff', color: TINTA, lineHeight: 1.35 }}>
                    {i.hallazgo?.chip || i.hallazgo?.titulo || i.huella}
                  </button>
                </li>
              ))}
            </ul>
            {suyas.length > 20 && (
              <p style={{ fontSize: 10, color: TINTA_TENUE, margin: '6px 0 0' }}>
                Y {suyas.length - 20} más.
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── La bandeja ────────────────────────────────────────────────────────────

/**
 * La bandeja entera.
 *
 * `hallazgos` son los de hoy, recalculados. `registros` lo guardado. Nada se
 * persiste aquí: los `on…` lo mandan al backend.
 */
export default function Bandeja({
  hallazgos, registros, onGuardar, onGuardarVarias, onCfg, onRevocarCfg,
  onCorregir, guardando, inventarios = {}, alternativas, quien, hoy = new Date(),
}) {
  const [pestana, setPestana] = useState('atender')
  const [vista, setVista] = useState('todo')
  const [plaza, setPlaza] = useState('')
  const [regla, setRegla] = useState('')
  const [busca, setBusca] = useState('')
  const [abierta, setAbierta] = useState(null)
  const [marcadas, setMarcadas] = useState(() => new Set())
  const [tablero, setTablero] = useState(false)
  const [cursor, setCursor] = useState(0)

  const excepciones = useMemo(() => excepcionesDe(registros), [registros])
  const catalogo = useMemo(() => catalogoDe(registros), [registros])

  // Las excepciones se aplican ANTES de conciliar: un hallazgo tapado no es
  // una incidencia descartada -no tiene estado, no cuenta, no sale en las
  // cuentas-. Mezclarlos haria que el encabezado contara como trabajo lo que
  // alguien decidio no mirar.
  const vivos = useMemo(() => (hallazgos ?? []).filter(h => {
    // La huella, no el id: para un lote llevan los codigos dentro, y una
    // excepcion puesta sobre «este caso» tiene que seguir al mismo lote y no
    // a cualquier lote de la misma clase.
    try { return !tapadaPor(h, huellaDe(h), excepciones, hoy) } catch { return true }
  }), [hallazgos, excepciones, hoy])

  const incidencias = useMemo(
    () => ordenar(conciliarSeguro(vivos, registros, hoy)), [vivos, registros, hoy])
  const r = useMemo(() => resumir(incidencias, hoy), [incidencias, hoy])

  const grupos = useMemo(
    () => agruparPorPlaza(incidencias, nombreSucursal), [incidencias])

  const reglasHay = useMemo(() => {
    const s = new Set(incidencias.map(i => reglaDe(i.huella)))
    return [...s]
  }, [incidencias])

  const plazasHay = useMemo(() => {
    const s = new Set(incidencias.flatMap(i => i.hallazgo?.plazas ?? []))
    return [...s]
  }, [incidencias])

  const lista = useMemo(() => {
    const p = PESTANAS.find(x => x.id === pestana) ?? PESTANAS[0]
    const q = busca.trim().toUpperCase()
    return incidencias.filter(i => {
      if (!p.estados.includes(i.estado)) return false
      if (plaza && !(i.hallazgo?.plazas ?? []).includes(plaza)) return false
      if (regla && reglaDe(i.huella) !== regla) return false
      if (vista === 'vencidas' && !i.vencida) return false
      if (vista === 'mias' && i.registro?.responsable !== quien) return false
      // «De un clic» es el paso 0: sin existencia en ninguna plaza, una
      // respuesta y se ejecuta hoy. Es la vista con la que se vacía la
      // bandeja deprisa, y por eso tiene nombre propio.
      if (vista === 'rapidas' && i.hallazgo?.paso !== 'borrar') return false
      if (q) {
        const texto = [
          i.hallazgo?.chip, i.hallazgo?.titulo, i.hallazgo?.producto,
          ...codigosDe(i.hallazgo),
        ].filter(Boolean).join(' ').toUpperCase()
        if (!texto.includes(q)) return false
      }
      return true
    })
  }, [incidencias, pestana, plaza, regla, vista, busca, quien])

  const visibles = useMemo(() => lista.slice(0, 80), [lista])

  // El cursor se recorta cuando la lista se encoge: apuntando fuera, los
  // atajos dejaban de hacer nada sin decir por que.
  useEffect(() => { setCursor(c => Math.min(c, Math.max(0, visibles.length - 1))) },
    [visibles.length])

  const incAbierta = useMemo(
    () => incidencias.find(i => i.huella === abierta) ?? null, [incidencias, abierta])

  const marcar = useCallback(huella => setMarcadas(s => {
    const n = new Set(s)
    if (n.has(huella)) n.delete(huella); else n.add(huella)
    return n
  }), [])

  const marcarTodas = useCallback(() => setMarcadas(s =>
    s.size === visibles.length ? new Set() : new Set(visibles.map(i => i.huella))), [visibles])

  const deLasMarcadas = useCallback(() =>
    incidencias.filter(i => marcadas.has(i.huella)), [incidencias, marcadas])

  const enBloque = async campos => {
    await onGuardarVarias(deLasMarcadas(), campos)
    setMarcadas(new Set())
  }

  // ── Atajos de teclado ───────────────────────────────────────────────────
  //
  // Son la diferencia entre mover un caso con tres clics y moverlo con una
  // tecla. Se desactivan dentro de un campo: escribir «r» en una nota no
  // puede cambiar el estado del caso.
  const refVisibles = useRef(visibles)
  refVisibles.current = visibles
  const refCursor = useRef(cursor)
  refCursor.current = cursor

  useEffect(() => {
    const escribiendo = el => {
      const t = (el?.tagName ?? '').toUpperCase()
      return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || el?.isContentEditable
    }
    const alPulsar = ev => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return
      if (escribiendo(ev.target)) return
      const v = refVisibles.current
      const i = v[refCursor.current]
      const mover = d => {
        ev.preventDefault()
        setCursor(c => Math.max(0, Math.min(v.length - 1, c + d)))
      }
      switch (ev.key) {
        case 'j': case 'ArrowDown': return mover(1)
        case 'k': case 'ArrowUp':   return mover(-1)
        case 'x': if (i) { ev.preventDefault(); marcar(i.huella) } return
        case 'a': ev.preventDefault(); return marcarTodas()
        case 'Enter': if (i) { ev.preventDefault(); setAbierta(i.huella) } return
        case 'Escape': setAbierta(null); return
        case 'r': if (i) { ev.preventDefault(); onGuardar(i, { estado: ESTADOS.REVISANDO }) } return
        case 's': if (i) { ev.preventDefault(); onGuardar(i, { estado: ESTADOS.EN_ORIGEN }) } return
        default: return
      }
    }
    window.addEventListener('keydown', alPulsar)
    return () => window.removeEventListener('keydown', alPulsar)
  }, [marcar, marcarTodas, onGuardar])

  // La llave va DENTRO del ayudante: devolviendo el boton desde un `map` sin
  // ella, React avisa en consola y reusa nodos entre dibujos. No rompe nada
  // -por eso jsdom lo dejaba pasar como aviso- y lo caza mirar la pagina.
  const chip = (clave, activo, texto, onClick, extra) => (
    <button key={clave} type="button" onClick={onClick} {...extra}
            className={activo ? 'chip-plaza activa' : 'chip-plaza'}>{texto}</button>
  )

  return (
    <div data-bandeja style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ── Encabezado ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Dato n={r.nuevas}     etiqueta="sin mirar"   color={AZUL} />
        <Dato n={r.revisando}  etiqueta="en revisión" color={AMBAR} />
        <Dato n={r.enOrigen}   etiqueta="en sucursal" color={AMBAR} nota="esperando a la caja" />
        <Dato n={r.conflictos} etiqueta="reabiertas"  color={ROSA} />
        <Dato n={r.cerradasEstaSemana} etiqueta="cerradas" color={VERDE} nota="esta semana" />
        <Dato n={r.vencidas}   etiqueta="fuera de plazo" color={r.vencidas ? ROSA : TINTA_TENUE} />
      </div>

      <p style={{ fontSize: 11.5, color: TINTA_SUAVE, margin: 0, lineHeight: 1.5 }}>
        De lo abierto: <strong>{r.frescas}</strong> de 0 a 2 días,
        {' '}<strong>{r.medias}</strong> de 3 a 7, y
        {' '}<strong style={{ color: r.viejas ? ROSA : TINTA }}>{r.viejas}</strong> de más de una semana.
        Un caso se cierra <strong>solo</strong> cuando el respaldo deja de producirlo: nadie lo marca
        como hecho. Atajos: <kbd>j</kbd>/<kbd>k</kbd> moverse, <kbd>x</kbd> marcar,
        {' '}<kbd>a</kbd> marcar todo, <kbd>r</kbd> «la reviso yo», <kbd>s</kbd> «a la sucursal»,
        {' '}<kbd>Enter</kbd> abrir.
      </p>

      {/* ── Vistas y filtros ────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
        {VISTAS.map(v => chip(v.id, vista === v.id, v.texto, () => setVista(v.id),
          { 'data-vista': v.id, title: v.nota }))}
        <span style={{ width: 1, height: 20, background: LINEA }} />
        <select value={plaza} onChange={e => setPlaza(e.target.value)} data-filtro-plaza
                style={{ fontSize: 11.5, padding: '4px 7px' }}>
          <option value="">Todas las plazas</option>
          {plazasHay.map(p => <option key={p} value={p}>{nombreSucursal(p)}</option>)}
        </select>
        <select value={regla} onChange={e => setRegla(e.target.value)} data-filtro-regla
                style={{ fontSize: 11.5, padding: '4px 7px' }}>
          <option value="">Todas las reglas</option>
          {reglasHay.map(x => <option key={x} value={x}>{TEXTO_REGLA[x] ?? x}</option>)}
        </select>
        <input value={busca} onChange={e => setBusca(e.target.value)} data-filtro-busca
               placeholder="código o modelo"
               style={{ fontSize: 11.5, padding: '4px 8px', borderRadius: 9, border: '1px solid ' + LINEA, width: 150 }} />
        {chip('tablero', tablero, tablero ? 'Ver lista' : 'Ver tablero',
          () => setTablero(v => !v), { 'data-ver-tablero': '' })}
      </div>

      {/* ── Pestañas ────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {PESTANAS.map(p => {
          const n = incidencias.filter(i => p.estados.includes(i.estado)).length
          return (
            <button key={p.id} type="button" onClick={() => setPestana(p.id)}
                    data-bandeja-pestana={p.id}
                    className={pestana === p.id ? 'chip-plaza activa' : 'chip-plaza'}>
              {p.texto}
              <span style={{ marginInlineStart: 6, fontWeight: 800 }}>{n}</span>
            </button>
          )
        })}
      </div>

      {marcadas.size > 0 && (
        <Bloque cuantas={marcadas.size} guardando={Boolean(guardando)}
                onEstado={estado => enBloque({ estado })}
                onAsignar={campos => enBloque({ estado: ESTADOS.REVISANDO, ...campos })}
                onLimpiar={() => setMarcadas(new Set())} />
      )}

      {tablero ? (
        <Tablero incidencias={incidencias} onAbrir={setAbierta} />
      ) : (
        <div className={incAbierta ? 'bandeja-dos' : 'bandeja-una'}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
            {visibles.length > 1 && (
              <button type="button" className="rev-saltar" onClick={marcarTodas}
                      data-marcar-todas style={{ alignSelf: 'flex-start', fontSize: 11 }}>
                {marcadas.size === visibles.length ? 'Quitar la selección' : `Marcar los ${visibles.length}`}
              </button>
            )}
            {visibles.length === 0 ? (
              <p style={{ fontSize: 12, color: TINTA_TENUE, margin: 0 }}>
                Nada aquí.{' '}
                {pestana === 'atender' && !plaza && !regla && !busca && vista === 'todo'
                  ? 'Todo lo detectado está mirado.'
                  : 'Con estos filtros no queda ninguno.'}
              </p>
            ) : (
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {visibles.map((inc, n) => (
                  <Fila key={inc.huella} inc={inc}
                        abierta={abierta === inc.huella} enCursor={cursor === n}
                        marcada={marcadas.has(inc.huella)}
                        onAbrir={h => { setAbierta(h); setCursor(n) }}
                        onMarcar={marcar}
                        onRapido={(i, estado) => onGuardar(i, { estado })}
                        guardando={guardando === inc.huella} />
                ))}
              </ul>
            )}
            {lista.length > 80 && (
              <p style={{ fontSize: 11, color: TINTA_TENUE, margin: 0 }}>
                Y {lista.length - 80} más. Filtra por plaza, regla o código para verlos.
              </p>
            )}
          </div>

          {incAbierta && (
            <Detalle inc={incAbierta} catalogo={catalogo} alternativas={alternativas}
                     onGuardar={onGuardar} onCorregir={onCorregir}
                     onExcepcion={campos => onCfg(
                       `${PREFIJO_CONFIG}exc|${Date.now().toString(36)}`, campos)}
                     guardando={guardando === incAbierta.huella}
                     onCerrar={() => setAbierta(null)} />
          )}
        </div>
      )}

      <PorSucursal grupos={grupos} catalogo={catalogo} />
      <Causa incidencias={incidencias} inventarios={inventarios} hoy={hoy} />
      <Excepciones excepciones={excepciones} onRevocar={onRevocarCfg} hoy={hoy} />
      <Catalogo catalogo={catalogo} guardando={Boolean(guardando)}
                onGuardar={(regla_, campos) => onCfg(
                  `${PREFIJO_CONFIG}cat|${regla_}`, { regla: regla_, ...campos })} />
    </div>
  )
}
