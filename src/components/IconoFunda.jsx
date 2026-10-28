/**
 * La silueta del producto: una funda con su hueco de cámara.
 *
 * Sustituye al rayo que marcaba las existencias urgentes. Un rayo no dice
 * nada de lo que se vende aquí —podría ser una oferta, una batería o una
 * alerta— y en una pantalla donde todo lo demás es una funda, el número de
 * piezas se lee antes con la forma de lo que se cuenta.
 *
 * Va en SVG y no como emoji a propósito: no existe un emoji de funda, el de
 * teléfono se dibuja distinto en cada sistema, y éste hereda el color de
 * donde se ponga, que es lo que deja usarlo igual en el semáforo de stock y
 * sobre el degradado.
 */
export default function IconoFunda({ size = 13, title }) {
  const alto = Math.round(size * 1.6)
  return (
    <svg width={size} height={alto} viewBox="0 0 20 32" fill="none"
         role={title ? 'img' : undefined}
         aria-hidden={title ? undefined : true}
         aria-label={title}
         style={{ flexShrink: 0 }}>
      {title && <title>{title}</title>}
      <rect x="1.1" y="1.1" width="17.8" height="29.8" rx="5.2"
            stroke="currentColor" strokeWidth="2.1" />
      {/* El módulo de cámara. Sin él la silueta es un rectángulo cualquiera:
          es el detalle que la hace reconocible al tamaño de un renglón. */}
      <rect x="4.6" y="4.6" width="7.2" height="7.2" rx="2.3"
            stroke="currentColor" strokeWidth="1.7" />
    </svg>
  )
}
