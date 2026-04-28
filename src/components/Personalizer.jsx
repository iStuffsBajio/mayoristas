import { useState, useRef } from 'react'

const UploadIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
)

const SparkleIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2L9.5 9.5L2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5L12 2z" />
  </svg>
)

function PhoneMockup({ imageUrl }) {
  return (
    <div style={{ position: 'relative', width: 200, height: 400, margin: '0 auto' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg, #2e2e2e, #111)', borderRadius: 42, border: '2.5px solid rgba(255,255,255,0.12)', boxShadow: '0 40px 80px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.08)' }} />
      <div style={{ position: 'absolute', top: 8, left: 8, right: 8, bottom: 8, borderRadius: 36, overflow: 'hidden', backgroundColor: '#000' }}>
        {imageUrl ? (
          <img src={imageUrl} alt="Preview funda" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'linear-gradient(135deg, #0a0a0a, #181818)' }}>
            <span style={{ fontSize: 52, fontWeight: 900, lineHeight: 1, background: 'linear-gradient(135deg, #00BCF2, #8DC63F)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              iS
            </span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', fontWeight: 500 }}>Tu diseño aquí</span>
          </div>
        )}
      </div>
      <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', width: 88, height: 26, backgroundColor: '#000', borderRadius: '0 0 20px 20px', zIndex: 10 }} />
      <div style={{ position: 'absolute', left: -4, top: 80,  width: 4, height: 28, backgroundColor: '#2a2a2a', borderRadius: '4px 0 0 4px' }} />
      <div style={{ position: 'absolute', left: -4, top: 120, width: 4, height: 44, backgroundColor: '#2a2a2a', borderRadius: '4px 0 0 4px' }} />
      <div style={{ position: 'absolute', left: -4, top: 176, width: 4, height: 44, backgroundColor: '#2a2a2a', borderRadius: '4px 0 0 4px' }} />
      <div style={{ position: 'absolute', right: -4, top: 110, width: 4, height: 72, backgroundColor: '#2a2a2a', borderRadius: '0 4px 4px 0' }} />
      {imageUrl && (
        <div style={{ position: 'absolute', inset: 0, borderRadius: 42, background: 'linear-gradient(to bottom, transparent 55%, rgba(0,0,0,0.35) 100%)', pointerEvents: 'none' }} />
      )}
    </div>
  )
}

export default function Personalizer() {
  const [imageUrl, setImageUrl] = useState(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef(null)

  const handleFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = e => setImageUrl(e.target.result)
    reader.readAsDataURL(file)
  }

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <div
        className="relative overflow-hidden p-8 sm:p-12"
        style={{
          backgroundColor: '#f7f8fa',
          border: '1px solid rgba(0,0,0,0.08)',
          borderRadius: '32px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.05)',
        }}
      >
        {/* Ambient glows */}
        <div style={{ position: 'absolute', top: 0, right: 0, width: 360, height: 360, background: 'radial-gradient(circle at top right, rgba(213,26,122,0.08) 0%, transparent 65%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, width: 320, height: 320, background: 'radial-gradient(circle at bottom left, rgba(0,188,242,0.07) 0%, transparent 65%)', pointerEvents: 'none' }} />

        <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">

          {/* Left */}
          <div>
            <div className="flex items-center gap-2 mb-5">
              <span style={{ color: '#D51A7A' }}><SparkleIcon /></span>
              <span className="text-xs font-bold tracking-widest uppercase" style={{ color: '#D51A7A' }}>
                iStuffsAutodesign
              </span>
            </div>

            <h2 className="text-3xl sm:text-4xl font-black mb-4 leading-tight" style={{ color: '#0A0A0A' }}>
              Diseña tu
              <span className="block" style={{ background: 'linear-gradient(135deg, #D51A7A, #FF6B1A)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                funda perfecta
              </span>
            </h2>

            <p className="text-base mb-8 leading-relaxed" style={{ color: 'rgba(0,0,0,0.5)' }}>
              Sube tu foto favorita y previsualiza cómo quedará en tu funda.
              Impresión UV de alta calidad con colores que no se desvanecen.
            </p>

            {/* Drop zone */}
            <div
              onClick={() => inputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]) }}
              className="flex flex-col items-center justify-center gap-4 py-10 px-6 text-center cursor-pointer transition-all"
              style={{
                border: `2px dashed ${dragging ? '#00BCF2' : 'rgba(0,0,0,0.14)'}`,
                borderRadius: '24px',
                backgroundColor: dragging ? 'rgba(0,188,242,0.04)' : 'rgba(255,255,255,0.8)',
                transition: 'all 0.2s ease',
              }}
            >
              <div className="p-4 rounded-2xl" style={{ background: 'linear-gradient(135deg, rgba(0,188,242,0.1), rgba(141,198,63,0.1))', color: '#00BCF2' }}>
                <UploadIcon />
              </div>
              <div>
                <p className="font-semibold mb-1.5" style={{ color: '#0A0A0A' }}>
                  {imageUrl ? '¡Foto cargada! Haz clic para cambiar' : 'Arrastra tu foto aquí'}
                </p>
                <p className="text-sm" style={{ color: 'rgba(0,0,0,0.38)' }}>
                  o haz clic para seleccionar · PNG, JPG, WEBP · Máx 10 MB
                </p>
              </div>
            </div>
            <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={e => handleFile(e.target.files[0])} />

            <button
              className="mt-5 w-full py-4 font-semibold text-base transition-all"
              disabled={!imageUrl}
              style={{
                background: imageUrl ? 'linear-gradient(135deg, #D51A7A, #FF6B1A)' : 'rgba(0,0,0,0.05)',
                borderRadius: '999px',
                border: imageUrl ? 'none' : '1px solid rgba(0,0,0,0.1)',
                color: imageUrl ? 'white' : 'rgba(0,0,0,0.3)',
                cursor: imageUrl ? 'pointer' : 'default',
                boxShadow: imageUrl ? '0 8px 28px rgba(213,26,122,0.25)' : 'none',
              }}
              onMouseEnter={e => imageUrl && (e.currentTarget.style.transform = 'scale(1.02)')}
              onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
            >
              {imageUrl ? '✦ Ordenar con mi diseño' : 'Sube una foto para continuar'}
            </button>
          </div>

          {/* Right: Phone */}
          <div className="flex items-center justify-center">
            <div style={{ position: 'relative' }}>
              {imageUrl && (
                <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle, rgba(213,26,122,0.18) 0%, transparent 70%)', filter: 'blur(32px)', transform: 'scale(1.3)', zIndex: 0 }} />
              )}
              <div style={{ position: 'relative', zIndex: 1 }}>
                <PhoneMockup imageUrl={imageUrl} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
