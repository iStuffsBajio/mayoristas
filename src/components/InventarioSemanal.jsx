import { useState, useRef, useEffect, useMemo } from 'react'
import * as XLSX from 'xlsx'

const SUCURSALES = [
  { name: 'León',            slug: 'leon' },
  { name: 'San Luis Potosí', slug: 'san-luis' },
  { name: 'Aguascalientes',  slug: 'aguascalientes' },
  { name: 'Torreón',         slug: 'torreon' },
]

// Columnas exactas del sistema de inventario exportado
const COL_PRODUCTO   = 'Producto'
const COL_EXISTENCIA = 'Existencia'

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

function StockBadge({ value }) {
  const n = parseFloat(value) || 0
  const dot = (color) => (
    <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: color, display: 'inline-block', marginLeft: 5 }} />
  )
  if (n >= 20) return <span style={{ color: '#16a34a', fontWeight: 700, display: 'inline-flex', alignItems: 'center' }}>{n}{dot('#16a34a')}</span>
  if (n >= 10) return <span style={{ color: '#d97706', fontWeight: 700, display: 'inline-flex', alignItems: 'center' }}>{n}{dot('#d97706')}</span>
  if (n > 0)   return <span style={{ color: '#D51A7A', fontWeight: 700 }}>{n} ⚡</span>
  return <span style={{ color: '#bbb', fontWeight: 500 }}>—</span>
}

function HighlightText({ text, query }) {
  if (!query) return <>{text}</>
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ backgroundColor: 'rgba(0,188,242,0.18)', color: '#007aad', borderRadius: 3, padding: '0 2px', fontWeight: 700, fontStyle: 'normal' }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  )
}

// ─── Componente principal ────────────────────────────────────────

export default function InventarioSemanal() {
  const [sucursal, setSucursal]     = useState(SUCURSALES[0])
  const [allRows, setAllRows]       = useState(null)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState(null)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [fileName, setFileName]     = useState(null)
  const [search, setSearch]         = useState('')
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
      .map(r => ({
        [COL_PRODUCTO]:   String(r[COL_PRODUCTO]).trim(),
        [COL_EXISTENCIA]: r[COL_EXISTENCIA],
      }))
  }

  const applyRows = (rows, name) => {
    setAllRows(rows)
    setLastUpdate(new Date())
    setFileName(name)
    setSearch('')
    setError(null)
    setLoading(false)
  }

  const tryAutoLoad = async (suc) => {
    setLoading(true)
    setError(null)
    setAllRows(null)
    setFileName(null)
    try {
      const res = await fetch(`/inventarios/${suc.slug}/inventario.xlsx`, { cache: 'no-store' })
      if (!res.ok) throw new Error()
      const buf = await res.arrayBuffer()
      const wb  = XLSX.read(buf, { type: 'array' })
      const rows = parseWorkbook(wb)
      if (rows.length === 0) throw new Error()
      applyRows(rows, 'inventario.xlsx')
    } catch {
      setError(`${suc.name}`)
      setLoading(false)
    }
  }

  const handleFileUpload = (file) => {
    if (!file) return
    setLoading(true)
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb   = XLSX.read(e.target.result, { type: 'array' })
        const rows = parseWorkbook(wb)
        applyRows(rows, file.name)
      } catch {
        setError('No se pudo leer el archivo. Asegúrate de que sea un Excel válido.')
        setLoading(false)
      }
    }
    reader.readAsArrayBuffer(file)
    // reset input so same file can be re-selected
    fileInputRef.current.value = ''
  }

  // ── Filtrado en tiempo real ──────────────────────────────────────
  const filteredRows = useMemo(() => {
    if (!allRows) return []
    const q = search.trim().toLowerCase()
    if (!q) return allRows
    return allRows.filter(r => r[COL_PRODUCTO].toLowerCase().includes(q))
  }, [allRows, search])

  // ── Estadísticas ─────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (!allRows) return { total: 0, units: 0, enStock: 0, limitado: 0, urgente: 0 }
    return {
      total:    allRows.length,
      units:    allRows.reduce((s, r) => s + (parseFloat(r[COL_EXISTENCIA]) || 0), 0),
      enStock:  allRows.filter(r => (parseFloat(r[COL_EXISTENCIA]) || 0) >= 20).length,
      limitado: allRows.filter(r => { const n = parseFloat(r[COL_EXISTENCIA]) || 0; return n >= 10 && n < 20 }).length,
      urgente:  allRows.filter(r => (parseFloat(r[COL_EXISTENCIA]) || 0) < 10 && (parseFloat(r[COL_EXISTENCIA]) || 0) > 0).length,
    }
  }, [allRows])

  const fmtDate = (d) =>
    d ? d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : ''

  // ── Render ───────────────────────────────────────────────────────
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-14">

      {/* ── Encabezado ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-7">
        <div>
          <p className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: '#00BCF2' }}>
            Inventario Semanal
          </p>
          <h2 className="text-3xl sm:text-4xl font-black" style={{ color: '#0A0A0A' }}>
            Modelos y Existencias
          </h2>
          <p className="text-sm mt-1" style={{ color: '#888' }}>
            Selecciona la sucursal y carga el archivo Excel exportado
          </p>
        </div>

        {/* Botón cargar */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {lastUpdate && (
            <span className="text-xs hidden md:block" style={{ color: '#aaa' }}>
              {fmtDate(lastUpdate)}
            </span>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white transition-all"
            style={{
              background: 'linear-gradient(135deg, #D51A7A, #FF6B1A)',
              borderRadius: '999px',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 4px 20px rgba(213,26,122,0.3)',
            }}
            onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.04)')}
            onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
          >
            <UploadIcon />
            {allRows ? 'Actualizar Excel' : 'Cargar Excel'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={e => handleFileUpload(e.target.files[0])}
          />
        </div>
      </div>

      {/* ── Tabs de sucursal ───────────────────────────────────── */}
      <div className="flex gap-2 flex-wrap mb-5">
        {SUCURSALES.map(suc => {
          const isActive = sucursal.slug === suc.slug
          return (
            <button
              key={suc.slug}
              onClick={() => { setSucursal(suc); setSearch('') }}
              className="px-5 py-2.5 text-sm font-semibold transition-all"
              style={
                isActive
                  ? { background: 'linear-gradient(135deg, #00BCF2, #8DC63F)', borderRadius: '999px', color: 'white', border: 'none', cursor: 'pointer', boxShadow: '0 4px 16px rgba(0,188,242,0.25)' }
                  : { backgroundColor: 'rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.09)', borderRadius: '999px', color: '#555', cursor: 'pointer', background: 'none' }
              }
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.09)' }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)' }}
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
              backgroundColor: '#f7f8fa',
              border: '1.5px solid rgba(0,0,0,0.09)',
              borderRadius: '999px',
              padding: '11px 44px 11px 42px',
              color: '#0A0A0A',
              transition: 'border-color 0.15s, background 0.15s',
            }}
            onFocus={e => {
              e.target.style.borderColor = 'rgba(0,188,242,0.5)'
              e.target.style.backgroundColor = 'rgba(0,188,242,0.03)'
            }}
            onBlur={e => {
              e.target.style.borderColor = 'rgba(0,0,0,0.09)'
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
            <span style={{ position: 'absolute', right: 44, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#00BCF2', fontWeight: 600, whiteSpace: 'nowrap' }}>
              {filteredRows.length} resultado{filteredRows.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      {/* ── Tarjeta de tabla ───────────────────────────────────── */}
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '24px',
          border: '1px solid rgba(0,0,0,0.08)',
          overflow: 'hidden',
          boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
        }}
      >
        {/* Barra info superior */}
        {fileName && allRows && (
          <div
            className="flex items-center justify-between px-5 sm:px-6 py-3 flex-wrap gap-2"
            style={{ borderBottom: '1px solid rgba(0,0,0,0.07)', backgroundColor: 'rgba(0,188,242,0.04)' }}
          >
            <span className="text-sm font-semibold" style={{ color: '#00BCF2' }}>
              📊 {fileName}
              {search
                ? ` · Mostrando ${filteredRows.length} de ${stats.total}`
                : ` · ${stats.total} modelos`}
            </span>
            <span className="text-sm" style={{ color: '#666' }}>
              {stats.units.toLocaleString()} unidades · {sucursal.name}
            </span>
          </div>
        )}

        {/* ── Estado: cargando ── */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div style={{ fontSize: 36 }}>⏳</div>
            <p style={{ fontSize: 14, color: '#aaa' }}>Leyendo archivo...</p>
          </div>
        )}

        {/* ── Estado: sin inventario ── */}
        {error && !loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-5">
            <div style={{ fontSize: 44 }}>📂</div>
            <div style={{ textAlign: 'center' }}>
              <p className="font-semibold mb-1" style={{ color: '#333', fontSize: 15 }}>
                Sin inventario cargado — {sucursal.name}
              </p>
              <p style={{ fontSize: 13, color: '#aaa', maxWidth: 340, lineHeight: 1.6 }}>
                Haz clic en <strong style={{ color: '#D51A7A' }}>Cargar Excel</strong> y selecciona el archivo
                exportado de tu sistema para esta sucursal.
                <br />
                <span style={{ fontSize: 12 }}>
                  También puedes nombrarlo <code style={{ backgroundColor: '#f0f0f0', padding: '1px 5px', borderRadius: 4, fontFamily: 'monospace' }}>inventario.xlsx</code> y colocarlo en{' '}
                  <code style={{ backgroundColor: '#f0f0f0', padding: '1px 5px', borderRadius: 4, fontFamily: 'monospace' }}>public/inventarios/{sucursal.slug}/</code>
                </span>
              </p>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-6 py-3 font-semibold text-white text-sm"
              style={{ background: 'linear-gradient(135deg, #D51A7A, #FF6B1A)', borderRadius: '999px', border: 'none', cursor: 'pointer', boxShadow: '0 4px 16px rgba(213,26,122,0.28)' }}
            >
              <UploadIcon /> Seleccionar archivo Excel
            </button>
          </div>
        )}

        {/* ── Sin resultados de búsqueda ── */}
        {allRows && !loading && filteredRows.length === 0 && search && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div style={{ fontSize: 36 }}>🔍</div>
            <p style={{ color: '#888', fontSize: 14 }}>
              Sin resultados para <strong style={{ color: '#0A0A0A' }}>"{search}"</strong>
            </p>
            <button
              onClick={() => setSearch('')}
              style={{ fontSize: 13, color: '#00BCF2', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
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
                <tr style={{ backgroundColor: '#f8f9fa' }}>
                  <th style={{ width: 44, padding: '11px 14px', borderBottom: '1px solid rgba(0,0,0,0.08)', textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#ccc', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    #
                  </th>
                  <th style={{ padding: '11px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#999', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
                    Producto
                  </th>
                  <th style={{ padding: '11px 20px 11px 16px', textAlign: 'center', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#999', borderBottom: '1px solid rgba(0,0,0,0.08)', whiteSpace: 'nowrap' }}>
                    Existencias
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, i) => (
                  <tr
                    key={i}
                    style={{
                      borderBottom: i < filteredRows.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#fafbfc')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <td style={{ padding: '11px 14px', textAlign: 'center', fontSize: 12, color: '#ddd', fontVariantNumeric: 'tabular-nums' }}>
                      {i + 1}
                    </td>
                    <td style={{ padding: '11px 16px', fontSize: 13.5, color: '#0A0A0A', fontWeight: 500, lineHeight: 1.4 }}>
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
          <span className="text-xs font-bold tracking-wider uppercase" style={{ color: '#ccc' }}>
            Leyenda:
          </span>
          {[
            { label: 'En stock (≥ 20)',   count: stats.enStock,  color: '#16a34a' },
            { label: 'Limitado (10–19)',  count: stats.limitado, color: '#d97706' },
            { label: 'Urgente (< 10)',    count: stats.urgente,  color: '#D51A7A' },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-2">
              <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: item.color, display: 'inline-block', flexShrink: 0 }} />
              <span className="text-sm" style={{ color: '#888' }}>{item.label}:</span>
              <span className="text-sm font-bold" style={{ color: '#333' }}>{item.count}</span>
            </div>
          ))}
          <div className="ml-auto text-sm" style={{ color: '#888' }}>
            {search
              ? <><strong style={{ color: '#333' }}>{filteredRows.length}</strong> de {stats.total} productos</>
              : <><strong style={{ color: '#333' }}>{stats.total}</strong> modelos · <strong style={{ color: '#333' }}>{stats.units.toLocaleString()}</strong> unidades</>
            }
          </div>
        </div>
      )}
    </section>
  )
}
