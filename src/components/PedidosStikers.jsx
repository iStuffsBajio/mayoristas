import { useState, useRef } from 'react'

const WHATSAPP = '5213315381571'

const SUCURSALES = ['León', 'San Luis Potosí', 'Aguascalientes', 'Torreón']
const TAMANIOS   = ['Pequeño (5×5 cm)', 'Mediano (10×10 cm)', 'Grande (15×15 cm)', 'Personalizado']

const WhatsAppIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.558 4.122 1.532 5.86L.078 23.561a.5.5 0 0 0 .612.612l5.701-1.454A11.94 11.94 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.907 0-3.693-.502-5.236-1.379l-.374-.216-3.884.991.991-3.884-.216-.374A9.96 9.96 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
  </svg>
)

const UploadIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
)

function PhoneMockup({ imageUrl, onUpload }) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef(null)

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) onUpload(file)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
      {/* Phone */}
      <div style={{ position: 'relative' }}>
        {imageUrl && (
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle, rgba(213,26,122,0.2) 0%, transparent 70%)', filter: 'blur(32px)', transform: 'scale(1.4)', zIndex: 0 }} />
        )}
        <div style={{ position: 'relative', zIndex: 1, width: 200, height: 400 }}>
          {/* Cuerpo del teléfono */}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg, #2e2e2e, #111)', borderRadius: 42, border: '2.5px solid rgba(255,255,255,0.12)', boxShadow: '0 40px 80px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.08)' }} />
          {/* Pantalla */}
          <div style={{ position: 'absolute', top: 8, left: 8, right: 8, bottom: 8, borderRadius: 36, overflow: 'hidden', backgroundColor: '#000' }}>
            {imageUrl ? (
              <img src={imageUrl} alt="Vista previa stiker" style={{ width: '100%', height: '100%', objectFit: 'contain', backgroundColor: '#fff' }} />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, background: 'linear-gradient(135deg, #f7f8fa, #ececec)', cursor: 'pointer' }}
                onClick={() => inputRef.current?.click()}>
                <span style={{ fontSize: 36 }}>🏷️</span>
                <span style={{ fontSize: 11, color: '#aaa', fontWeight: 600, textAlign: 'center', padding: '0 16px' }}>Vista previa del stiker</span>
              </div>
            )}
          </div>
          {/* Notch */}
          <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', width: 88, height: 26, backgroundColor: '#000', borderRadius: '0 0 20px 20px', zIndex: 10 }} />
          {/* Botones laterales */}
          <div style={{ position: 'absolute', left: -4, top: 80,  width: 4, height: 28, backgroundColor: '#2a2a2a', borderRadius: '4px 0 0 4px' }} />
          <div style={{ position: 'absolute', left: -4, top: 120, width: 4, height: 44, backgroundColor: '#2a2a2a', borderRadius: '4px 0 0 4px' }} />
          <div style={{ position: 'absolute', left: -4, top: 176, width: 4, height: 44, backgroundColor: '#2a2a2a', borderRadius: '4px 0 0 4px' }} />
          <div style={{ position: 'absolute', right: -4, top: 110, width: 4, height: 72, backgroundColor: '#2a2a2a', borderRadius: '0 4px 4px 0' }} />
          {imageUrl && (
            <div style={{ position: 'absolute', inset: 0, borderRadius: 42, background: 'linear-gradient(to bottom, transparent 60%, rgba(0,0,0,0.2) 100%)', pointerEvents: 'none' }} />
          )}
        </div>
      </div>

      {/* Zona de carga */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        style={{
          width: '100%', maxWidth: 260, padding: '16px 20px', borderRadius: 18, cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s',
          border: `2px dashed ${dragging ? '#D51A7A' : 'rgba(0,0,0,0.14)'}`,
          backgroundColor: dragging ? 'rgba(213,26,122,0.04)' : 'rgba(0,0,0,0.02)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
        }}
      >
        <span style={{ color: '#D51A7A' }}><UploadIcon /></span>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>
          {imageUrl ? 'Cambiar imagen' : 'Subir imagen de referencia'}
        </p>
        <p style={{ fontSize: 11, color: '#bbb' }}>PNG, JPG · Máx 10 MB</p>
      </div>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files[0]; if (f) onUpload(f) }} />
    </div>
  )
}

const Field = ({ label, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
    <label style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</label>
    {children}
  </div>
)

const inputStyle = {
  width: '100%', padding: '11px 16px', borderRadius: 14, border: '1.5px solid rgba(0,0,0,0.1)',
  backgroundColor: '#f7f8fa', fontSize: 14, color: '#0A0A0A', outline: 'none', fontFamily: 'inherit',
  transition: 'border-color 0.15s, background 0.15s', boxSizing: 'border-box',
}

const focusPink  = e => { e.target.style.borderColor = 'rgba(213,26,122,0.5)'; e.target.style.backgroundColor = 'rgba(213,26,122,0.02)' }
const blurNormal = e => { e.target.style.borderColor = 'rgba(0,0,0,0.1)';       e.target.style.backgroundColor = '#f7f8fa' }

export default function PedidosStikers() {
  const [form, setForm] = useState({
    nombre: '', telefono: '', sucursal: SUCURSALES[0],
    cantidad: '', tamanio: TAMANIOS[0], diseno: '', notas: '',
  })
  const [imageUrl, setImageUrl]   = useState(null)
  const [enviado, setEnviado]     = useState(false)

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleImage = (file) => {
    const reader = new FileReader()
    reader.onload = e => setImageUrl(e.target.result)
    reader.readAsDataURL(file)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const msg = [
      '🏷️ *PEDIDO DE STICKERS - iStuffs*',
      '',
      `👤 *Cliente:* ${form.nombre}`,
      `📞 *Teléfono:* ${form.telefono}`,
      `🏪 *Sucursal:* ${form.sucursal}`,
      `📦 *Cantidad:* ${form.cantidad} piezas`,
      `📐 *Tamaño:* ${form.tamanio}`,
      `✏️ *Diseño:* ${form.diseno}`,
      form.notas ? `📝 *Notas:* ${form.notas}` : '',
      imageUrl ? '📎 *Imagen de referencia:* Se adjunta en este chat' : '',
    ].filter(Boolean).join('\n')

    window.open(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(msg)}`, '_blank')
    setEnviado(true)
    setTimeout(() => setEnviado(false), 5000)
  }

  const completo = form.nombre && form.telefono && form.cantidad && form.diseno

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-14">

      <div className="mb-10">
        <p className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: '#D51A7A' }}>Stickers Personalizados</p>
        <h2 className="text-3xl sm:text-4xl font-black mb-2" style={{ color: '#0A0A0A' }}>Pedidos para tus clientes</h2>
        <p className="text-sm" style={{ color: '#888' }}>
          Llena el formulario, sube la imagen de referencia y te contactamos por WhatsApp para confirmar.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">

        {/* Formulario — 2 columnas del grid */}
        <form onSubmit={handleSubmit} className="lg:col-span-2"
          style={{ backgroundColor: '#fff', borderRadius: 28, border: '1px solid rgba(0,0,0,0.08)', padding: '32px 28px', boxShadow: '0 4px 24px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: 20 }}>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Field label="Nombre del cliente">
              <input value={form.nombre} onChange={set('nombre')} required placeholder="Ej. Juan Pérez"
                style={inputStyle} onFocus={focusPink} onBlur={blurNormal} />
            </Field>
            <Field label="Teléfono de contacto">
              <input value={form.telefono} onChange={set('telefono')} required placeholder="Ej. 477 123 4567" type="tel"
                style={inputStyle} onFocus={focusPink} onBlur={blurNormal} />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Field label="Sucursal">
              <select value={form.sucursal} onChange={set('sucursal')}
                style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}
                onFocus={e => e.target.style.borderColor = 'rgba(213,26,122,0.5)'}
                onBlur={e => e.target.style.borderColor = 'rgba(0,0,0,0.1)'}>
                {SUCURSALES.map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Cantidad (piezas)">
              <input value={form.cantidad} onChange={set('cantidad')} required placeholder="Ej. 50" type="number" min="1"
                style={inputStyle} onFocus={focusPink} onBlur={blurNormal} />
            </Field>
          </div>

          <Field label="Tamaño del stiker">
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {TAMANIOS.map(t => (
                <button key={t} type="button" onClick={() => setForm(f => ({ ...f, tamanio: t }))}
                  style={{
                    padding: '8px 16px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                    background: form.tamanio === t ? 'linear-gradient(135deg, #D51A7A, #FF6B1A)' : 'none',
                    border: form.tamanio === t ? 'none' : '1.5px solid rgba(0,0,0,0.12)',
                    color: form.tamanio === t ? 'white' : '#555',
                  }}>
                  {t}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Descripción del diseño">
            <textarea value={form.diseno} onChange={set('diseno')} required rows={3}
              placeholder="Describe el diseño: colores, logo, texto, estilo..."
              style={{ ...inputStyle, resize: 'vertical', minHeight: 90, lineHeight: 1.5 }}
              onFocus={focusPink} onBlur={blurNormal} />
          </Field>

          <Field label="Notas adicionales (opcional)">
            <textarea value={form.notas} onChange={set('notas')} rows={2}
              placeholder="Fecha de entrega, instrucciones especiales..."
              style={{ ...inputStyle, resize: 'vertical', minHeight: 68, lineHeight: 1.5 }}
              onFocus={e => { e.target.style.borderColor = 'rgba(0,188,242,0.5)'; e.target.style.backgroundColor = 'rgba(0,188,242,0.02)' }}
              onBlur={blurNormal} />
          </Field>

          <button type="submit" disabled={!completo}
            style={{
              width: '100%', padding: '14px 0', borderRadius: 999, border: 'none', fontSize: 15, fontWeight: 700,
              cursor: completo ? 'pointer' : 'default', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, transition: 'all 0.2s',
              background: completo ? 'linear-gradient(135deg, #25D366, #128C7E)' : 'rgba(0,0,0,0.07)',
              color: completo ? 'white' : 'rgba(0,0,0,0.28)',
              boxShadow: completo ? '0 6px 20px rgba(37,211,102,0.3)' : 'none',
            }}
            onMouseEnter={e => { if (completo) e.currentTarget.style.transform = 'scale(1.02)' }}
            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
            <WhatsAppIcon />
            {enviado ? '¡Pedido enviado! 🎉' : 'Enviar pedido por WhatsApp'}
          </button>

          {imageUrl && (
            <p style={{ textAlign: 'center', fontSize: 12, color: '#aaa', marginTop: -8 }}>
              📎 Recuerda adjuntar la imagen de referencia en WhatsApp
            </p>
          )}
        </form>

        {/* Preview teléfono */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#ccc', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 20 }}>
            Vista previa
          </p>
          <PhoneMockup imageUrl={imageUrl} onUpload={handleImage} />
        </div>

      </div>
    </section>
  )
}
