import { useEffect, useMemo, useState } from 'react'
import { telefonoWhatsApp } from '../lib/sucursales'

/** El número de la casa, para quien todavía no sabe a qué tienda escribirle. */
const WHATSAPP_GENERAL = '5213315381571'

/**
 * Lo que hace la casa, en el plano repartido: plato cuadrado a la izquierda,
 * texto escueto a la derecha, y debajo los números y las tres tiendas.
 *
 * Las imágenes son fundas reales del catálogo propio, no adornos: cada
 * pestaña enseña una pieza distinta. Antes esta zona eran tres tarjetas
 * iguales con un rótulo diminuto encima y ninguna imagen.
 */

const PIEZA = '/mockups'

const OFICIOS = [
  {
    id: 'inventario',
    pestana: 'Consultar',
    titulo: 'Lo que hay, hoy',
    texto: 'Cada tienda publica lo que tiene en caja cuando hace su respaldo, al cerrar. No es un catálogo: es lo que de verdad había, con la fecha a la vista para que sepas qué tan fresco es.',
    accion: 'Buscar mi modelo',
    tab: 'inventario',
    ancla: 'busca-modelo',
    pieza: 'I17PMT',
    puntos: [
      ['Las tres tiendas', 'Si la tuya no tiene, se ve en el acto cuál sí.'],
    ],
  },
  {
    // Esto no está inventado: son las reglas que ya viven en la Guía del
    // Mayorista, la misma que se manda impresa. Si cambian ahí, cambian aquí;
    // no puede haber dos versiones del reglamento rodando.
    id: 'reglamento',
    pestana: 'Reglamento',
    titulo: 'Cómo se pide, para que salga',
    texto: 'Un pedido que llega completo entra directo a producción como el siguiente en elaborarse. Al que le falta algo se queda esperando a que alguien pregunte.',
    accion: 'Leer el reglamento completo',
    href: '/guia.html',
    pieza: 'SGA56T',
    puntos: [
      ['La sucursal correcta', 'Revísala dos veces. Un pedido en la tienda equivocada llega a donde no está tu mercancía ni te conocen: es la causa número uno de retraso.'],
      ['Una foto por modelo', 'Cada funda lleva la suya, cargada en el modelo que le toca. Una sola imagen para todo el pedido lo detiene.'],
      ['Descripción concreta', '«Fondo negro, nombre Valeria en dorado». Lo que no está escrito hay que preguntarlo, y preguntar tarda.'],
      ['Cantidad exacta', 'Nada de «unas cuantas». Y si corre prisa, el día va escrito en las notas.'],
    ],
  },
  {
    id: 'guia',
    pestana: 'Guía de pedidos',
    titulo: 'Tu pedido en cuatro toques',
    texto: 'Sin llamadas y sin esperar a que alguien conteste para preguntarte qué querías. Se arma aquí y se abre WhatsApp solo, con todo dentro.',
    accion: 'Abrir la guía',
    href: '/guia.html',
    pieza: 'MTG24T',
    puntos: [
      ['1 · Tu sucursal', 'La que te surte. Revísala dos veces antes de seguir.'],
      ['2 · Los modelos', 'Los que necesites, cada uno con su cantidad.'],
      ['3 · Foto y nota', 'Una imagen y una descripción por modelo.'],
      ['4 · Tu nombre y enviar', 'Se abre WhatsApp solo con el pedido armado.'],
    ],
  },
]

/**
 * Lo que el color de las existencias te deja prometer. Sale de la guía, y es
 * la regla que evita la llamada de «me dijiste que había».
 */
const SEMAFORO = [
  ['10 o más',  'Véndelo. Hay de sobra.',      '#16a34a'],
  ['4 a 9',     'Confirma si son varias.',     '#d97706'],
  ['3 o menos', 'Pregunta antes de dar fecha.', '#D51A7A'],
]

const PLAZAS = [
  { nombre: 'León',            calle: '5 de Mayo 216, Local 40',        cp: '37000 · Centro',   tel: '477 663 9890' },
  { nombre: 'San Luis Potosí', calle: 'Álvaro Obregón 457, interior 403', cp: '78000 · Centro', tel: '444 501 1007' },
  { nombre: 'Aguascalientes',  calle: '5 de Mayo 219',                  cp: '20000 · Zona Centro', tel: '449 394 6507' },
]

export default function Oficios({ onIr }) {
  const [activo, setActivo] = useState(OFICIOS[0].id)
  const [tira, setTira]     = useState([])
  const [archivos, setArchivos] = useState({})

  // Una franja con fundas de verdad del catálogo. Si el índice no carga, la
  // franja simplemente no aparece: nada queda a medias.
  useEffect(() => {
    let vivo = true
    fetch(`${PIEZA}/indice.json`, { cache: 'no-store' })
      .then(r => r.json())
      .then(j => {
        if (!vivo) return
        const sinMicas = (j.mockups ?? []).filter(m => !m.vacio && !/MICA|HIDROGEL|STIKER/i.test(m.nombre))
        // Sólo fotografías. La tira va ordenada por venta y los más vendidos
        // son justo los que todavía salen del PSD viejo: encabezaban el
        // escaparate cuatro dibujos de línea entre diez fotos, y lo que se
        // veía era la mezcla, no el catálogo.
        const conFoto = sinMicas.filter(m => String(m.fuente ?? '').startsWith('mascaras'))
        setTira((conFoto.length >= 14 ? conFoto : sinMicas).slice(0, 14))
        // Qué archivo le toca a cada código. El índice es quien lo sabe: una
        // foto sirve a todos los colores del mismo teléfono.
        setArchivos(Object.fromEntries((j.mockups ?? []).map(m => [m.codigo, m.archivo])))
      })
      .catch(() => {})
    return () => { vivo = false }
  }, [])

  const oficio = useMemo(() => OFICIOS.find(o => o.id === activo) ?? OFICIOS[0], [activo])

  return (
    <>
      {/* ── Lo que hace la casa ──────────────────────────────────────── */}
      <section className="oficios" aria-labelledby="titulo-oficios">
        <div className="oficios-plato">
          {/* La llave es el ARCHIVO y `onLoad` devuelve la visibilidad: en el
              primer dibujo todavía no hay índice, la funda se pide por código,
              eso da 404 y `onError` la esconde a mano. Sin llave nueva React
              reusaba el nodo y la foto buena cargaba invisible. */}
          <img
            key={archivos[oficio.pieza] ?? oficio.pieza}
            src={`${PIEZA}/${archivos[oficio.pieza] ?? `${oficio.pieza}.png`}`}
            alt={`Funda del catálogo, modelo ${oficio.pieza}`}
            width="900" height="1880" loading="lazy"
            onLoad={e => { e.currentTarget.style.visibility = 'visible' }}
            onError={e => { e.currentTarget.style.visibility = 'hidden' }}
          />
        </div>

        <div className="oficios-columna">
          <div className="oficios-pestanas" role="tablist" aria-label="Lo que hace la casa">
            {OFICIOS.map(o => (
              <button key={o.id} type="button" role="tab"
                      aria-selected={o.id === activo}
                      className={o.id === activo ? 'activa' : ''}
                      onClick={() => setActivo(o.id)}>
                {o.pestana}
              </button>
            ))}
          </div>

          <div className="oficios-medio">
            <h2 id="titulo-oficios" className="rotulo oficios-titulo" data-entra>{oficio.titulo}</h2>
            <p className="oficios-texto" data-entra style={{ '--retraso': '60ms' }}>{oficio.texto}</p>

            {/* Lo concreto. Sin esto la columna era un título, tres líneas y
                medio metro de vacío hasta los botones: el hueco delataba que
                la sección no tenía nada más que decir. */}
            <dl className="oficios-puntos">
              {oficio.puntos.map(([que, como], i) => (
                <div key={que} data-entra style={{ '--retraso': `${120 + i * 70}ms` }}>
                  <dt>{que}</dt>
                  <dd>{como}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* El semáforo sólo sale en el reglamento: es la regla que evita
              la llamada de «me dijiste que había». */}
          {oficio.id === 'reglamento' && (
            <ul className="oficios-semaforo">
              {SEMAFORO.map(([cuantas, que, color]) => (
                <li key={cuantas}>
                  <span className="punto" style={{ background: color }} />
                  <strong>{cuantas}</strong>
                  <span>{que}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="oficios-celdas">
            {/* El texto va en un <span>: el degradado de la letra se recorta
                al texto y no cabe en la misma caja que el relleno del botón. */}
            {oficio.href
              ? <a className="celda celda-tinta" href={oficio.href}>
                  <span className="chip-plaza-texto">{oficio.accion}</span>
                </a>
              : <button type="button" className="celda celda-tinta"
                        onClick={() => onIr?.(oficio.tab, oficio.ancla)}>
                  <span className="chip-plaza-texto">{oficio.accion}</span>
                </button>}
            <a className="celda celda-tono" href={'https://wa.me/' + WHATSAPP_GENERAL}
               target="_blank" rel="noreferrer">
              Escribirnos
            </a>
          </div>
        </div>
      </section>

      {/* ── La franja del catálogo ───────────────────────────────────── */}
      {tira.length > 0 && (
        <section className="franja" aria-labelledby="titulo-franja">
          <h2 id="titulo-franja" className="rotulo franja-titulo" data-entra>
            736 modelos<br /><em>en un solo proveedor</em>
          </h2>
          {/* Para quien todavía no nos compra. El argumento no es el tamaño
              del catálogo: es que no tiene que repartir el pedido entre tres
              proveedores ni quedarse con lo que nadie le pide. */}
          <p className="franja-entrada" data-entra style={{ '--retraso': '60ms' }}>
            Ninguna tienda llena su mostrador con 736 modelos, y no hace falta: aquí está
            el catálogo entero —de la generación que acaba de salir a la que todavía se
            pide— y lo ves con existencias antes de pedirlo. Un pedido, una recogida, una
            persona del otro lado.
          </p>
          <div className="franja-tira">
            {tira.map((m, i) => (
              <figure key={m.codigo} data-entra style={{ '--retraso': `${i * 35}ms` }}>
                <img src={`${PIEZA}/${m.archivo}`} alt={`Funda para ${m.nombre}`}
                     width="900" height="1880" loading="lazy"
                     onError={e => { e.currentTarget.closest('figure').style.display = 'none' }} />
                <figcaption>{m.nombre}</figcaption>
              </figure>
            ))}
          </div>

          {/* Pedir es escribirle a una persona, no llenar un formulario: cada
              botón abre la tienda que surte a quien lee, con el mensaje ya
              empezado. */}
          <div className="franja-contactos">
            <p className="franja-pregunta">¿Precios de mayoreo? Escríbele a tu tienda</p>
            <div className="franja-botones">
              {PLAZAS.map(p => (
                <a key={p.nombre} className="celda celda-tinta"
                   href={'https://wa.me/' + telefonoWhatsApp(p.tel) + '?text=' + encodeURIComponent(
                     'Hola, soy mayorista y quiero precios. Me queda cerca ' + p.nombre + '.')}
                   target="_blank" rel="noreferrer">
                  <span className="chip-plaza-texto">{p.nombre}</span>
                </a>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Los números ──────────────────────────────────────────────── */}
      <section className="cifras" aria-labelledby="titulo-cifras">
        <h2 id="titulo-cifras" className="rotulo cifras-titulo" data-entra>La casa en números</h2>
        <dl className="cifras-lista">
          {[
            ['Al cierre', 'de cada tienda se publica su inventario'],
            ['736', 'modelos distintos en una sola tienda'],
            ['Un millón', 'de fundas personalizadas impresas aquí'],
            ['Tres', 'tiendas en el Bajío, más la bodega'],
          ].map(([n, q], i) => (
            <div key={n} data-entra style={{ '--retraso': `${i * 70}ms` }}>
              <dt className="rotulo">{n}</dt>
              <dd>{q}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ── Dónde estamos ────────────────────────────────────────────── */}
      <section className="plazas" aria-labelledby="titulo-plazas">
        <h2 id="titulo-plazas" className="rotulo plazas-titulo" data-entra>Tres tiendas</h2>
        <ul className="plazas-lista">
          {PLAZAS.map((p, i) => (
            <li key={p.nombre} data-entra style={{ '--retraso': `${i * 70}ms` }}>
              <p className="plazas-nombre">{p.nombre}</p>
              <p className="plazas-calle">{p.calle}</p>
              <p className="plazas-calle">{p.cp}</p>
              <a className="plazas-tel" href={`tel:+52${p.tel.replace(/\D/g, '')}`}>{p.tel}</a>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
