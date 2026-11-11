// El cerebro del bot: Claude con las herramientas de `herramientas.js`.
//
// ── Por qué un bucle a mano y no el tool runner del SDK ─────────────────────
//
// El tool runner es más corto pero está en beta, y lo que este bucle necesita
// —recoger los efectos (fotos a mandar, lead a entregar) mientras el modelo
// razona, y cortar en seco si se pasa de vueltas— se ve mejor explícito. Cada
// mensaje de WhatsApp es una invocación nueva de la Lambda: el historial se
// rearma de la base y el bucle corre hasta que el modelo deja de pedir datos.
//
// ── Por qué no se transmite (stream) ────────────────────────────────────────
//
// WhatsApp no tiene «escribiendo…» por trozos: se manda un mensaje entero. No
// hay nada que transmitir, así que `.create()` y punto.
//
// ── Lo que el modelo NO puede hacer ─────────────────────────────────────────
//
// No tiene herramienta para apartar piezas, cerrar un precio ni escribirle a
// nadie. Lo único que puede provocar fuera del chat es `entregar_lead`, que
// arma un enlace. Un bot que negocia mayoreo crea una obligación que la
// tienda tiene que cumplir con un inventario de ayer.

import Anthropic from '@anthropic-ai/sdk'
import {
  buscarEnPlaza, dondeHay, fotoDe, entregarASucursal,
  precioProducto, precioDeCombo, listaDePrecios,
} from './herramientas.js'
import { telefonos } from './config.js'
import { plazaPara, opcionesDePlaza } from './plazas.js'
import { DIAS_PARA_AVISAR } from './inventario.js'

const MODELO = 'claude-opus-5-5'

/** Tope de vueltas. Una consulta normal gasta 1 o 2; 6 ya es que algo se atoró. */
const MAX_VUELTAS = 6

const cliente = new Anthropic()

// ── Las reglas, que son el 90% de este archivo ──────────────────────────────

/**
 * Estable a propósito: es el prefijo que se cachea. Nada de fechas ni de datos
 * del cliente aquí dentro, o el caché se invalida en cada mensaje y se paga
 * el prompt completo cada vez.
 */
/** «León, San Luis Potosí y Aguascalientes», sacado de la lista y no escrito a mano. */
const enLetra = nombres => nombres.length < 2 ? nombres.join('') : `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}`
export const CIUDADES = enLetra(opcionesDePlaza().map(o => o.nombre))

export const REGLAS = `Eres quien contesta el WhatsApp de iStuffs, tienda de fundas y micas para celular en ${CIUDADES}.

Quien te escribe vio un anuncio y quiere una funda **para su propio teléfono**: es público, no mayorista. Casi nadie que llega por publicidad viene por mayoreo. Así que das precio al público por omisión y sólo hablas de mayoreo si la persona lo pide o dice que revende.

Trato de tú, cálido pero breve, español de México. Esto es WhatsApp: mensajes cortos, sin títulos ni listas largas, negritas con *un asterisco* cuando hace falta. Nada de emojis.

Tu trabajo, en este orden:
1. Saber qué teléfono tiene y de qué ciudad es.
2. Decirle qué hay, a cuánto, y mandarle la foto.
3. Pasarlo con su tienda cuando ya hay algo concreto.

REGLAS QUE NO SE ROMPEN:

**Sin saber la tienda no das existencias.** Ni un cero. Si no sabes de dónde es, pregúntale la ciudad. Un cero sin tienda dice "no hay" cuando lo que pasa es que no sabes dónde mirar. El PRECIO sí lo puedes dar sin saber la tienda: la lista es la misma en todas las tiendas.

**Nunca sumes entre tiendas.** Si un modelo está repartido —3 en León, 4 en San Luis— no existen 7 piezas para nadie. Cada tienda es su propio número y se dice con su nombre.

**Toda existencia va con su corte.** El inventario sale de un respaldo de cada tienda, así que es la foto de un día, no el mostrador de ahora. Di "al corte del <fecha>". Si la herramienta marca el corte como viejo, avísalo sin dramatizar: "ese corte es del <fecha>, mejor que la tienda te lo confirme".

**Cero piezas NO es "no lo tenemos".** Son dos respuestas distintas:
- El modelo no está en el catálogo: "para ese no manejamos".
- Está con 0: "ese sí lo manejamos, pero está agotado al corte del <fecha>". Si otra tienda tiene, dilo así: "en Aguascalientes hay 4, en tu tienda de León lo pueden pedir". Nunca "vete a Aguascalientes".

**Una funda no sirve para otro teléfono.** Si pide para A06, no le ofrezcas A07 como sustituto: no encaja. Puedes mencionar un modelo parecido sólo para ayudarle a reconocer la foto, nunca para venderle en su lugar.

**Las fotos de referencia se declaran.** Cuando la herramienta devuelva una foto con exacta=false, el pie que trae ya lo dice ("Foto de referencia: es del GALAXY S26"). Mándalo tal cual. Enseñar la funda de otro teléfono callándolo es enseñar con toda seguridad la que no es, y la persona la reenvía.

PRECIOS:

**Los precios de lista YA LLEVAN IVA.** Es lo que la persona paga. No les sumes impuesto, no los redondees, no los ajustes.

**Nunca inventes un precio.** Si la herramienta devuelve monto en null, NO des número: di lo que trae porQueNo y pasa a la persona con la tienda. Null no es cero ni es gratis: es que ese tipo de producto no tiene precio de lista.

**El combo.** Al llevar funda y mica juntas, la mica baja 30 pesos. Ofrécelo cuando pida una funda —es la venta natural— pero sin insistir si dice que no. Para dar el total usa precio_combo, no sumes tú.

**El remate.** Algunos modelos vienen con remate=true y un campo antes: son modelos viejos que se están sacando por debajo de su lista. Dilo, porque es verdad y es lo único que tienes para ofrecer: "ese ya es modelo viejo, te lo dejamos en 250 en lugar de 300". No lo infles, no inventes urgencia y no digas que quedan pocos a menos que la existencia lo diga.

**Mayoreo sólo si lo pide.** Si dice que revende o pregunta por mayoreo, usa cliente='mayoreo'. De las micas no hay precio de mayoreo en lista: ahí pasa a la persona con la tienda.

**No apartas nada ni cierras nada.** No prometas piezas, no reserves, no acuerdes descuentos, plazos ni envíos. Eso lo cierra la tienda. Si la persona empuja, pásala con la tienda, que es lo que quiere de todos modos.

**Cuando ya hay algo concreto, entrega el lead.** Un modelo decidido, o alguien que pide hablar con la tienda, ya es concreto. Llama a entregar_lead y dale el enlace: se abre el chat con su tienda y el pedido ya escrito, no repite nada. No entregues leads de quien sólo preguntó un precio y se fue.

Si algo no sabes, dilo. "Déjame pasarte con la tienda" es una respuesta buena. Inventar un dato de inventario o un precio no lo es.`

// ── Herramientas ────────────────────────────────────────────────────────────

const SLUGS = opcionesDePlaza().map(o => o.slug)

/**
 * `strict: true` en todas: garantiza que `plaza` llegue siendo uno de los
 * slugs del bot y no "León" o "leon ". Sin eso hay que validar a mano en cada
 * herramienta y el modelo se entera del error una vuelta más tarde.
 */
const HERRAMIENTAS = [
  {
    name: 'buscar_existencias',
    description: 'Busca un modelo en el inventario de UNA tienda. Tolera cómo esté escrito: "a16", "A 16" y "galaxy a16" encuentran lo mismo. Devuelve lo que tiene piezas y lo que está en cero por separado, con la fecha del corte y EL PRECIO YA PUESTO en cada renglón. Úsala antes de decir cualquier existencia.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        plaza: { type: 'string', enum: SLUGS, description: 'La tienda de la persona' },
        texto: { type: 'string', description: 'Modelo o código, como lo dijo la persona' },
        cliente: { type: 'string', enum: ['publico', 'mayoreo'], description: 'publico salvo que haya dicho que revende o pedido mayoreo' },
      },
      required: ['plaza', 'texto', 'cliente'],
      additionalProperties: false,
    },
  },
  {
    name: 'donde_hay',
    description: 'El mismo código en cada sucursal, desglosado. Úsala cuando la plaza del cliente está en cero, para decirle que su sucursal lo puede pedir a otra. NUNCA sumes los números que devuelve.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: { codigo: { type: 'string', description: 'El código exacto, como SGA06T' } },
      required: ['codigo'],
      additionalProperties: false,
    },
  },
  {
    name: 'precio',
    description: 'El precio de un producto. No lleva tienda: la lista es la misma en todas las tiendas. El monto YA LLEVA IVA incluido. Si devuelve monto en null no hay número que dar: di lo que trae porQueNo.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        codigo: { type: 'string' },
        nombre: { type: 'string', description: 'El nombre del producto tal como lo devolvió la búsqueda' },
        cliente: { type: 'string', enum: ['publico', 'mayoreo'] },
      },
      required: ['codigo', 'nombre', 'cliente'],
      additionalProperties: false,
    },
  },
  {
    name: 'precio_combo',
    description: 'El total de llevar una funda y una mica juntas, con los 30 pesos de descuento de la mica ya aplicados. Úsala para dar el total del combo: no sumes tú.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        funda:  { type: 'object', properties: { codigo: { type: 'string' }, nombre: { type: 'string' } }, required: ['codigo', 'nombre'], additionalProperties: false },
        mica:   { type: 'object', properties: { codigo: { type: 'string' }, nombre: { type: 'string' } }, required: ['codigo', 'nombre'], additionalProperties: false },
        cliente: { type: 'string', enum: ['publico', 'mayoreo'] },
      },
      required: ['funda', 'mica', 'cliente'],
      additionalProperties: false,
    },
  },
  {
    name: 'lista_de_precios',
    description: 'La lista completa por tipo de producto, para cuando preguntan "qué precios tienen" sin nombrar un modelo. Los tipos con sinConfirmar no tienen precio: no los cotices.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: { cliente: { type: 'string', enum: ['publico', 'mayoreo'] } },
      required: ['cliente'],
      additionalProperties: false,
    },
  },
  {
    name: 'mandar_foto',
    description: 'Manda la foto de un producto al chat. Devuelve el pie que hay que usar: si es una foto de referencia de otro modelo, el pie ya lo dice y se manda tal cual.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        codigo: { type: 'string' },
        nombre: { type: 'string', description: 'El nombre del producto tal como lo devolvió la búsqueda' },
      },
      required: ['codigo', 'nombre'],
      additionalProperties: false,
    },
  },
  {
    name: 'plaza_de_ciudad',
    description: 'Qué sucursal le toca a una ciudad. Devuelve null cuando no se sabe: entonces hay que preguntarle al cliente, no adivinar.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: { ciudad: { type: 'string' } },
      required: ['ciudad'],
      additionalProperties: false,
    },
  },
  {
    name: 'entregar_lead',
    description: 'Arma el enlace con el que el cliente pasa a su sucursal con el pedido ya escrito. Úsala cuando ya hay un modelo y una cantidad, o cuando el cliente pide hablar con alguien.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        plaza: { type: 'string', enum: SLUGS },
        nombre: { type: 'string', description: 'Nombre del cliente, o cadena vacía si no lo dijo' },
        ciudad: { type: 'string', description: 'Ciudad del cliente, o cadena vacía' },
        interes: {
          type: 'array',
          description: 'Lo que le interesa',
          items: {
            type: 'object',
            properties: {
              codigo: { type: 'string' },
              nombre: { type: 'string' },
              piezas: { type: 'number', description: 'Cuántas piezas quiere, 0 si no lo dijo' },
            },
            required: ['codigo', 'nombre', 'piezas'],
            additionalProperties: false,
          },
        },
        nota: { type: 'string', description: 'Cualquier detalle que la tienda deba saber, o cadena vacía' },
      },
      required: ['plaza', 'nombre', 'ciudad', 'interes', 'nota'],
      additionalProperties: false,
    },
  },
]

// ── Ejecución de las herramientas ───────────────────────────────────────────

async function ejecutar(nombre, args, efectos) {
  switch (nombre) {
    case 'buscar_existencias':
      return await buscarEnPlaza({ plaza: args.plaza, texto: args.texto, cliente: args.cliente })

    case 'donde_hay':
      return await dondeHay({ codigo: args.codigo })

    case 'precio':
      return precioProducto({ codigo: args.codigo, nombre: args.nombre, cliente: args.cliente })

    case 'precio_combo':
      return precioDeCombo({ funda: args.funda, mica: args.mica, cliente: args.cliente })

    case 'lista_de_precios':
      return listaDePrecios({ cliente: args.cliente })

    case 'plaza_de_ciudad': {
      const slug = plazaPara(args.ciudad)
      return slug
        ? { plaza: slug }
        : { plaza: null, opciones: opcionesDePlaza(), nota: 'No se sabe. Pregúntale al cliente en qué sucursal compra.' }
    }

    case 'mandar_foto': {
      const f = await fotoDe({ codigo: args.codigo, nombre: args.nombre })
      if (!f) return { error: 'sin-foto', nota: 'No hay fotografía de ese modelo ni de uno parecido. No describas una que no viste.' }
      efectos.imagenes.push({ url: f.url, pie: f.pie, exacta: f.exacta })
      return { mandada: true, pie: f.pie, exacta: f.exacta }
    }

    case 'entregar_lead': {
      const e = entregarASucursal({
        plaza: args.plaza,
        telefonos: await telefonos(),
        cliente: { nombre: args.nombre || null, ciudad: args.ciudad || null },
        interes: (args.interes ?? []).map(i => ({ ...i, piezas: i.piezas || null })),
        nota: args.nota || null,
      })
      if (e.error) return e
      efectos.entrega = e
      return { enlace: e.enlace, sucursal: e.nombrePlaza }
    }

    default:
      return { error: 'herramienta-desconocida', nombre }
  }
}

// ── El bucle ────────────────────────────────────────────────────────────────

/**
 * Contesta un turno de conversación.
 *
 * `historial` son los mensajes previos en el formato de la API, tal como se
 * guardaron. `entrada` es lo que acaba de escribir el cliente.
 *
 * Devuelve `{ texto, imagenes, entrega, historial, uso }`. `historial` es el
 * que hay que guardar: incluye las llamadas a herramientas, porque el modelo
 * necesita verlas en el siguiente turno para no repetir consultas.
 */
export async function contestar({ historial = [], entrada, contexto = {} }) {
  const mensajes = [...historial, { role: 'user', content: entrada }]
  const efectos = { imagenes: [], entrega: null }
  const uso = { entrada: 0, salida: 0, cacheLeido: 0 }

  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    const res = await cliente.messages.create({
      model: MODELO,
      max_tokens: 16000,
      // Chat: `low` es donde rinde. Subirlo no mejora una respuesta de cuatro
      // renglones, y en Opus 5.5 el esfuerzo por omisión es `medium`, así que
      // hay que ponerlo explícito para que baje.
      output_config: { effort: 'low' },
      system: [
        // Las reglas van primero y con el corte de caché: son el prefijo
        // estable. Lo que cambia en cada mensaje va DESPUÉS, o el caché no
        // sirve de nada.
        { type: 'text', text: REGLAS, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: contextoDeHoy(contexto) },
      ],
      tools: HERRAMIENTAS,
      messages: mensajes,
    })

    uso.entrada    += res.usage.input_tokens ?? 0
    uso.salida     += res.usage.output_tokens ?? 0
    uso.cacheLeido += res.usage.cache_read_input_tokens ?? 0

    // Un rechazo por seguridad llega con 200 y sin contenido útil. Se
    // comprueba ANTES de leer el contenido.
    if (res.stop_reason === 'refusal') {
      return { ...efectos, texto: null, rechazado: true, historial: mensajes, uso }
    }

    mensajes.push({ role: 'assistant', content: res.content })

    if (res.stop_reason !== 'tool_use') {
      const texto = res.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim()
      return { ...efectos, texto, historial: mensajes, uso, truncado: res.stop_reason === 'max_tokens' }
    }

    const llamadas = res.content.filter(b => b.type === 'tool_use')
    const resultados = []
    for (const l of llamadas) {
      let salida
      try {
        salida = await ejecutar(l.name, l.input, efectos)
      } catch (err) {
        // Una herramienta caída se devuelve como error al modelo, no se traga:
        // así puede decirle al cliente que no pudo consultar en vez de
        // inventarse el dato.
        salida = { error: 'fallo-herramienta', detalle: String(err.message ?? err) }
      }
      resultados.push({
        type: 'tool_result',
        tool_use_id: l.id,
        content: JSON.stringify(salida),
        is_error: !!salida?.error,
      })
    }
    // Todos los resultados en UN solo mensaje de usuario. Partirlos en varios
    // le enseña al modelo a dejar de pedir cosas en paralelo.
    mensajes.push({ role: 'user', content: resultados })
  }

  return {
    ...efectos,
    texto: null,
    seAtoro: true,
    historial: mensajes,
    uso,
  }
}

/**
 * Lo que cambia en cada mensaje. Va en un bloque aparte, después del corte de
 * caché, para no tirar el prefijo estable en cada turno.
 */
function contextoDeHoy({ plaza, nombre, deAnuncio }) {
  const hoy = new Date().toISOString().slice(0, 10)
  return [
    `Hoy es ${hoy}.`,
    `Un corte de inventario de ${DIAS_PARA_AVISAR} días o más se considera viejo y hay que avisarlo.`,
    plaza    ? `La sucursal de este cliente ya se sabe: ${plaza}. No se la vuelvas a preguntar.` : 'Todavía no se sabe de qué sucursal es este cliente.',
    nombre   ? `El cliente se llama ${nombre}.` : null,
    deAnuncio ? `Este cliente llegó por el anuncio: ${deAnuncio}. Ya sabe de qué va, no le expliques el negocio desde cero.` : null,
  ].filter(Boolean).join('\n')
}
