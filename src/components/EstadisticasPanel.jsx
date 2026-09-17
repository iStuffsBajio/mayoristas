import { useState, useEffect, useMemo } from 'react'
import { SUCURSALES } from '../lib/sucursales'
import { estadisticasUrl } from '../lib/s3'
import { resumir } from '../lib/estadisticas'

// Una serie por gráfica, así que no hacen falta colores categóricos ni leyenda:
// el título nombra la serie. Los dos tonos pasaron el validador de contraste
// contra fondo claro.
const C_RANKING = '#C4156F'
const C_SERIE   = '#0288AD'

const TINTA       = '#101619'
const TINTA_SUAVE = '#4A5A61'
const TINTA_TENUE = '#8598A1'
const LINEA       = '#D6E0E4'

const RANGOS = [7, 30, 60]

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

function Dato({ valor, etiqueta, nota }) {
  return (
    <div style={{ flex: 1, minWidth: 120, padding: '14px 16px', background: '#fff', border: '1px solid ' + LINEA, borderRadius: 18 }}>
      <div style={{ fontSize: 26, fontWeight: 800, color: TINTA, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{valor}</div>
      <div style={{ fontSize: 12, color: TINTA_SUAVE, marginTop: 3 }}>{etiqueta}</div>
      {nota && <div style={{ fontSize: 11, color: TINTA_TENUE, marginTop: 2 }}>{nota}</div>}
    </div>
  )
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
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 3 }}>
              <span style={{ fontSize: 12.5, color: TINTA, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.producto}
              </span>
              {r.codigo && (
                <span style={{ fontSize: 10.5, color: TINTA_TENUE, fontFamily: 'ui-monospace, monospace', flexShrink: 0 }}>
                  {r.codigo}
                </span>
              )}
            </div>
            <div style={{ height: 7, background: 'rgba(16,22,25,0.05)', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ width: `${Math.max(3, (r.salidas / max) * 100)}%`, height: '100%', background: C_RANKING, borderRadius: 999 }} />
            </div>
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

// ── Panel ─────────────────────────────────────────────────────────────────────

export default function EstadisticasPanel() {
  const [sucursal, setSucursal] = useState(SUCURSALES[0])
  const [rango, setRango]       = useState(30)
  const [datos, setDatos]       = useState(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError]       = useState(null)

  useEffect(() => {
    let cancelado = false
    setCargando(true); setError(null); setDatos(null)
    ;(async () => {
      try {
        const res = await fetch(`${estadisticasUrl(sucursal.slug)}?t=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok) throw new Error('sin-datos')
        const j = await res.json()
        if (!cancelado) setDatos(j)
      } catch {
        if (!cancelado) setError('sin-datos')
      } finally {
        if (!cancelado) setCargando(false)
      }
    })()
    return () => { cancelado = true }
  }, [sucursal])

  const resumen = useMemo(() => datos ? resumir(datos, rango) : null, [datos, rango])

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
        {SUCURSALES.filter(s => s.activa).map(s => (
          <Pildora key={s.slug} activa={sucursal.slug === s.slug} onClick={() => setSucursal(s)}>
            {s.nombre}
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

      {cargando && <p style={{ fontSize: 13, color: TINTA_TENUE }}>Cargando movimiento de {sucursal.nombre}...</p>}

      {error && !cargando && (
        <div style={{ padding: '14px 16px', borderRadius: 16, background: 'rgba(196,21,111,0.05)', border: '1px solid rgba(196,21,111,0.18)' }}>
          <p style={{ fontSize: 13, color: C_RANKING, fontWeight: 700, margin: 0 }}>Sin estadísticas para {sucursal.nombre}</p>
          <p style={{ fontSize: 12, color: TINTA_SUAVE, margin: '4px 0 0' }}>
            Se generan solas conforme la sincronización publica días nuevos. Hacen falta al menos dos días distintos para poder comparar.
          </p>
        </div>
      )}

      {resumen && !cargando && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

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
