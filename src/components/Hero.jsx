export default function Hero() {
  return (
    <section className="relative overflow-hidden py-20 sm:py-32">
      {/* Ambient orbs */}
      <div style={{ position: 'absolute', top: '-5%', left: '10%', width: 500, height: 500, background: 'radial-gradient(circle, rgba(0,188,242,0.14) 0%, transparent 70%)', filter: 'blur(50px)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '-5%', right: '8%', width: 420, height: 420, background: 'radial-gradient(circle, rgba(141,198,63,0.12) 0%, transparent 70%)', filter: 'blur(50px)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: '35%', right: '22%', width: 320, height: 320, background: 'radial-gradient(circle, rgba(213,26,122,0.09) 0%, transparent 70%)', filter: 'blur(40px)', pointerEvents: 'none' }} />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 text-center">

        {/* Badge */}
        <div className="inline-flex items-center gap-2 mb-8">
          <span
            className="text-xs font-semibold tracking-wide px-4 py-2"
            style={{
              background: 'linear-gradient(135deg, rgba(0,188,242,0.1), rgba(141,198,63,0.1))',
              border: '1px solid rgba(0,188,242,0.25)',
              borderRadius: '999px',
              color: '#00BCF2',
            }}
          >
            ✦ Nueva Colección 2025
          </span>
        </div>

        {/* Headline */}
        <h1 className="text-5xl sm:text-7xl font-black leading-none tracking-tight mb-6">
          <span style={{ color: '#0A0A0A' }}>Expresa </span>
          <span
            style={{
              background: 'linear-gradient(135deg, #00BCF2 0%, #8DC63F 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            tu estilo
          </span>
          <br />
          <span style={{ color: '#0A0A0A' }}>con </span>
          <span
            style={{
              background: 'linear-gradient(135deg, #D51A7A 0%, #FF6B1A 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            iStuffs
          </span>
        </h1>

        {/* Subheadline */}
        <p
          className="text-lg sm:text-xl font-light mb-10 max-w-xl mx-auto leading-relaxed"
          style={{ color: 'rgba(0,0,0,0.5)' }}
        >
          Fundas premium y accesorios tecnológicos con diseños únicos.
          Disponible en León, San Luis Potosí, Aguascalientes y Torreón.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16">
          <button
            className="px-9 py-4 text-white font-semibold text-base transition-all"
            style={{
              background: 'linear-gradient(135deg, #D51A7A, #FF6B1A)',
              borderRadius: '999px',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 8px 28px rgba(213,26,122,0.3)',
            }}
            onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.04)')}
            onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
          >
            Explorar Catálogo
          </button>
          <button
            className="px-9 py-4 font-semibold text-base transition-all"
            style={{
              color: 'rgba(0,0,0,0.65)',
              border: '1.5px solid rgba(0,0,0,0.14)',
              borderRadius: '999px',
              background: 'transparent',
              cursor: 'pointer',
            }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.04)'; e.currentTarget.style.transform = 'scale(1.04)' }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.transform = 'scale(1)' }}
          >
            Personalizar mi Funda →
          </button>
        </div>

        {/* Stats strip */}
        <div
          className="flex flex-col sm:flex-row mx-auto max-w-lg"
          style={{
            borderRadius: '24px',
            border: '1px solid rgba(0,0,0,0.09)',
            overflow: 'hidden',
            boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
          }}
        >
          {[
            { value: '500+', label: 'Diseños' },
            { value: '4', label: 'Sucursales' },
            { value: '98%', label: 'Satisfacción' },
          ].map((stat, i) => (
            <div
              key={i}
              className="flex-1 py-5 px-6 text-center"
              style={{
                backgroundColor: i % 2 === 0 ? '#fafafa' : '#f5f5f5',
                borderRight: i < 2 ? '1px solid rgba(0,0,0,0.07)' : 'none',
              }}
            >
              <div
                className="text-2xl font-black mb-0.5"
                style={{
                  background: 'linear-gradient(135deg, #00BCF2, #8DC63F)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                {stat.value}
              </div>
              <div className="text-xs font-medium" style={{ color: 'rgba(0,0,0,0.45)' }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
