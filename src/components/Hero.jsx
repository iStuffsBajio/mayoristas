import { useSiteConfig } from '../context/SiteConfigContext'

export default function Hero() {
  const { config } = useSiteConfig()
  const { hero, colores } = config

  return (
    <section className="relative overflow-hidden py-20 sm:py-32">
      <div style={{ position: 'absolute', top: '-5%', left: '10%', width: 500, height: 500, background: `radial-gradient(circle, ${colores.acento}24 0%, transparent 70%)`, filter: 'blur(50px)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '-5%', right: '8%', width: 420, height: 420, background: `radial-gradient(circle, ${colores.acento2}1f 0%, transparent 70%)`, filter: 'blur(50px)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: '35%', right: '22%', width: 320, height: 320, background: `radial-gradient(circle, ${colores.primario}17 0%, transparent 70%)`, filter: 'blur(40px)', pointerEvents: 'none' }} />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 text-center">

        <div className="inline-flex items-center gap-2 mb-8">
          <span className="text-xs font-semibold tracking-wide px-4 py-2"
            style={{ background: `linear-gradient(135deg, ${colores.acento}1a, ${colores.acento2}1a)`, border: `1px solid ${colores.acento}40`, borderRadius: '999px', color: colores.acento }}>
            {hero.badge}
          </span>
        </div>

        <h1 className="text-5xl sm:text-7xl font-black leading-none tracking-tight mb-6">
          <span style={{ color: '#0A0A0A' }}>Expresa </span>
          <span style={{ background: `linear-gradient(135deg, ${colores.acento} 0%, ${colores.acento2} 100%)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
            tu estilo
          </span>
          <br />
          <span style={{ color: '#0A0A0A' }}>con </span>
          <span style={{ background: `linear-gradient(135deg, ${colores.primario} 0%, ${colores.secundario} 100%)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
            iStuffs
          </span>
        </h1>

        <p className="text-lg sm:text-xl font-light mb-10 max-w-xl mx-auto leading-relaxed" style={{ color: 'rgba(0,0,0,0.5)' }}>
          {hero.subtitulo}
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16">
          <button className="px-9 py-4 text-white font-semibold text-base transition-all"
            style={{ background: `linear-gradient(135deg, ${colores.primario}, ${colores.secundario})`, borderRadius: '999px', border: 'none', cursor: 'pointer', boxShadow: `0 8px 28px ${colores.primario}4d` }}
            onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.04)')}
            onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}>
            {hero.boton1}
          </button>
          <button className="px-9 py-4 font-semibold text-base transition-all"
            style={{ color: 'rgba(0,0,0,0.65)', border: '1.5px solid rgba(0,0,0,0.14)', borderRadius: '999px', background: 'transparent', cursor: 'pointer' }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.04)'; e.currentTarget.style.transform = 'scale(1.04)' }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.transform = 'scale(1)' }}>
            {hero.boton2}
          </button>
        </div>

        <div className="flex flex-col sm:flex-row mx-auto max-w-lg"
          style={{ borderRadius: '24px', border: '1px solid rgba(0,0,0,0.09)', overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
          {hero.stats.map((stat, i) => (
            <div key={i} className="flex-1 py-5 px-6 text-center"
              style={{ backgroundColor: i % 2 === 0 ? '#fafafa' : '#f5f5f5', borderRight: i < 2 ? '1px solid rgba(0,0,0,0.07)' : 'none' }}>
              <div className="text-2xl font-black mb-0.5"
                style={{ background: `linear-gradient(135deg, ${colores.acento}, ${colores.acento2})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                {stat.value}
              </div>
              <div className="text-xs font-medium" style={{ color: 'rgba(0,0,0,0.45)' }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
