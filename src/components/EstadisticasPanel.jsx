import { useState, useEffect, useMemo } from 'react'
// La bodega queda fuera: lo que sale de ahi son envios a las sucursales,
// no ventas, y mezclarlo falsearia el ranking.
import { SUCURSALES_PUBLICAS as SUCURSALES, BODEGA } from '../lib/sucursales'
import { estadisticasUrl, historialUrl, inventarioJsonUrl } from '../lib/s3'
import { promedioEntrePlazas } from '../lib/precios'
import {
  proyeccionDelMes, puenteDeVariacion, momentum, brechas,
  costoPorModelo, rentabilidad, capitalParado, salidasEntre, sinCostear,
} from '../lib/radiografia'
import { ritmoPonderado } from '../lib/ritmo'
import { ultimaVentaPorModelo, diasDesdeElMes } from '../lib/clases'
import {
  resumir, periodosDisponibles, comparativo,
  consolidarHistorial, consolidarEstadisticas,
} from '../lib/estadisticas'
import { descargarHistorial, descargarComparativo, nombreDePeriodo } from '../lib/exportarEstadisticas'
import { descargarCostos } from '../lib/exportarCostos'
import { useVentas } from '../lib/useVentas'
import { useAuth } from '../context/AuthContext'
import { precioPorPlaza, preciosDeVenta, soloPrecios, cobertura } from '../lib/ventasTicket'
import { porDebajoDelMayoreo, mayoreoSinMarcar } from '../lib/precioCobrado'
import { descargarPrecios } from '../lib/exportarPrecios'
import { hayBusqueda } from '../lib/buscar'
import { mapaDeAltas } from '../lib/surtido'
import { estrenos, comparaEdiciones, DIAS_EDICION, DIAS_PARA_OPINAR } from '../lib/estrenos'
// La regla de buscar vive en la libreria, con sus pruebas, no aqui: la
// pastilla de la plaza y la del rango no pueden esconder un codigo que existe.
import { modelosQueCoinciden, fichaDeVentas } from '../lib/buscarVentas'
import { lecturaDeVenta, DIAS_AGOTADOS } from '../lib/agotados'

// Una serie por gráfica, así que no hacen falta colores categóricos ni leyenda:
// el título nombra la serie. Los tonos pasaron el validador de contraste contra
// fondo claro.
const C_RANKING = '#C4156F'
const C_SERIE   = '#0288AD'
const C_SUBE    = '#4B7A1B'
const C_BAJA    = '#C4156F'

const TINTA       = '#101619'
const TINTA_SUAVE = '#4A5A61'
const TINTA_TENUE = '#8598A1'
const LINEA       = '#D6E0E4'

const RANGOS = [7, 30, 60]

const PLAZOS = [
  { meses: 1,  etiqueta: '1 mes'   },
  { meses: 2,  etiqueta: '2 meses' },
  { meses: 3,  etiqueta: '3 meses' },
  { meses: 6,  etiqueta: '6 meses' },
  { meses: 12, etiqueta: '1 año'   },
]

const TOP_COMPARATIVO = 25

const TODAS = { slug: 'todas', nombre: 'Todas las sucursales' }

// ── Piezas ────────────────────────────────────────────────────────────────────

function Pildora({ activa, onClick, children, tenue }) {
  // El botón de la casa, en `.chip-plaza`: blanco por dentro, trazo y letra
  // en degradado. Antes era una píldora rellena de cian y verde, que es el
  // único sitio donde seguía viva esa paleta.
  return (
    <button type="button" onClick={onClick}
            className={'chip-plaza' + (activa ? ' activa' : '')}
            aria-pressed={activa}
            style={tenue ? { opacity: 0.75 } : undefined}>
      <span className="chip-plaza-texto">{children}</span>
    </button>
  )
}

function BotonExcel({ onClick, principal, children }) {
  return (
    <button type="button" onClick={onClick}
      className="px-4 py-2 text-sm font-semibold transition-all"
      style={principal
        ? { borderRadius: 999, border: '1.5px solid transparent', cursor: 'pointer', fontWeight: 800, color: '#101619', background: 'linear-gradient(#fff, #fff) padding-box, var(--degradado-letra) border-box' }
        : { backgroundColor: '#fff', border: '1px solid ' + LINEA, borderRadius: 999, color: TINTA_SUAVE, cursor: 'pointer' }}>
      {children}
    </button>
  )
}

/**
 * Sección que se abre al pulsarla.
 *
 * El comparativo y el archivo por mes son consultas puntuales, no algo que se
 * mire cada vez: desplegados empujaban la gráfica y el ranking fuera de la
 * pantalla y había que bajar mucho para llegar a lo de siempre. Cerrados
 * ocupan un renglón, y el resumen de la derecha deja ver si vale la pena
 * abrirlos sin tener que hacerlo.
 */
function Plegable({ titulo, resumen, children, abiertoPorDefecto = false }) {
  const [abierto, setAbierto] = useState(abiertoPorDefecto)

  return (
    <div style={{ borderTop: '1px solid ' + LINEA, paddingTop: 14 }}>
      <button type="button" onClick={() => setAbierto(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, width: '100%',
          background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left',
        }}>
        <span style={{
          fontSize: 13, color: TINTA_TENUE, transition: 'transform .18s',
          transform: abierto ? 'rotate(90deg)' : 'rotate(0deg)', lineHeight: 1,
        }}>›</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: TINTA }}>{titulo}</span>
        {resumen && (
          <span style={{ fontSize: 11.5, color: TINTA_TENUE, marginLeft: 'auto', textAlign: 'right' }}>
            {resumen}
          </span>
        )}
      </button>
      {abierto && <div style={{ marginTop: 14 }}>{children}</div>}
    </div>
  )
}

/** Una cifra y su etiqueta, en línea. Para resúmenes que no necesitan caja. */
function Cifra({ valor, etiqueta, color }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5 }}>
      <strong style={{ fontSize: 21, fontWeight: 800, color: color || TINTA, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
        {valor}
      </strong>
      <span style={{ fontSize: 12, color: TINTA_SUAVE }}>{etiqueta}</span>
    </span>
  )
}

function Dato({ valor, etiqueta, nota, color }) {
  return (
    <div style={{ flex: 1, minWidth: 120, padding: '14px 16px', background: '#fff', border: '1px solid ' + LINEA, borderRadius: 18 }}>
      <div style={{ fontSize: 26, fontWeight: 800, color: color || TINTA, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{valor}</div>
      <div style={{ fontSize: 12, color: TINTA_SUAVE, marginTop: 3 }}>{etiqueta}</div>
      {nota && <div style={{ fontSize: 11, color: TINTA_TENUE, marginTop: 2 }}>{nota}</div>}
    </div>
  )
}

function Aviso({ children }) {
  return <p style={{ fontSize: 11.5, color: '#B45309', margin: 0, lineHeight: 1.5 }}>{children}</p>
}

/** Serie diaria. Barras finas, extremo redondeado y apoyadas en la base. */
const DIAS_SEMANA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const INICIAL     = ['D', 'L', 'M', 'X', 'J', 'V', 'S']

const fechaDe = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d) }
const fmtDia  = iso => fechaDe(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })

/**
 * Serie diaria con el día de la semana bajo cada barra.
 *
 * La etiqueta se ajusta al rango porque el ancho no da para todo: hasta diez
 * días caben "lun 6"; hasta un mes solo la inicial; por encima no cabe nada y
 * se dejan las fechas de los extremos. Poner siempre lo mismo convertía el pie
 * en una mancha ilegible a 60 días.
 *
 * El fin de semana va con el fondo tenue: así se ve de un vistazo si la caída
 * de un día es porque cerró o porque vendió poco.
 */
function SerieDiaria({ serie }) {
  const [activo, setActivo] = useState(null)
  const max = Math.max(1, ...serie.map(d => d.salidas))
  const detalle = serie.length <= 10 ? 'completo' : serie.length <= 31 ? 'inicial' : 'ninguno'

  const total = serie.reduce((a, d) => a + d.salidas, 0)
  const conDato = serie.filter(d => d.salidas > 0).length
  const promedio = conDato ? total / conDato : 0

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8, gap: 10, flexWrap: 'wrap' }}>
        <h4 style={{ fontSize: 12.5, fontWeight: 700, color: TINTA, margin: 0 }}>Piezas por día</h4>
        <span style={{ fontSize: 11.5, color: activo ? TINTA : TINTA_TENUE, fontVariantNumeric: 'tabular-nums' }}>
          {activo
            ? `${DIAS_SEMANA[fechaDe(activo.fecha).getDay()]} ${fmtDia(activo.fecha)} · ${activo.salidas} pz`
            : `máximo ${max} · promedio ${promedio.toFixed(1)}`}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 78 }}>
        {serie.map(d => {
          const h = d.salidas === 0 ? 2 : Math.max(4, Math.round((d.salidas / max) * 74))
          const esActivo = activo?.fecha === d.fecha
          const finde = [0, 6].includes(fechaDe(d.fecha).getDay())
          return (
            <div key={d.fecha}
              onMouseEnter={() => setActivo(d)}
              onMouseLeave={() => setActivo(null)}
              title={`${DIAS_SEMANA[fechaDe(d.fecha).getDay()]} ${fmtDia(d.fecha)}: ${d.salidas} piezas`}
              style={{
                flex: 1, minWidth: 3, height: '100%', display: 'flex', alignItems: 'flex-end',
                cursor: 'default', background: finde ? 'rgba(16,22,25,0.035)' : 'transparent',
                borderRadius: '4px 4px 0 0',
              }}>
              <div style={{
                width: '100%', height: h,
                background: d.salidas === 0 ? LINEA : C_SERIE,
                opacity: esActivo || !activo ? 1 : 0.38,
                borderRadius: '4px 4px 0 0',
                transition: 'opacity .12s',
              }} />
            </div>
          )
        })}
      </div>

      {/* El pie: el día de la semana bajo cada barra, con el mismo reparto de
          ancho que las barras para que queden alineados. */}
      {detalle !== 'ninguno' ? (
        <div style={{ display: 'flex', gap: 2, borderTop: '1px solid ' + LINEA, paddingTop: 5 }}>
          {serie.map(d => {
            const f = fechaDe(d.fecha)
            const finde = [0, 6].includes(f.getDay())
            return (
              <div key={d.fecha} style={{
                flex: 1, minWidth: 3, textAlign: 'center', fontSize: detalle === 'completo' ? 10.5 : 9.5,
                color: finde ? TINTA_TENUE : TINTA_SUAVE, lineHeight: 1.25,
                fontWeight: finde ? 400 : 600,
              }}>
                {detalle === 'completo'
                  ? <>{DIAS_SEMANA[f.getDay()]}<br /><span style={{ color: TINTA_TENUE, fontWeight: 400 }}>{f.getDate()}</span></>
                  : INICIAL[f.getDay()]}
              </div>
            )
          })}
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid ' + LINEA, paddingTop: 5, fontSize: 10.5, color: TINTA_TENUE }}>
          <span>{fmtDia(serie[0].fecha)}</span>
          <span>{fmtDia(serie[serie.length - 1].fecha)}</span>
        </div>
      )}
    </div>
  )
}

/** Nombre y código de un modelo, en una línea que no desborda. */
function Modelo({ producto, codigo }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 3 }}>
      <span style={{ fontSize: 12.5, color: TINTA, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {producto}
      </span>
      {codigo && (
        <span style={{ fontSize: 10.5, color: TINTA_TENUE, fontFamily: 'ui-monospace, monospace', flexShrink: 0 }}>
          {codigo}
        </span>
      )}
    </div>
  )
}

function Barra({ valor, max, color }) {
  return (
    <div style={{ height: 7, background: 'rgba(16,22,25,0.05)', borderRadius: 999, overflow: 'hidden' }}>
      <div style={{ width: `${Math.max(3, (valor / max) * 100)}%`, height: '100%', background: color, borderRadius: 999 }} />
    </div>
  )
}

/** Ranking. Barra por modelo con el número al final, sin eje que estorbe. */
function Ranking({ ranking }) {
  const top = ranking.slice(0, 15)
  const max = Math.max(1, ...top.map(r => r.salidas))

  if (top.length === 0) {
    return <p style={{ fontSize: 13, color: TINTA_TENUE, margin: 0 }}>Sin movimiento registrado en este periodo.</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {top.map((r, i) => (
        <div key={r.codigo + i} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center' }}>
          <div style={{ minWidth: 0 }}>
            <Modelo producto={r.producto} codigo={r.codigo} />
            <Barra valor={r.salidas} max={max} color={C_RANKING} />
          </div>
          <span style={{ fontSize: 14, fontWeight: 800, color: TINTA, fontVariantNumeric: 'tabular-nums', minWidth: '3ch', textAlign: 'right' }}>
            {r.salidas}
          </span>
        </div>
      ))}
      {ranking.length > top.length && (
        <p style={{ fontSize: 11.5, color: TINTA_TENUE, margin: '4px 0 0' }}>
          Y {ranking.length - top.length} modelos más con menos movimiento.
        </p>
      )}
    </div>
  )
}

// ── Comparativo contra el periodo previo ──────────────────────────────────────

/**
 * La flecha de tendencia de un modelo. Sin base previa no se inventa un
 * porcentaje: pasar de 0 a 4 no es "subió infinito", es un modelo que antes no
 * se movía, y decirlo así sirve más que un número enorme.
 */
function Tendencia({ fila }) {
  const base = { fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 999, whiteSpace: 'nowrap', display: 'inline-block' }

  if (fila.antes === 0) {
    return <span style={{ ...base, color: C_SERIE, background: 'rgba(2,136,173,0.10)' }}>nuevo</span>
  }
  if (fila.delta === 0) {
    return <span style={{ ...base, color: TINTA_TENUE, background: 'rgba(16,22,25,0.05)' }}>igual</span>
  }

  const sube = fila.delta > 0
  return (
    <span style={{ ...base, color: sube ? C_SUBE : C_BAJA, background: sube ? 'rgba(75,122,27,0.10)' : 'rgba(196,21,111,0.08)' }}>
      {sube ? '▲' : '▼'} {Math.abs(fila.delta)}
      {fila.pct !== null && ` · ${fila.pct > 0 ? '+' : ''}${fila.pct}%`}
    </span>
  )
}

function ComparativoPeriodos({ historial, sucursal }) {
  const [meses, setMeses] = useState(1)
  const comp = useMemo(() => comparativo(historial, meses), [historial, meses])

  if (!comp) return null

  const top = comp.filas.slice(0, TOP_COMPARATIVO)
  const max = Math.max(1, ...top.map(f => f.salidas))

  // Un mes en curso contra uno cerrado no es comparación pareja, y tampoco lo
  // es un año completo contra otro del que solo se alcanzó a registrar el
  // final. Los dos casos distorsionan igual, así que se mira la diferencia de
  // días en cualquiera de las dos direcciones.
  const menos = Math.min(comp.dias, comp.diasPrevios)
  const mas   = Math.max(comp.dias, comp.diasPrevios)
  const desparejo = comp.hayPrevio && menos > 0 && menos < mas * 0.75
  const faltaElActual = comp.dias < comp.diasPrevios

  return (
    <div>
      <p style={{ fontSize: 11.5, color: TINTA_SUAVE, margin: '0 0 12px', lineHeight: 1.5 }}>
        Los {TOP_COMPARATIVO} modelos con más salida del plazo que elijas, cada uno con lo que
        salió en el plazo anterior del mismo tamaño y si va para arriba o para abajo.
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {PLAZOS.map(p => (
          <Pildora key={p.meses} activa={meses === p.meses} onClick={() => setMeses(p.meses)}>
            {p.etiqueta}
          </Pildora>
        ))}
      </div>

      <p style={{ fontSize: 12, color: TINTA_SUAVE, margin: '0 0 12px' }}>
        <strong style={{ color: TINTA }}>{comp.etiqueta}</strong>
        {comp.hayPrevio && <> contra <strong style={{ color: TINTA }}>{comp.etiquetaPrevia}</strong></>}
      </p>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <Dato valor={comp.total} etiqueta="piezas del periodo"
              nota={`${comp.dias} ${comp.dias === 1 ? 'día' : 'días'} con dato`} />
        <Dato valor={comp.totalPrevio} etiqueta="piezas del periodo previo"
              nota={comp.hayPrevio ? `${comp.diasPrevios} ${comp.diasPrevios === 1 ? 'día' : 'días'} con dato` : 'sin registro'} />
        <Dato
          valor={comp.hayPrevio ? `${comp.delta > 0 ? '+' : ''}${comp.delta}` : '—'}
          etiqueta="diferencia"
          nota={comp.pct !== null ? `${comp.pct > 0 ? '+' : ''}${comp.pct}% contra el previo` : null}
          color={!comp.hayPrevio ? TINTA_TENUE : comp.delta > 0 ? C_SUBE : comp.delta < 0 ? C_BAJA : TINTA}
        />
      </div>

      {!comp.hayPrevio && (
        <div style={{ marginBottom: 14 }}>
          <Aviso>
            Todavía no hay un periodo previo con qué comparar. Las flechas aparecen solas
            en cuanto el archivo junte {meses === 1 ? 'otro mes' : `otros ${meses} meses`} de historia.
          </Aviso>
        </div>
      )}

      {desparejo && (
        <div style={{ marginBottom: 14 }}>
          <Aviso>
            La comparación no es pareja: el periodo actual tiene {comp.dias} {comp.dias === 1 ? 'día' : 'días'} con
            dato y el previo {comp.diasPrevios}.{' '}
            {faltaElActual
              ? 'La caída puede ser nada más que el periodo todavía no termina.'
              : 'El alza puede ser nada más que antes se registraban menos días, no que se venda más.'}
          </Aviso>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 14 }}>
        {top.map((f, i) => (
          <div key={f.codigo + f.producto + i} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: TINTA_TENUE, fontVariantNumeric: 'tabular-nums', minWidth: '2ch', textAlign: 'right' }}>
              {i + 1}
            </span>
            <div style={{ minWidth: 0 }}>
              <Modelo producto={f.producto} codigo={f.codigo} />
              <Barra valor={f.salidas} max={max} color={C_RANKING} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: TINTA, fontVariantNumeric: 'tabular-nums' }}>
                {f.salidas}
                {comp.hayPrevio && <span style={{ fontSize: 11, fontWeight: 600, color: TINTA_TENUE }}> · antes {f.antes}</span>}
              </span>
              {comp.hayPrevio && <Tendencia fila={f} />}
            </div>
          </div>
        ))}
      </div>

      {comp.filas.length > top.length && (
        <p style={{ fontSize: 11.5, color: TINTA_TENUE, margin: '0 0 14px' }}>
          Y {comp.filas.length - top.length} modelos más. El Excel los trae todos, con su columna de tendencia.
        </p>
      )}

      <BotonExcel principal onClick={() => descargarComparativo(historial, sucursal.nombre, meses)}>
        Bajar el comparativo en Excel
      </BotonExcel>
    </div>
  )
}

// ── Archivo permanente ────────────────────────────────────────────────────────

/**
 * El detalle diario se recorta a 60 días, pero el acumulado por mes se guarda
 * para siempre. Esta sección deja sacar un mes viejo tal cual, sin compararlo
 * con nada.
 */
function ArchivoPermanente({ historial, sucursal }) {
  const periodos = useMemo(() => periodosDisponibles(historial), [historial])
  const [periodo, setPeriodo] = useState(null)
  const activo = periodo && periodos.some(p => p.periodo === periodo) ? periodo : periodos[0]?.periodo
  const meta = periodos.find(p => p.periodo === activo)

  if (periodos.length === 0) return null

  return (
    <div>
      <p style={{ fontSize: 11.5, color: TINTA_SUAVE, margin: '0 0 12px', lineHeight: 1.5 }}>
        Las gráficas de arriba solo alcanzan 60 días. Este acumulado no se borra nunca, y de aquí
        sale el Excel de un mes suelto con todos sus modelos.
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {periodos.map(p => (
          <Pildora key={p.periodo} activa={activo === p.periodo} onClick={() => setPeriodo(p.periodo)}>
            {nombreDePeriodo(p.periodo)}
          </Pildora>
        ))}
      </div>

      {meta && (
        <p style={{ fontSize: 12, color: TINTA_SUAVE, margin: '0 0 12px' }}>
          <strong style={{ color: TINTA }}>{meta.total} piezas</strong> en {meta.modelos} modelos,
          con {meta.dias} {meta.dias === 1 ? 'día' : 'días'} de dato.
        </p>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <BotonExcel onClick={() => descargarHistorial(historial, sucursal.nombre, activo)}>
          Bajar {nombreDePeriodo(activo)}
        </BotonExcel>
        {periodos.length > 1 && (
          <BotonExcel onClick={() => descargarHistorial(historial, sucursal.nombre)}>
            Bajar los {periodos.length} meses
          </BotonExcel>
        )}
      </div>
    </div>
  )
}

// ── La radiografía ────────────────────────────────────────────────────────────

const pesos = n => '$' + Math.round(n).toLocaleString('es-MX')

/**
 * El resumen en texto. No es adorno: es lo único de esta pantalla que se lee
 * de pie, antes de abrir nada, y el dueño pidió «cinco a siete frases».
 *
 * Se arma con frases sueltas y se saltan las que no tienen dato detrás. Un
 * párrafo con huecos -«subió un  %»- destruye la confianza en todo lo demás.
 */
function EnTreintaSegundos({ proyeccion, puente, empuje, rendimiento, parado, sucursal, huecoCosto, apoyo }) {
  const frases = []

  if (proyeccion?.acumulado > 0) {
    frases.push(
      `${sucursal.nombre}: ${proyeccion.acumulado} piezas en lo que va del mes` +
      (proyeccion.acumuladoPesos ? ` (${pesos(proyeccion.acumuladoPesos)})` : '') +
      `, a un ritmo de ${proyeccion.ritmo.toFixed(1)} al día.`)
    if (proyeccion.diasQueFaltan > 0) {
      frases.push(
        `Si los ${proyeccion.diasQueFaltan} días que faltan se portan como las últimas cuatro semanas, ` +
        `el mes cierra cerca de ${proyeccion.proyectado} piezas` +
        (proyeccion.proyectadoPesos ? ` (${pesos(proyeccion.proyectadoPesos)})` : '') + '.')
    }
  }

  if (puente && puente.pesosAntes > 0) {
    const sube = puente.total >= 0
    frases.push(
      `Las últimas cuatro semanas van ${sube ? 'arriba' : 'abajo'} ${pesos(Math.abs(puente.total))} ` +
      `respecto a las cuatro anteriores: ${pesos(Math.abs(puente.volumen))} de ${puente.volumen >= 0 ? 'más' : 'menos'} volumen ` +
      `y ${pesos(Math.abs(puente.mezcla))} de modelos que ${puente.mezcla >= 0 ? 'entraron' : 'salieron'} del surtido.`)
  }

  const arriba = empuje?.acelerando?.[0]
  if (arriba) {
    frases.push(
      `Lo que más se acelera es ${arriba.producto}: de ${arriba.antes} a ${arriba.ahora} piezas` +
      (arriba.pct !== null ? ` (${arriba.pct > 0 ? '+' : ''}${arriba.pct}%)` : '') + '.')
  }
  const abajo = empuje?.frenando?.[0]
  if (abajo) {
    frases.push(
      `Lo que más se frena es ${abajo.producto}, de ${abajo.antes} a ${abajo.ahora}: ` +
      `antes de volver a pedirlo, conviene mirarlo.`)
  }

  if (rendimiento?.total > 0) {
    // La utilidad dice SIEMPRE de cuántos modelos habla. Sin eso, una cifra
    // que cubre la mitad del catálogo se lee como si cubriera todo, y la
    // decisión se toma sobre una utilidad que no es la del negocio.
    const faltan = huecoCosto?.length ?? rendimiento.sinCosto ?? 0
    frases.push(
      `La utilidad de esas cuatro semanas es ${pesos(rendimiento.total)}, y ` +
      `${rendimiento.cuantosHacenEl80} modelos hacen el 80%` +
      (faltan > 0
        ? `. Es la utilidad de ${rendimiento.filas.length} modelos: a ${faltan} les falta el costo en bodega y quedan fuera de esa cifra.`
        : '.'))
  }

  if (parado?.pesos > 0) {
    frases.push(
      `Hay ${pesos(parado.pesos)} a costo parados en ${parado.filas.length} modelos ` +
      `que no se venden desde hace más de tres meses.`)
  }

  if (!frases.length) return null

  return (
    <section style={{ border: '1px solid ' + LINEA, borderRadius: 22, padding: '18px 20px', background: 'rgba(2,136,173,0.04)' }}>
      <h3 style={{ fontSize: 13, fontWeight: 800, color: TINTA, margin: '0 0 8px' }}>En 30 segundos</h3>
      <p style={{ fontSize: 14, color: TINTA, lineHeight: 1.65, margin: 0 }}>{frases.join(' ')}</p>
      <p style={{ fontSize: 11, color: TINTA_TENUE, margin: '10px 0 0', lineHeight: 1.5 }}>
        En pesos, al <strong>precio que de verdad se cobró</strong> en la caja, con la mezcla de
        público y mayoreo que tenga cada plaza.
        {apoyo?.parte !== null && apoyo?.parte < 0.95 && (
          <> De las piezas valoradas, el {Math.round(100 * (1 - apoyo.parte))}% no tuvo venta en
          el último año y se valora con el precio de lista, que puede no ser el que se cobra.</>
        )}
        {' '}Las piezas son un piso: una salida resurtida el mismo día no se ve.
      </p>
    </section>
  )
}

/**
 * El puente de variación. Dos barras y una flecha: de dónde a dónde, y qué lo
 * explica. Sin componente de precio, que no se puede medir -ver
 * `radiografia.js`-.
 */
function Puente({ puente }) {
  if (!puente.pesosAntes && !puente.pesosAhora) return null
  const partes = [
    { que: 'Más o menos de lo mismo', valor: puente.volumen, color: C_SERIE },
    { que: 'Modelos que entran o salen', valor: puente.mezcla, color: C_RANKING },
  ]
  const max = Math.max(1, ...partes.map(p => Math.abs(p.valor)))

  return (
    <div>
      <h4 style={{ fontSize: 13, fontWeight: 800, color: TINTA, margin: '0 0 4px' }}>
        Por qué cambió la venta
      </h4>
      <p style={{ fontSize: 11.5, color: TINTA_SUAVE, margin: '0 0 12px' }}>
        Las últimas cuatro semanas contra las cuatro anteriores.
      </p>

      <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'baseline', marginBottom: 12 }}>
        <Cifra valor={pesos(puente.pesosAntes)} etiqueta="antes" />
        <Cifra valor={pesos(puente.pesosAhora)} etiqueta="ahora" />
        <Cifra valor={`${puente.total >= 0 ? '+' : '−'}${pesos(Math.abs(puente.total))}`}
               etiqueta="diferencia" color={puente.total >= 0 ? C_SUBE : C_BAJA} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {partes.map(p => (
          <div key={p.que} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center' }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 12.5, color: TINTA, marginBottom: 3 }}>{p.que}</p>
              <Barra valor={Math.abs(p.valor)} max={max} color={p.valor >= 0 ? p.color : C_BAJA} />
            </div>
            <span style={{ fontSize: 13.5, fontWeight: 800, color: p.valor >= 0 ? TINTA : C_BAJA, fontVariantNumeric: 'tabular-nums' }}>
              {p.valor >= 0 ? '+' : '−'}{pesos(Math.abs(p.valor))}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Lo que se acelera y lo que se frena, que es lo que alimenta la compra. */
function Momentum({ acelerando, frenando }) {
  const columna = (titulo, filas, color, nota) => (
    <div style={{ flex: '1 1 260px', minWidth: 0 }}>
      <h4 style={{ fontSize: 12.5, fontWeight: 800, color: TINTA, margin: '0 0 2px' }}>{titulo}</h4>
      <p style={{ fontSize: 11, color: TINTA_TENUE, margin: '0 0 10px' }}>{nota}</p>
      <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 7 }}>
        {filas.slice(0, 6).map(f => (
          <li key={f.codigo} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'baseline' }}>
            <span style={{ fontSize: 12.5, color: TINTA, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  title={f.producto}>
              {f.producto}
            </span>
            <span style={{ fontSize: 12, color: TINTA_SUAVE, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
              {f.antes} → <strong style={{ color, fontWeight: 800 }}>{f.ahora}</strong>
              {f.pct !== null && <span style={{ color: TINTA_TENUE }}> · {f.pct > 0 ? '+' : ''}{f.pct}%</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )

  return (
    <div>
      <h4 style={{ fontSize: 13, fontWeight: 800, color: TINTA, margin: '0 0 12px' }}>
        Qué se mueve
      </h4>
      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
        {columna('Se acelera', acelerando, C_SUBE, 'Pedir más antes de que falte')}
        {columna('Se frena', frenando, C_BAJA, 'Mirar antes de volver a comprar')}
      </div>
    </div>
  )
}

/**
 * Lo que vuela en una tienda y está parado en otra. Es la recomendación más
 * barata que hay: mover una caja no cuesta comprar nada.
 */
function Brechas({ filas }) {
  return (
    <div>
      <h4 style={{ fontSize: 13, fontWeight: 800, color: TINTA, margin: '0 0 4px' }}>
        Lo mismo, parado aquí y agotándose allá
      </h4>
      <p style={{ fontSize: 11.5, color: TINTA_SUAVE, margin: '0 0 12px' }}>
        {filas.length} casos. Es un traspaso, no una compra; el monto es lo que esa tienda
        dejaría de hacer al mes si vendiera como la que manda.
      </p>
      <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filas.slice(0, 6).map(f => (
          <li key={`${f.codigo}|${f.plaza}`}
              style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'baseline' }}>
            <div style={{ minWidth: 0 }}>
              <Modelo producto={f.producto} codigo={f.codigo} />
              <p style={{ fontSize: 11.5, color: TINTA_SUAVE, margin: 0 }}>
                {f.caso === 'parado'
                  ? `${f.nombrePlaza} tiene ${f.existencia} y no las mueve · vuela en ${f.lider}`
                  : `${f.nombrePlaza} ni lo maneja · vuela en ${f.lider}`}
              </p>
            </div>
            <span style={{ fontSize: 13, fontWeight: 800, color: C_RANKING, whiteSpace: 'nowrap' }}>
              {pesos(f.pesosAlMes)}<span style={{ fontSize: 11, color: TINTA_TENUE, fontWeight: 500 }}>/mes</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** El dinero quieto en el estante. */
function Parado({ datos }) {
  return (
    <div>
      <h4 style={{ fontSize: 13, fontWeight: 800, color: TINTA, margin: '0 0 4px' }}>
        Dinero parado
      </h4>
      <p style={{ fontSize: 11.5, color: TINTA_SUAVE, margin: '0 0 12px' }}>
        {datos.filas.length} modelos · {datos.piezas} piezas · <strong style={{ color: TINTA }}>{pesos(datos.pesos)}</strong> a
        costo, sin una sola venta en más de tres meses. La última venta sale del acumulado por
        mes, no de un recuento de inventario.
      </p>
      <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 7 }}>
        {datos.filas.slice(0, 6).map(f => (
          <li key={f.codigo} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12, alignItems: 'baseline' }}>
            <span style={{ fontSize: 12.5, color: TINTA, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  title={f.producto}>
              {f.producto}
            </span>
            <span style={{ fontSize: 11.5, color: TINTA_TENUE, whiteSpace: 'nowrap' }}>{f.dias} días</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: TINTA, whiteSpace: 'nowrap', minWidth: '7ch', textAlign: 'right' }}>
              {f.pesos === null ? '—' : pesos(f.pesos)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Los costos que faltan en bodega.
 *
 * No es una alerta de dato sucio: es una lista de trabajo. El costo se toma
 * de bodega -quien compra es quien sabe lo que costó- y lo que bodega no
 * tiene costeado se queda sin margen. En vez de rellenarlo con el de la
 * sucursal, que lo captura otra persona y puede equivocarse, el hueco se
 * enseña ordenado por lo que más se mueve y se baja en Excel.
 *
 * Ordenado por PIEZAS a propósito: capturar el costo del iPhone 17 Pro Max
 * recupera el margen de veintitantas piezas y el de un modelo que vendió una
 * recupera una. Es la misma tarea con rendimientos muy distintos.
 */
function CostosQueFaltan({ filas }) {
  const piezas = filas.reduce((a, f) => a + f.piezas, 0)
  const sinAlta = filas.filter(f => f.caso === 'no-esta-en-bodega')

  return (
    <section style={{ border: '1px solid #FCD34D', borderRadius: 22, padding: '18px 20px', background: 'rgba(252,211,77,0.10)' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 6 }}>
        <h3 style={{ fontSize: 13, fontWeight: 800, color: '#92400E', margin: 0, flex: 1 }}>
          Costos que faltan en bodega
        </h3>
        <button type="button" className="boton-tinta" style={{ fontSize: 11.5, padding: '6px 12px' }}
                onClick={() => descargarCostos(filas)}>
          Bajar la lista en Excel
        </button>
      </div>
      <p style={{ fontSize: 11.5, color: '#92400E', margin: '0 0 12px', lineHeight: 1.55 }}>
        <strong>{filas.length} modelos</strong> con venta no tienen costo capturado en bodega, y
        son <strong>{piezas} piezas</strong> de las últimas cuatro semanas sin margen calculable.
        El costo se toma de bodega porque es quien compra; no se rellena con el de la sucursal,
        donde lo captura otra persona.
        {sinAlta.length > 0 && (
          <> De esos, <strong>{sinAlta.length}</strong> ni siquiera están dados de alta en bodega:
          se venden en tienda y bodega no los conoce.</>
        )}
      </p>
      <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 7 }}>
        {filas.slice(0, 8).map(f => (
          <li key={f.codigo} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 12, alignItems: 'baseline' }}>
            {/* El CÓDIGO primero: esto se corrige en Eleventa, y ahí se busca
                por código. El nombre va de apoyo, para reconocerlo. */}
            <span style={{ fontSize: 11.5, fontWeight: 800, color: '#92400E', fontVariantNumeric: 'tabular-nums', minWidth: '8ch' }}>
              {f.codigo}
            </span>
            <span style={{ fontSize: 12.5, color: TINTA, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  title={f.caso === 'no-esta-en-bodega' ? `${f.producto} — no está en bodega` : f.producto}>
              {f.producto}
              {f.caso === 'no-esta-en-bodega' && (
                <span style={{ color: '#92400E', fontWeight: 700 }}> · sin alta</span>
              )}
            </span>
            <span style={{ fontSize: 13, fontWeight: 800, color: TINTA, whiteSpace: 'nowrap' }}>
              {f.piezas} pz
            </span>
          </li>
        ))}
      </ul>
      {filas.length > 8 && (
        <p style={{ fontSize: 11, color: TINTA_TENUE, margin: '10px 0 0' }}>
          Y {filas.length - 8} más. La lista entera va en el Excel.
        </p>
      )}
    </section>
  )
}

/**
 * El precio al que vende cada plaza, con los tres negocios SEPARADOS.
 *
 * Lo pidió el dueño así, con estas palabras: «me parece mejor que la
 * información vaya separada, porque me hace mucho ruido la mezcla». Y la
 * mezcla engaña de verdad: el precio medio de Ferias sale $161, pero su funda
 * se vende a $254 —la más cara de las cuatro plazas—. Lo que tira del número
 * es que el 21% de sus piezas son STIKER PEQUEÑO a $10: ese código solo baja
 * el promedio 28 pesos.
 *
 * Por eso aquí no hay ninguna cifra que junte los tres. Cada grupo con su
 * precio, sus piezas y su mezcla de mayoreo.
 *
 * Todo sale de la VENTANA de 365 días, nunca del acumulado. El historial de
 * cada plaza arranca un año distinto —Aguascalientes 2019, León 2025— y los
 * precios subieron un 40% en cinco años: comparar los once meses de León con
 * los siete años de Aguascalientes decía que una vendía a mitad de precio que
 * la otra, y no era verdad.
 */
/**
 * ¿Los modelos nuevos están vendiendo?
 *
 * Lo pidió el dueño el 2026-11-07. Antes esto vivía en Surtido como «Recién
 * llegados» y contestaba una pregunta de COMPRA —qué entró y todavía no se ha
 * visto vender, para no volver a pedirlo— así que enseñaba SÓLO los que
 * llevan cero. Aquí la pregunta es la contraria y más grande: de todo lo que
 * entró, qué vende y qué no. Una lista que sólo trae los fracasos no permite
 * juzgar si la edición entró bien, porque le falta el denominador.
 *
 * Las reglas y las cuatro trampas están en `lib/estrenos.js`, con pruebas.
 */
function Estrenos({ datos, precios, plazas }) {
  const [abierta, setAbierta] = useState(1)
  const cmp = useMemo(() => comparaEdiciones(datos?.cohortes), [datos])
  if (!datos?.cohortes?.length) return null

  const hay = datos.cohortes.some(c => c.modelos.length > 0)
  const cohorte = datos.cohortes.find(c => c.n === abierta) ?? datos.cohortes[0]
  const r = cohorte.resumen

  const pct = v => (v === null ? '—' : `${Math.round(v * 100)}%`)

  return (
    <section data-estrenos
             style={{ border: '1px solid ' + LINEA, borderRadius: 22, padding: '18px 20px' }}>
      <h4 style={{ fontSize: 13, fontWeight: 800, color: TINTA, margin: '0 0 4px' }}>
        ¿Están vendiendo los modelos nuevos?
      </h4>
      <p style={{ fontSize: 11.5, color: TINTA_SUAVE, margin: '0 0 12px', lineHeight: 1.5 }}>
        {datos.hayLotes
          ? <>Una edición es el <strong>lote</strong> con el que entraron: las fechas de alta
             pegadas se agrupan solas, porque una tanda se reparte a veces en dos o tres días y
             partirla sería comparar una mitad con la otra.</>
          : <>Aquí los modelos entran de uno en uno, así que no hay lotes que agrupar: se juntan
             las entradas reales de los últimos {DIAS_EDICION} días.</>}
        {' '}La venta se cuenta desde que entró <em>cada</em> modelo y sale del acumulado por mes,
        no del detalle diario —ése sólo guarda 60 días, y con él un modelo que entró hace cuatro
        meses y se vendió entero en los dos primeros saldría en cero—.
        {datos.sueltos > 0 && (datos.sueltos === 1
          ? ' Un modelo entró suelto y no forma edición.'
          : ` ${datos.sueltos} modelos entraron sueltos y no forman edición.`)}
        {datos.sinFecha > 0 && ` ${datos.sinFecha} quedan fuera por no saber cuándo entraron.`}
      </p>

      {!hay ? (
        <p style={{ fontSize: 12.5, color: TINTA_TENUE, margin: 0 }}>
          No hay entradas recientes de las que se pueda decir nada. Una fecha de alta que
          coincide con el arranque del historial de su plaza no prueba que el modelo sea nuevo,
          así que no se cuenta.
        </p>
      ) : (<>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {datos.cohortes.map(c => (
            <button key={c.n} type="button" onClick={() => setAbierta(c.n)}
                    data-edicion={c.n}
                    className={abierta === c.n ? 'chip-plaza activa' : 'chip-plaza'}>
              {c.etiqueta}
              <span style={{ marginInlineStart: 6, fontWeight: 800 }}>{c.modelos.length}</span>
              {/* La fecha del lote: es como el dueño la reconoce -«la de
                  agosto»- y sin ella dos ediciones se ven iguales. */}
              <span style={{ marginInlineStart: 5, fontWeight: 400, opacity: .7 }}>
                {c.desde === c.hasta ? c.desde : `${c.desde} a ${c.hasta}`}
              </span>
            </button>
          ))}
        </div>

        {/* La comparación entre las dos ediciones: es lo que se preguntó.
            Va en PUNTOS, no en porcentaje de porcentaje: pasar del 40% al
            50% es diez puntos, y decir «un 25% mejor» de dos porcentajes
            hace que un número suene al doble de lo que es. */}
        {cmp && (
          <p data-compara-ediciones
             style={{ fontSize: 12.5, color: TINTA, margin: '0 0 12px', lineHeight: 1.5,
                      background: 'rgba(2,136,173,0.05)', borderRadius: 12, padding: '9px 11px' }}>
            De la última edición vende <strong>{pct(cmp.parteAhora)}</strong> de lo que ya se puede
            medir; de la anterior, <strong>{pct(cmp.parteAntes)}</strong>.{' '}
            {Math.abs(cmp.puntos) < 1
              ? 'Prácticamente lo mismo.'
              : <strong style={{ color: cmp.puntos > 0 ? C_SUBE : C_BAJA }}>
                  {cmp.puntos > 0 ? 'Entró mejor' : 'Entró peor'}, por {Math.abs(Math.round(cmp.puntos))} puntos.
                </strong>}
            {cmp.ritmoAhora !== null && cmp.ritmoAntes !== null && (
              <> El modelo de en medio hace <strong>{cmp.ritmoAhora.toFixed(1)}</strong> pz/mes
                 contra <strong>{cmp.ritmoAntes.toFixed(1)}</strong> de la anterior.</>
            )}
          </p>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <Dato valor={r.venden} etiqueta="sí venden" color={C_SUBE}
                nota={r.parte === null ? null : `${pct(r.parte)} de los medibles`} />
          <Dato valor={r.mudos} etiqueta="ni una pieza" color={r.mudos ? C_BAJA : TINTA_TENUE} />
          {/* Lo que acaba de llegar NO es un fracaso: es un modelo sin medir.
              Contado con los mudos, toda edición reciente parecería un
              desastre y se dejaría de comprar lo que no se ha probado. */}
          <Dato valor={r.sinMedir} etiqueta="muy nuevos" color={TINTA_TENUE}
                nota={`menos de ${DIAS_PARA_OPINAR} días`} />
          <Dato valor={r.piezas} etiqueta="piezas vendidas" />
          <Dato valor={pesos(r.dinero)} etiqueta="facturado" />
          {r.dineroMudo > 0 && (
            <Dato valor={pesos(r.dineroMudo)} etiqueta="parado" color={C_BAJA}
                  nota={`${r.existenciaMuda} pz de los que no venden`} />
          )}
        </div>

        {cohorte.modelos.length === 0 ? (
          <p style={{ fontSize: 12.5, color: TINTA_TENUE, margin: 0 }}>
            Ninguna entrada real en esta edición.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ color: TINTA_TENUE, fontSize: 10.5 }}>
                  <th style={{ textAlign: 'left', fontWeight: 600, padding: '4px 0' }}>Modelo</th>
                  <th style={{ textAlign: 'left', fontWeight: 600 }}>Entró</th>
                  <th style={{ textAlign: 'right', fontWeight: 600 }}>pz/mes</th>
                  <th style={{ textAlign: 'right', fontWeight: 600 }}>Piezas</th>
                  <th style={{ textAlign: 'right', fontWeight: 600 }}>Vendido</th>
                  <th style={{ textAlign: 'right', fontWeight: 600 }}>Quedan</th>
                </tr>
              </thead>
              <tbody>
                {cohorte.modelos.slice(0, 60).map((m, i) => (
                  <tr key={m.codigo} data-estreno={m.codigo}
                      style={{ background: i % 2 ? '#FBFDFD' : '#fff' }}>
                    <td style={{ padding: '5px 0' }}>
                      <Modelo producto={m.producto} codigo={m.codigo} />
                    </td>
                    <td style={{ color: TINTA_SUAVE, whiteSpace: 'nowrap' }}>
                      {m.alta} <span style={{ color: TINTA_TENUE }}>· {m.dias} d</span>
                    </td>
                    {/* El ritmo es lo que permite compararlos. Las piezas van
                        al lado como lo que son, un total: uno de 115 días con
                        20 piezas vende menos que uno de 35 con 15. */}
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                                 fontWeight: 700,
                                 color: m.sinMedir ? TINTA_TENUE : m.piezas ? C_SUBE : C_BAJA }}>
                      {m.sinMedir ? 'sin medir' : m.ritmo.toFixed(1)}
                    </td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{m.piezas}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {m.dinero > 0 ? pesos(m.dinero) : '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                                 color: m.piezas === 0 && m.existencia > 0 ? C_BAJA : TINTA_SUAVE }}>
                      {m.existencia}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {cohorte.modelos.length > 60 && (
              <p style={{ fontSize: 11, color: TINTA_TENUE, margin: '8px 0 0' }}>
                Y {cohorte.modelos.length - 60} más.
              </p>
            )}
          </div>
        )}
      </>)}
    </section>
  )
}

/**
 * Las cancelaciones y lo que se vendió justo después.
 *
 * Lo propuso el dueño el 2026-11-08, y lo propuso con la trampa ya vista:
 * «en realidad nadie dice que es el reemplazo, pero si el modelo coincide sí
 * es posible hacer una especie de regla».
 *
 * Eleventa NO enlaza una cancelación con la venta que la sustituyó. Esto es
 * una SOSPECHA, y la pantalla tiene que decirlo en cada renglón o se leerá
 * como un hecho. Por eso cada fila trae su motivo —el mismo teléfono, otro
 * tipo de funda, cuántos minutos después— y no sólo un «sí» o un «no».
 *
 * La única cifra que NO es sospecha es la última: lo cancelado sin nada
 * después. Eso es venta que se fue por la puerta, y es un hecho.
 */
function Cancelaciones({ porPlaza, plazas, sel }) {
  const [abierta, setAbierta] = useState(null)

  const cuales = sel === TODAS.slug ? plazas.map(p => p.slug) : [sel]
  const grupos = cuales
    .map(slug => ({
      slug,
      nombre: plazas.find(p => p.slug === slug)?.nombre ?? slug,
      datos: porPlaza?.[slug]?.cancelaciones ?? null,
    }))
    .filter(g => g.datos?.filas?.length)

  if (!grupos.length) return null

  const r = grupos.reduce((a, g) => ({
    cancelados: a.cancelados + g.datos.resumen.cancelados,
    probables:  a.probables + g.datos.resumen.conReemplazoProbable,
    sinNada:    a.sinNada + g.datos.resumen.sinNadaDespues,
    dinero:     a.dinero + g.datos.resumen.importeSinReemplazo,
  }), { cancelados: 0, probables: 0, sinNada: 0, dinero: 0 })

  const COLOR = { probable: C_SUBE, dudosa: '#B45309', ninguna: C_BAJA }
  const TEXTO = { probable: 'Probable reemplazo', dudosa: 'Dudoso', ninguna: 'Sin reemplazo' }

  return (
    <section data-cancelaciones
             style={{ border: '1px solid ' + LINEA, borderRadius: 22, padding: '18px 20px' }}>
      <h4 style={{ fontSize: 13, fontWeight: 800, color: TINTA, margin: '0 0 4px' }}>
        Tickets cancelados, y qué se vendió después
      </h4>
      <p style={{ fontSize: 11.5, color: TINTA_SUAVE, margin: '0 0 12px', lineHeight: 1.5 }}>
        <strong>Esto es una sospecha, no un dato.</strong> Eleventa no enlaza una cancelación con
        la venta que la sustituyó: ese dato no existe en ninguna tabla. Lo que se mira es el
        siguiente ticket del mismo cajero dentro de media hora, y si toca el mismo teléfono.
        Cada renglón dice por qué se sospecha, para que puedas no estar de acuerdo.
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <Dato valor={r.cancelados} etiqueta="cancelados" />
        <Dato valor={r.probables} etiqueta="con reemplazo probable" color={C_SUBE} />
        {/* La única que es un hecho, y por eso va en pesos. */}
        <Dato valor={r.sinNada} etiqueta="sin nada después" color={r.sinNada ? C_BAJA : TINTA_TENUE}
              nota={r.dinero > 0 ? `${pesos(r.dinero)} que se fueron` : null} />
      </div>

      {grupos.map(g => (
        <div key={g.slug} data-cancelaciones-de={g.slug} style={{ marginTop: 10 }}>
          {grupos.length > 1 && (
            <p style={{ margin: '0 0 5px', fontSize: 11.5, fontWeight: 800, color: TINTA }}>
              {g.nombre}
            </p>
          )}
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {g.datos.filas.slice(0, 25).map(f => {
              const clave = `${g.slug}-${f.cancelado.id}`
              const vale = abierta === clave
              return (
                <li key={clave} data-cancelacion={f.cancelado.folio || f.cancelado.id}
                    style={{ border: '1px solid ' + LINEA, borderRadius: 12, padding: '8px 10px' }}>
                  <button type="button" onClick={() => setAbierta(vale ? null : clave)}
                          style={{ display: 'flex', gap: 9, alignItems: 'baseline', flexWrap: 'wrap',
                                   width: '100%', background: 'none', border: 'none', padding: 0,
                                   cursor: 'pointer', textAlign: 'start', fontFamily: 'inherit' }}>
                    <span style={{ fontSize: 10.5, fontWeight: 800, color: COLOR[f.confianza] }}>
                      {TEXTO[f.confianza]}
                    </span>
                    <span style={{ fontSize: 12, color: TINTA_TENUE, whiteSpace: 'nowrap' }}>
                      {String(f.cancelado.cuando).slice(0, 16).replace('T', ' ')}
                    </span>
                    <span style={{ fontSize: 12.5, color: TINTA, flex: 1, minWidth: 160 }}>
                      {f.cancelado.productos.map(x => x.producto).join(', ') || 'sin productos'}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: TINTA, whiteSpace: 'nowrap' }}>
                      {pesos(f.cancelado.importe)}
                    </span>
                    <span style={{ fontSize: 10.5, color: TINTA_TENUE }}>{vale ? '▲' : '▼'}</span>
                  </button>

                  <p style={{ margin: '5px 0 0', fontSize: 11.5, color: TINTA_SUAVE, lineHeight: 1.45 }}>
                    {f.porque}
                  </p>

                  {vale && f.reemplazo && (
                    <div data-reemplazo style={{ marginTop: 8, paddingTop: 8,
                                                 borderTop: '1px dashed ' + LINEA }}>
                      <p style={{ margin: 0, fontSize: 11, fontWeight: 800, color: TINTA_TENUE,
                                  textTransform: 'uppercase', letterSpacing: .4 }}>
                        Lo que se vendió {f.reemplazo.minutosDespues} min después
                      </p>
                      <ul style={{ listStyle: 'none', margin: '5px 0 0' }}>
                        {f.reemplazo.productos.map((x, i) => (
                          <li key={i} style={{ fontSize: 12, color: TINTA, display: 'flex',
                                               justifyContent: 'space-between', gap: 10 }}>
                            <span>{x.piezas} × {x.producto} <span style={{ color: TINTA_TENUE }}>{x.codigo}</span></span>
                          </li>
                        ))}
                      </ul>
                      <p style={{ margin: '5px 0 0', fontSize: 11.5, color: TINTA }}>
                        Ticket {f.reemplazo.folio} · {pesos(f.reemplazo.importe)}
                      </p>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          {g.datos.filas.length > 25 && (
            <p style={{ fontSize: 11, color: TINTA_TENUE, margin: '8px 0 0' }}>
              Y {g.datos.filas.length - 25} más.
            </p>
          )}
        </div>
      ))}
    </section>
  )
}

/**
 * Lo que TIENE una plaza, dicho junto a lo que vendió.
 *
 * El número solo no basta: la frase es lo que se lee. Y la que importa es la
 * de la fila en cero, porque es la única en la que «no vendió» no significa
 * «no se pide».
 */
function LecturaExistencia({ vendio, hay }) {
  if (hay === undefined || hay === null) {
    return <span style={{ display: 'block', fontSize: 10, fontWeight: 400, color: TINTA_TENUE }}>no lo maneja</span>
  }
  const n = Number(hay) || 0
  if (n <= 0) {
    return (
      <span style={{ display: 'block', fontSize: 10, fontWeight: 700, color: C_BAJA }}>
        en cero hoy{vendio === 0 ? ' · no se puede saber si se pide' : ''}
      </span>
    )
  }
  return (
    <span style={{ display: 'block', fontSize: 10, fontWeight: 400, color: TINTA_TENUE }}>
      hay {n}{vendio === 0 ? ' · con mercancía y sin venta' : ''}
    </span>
  )
}

/**
 * ¿La venta de este código es de fiar, plaza por plaza?
 *
 * Es la pregunta del dueño del 2026-11-09 con el HONOR X8D, contestada con el
 * kárdex: cuántos de los últimos 90 días estuvo en cero. No estima nada —la
 * ficha mira 30 o 60 días y esto mide 90, y mezclar ventanas daría un número
 * con cara de cuenta que no lo es—; dice el hecho y lo que significa.
 */
function VentaDeFiar({ ficha, agotados }) {
  const filas = ficha.plazas
    .map(p => ({ p, a: agotados[p.slug] }))
    .filter(x => x.a !== null)            // no lo maneja: nada que decir
  if (!filas.length) return null
  const sinArchivo = filas.every(x => x.a === undefined)

  return (
    <div data-venta-de-fiar style={{ marginBottom: 16 }}>
      <h4 style={{ fontSize: 12.5, fontWeight: 700, color: TINTA, margin: '0 0 6px' }}>
        ¿Su venta es de fiar? Días en cero de los últimos {DIAS_AGOTADOS}
      </h4>
      {sinArchivo ? (
        <p style={{ fontSize: 12, color: TINTA_TENUE, margin: 0, lineHeight: 1.5 }}>
          Todavía no está medido: los días en cero salen del kárdex de Eleventa y aparecen
          después de la siguiente sincronización.
        </p>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {filas.map(({ p, a }) => {
            const l = a ? lecturaDeVenta({ agotado: a }) : null
            return (
              <li key={p.slug} data-censurada={l?.censurada ? 'si' : 'no'}
                  style={{ fontSize: 12, lineHeight: 1.45, color: l?.censurada ? C_BAJA : TINTA_SUAVE }}>
                <strong style={{ color: TINTA }}>{p.nombre}:</strong>{' '}
                {l ? l.texto : 'todavía sin medir.'}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function PrecioPorPlaza({ porPlaza, plazas }) {
  const GRUPOS = [
    { k: 'fundas',      titulo: 'Fundas',          nota: 'el negocio' },
    { k: 'protectores', titulo: 'Micas e hidrogel', nota: 'otro control de venta' },
    { k: 'produccion',  titulo: 'Stickers',         nota: 'sin inventario: se imprimen' },
  ]

  const filas = plazas
    .map(p => ({ plaza: p, datos: porPlaza?.[p.slug] }))
    .filter(x => x.datos?.ventana?.porCodigo)
    .map(x => ({ ...x, grupos: precioPorPlaza(x.datos.ventana.porCodigo) }))

  if (!filas.length) return null

  const dias = filas[0].datos.ventana?.dias ?? 365

  return (
    <section data-precio-plaza style={{ border: '1px solid ' + LINEA, borderRadius: 22, padding: '18px 20px' }}>
      <h3 style={{ fontSize: 13, fontWeight: 800, color: TINTA, margin: '0 0 4px' }}>
        A qué precio vende cada plaza
      </h3>
      <p style={{ fontSize: 11.5, color: TINTA_SUAVE, margin: '0 0 16px', lineHeight: 1.55 }}>
        Lo que de verdad se cobró en la caja, de los últimos {dias} días. No es el precio de la
        lista: es el de los tickets, línea por línea. Los tres grupos van <strong>aparte</strong>,
        porque mezclarlos engaña —el precio medio de una plaza con muchos stickers se desploma
        sin que haya bajado ninguna funda—.
      </p>

      {GRUPOS.map(g => {
        const hay = filas.some(f => f.grupos[g.k].pz > 0)
        if (!hay) return null
        return (
          <div key={g.k} style={{ marginBottom: 18 }}>
            <h4 style={{ fontSize: 12, fontWeight: 800, color: TINTA, margin: '0 0 2px' }}>
              {g.titulo}
              <span style={{ fontWeight: 600, color: TINTA_TENUE }}> · {g.nota}</span>
            </h4>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ color: TINTA_TENUE, fontSize: 10.5, textAlign: 'right' }}>
                  <th style={{ textAlign: 'left', fontWeight: 600, padding: '4px 0' }}>Plaza</th>
                  <th style={{ fontWeight: 600 }}>Piezas</th>
                  <th style={{ fontWeight: 600 }}>Al público</th>
                  <th style={{ fontWeight: 600 }}>A mayoreo</th>
                  <th style={{ fontWeight: 600 }}>Descuento</th>
                  <th style={{ fontWeight: 600 }}>Piezas a mayoreo</th>
                </tr>
              </thead>
              <tbody>
                {filas.map(({ plaza, grupos }) => {
                  const x = grupos[g.k]
                  if (!x.pz) return null
                  const n = (v, suf = '') => (v === null || v === undefined
                    ? <span style={{ color: TINTA_TENUE }}>—</span>
                    : <>{suf === '%' ? Math.round(100 * v) + '%' : pesos(v)}</>)
                  return (
                    <tr key={plaza.slug} style={{ borderTop: '1px solid ' + LINEA, textAlign: 'right' }}>
                      <td style={{ textAlign: 'left', padding: '6px 0', color: TINTA, fontWeight: 700 }}>
                        {plaza.nombre}
                      </td>
                      <td style={{ color: TINTA_SUAVE }}>{x.pz.toLocaleString('es-MX')}</td>
                      <td style={{ color: TINTA, fontWeight: 800 }}>{n(x.precioPublico)}</td>
                      <td style={{ color: TINTA }}>{n(x.precioMayoreo)}</td>
                      <td style={{ color: TINTA_SUAVE }}>{n(x.descuento, '%')}</td>
                      <td style={{ color: TINTA_SUAVE }}>{n(x.mezclaPiezas, '%')}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {/* Los codigos cobrados MAS CARO a mayoreo que al publico. No es
                un descuento raro: es un precio mal puesto, y hay que poder
                perseguirlo por codigo en la sucursal. */}
            {filas.some(f => f.grupos[g.k].invertidos > 0) && (
              <p style={{ fontSize: 11, color: '#B45309', margin: '6px 0 0' }}>
                Cobrados más caro a mayoreo que al público:{' '}
                {filas.filter(f => f.grupos[g.k].invertidos > 0)
                  .map(f => `${f.plaza.nombre} ${f.grupos[g.k].invertidos}`).join(' · ')}
              </p>
            )}
          </div>
        )
      })}

      <p style={{ fontSize: 11, color: TINTA_TENUE, margin: 0, lineHeight: 1.5 }}>
        El descuento se mide código contra sí mismo y se resume con la mediana, no promediando:
        un código vendido una vez a $1 al público arrastraba el promedio a −63%.
      </p>
    </section>
  )
}

/**
 * Lo que se vende más barato que el propio precio de mayoreo.
 *
 * ── Por qué ya no se compara contra la lista ──────────────────────────────
 *
 * Esta pantalla comparaba lo cobrado contra el precio de lista y marcaba 116
 * códigos de Aguascalientes como «desviados». El dueño vio que eso no decía
 * nada, y midiéndolo tenía razón: de 7,792 líneas al público en esa plaza,
 * **sólo 921 —el 12%— se cobraron al precio de lista**. Allí la lista es un
 * punto de partida y casi todo se negocia en el mostrador, así que marcar lo
 * que se aparta de ella es marcar casi todo.
 *
 * Lo que sí es accionable es el suelo que el propio negocio ya decidió: el
 * precio de MAYOREO. El iPhone 13 tiene lista 250 y mayoreo 150, y muchas de
 * sus ventas «al público» salen justo a 150 o 140 —el mostrador da precio de
 * mayoreo sin marcar la casilla—. Cuando baja de ahí, se le está vendiendo a
 * un cliente suelto más barato que a un mayorista.
 *
 * Eso no es negociar: es perder, y es poco y concreto, que es lo que hace
 * que una lista se mire.
 */
function PreciosARevisar({ porPlaza }) {
  const conAlgo = Object.entries(porPlaza).filter(([, x]) => x.bajo.filas.length)
  const [abierta, setAbierta] = useState(null)
  if (!conAlgo.length) return null

  const slug = (abierta && porPlaza[abierta]?.bajo.filas.length) ? abierta : conAlgo[0][0]
  const actual = porPlaza[slug]

  return (
    <section data-precios-revisar
             style={{ border: '1px solid #FCD34D', borderRadius: 22, padding: '18px 20px', background: 'rgba(252,211,77,0.10)' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 6 }}>
        <h3 style={{ fontSize: 13, fontWeight: 800, color: '#92400E', margin: 0, flex: 1 }}>
          Se vende más barato que a un mayorista
        </h3>
        <button type="button" className="boton-tinta" style={{ fontSize: 11.5, padding: '6px 12px' }}
                onClick={() => descargarPrecios(porPlaza)}>
          Bajar el Excel por sucursal
        </button>
      </div>

      <p style={{ fontSize: 11.5, color: '#92400E', margin: '0 0 12px', lineHeight: 1.55 }}>
        Códigos que se cobran a un cliente de mostrador <strong>por debajo de su propio precio de
        mayoreo</strong>, de los últimos 365 días. No se compara contra la lista al público: en las
        plazas que negocian, casi ninguna venta sale a ese precio y marcarlas todas no dice nada.
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {conAlgo.map(([s, x]) => (
          <button key={s} type="button" onClick={() => setAbierta(s)}
                  className={s === slug ? 'chip-plaza activa' : 'chip-plaza'}>
            {x.nombre}
            <span style={{ marginInlineStart: 6, fontWeight: 800 }}>{x.bajo.filas.length}</span>
          </button>
        ))}
      </div>

      <p style={{ fontSize: 11.5, color: TINTA_SUAVE, margin: '0 0 8px', lineHeight: 1.5 }}>
        {actual.nombre}: <strong style={{ color: TINTA }}>{actual.bajo.filas.length}</strong> códigos
        de {actual.bajo.comparados} mirados, {actual.bajo.piezas} piezas,
        {' '}<strong style={{ color: TINTA }}>{pesos(actual.bajo.pesos)}</strong> por debajo de lo que
        habría dado cobrando al menos el mayoreo.
        {actual.sinMarcar.piezas > 0 && (
          <> Además, <strong>{actual.sinMarcar.piezas} piezas</strong> se cobraron justo al precio de
          mayoreo sin marcar la casilla, así que cuentan como mostrador y la mezcla de mayoreo que
          ves más arriba se queda corta.</>
        )}
      </p>

      <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {actual.bajo.filas.slice(0, 8).map(f => (
          <li key={f.codigo} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: 10, alignItems: 'baseline', fontSize: 12 }}>
            {/* El CODIGO delante: esto se corrige en Eleventa, y ahi se busca
                por codigo. El nombre va de apoyo. */}
            <span style={{ fontWeight: 800, color: '#92400E', minWidth: '8ch', fontVariantNumeric: 'tabular-nums' }}>
              {f.codigo}
            </span>
            <span style={{ color: TINTA, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  title={f.producto}>
              {f.producto}
              {f.familia !== 'funda' && <span style={{ color: TINTA_TENUE }}> · {f.familia}</span>}
            </span>
            <span style={{ color: TINTA_SUAVE, whiteSpace: 'nowrap' }}>
              cobra {pesos(f.cobrado)} · mayoreo {pesos(f.mayoreo)}
            </span>
            <span style={{ fontWeight: 800, color: TINTA, whiteSpace: 'nowrap', minWidth: '6ch', textAlign: 'right' }}>
              {pesos(f.pesos)}
            </span>
          </li>
        ))}
      </ul>
      {actual.bajo.filas.length > 8 && (
        <p style={{ fontSize: 11, color: TINTA_TENUE, margin: '10px 0 0' }}>
          Y {actual.bajo.filas.length - 8} más. La lista entera va en el Excel.
        </p>
      )}
    </section>
  )
}

// ── Panel ─────────────────────────────────────────────────────────────────────

// ── Buscar un código ──────────────────────────────────────────────────────────

/**
 * La ficha de un código: sus piezas, en qué plaza salieron, su puesto en el
 * ranking, su serie diaria y sus meses.
 *
 * Va con TODAS las plazas y con el archivo entero a propósito, sin mirar las
 * pastillas de arriba. El por qué está en `buscarVentas.js`: buscar es ir por
 * un modelo concreto, y mirando «San Luis · 7 días» un código que sólo se
 * movió en León daría cero teniendo el dato a la vista.
 */
/**
 * La ficha de un código. Se exporta para que bodega la use en su panel.
 *
 * `existencias` es opcional: `{ slug: piezas }`. Cuando llega, cada plaza
 * enseña lo que TIENE al lado de lo que VENDIÓ, y es lo que contesta la duda
 * del dueño del 2026-11-09: «quiero saber si eso se debe a que estaba agotado
 * o si realmente es un número confiable». Cero ventas con cinco en el
 * mostrador es falta de demanda; cero ventas con cero en el mostrador no dice
 * nada de la demanda.
 */
/*
 * `agotados` también es opcional: `{ slug: { diasEnCero, diasMedidos, parte } }`
 * de este código, sacado del kárdex. `null` en una plaza es que no lo maneja;
 * `undefined`, que esa plaza todavía no tiene archivo. Con él la pregunta se
 * contesta con días y no sólo con la foto de hoy: un modelo puede tener cinco
 * hoy y haber pasado seis semanas en cero.
 */
export function FichaCodigo({ ficha, rango, existencias = null, agotados = null }) {
  // Doce meses es lo que cabe de un vistazo; el archivo guarda todos y el
  // Excel de «Archivo por mes» los baja completos.
  const meses = ficha.meses.slice(-12)
  const maxMes = Math.max(1, ...meses.map(m => m.salidas))
  const maxPlaza = Math.max(1, ...ficha.plazas.map(p => p.salidas))

  return (
    <div data-ficha-codigo={ficha.codigo || ficha.clave}
         style={{ border: '1px solid ' + LINEA, borderRadius: 22, padding: '16px 18px', marginBottom: 18, background: 'rgba(2,136,173,0.035)' }}>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <strong style={{ fontSize: 14.5, fontWeight: 800, color: TINTA }}>{ficha.producto}</strong>
        {ficha.codigo && (
          <span style={{ fontSize: 11.5, color: TINTA_TENUE, fontFamily: 'ui-monospace, monospace' }}>{ficha.codigo}</span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'baseline', marginBottom: 14 }}>
        <Cifra valor={ficha.total} etiqueta={`piezas en ${rango} días`}
               color={ficha.total > 0 ? TINTA : C_BAJA} />
        {ficha.lugar !== null && (
          <Cifra valor={`#${ficha.lugar}`} etiqueta={`de ${ficha.deCuantos} modelos con salida`} />
        )}
        {ficha.ultimo && (
          <span style={{ fontSize: 12, color: TINTA_SUAVE }}>última salida {fmtDia(ficha.ultimo)}</span>
        )}
      </div>

      {/* Cero no es «no encontrado»: es que no salió ni una pieza, que es el
          dato que se vino a buscar. Se dice con palabras. */}
      {ficha.total === 0 && (
        <div style={{ marginBottom: 14 }}>
          <Aviso>
            No salió ni una pieza en los últimos {rango} días, en ninguna plaza. El modelo
            existe: abajo están los meses en los que sí se movió.
          </Aviso>
        </div>
      )}

      {/* Las plazas, siempre todas. Que en una no se haya movido ninguna es
          parte de la respuesta, y una plaza sin archivo publicado dice «sin
          dato», no cero: no es lo mismo no vender que no saber. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
        {ficha.plazas.map(p => (
          <div key={p.slug} style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 140px) 1fr auto', gap: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: TINTA_SUAVE, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {p.nombre}
            </span>
            <Barra valor={p.salidas} max={maxPlaza} color={C_SERIE} />
            <span style={{ fontSize: 12.5, fontWeight: 700, color: p.sinDato ? TINTA_TENUE : TINTA, fontVariantNumeric: 'tabular-nums', minWidth: '7ch', textAlign: 'right' }}>
              {p.sinDato ? 'sin dato' : p.salidas}
              {existencias && !p.sinDato && (
                <LecturaExistencia vendio={p.salidas} hay={existencias[p.slug]} />
              )}
            </span>
          </div>
        ))}
      </div>

      {agotados && <VentaDeFiar ficha={ficha} agotados={agotados} />}

      {ficha.total > 0 && (
        <div style={{ marginBottom: 16 }}>
          <SerieDiaria serie={ficha.serie} />
        </div>
      )}

      {meses.length > 0 && (
        <div>
          <h4 style={{ fontSize: 12.5, fontWeight: 700, color: TINTA, margin: '0 0 8px' }}>
            Por mes, desde que hay archivo
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {meses.map(m => (
              <div key={m.periodo} style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 140px) 1fr auto', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: TINTA_SUAVE }}>{nombreDePeriodo(m.periodo)}</span>
                <Barra valor={m.salidas} max={maxMes} color={C_RANKING} />
                <span style={{ fontSize: 12.5, fontWeight: 700, color: m.salidas ? TINTA : TINTA_TENUE, fontVariantNumeric: 'tabular-nums', minWidth: '4ch', textAlign: 'right' }}>
                  {m.salidas}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function EstadisticasPanel() {
  const activas  = useMemo(() => SUCURSALES.filter(s => s.activa), [])
  const opciones = useMemo(() => [TODAS, ...activas], [activas])

  // La venta linea por linea, del backend. Es de ADMINISTRADOR: lleva los
  // nombres de los mayoristas y el de quien cobro cada ticket, asi que una
  // sucursal recibe 403 y la seccion simplemente no se dibuja.
  const { token } = useAuth()
  const { porPlaza: ventasPorPlaza } = useVentas(token, activas.map(x => x.slug))

  // La brecha entre la lista de precios y lo cobrado, por plaza. Hace falta
  // el inventario de cada una para leer su lista, asi que se calcula abajo
  // -donde ya estan descargados- y no aqui.

  const [sel, setSel]     = useState(TODAS.slug)
  const [rango, setRango] = useState(30)
  const [busqueda, setBusqueda] = useState('')
  // Cuál de las coincidencias se está mirando. Null significa «la primera»,
  // para que escribir un código y no tocar nada más ya enseñe su ficha.
  const [claveSel, setClaveSel] = useState(null)
  const [porSucursal, setPorSucursal] = useState(null)
  const [cargando, setCargando]       = useState(true)

  // Todo se baja una sola vez al abrir el panel. Son seis archivos de unos
  // pocos KB, y traerlos juntos hace que cambiar de sucursal sea instantáneo y
  // que el consolidado no tenga que volver a pedir nada.
  useEffect(() => {
    let cancelado = false
    setCargando(true)
    ;(async () => {
      const bajar = async url => {
        const res = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok) throw new Error('sin-datos')
        return res.json()
      }
      // Que a una sucursal le falte un archivo no puede tumbar el panel: cada
      // descarga cae en null por su cuenta y el resto sigue.
      // El inventario entra aquí porque sin él no hay precios ni costos, y sin
      // precios esta pantalla cuenta piezas: un negocio no se dirige en piezas.
      const pares = await Promise.all(activas.map(async s => [s.slug, {
        est:  await bajar(estadisticasUrl(s.slug)).catch(() => null),
        hist: await bajar(historialUrl(s.slug)).catch(() => null),
        inv:  await bajar(inventarioJsonUrl(s.slug)).catch(() => null),
      }]))
      // Bodega no vende, así que no entra en ninguna estadística de venta.
      // Su inventario sí hace falta: es de donde sale el COSTO, y de ningún
      // otro sitio. Lo decidió el dueño porque en sucursal lo captura otra
      // persona y puede equivocarse.
      const invBodega = await bajar(inventarioJsonUrl(BODEGA.slug)).catch(() => null)
      if (cancelado) return
      setPorSucursal({ ...Object.fromEntries(pares), [BODEGA.slug]: { inv: invBodega } })
      setCargando(false)
    })()
    return () => { cancelado = true }
  }, [activas])

  const sucursal = opciones.find(o => o.slug === sel) ?? TODAS

  const datos = useMemo(() => {
    if (!porSucursal) return null
    if (sel === TODAS.slug) return consolidarEstadisticas(activas.map(s => porSucursal[s.slug]?.est), TODAS.nombre)
    return porSucursal[sel]?.est ?? null
  }, [porSucursal, sel, activas])

  const historial = useMemo(() => {
    if (!porSucursal) return null
    if (sel === TODAS.slug) return consolidarHistorial(activas.map(s => porSucursal[s.slug]?.hist), TODAS.nombre)
    return porSucursal[sel]?.hist ?? null
  }, [porSucursal, sel, activas])

  const resumen = useMemo(() => datos ? resumir(datos, rango) : null, [datos, rango])

  // ── La radiografía ────────────────────────────────────────────────────
  //
  // El dinero se valora al promedio de precio público y mayoreo de las plazas
  // que VENDEN -bodega no entra: ahí el iPhone 15 figura con precio igual al
  // costo-. Se dice en pantalla para que nadie lea estas cifras como si
  // fueran lo que paga un mayorista.
  const inventarios = useMemo(
    () => (porSucursal ? Object.fromEntries(activas.map(s => [s.slug, porSucursal[s.slug]?.inv])) : {}),
    [porSucursal, activas])

  // ── El precio con el que se valora todo ──────────────────────────────
  //
  // Sale de lo que SE COBRO, no de la lista. La lista no es lo que se cobra
  // -Aguascalientes cobra el 75% de la suya- y el promedio de publico y
  // mayoreo que hacia `promedioEntrePlazas` supone una mezcla 50/50 que no
  // existe en ninguna plaza: Leon va al 65% de piezas a mayoreo y Ferias al
  // 0%. Dividiendo dinero entre piezas, la mezcla real viene dentro.
  //
  // La lista se queda de RESPALDO para los codigos sin venta en la ventana:
  // un modelo parado un año sigue teniendo existencia que vale dinero, y sin
  // precio saldria en cero, que es peor que un precio viejo.
  const lista = useMemo(() => promedioEntrePlazas(inventarios), [inventarios])

  // Respeta la pastilla de plaza: el precio de Ferias no vale para Leon. Con
  // «Todas» se ponderan por piezas, que es lo que hace que una plaza chica no
  // pese lo mismo que una grande.
  const precioDe = useMemo(() => {
    const cuales = sel === TODAS.slug ? activas.map(x => x.slug) : [sel]
    const porPlaza = {}
    for (const slug of cuales) {
      const v = ventasPorPlaza?.[slug]?.ventana?.porCodigo
      if (v) porPlaza[slug] = v
    }
    return preciosDeVenta(porPlaza, { lista })
  }, [ventasPorPlaza, sel, activas, lista])

  const precios = useMemo(() => soloPrecios(precioDe), [precioDe])

  // El PRECIO sale de las plazas que venden y el COSTO de bodega. No es una
  // incoherencia: cada dato lo mantiene quien lo sabe. Bodega no vende, así
  // que su precio es basura heredada; bodega compra, así que su costo es el
  // bueno. El detalle está en `costoPorModelo`.
  const invBodega = useMemo(
    () => ({ bodega: porSucursal?.[BODEGA.slug]?.inv }), [porSucursal])
  const costos = useMemo(() => costoPorModelo(invBodega), [invBodega])

  const nombres = useMemo(() => {
    const out = {}
    for (const s of activas) Object.assign(out, porSucursal?.[s.slug]?.hist?.catalogo ?? {})
    return out
  }, [porSucursal, activas])

  const proyeccion = useMemo(
    () => (datos ? proyeccionDelMes({ est: datos, precios }) : null),
    [datos, precios])

  // ── Las ediciones recientes ───────────────────────────────────────────
  //
  // Respeta la pastilla de plaza: con una elegida se mira su catálogo y su
  // historial, porque un modelo puede haber entrado sólo en León. `historial`
  // ya viene acotado arriba.
  const invsVista = useMemo(() => {
    if (sel === TODAS.slug) return inventarios
    return { [sel]: inventarios[sel] }
  }, [inventarios, sel])

  const estrenosDatos = useMemo(() => {
    if (!porSucursal) return null
    // `mapaDeAltas` recibe las LISTAS de productos, no el json entero. Es el
    // que sabe reconocer el día en que arranca el historial de cada plaza y
    // marcarlo como piso.
    const altas = mapaDeAltas(Object.fromEntries(
      Object.entries(invsVista).map(([slug, inv]) => [slug, inv?.productos ?? []])))
    return estrenos({ altas, historial, inventarios: invsVista, precios, costos, nombres })
  }, [porSucursal, invsVista, historial, precios, costos, nombres])

  // Cuatro semanas contra las cuatro anteriores: es la comparación que usa
  // quien compra, no el mes natural, que parte la tendencia por la mitad.
  const ventanas = useMemo(() => {
    if (!datos) return null
    const hoy = new Date()
    const dia = n => { const f = new Date(hoy); f.setDate(f.getDate() - n); return f.toISOString().slice(0, 10) }
    return {
      ahora: salidasEntre(datos, dia(27), dia(0)),
      antes: salidasEntre(datos, dia(55), dia(28)),
    }
  }, [datos])

  // Cuanto del valor se apoya en precio cobrado y cuanto en lista. Se dice
  // en pantalla: una cifra que se apoya en la lista a medias no es la misma
  // cifra, y callarlo seria el mismo error que acabamos de arreglar.
  const apoyo = useMemo(
    () => (ventanas ? cobertura(precioDe, ventanas.ahora) : null),
    [precioDe, ventanas])

  const puente = useMemo(
    () => (ventanas ? puenteDeVariacion({ ...ventanas, precios }) : null),
    [ventanas, precios])

  const empuje = useMemo(
    () => (datos ? momentum({ est: datos, precios, nombres }) : null),
    [datos, precios, nombres])

  const rendimiento = useMemo(
    () => (ventanas ? rentabilidad({ salidas: ventanas.ahora, precios, costos, nombres }) : null),
    [ventanas, precios, costos, nombres])

  // La brecha entre la lista de precios y lo que cobra la caja, por plaza.
  // Se calcula aquí porque hace falta el inventario de cada una -de ahí sale
  // su lista- y es donde ya están descargados.
  const preciosARevisar = useMemo(() => {
    if (!ventasPorPlaza || !porSucursal) return {}
    const out = {}
    for (const s of activas) {
      const v = ventasPorPlaza[s.slug]?.ventana?.porCodigo
      const inventario = porSucursal[s.slug]?.inv
      if (!v || !inventario) continue
      out[s.slug] = {
        nombre: s.nombre,
        // Sobre la VENTANA, nunca el acumulado: con todo el historial se
        // comparan ventas de 2021 contra la lista de hoy y la cifra sale 164
        // veces mayor de lo que es.
        bajo: porDebajoDelMayoreo({ porCodigo: v, inventario }),
        sinMarcar: mayoreoSinMarcar({ porCodigo: v, inventario }),
      }
    }
    return out
  }, [ventasPorPlaza, porSucursal, activas])

  // Lo que se vende y bodega no tiene costeado. No es un aviso: es la lista
  // de trabajo, y se baja en Excel para repartirla.
  const huecoCosto = useMemo(() => {
    if (!ventanas) return []
    return sinCostear({ salidas: ventanas.ahora, costos, inventarios: invBodega, nombres })
  }, [ventanas, costos, invBodega, nombres])

  // Las dos de abajo son preguntas de RED: no cambian con la pastilla de
  // plaza, porque mover una caja de una tienda a otra sólo tiene sentido
  // mirando a las tres a la vez.
  const huecos = useMemo(() => {
    if (!porSucursal) return []
    const ritmoPorPlaza = Object.fromEntries(activas.map(s => [
      s.slug, ritmoPonderado({ est: porSucursal[s.slug]?.est, hist: porSucursal[s.slug]?.hist }).tasa,
    ]))
    return brechas({ ritmoPorPlaza, inventarios, precios, plazas: activas, nombres })
  }, [porSucursal, activas, inventarios, precios, nombres])

  const parado = useMemo(() => {
    if (!porSucursal) return null
    const ultima = ultimaVentaPorModelo(activas.map(s => porSucursal[s.slug]?.hist))
    const sinVender = {}
    for (const c of Object.keys(nombres)) sinVender[c] = diasDesdeElMes(ultima[c])
    return capitalParado({ inventarios, diasSinVender: sinVender, costos, nombres, desde: 90 })
  }, [porSucursal, activas, inventarios, costos, nombres])

  // Las coincidencias salen del catálogo de TODAS las plazas y de los 60 días
  // completos, no del rango ni de la plaza elegidos. El rango decide qué
  // gráfica se dibuja; nunca si el modelo aparece.
  const buscando = hayBusqueda(busqueda)
  const coincidencias = useMemo(
    () => (buscando ? modelosQueCoinciden({ porSucursal, consulta: busqueda }) : []),
    [buscando, porSucursal, busqueda],
  )
  const clave = coincidencias.some(c => c.clave === claveSel)
    ? claveSel
    : coincidencias[0]?.clave ?? null
  const ficha = useMemo(
    () => (clave ? fichaDeVentas({ porSucursal, clave, plazas: activas, rango }) : null),
    [porSucursal, clave, activas, rango],
  )

  // Lo que se enseña a la derecha del título cuando el comparativo está
  // cerrado: lo justo para saber si conviene abrirlo.
  const resumenComparativo = useMemo(() => {
    if (!historial) return null
    const c = comparativo(historial, 1)
    if (!c) return null
    if (!c.hayPrevio) return `${c.etiqueta} · sin periodo previo`
    const signo = c.delta > 0 ? '+' : ''
    return `${c.etiqueta} · ${signo}${c.delta} pz${c.pct !== null ? ` (${signo}${c.pct}%)` : ''}`
  }, [historial])

  // Cuáles sucursales quedaron fuera del consolidado, para no dar por completo
  // un número al que le falta una plaza.
  const faltantes = useMemo(
    () => porSucursal ? activas.filter(s => !porSucursal[s.slug]?.est).map(s => s.nombre) : [],
    [porSucursal, activas],
  )

  return (
    <div style={{ backgroundColor: '#fff', borderRadius: 30, border: '1px solid ' + LINEA, padding: '24px 22px', boxShadow: '0 2px 12px rgba(16,22,25,0.04)' }}>

      {/* Una sola línea. El detalle de cómo se calcula ya estaba al pie del
          panel, repetirlo arriba empujaba la gráfica fuera de la pantalla. */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <span style={{ fontSize: 11.5, color: TINTA_TENUE }}>
          lo que bajó de existencia día contra día
        </span>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        {opciones.map(s => (
          <Pildora key={s.slug} activa={sel === s.slug} onClick={() => setSel(s.slug)}>
            {s.slug === TODAS.slug ? 'Todas' : s.nombre}
          </Pildora>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {RANGOS.map(r => (
          <Pildora key={r} activa={rango === r} onClick={() => setRango(r)}>
            {r} días
          </Pildora>
        ))}
      </div>

      {/* Buscar un código concreto.

          Va fuera del bloque de abajo a propósito: ese bloque depende de que
          la plaza elegida tenga estadística, y la búsqueda no puede depender
          de eso. Si Aguascalientes no tiene archivo publicado, buscar un
          código que se vende en León tiene que seguir contestando. */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
        <input
          value={busqueda}
          onChange={e => { setBusqueda(e.target.value); setClaveSel(null) }}
          placeholder="Buscar un código: SGA16T, iphone 15, mica..."
          style={{ flex: 1, minWidth: 200, padding: '8px 14px', fontSize: 13, borderRadius: 999, border: '1px solid ' + LINEA, outline: 'none', color: TINTA }}
        />
        {busqueda && (
          <Pildora onClick={() => { setBusqueda(''); setClaveSel(null) }}>Limpiar</Pildora>
        )}
      </div>

      <p style={{ fontSize: 11, color: TINTA_TENUE, margin: '0 0 20px', lineHeight: 1.5 }}>
        Un código se busca en todas las plazas y en el archivo completo: ni la plaza ni el
        rango que estén puestos arriba lo esconden.
      </p>

      {buscando && (
        <div>
          {/* Cuando coincide más de uno hay que poder elegir: escribir «a16»
              trae el Samsung y el Oppo, y adivinar cuál quería sería peor. */}
          {coincidencias.length > 1 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              {coincidencias.slice(0, 8).map(c => (
                <Pildora key={c.clave} activa={c.clave === clave} onClick={() => setClaveSel(c.clave)}>
                  {c.codigo || c.producto}
                </Pildora>
              ))}
              {coincidencias.length > 8 && (
                <span style={{ fontSize: 11.5, color: TINTA_TENUE, alignSelf: 'center' }}>
                  y {coincidencias.length - 8} más: escribe un poco más del código
                </span>
              )}
            </div>
          )}

          {ficha
            ? <FichaCodigo ficha={ficha} rango={rango} />
            : (
              <div data-sin-coincidencias style={{ padding: '14px 16px', borderRadius: 16, marginBottom: 18, background: 'rgba(16,22,25,0.03)', border: '1px solid ' + LINEA }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: TINTA, margin: 0 }}>
                  Ningún modelo coincide con «{busqueda.trim()}»
                </p>
                {/* Decir dónde sí está, en vez de dejarlo en «no hay nada»:
                    aquí sólo viven los códigos que han bajado de existencia
                    alguna vez, y eso no es todo el catálogo. */}
                <p style={{ fontSize: 12, color: TINTA_SUAVE, margin: '4px 0 0', lineHeight: 1.55 }}>
                  Este archivo sólo tiene los códigos que han bajado de existencia alguna vez. Un
                  código que exista en el catálogo y todavía no se haya movido se consulta en
                  Inventarios.
                </p>
              </div>
            )}
        </div>
      )}

      {cargando && <p style={{ fontSize: 13, color: TINTA_TENUE }}>Cargando movimiento de las sucursales...</p>}

      {!cargando && !datos && (
        <div style={{ padding: '14px 16px', borderRadius: 16, background: 'rgba(196,21,111,0.05)', border: '1px solid rgba(196,21,111,0.18)' }}>
          <p style={{ fontSize: 13, color: C_RANKING, fontWeight: 700, margin: 0 }}>Sin estadísticas para {sucursal.nombre}</p>
          <p style={{ fontSize: 12, color: TINTA_SUAVE, margin: '4px 0 0' }}>
            Se generan solas conforme la sincronización publica días nuevos. Hacen falta al menos dos días distintos para poder comparar.
          </p>
        </div>
      )}

      {resumen && !cargando && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

          {sel === TODAS.slug && faltantes.length > 0 && (
            <Aviso>
              El consolidado va sin {faltantes.join(' ni ')}: esa sucursal todavía no tiene estadística publicada.
            </Aviso>
          )}

          {/* Tres cifras en un renglón. Antes eran tres tarjetas grandes que
              ocupaban el alto de la gráfica sin decir más. */}
          <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'baseline', marginTop: -8 }}>
            <Cifra valor={resumen.totalSalidas} etiqueta="piezas" />
            <Cifra valor={resumen.modelosConMovimiento} etiqueta="modelos" />
            <Cifra valor={`${resumen.diasConDato}/${rango}`} etiqueta="días con dato"
                   color={resumen.diasConDato < rango ? '#B45309' : TINTA} />
            {resumen.diasConDato < rango && (
              <span style={{ fontSize: 11, color: '#B45309', lineHeight: 1.4, maxWidth: 330 }}>
                Los días sin respaldo salen en cero, no como ausencia.
              </span>
            )}
          </div>

          {/* ── Lo primero: qué está pasando, en una frase ──────────── */}
          {proyeccion && (
            <EnTreintaSegundos
              proyeccion={proyeccion} puente={puente} empuje={empuje}
              rendimiento={rendimiento} parado={parado} sucursal={sucursal}
              huecoCosto={huecoCosto} apoyo={apoyo} />
          )}

          {huecoCosto.length > 0 && <CostosQueFaltan filas={huecoCosto} />}

          {/* Si lo nuevo está vendiendo. Va arriba, antes de los precios:
              es la pregunta que se hace al decidir la compra siguiente, y
              antes vivía en Surtido contestando sólo la mitad. */}
          <Estrenos datos={estrenosDatos} precios={precios} plazas={activas} />

          {/* Las cancelaciones, con lo que se vendió después. Va aquí porque
              es dato de TICKET, como todo lo de esta pestaña. */}
          <Cancelaciones porPlaza={ventasPorPlaza} plazas={activas} sel={sel} />

          {/* A qué precio vende cada plaza, con los tres grupos SEPARADOS.
              Va aquí arriba, no al final: es lo que el dueño mira primero
              para saber si una plaza es de mostrador o de mayoreo. */}
          <PrecioPorPlaza porPlaza={ventasPorPlaza} plazas={activas} />

          {/* Y lo que de ahí sale torcido, aislado por sucursal para mandarlo.
              Va justo debajo del precio, que es donde se entiende. */}
          <PreciosARevisar porPlaza={preciosARevisar} />

          {puente && <Puente puente={puente} />}

          {empuje && (empuje.acelerando.length > 0 || empuje.frenando.length > 0) && (
            <Momentum acelerando={empuje.acelerando} frenando={empuje.frenando} />
          )}

          {sel === TODAS.slug && huecos.length > 0 && <Brechas filas={huecos} />}

          {parado?.filas?.length > 0 && <Parado datos={parado} />}

          <SerieDiaria serie={resumen.serie} />

          <div>
            <h4 style={{ fontSize: 13, fontWeight: 800, color: TINTA, margin: '0 0 12px' }}>
              Modelos con más salida en {sucursal.nombre}
            </h4>
            <Ranking ranking={resumen.ranking} />
          </div>

          {historial && (
            <Plegable titulo="Comparativo contra el periodo anterior"
                      resumen={resumenComparativo}>
              <ComparativoPeriodos historial={historial} sucursal={sucursal} />
            </Plegable>
          )}
          {historial && (
            <Plegable titulo="Archivo por mes"
                      resumen={`${periodosDisponibles(historial).length} meses guardados`}>
              <ArchivoPermanente historial={historial} sucursal={sucursal} />
            </Plegable>
          )}

          <p style={{ fontSize: 11, color: TINTA_TENUE, margin: 0, lineHeight: 1.55, paddingTop: 14, borderTop: '1px solid ' + LINEA }}>
            Estos números son un piso, no una cifra exacta de venta. Si un modelo baja de 5 a 2
            y ese mismo día entran 6 de resurtido, el inventario del día siguiente marca 8 y la
            salida no se alcanza a ver. Con una foto diaria no hay forma de separarlo.
            {datos?.actualizado && ` Última actualización: ${new Date(datos.actualizado).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}.`}
          </p>
        </div>
      )}
    </div>
  )
}
