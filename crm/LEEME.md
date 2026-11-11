# El CRM de Meta

El bot que atiende la publicidad: contesta por WhatsApp qué hay y a cuánto,
manda la foto y entrega el cliente a su tienda.

Está completo y probado de punta a punta. Lo que falta es **desplegarlo**, y eso
depende del papeleo de Meta, no del código.

```
crm/
  ── lo que sabe ──
  plazas.js         ciudad -> sucursal           🔒 el mapa es decisión de negocio
  inventario.js     carga los cortes de S3       nunca bodega, nunca Ferias
  precio.js         la lista del dueño por tipo  🔒 son precios, no se tocan
  config.js         teléfonos vivos de S3        no una copia pegada en el código
  herramientas.js   lo que el bot puede consultar
  cerebro.js        Claude + las reglas de la casa

  ── la fontanería ──
  webhook.js        enganche, firma y lectura de la carga de Meta
  whatsapp-api.js   mandar texto e imágenes por la Cloud API
  conversaciones.js dónde se guarda lo ya hablado
  atender.js        de un mensaje recibido a una respuesta mandada
  handler.js        el acuse rápido y el trabajador, separados

  ── probarlo ──
  servidor.mjs      la ventana en el navegador
  probar.mjs        hablar con el cerebro directo
  simular.mjs       cargas de Meta por el camino completo
  *.test.js         117 pruebas que fijan todo lo anterior
```

**A quién le habla.** La publicidad va casi toda a público: quien escribe quiere
una funda para su propio teléfono, no doce piezas. Por eso el bot da precio al
público por omisión y sólo habla de mayoreo si la persona lo pide o dice que
revende.

---

## Probarlo

```bash
npm run crm:web                       # LA VENTANA: chat en el navegador

npm test                              # las 117 reglas, sin gastar un peso
npm run crm -- --guion                # el cerebro directo, con costo
npm run crm:simular                   # el camino COMPLETO, como lo manda Meta
npm run crm:simular -- --anuncio      # entrando por un anuncio de San Luis
npm run crm:simular -- --raros        # audios, fotos y repetidos (sin API)
```

`npm run crm:web` levanta un servidor en `http://localhost:5174` con un chat
que se ve como WhatsApp. Por detrás corre el bot de verdad —mismas reglas,
mismo inventario, mismo cerebro—; lo único simulado es el envío. El panel de la
derecha enseña qué herramientas pidió el modelo, qué plaza resolvió, si entregó
el lead y cuánto costó el turno. Eso es lo que lo hace una herramienta y no un
chat.

Los mensajes que **no gastan modelo** (audio, foto, ubicación) funcionan sin
llave de la API. Para los de texto hace falta `ANTHROPIC_API_KEY`.

### Los cuatro niveles miden cosas distintas, y los cuatro hacen falta

| | Qué comprueba | Necesita API |
|---|---|---|
| `npm test` | que las **herramientas** cumplen las reglas | no |
| `npm run crm -- --guion` | que el **modelo las obedece** | sí |
| `npm run crm:simular` | que la **fontanería** funciona | sólo los que piensan |
| `npm run crm:web` | cómo **queda** la conversación en un teléfono | sólo los que piensan |

El tercero atrapa lo que los dos primeros no ven: el descarte de repetidos, la
plaza que sale del anuncio, el historial que se guarda. De ahí salió el fallo
del reintento que se describe abajo. El cuarto es el único donde se juzga el
tono y si la foto llega con su pie, que no se ve en un volcado de JSON.

---

## La regla de ingeniería

Este módulo **no reimplementa nada**. Importa de `src/lib/`:

| Lo que usa | De dónde | Por qué importa |
|---|---|---|
| `filtrarYBuscar` | `buscar.js` | La regla de «buscar ignora el filtro» se rompió 3 veces |
| `fotoPara` | `mockups.js` | Ya devuelve `exacta: false` para la foto prestada |
| `esProtector` | `familias.js` | Los 8 códigos de micas, con las erratas del catálogo |
| `armarMensaje`, `enlaceWhatsApp` | `whatsapp.js` | Ya quitan los emojis que rompen la URL |
| `SUCURSALES_CONSULTA`, `telefonoWhatsApp` | `sucursales.js` | Las mismas plazas que enseña la portada; bodega y Ferias quedan fuera solas |

Si el bot tuviera su propia copia de la búsqueda, en tres meses el chat y la
página dirían cosas distintas del mismo código. La del chat es la que ve el
cliente.

### Lo único que el CRM añade encima: `aliasDe()`

Texto extra por el que un producto también se encuentra. Existe por un fallo
real: **el catálogo escribe «hidrogel» de tres formas** —HIDROGEL, HIDRIOGEL y
HODROGEL— y quien escribía «hidrogel» en el chat encontraba 4 de las 7 micas. Se
quedaban fuera la HDA, que tiene 78 piezas entre las tres tiendas y es la
segunda que más sale, y la HDT. Y la HDR, «MICA HD USO RUDO», no dice hidrogel
en ninguna parte.

`familias.js` ya toleraba las erratas para CLASIFICAR, pero `buscar.js` no las
tolera para BUSCAR, y ahí el cliente se queda sin respuesta. Se añade texto al
pajar en vez de corregir el nombre, así que buscar «hidriogel» tal como está en
el catálogo también sigue funcionando y nadie tiene que corregir Eleventa para
que el chat sirva.

---

## 🔒 Los precios son del dueño, no de la caja

La lista, confirmada el 2026-10-30, **ya lleva IVA incluido**. Es lo que la
persona paga:

| Tipo | Público | Mayoreo |
|---|---|---|
| TPU | 250 | 150 |
| Hard | 220 | 130 |
| Uso rudo 3 en 1 | 300 | 190 |
| Hidrogel HD | 150 | — |
| Hidrogel mate | 180 | — |
| Hidrogel privacidad | 200 | — |
| Mica HD uso rudo | 200 | — |
| Mica hidrogel tablet HD | 300 | — |
| Mica hidrogel mate tablet | 300 | — |
| TPU cristal | 250 *(remate, antes 300)* | — |
| Duo | 250 *(remate, antes 260)* | — |

**Combo:** al llevar funda y mica juntas, la mica baja 30 pesos, en cualquiera
de sus presentaciones.

**Remate:** cristal y duo son modelos viejos que se están sacando al precio del
TPU. El `antes` no es adorno: es la lista de verdad, así que el bot lo puede
decir —«ese ya es modelo viejo, te lo dejamos en 250 en lugar de 300»— y es el
único descuento honesto que tiene para ofrecer. En mayoreo no se anuncia como
rebaja, porque ahí no hay con qué comparar.

Cobertura: el bot cotiza **806 de los 808 códigos** del catálogo. Los dos que no
son el sticker y el exhibidor, ambos en ceros y que no se anuncian.

### Por qué no se leen de Eleventa

Porque están mal de dos formas, las dos medidas sobre los tres inventarios:

**El IVA se captura distinto por plaza, y las tres están bien.** León y San Luis
guardan el precio SIN IVA y su caja lo suma; Aguascalientes guarda el final. Los
736 precios de León traen decimales y 676 son exactamente lista ÷ 1.16
—215.5172 × 1.16 = 250.0000—. **No son errores:** corregir 215.5172 a 250 haría
que León cobrara 290.

**Y aun normalizando, 171 de 782 códigos no coinciden entre plazas.** El HARD
CASE figura a 220 en León, 200 en San Luis y 230 en Aguascalientes. No son tres
precios: son dos errores de captura. La lista dice 220.

Los de Eleventa siguen sirviendo para valorar inventario y para detectar
capturas torcidas con `desviaciones()` en `src/lib/precios.js`. No para decirle
un número a un cliente.

### Lo que la clasificación por tipo ya atrapó

El tipo sale del nombre del catálogo, y el orden de `tipoDe()` no es decorativo.
Tres trampas reales:

- **`MILITAR TPU CASE` es TPU de 250, no uso rudo de 300.** Son 12 códigos y las
  tres plazas los tienen a 250. Clasificarlos por «MILITAR» cotizaba 50 pesos de
  más por pieza.
- **`TPU CRISTAL` es su propio tipo.** 15 códigos con lista de 300, no de 250.
  Si cayeran en `tpu` se perdería el remate y, el día que suba el precio, se
  cotizarían 50 pesos por debajo.
- **`HD USO RUDO` (HDR) es mica, no funda.** El nombre no dice «mica» en ninguna
  parte; está en `CODIGOS_PROTECTOR`. Si se mirara «uso rudo» antes del
  protector, una mica de 200 se cotizaría como funda de 300.

Auditado contra el catálogo completo: 608 códigos coinciden con las tres plazas,
131 con al menos una —el desacuerdo 220/200/230—, y 25 con ninguna, que son
modelos viejos con captura torcida en todas.

---

## ⚠️ VERIFICAR — La fontanería y sus cinco trampas

### Meta corta a los 5 segundos, y el cerebro tarda más

Si el webhook no contesta 200 en unos segundos, Meta da el envío por fallido y
**reintenta**. Contestando dentro del webhook: Meta reintenta, el cerebro corre
dos veces y la persona recibe la respuesta duplicada.

En Lambda es peor, porque el proceso se **congela** al devolver la respuesta: lo
que quedara corriendo en segundo plano se queda a medias y se reanuda —o no— en
la siguiente invocación, con lo que el mensaje se pierde sin que nada falle.

Por eso `handler.js` son dos extremos: `recibir()` valida y encola en
milisegundos, `trabajar()` piensa en otra invocación. Entre los dos va una cola
—SQS en AWS, `colaEnMemoria()` en una sola máquina—.

### La firma se valida sobre el cuerpo CRUDO

`X-Hub-Signature-256` es un HMAC de los bytes tal como llegaron. Volver a
serializar el JSON antes de validar —lo que hace cualquier middleware que parsea
primero— cambia el espaciado sin cambiar los datos, y la firma deja de cuadrar.
**No da ninguna pista:** todo se ve bien y nada valida.

Sin firma válida no se procesa nada. Quien conozca la URL podría inyectar
conversaciones y hacer que el bot le escriba a números ajenos.

### El `referral` del anuncio llega UNA vez o se pierde

Meta manda el objeto `referral` sólo en el **primer** mensaje de la conversación.
Del segundo en adelante ya no viene. Si no se guarda ahí mismo, la atribución
—de qué anuncio salió esta venta— desaparece, y con ella la única forma de saber
qué publicidad sirve.

El campo `ref` lo ponemos nosotros al armar el anuncio, así que es la vía más
barata de direccionar: un anuncio por plaza con `ref=plaza=leon` y el lead llega
clasificado sin preguntarle nada a nadie. `plazaDelRef()` acepta `plaza=leon`,
`leon` a secas o el slug en cualquier parte, porque quien lo teclee en el panel
de Meta lo va a escribir como le salga.

El `ctwa_clid` se guarda pero **no** se le pasa al modelo: no le sirve para
contestar y gasta contexto. Es lo que Meta pide de vuelta para atribuir la
conversión.

### Un turno que falla tiene que poder reintentarse

El descarte de repetidos va **antes** de contestar, o Meta reintenta y llegan
dos respuestas. Eso tiene un filo que salió en el simulador: si el cerebro o el
envío truenan después de marcar el mensaje, el reintento de Meta se descarta y
**la persona no recibe nada nunca**. El turno fallaba y el siguiente intento
decía «repetido».

`atender()` desmarca el mensaje cuando el turno revienta. Si el fallo es
permanente, Meta reintenta unas cuantas veces y se rinde, que es mejor que el
silencio.

### El historial no se puede recortar por donde sea

Se guarda **completo**, con las llamadas a herramientas y sus resultados dentro.
Parece de más y no lo es: sin ellas el modelo no sabe que ya consultó el
inventario y lo vuelve a consultar, o peor, se inventa el número que «recuerda»
del turno anterior.

Y al recortarlo, un `tool_use` tiene que ir seguido de sus `tool_result` o la API
rechaza la petición **entera** con un 400 y el cliente no recibe nada. Por eso
`recortarHistorial()` corta sólo en un turno de usuario que no sea de resultados,
y prefiere conservar algún turno de más antes que partir un par. Si no hay ningún
corte limpio, empieza de cero.

### Lo que no gasta modelo

Desde el 1 de octubre de 2026 Meta cobra los mensajes de servicio —1,000 gratis
al mes por número— y el modelo también se paga. Una nota de voz, un sticker o una
ubicación tienen respuesta fija en `RESPUESTAS_FIJAS`: correcta, gratis y con una
salida. Cada una dice qué hacer en su lugar, porque un «no puedo con eso» a secas
deja a la persona sin opciones y se va.

Un tipo de mensaje que Meta estrene mañana cae en la respuesta genérica, no en
blanco.

---

## Lo que el bot NO puede hacer, y es a propósito

No tiene herramienta para apartar piezas, cerrar un precio, acordar un envío ni
escribirle a nadie. Lo único que provoca fuera del chat es `entregar_lead`, que
arma un enlace `wa.me`. Un bot que negocia crea una obligación que la tienda
tiene que cumplir con un inventario de ayer.

## El modelo y lo que cuesta

`claude-opus-5-5` con `effort: 'low'`, que es donde rinde un chat de cuatro
renglones. En Opus 5.5 el esfuerzo por omisión es `medium`, así que va explícito
para que baje.

Las reglas van en un bloque de sistema con `cache_control`, y lo que cambia en
cada mensaje —la fecha de hoy, la plaza ya conocida— va **después** del corte. Al
revés el caché se invalida en cada turno y se paga el prompt completo cada vez.
La ventana y el simulador imprimen `caché` en cada turno: si sale en cero
siempre, algo volátil se metió en el prefijo.

En mensajería, los leads que entran por un anuncio son **gratis 7 días** —la
ventana *free entry point* de Meta—, y ésos son el grueso del volumen.

---

## La bandeja del panel: la ficha de cada cliente (2026-11-11)

El bot guarda su conversación para el modelo (`conversaciones.js`). Eso no le
sirve a una persona de la tienda, así que además apunta lo que se dijo en la
**ficha del cliente**, la que ve la sección **Clientes** del panel. La ficha y
sus reglas viven en `backend/src/clientes.js` —una sola copia, la usan el bot
(`bandeja.js`), el backend y `verificar`— y se guarda en `crm/clientes/`,
PRIVADO, con un índice en `crm/indice.json` porque el rol de la Lambda no puede
listar el bucket.

Tres reglas que cambian cómo se comporta el bot:

- **Con una persona en medio, el bot se calla.** Lo decide la ficha
  (`botContesta`): si la tienda tomó la conversación, el siguiente mensaje del
  cliente se apunta y nadie más le contesta. Ni siquiera se llama al modelo.
- **Un fallo de la bandeja no deja al cliente sin respuesta.** Si no se puede
  leer o escribir, el bot contesta igual y lo dice en el registro.
- **Contestar desde el panel todavía NO sale por WhatsApp**, porque la línea de
  Meta no está encendida. Se guarda en la conversación y la pantalla lo dice.
  Fingir que salió sería peor que no tener el botón.

Una tienda ve sólo los clientes de su plaza, y uno ajeno responde igual que uno
que no existe. Bodega no tiene sección. Dos escrituras a la vez (el bot y la
tienda) no se pisan: cada una va con `IfMatch` y se reintenta.

---

## 🔒 Lo que falta decidir

### El mayoreo de las micas

No hay precio de mayoreo en lista para ninguna presentación, ni para los dos
tipos en remate. Lo que tiene la caja es basura: la HDB figura a 120, 50 y 55
según la plaza. El bot pasa a la persona con la tienda, que es lo correcto.

### El mapa de ciudades

`COBERTURA` en `plazas.js` es un primer tiro por cercanía en carretera. Quién
atiende a un mayorista de Querétaro o de San Miguel lo sabe el dueño.

### Torreón

Desde el 2026-11-11 la portada la enseña (`consulta: true`). El bot parte de la
misma lista, `SUCURSALES_CONSULTA`, y la aparta a mano en `FUERA_DEL_BOT`
(`plazas.js`) con su razón, hasta que el dueño decida si atiende leads: hoy no
tiene número de WhatsApp en `config/site.json` ni ciudades en `COBERTURA`.

Lo que no puede volver a pasar es que el chat y la página diverjan sin que
nadie lo decida. `reglas.test.js` falla si la portada enseña una plaza que no
está ni en el bot ni apartada con su porqué, si una plaza del bot no tiene
ciudades, o si las reglas del modelo nombran una ciudad distinta de las que
atiende —la frase de presentación sale de la lista, no está escrita a mano—.

---

## Lo que sigue (fase 2, cuando Meta apruebe)

El código ya está escrito y probado. Lo que falta es desplegarlo:

1. **Las variables.** `META_APP_SECRET`, `META_VERIFY_TOKEN`, `WHATSAPP_TOKEN`,
   `WHATSAPP_PHONE_NUMBER_ID`, `ANTHROPIC_API_KEY`, `CRM_SITIO`. Ninguna lleva
   prefijo `VITE_`: Vite incrusta en el JavaScript público toda variable que
   empiece así, y por eso estuvieron meses a la vista la llave de AWS y las cinco
   contraseñas.
2. **`WHATSAPP_VERSION`** está en `v23.0` por omisión. Hay que ponerle la que
   ofrezca el panel de la app, porque las versiones de la Graph API caducan.
3. **Conectar `recibir()`** a una URL pública. Puede ser una ruta más del backend
   que ya existe o una Lambda propia; lo que no puede es contestar y pensar en la
   misma invocación.
4. **La cola y el almacén de verdad.** `colaEnMemoria()` y `enArchivo()` son para
   probar. En la nube van SQS y Neon, con la misma interfaz que
   `conversaciones.js` ya expone: cambiar de almacén no debe tocar `atender.js`.
5. **Un anuncio por plaza** con `ref=plaza=<slug>`. Es lo que hace que el lead
   llegue direccionado sin preguntar.
6. **Encender la respuesta desde el panel.** La bandeja ya existe (arriba); falta
   que `POST /crm/responder` mande por la API de WhatsApp en vez de sólo guardar.

### Pendiente: leer las fotos

Hoy una foto se contesta con la respuesta fija. Mucha gente fotografía la parte
de atrás de su teléfono o la pantalla de «Acerca del teléfono», que es
exactamente el dato que hace falta. Leerla requiere bajar el medio con el token
—Meta da un `id`, no una URL— y pasárselo al modelo, que sí ve imágenes. Es la
mejora de conversión más clara que queda.

---

## ⚠️ OneDrive y esta carpeta

El proyecto vive dentro de OneDrive y eso ya causó dos problemas reales:

- **Dejó `node_modules/@anthropic-ai` a medias**, con archivos que faltaban
  dentro del paquete. El síntoma era un `ERR_MODULE_NOT_FOUND` apuntando a un
  archivo interno del SDK, que no parece un problema de sincronización.
- **Sobrescribió este LEEME con una versión vieja** y dejó la buena en
  `LEEME-DESKTOP-<equipo>.md`, que es cómo OneDrive marca un conflicto.

Conviene excluir `node_modules/` de la sincronización, y si vuelve a aparecer un
archivo con `-DESKTOP-` en el nombre, **ésa es la versión nueva**, no la otra.
