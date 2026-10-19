import { useSiteConfig } from '../context/SiteConfigContext'

const InstagramIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
  </svg>
)

const TikTokIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.27 8.27 0 0 0 4.84 1.55V6.79a4.85 4.85 0 0 1-1.07-.1z" />
  </svg>
)

const XIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.258 5.626zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
)

// Los enlaces llevan destino real. Antes todos apuntaban a "#", así que la
// guía y el PDF existían en el servidor pero no había forma de llegar a ellos.
const LINKS = {
  Mayoristas: [
    { label: 'Guía para mayoristas', href: '/guia.html' },
    { label: 'Descargar guía en PDF', href: '/Guia-Mayoristas-iStuffs.pdf', descarga: true },
  ],
  Empresa:    [
    { label: 'Nosotros' }, { label: 'Franquicias' }, { label: 'Trabaja con nosotros' },
  ],
  Sucursales: [
    { label: 'León, Gto.' }, { label: 'San Luis Potosí' }, { label: 'Aguascalientes' },
  ],
}

export default function Footer() {
  const { config } = useSiteConfig()
  const { footer, colores } = config

  return (
    <footer style={{ backgroundColor: 'var(--surface)' }}>
      <div className="marco py-14">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">

          <div>
            <img src="/logo-istuffs.png" alt="iStuffs Custom Cases"
              style={{ height: 76, width: 'auto', display: 'block' }} />
            <p className="mt-4 leading-relaxed" style={{ color: 'var(--ink)', fontSize: 'var(--step-small)' }}>
              {footer.descripcion}
            </p>
            <div className="flex gap-2.5 mt-5">
              {[<InstagramIcon />, <TikTokIcon />, <XIcon />].map((icon, i) => (
                <button key={i} className="p-2.5 transition-all"
                  style={{ backgroundColor: 'transparent', color: 'var(--muted)', border: '1px solid rgba(31,43,49,0.18)', borderRadius: '999px', cursor: 'pointer' }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--ink)'; e.currentTarget.style.borderColor = 'rgba(31,43,49,0.4)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.borderColor = 'rgba(31,43,49,0.18)' }}>
                  {icon}
                </button>
              ))}
            </div>
          </div>

          {Object.entries(LINKS).map(([title, links]) => (
            <div key={title}>
              <h4 className="mb-4" style={{ color: 'var(--ink)', fontSize: 'var(--step-small)', fontWeight: 600 }}>{title}</h4>
              <ul className="space-y-3">
                {links.map(link => {
                  const activo = !!link.href
                  return (
                    <li key={link.label}>
                      <a
                        href={link.href || '#'}
                        target={activo ? '_blank' : undefined}
                        rel={activo ? 'noopener noreferrer' : undefined}
                        className="transition-colors"
                        style={{ color: activo ? 'var(--accent)' : 'var(--muted)', fontSize: 'var(--step-small)',
                                 textDecoration: 'none', fontWeight: activo ? 600 : 400 }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')}
                        onMouseLeave={e => (e.currentTarget.style.color = activo ? 'var(--accent)' : 'var(--muted)')}>
                        {link.label}{link.descarga ? ' ↓' : ''}
                      </a>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-10"
          >
          <p style={{ color: 'var(--muted)', fontSize: 'var(--step-small)' }}>{footer.copyright}</p>
          <div className="flex gap-6">
            {['Privacidad', 'Términos', 'Cookies'].map(item => (
              <a key={item} href="#" className="transition-colors"
                style={{ color: 'var(--muted)', fontSize: 'var(--step-small)', textDecoration: 'none' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}>
                {item}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
