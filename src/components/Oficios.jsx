import { useEffect, useMemo, useState } from 'react'

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
    texto: 'Las existencias de cada tienda se publican cuatro veces al día desde la caja. No es un catálogo: es lo que puedes prometer.',
    accion: 'Ver existencias',
    tab: 'inventario',
    ancla: 'tabla-inventario',
    pieza: 'I13T',
    puntos: [
      ['Cuatro veces al día', 'La caja de cada tienda se respalda y se publica sola, sin que nadie teclee nada.'],
      ['Las tres tiendas y la bodega', 'En la misma tabla. Si una no tiene, se ve quién sí.'],
      ['Se busca por modelo', 'Escribe «a16» y salen todos, de la marca que sean y con las piezas que haya.'],
    ],
  },
  {
    id: 'personaliza',
    pestana: 'Personalizar',
    titulo: 'Tu diseño, impreso aquí',
    texto: 'Eliges los modelos, subes la imagen de cada uno y el pedido llega a la sucursal. La impresión es nuestra, no se espera a nadie.',
    accion: 'Armar mi pedido',
    tab: 'personaliza',
    pieza: 'SGA16T',
    puntos: [
      ['La impresión es nuestra', 'No se manda a maquilar: entra y sale de la misma bodega.'],
      ['Un diseño por modelo', 'Cada funda lleva el suyo. El pedido no se amarra a una sola imagen.'],
      ['Llega a tu sucursal', 'Se recoge donde ya compras, sin paquetería de por medio.'],
    ],
  },
  {
    id: 'stikers',
    pestana: 'Stickers',
    titulo: 'Se imprimen al momento',
    texto: 'Manda el diseño y la medida. Los stickers no se piden a proveedor ni se almacenan: salen de nuestra propia máquina.',
    accion: 'Pedir stickers',
    tab: 'stikers',
    pieza: 'MTG24T',
    puntos: [
      ['No hay existencia que agotar', 'Se imprimen contra el pedido; un sticker en cero no es un faltante.'],
      ['La medida la pones tú', 'Manda el diseño y el tamaño; se corta a eso.'],
      ['Mismo día en bodega', 'Si entra temprano, sale temprano.'],
    ],
  },
]

const PLAZAS = [
  { nombre: 'León',            calle: '5 de Mayo 216, Local 40',        cp: '37000 · Centro',   tel: '477 663 9890' },
  { nombre: 'San Luis Potosí', calle: 'Álvaro Obregón 457, interior 403', cp: '78000 · Centro', tel: '444 501 1007' },
  { nombre: 'Aguascalientes',  calle: '5 de Mayo 219',                  cp: '20000 · Zona Centro', tel: '449 394 6507' },
]

export default function Oficios({ onIr }) {
  const [activo, setActivo] = useState(OFICIOS[0].id)
  const [tira, setTira]     = useState([])

  // Una franja con fundas de verdad del catálogo. Si el índice no carga, la
  // franja simplemente no aparece: nada queda a medias.
  useEffect(() => {
    let vivo = true
    fetch(`${PIEZA}/indice.json`, { cache: 'no-store' })
      .then(r => r.json())
      .then(j => {
        if (!vivo) return
        const sinMicas = (j.mockups ?? []).filter(m => !m.vacio && !/MICA|HIDROGEL|STIKER/i.test(m.nombre))
        setTira(sinMicas.slice(0, 14))
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
          <img
            key={oficio.pieza}
            src={`${PIEZA}/${oficio.pieza}.png`}
            alt={`Funda del catálogo, modelo ${oficio.pieza}`}
            width="900" height="1880" loading="lazy"
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

          <div className="oficios-celdas">
            <button type="button" className="celda celda-tinta"
                    onClick={() => onIr?.(oficio.tab, oficio.ancla)}>
              {oficio.accion}
            </button>
            <a className="celda celda-tono" href="/guia.html">
              Leer la guía
            </a>
          </div>
        </div>
      </section>

      {/* ── La franja del catálogo ───────────────────────────────────── */}
      {tira.length > 0 && (
        <section className="franja" aria-labelledby="titulo-franja">
          <h2 id="titulo-franja" className="rotulo franja-titulo" data-entra>
            736 modelos
          </h2>
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
        </section>
      )}

      {/* ── Los números ──────────────────────────────────────────────── */}
      <section className="cifras" aria-labelledby="titulo-cifras">
        <h2 id="titulo-cifras" className="rotulo cifras-titulo" data-entra>La casa en números</h2>
        <dl className="cifras-lista">
          {[
            ['Cuatro', 'veces al día se publica el inventario'],
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
