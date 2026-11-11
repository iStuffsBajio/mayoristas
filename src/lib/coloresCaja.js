// Los colores de cada concepto del dinero, compartidos por Corte y Efectivo.
//
// Lo pidió el dueño el 2026-11-09: «otras entradas en verde, ventas en azul,
// que hagan relación al concepto». Viven aquí, una sola vez, porque las dos
// pantallas van juntas en la misma pestaña y un concepto tiene que verse del
// mismo color en las dos: si «gastos» fuera ámbar en una y rosa en la otra, el
// color dejaría de decir nada.
//
//   ventas azul · otras entradas verde · tarjeta y transferencia verde azulado
//   gastos ámbar · sueldo morado · comisiones rosa · la caja en tinta

export const FONDO_CABECERA = '#F7FAFB'

export const COLORES = {
  ventas:      { fuerte: '#0277A0', suave: 'rgba(2,136,173,0.08)',   borde: 'rgba(2,136,173,0.30)',   barra: 'rgba(2,136,173,0.22)' },
  entradas:    { fuerte: '#3F6F14', suave: 'rgba(75,122,27,0.09)',   borde: 'rgba(75,122,27,0.32)',   barra: 'rgba(75,122,27,0.25)' },
  electronico: { fuerte: '#0F766E', suave: 'rgba(15,118,110,0.08)',  borde: 'rgba(15,118,110,0.30)',  barra: 'rgba(15,118,110,0.22)' },
  gastos:      { fuerte: '#B45309', suave: 'rgba(180,83,9,0.08)',    borde: 'rgba(180,83,9,0.30)',    barra: 'rgba(180,83,9,0.22)' },
  sueldo:      { fuerte: '#6D28D9', suave: 'rgba(109,40,217,0.07)',  borde: 'rgba(109,40,217,0.28)',  barra: 'rgba(109,40,217,0.20)' },
  comisiones:  { fuerte: '#BE185D', suave: 'rgba(190,24,93,0.07)',   borde: 'rgba(190,24,93,0.28)',   barra: 'rgba(190,24,93,0.20)' },
  piezas:      { fuerte: '#4B7A1B', suave: 'rgba(75,122,27,0.06)',   borde: 'rgba(75,122,27,0.25)',   barra: 'rgba(75,122,27,0.20)' },
  caja:        { fuerte: '#101619', suave: 'rgba(16,22,25,0.04)',    borde: '#D6E0E4',                barra: 'rgba(16,22,25,0.14)' },
  alerta:      { fuerte: '#B45309', suave: 'rgba(180,83,9,0.06)',    borde: 'rgba(180,83,9,0.30)',    barra: 'rgba(180,83,9,0.20)' },
}

/**
 * El concepto de cada renglón del flujo de efectivo. Un adelanto al personal
 * es sueldo; retiros, proveedores y otras salidas son gasto; los faltantes van
 * en alerta porque NO restan y no pueden confundirse con una resta más.
 */
export const CONCEPTO_DE_LINEA = {
  ventaTotal: 'ventas',
  tarjeta: 'electronico', transferencia: 'electronico', otrasNoEfectivo: 'electronico',
  efectivoCobrado: 'ventas',
  devoluciones: 'caja',
  gastos: 'gastos', retiros: 'gastos', proveedores: 'gastos', otrasSalidas: 'gastos',
  adelantos: 'sueldo',
  entradas: 'entradas',
  neto: 'caja',
  faltantes: 'alerta',
}

export const colorDeLinea = clave => COLORES[CONCEPTO_DE_LINEA[clave] ?? 'caja']
