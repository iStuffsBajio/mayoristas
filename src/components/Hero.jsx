import { useSiteConfig } from '../context/SiteConfigContext'
import { gradStr } from '../lib/siteConfig'

/**
 * Encabezado con la composición de Apple: un bloque a todo lo ancho, el
 * titular enorme y centrado, una sola línea de texto debajo y los accesos
 * como enlaces y no como botones.
 *
 * El cambio de fondo es lo que separa una sección de la siguiente, en vez de
 * bordes y recuadros. Por eso aquí no hay caja: el bloque respira contra el
 * degradado de marca y el siguiente llega sobre blanco.
 */
export default function Hero({ onExplorar, onPersonalizar }) {
  const { config } = useSiteConfig()
  const { hero, colores } = config
  const gradPrincipal = gradStr(colores.gradientes?.principal)

  return (
    <section className="relative" style={{ padding: '72px 0 56px' }}>
      <div className="max-w-5xl mx-auto px-5 text-center">

        {/* Antes era una píldora con borde. Apple pone el nombre del producto
            en pequeño y sin adorno encima del titular: pesa menos y deja que
            el titular mande. */}
        <p style={{
          fontSize: 17, fontWeight: 600, color: colores.acento,
          margin: '0 0 10px', letterSpacing: '-0.01em',
        }}>
          {hero.badge}
        </p>

        {/* El titular va partido: la segunda mitad lleva el degradado, que es
            donde cae la promesa. Se edita desde el panel en minúsculas y aquí
            se transforma, para que siga siendo cómodo de editar. */}
        <h1 style={{
          fontSize: 'clamp(40px, 7vw, 80px)',
          lineHeight: 1.04,
          fontWeight: 800,
          letterSpacing: '-0.035em',
          textTransform: 'uppercase',
          margin: '0 0 18px',
        }}>
          <span style={{ color: '#101619', display: 'block' }}>{hero.titulo1}</span>
          <span style={{
            background: gradPrincipal, WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent', backgroundClip: 'text', display: 'block',
          }}>
            {hero.titulo2}
          </span>
        </h1>

        <p style={{
          fontSize: 'clamp(17px, 2vw, 21px)', lineHeight: 1.45, fontWeight: 400,
          color: 'rgba(16,22,25,0.62)', maxWidth: 620, margin: '0 auto 26px',
        }}>
          {hero.subtitulo}
        </p>

        {/* Enlaces, no botones. Es lo que hace que la página se sienta ligera:
            la acción no compite con el titular. */}
        <div style={{ display: 'flex', gap: 28, justifyContent: 'center', flexWrap: 'wrap' }}>
          <EnlaceAccion color={colores.acento} onClick={onExplorar}>{hero.boton1}</EnlaceAccion>
          <EnlaceAccion color={colores.acento} onClick={onPersonalizar}>{hero.boton2}</EnlaceAccion>
        </div>
      </div>
    </section>
  )
}

/** Enlace con la flecha que avanza al pasar el ratón. */
function EnlaceAccion({ children, color, onClick, href }) {
  const Etiqueta = href ? 'a' : 'button'
  const extra = href ? { href, target: '_blank', rel: 'noopener noreferrer' } : { onClick, type: 'button' }

  return (
    <Etiqueta {...extra}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        fontSize: 17, fontWeight: 500, color, textDecoration: 'none',
        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
      }}
      onMouseEnter={e => { const f = e.currentTarget.querySelector('span'); if (f) f.style.transform = 'translateX(3px)' }}
      onMouseLeave={e => { const f = e.currentTarget.querySelector('span'); if (f) f.style.transform = 'translateX(0)' }}>
      {children}
      <span style={{ transition: 'transform .18s', display: 'inline-block', fontSize: 19, lineHeight: 1 }}>›</span>
    </Etiqueta>
  )
}

export { EnlaceAccion }
