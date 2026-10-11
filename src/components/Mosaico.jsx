import { useSiteConfig } from '../context/SiteConfigContext'
import { gradStr } from '../lib/siteConfig'
import { EnlaceAccion } from './Hero'

/**
 * La rejilla de mosaicos de Apple: después del bloque grande vienen dos
 * tarjetas por fila, cada una con la misma estructura —nombre pequeño,
 * titular, una línea, y los accesos como enlaces— pero a menor escala.
 *
 * Es lo que da el ritmo de la página: un bloque ancho, luego pares. Cada
 * tarjeta se sostiene sola, así que el orden puede cambiar sin rehacer nada.
 */

const TARJETAS = [
  {
    id: 'inventario',
    eyebrow: 'En tiempo real',
    titulo: 'Consulta de inventario',
    texto: 'Mira lo que hay en León, San Luis y Aguascalientes antes de prometerle algo a tu cliente.',
    accion: 'Ver existencias',
    tab: 'inventario',
    ancla: 'tabla-inventario',
    claro: true,
  },
  {
    id: 'personaliza',
    eyebrow: 'A tu medida',
    titulo: 'Diseña tu funda',
    texto: 'Elige modelos del inventario, adjunta la imagen de cada uno y el pedido sale a la sucursal.',
    accion: 'Armar mi pedido',
    tab: 'personaliza',
    claro: false,
  },
  {
    id: 'stikers',
    eyebrow: 'Impresión propia',
    titulo: 'Pedidos de stickers',
    texto: 'Manda tu diseño y la medida. Se imprimen aquí, no hay que esperar a que lleguen.',
    accion: 'Pedir stickers',
    tab: 'stikers',
    claro: false,
  },
  {
    id: 'guia',
    eyebrow: 'Un minuto',
    titulo: 'Guía para mayoristas',
    texto: 'Qué significan los colores del semáforo, cómo pedir y por qué a veces tardan en contestar.',
    accion: 'Leer la guía',
    href: '/guia.html',
    claro: true,
  },
]

export default function Mosaico({ onIr }) {
  const { config } = useSiteConfig()
  const { colores, hero } = config
  const gradAcento = gradStr(colores.gradientes?.acento)

  const visibles = TARJETAS.filter(t => !t.tab || config.tabs?.[t.tab]?.visible !== false)

  return (
    <section style={{ padding: '0 0 16px' }}>
      <div className="max-w-6xl mx-auto px-5">

        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
          {visibles.map(t => (
            <article key={t.id}
              style={{
                // El mismo radio que el resto de la página, que ya es generoso.
                borderRadius: 30,
                // Dos fondos que se alternan. En Apple es lo que separa una
                // tarjeta de otra: ni bordes ni sombras fuertes.
                background: t.claro ? '#ffffff' : '#F5F7F8',
                border: '1px solid rgba(16,22,25,0.055)',
                padding: '44px 34px 38px',
                textAlign: 'center',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
              }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: colores.acento, margin: '0 0 8px', letterSpacing: '.01em' }}>
                {t.eyebrow}
              </p>
              <h2 style={{
                fontSize: 'clamp(25px, 3.2vw, 34px)', lineHeight: 1.08, fontWeight: 800,
                letterSpacing: '-0.03em', color: '#101619', margin: '0 0 12px',
              }}>
                {t.titulo}
              </h2>
              <p style={{
                fontSize: 16, lineHeight: 1.5, color: 'rgba(16,22,25,0.6)',
                margin: '0 0 20px', maxWidth: 420,
              }}>
                {t.texto}
              </p>
              <div style={{ marginTop: 'auto' }}>
                <EnlaceAccion color={colores.acento}
                  {...(t.href ? { href: t.href } : { onClick: () => onIr(t.tab, t.ancla) })}>
                  {t.accion}
                </EnlaceAccion>
              </div>
            </article>
          ))}
        </div>

        {/* Los números van al final y sin caja, como la ficha técnica de
            Apple: una fila de cifras grandes separadas por aire. Antes estaban
            metidos en un recuadro gris dentro del encabezado, donde competían
            con el titular. */}
        {hero.stats?.length > 0 && (
          <div style={{
            display: 'grid', gap: 10, marginTop: 34, paddingTop: 30,
            borderTop: '1px solid rgba(16,22,25,0.07)',
            gridTemplateColumns: `repeat(auto-fit, minmax(150px, 1fr))`,
          }}>
            {hero.stats.map((s, i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                <div style={{
                  fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 800, lineHeight: 1,
                  letterSpacing: '-0.03em',
                  background: gradAcento, WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                }}>
                  {s.value}
                </div>
                <div style={{ fontSize: 14, color: 'rgba(16,22,25,0.5)', marginTop: 6 }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
