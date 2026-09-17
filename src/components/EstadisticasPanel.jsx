import { useState, useEffect, useMemo } from 'react'
import { SUCURSALES } from '../lib/sucursales'
import { estadisticasUrl, historialUrl } from '../lib/s3'
import {
  resumir, periodosDisponibles, comparativo,
  consolidarHistorial, consolidarEstadisticas,
} from '../lib/estadisticas'
import { descargarHistorial, descargarComparativo, nombreDePeriodo } from '../lib/exportarEstadisticas'

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

function Pildora({ activa, onClick, children }) {
  return (
    <button type="button" onClick={onClick}
      className="px-4 py-2 text-sm font-semibold transition-all"
      style={activa
        ? { background: 'linear-gradient(135deg, #00BCF2, #8DC63F)', borderRadius: 999, color: '#fff', border: 'none', cursor: 'pointer', boxShadow: '0 4px 14px rgba(0,188,242,0.22)' }
        : { backgroundColor: 'rgba(16,22,25,0.05)', border: '1px solid ' + LINEA, borderRadius: 999, color: TINTA_SUAVE, cursor: 'pointer', background: 'none' }}>
      {children}
    </button>
  )
}

function BotonExcel({ onClick, principal, children }) {
  return (
    <button type="button" onClick={onClick}
      className="px-4 py-2 text-sm font-semibold transition-all"
      style={principal
        ? { background: 'linear-gradient(135deg, #5E9422, #8DC63F)', borderRadius: 999, color: '#fff', border: 'none', cursor: 'pointer', boxShadow: '0 4px 14px rgba(94,148,34,0.22)' }
        : { backgroundColor: '#fff', border: '1px solid ' + LINEA, borderRadius: 999, color: TINTA_SUAVE, cursor: 'pointer' }}>
      {children}
    </button>
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
function SerieDiaria({ serie }) {
  const [activo, setActivo] = useState(null)
  const max = Math.max(1, ...serie.map(d => d.salidas))
  const fmt = iso => {
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10, gap: 10, flexWrap: 'wrap' }}>
        <h4 style={{ fontSize: 13, fontWeight: 800, color: TINTA, margin: 0 }}>Piezas que salieron por día</h4>
        <span style={{ fontSize: 11.5, color: activo ? TINTA : TINTA_TENUE, fontVariantNumeric: 'tabular-nums' }}>
          {activo ? `${fmt(activo.fecha)}: ${activo.salidas} pz` : `máximo ${max} pz`}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 90, borderBottom: '1px solid ' + LINEA, paddingBottom: 0 }}>
        {serie.map(d => {
          const h = d.salidas === 0 ? 2 : Math.max(4, Math.round((d.salidas / max) * 86))
          const esActivo = activo?.fecha === d.fecha
          return (
            <div key={d.fecha}
              onMouseEnter={() => setActivo(d)}
              onMouseLeave={() => setActivo(null)}
              title={`${fmt(d.fecha)}: ${d.salidas} piezas`}
              style={{ flex: 1, minWidth: 3, height: '100%', display: 'flex', alignItems: 'flex-end', cursor: 'default' }}>
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

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10.5, color: TINTA_TENUE }}>
        <span>{fmt(serie[0].fecha)}</span>
        <span>{fmt(serie[serie.length - 1].fecha)}</span>
      </div>
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
    <div style={{ paddingTop: 20, borderTop: '1px solid ' + LINEA }}>
      <h4 style={{ fontSize: 13, fontWeight: 800, color: TINTA, margin: '0 0 4px' }}>
        Comparativo contra el periodo anterior
      </h4>
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
    <div style={{ paddingTop: 20, borderTop: '1px solid ' + LINEA }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <h4 style={{ fontSize: 13, fontWeight: 800, color: TINTA, margin: 0 }}>Archivo por mes</h4>
        <span style={{ fontSize: 11, color: TINTA_TENUE }}>se guarda completo, sin límite de días</span>
      </div>
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

// ── Panel ─────────────────────────────────────────────────────────────────────

export default function EstadisticasPanel() {
  const activas  = useMemo(() => SUCURSALES.filter(s => s.activa), [])
  const opciones = useMemo(() => [TODAS, ...activas], [activas])

  const [sel, setSel]     = useState(TODAS.slug)
  const [rango, setRango] = useState(30)
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
      const pares = await Promise.all(activas.map(async s => [s.slug, {
        est:  await bajar(estadisticasUrl(s.slug)).catch(() => null),
        hist: await bajar(historialUrl(s.slug)).catch(() => null),
      }]))
      if (cancelado) return
      setPorSucursal(Object.fromEntries(pares))
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

  // Cuáles sucursales quedaron fuera del consolidado, para no dar por completo
  // un número al que le falta una plaza.
  const faltantes = useMemo(
    () => porSucursal ? activas.filter(s => !porSucursal[s.slug]?.est).map(s => s.nombre) : [],
    [porSucursal, activas],
  )

  return (
    <div style={{ backgroundColor: '#fff', borderRadius: 30, border: '1px solid ' + LINEA, padding: '24px 22px', boxShadow: '0 2px 12px rgba(16,22,25,0.04)' }}>

      <div style={{ marginBottom: 18 }}>
        <h3 style={{ fontSize: 15, fontWeight: 800, color: TINTA, margin: '0 0 4px' }}>📊 Movimiento de inventario</h3>
        <p style={{ fontSize: 12, color: TINTA_SUAVE, margin: 0, lineHeight: 1.5 }}>
          Se calcula comparando el inventario de cada día contra el anterior. Cuenta lo que
          bajó de existencia, así que el resurtido no infla el número.
        </p>
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

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Dato valor={resumen.totalSalidas} etiqueta="piezas salieron" nota={`en ${rango} días`} />
            <Dato valor={resumen.modelosConMovimiento} etiqueta="modelos con movimiento" />
            <Dato valor={resumen.diasConDato} etiqueta="días con dato"
                  nota={resumen.diasConDato < rango ? `de ${rango} posibles` : null} />
          </div>

          {resumen.diasConDato < rango && (
            <p style={{ fontSize: 11.5, color: '#B45309', margin: '-10px 0 0', lineHeight: 1.5 }}>
              Solo hay {resumen.diasConDato} {resumen.diasConDato === 1 ? 'día' : 'días'} con dato en este rango.
              Los días sin respaldo de la sucursal aparecen en cero, no como ausencia.
            </p>
          )}

          <SerieDiaria serie={resumen.serie} />

          <div>
            <h4 style={{ fontSize: 13, fontWeight: 800, color: TINTA, margin: '0 0 12px' }}>
              Modelos con más salida en {sucursal.nombre}
            </h4>
            <Ranking ranking={resumen.ranking} />
          </div>

          {historial && <ComparativoPeriodos historial={historial} sucursal={sucursal} />}
          {historial && <ArchivoPermanente historial={historial} sucursal={sucursal} />}

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
