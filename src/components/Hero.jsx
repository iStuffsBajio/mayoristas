import { useSiteConfig } from '../context/SiteConfigContext'
import { gradStr } from '../lib/siteConfig'

export default function Hero({ onExplorar, onPersonalizar }) {
  const { config } = useSiteConfig()
  const { hero, colores } = config
  const gradPrincipal = gradStr(colores.gradientes?.principal)
  const gradAcento    = gradStr(colores.gradientes?.acento)

  return (
    <section className="relative overflow-hidden py-20 sm:py-32">
      <div style={{ position: 'absolute', top: '-5%', left: '10%', width: 500, height: 500, background: `radial-gradient(circle, ${colores.acento}24 0%, transparent 70%)`, filter: 'blur(50px)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '-5%', right: '8%', width: 420, height: 420, background: `radial-gradient(circle, ${colores.acento2}1f 0%, transparent 70%)`, filter: 'blur(50px)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: '35%', right: '22%', width: 320, height: 320, background: `radial-gradient(circle, ${colores.primario}17 0%, transparent 70%)`, filter: 'blur(40px)', pointerEvents: 'none' }} />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 text-center">

        <div className="inline-flex items-center gap-2 mb-8">
          <span className="text-xs font-semibold tracking-wide px-4 py-2"
            style={{ background: gradAcento + '1a', border: `1px solid ${colores.acento}40`, borderRadius: '999px', color: colores.acento }}>
            {hero.badge}
          </span>
        </div>

        {/* El titular se edita desde el panel admin. La segunda mitad va en
            degradado, que es donde cae la promesa. */}
        <h1 className="text-4xl sm:text-6xl font-black leading-none tracking-tight mb-6">
          <span style={{ color: '#101619' }}>{hero.titulo1} </span>
          <span style={{ background: gradPrincipal, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
            {hero.titulo2}
          </span>
        </h1>

        <p className="text-lg sm:text-xl font-light mb-10 max-w-xl mx-auto leading-relaxed" style={{ color: 'rgba(0,0,0,0.5)' }}>
          {hero.subtitulo}
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16">
          <button onClick={onExplorar} className="px-9 py-4 text-white font-semibold text-base transition-all"
            style={{ background: gradPrincipal, borderRadius: '999px', border: 'none', cursor: 'pointer', boxShadow: `0 8px 28px ${colores.primario}4d` }}
            onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.04)')}
            onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}>
            {hero.boton1}
          </button>
          <button onClick={onPersonalizar} className="px-9 py-4 font-semibold text-base transition-all"
            style={{ color: 'rgba(0,0,0,0.65)', border: '1.5px solid rgba(0,0,0,0.14)', borderRadius: '999px', background: 'transparent', cursor: 'pointer' }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.04)'; e.currentTarget.style.transform = 'scale(1.04)' }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.transform = 'scale(1)' }}>
            {hero.boton2}
          </button>
        </div>

        {/* Onda inferior. Recoge la forma de la salpicadura del logo y
            suaviza el corte recto entre el encabezado y el contenido. */}
        <svg aria-hidden="true" viewBox="0 0 1440 90" preserveAspectRatio="none"
          style={{ position: 'absolute', left: 0, right: 0, bottom: -1, width: '100%', height: 70, pointerEvents: 'none' }}>
          <path d="M0,52 C180,18 320,78 520,58 C700,40 820,6 1000,22 C1180,38 1300,74 1440,50 L1440,90 L0,90 Z"
            fill={colores.acento} opacity="0.07" />
          <path d="M0,66 C200,38 340,86 560,70 C760,56 880,26 1080,40 C1240,52 1340,82 1440,66 L1440,90 L0,90 Z"
            fill={colores.primario} opacity="0.05" />
        </svg>

        <div className="flex flex-col sm:flex-row mx-auto max-w-lg"
          style={{ borderRadius: '30px', border: '1px solid rgba(16,22,25,0.05)', overflow: 'hidden', boxShadow: '0 4px 24px rgba(16,22,25,0.05)' }}>
          {hero.stats.map((stat, i) => (
            <div key={i} className="flex-1 py-5 px-6 text-center"
              style={{ backgroundColor: i % 2 === 0 ? '#fafafa' : '#f5f5f5', borderRight: i < 2 ? '1px solid rgba(16,22,25,0.05)' : 'none' }}>
              <div className="text-2xl font-black mb-0.5"
                style={{ background: gradAcento, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
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
