import { useState, useRef } from 'react'
import { uploadStikerDropbox, dropboxConfigured } from '../lib/dropbox'
import GaleriaCatalogo from './GaleriaCatalogo'

const WHATSAPP   = '5213315381571'
const SUCURSALES = ['León', 'San Luis Potosí', 'Aguascalientes', 'Torreón']
const TAMANIOS   = ['Pequeño (5×5 cm)', 'Mediano (10×10 cm)', 'Grande (15×15 cm)', 'Personalizado']
const SLUG_MAP   = { 'León': 'leon', 'San Luis Potosí': 'san-luis', 'Aguascalientes': 'aguascalientes', 'Torreón': 'torreon' }

// Tipo de galería por sub-tab
const GALERIA_TIPO = { funda: 'stiker-fundas', personalizado: 'personalizados' }

const WhatsAppIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.558 4.122 1.532 5.86L.078 23.561a.5.5 0 0 0 .612.612l5.701-1.454A11.94 11.94 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.907 0-3.693-.502-5.236-1.379l-.374-.216-3.884.991.991-3.884-.216-.374A9.96 9.96 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
  </svg>
)

const UploadIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
)

function PhoneMockup({ preview }) {
  return (
    <div style={{ position: 'relative', width: 180, height: 360 }}>
      {preview && (
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle, rgba(213,26,122,0.2) 0%, transparent 70%)', filter: 'blur(32px)', transform: 'scale(1.4)', zIndex: 0 }} />
      )}
      <div style={{ position: 'relative', zIndex: 1, width: 180, height: 360 }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg,#2e2e2e,#111)', borderRadius: 40, border: '2.5px solid rgba(255,255,255,0.12)', boxShadow: '0 30px 60px rgba(0,0,0,0.2)' }} />
        <div style={{ position: 'absolute', top: 8, left: 8, right: 8, bottom: 8, borderRadius: 34, overflow: 'hidden', backgroundColor: '#000' }}>
          {preview
            ? <img src={preview.url} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'linear-gradient(135deg,#f7f8fa,#ececec)' }}>
                <span style={{ fontSize: 32 }}>🏷️</span>
                <span style={{ fontSize: 10, color: '#aaa', fontWeight: 600, textAlign: 'center', padding: '0 12px' }}>Selecciona un ejemplo o sube tu imagen</span>
              </div>
          }
        </div>
        <div style={{ position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)', width: 72, height: 22, backgroundColor: '#000', borderRadius: '0 0 16px 16px', zIndex: 10 }} />
        <div style={{ position: 'absolute', left: -3, top: 72, width: 3, height: 24, backgroundColor: '#2a2a2a', borderRadius: '3px 0 0 3px' }} />
        <div style={{ position: 'absolute', left: -3, top: 108, width: 3, height: 40, backgroundColor: '#2a2a2a', borderRadius: '3px 0 0 3px' }} />
        <div style={{ position: 'absolute', right: -3, top: 100, width: 3, height: 64, backgroundColor: '#2a2a2a', borderRadius: '0 3px 3px 0' }} />
      </div>
    </div>
  )
}

const Field = ({ label, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
    <label style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</label>
    {children}
  </div>
)

const inp = {
  width: '100%', padding: '11px 16px', borderRadius: 14, border: '1.5px solid rgba(0,0,0,0.1)',
  backgroundColor: '#f7f8fa', fontSize: 14, color: '#0A0A0A', outline: 'none',
  fontFamily: 'inherit', transition: 'border-color 0.15s', boxSizing: 'border-box',
}
const fp = e => { e.target.style.borderColor = 'rgba(213,26,122,0.5)'; e.target.style.backgroundColor = 'rgba(213,26,122,0.02)' }
const bl = e => { e.target.style.borderColor = 'rgba(0,0,0,0.1)'; e.target.style.backgroundColor = '#f7f8fa' }

function FormBase({ tipo, emojiTipo, galeriaTipo }) {
  const [form, setForm]           = useState({ nombre: '', telefono: '', sucursal: SUCURSALES[0], cantidad: '', tamanio: TAMANIOS[0], descripcion: '' })
  const [preview, setPreview]     = useState(null)
  const [galeriaItem, setGaleriaItem] = useState(null)
  const [imageFile, setImageFile] = useState(null)
  const [subiendo, setSubiendo]   = useState(false)
  const [enviado, setEnviado]     = useState(false)
  const [errorMsg, setErrorMsg]   = useState('')
  const [dragging, setDragging]   = useState(false)
  const inputRef                  = useRef(null)

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleFile = file => {
    if (!file?.type.startsWith('image/')) return
    const r = new FileReader()
    r.onload = e => { setPreview({ url: e.target.result }); setGaleriaItem(null) }
    r.readAsDataURL(file)
    setImageFile(file)
  }

  const handleGaleriaSelect = item => {
    setGaleriaItem(item)
    setPreview(item)
    setImageFile(null)
  }

  const handleSubmit = async e => {
    e.preventDefault()
    setSubiendo(true)
    setErrorMsg('')
    let ruta = ''
    try {
      if (imageFile && dropboxConfigured) {
        ruta = await uploadStikerDropbox(SLUG_MAP[form.sucursal], imageFile, form.nombre)
      }
    } catch (err) {
      setErrorMsg('No se pudo guardar la imagen en Dropbox. Se enviará el pedido sin ella.')
      console.error(err)
    }
    setSubiendo(false)

    const msg = [
      `${emojiTipo} *PEDIDO ${tipo.toUpperCase()} - iStuffs*`,
      '',
      `👤 *Cliente:* ${form.nombre}`,
      `📞 *Teléfono:* ${form.telefono}`,
      `🏪 *Sucursal:* ${form.sucursal}`,
      `📦 *Cantidad:* ${form.cantidad} piezas`,
      tipo === 'Stiker Funda' ? '' : `📐 *Tamaño:* ${form.tamanio}`,
      `✏️ *Descripción:* ${form.descripcion}`,
      ruta ? `📁 *Imagen en Dropbox:* ${ruta}` : imageFile ? '📎 *Imagen:* Adjuntar en este chat' : '',
    ].filter(Boolean).join('\n')

    window.open(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(msg)}`, '_blank')
    setEnviado(true)
    setTimeout(() => setEnviado(false), 5000)
  }

  const completo = form.nombre && form.telefono && form.cantidad && form.descripcion

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
      {/* Formulario */}
      <form onSubmit={handleSubmit} className="lg:col-span-2"
        style={{ backgroundColor: '#fff', borderRadius: 28, border: '1px solid rgba(0,0,0,0.08)', padding: '28px 24px', boxShadow: '0 4px 24px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: 18 }}>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Nombre del cliente"><input value={form.nombre} onChange={set('nombre')} required placeholder="Ej. Juan Pérez" style={inp} onFocus={fp} onBlur={bl} /></Field>
          <Field label="Teléfono"><input value={form.telefono} onChange={set('telefono')} required placeholder="477 123 4567" type="tel" style={inp} onFocus={fp} onBlur={bl} /></Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Sucursal">
            <select value={form.sucursal} onChange={set('sucursal')} style={{ ...inp, appearance: 'none', cursor: 'pointer' }} onFocus={fp} onBlur={bl}>
              {SUCURSALES.map(s => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Cantidad (piezas)"><input value={form.cantidad} onChange={set('cantidad')} required placeholder="Ej. 50" type="number" min="1" style={inp} onFocus={fp} onBlur={bl} /></Field>
        </div>

        {tipo !== 'Stiker Funda' && (
          <Field label="Tamaño">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {TAMANIOS.map(t => (
                <button key={t} type="button" onClick={() => setForm(f => ({ ...f, tamanio: t }))}
                  style={{ padding: '7px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s', background: form.tamanio === t ? 'linear-gradient(135deg,#D51A7A,#FF6B1A)' : 'none', border: form.tamanio === t ? 'none' : '1.5px solid rgba(0,0,0,0.12)', color: form.tamanio === t ? 'white' : '#555' }}>
                  {t}
                </button>
              ))}
            </div>
          </Field>
        )}

        <Field label="Descripción y características">
          <textarea value={form.descripcion} onChange={set('descripcion')} required rows={4}
            placeholder={tipo === 'Stiker Funda'
              ? 'Modelo de celular, colores, logo o texto que debe llevar el stiker de funda...'
              : 'Describe el diseño: colores, estilo, texto, materiales, acabado, uso final...'}
            style={{ ...inp, resize: 'vertical', minHeight: 110, lineHeight: 1.6 }}
            onFocus={fp} onBlur={bl} />
        </Field>

        {errorMsg && <p style={{ fontSize: 12, color: '#D51A7A', marginTop: -8 }}>⚠ {errorMsg}</p>}

        <button type="submit" disabled={!completo || subiendo}
          style={{ width: '100%', padding: '13px 0', borderRadius: 999, border: 'none', fontSize: 14, fontWeight: 700, cursor: completo && !subiendo ? 'pointer' : 'default', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, transition: 'all 0.2s', background: completo && !subiendo ? 'linear-gradient(135deg,#25D366,#128C7E)' : 'rgba(0,0,0,0.07)', color: completo && !subiendo ? 'white' : 'rgba(0,0,0,0.28)', boxShadow: completo && !subiendo ? '0 6px 20px rgba(37,211,102,0.3)' : 'none' }}
          onMouseEnter={e => { if (completo && !subiendo) e.currentTarget.style.transform = 'scale(1.02)' }}
          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
          <WhatsAppIcon />
          {subiendo ? 'Guardando imagen...' : enviado ? '¡Pedido enviado! 🎉' : 'Enviar pedido por WhatsApp'}
        </button>
      </form>

      {/* Panel derecho: mockup + galería + upload */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#ccc', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Vista previa</p>
          <PhoneMockup preview={preview} />
        </div>

        {/* Galería desde S3 */}
        <div style={{ width: '100%', maxWidth: 220 }}>
          <GaleriaCatalogo
            tipo={galeriaTipo}
            columnas={3}
            seleccionado={galeriaItem}
            onSelect={handleGaleriaSelect}
          />
        </div>

        {/* Upload de imagen propia */}
        <div style={{ width: '100%', maxWidth: 220 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
            O sube tu diseño
          </p>
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]) }}
            style={{ padding: '14px 16px', borderRadius: 16, cursor: 'pointer', textAlign: 'center', border: `2px dashed ${dragging ? '#D51A7A' : 'rgba(0,0,0,0.14)'}`, backgroundColor: dragging ? 'rgba(213,26,122,0.04)' : 'rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, transition: 'all 0.15s' }}>
            <span style={{ color: '#D51A7A' }}><UploadIcon /></span>
            <p style={{ fontSize: 11, fontWeight: 600, color: '#333' }}>
              {imageFile ? '✓ ' + imageFile.name.slice(0, 20) + (imageFile.name.length > 20 ? '…' : '') : 'Arrastra o haz clic'}
            </p>
            <p style={{ fontSize: 10, color: '#bbb' }}>PNG, JPG · Máx 10 MB</p>
          </div>
          <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
        </div>
      </div>
    </div>
  )
}

const SUB_TABS = [
  { id: 'funda',         label: 'Stiker Funda para Celular', emoji: '📱', tipo: 'Stiker Funda',         galeriaTipo: GALERIA_TIPO.funda },
  { id: 'personalizado', label: 'Stiker Personalizado',      emoji: '✂️',  tipo: 'Stiker Personalizado', galeriaTipo: GALERIA_TIPO.personalizado },
]

export default function PedidosStikers() {
  const [subTab, setSubTab] = useState('funda')
  const tab = SUB_TABS.find(t => t.id === subTab)

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <div className="mb-8">
        <p className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: '#D51A7A' }}>Stickers Personalizados</p>
        <h2 className="text-3xl sm:text-4xl font-black mb-1" style={{ color: '#0A0A0A' }}>Pedidos para tus clientes</h2>
        <p className="text-sm" style={{ color: '#888' }}>Selecciona un diseño del catálogo o sube la imagen de referencia y envía el pedido por WhatsApp.</p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 28, flexWrap: 'wrap' }}>
        {SUB_TABS.map(t => {
          const active = subTab === t.id
          return (
            <button key={t.id} onClick={() => setSubTab(t.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 999, fontSize: 14, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', border: 'none', background: active ? 'linear-gradient(135deg,#D51A7A,#FF6B1A)' : 'rgba(0,0,0,0.06)', color: active ? 'white' : '#555', boxShadow: active ? '0 4px 16px rgba(213,26,122,0.25)' : 'none' }}>
              <span>{t.emoji}</span>
              <span>{t.label}</span>
            </button>
          )
        })}
      </div>

      <FormBase key={tab.id} tipo={tab.tipo} emojiTipo={tab.emoji} galeriaTipo={tab.galeriaTipo} />
    </section>
  )
}
