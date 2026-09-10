import { useState, useRef, useEffect, useMemo } from 'react'
import GaleriaDropbox from './GaleriaDropbox'
import { useSiteConfig } from '../context/SiteConfigContext'
import { loadInventarioJson, s3Configured } from '../lib/s3'
import { uploadStikerDropbox, dropboxConfigured } from '../lib/dropbox'
import { SUCURSALES, telefonoWhatsApp } from '../lib/sucursales'

// ── Iconos ────────────────────────────────────────────────────────────────────

const UploadIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" />
    <path d="m21 15-5-5L5 21" />
  </svg>
)

const SearchIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
  </svg>
)

const WhatsAppIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.558 4.122 1.532 5.86L.078 23.561a.5.5 0 0 0 .612.612l5.701-1.454A11.94 11.94 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.907 0-3.693-.502-5.236-1.379l-.374-.216-3.884.991.991-3.884-.216-.374A9.96 9.96 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
  </svg>
)

// ── Mockup del celular ────────────────────────────────────────────────────────

function PhoneMockup({ preview, modelo }) {
  return (
    <div style={{ position: 'relative', width: 200, margin: '0 auto' }}>
      <div style={{ position: 'relative', width: 200, height: 400 }}>
        {preview && (
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle, rgba(213,26,122,0.18) 0%, transparent 70%)', filter: 'blur(32px)', transform: 'scale(1.3)', zIndex: 0 }} />
        )}
        <div style={{ position: 'relative', zIndex: 1, width: 200, height: 400 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg, #2e2e2e, #111)', borderRadius: 42, border: '2.5px solid rgba(255,255,255,0.12)', boxShadow: '0 40px 80px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.08)' }} />
          <div style={{ position: 'absolute', top: 8, left: 8, right: 8, bottom: 8, borderRadius: 36, overflow: 'hidden', backgroundColor: '#000' }}>
            {preview
              ? <img src={preview.url} alt="Vista previa de la funda" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'linear-gradient(135deg, #0a0a0a, #181818)' }}>
                  <span style={{ fontSize: 52, fontWeight: 900, lineHeight: 1, background: 'linear-gradient(135deg, #00BCF2, #8DC63F)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>iS</span>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', fontWeight: 500 }}>Selecciona un diseño</span>
                </div>
            }
          </div>
          <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', width: 88, height: 26, backgroundColor: '#000', borderRadius: '0 0 20px 20px', zIndex: 10 }} />
          <div style={{ position: 'absolute', left: -4, top: 80,  width: 4, height: 28, backgroundColor: '#2a2a2a', borderRadius: '4px 0 0 4px' }} />
          <div style={{ position: 'absolute', left: -4, top: 120, width: 4, height: 44, backgroundColor: '#2a2a2a', borderRadius: '4px 0 0 4px' }} />
          <div style={{ position: 'absolute', left: -4, top: 176, width: 4, height: 44, backgroundColor: '#2a2a2a', borderRadius: '4px 0 0 4px' }} />
          <div style={{ position: 'absolute', right: -4, top: 110, width: 4, height: 72, backgroundColor: '#2a2a2a', borderRadius: '0 4px 4px 0' }} />
          {preview && (
            <div style={{ position: 'absolute', inset: 0, borderRadius: 42, background: 'linear-gradient(to bottom, transparent 55%, rgba(0,0,0,0.35) 100%)', pointerEvents: 'none' }} />
          )}
        </div>
      </div>
      {modelo && (
        <p style={{ textAlign: 'center', marginTop: 14, fontSize: 12, fontWeight: 700, color: '#555', lineHeight: 1.4 }}>
          {modelo.producto}
        </p>
      )}
    </div>
  )
}

// ── Piezas de interfaz ────────────────────────────────────────────────────────

const inp = {
  width: '100%', padding: '11px 16px', borderRadius: 14, border: '1.5px solid rgba(0,0,0,0.1)',
  backgroundColor: '#f7f8fa', fontSize: 14, color: '#0A0A0A', outline: 'none',
  fontFamily: 'inherit', transition: 'border-color 0.15s', boxSizing: 'border-box',
}
const fp = e => { e.target.style.borderColor = 'rgba(213,26,122,0.5)'; e.target.style.backgroundColor = 'rgba(213,26,122,0.02)' }
const bl = e => { e.target.style.borderColor = 'rgba(0,0,0,0.1)'; e.target.style.backgroundColor = '#f7f8fa' }

const Field = ({ label, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
    <label style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</label>
    {children}
  </div>
)

function Paso({ n, titulo, hecho, ultimo, children }) {
  return (
    <div style={{ display: 'flex', gap: 14 }}>
      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: 'white', background: hecho ? 'linear-gradient(135deg,#00BCF2,#8DC63F)' : 'rgba(0,0,0,0.18)', transition: 'background 0.25s' }}>
          {hecho ? '✓' : n}
        </div>
        {!ultimo && <div style={{ flex: 1, width: 2, backgroundColor: 'rgba(0,0,0,0.07)', marginTop: 6, minHeight: 8 }} />}
      </div>
      <div style={{ flex: 1, paddingBottom: 26, minWidth: 0 }}>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0A0A0A', margin: '4px 0 12px' }}>{titulo}</h3>
        {children}
      </div>
    </div>
  )
}

// Mismo indicador de existencias que la pestaña de Consulta de Inventario
function StockBadge({ value }) {
  const n = parseFloat(value) || 0
  const dot = color => (
    <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: color, display: 'inline-block', marginLeft: 5 }} />
  )
  if (n >= 20) return <span style={{ color: '#16a34a', fontWeight: 700, display: 'inline-flex', alignItems: 'center', fontSize: 13 }}>{n}{dot('#16a34a')}</span>
  if (n >= 10) return <span style={{ color: '#d97706', fontWeight: 700, display: 'inline-flex', alignItems: 'center', fontSize: 13 }}>{n}{dot('#d97706')}</span>
  return <span style={{ color: '#D51A7A', fontWeight: 700, fontSize: 13 }}>{n} ⚡</span>
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function Personalizer() {
  const { config } = useSiteConfig()

  const [sucursal, setSucursal]   = useState(SUCURSALES[0])
  const [modelos, setModelos]     = useState(null)
  const [cargando, setCargando]   = useState(false)
  const [errorInv, setErrorInv]   = useState(null)
  const [busca, setBusca]         = useState('')
  const [modelo, setModelo]       = useState(null)
  const [preview, setPreview]     = useState(null)
  const [imageFile, setImageFile] = useState(null)
  const [dragging, setDragging]   = useState(false)
  const [form, setForm]           = useState({ nombre: '', cantidad: '1', mayorista: false, registro: '', notas: '' })
  const [subiendo, setSubiendo]   = useState(false)
  const [enviado, setEnviado]     = useState(false)
  const [aviso, setAviso]         = useState('')
  const inputRef                  = useRef(null)

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  // Al cambiar de sucursal, carga su inventario ya sincronizado desde S3
  useEffect(() => {
    let cancelado = false
    setCargando(true); setErrorInv(null); setModelos(null); setModelo(null); setBusca('')
    ;(async () => {
      try {
        if (!s3Configured) throw new Error('sin-s3')
        const data = await loadInventarioJson(sucursal.slug)
        if (cancelado) return
        if (!data) { setErrorInv('sin-inventario'); return }
        setModelos({
          fecha: data.respaldo?.fecha || null,
          // Solo se puede pedir lo que existe: se descartan los agotados
          items: data.productos
            .map(p => ({ producto: String(p.Producto).trim(), stock: Number(p.Existencia) || 0 }))
            .filter(m => m.stock >= 1),
          totalCatalogo: data.productos.length,
        })
      } catch {
        if (!cancelado) setErrorInv('sin-inventario')
      } finally {
        if (!cancelado) setCargando(false)
      }
    })()
    return () => { cancelado = true }
  }, [sucursal])

  const modelosFiltrados = useMemo(() => {
    if (!modelos) return []
    const q = busca.trim().toLowerCase()
    const base = q ? modelos.items.filter(m => m.producto.toLowerCase().includes(q)) : modelos.items
    return base.slice(0, 60)
  }, [modelos, busca])

  const handleFile = file => {
    if (!file?.type.startsWith('image/')) return
    const r = new FileReader()
    r.onload = e => setPreview({ url: e.target.result, name: file.name })
    r.readAsDataURL(file)
    setImageFile(file)
  }

  const numeroSucursal = telefonoWhatsApp(config.whatsapp?.[sucursal.slug]) || telefonoWhatsApp(config.whatsapp?.general)
  const usaGeneral     = !telefonoWhatsApp(config.whatsapp?.[sucursal.slug])

  const completo = modelo && preview && form.nombre && form.cantidad && numeroSucursal

  const handleSubmit = async e => {
    e.preventDefault()
    if (!completo) return
    setSubiendo(true); setAviso('')

    let ruta = ''
    try {
      if (imageFile && dropboxConfigured) {
        ruta = await uploadStikerDropbox(sucursal.slug, imageFile, form.nombre)
      }
    } catch (err) {
      setAviso('No se pudo guardar la imagen en Dropbox. El pedido se envía sin ella, adjúntala en el chat.')
      console.error(err)
    }
    setSubiendo(false)

    const msg = [
      '📱 *PEDIDO FUNDA PERSONALIZADA - iStuffs*',
      '',
      `🏪 *Sucursal:* ${sucursal.nombre}`,
      `📱 *Modelo:* ${modelo.producto}`,
      `📦 *Existencia al momento del pedido:* ${modelo.stock}`,
      '',
      `👤 *Cliente:* ${form.nombre}`,
      `🔢 *Cantidad:* ${form.cantidad} pieza(s)`,
      form.mayorista
        ? `🏷️ *Mayorista:* Sí${form.registro.trim() ? ` · Registro: ${form.registro.trim()}` : ''}`
        : '🏷️ *Mayorista:* No',
      form.notas.trim() ? `📝 *Notas:* ${form.notas.trim()}` : '',
      '',
      preview?.name && !imageFile ? `🖼️ *Diseño del catálogo:* ${preview.name.replace(/\.[^.]+$/, '')}` : '',
      ruta ? `📁 *Imagen en Dropbox:* ${ruta}` : imageFile ? '📎 *Imagen:* Adjuntar en este chat' : '',
    ].filter(Boolean).join('\n')

    window.open(`https://wa.me/${numeroSucursal}?text=${encodeURIComponent(msg)}`, '_blank')
    setEnviado(true)
    setTimeout(() => setEnviado(false), 6000)
  }

  const carpetaFundas = config.dropboxCatalogos?.fundas || ''
  const agotados = modelos ? modelos.totalCatalogo - modelos.items.length : 0

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <div className="mb-8">
        <p className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: '#D51A7A' }}>Diseña tu funda</p>
        <h2 className="text-3xl sm:text-4xl font-black mb-1" style={{ color: '#0A0A0A' }}>Arma tu pedido en 4 pasos</h2>
        <p className="text-sm" style={{ color: '#888' }}>
          Elige sucursal y modelo con existencia real, escoge el diseño y el pedido llega directo al WhatsApp de esa sucursal.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-10 items-start">

        {/* ── Vista previa, columna izquierda ── */}
        <div className="lg:col-span-2" style={{ position: 'sticky', top: 120 }}>
          <PhoneMockup preview={preview} modelo={modelo} />
        </div>

        {/* ── Pasos, columna derecha ── */}
        <form onSubmit={handleSubmit} className="lg:col-span-3">

          {/* Paso 1 — Sucursal, mismas pestañas que Consulta de Inventario */}
          <Paso n={1} titulo="¿A qué sucursal va el pedido?" hecho={!!sucursal}>
            <div className="flex gap-2 flex-wrap">
              {SUCURSALES.map(s => {
                const isActive = sucursal.slug === s.slug
                return (
                  <button key={s.slug} type="button" onClick={() => setSucursal(s)}
                    className="px-5 py-2.5 text-sm font-semibold transition-all"
                    style={
                      isActive
                        ? { background: 'linear-gradient(135deg, #00BCF2, #8DC63F)', borderRadius: '999px', color: 'white', border: 'none', cursor: 'pointer', boxShadow: '0 4px 16px rgba(0,188,242,0.25)' }
                        : { backgroundColor: 'rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.09)', borderRadius: '999px', color: '#555', cursor: 'pointer', background: 'none' }
                    }
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.09)' }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)' }}>
                    {s.nombre}
                    {isActive && modelos && (
                      <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.75 }}>({modelos.items.length})</span>
                    )}
                  </button>
                )
              })}
            </div>
            {usaGeneral && (
              <p style={{ fontSize: 11, color: '#d97706', marginTop: 10 }}>
                ⚠ Esta sucursal no tiene WhatsApp propio configurado. El pedido irá al número general.
              </p>
            )}
          </Paso>

          {/* Paso 2 — Modelo, solo con existencia */}
          <Paso n={2} titulo="Elige el modelo disponible" hecho={!!modelo}>
            {cargando && <p style={{ fontSize: 13, color: '#aaa' }}>⏳ Cargando existencias de {sucursal.nombre}...</p>}

            {!cargando && errorInv && (
              <div style={{ padding: '14px 16px', borderRadius: 14, background: 'rgba(213,26,122,0.05)', border: '1px solid rgba(213,26,122,0.15)' }}>
                <p style={{ fontSize: 13, color: '#D51A7A', fontWeight: 600, margin: 0 }}>Sin inventario disponible para {sucursal.nombre}</p>
                <p style={{ fontSize: 12, color: '#888', margin: '4px 0 0' }}>
                  Esta sucursal aún no sincroniza su respaldo. Elige otra sucursal o comunícate directamente.
                </p>
              </div>
            )}

            {modelos && !cargando && modelos.items.length === 0 && (
              <p style={{ fontSize: 13, color: '#D51A7A' }}>No hay modelos con existencia en {sucursal.nombre} en este momento.</p>
            )}

            {modelos && !cargando && modelos.items.length > 0 && (
              <>
                <div style={{ position: 'relative', marginBottom: 10 }}>
                  <span style={{ position: 'absolute', left: 15, top: '50%', transform: 'translateY(-50%)', color: 'rgba(0,0,0,0.28)', pointerEvents: 'none' }}><SearchIcon /></span>
                  <input value={busca} onChange={e => setBusca(e.target.value)}
                    placeholder={`Buscar entre ${modelos.items.length} modelos disponibles...`}
                    style={{ ...inp, padding: '11px 16px 11px 40px' }} onFocus={fp} onBlur={bl} />
                </div>

                {modelo && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 12, background: 'rgba(0,188,242,0.07)', border: '1px solid rgba(0,188,242,0.2)', marginBottom: 10 }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: '#00BCF2', margin: 0 }}>Modelo elegido</p>
                      <p style={{ fontSize: 13, color: '#333', margin: 0, fontWeight: 600 }}>{modelo.producto}</p>
                    </div>
                    <StockBadge value={modelo.stock} />
                    <button type="button" onClick={() => setModelo(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#00BCF2', fontSize: 18, lineHeight: 1 }}>×</button>
                  </div>
                )}

                <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 14 }}>
                  {modelosFiltrados.length === 0 && (
                    <p style={{ fontSize: 13, color: '#bbb', padding: '18px 16px', textAlign: 'center' }}>Sin resultados para "{busca}"</p>
                  )}
                  {modelosFiltrados.map((m, i) => (
                    <button key={m.producto + i} type="button" onClick={() => setModelo(m)}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '11px 16px', background: modelo?.producto === m.producto ? 'rgba(0,188,242,0.06)' : 'none', border: 'none', borderBottom: i < modelosFiltrados.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}
                      onMouseEnter={e => { if (modelo?.producto !== m.producto) e.currentTarget.style.backgroundColor = '#fafbfc' }}
                      onMouseLeave={e => { if (modelo?.producto !== m.producto) e.currentTarget.style.backgroundColor = 'transparent' }}>
                      <span style={{ fontSize: 13.5, color: '#0A0A0A', fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.producto}</span>
                      <StockBadge value={m.stock} />
                    </button>
                  ))}
                </div>

                <p style={{ fontSize: 11, color: '#bbb', marginTop: 8, lineHeight: 1.6 }}>
                  {modelosFiltrados.length === 60 && modelos.items.length > 60
                    ? `Mostrando 60 de ${modelos.items.length}. Escribe para filtrar. ` : ''}
                  {modelos.fecha ? `Existencias del respaldo del ${modelos.fecha}. ` : ''}
                  {agotados > 0 ? `Se ocultaron ${agotados} modelos sin existencia.` : ''}
                </p>
              </>
            )}
          </Paso>

          {/* Paso 3 — Diseño */}
          <Paso n={3} titulo="Elige el diseño" hecho={!!preview}>
            <GaleriaDropbox
              folderPath={carpetaFundas}
              seleccionado={preview}
              onSelect={item => { setPreview(item); setImageFile(null) }}
              label="Diseños de funda"
            />

            <div style={{ marginTop: 12 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>O elige una imagen de tu galería</p>
              <div
                onClick={() => inputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]) }}
                style={{ padding: '14px', borderRadius: 14, cursor: 'pointer', border: `2px dashed ${dragging ? '#D51A7A' : 'rgba(0,0,0,0.12)'}`, backgroundColor: dragging ? 'rgba(213,26,122,0.04)' : 'rgba(0,0,0,0.02)', display: 'flex', alignItems: 'center', gap: 12, transition: 'all 0.15s' }}>
                <span style={{ color: '#D51A7A', flexShrink: 0 }}><UploadIcon /></span>
                <div style={{ textAlign: 'left', minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#333', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {imageFile ? '✓ ' + imageFile.name : 'Abrir mi galería de fotos'}
                  </p>
                  <p style={{ fontSize: 11, color: '#bbb', margin: 0 }}>PNG, JPG · Máx 10 MB</p>
                </div>
              </div>
              <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
            </div>
          </Paso>

          {/* Paso 4 — Datos y envío */}
          <Paso n={4} titulo="Tus datos y envío del pedido" hecho={enviado} ultimo>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* El teléfono no se pide: el pedido llega por WhatsApp, así que la
                  sucursal ya ve desde qué número escribe el cliente. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Nombre del cliente">
                  <input value={form.nombre} onChange={set('nombre')} placeholder="Ej. Juan Pérez" style={inp} onFocus={fp} onBlur={bl} />
                </Field>
                <Field label="Cantidad">
                  <input value={form.cantidad} onChange={set('cantidad')} type="number" min="1" style={inp} onFocus={fp} onBlur={bl} />
                </Field>
              </div>

              {/* Registro de mayorista */}
              <div style={{ padding: '14px 16px', borderRadius: 14, border: `1.5px solid ${form.mayorista ? 'rgba(0,188,242,0.35)' : 'rgba(0,0,0,0.1)'}`, background: form.mayorista ? 'rgba(0,188,242,0.04)' : '#f7f8fa', transition: 'all 0.2s' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                  <div
                    onClick={() => setForm(f => ({ ...f, mayorista: !f.mayorista }))}
                    style={{ width: 42, height: 24, borderRadius: 999, background: form.mayorista ? 'linear-gradient(135deg,#00BCF2,#8DC63F)' : 'rgba(0,0,0,0.15)', position: 'relative', transition: 'all 0.2s', flexShrink: 0 }}>
                    <div style={{ position: 'absolute', top: 2, left: form.mayorista ? 20 : 2, width: 20, height: 20, borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
                  </div>
                  <div>
                    <p style={{ fontSize: 13.5, fontWeight: 700, color: '#0A0A0A', margin: 0 }}>¿Cuentas con registro de mayorista?</p>
                    <p style={{ fontSize: 11.5, color: '#999', margin: 0 }}>Para aplicar precio y condiciones de mayoreo.</p>
                  </div>
                </label>

                {form.mayorista && (
                  <div style={{ marginTop: 12 }}>
                    <Field label="Número o nombre de registro (opcional)">
                      <input value={form.registro} onChange={set('registro')} placeholder="Ej. MAY-0412 o nombre del negocio"
                        style={{ ...inp, backgroundColor: '#fff' }} onFocus={fp} onBlur={bl} />
                    </Field>
                  </div>
                )}
              </div>

              <Field label="Notas del pedido (opcional)">
                <textarea value={form.notas} onChange={set('notas')} rows={3}
                  placeholder="Día específico en que lo necesitas, forma de entrega, condiciones de mayoreo o cualquier detalle adicional..."
                  style={{ ...inp, resize: 'vertical', minHeight: 80, lineHeight: 1.6 }} onFocus={fp} onBlur={bl} />
              </Field>

              {aviso && <p style={{ fontSize: 12, color: '#d97706' }}>⚠ {aviso}</p>}

              {!numeroSucursal && (
                <p style={{ fontSize: 12, color: '#D51A7A', fontWeight: 600 }}>
                  ⚠ No hay número de WhatsApp configurado para {sucursal.nombre}. Pide al administrador que lo capture en el panel.
                </p>
              )}

              <button type="submit" disabled={!completo || subiendo}
                style={{ width: '100%', padding: '14px 0', borderRadius: 999, border: 'none', fontSize: 15, fontWeight: 700, cursor: completo && !subiendo ? 'pointer' : 'default', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, transition: 'all 0.2s', background: completo && !subiendo ? 'linear-gradient(135deg,#25D366,#128C7E)' : 'rgba(0,0,0,0.07)', color: completo && !subiendo ? 'white' : 'rgba(0,0,0,0.28)', boxShadow: completo && !subiendo ? '0 6px 20px rgba(37,211,102,0.3)' : 'none' }}
                onMouseEnter={e => { if (completo && !subiendo) e.currentTarget.style.transform = 'scale(1.02)' }}
                onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}>
                <WhatsAppIcon />
                {subiendo ? 'Guardando imagen...' : enviado ? '¡Pedido enviado! 🎉' : `Enviar a ${sucursal.nombre} por WhatsApp`}
              </button>

              {!completo && !enviado && (
                <p style={{ fontSize: 11, color: '#bbb', textAlign: 'center', marginTop: -6 }}>
                  Completa modelo, diseño y nombre para enviar.
                </p>
              )}
            </div>
          </Paso>
        </form>
      </div>
    </section>
  )
}
