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

const LINKS = {
  Empresa:    ['Nosotros', 'Franquicias', 'Trabaja con nosotros', 'Blog'],
  Soporte:    ['Centro de ayuda', 'Rastrear pedido', 'Devoluciones', 'Garantía'],
  Sucursales: ['León, Gto.', 'San Luis Potosí', 'Aguascalientes', 'Torreón, Coah.'],
}

export default function Footer() {
  return (
    <footer style={{ backgroundColor: '#f5f5f7', borderTop: '1px solid rgba(0,0,0,0.08)', marginTop: 16 }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-14">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">

          {/* Brand */}
          <div>
            <span
              className="text-3xl font-black"
              style={{
                background: 'linear-gradient(135deg, #00BCF2, #8DC63F)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              iStuffs
            </span>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: 'rgba(0,0,0,0.45)' }}>
              Tu destino de accesorios tecnológicos premium. Diseño, calidad y personalización en un solo lugar.
            </p>
            <div className="flex gap-2.5 mt-5">
              {[<InstagramIcon />, <TikTokIcon />, <XIcon />].map((icon, i) => (
                <button
                  key={i}
                  className="p-2.5 transition-all"
                  style={{
                    backgroundColor: 'rgba(0,0,0,0.06)',
                    color: 'rgba(0,0,0,0.45)',
                    border: '1px solid rgba(0,0,0,0.08)',
                    borderRadius: '999px',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.1)'; e.currentTarget.style.color = '#0A0A0A' }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.06)'; e.currentTarget.style.color = 'rgba(0,0,0,0.45)' }}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {Object.entries(LINKS).map(([title, links]) => (
            <div key={title}>
              <h4 className="text-sm font-semibold mb-4" style={{ color: '#0A0A0A' }}>{title}</h4>
              <ul className="space-y-3">
                {links.map(link => (
                  <li key={link}>
                    <a
                      href="#"
                      className="text-sm transition-colors"
                      style={{ color: 'rgba(0,0,0,0.45)', textDecoration: 'none' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#0A0A0A')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'rgba(0,0,0,0.45)')}
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div
          className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-8"
          style={{ borderTop: '1px solid rgba(0,0,0,0.08)' }}
        >
          <p className="text-xs" style={{ color: 'rgba(0,0,0,0.3)' }}>
            © 2025 iStuffs. Todos los derechos reservados.
          </p>
          <div className="flex gap-6">
            {['Privacidad', 'Términos', 'Cookies'].map(item => (
              <a
                key={item}
                href="#"
                className="text-xs transition-colors"
                style={{ color: 'rgba(0,0,0,0.3)', textDecoration: 'none' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'rgba(0,0,0,0.65)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(0,0,0,0.3)')}
              >
                {item}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
