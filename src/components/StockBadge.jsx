// Indicador de existencias, compartido por la consulta de inventario y por el
// armado de pedidos. Antes estaba duplicado en ambas pantallas y los umbrales
// se podian separar sin que nadie lo notara.

export const UMBRAL_VERDE   = 10   // de aqui para arriba hay holgura
export const UMBRAL_NARANJA = 4    // de 4 a 9 conviene resurtir

/** 'verde' | 'naranja' | 'urgente' segun la cantidad. */
export function nivelStock(valor) {
  const n = parseFloat(valor) || 0
  if (n >= UMBRAL_VERDE)   return 'verde'
  if (n >= UMBRAL_NARANJA) return 'naranja'
  return 'urgente'
}

export const COLOR_NIVEL = {
  verde:   '#16a34a',
  naranja: '#d97706',
  urgente: '#D51A7A',
}

export const ETIQUETAS_LEYENDA = [
  { nivel: 'verde',   label: `En stock (≥ ${UMBRAL_VERDE})` },
  { nivel: 'naranja', label: `Limitado (${UMBRAL_NARANJA}–${UMBRAL_VERDE - 1})` },
  { nivel: 'urgente', label: `Urgente (< ${UMBRAL_NARANJA})` },
]

export default function StockBadge({ value, size = 13.5 }) {
  const n = parseFloat(value) || 0
  const nivel = nivelStock(n)
  const color = COLOR_NIVEL[nivel]

  if (n <= 0) return <span style={{ color: '#bbb', fontWeight: 500, fontSize: size }}>—</span>

  return (
    <span style={{ color, fontWeight: 700, fontSize: size, display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap' }}>
      {n}
      {nivel === 'urgente'
        ? <span style={{ marginLeft: 4 }}>⚡</span>
        : <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: color, display: 'inline-block', marginLeft: 5 }} />}
    </span>
  )
}
