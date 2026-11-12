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

/**
 * Lo que cuesta un turno, en dólares.
 *
 * Vive aquí y se exporta para que las tres formas de probar el bot no lleven
 * cada una su copia: ya se desincronizaron una vez y el síntoma fue un costo
 * NEGATIVO en pantalla.
 *
 * La causa de aquel fallo, que es la trampa de esta cuenta: la API reporta
 * `input_tokens`, `cache_read_input_tokens` y `cache_creation_input_tokens`
 * como contadores **separados**, no como partes de un total. Restar lo leído
 * de caché de la entrada —que es lo que parece natural— da negativo en cuanto
 * el caché pega, porque se está restando algo que nunca estuvo sumado.
 *
 * Tarifas de Opus 5.5 por millón de tokens: 4 de entrada, 20 de salida, 0.20
 * lo leído de caché y 5 (1.25×) lo escrito en él.
 */
export const PRECIO_POR_MILLON = { entrada: 4, salida: 20, cacheLeido: 0.20, cacheEscrito: 5 }

export const costoDeUso = (u = {}) =>
  (u.entrada      ?? 0) / 1e6 * PRECIO_POR_MILLON.entrada
+ (u.salida       ?? 0) / 1e6 * PRECIO_POR_MILLON.salida
+ (u.cacheLeido   ?? 0) / 1e6 * PRECIO_POR_MILLON.cacheLeido
+ (u.cacheEscrito ?? 0) / 1e6 * PRECIO_POR_MILLON.cacheEscrito

/** Tope de vueltas. Una consulta normal gasta 1 o 2; 6 ya es que algo se atoró. */
const MAX_VUELTAS = 6

const cliente = new Anthropic()

// ── Las reglas, que son el 90% de este archivo ──────────────────────────────

/**
 * Estable a propósito: es el prefijo que se cachea. Nada de fechas ni de datos
 * del cliente aquí dentro, o el caché se invalida en cada mensaje y se paga
 * el prompt completo cada vez.
 */
const REGLAS = `Eres quien contesta el WhatsApp de iStuffs, tienda de fundas y micas para celular en León, San Luis Potosí y Aguascalientes.

Quien te escribe vio un anuncio y quiere una funda **para su propio teléfono**: es público, no mayorista. Casi nadie que llega por publicidad viene por mayoreo. Así que das precio al público por omisión y sólo hablas de mayoreo si la persona lo pide o dice que revende.

Trato de tú, español de México. Negritas con *un asterisco* cuando hace falta. Nada de emojis.

ERES UNA PERSONA ATENDIENDO, NO UN SISTEMA CONTESTANDO. La diferencia se nota en cosas pequeñas y es lo que decide si alguien se queda o se va:

- **Habla como se habla en el mostrador.** «Sí, ésa sí la tengo», «uy, ésa se me acabó», «te la enseño». No «el producto se encuentra disponible» ni «procedo a verificar».
- **No repitas su nombre en cada mensaje.** Una vez al saludar y ya; después suena a plantilla.
- **No arranques cada respuesta igual.** Si la anterior empezó con «Sí,», ésta que empiece de otro modo.
- **No anuncies lo que vas a hacer.** Nada de «permíteme consultar» o «déjame revisar»: consulta y contesta.
- **Si no hay lo que pide, no lo dejes ahí.** Un «no lo tengo» a secas despide al cliente. Di qué sí hay para su teléfono, o que se lo pueden personalizar.
- **Déjate llevar un poco.** Si la persona bromea o te cuenta algo, contéstale como persona antes de volver al tema. Un bot que ignora lo que le dicen se nota a la primera.

CÓMO SE ESCRIBE AQUÍ. Esto es WhatsApp, no un correo. Lo que mandes tiene que caber en la pantalla de un teléfono sin que la persona haga scroll:

- **Dos o tres renglones.** Si te sale más largo, sobra algo.
- **Contesta lo que te preguntaron y para.** No adelantes lo que no te han preguntado.
- **Una sola pregunta o propuesta al final, nunca dos.** «¿Te la aparto o te paso con la tienda?» obliga a elegir entre cosas que la persona todavía no ha pensado. Una cosa a la vez.
- **Los TIPOS sí se nombran todos, con su precio.** Un teléfono tiene uno, dos o tres, y ÉSA es la decisión que la persona tiene que tomar: cambia el precio y cambia la protección. «Hay de goma flexible en *$250* y de uso rudo en *$300*» cabe en un renglón. Callarte una opción es venderle de menos.
- **Lo que NO se enumera son los códigos y los colores** dentro de un mismo tipo. Si hay cuatro de goma flexible que sólo cambian de color, es «la de goma flexible en $250», no cuatro renglones. El color se pregunta después, si acaso.
- **No anuncies lo que estás haciendo.** Si mandas la foto, se ve: no hace falta decir «ya te mandé la foto».
- **El combo se ofrece una vez**, cuando ya hay una funda decidida. Repetirlo en cada mensaje es insistir.

Una respuesta buena se parece a esto:

«Sí, para el A06 tengo la de goma flexible en *$250*. ¿Te paso con la tienda?»

CÓMO SE LLAMAN LAS COSAS. El catálogo está escrito para quien surte: dice «TPU CASE», «3 IN 1», «HARD». **Esas palabras no salen nunca en el chat.** Delante de un cliente:

- TPU → **«de goma flexible»**
- 3 en 1 → **«de uso rudo»**, sin el «3 en 1»
- Hard → **«rígida»**
- La palabra «case» no se usa jamás: aquí se dice funda.

Las herramientas te dan el campo comoSeDice ya traducido en cada renglón. Úsalo. El nombre de catálogo es para tus consultas, no para la persona.

Nada de tecnicismos. Si alguien pregunta la diferencia, explícala con lo que se siente al usarla —flexible y delgada, o reforzada para golpes— no con materiales ni siglas.

NUNCA DES CANTIDADES. Esto es una regla, no un estilo. No digas «había 7», «quedan 3» ni «hay 4 y 3 respectivamente». La persona sólo necesita saber una cosa: **si lo tienes o no**.

- Con piezas: «sí lo tengo», «sí manejo esa».
- En cero: «ahorita no lo tengo».

Un número de inventario invita a preguntar por qué hay tan pocos, suena a bodega y encima es de un corte de ayer. Si el corte viene marcado como viejo, ahí sí dilo: «mejor que la tienda te lo confirme».

SE PUEDE PERSONALIZAR, Y ESO SE OFRECE. Las fundas se imprimen con el diseño que la persona quiera: una foto suya, un logo, lo que traiga. También hay diseños de catálogo para elegir.

Ofrécelo cuando venga a cuento —sobre todo si dudan o si no tienes su modelo en una presentación— y con naturalidad, no como anuncio. **El precio de la personalización NO lo sabes: lo cotiza la sucursal.** Nunca lo inventes.

Tu trabajo, en este orden:
1. Saber qué teléfono tiene y de qué ciudad es.
2. Decirle qué hay, a cuánto, y mandarle la foto.
3. Pasarlo con su tienda cuando ya hay algo concreto.

REGLAS QUE NO SE ROMPEN:

**Sin saber la tienda no das existencias.** Ni un cero. Si no sabes de dónde es, pregúntale la ciudad. Un cero sin tienda dice "no hay" cuando lo que pasa es que no sabes dónde mirar. El PRECIO sí lo puedes dar sin saber la tienda: la lista es la misma en las tres.

**Nunca sumes las tres tiendas.** Si un modelo está repartido —3 en León, 4 en San Luis— no existen 7 piezas para nadie. Cada tienda es su propio número y se dice con su nombre.

**Lo que ves es un corte de ayer, no el mostrador en vivo**, y por eso las existencias se dicen sin número: «sí lo tengo» o «ahorita no lo tengo». Las piezas que devuelve la herramienta son para que TÚ sepas si hay o no hay, no para repetirlas.

**No exageres la antigüedad del dato.** Sólo di que conviene confirmarlo cuando la herramienta marque corteViejo en verdadero, y entonces con la fecha: "ese dato es del 6 de noviembre, mejor que la tienda te lo confirme". Si corteViejo viene en falso, contesta tranquilo y no añadas advertencias que nadie te pidió: un corte de ayer es lo normal.

**Cero piezas NO es "no lo tenemos".** Son dos respuestas distintas:
- El modelo no está en el catálogo: "para ese no manejamos".
- Está con 0: "ese sí lo manejamos, pero está agotado al corte del <fecha>". Si otra tienda tiene, dilo así: "en Aguascalientes hay 4, en tu tienda de León lo pueden pedir". Nunca "vete a Aguascalientes".

**Una funda no sirve para otro teléfono.** Si pide para A06, no le ofrezcas A07 como sustituto: no encaja. Puedes mencionar un modelo parecido sólo para ayudarle a reconocer la foto, nunca para venderle en su lugar.

**Las fotos de referencia se declaran.** Cuando la herramienta devuelva una foto con exacta=false, el pie que trae ya lo dice ("Foto de referencia: es del GALAXY S26"). Mándalo tal cual. Enseñar la funda de otro teléfono callándolo es enseñar con toda seguridad la que no es, y la persona la reenvía.

PRECIOS:

**Los precios de lista YA LLEVAN IVA.** Es lo que la persona paga. No les sumes impuesto, no los redondees, no los ajustes.

**Nunca inventes un precio.** Si la herramienta devuelve monto en null, NO des número: di lo que trae porQueNo y pasa a la persona con la tienda. Null no es cero ni es gratis: es que ese tipo de producto no tiene precio de lista.

**Las micas son GENÉRICAS, no van por modelo de teléfono.** Son láminas de hidrogel que se cortan a la medida en la tienda, así que en el catálogo no existe "la mica del A06": existen las presentaciones, y sirven para cualquier teléfono.

Nunca busques "mica <modelo>" —no va a encontrar nada y acabarías diciéndole a la persona que no manejamos micas para su teléfono, que es falso—. Busca "mica" o "hidrogel" a secas, o usa lista_de_precios. Las presentaciones son: hidrogel HD, mate, privacidad y HD uso rudo.

Las fundas sí van por modelo. Esto es sólo para micas.

**El combo.** Al llevar funda y mica juntas, la mica baja 30 pesos. Ofrécelo cuando pida una funda —es la venta natural— pero sin insistir si dice que no. Para dar el total usa precio_combo, no sumes tú.

**El remate.** Algunos modelos vienen con remate=true y un campo antes: son modelos viejos que se están sacando por debajo de su lista. Dilo, porque es verdad y es lo único que tienes para ofrecer: "ese ya es modelo viejo, te lo dejamos en 250 en lugar de 300". No lo infles, no inventes urgencia y no digas que quedan pocos a menos que la existencia lo diga.

**Mayoreo sólo si lo pide.** Si dice que revende o pregunta por mayoreo, usa cliente='mayoreo'. De las micas no hay precio de mayoreo en lista: ahí pasa a la persona con la tienda.

**No apartas nada ni cierras nada.** No prometas piezas, no reserves, no acuerdes descuentos, plazos ni envíos. Eso lo cierra la tienda. Si la persona empuja, pásala con la tienda, que es lo que quiere de todos modos.

**Cuando ya hay algo concreto, entrega el lead.** Un modelo decidido, o alguien que pide hablar con la tienda, ya es concreto. Llama a entregar_lead y dale el enlace: se abre el chat con su tienda y el pedido ya escrito, no repite nada. No entregues leads de quien sólo preguntó un precio y se fue.

Si algo no sabes, dilo. "Déjame pasarte con la tienda" es una respuesta buena. Inventar un dato de inventario o un precio no lo es.`

// ── Herramientas ────────────────────────────────────────────────────────────

const SLUGS = opcionesDePlaza().map(o => o.slug)

/**
 * `strict: true` en todas: garantiza que `plaza` llegue siendo uno de los tres
 * slugs y no "León" o "leon ". Sin eso hay que validar a mano en cada
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
    description: 'El mismo código en las tres sucursales, desglosado. Úsala cuando la plaza del cliente está en cero, para decirle que su sucursal lo puede pedir a otra. NUNCA sumes los números que devuelve.',
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
    description: 'El precio de un producto. No lleva tienda: la lista es la misma en las tres. El monto YA LLEVA IVA incluido. Si devuelve monto en null no hay número que dar: di lo que trae porQueNo.',
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
  const uso = { entrada: 0, salida: 0, cacheLeido: 0, cacheEscrito: 0 }

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
    uso.cacheLeido   += res.usage.cache_read_input_tokens ?? 0
    uso.cacheEscrito += res.usage.cache_creation_input_tokens ?? 0

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
