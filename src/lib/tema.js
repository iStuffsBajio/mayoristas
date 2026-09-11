// Sistema de diseño del sitio.
//
// Antes cada componente escribía sus colores y radios a mano, con 200 valores
// sueltos repartidos en trece archivos. Cambiar un tono obligaba a buscarlo en
// todos. Aquí vive el sistema y los componentes lo consumen.
//
// La paleta viene de la guía para mayoristas: los mismos tonos de marca pero
// ajustados para que el texto se lea bien sobre fondo claro. El magenta de
// marca puro (#D51A7A) funciona como relleno pero queda justo de contraste
// como texto, así que se usa una versión más profunda para leer.

export const C = {
  // Marca, para rellenos y degradados
  magenta:  '#D51A7A',
  naranja:  '#FF6B1A',
  cian:     '#00BCF2',
  verde:    '#8DC63F',

  // Versiones para texto, con contraste suficiente sobre blanco
  magentaTexto: '#C4156F',
  cianTexto:    '#0288AD',
  verdeTexto:   '#5E9422',
  ambarTexto:   '#B45309',

  // Neutros con un ligero sesgo cian, para que acompañen al acento en lugar
  // de leerse como un gris de plantilla
  tinta:      '#101619',
  tintaSuave: '#4A5A61',
  tintaTenue: '#8598A1',
  linea:      '#D6E0E4',
  fondo:      '#F4F7F8',
  superficie: '#FFFFFF',
  superficieAlt: '#EAF0F2',

  // Semánticos, separados del acento de marca
  exito:   '#16A34A',
  alerta:  '#D97706',
  peligro: '#DC2626',
  whatsapp: '#25D366',
}

// Radios generosos. El logo es una salpicadura de pintura, todo curvas, así
// que las esquinas cerradas del diseño anterior peleaban con la marca.
export const R = {
  chico:   14,
  medio:   20,
  grande:  28,
  extra:   36,
  pastilla: 999,
}

export const SOMBRA = {
  sutil:  '0 1px 2px rgba(16,22,25,.04), 0 6px 18px -10px rgba(16,22,25,.14)',
  media:  '0 2px 4px rgba(16,22,25,.05), 0 14px 32px -16px rgba(16,22,25,.22)',
  color:  c => `0 8px 26px -10px ${c}66`,
}

/** Degradado de marca. Acepta un ángulo y los tonos. */
export const grad = (a, b, angulo = 135) => `linear-gradient(${angulo}deg, ${a}, ${b})`

export const GRAD_PRINCIPAL = grad(C.magenta, C.naranja)
export const GRAD_ACENTO    = grad(C.cian, C.verde)

/** Campo de formulario, mismo estilo en todo el sitio. */
export const campo = {
  width: '100%',
  padding: '12px 17px',
  borderRadius: R.chico,
  border: `1.5px solid ${C.linea}`,
  backgroundColor: C.fondo,
  fontSize: 14,
  color: C.tinta,
  outline: 'none',
  fontFamily: 'inherit',
  transition: 'border-color .15s, background-color .15s',
  boxSizing: 'border-box',
}

export const alEnfocar = e => {
  e.target.style.borderColor = `${C.magenta}80`
  e.target.style.backgroundColor = `${C.magenta}08`
}

export const alSalir = e => {
  e.target.style.borderColor = C.linea
  e.target.style.backgroundColor = C.fondo
}

/** Tarjeta base. Las variantes ajustan el radio según el peso del bloque. */
export const tarjeta = (radio = R.grande) => ({
  backgroundColor: C.superficie,
  borderRadius: radio,
  border: `1px solid ${C.linea}`,
  boxShadow: SOMBRA.sutil,
})
