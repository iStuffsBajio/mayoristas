import { useEffect, useMemo, useRef, useState } from 'react'
import { inventarioJsonUrl } from '../lib/s3'
import { SUCURSALES_ACTIVAS } from '../lib/sucursales'
import { useAuth } from '../context/AuthContext'
import { coincideCon } from '../lib/buscar'
import { indexarMockups, fotoPara } from '../lib/mockups'
import IconoFunda from './IconoFunda'

/**
 * El escenario partido.
 *
 * La idea: en esta página, la funda que el cliente busca —con las existencias
 * que de verdad hay— es la mitad fija de la pantalla. La otra mitad se lee.
 *
 * Eso no es una composición bonita, es el negocio: el mayorista de dos calles
 * más allá no puede enseñarte su inventario de ahora mismo, te dice que
 * llames. Aquí la funda se queda quieta y el stock se mueve.
 *
 * Lo vivo: escribes un modelo y la pieza de la derecha cambia a ESA funda, con
 * lo que hay hoy en cada tienda. Sale del inventario real y de las 83 imágenes
 * de producto propias; sin JavaScript sigue siendo una lista legible.
 *
 * Se mira desde el teléfono, de pie en un mostrador y con una mano. De ahí
 * salen tres decisiones que en el escritorio no se notan:
 *
 *   · **La plaza se elige aquí**, no en otra pantalla. La pregunta nunca es
 *     «cuántas hay en total», es «cuántas hay en la tienda a la que le voy a
 *     pedir», y antes había que bajar hasta la tabla para saberlo.
 *   · **El número vive en una píldora sobre la imagen**, no en un renglón de
 *     texto debajo: es el único dato que se busca de verdad.
 *   · **Todo lo que se toca mide 44px o más.** Lo demás se falla con el dedo.
 */

const PIEZA = '/mockups'

/**
 * Qué tan nueva es una funda, leído del nombre.
 *
 * Es el número más alto que lleva: «IPHONE 17 PRO MAX» 17, «GALAXY A57» 57,
 * «MOTO G86» 86. No es la fecha de salida -eso no está en ninguna parte- pero
 * dentro de una misma marca ordena bien, que es para lo único que se usa.
 */
const generacion = m => Math.max(0, ...(String(m?.nombre ?? '').match(/\d+/g) ?? []).map(Number))

/** El remate del modelo, para desempatar: Pro Max antes que Pro, y que el liso. */
const remate = m => {
  const n = String(m?.nombre ?? '')
  return /PRO MAX/i.test(n) ? 3 : /PRO|ULTRA/i.test(n) ? 2 : /PLUS/i.test(n) ? 1 : 0
}

/** Lo que no es funda no tiene mockup y no entra al escenario. */
const SIN_FUNDA = /MICA|HIDROGEL|STIKER|STICKER|PAQUETE|CINTA|HOJA/i

// Los marcados `vacio` salieron del PSD como una silueta blanca sin contorno
// ni cámara. Se saltan: una mancha con un nombre debajo no enseña nada.

export default function Escenario({ onIr }) {
  // `piezas` son los modelos CON FOTO y `catalogo` es el inventario entero.
  // El buscador vive del segundo: hasta ahora salía del primero, y buscar
  // «S26» devolvía sólo el Galaxy S26 —ni el S26+ ni el S26 Ultra, que
  // existen y tienen piezas—. Un modelo que no sale es un modelo que no hay.
  const [piezas, setPiezas]   = useState([])
  const [catalogo, setCatalogo] = useState([])
  const [stock, setStock]     = useState({})
  // Desde cuándo es el dato de cada plaza. Va junto al número: un «4 piezas»
  // sin fecha es una promesa que no se sabe si todavía vale.
  const [fechas, setFechas]   = useState({})
  const [busca, setBusca]     = useState('')
  const [elegida, setElegida] = useState(null)
  /**
   * La plaza de la que se habla. Y la decisión más cara de esta pantalla.
   *
   * Antes arrancaba en «Todas» y eso suma las tres tiendas: un mayorista que
   * no se fija en la pastilla lee «hay 11», se sube al coche y en su tienda
   * hay dos. La consulta salió bien y el viaje salió mal, y la culpa es de la
   * pantalla, no suya.
   *
   * Así que para quien entra de la calle NO hay consolidado: o elige tienda o
   * no se le enseña ningún número. «Todas» queda sólo para quien tiene panel
   * -administración y las propias sucursales-, que sí necesita el total.
   *
   * Y se recuerda en el navegador: quien consulta diez veces al día lo elige
   * una vez y no vuelve a tocarlo.
   */
  const { isAdmin, session } = useAuth()
  const conPanel = isAdmin || !!session?.branch
  const [plaza, setPlaza]     = useState(() => {
    try {
      const guardada = localStorage.getItem('istuffs_plaza')
      if (guardada && SUCURSALES_ACTIVAS.some(s => s.slug === guardada)) return guardada
    } catch { /* navegación privada: se elige a mano y ya */ }
    return null
  })

  const elegirPlaza = slug => {
    setPlaza(slug)
    try { localStorage.setItem('istuffs_plaza', slug) } catch { /* da igual */ }
  }
  const campoRef = useRef(null)

  // El índice de mockups y el inventario de cada tienda. Si algo falla, la
  // sección sigue en pie con lo que haya: nunca se queda en blanco.
  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const r = await fetch(`${PIEZA}/indice.json`, { cache: 'no-store' })
        const j = await r.json()
        if (vivo) setPiezas((j.mockups ?? []).filter(m => !m.vacio && !SIN_FUNDA.test(m.nombre)))
      } catch { /* sin índice, el escenario enseña la pieza por defecto */ }

      const porPlaza = {}
      const cortes = {}
      const nombres = new Map()
      await Promise.all(SUCURSALES_ACTIVAS.map(async s => {
        try {
          const r = await fetch(`${inventarioJsonUrl(s.slug)}?t=${Date.now()}`, { cache: 'no-store' })
          const j = await r.json()
          // La fecha que vale es la del RESPALDO de la tienda, no la de la
          // corrida: la corrida pasa cuatro veces al día pase lo que pase, y
          // si la tienda no cerró publica otra vez lo mismo de ayer.
          cortes[s.slug] = j.respaldo?.fecha ?? j.generado?.slice(0, 10) ?? null
          for (const p of j.productos ?? []) {
            const c = String(p.Codigo ?? '').trim()
            if (!c) continue
            ;(porPlaza[c] ??= {})[s.slug] = Number(p.Existencia) || 0
            // El nombre lo pone la primera plaza que lo tenga. Bodega y León
            // son las que escriben bien el catálogo, y van primero en la
            // lista, así que mandan ellas.
            const n = String(p.Producto ?? '').trim()
            if (n && !nombres.has(c) && !SIN_FUNDA.test(n)) nombres.set(c, n)
          }
        } catch { /* una plaza sin publicar no detiene a las demás */ }
      }))
      if (vivo) {
        setStock(porPlaza)
        setFechas(cortes)
        setCatalogo([...nombres].map(([codigo, nombre]) => ({ codigo, nombre })))
      }
    })()
    return () => { vivo = false }
  }, [])

  const resultados = useMemo(() => {
    if (!busca.trim()) return []
    // Sobre el inventario, no sobre las fotos. Si una plaza lo tiene dado de
    // alta, tiene que poder encontrarse, haya foto o no.
    const donde = catalogo.length ? catalogo : piezas
    const hallados = donde.filter(coincideCon(busca, m => [m.nombre, m.codigo]))

    // Escribir «iphone» es preguntar por la MARCA, y ahí lo que se quiere ver
    // es lo nuevo. Ordenando por venta salía el iPhone 13, que es de 2021 y
    // además es de los que todavía no tienen fotografía. En cuanto la
    // búsqueda lleva un número -«iphone 13»- ya es un modelo concreto y el
    // número manda: ahí no hay que adivinar nada.
    const esMarca = !/\d/.test(busca)
    // El desempate es por piezas en la plaza elegida: lo que más hay es lo
    // que más probable es que se pida.
    const cuantas = m => Object.values(stock[m.codigo] ?? {}).reduce((a, b) => a + b, 0)
    const orden = esMarca
      ? (a, b) => generacion(b) - generacion(a) || remate(b) - remate(a) || cuantas(b) - cuantas(a)
      : (a, b) => cuantas(b) - cuantas(a)

    return [...hallados].sort(orden).slice(0, 8)
  }, [catalogo, piezas, stock, busca])

  /**
   * La funda que recibe a quien llega: la generación más nueva que tenga
   * FOTOGRAFÍA de verdad.
   *
   * Antes era la más vendida, y la más vendida de la casa es el iPhone 13:
   * la portada abría con el mockup viejo de los PSD —dibujo de línea, sin
   * marco ni textura— justo donde se decide si esta página parece seria.
   * Las fotografías llegan hasta el 17 Pro Max y ésa es la que se enseña.
   *
   * No va escrito a mano: sale del índice. Cuando entre el iPhone 18 y su
   * foto, la portada cambia sola sin tocar nada.
   */
  const portada = useMemo(() => {
    const conFoto = piezas.filter(m => String(m.fuente ?? '').startsWith('mascaras'))
    // Diez para abajo no cuenta: «IPHONE 6 PLUS» no es una generación nueva.
    // Aquí la generación se lee del iPhone y no del número más alto del
    // nombre: entre marcas los números no se pueden comparar -un GALAXY A57
    // no es más nuevo que un iPhone 17- y la portada es de Apple.
    const gen = m => Number(/IPHONE\s*(\d{2})/i.exec(m.nombre)?.[1] ?? 0)
    const nuevas = conFoto.filter(m => gen(m) >= 10)
      .sort((a, b) => gen(b) - gen(a) || remate(b) - remate(a) || b.piezas - a.piezas)
    return nuevas[0] ?? conFoto[0] ?? piezas[0] ?? null
  }, [piezas])

  // La pieza en escena: la buscada, la elegida, o la de portada.
  const enEscena = elegida
    ?? resultados[0]
    ?? portada
    ?? { codigo: 'I17PMT', nombre: 'iPhone 17 Pro Max TPU Case', piezas: 0 }

  // La foto se resuelve aparte del modelo: puede no haberla, o ser la de un
  // pariente. La regla y sus pruebas viven en `lib/mockups.js`.
  const indice = useMemo(() => indexarMockups(piezas), [piezas])
  const foto = useMemo(() => fotoPara(enEscena, indice), [enEscena, indice])

  const hay = stock[enEscena.codigo] ?? {}

  /**
   * Piezas de un modelo en la plaza elegida. Sin plaza, `null`: no es cero,
   * es que todavía no se ha preguntado por ninguna tienda, y enseñar un cero
   * ahí sería decir que no hay.
   */
  const piezasDe = codigo => {
    if (!plaza) return null
    const h = stock[codigo] ?? {}
    return plaza === 'todas'
      ? Object.values(h).reduce((a, b) => a + b, 0)
      : h[plaza] ?? 0
  }

  const enPlaza = piezasDe(enEscena.codigo)
  const nombrePlaza = plaza === 'todas'
    ? 'las tres tiendas'
    : SUCURSALES_ACTIVAS.find(s => s.slug === plaza)?.nombre ?? plaza
  // Se está buscando sin haber dicho desde qué tienda: hay que pedirlo, y
  // pedirlo donde se está mirando, no en un aviso al pie.
  const faltaPlaza = !plaza && !!busca.trim()

  // Dónde más hay, para no dejar a nadie con un «sin existencia» cuando la
  // funda está a dos horas de camino. Es la pregunta siguiente, siempre.
  //
  // Con «Todas» puesto no se dice: el número ya las suma, y repetir los
  // nombres debajo sólo alarga un renglón que en el teléfono ocupa dos.
  const otras = plaza === 'todas' ? [] : Object.entries(hay)
    .filter(([s, n]) => n > 0 && s !== plaza)
    .map(([s]) => SUCURSALES_ACTIVAS.find(x => x.slug === s)?.nombre)
    .filter(Boolean)

  /**
   * Desde cuándo es lo que se está enseñando.
   *
   * Con una plaza puesta, su corte. Con «Todas», el MÁS VIEJO de los tres:
   * el consolidado vale lo que vale su dato más rancio, y decir el más
   * fresco sería vender seguridad que no hay.
   *
   * Esto estaba en la tabla que se quitó y era de lo poco que protegía al
   * mayorista de prometer con existencias de la semana pasada. Sin ello, la
   * página enseña un número y calla desde cuándo.
   */
  const corte = useMemo(() => {
    const dias = f => {
      if (!f) return null
      const [a, m, d] = f.split('-').map(Number)
      return Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(a, m - 1, d).getTime()) / 86400000)
    }
    const vivas = SUCURSALES_ACTIVAS.filter(s => fechas[s.slug])
    if (!vivas.length || !plaza) return null

    const cual = plaza === 'todas'
      ? vivas.reduce((peor, s) => (dias(fechas[s.slug]) > dias(fechas[peor.slug]) ? s : peor), vivas[0])
      : vivas.find(s => s.slug === plaza)
    if (!cual) return null

    const n = dias(fechas[cual.slug])
    return {
      plaza: cual.nombre,
      dias: n,
      viejo: n >= 2,
      texto: n <= 0 ? 'Caja de hoy'
        : n === 1 ? 'Caja de ayer'
        : `Caja de hace ${n} días`,
    }
  }, [fechas, plaza])

  const elegir = m => { setElegida(m); setBusca('') }

  return (
    <section className="escenario" aria-labelledby="titulo-escenario">

      {/* ── La mitad que se lee ───────────────────────────────────────── */}
      <div className="escenario-texto">
        <div className="escenario-dentro">
          {/* El titular habla del negocio de QUIEN LEE, no del nuestro.
              «Fundas al mayoreo en el Bajío» decía quiénes somos, que es lo
              único que a un mayorista le da igual: él viene a no quedarle mal
              a un cliente que pregunta a deshoras. */}
          <p className="escenario-marca-sobre" data-entra>Mayoristas · Bajío</p>

          <h1 id="titulo-escenario" className="rotulo escenario-titulo" data-entra>
            No pierdas la venta<br /><em>porque ya cerramos</em>
          </h1>

          <p className="escenario-entrada" data-entra style={{ '--retraso': '70ms' }}>
            Tu cliente pregunta a las diez de la noche. Mira aquí mismo cuántas hay en
            cada tienda y prométele el modelo sabiendo que mañana está.
          </p>

          {/* La plaza primero: sin ella, el número de abajo no responde a
              nada. En el teléfono es la primera decisión del pulgar. */}
          <p className={'escenario-pide-plaza' + (faltaPlaza ? ' urge' : '')}>
            {plaza
              ? 'Tu tienda'
              : faltaPlaza
                ? 'Elige tu tienda para ver cuántas hay'
                : 'Elige tu tienda'}
          </p>
          <div className="escenario-plazas" data-entra style={{ '--retraso': '110ms' }}>
            {/* «Todas» suma las tres tiendas y eso sólo le sirve a quien mira
                el negocio entero. A un mayorista le manda a la tienda
                equivocada, así que no se le enseña. */}
            {[...(conPanel ? [{ slug: 'todas', nombre: 'Todas' }] : []), ...SUCURSALES_ACTIVAS].map(s => (
              <button key={s.slug} type="button"
                      className={'chip-plaza' + (plaza === s.slug ? ' activa' : '')}
                      aria-pressed={plaza === s.slug}
                      onClick={() => elegirPlaza(s.slug)}>
                <span className="chip-plaza-texto">{s.nombre}</span>
              </button>
            ))}
          </div>

          {/* Lo vivo. Un campo, resultados reales, y la pieza cambia. */}
          <div className="escenario-buscar" data-entra style={{ '--retraso': '140ms' }}>
            <label htmlFor="busca-modelo" className="escenario-etiqueta">
              Busca tu modelo
            </label>
            <input
              id="busca-modelo"
              ref={campoRef}
              type="search"
              value={busca}
              onChange={e => { setBusca(e.target.value); setElegida(null) }}
              placeholder="a16, iphone 15, moto g24…"
              autoComplete="off"
            />
            {resultados.length > 0 && (
              <ul className="escenario-resultados">
                {resultados.map(m => (
                  <li key={m.codigo}>
                    <button type="button" onClick={() => elegir(m)}>
                      <span>{m.nombre}</span>
                      {/* Las piezas van de la plaza elegida, no del total:
                          un «12 pz» que es de otra ciudad engaña. Y sin
                          tienda elegida no se enseña número ninguno. */}
                      {piezasDe(m.codigo) !== null && (
                        <span className="escenario-piezas" data-vacio={piezasDe(m.codigo) === 0 || undefined}>
                          <IconoFunda size={11} />
                          {piezasDe(m.codigo)}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Llevaba a la tabla de abajo, que ya no existe: preguntaba lo
              mismo que este campo. Ahora baja al catálogo, que es lo único
              que esta pantalla todavía no enseña. */}
          <button type="button" className="escenario-accion" data-entra
                  style={{ '--retraso': '210ms' }}
                  onClick={() => onIr?.('inventario', 'titulo-franja')}>
            <span className="chip-plaza-texto">Ver los 736 modelos</span>
          </button>
        </div>
      </div>

      {/* ── La mitad que no se mueve ──────────────────────────────────── */}
      <div className="escenario-campo">

        {/* El dato que se vino a buscar, en el borde y sobre la imagen. */}
        {/* En el teléfono la píldora dice sólo «27 pz»: el nombre de la
            plaza se salía de la pantalla, y ya está escrito debajo. */}
        {enPlaza !== null && (
          <p className="escenario-pildora">
            <IconoFunda size={13} />
            <strong>{enPlaza}</strong>
            <span className="pildora-corto">pz</span>
            <span className="pildora-largo">
              {enPlaza === 1 ? 'pieza' : 'piezas'} en {nombrePlaza}
            </span>
          </p>
        )}

        <div className="escenario-pieza">
          {/* El archivo lo dice el índice, no el código: una misma
              fotografía sirve a todos los colores del mismo teléfono y
              guardarla repetida por código ponía `public/` en medio giga. */}
          {/* La llave es el ARCHIVO, no el código, y `onLoad` devuelve la
              visibilidad. Sin las dos cosas la portada salía vacía: en el
              primer dibujo todavía no hay índice, la funda se pide por
              código, eso da 404, `onError` la esconde -y como la llave no
              cambiaba, React reusaba el mismo nodo con el estilo puesto a
              mano encima. La imagen buena cargaba y nadie la veía. */}
{/* Sin foto no se dibuja un hueco: el modelo existe igual y lo que
              importa -nombre, piezas y plaza- se enseña debajo. */}
          {foto && (
            <img
              key={foto.archivo}
              src={`${PIEZA}/${foto.archivo}`}
              alt={`Funda para ${foto.modelo}`}
              width="900" height="1880"
              onLoad={e => { e.currentTarget.style.visibility = 'visible' }}
              onError={e => { e.currentTarget.style.visibility = 'hidden' }}
            />
          )}
          {/* La marca sobre la foto. Son fotografías propias y se publican en
              abierto, así que salen firmadas. Va multiplicada: se lee sobre el
              blanco de la funda y se apaga sola al pasar al color del fondo. */}
          {foto && <img className="escenario-marca" src="/logo-istuffs.png" alt="" aria-hidden="true" />}
        </div>

        <div className="escenario-ficha">
          <p className="escenario-modelo">{enEscena.nombre}</p>
          <p className="escenario-stock">
            {enPlaza === null
              ? <>Elige tu tienda para ver existencias</>
              : enPlaza > 0
                ? <>Hay {enPlaza} en {nombrePlaza}</>
                : <>Sin existencia en {nombrePlaza}</>}
            {enPlaza !== null && otras.length > 0 && <> · también en {otras.join(' · ')}</>}
          </p>
          {/* Una foto prestada se dice. Es de la misma gama y ayuda a
              reconocer la funda, pero no es este modelo, y enseñarla callando
              sería enseñar algo que no es. */}
          {foto && !foto.exacta && (
            <p className="escenario-aviso-foto">
              Foto de referencia: es del {foto.modelo.replace(/\s+(TPU|HARD|DUO|SMART)\b.*/i, '')}
            </p>
          )}
          {!foto && (
            <p className="escenario-aviso-foto">Todavía sin fotografía de este modelo</p>
          )}
          {corte && (
            <p className={'escenario-corte' + (corte.viejo ? ' es-viejo' : '')}>
              {corte.viejo && '⚠ '}
              {corte.texto}
              {plaza === 'todas' && ` en ${corte.plaza}`}
              {corte.viejo && ' · confirma antes de prometer'}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
