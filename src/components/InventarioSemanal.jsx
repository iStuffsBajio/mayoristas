import { useState, useRef, useEffect, useMemo } from 'react'
import * as XLSX from 'xlsx-js-style'
import { useAuth } from '../context/AuthContext'
import { inventarioUrl, loadInventarioJson, s3Configured } from '../lib/s3'
import { subirInventario, apiConfigurada } from '../lib/api'
import StockBadge, { nivelStock, COLOR_NIVEL, ETIQUETAS_LEYENDA } from './StockBadge'
import { filtrarYBuscar } from '../lib/buscar'

const SUCURSALES = [
  { name: 'León',            slug: 'leon' },
  { name: 'San Luis Potosí', slug: 'san-luis' },
  { name: 'Aguascalientes',  slug: 'aguascalientes' },
  { name: 'Torreón',         slug: 'torreon' },
]

// Columnas exactas del sistema de inventario exportado
const COL_PRODUCTO   = 'Producto'
const COL_EXISTENCIA = 'Existencia'
const COL_CODIGO     = 'Codigo'

// El export de Eleventa a veces trae la columna con acento y a veces sin él.
// El código es la clave con la que las estadísticas cruzan un modelo entre
// días, así que perderlo aquí rompería el conteo de la carga manual.
const codigoDe = fila =>
  String(fila['Codigo'] ?? fila['Código'] ?? fila['CODIGO'] ?? '').trim()

// ─── Subcomponentes ──────────────────────────────────────────────

const SearchIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
  </svg>
)

const UploadIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
)

function HighlightText({ text, query }) {
  if (!query) return <>{text}</>
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ backgroundColor: 'rgba(0,188,242,0.18)', color: '#007aad', borderRadius: 7, padding: '0 2px', fontWeight: 700, fontStyle: 'normal' }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  )
}

// ─── Componente principal ────────────────────────────────────────

export default function InventarioSemanal({ onLoginClick, busqueda, onBuscar }) {
  const { canUpload, session, token } = useAuth()
  const [sucursal, setSucursal]     = useState(SUCURSALES[0])
  const [allRows, setAllRows]       = useState(null)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState(null)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [fileName, setFileName]     = useState(null)
  const [origen, setOrigen]         = useState(null)   // metadatos del inventario.json (respaldo, origen)
  // La búsqueda la manda la barra de arriba, para que escribir ahí filtre
  // aquí. Si el componente se usa suelto, se apaña con su propio estado.
  const [searchLocal, setSearchLocal] = useState('')
  const search    = busqueda ?? searchLocal
  const setSearch = onBuscar ?? setSearchLocal
  const [uploading, setUploading]   = useState(false)
  const fileInputRef = useRef(null)
  const searchRef    = useRef(null)

  // Cuando cambia la sucursal, intenta cargar el inventario.xlsx de la carpeta pública.
  // Si no existe o el nombre no coincide, muestra el estado vacío con instrucciones.
  useEffect(() => {
    tryAutoLoad(sucursal)
  }, [sucursal])

  const parseWorkbook = (wb) => {
    const ws = wb.Sheets[wb.SheetNames[0]]
    const json = XLSX.utils.sheet_to_json(ws, { defval: '' })
    return json
      .filter(r => r[COL_PRODUCTO] && String(r[COL_PRODUCTO]).trim() !== '')
      .filter(r => {
        const dep = String(r['Departamento'] ?? '').trim().toLowerCase()
        return dep !== 'mayoristas' && dep !== '- sin departamento -'
      })
      .map(r => ({
        [COL_CODIGO]:     codigoDe(r),
        [COL_PRODUCTO]:   String(r[COL_PRODUCTO]).trim(),
        [COL_EXISTENCIA]: r[COL_EXISTENCIA],
      }))
  }

  const applyRows = (rows, name, meta = null) => {
    setAllRows(rows)
    setLastUpdate(meta?.generado ? new Date(meta.generado) : new Date())
    setFileName(name)
    setOrigen(meta)
    setSearch('')
    setError(null)
    setLoading(false)
  }

  const tryAutoLoad = async (suc) => {
    setLoading(true)
    setError(null)
    setAllRows(null)
    setFileName(null)
    setOrigen(null)
    // 1) inventario.json generado automáticamente desde los respaldos de Eleventa
    if (s3Configured) {
      try {
        const data = await loadInventarioJson(suc.slug)
        if (data) {
          const rows = data.productos.map(p => ({ [COL_CODIGO]: String(p.Codigo ?? '').trim(), [COL_PRODUCTO]: String(p.Producto).trim(), [COL_EXISTENCIA]: p.Existencia }))
          applyRows(rows, data.respaldo?.archivo || 'inventario.json', data)
          return
        }
      } catch { /* sigue con el Excel */ }
    }
    // 2) inventario.xlsx (carga manual anterior) desde S3 o carpeta pública
    const urls = s3Configured
      ? [inventarioUrl(suc.slug)]
      : [`/inventarios/${suc.slug}/inventario.xlsx`]
    for (const url of urls) {
      try {
        const res = await fetch(url, { cache: 'no-store' })
        if (!res.ok) continue
        const buf  = await res.arrayBuffer()
        const wb   = XLSX.read(buf, { type: 'array' })
        const rows = parseWorkbook(wb)
        if (rows.length === 0) continue
        applyRows(rows, 'inventario.xlsx')
        return
      } catch { continue }
    }
    setError(`${suc.name}`)
    setLoading(false)
  }

  const handleFileUpload = async (file) => {
    if (!file) return
    setLoading(true)
    setUploading(false)
    fileInputRef.current.value = ''
    try {
      const buf  = await file.arrayBuffer()
      const wb   = XLSX.read(buf, { type: 'array' })
      const rows = parseWorkbook(wb)
      if (rows.length === 0) throw new Error('Sin datos')
      // La subida pasa por el backend, que revalida el permiso sobre esta
      // sucursal. Si no hay backend, el archivo igual se muestra en pantalla:
      // no se publica, pero quien lo cargó puede consultarlo.
      let meta = null
      if (apiConfigurada && canUpload(sucursal.slug)) {
        setUploading(true)
        try {
          await subirInventario(sucursal.slug, rows.map(r => ({
            Codigo:     r[COL_CODIGO] ?? '',
            Producto:   r[COL_PRODUCTO],
            Existencia: r[COL_EXISTENCIA],
          })), token)
        } finally {
          setUploading(false)
        }
      }
      applyRows(rows, file.name, meta)
    } catch (err) {
      setUploading(false)
      setError(err?.message || 'No se pudo leer o subir el archivo.')
      setLoading(false)
    }
  }

  // ── Filtrado en tiempo real ──────────────────────────────────────
  const filteredRows = useMemo(() => {
    if (!allRows) return []
    // Mismo criterio que en el panel: sin acentos ni signos y por palabras,
    // mirando nombre y código. Antes era un includes sobre el nombre en
    // minúsculas, así que «a16» no encontraba «GALAXY A 16» y el código no
    // servía para buscar.
    return filtrarYBuscar({
      filas: allRows,
      busqueda: search,
      campos: r => [r[COL_PRODUCTO], r[COL_CODIGO]],
    })
  }, [allRows, search])

  // ── Estadísticas ─────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (!allRows) return { total: 0, units: 0, enStock: 0, limitado: 0, urgente: 0 }
    return {
      total:    allRows.length,
      units:    allRows.reduce((s, r) => s + (parseFloat(r[COL_EXISTENCIA]) || 0), 0),
      enStock:  allRows.filter(r => nivelStock(r[COL_EXISTENCIA]) === 'verde').length,
      limitado: allRows.filter(r => nivelStock(r[COL_EXISTENCIA]) === 'naranja').length,
      urgente:  allRows.filter(r => (parseFloat(r[COL_EXISTENCIA]) || 0) > 0 && nivelStock(r[COL_EXISTENCIA]) === 'urgente').length,
    }
  }, [allRows])

  // Días transcurridos desde la fecha del respaldo que se está mostrando.
  // Devuelve null si no hay fecha, para no inventar una antigüedad.
  const diasDeAntiguedad = useMemo(() => {
    const iso = origen?.respaldo?.fecha
    if (!iso) return null
    const [y, m, d] = iso.split('-').map(Number)
    if (!y || !m || !d) return null
    const hoy = new Date()
    const dato = new Date(y, m - 1, d)
    const soloDia = f => Date.UTC(f.getFullYear(), f.getMonth(), f.getDate())
    return Math.max(0, Math.round((soloDia(hoy) - soloDia(dato)) / 86400000))
  }, [origen])

  // Verde hasta un día, ámbar de dos a tres, rojo de cuatro en adelante.
  const colorAntiguedad = (dias) =>
    dias === null || dias <= 1 ? '#5E9422' : dias <= 3 ? '#B45309' : '#DC2626'

  // "2026-09-10" → "10 sep 2026" sin desfase de zona horaria
  const fmtFechaCorta = (iso) => {
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  const fmtDate = (d) =>
    d ? d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : ''

  // ── Render ───────────────────────────────────────────────────────
  return (
    <section className="marco py-10 sm:py-14">

      {/* ── Encabezado ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-7">
        <div>
          <h2 className="rotulo" style={{ fontSize: 'var(--step-head)', color: 'var(--ink)' }}>
            Inventario de la semana
          </h2>
          <p style={{ fontSize: 'var(--step-body)', color: 'var(--ink)', marginTop: 10, maxWidth: '44ch' }}>
            Elige la sucursal. Lo que ves es lo que había en la caja la última vez
            que se publicó.
          </p>
        </div>

        {/* Botón cargar — solo visible para usuarios autenticados de esta sucursal */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {lastUpdate && (
            <span className="text-xs hidden md:block" style={{ color: '#8598A1' }}>
              {fmtDate(lastUpdate)}
            </span>
          )}

          {canUpload(sucursal.slug) ? (
            <>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="boton-tinta"
              >
                <UploadIcon />
                {uploading ? 'Guardando…' : allRows ? 'Actualizar Excel' : 'Cargar Excel'}
              </button>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden"
                onChange={e => handleFileUpload(e.target.files[0])} />
            </>
          ) : (
            <button
              onClick={onLoginClick}
              className="boton-tono"
            >
              Acceso sucursales
            </button>
          )}
        </div>
      </div>

      {/* ── Tabs de sucursal ───────────────────────────────────── */}
      <div id="tabla-inventario" className="flex gap-2 flex-wrap mb-5" style={{ scrollMarginTop: 120 }}>
        {SUCURSALES.map(suc => {
          const isActive = sucursal.slug === suc.slug
          return (
            <button
              key={suc.slug}
              onClick={() => { setSucursal(suc); setSearch('') }}
              className={'plaza-pest' + (isActive ? ' activa' : '')}
            >
              {suc.name}
              {isActive && allRows && (
                <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.75 }}>({stats.total})</span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Buscador ───────────────────────────────────────────── */}
      {allRows && (
        <div className="relative mb-5" style={{ maxWidth: 480 }}>
          <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: 'rgba(0,0,0,0.28)', pointerEvents: 'none' }}>
            <SearchIcon />
          </span>
          <input
            ref={searchRef}
            type="text"
            placeholder={`Buscar entre ${stats.total} productos de ${sucursal.name}...`}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full text-sm outline-none"
            style={{
              backgroundColor: '#F4F7F8',
              border: '1.5px solid rgba(16,22,25,0.05)',
              borderRadius: '999px',
              padding: '11px 44px 11px 42px',
              color: '#101619',
              transition: 'border-color 0.15s, background 0.15s',
            }}
            onFocus={e => {
              e.target.style.borderColor = 'rgba(0,188,242,0.5)'
              e.target.style.backgroundColor = 'rgba(0,188,242,0.03)'
            }}
            onBlur={e => {
              e.target.style.borderColor = 'rgba(16,22,25,0.05)'
              e.target.style.backgroundColor = '#f7f8fa'
            }}
          />
          {search && (
            <button
              onClick={() => { setSearch(''); searchRef.current?.focus() }}
              style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(0,0,0,0.35)', fontSize: 18, lineHeight: 1, padding: '0 4px' }}
            >
              ×
            </button>
          )}
          {search && (
            <span style={{ position: 'absolute', right: 44, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#0288AD', fontWeight: 600, whiteSpace: 'nowrap' }}>
              {filteredRows.length} resultado{filteredRows.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      {/* ── Tarjeta de tabla ───────────────────────────────────── */}
      <div
        /* Un escalón de tono separa la tabla del fondo. Antes la despegaba una
           sombra, que es para lo que de verdad flota: menús, diálogos, barras
           pegadas. Una tabla quieta no flota. */
        style={{
          backgroundColor: '#ffffff',
          borderRadius: 18,
          overflow: 'hidden',
        }}
      >
        {/* Barra info superior */}
        {fileName && allRows && (
          <div
            className="flex items-center justify-between px-5 sm:px-6 py-3 flex-wrap gap-2"
            style={{ borderBottom: '1px solid rgba(16,22,25,0.05)', backgroundColor: 'rgba(0,188,242,0.04)' }}
          >
            {/* La antigüedad se avisa a la vista. Durante seis días el
                inventario se quedó congelado y nadie lo notó, porque la fecha
                se mostraba igual de discreta estuviera fresca o vieja. Un
                mayorista vendiendo con existencias de la semana pasada es el
                riesgo real de este sitio. */}
            <span className="text-sm font-semibold" style={{ color: colorAntiguedad(diasDeAntiguedad) }}>
              {diasDeAntiguedad !== null && diasDeAntiguedad >= 2 && '⚠ '}
              Última actualización: {origen?.respaldo?.fecha
                ? fmtFechaCorta(origen.respaldo.fecha)
                : lastUpdate ? fmtFechaCorta(lastUpdate.toISOString().slice(0, 10)) : '—'}
              {diasDeAntiguedad !== null && diasDeAntiguedad >= 2 && (
                <span style={{ fontWeight: 700 }}>
                  {' · hace '}{diasDeAntiguedad} días, confirma antes de vender
                </span>
              )}
            </span>
            {search && (
              <span className="text-sm" style={{ color: '#6C818B' }}>
                {filteredRows.length} de {stats.total}
              </span>
            )}
          </div>
        )}

        {/* ── Estado: cargando ── */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div style={{ fontSize: 36 }}>⏳</div>
            <p style={{ fontSize: 'var(--step-body)', color: 'var(--muted)' }}>Leyendo archivo…</p>
          </div>
        )}

        {/* ── Estado: sin inventario ── */}
        {error && !loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-5">
            <div style={{ textAlign: 'center' }}>
              <p className="rotulo" style={{ fontSize: 'var(--step-lead)', color: 'var(--ink)', marginBottom: 10 }}>
                Sin inventario de {sucursal.name}
              </p>
              <p style={{ fontSize: 'var(--step-body)', color: 'var(--ink)', maxWidth: '40ch', lineHeight: 1.6 }}>
                {canUpload(sucursal.slug)
                  ? <>Pulsa <strong style={{ color: 'var(--accent)' }}>Seleccionar archivo Excel</strong> y elige el archivo exportado de tu sistema para esta sucursal.</>
                  : <>El inventario de esta sucursal aún no ha sido cargado. Inicia sesión como sucursal para subir el archivo.</>
                }
              </p>
            </div>
            {canUpload(sucursal.slug) ? (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="boton-tinta"
              >
                <UploadIcon /> Seleccionar archivo Excel
              </button>
            ) : (
              <button
                onClick={onLoginClick}
                className="boton-tono"
              >
                Iniciar sesión
              </button>
            )}
          </div>
        )}

        {/* ── Sin resultados de búsqueda ── */}
        {allRows && !loading && filteredRows.length === 0 && search && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div style={{ fontSize: 36 }}>🔍</div>
            <p style={{ color: '#6C818B', fontSize: 14 }}>
              Sin resultados para <strong style={{ color: '#101619' }}>"{search}"</strong>
            </p>
            <button
              onClick={() => setSearch('')}
              style={{ fontSize: 13, color: '#0288AD', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
            >
              Limpiar búsqueda
            </button>
          </div>
        )}

        {/* ── Tabla ── */}
        {allRows && !loading && filteredRows.length > 0 && (
          <div style={{ overflowX: 'auto', maxHeight: 520, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                <tr style={{ backgroundColor: '#EAF0F2' }}>
                  <th style={{ width: 44, padding: '11px 14px', borderBottom: '1px solid rgba(16,22,25,0.05)', textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#B4C3C9', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    #
                  </th>
                  <th style={{ padding: '11px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#8598A1', borderBottom: '1px solid rgba(16,22,25,0.05)' }}>
                    Producto
                  </th>
                  <th style={{ padding: '11px 20px 11px 16px', textAlign: 'center', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#8598A1', borderBottom: '1px solid rgba(16,22,25,0.05)', whiteSpace: 'nowrap' }}>
                    Existencias
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, i) => (
                  <tr
                    key={i}
                    style={{
                      borderBottom: i < filteredRows.length - 1 ? '1px solid rgba(16,22,25,0.05)' : 'none',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#fafbfc')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <td style={{ padding: '11px 14px', textAlign: 'center', fontSize: 12, color: '#C6D3D8', fontVariantNumeric: 'tabular-nums' }}>
                      {i + 1}
                    </td>
                    <td style={{ padding: '11px 16px', fontSize: 13.5, color: '#101619', fontWeight: 500, lineHeight: 1.4 }}>
                      <HighlightText text={row[COL_PRODUCTO]} query={search} />
                    </td>
                    <td style={{ padding: '11px 20px 11px 16px', textAlign: 'center' }}>
                      <StockBadge value={row[COL_EXISTENCIA]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Leyenda ────────────────────────────────────────────── */}
      {allRows && allRows.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-4">
          <span className="text-xs font-bold tracking-wider uppercase" style={{ color: '#B4C3C9' }}>
            Leyenda:
          </span>
          {ETIQUETAS_LEYENDA.map(({ nivel, label }) => ({
            label,
            color: COLOR_NIVEL[nivel],
            count: nivel === 'verde' ? stats.enStock : nivel === 'naranja' ? stats.limitado : stats.urgente,
          })).map(item => (
            <div key={item.label} className="flex items-center gap-2">
              <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: item.color, display: 'inline-block', flexShrink: 0 }} />
              <span className="text-sm" style={{ color: '#6C818B' }}>{item.label}:</span>
              <span className="text-sm font-bold" style={{ color: '#2C3A40' }}>{item.count}</span>
            </div>
          ))}
          <div className="ml-auto text-sm" style={{ color: '#6C818B' }}>
            {search
              ? <><strong style={{ color: '#2C3A40' }}>{filteredRows.length}</strong> de {stats.total} productos</>
              : <><strong style={{ color: '#2C3A40' }}>{stats.total}</strong> modelos · <strong style={{ color: '#2C3A40' }}>{stats.units.toLocaleString()}</strong> unidades</>
            }
          </div>
        </div>
      )}
    </section>
  )
}
