import { createContext, useContext } from 'react'

const TINTA_TENUE = '#8A9AA3'

/**
 * La ✕ junto a un código. Lee de `ContextoBaja` qué hacer, para que una tabla
 * con muchos componentes intermedios no tenga que pasar la función de mano en
 * mano. Sin contexto, o sin permiso, no pinta nada.
 */
export const ContextoBaja = createContext(null)

export function BotonBaja({ fila }) {
  const b = useContext(ContextoBaja)
  if (!b?.puede || !fila?.codigo) return null
  // Donde el renglón se QUEDA aunque esté dado de baja —Ventas: lo vendido es
  // un hecho y esconderlo haría mentir a lo facturado— se dice que lo está, y
  // se deja deshacer ahí mismo.
  if (b.ocultos?.has(String(fila.codigo).trim().toUpperCase())) {
    return (
      <span data-dado-de-baja={fila.codigo} style={{ marginInlineStart: 6, fontSize: 10, fontWeight: 700, color: '#B45309',
                     fontFamily: 'system-ui, sans-serif', whiteSpace: 'nowrap' }}>
        dado de baja ·{' '}
        <button type="button" data-quitar-baja={fila.codigo} onClick={() => b.deshacerBaja(fila.codigo)}
                style={{ border: 0, background: 'none', padding: 0, font: 'inherit', color: 'inherit',
                         textDecoration: 'underline', cursor: 'pointer' }}>
          deshacer
        </button>
      </span>
    )
  }
  const ocupado = b.bajando === fila.codigo
  return (
    <button type="button"
            data-baja={fila.codigo}
            disabled={ocupado}
            onClick={() => b.darDeBaja(fila)}
            title={`Dar de baja ${fila.codigo} en todas las plazas. Deja de contar en las listas y pasa a Revisar como pendiente de borrarlo en la caja.`}
            style={{
              marginInlineStart: 6, border: 'none', background: 'none',
              cursor: ocupado ? 'wait' : 'pointer',
              color: TINTA_TENUE, fontSize: 11, padding: '0 2px',
            }}>
      {ocupado ? '…' : '✕'}
    </button>
  )
}

/** El aviso tras dar de baja, con su deshacer. */
export function AvisoBaja() {
  const b = useContext(ContextoBaja)
  if (!b?.aviso) return null
  return (
    <p data-aviso-baja style={{ fontSize: 11.5, color: '#0A5B73', background: 'rgba(2,136,173,0.07)',
                border: '1px solid #BAE6FD', borderRadius: 12, padding: '8px 12px', margin: '0 0 10px',
                display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
      <span style={{ flex: 1, minWidth: 200 }}>{b.aviso.texto}</span>
      {b.aviso.codigo && (
        <button type="button" data-deshacer-aviso-baja={b.aviso.codigo} onClick={() => b.deshacerBaja(b.aviso.codigo)}
                style={{ border: 0, background: 'none', padding: 0, fontFamily: 'inherit', fontSize: 11.5,
                         fontWeight: 700, color: '#0A5B73', textDecoration: 'underline', cursor: 'pointer' }}>
          Deshacer
        </button>
      )}
    </p>
  )
}
