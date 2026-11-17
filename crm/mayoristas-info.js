// Lo que el bot puede decir del PROGRAMA DE MAYORISTAS a quien pregunta cómo
// comprar por mayoreo. Sale del documento de afiliación que dio el dueño el
// 2026-11-16.
//
// ── Qué entra y qué NO ──────────────────────────────────────────────────────
//
// Entra lo que es firme y público: los requisitos, cómo se pide y cómo se paga.
//
// NO entra, a propósito, nada de lo que el propio documento marca como
// pendiente o en conflicto, porque el bot lo diría con la misma seguridad que
// lo firme:
//
//   · la regla de inactividad (el documento dice «cada 2 meses» y el manual del
//     empleado «1 funda al mes»: hay conflicto);
//   · los precios de locatario de hard, uso rudo y micas (sin definir);
//   · la sanción por dar el precio a terceros (sin duración);
//   · pago con tarjeta, valor mínimo de la prenda, prefijos M/PT.
//
// Los PRECIOS no viven aquí: los de fundas y stickers están en precio.js. Los de
// mayoreo de micas y exhibidores los cotiza la tienda (decisión del dueño del
// 2026-10-30; el documento nuevo trae números, pero falta que confirme que el
// bot los dé).
//
// El bot NO da de alta a nadie: el registro lo hace la tienda. Lo que hace es
// explicar y pasar a la persona con su sucursal.

export const PROGRAMA_MAYORISTA = {
  requisitos: [
    'Registrarse con la tienda: sin registro no hay precio de mayorista, sin excepción.',
    'Tener un grupo de WhatsApp oficial con iStuffs: es el único canal por el que se piden los pedidos de mayoreo.',
    'El titular del negocio responde por su grupo; sus empleados autorizados y sus otros locales van en el mismo grupo.',
    'Es sólo para negocios que revenden. No añadas a quién más aplica ni excepciones: eso lo decide la tienda.',
  ],
  comoSePide: [
    'El pedido se manda por el grupo, todo en un solo mensaje: marca, modelo completo y versión del teléfono, tipo de funda, fotos nítidas, y la letra, colores y texto del diseño.',
    'El mayorista confirma el diseño.',
    'Paga o deja prenda.',
    'Se elabora (unos 5 minutos por funda desde que confirma) y se recoge el mismo día.',
  ],
  pago: 'Efectivo justo o transferencia.',
  mantenerElPrecio: 'El precio de mayorista se conserva comprando con regularidad; el detalle lo da la tienda al registrarse.',
  nota: 'El registro lo hace la tienda, no tú. Explica esto en corto (no recites toda la lista: lo esencial es registrarse y el grupo de WhatsApp) y ofrece pasarlo con su sucursal para darse de alta. Lo que no esté aquí, lo confirma la tienda.',
}

export const programaMayorista = () => PROGRAMA_MAYORISTA
