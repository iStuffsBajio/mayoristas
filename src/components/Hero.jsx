import { useSiteConfig } from '../context/SiteConfigContext'
import { gradStr } from '../lib/siteConfig'

export default function Hero({ onExplorar, onPersonalizar }) {
  const { config } = useSiteConfig()
  const { hero, colores } = config
  const gradPrincipal = gradStr(colores.gradientes?.principal)
  const gradAcento    = gradStr(colores.gradientes?.acento)

  return (
    <section className="relative overflow-hidden py-20 sm:py-32">
      {/* Los difuminados propios del encabezado se retiraron: lavaban el
          degradado de marca que ahora vive en el fondo de toda la página y
          dejaban esta zona más pálida que el resto. */}

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 text-center">

        <div className="inline-flex items-center gap-2 mb-8">
          <span className="text-xs font-semibold tracking-wide px-4 py-2"
            style={{ background: gradAcento + '1a', border: `1px solid ${colores.acento}40`, borderRadius: '999px', color: colores.acento }}>
            {hero.badge}
          </span>
        </div>

        {/* El titular se edita desde el panel admin. La segunda mitad va en
            degradado, que es donde cae la promesa. */}
        {/* En mayúsculas. El titular se edita en minúsculas desde el panel y
            aquí se transforma, para que el texto guardado siga siendo legible
            de editar. */}
        <h1 className="text-4xl sm:text-6xl font-black leading-none mb-6"
          style={{ textTransform: 'uppercase', letterSpacing: '-0.015em' }}>
          <span style={{ color: '#101619' }}>{hero.titulo1} </span>
          <span style={{ background: gradPrincipal, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
            {hero.titulo2}
          </span>
        </h1>

        <p className="text-lg sm:text-xl font-light mb-10 max-w-xl mx-auto leading-relaxed" style={{ color: 'rgba(0,0,0,0.5)' }}>
          {hero.subtitulo}
        </p>

        {/* Acceso a la guía. En el pie casi nadie lo encuentra, y es lo que
            resuelve las dudas de quien entra por primera vez. */}
        <p className="mb-8" style={{ fontSize: 14 }}>
          <a href="/guia.html" target="_blank" rel="noopener noreferrer"
            style={{ color: colores.acento, textDecoration: 'none', fontWeight: 700, borderBottom: `1.5px solid ${colores.acento}55`, paddingBottom: 2 }}
            onMouseEnter={e => (e.currentTarget.style.color = colores.primario)}
            onMouseLeave={e => (e.currentTarget.style.color = colores.acento)}>
            ¿Primera vez aquí? Lee la guía en 1 minuto
          </a>
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

        {/* La onda se retiró: su relleno terminaba justo donde acaba el
            encabezado y dejaba una costura horizontal visible contra el fondo
            degradado. El fondo de la página ya aporta la forma orgánica. */}

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
