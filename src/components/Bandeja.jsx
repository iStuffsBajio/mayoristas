// La bandeja de incidencias: encabezado, pestañas y el formulario de cada caso.
//
// Sustituye al recorrido de «una ficha cada vez» por una bandeja donde se ve
// todo el estado a la vez. El motivo lo dio el dueño: «la pestaña sólo genera
// reportes, no me deja trabajar los errores», y «no tengo control claro de qué
// ya corregí yo y qué falta que corrija la sucursal».
//
// Las cuentas y el ciclo de vida viven en `lib/incidencias.js`, con pruebas.
// Aquí sólo se dibuja y se guarda.
//
// ── Lo que NO cambia, y es lo importante ─────────────────────────────────
//
// Los hallazgos se siguen recalculando del respaldo en cada carga. Esto es
// una capa de estado encima, no una tabla de incidencias: si el respaldo deja
// de producir un caso, se cierra solo. No hay incidencias zombi posibles.

import { useMemo, useState } from 'react'
import {
  ESTADOS, ESTADOS_QUE_SE_ELIGEN, TEXTO_ESTADO, GRAVEDADES,
  conciliar, ordenar, resumir,
} from '../lib/incidencias'

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

const COLOR_ESTADO = {
  [ESTADOS.NUEVA]:      '#0288AD',
  [ESTADOS.REVISANDO]:  '#B45309',
  [ESTADOS.EN_ORIGEN]:  '#B45309',
  [ESTADOS.CERRADA]:    '#5E9422',
  [ESTADOS.DESCARTADA]: TINTA_TENUE,
  [ESTADOS.CONFLICTO]:  ROSA,
}

const COLOR_GRAVEDAD = {
  critica: ROSA, alta: '#B45309', media: '#0288AD', baja: TINTA_TENUE,
}

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

function Dato({ n, etiqueta, color, nota }) {
  return (
    <div style={{ flex: 1, minWidth: 104, padding: '10px 12px', border: '1px solid ' + LINEA, borderRadius: 16 }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: color ?? TINTA, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{n}</div>
      <div style={{ fontSize: 11, color: TINTA_SUAVE, marginTop: 2 }}>{etiqueta}</div>
      {nota && <div style={{ fontSize: 10, color: TINTA_TENUE, marginTop: 1 }}>{nota}</div>}
    </div>
  )
}

/**
 * El formulario de una incidencia.
 *
 * Es un formulario y no tres botones porque el dueño lo pidió así, y porque
 * una decisión sin motivo no se puede revisar a la semana: lo que se guarda
 * aquí es lo que explica por qué el número de la pantalla es el que es.
 *
 * `cerrada` y `nueva` NO se pueden elegir: las decide el respaldo. Dejarlas
 * elegibles permitiría dar por cerrado algo que sigue fallando, que es
 * exactamente lo que esta pestaña existe para impedir.
 */
function Formulario({ inc, onGuardar, guardando }) {
  const r = inc.registro ?? {}
  const [estado, setEstado] = useState(
    ESTADOS_QUE_SE_ELIGEN.includes(r.estado) ? r.estado : ESTADOS.REVISANDO)
  const [gravedad, setGravedad] = useState(inc.gravedad)
  const [nota, setNota] = useState(r.nota ?? '')
  const [responsable, setResponsable] = useState(r.responsable ?? '')
  const [compromiso, setCompromiso] = useState(r.compromiso ?? '')

  const pideMotivo = estado === ESTADOS.DESCARTADA

  return (
    <div data-formulario={inc.huella}
         style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10,
                  paddingTop: 10, borderTop: '1px dashed ' + LINEA }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 11, color: TINTA_SUAVE }}>
          Qué hago con esto
          <select value={estado} onChange={e => setEstado(e.target.value)}
                  style={{ display: 'block', marginTop: 3, fontSize: 12, padding: '4px 6px' }}>
            {ESTADOS_QUE_SE_ELIGEN.map(e => (
              <option key={e} value={e}>{TEXTO_ESTADO[e]}</option>
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
                 placeholder="nombre"
                 style={{ display: 'block', marginTop: 3, fontSize: 12, padding: '4px 6px', width: 120 }} />
        </label>

        <label style={{ fontSize: 11, color: TINTA_SUAVE }}>
          Para cuándo
          <input type="date" value={compromiso} onChange={e => setCompromiso(e.target.value)}
                 style={{ display: 'block', marginTop: 3, fontSize: 12, padding: '4px 6px' }} />
        </label>
      </div>

      <textarea value={nota} onChange={e => setNota(e.target.value)} rows={2}
                placeholder={pideMotivo
                  ? 'Por qué no es un error (obligatorio)'
                  : 'Qué se decidió y por qué'}
                style={{ fontSize: 12, padding: '6px 8px', borderRadius: 10,
                         border: `1px solid ${pideMotivo && !nota.trim() ? ROSA : LINEA}`,
                         resize: 'vertical', fontFamily: 'inherit' }} />

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="boton-tinta"
                data-guardar={inc.huella}
                disabled={guardando || (pideMotivo && !nota.trim())}
                onClick={() => onGuardar(inc, { estado, gravedad, nota, responsable, compromiso })}
                style={{ fontSize: 11.5, padding: '6px 14px' }}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
        {inc.registro && (
          <button type="button" className="rev-saltar"
                  onClick={() => onGuardar(inc, null)}>
            Deshacer
          </button>
        )}
        {/* Descartar sin motivo deja una decision que nadie puede revisar a
            la semana. Se dice por que esta deshabilitado, no solo se apaga. */}
        {pideMotivo && !nota.trim() && (
          <span style={{ fontSize: 11, color: ROSA }}>
            Descartar pide motivo: es lo único que explica por qué dejó de avisar.
          </span>
        )}
      </div>
    </div>
  )
}

/** Una incidencia en la bandeja. */
function Fila({ inc, abierta, onAbrir, onGuardar, guardando }) {
  const g = GRAVEDADES[inc.gravedad]
  const h = inc.hallazgo
  return (
    <li data-incidencia={inc.huella} data-estado={inc.estado}
        style={{ border: '1px solid ' + (inc.vencida ? ROSA : LINEA), borderRadius: 14,
                 padding: '10px 12px', background: inc.vencida ? 'rgba(196,21,111,0.04)' : '#fff' }}>
      {/* El clic va en la CABECERA, no en el <li>: el formulario vive dentro
          del renglon, y con el manejador en el padre cada clic dentro del
          formulario lo cerraria. */}
      <div data-abrir={inc.huella}
           onClick={() => onAbrir(abierta ? null : inc.huella)}
           style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap', cursor: 'pointer' }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, color: COLOR_GRAVEDAD[inc.gravedad] }}>
          {g.texto}
        </span>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: COLOR_ESTADO[inc.estado] }}>
          {TEXTO_ESTADO[inc.estado]}
        </span>
        {/* Lo que IDENTIFICA el caso va primero, no la etiqueta del tipo.
            La primera version enseñaba solo el titulo del paso, y con eso
            salian diecisiete renglones diciendo «Se vende y bodega no lo
            tiene de alta» sin que se pudiera distinguir cual era cual: una
            lista en la que no se puede elegir no sirve para trabajar.
            `chip` es la linea de identidad que ya traia cada ficha. */}
        <span style={{ fontSize: 12.5, color: TINTA, flex: 1, minWidth: 200 }}>
          <strong>{h?.chip || h?.titulo || inc.registro?.nota || inc.huella}</strong>
          {h?.chip && (h?.titulo || h?.etiqueta) && (
            <span style={{ color: TINTA_TENUE, fontWeight: 400 }}>
              {' — '}{h.titulo || h.etiqueta}
            </span>
          )}
        </span>
        {inc.vencida && (
          <span style={{ fontSize: 10.5, fontWeight: 800, color: ROSA }}>fuera de plazo</span>
        )}
        <span style={{ fontSize: 11, color: TINTA_TENUE, whiteSpace: 'nowrap' }}>
          {inc.estado === ESTADOS.NUEVA ? 'sin mirar'
            : inc.dias === 0 ? 'hoy' : `hace ${inc.dias} d`}
        </span>
      </div>

      {/* Lo que el respaldo verificó solo. Se dice, porque si no el trabajo
          que hace el sistema por su cuenta es invisible. */}
      {inc.verificada && (
        <p style={{ fontSize: 11, color: '#5E9422', margin: '6px 0 0' }}>
          El respaldo ya no la detecta: se cerró sola, sin que nadie marcara nada.
        </p>
      )}

      {abierta && inc.hallazgo && (
        <Formulario inc={inc} onGuardar={onGuardar} guardando={guardando === inc.huella} />
      )}
    </li>
  )
}

/**
 * La bandeja entera.
 *
 * `hallazgos` son los de hoy, recalculados. `registros` lo guardado. Nada se
 * persiste aquí: `onGuardar` lo manda al backend.
 */
export default function Bandeja({ hallazgos, registros, onGuardar, guardando, hoy = new Date() }) {
  const [pestana, setPestana] = useState('atender')
  const [abierta, setAbierta] = useState(null)

  const incidencias = useMemo(
    () => ordenar(conciliarSeguro(hallazgos, registros, hoy)), [hallazgos, registros, hoy])
  const r = useMemo(() => resumir(incidencias, hoy), [incidencias, hoy])

  const dePestana = useMemo(() => {
    const p = PESTANAS.find(x => x.id === pestana) ?? PESTANAS[0]
    return incidencias.filter(i => p.estados.includes(i.estado))
  }, [incidencias, pestana])

  return (
    <div data-bandeja style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Dato n={r.nuevas}     etiqueta="sin mirar"   color="#0288AD" />
        <Dato n={r.revisando}  etiqueta="en revisión" color="#B45309" />
        <Dato n={r.enOrigen}   etiqueta="en sucursal" color="#B45309" nota="esperando a la caja" />
        <Dato n={r.conflictos} etiqueta="reabiertas"  color={ROSA} />
        <Dato n={r.cerradasEstaSemana} etiqueta="cerradas" color="#5E9422" nota="esta semana" />
        <Dato n={r.vencidas}   etiqueta="fuera de plazo" color={r.vencidas ? ROSA : TINTA_TENUE} />
      </div>

      <p style={{ fontSize: 11.5, color: TINTA_SUAVE, margin: 0, lineHeight: 1.5 }}>
        De lo abierto: <strong>{r.frescas}</strong> de 0 a 2 días,
        {' '}<strong>{r.medias}</strong> de 3 a 7, y
        {' '}<strong style={{ color: r.viejas ? ROSA : TINTA }}>{r.viejas}</strong> de más de una semana.
        Un caso se cierra <strong>solo</strong> cuando el respaldo deja de producirlo: nadie lo marca
        como hecho.
      </p>

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

      {dePestana.length === 0 ? (
        <p style={{ fontSize: 12, color: TINTA_TENUE, margin: 0 }}>
          Nada aquí. {pestana === 'atender' ? 'Todo lo detectado está mirado.' : ''}
        </p>
      ) : (
        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {dePestana.slice(0, 60).map(inc => (
            <Fila key={inc.huella} inc={inc} abierta={abierta === inc.huella}
                  onAbrir={setAbierta} onGuardar={onGuardar} guardando={guardando} />
          ))}
        </ul>
      )}
      {dePestana.length > 60 && (
        <p style={{ fontSize: 11, color: TINTA_TENUE, margin: 0 }}>
          Y {dePestana.length - 60} más.
        </p>
      )}
    </div>
  )
}
