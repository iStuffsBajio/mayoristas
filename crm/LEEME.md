# El CRM de Meta

El bot que atiende la publicidad: contesta por WhatsApp qué hay y a cuánto,
manda la foto y entrega el cliente a su tienda.

Está completo y probado de punta a punta, **incluida la estructura para
producción** (webhook, cola, trabajador y almacenes en S3). Lo que falta es
aplicarla en AWS —va a mano, los pasos están abajo— y el papeleo de Meta.

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
                    (reexporta backend/src/meta-webhook.js: ver «Producción»)
  whatsapp-api.js   mandar texto e imágenes por la Cloud API
  conversaciones.js dónde se guarda lo ya hablado
  atender.js        de un mensaje recibido a una respuesta mandada
  handler.js        el acuse rápido y el trabajador, separados

  ── producción ──
  almacen-s3.js     conversaciones y fichas en S3, con escritura condicional
  trabajador.js     la segunda Lambda: lee de la cola y llama a trabajar()
  falsos.js         un S3 y una cola FIFO de mentira, para las pruebas

  ── probarlo ──
  servidor.mjs      la ventana en el navegador
  probar.mjs        hablar con el cerebro directo
  simular.mjs       cargas de Meta por el camino completo
  evaluar.mjs       mide a un modelo contra 29 escenarios, con inventario sembrado
  *.test.js         172 pruebas que fijan todo lo anterior
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

### Los cinco niveles miden cosas distintas, y los cinco hacen falta

| | Qué comprueba | Necesita API |
|---|---|---|
| `npm test` | que las **herramientas** cumplen las reglas | no |
| `npm run crm -- --guion` | que el **modelo las obedece** | sí |
| `npm run crm:simular` | que la **fontanería** funciona | sólo los que piensan |
| `npm run crm:web` | cómo **queda** la conversación en un teléfono | sólo los que piensan |
| `npm run crm:evaluar` | cuántas veces el modelo **obedece**, medido sobre 29 escenarios | sí, ~$0.04 por corrida |

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
—SQS FIFO en AWS, `colaEnMemoria()` en una sola máquina—. Cómo queda en AWS
está en «La estructura de producción».

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

`claude-haiku-5-5` con `effort: 'low'`, desde el 2026-11-11: al dueño le pareció
caro Opus para un chat de cuatro renglones, y Haiku cuesta **cuarenta veces
menos** por token. El modelo y su precio viven en `modelo.js`, y las tres
pantallas de prueba calculan el costo de ahí. Para comparar sin tocar código:
`CRM_MODELO=claude-sonnet-5-5 npm run crm:evaluar`.

### Medido con la llave, el 2026-11-11

`npm run crm:evaluar` pone a un modelo frente a 29 escenarios con inventario
sembrado y comprueba lo que se puede decidir con una regla. Haiku, 3 pasadas por
escenario, con el prompt definitivo:

| | respuestas sin fallo |
|---|---|
| Escenarios que se fueron afinando mirando sus fallos (21) | 63/63 · 100% |
| **Escenarios reservados, que el prompt nunca vio (8)** | 21/24 · 88% |
| Total | 108/111 · 97% |

Dos de los tres fallos de los reservados eran un falso positivo del evaluador
—Haiku dijo «no puedo apartar nada», que es lo correcto— y se corrigió el
evaluador; el tercero es de estilo, 57 palabras donde el tope es 50. Sobre las
111 respuestas guardadas, **ninguna ofrece apartar**, ninguna inventa un precio y
ninguna da una cantidad de inventario.

**Cuesta unas 0.4 milésimas de dólar por respuesta**: toda la evaluación, 111
respuestas, salió en $0.04 USD. Una conversación de 8 turnos ronda los $0.003.

**El número que importa es el de los reservados, no el de los afinados.** Un
prompt ajustado a sus propios escenarios los pasa por construcción; pasar los que
no ha visto es lo que se parece a lo que pasará de verdad. Con tres pasadas por
escenario, 24 respuestas dan un margen de error grande: léase «entre 85% y 100%»,
no «88%».

### Tres cosas que midiéndolo salieron mal, y por qué

- **Un ejemplo de lo que NO hacer lo copiaba el modelo.** El prompt decía «no
  ofrezcas dos cosas a la vez, como *¿te la aparto o te paso con la tienda?*», y
  Haiku ofrecía apartar en 11 de 63 respuestas, cuando el bot no puede apartar
  nada. Al quitar el ejemplo malo y decir una vez, arriba, qué SÍ se puede
  proponer, bajó a cero. Un ejemplo marcado como malo sigue siendo un ejemplo.
- **Nombrar las palabras prohibidas las induce.** Al listar «apartar, reservar…»
  Haiku empezó a decir «no puedo apartar nada»: correcto, pero la palabra
  apareció. Es el precio de prohibir por escrito; el evaluador distingue ofrecer
  de negarse a ofrecer.
- **Leer las respuestas encontró lo que ninguna expresión vio.** «Ya les dejé tu
  pedido»: falso, el enlace no manda nada hasta que la persona lo toca. Salió en 1
  de 195 respuestas. Un evaluador automático no sustituye leer.

### Cuándo volver a correrlo

Cada vez que cambie **el prompt** (`REGLAS` en `cerebro.js`), **el modelo**, o una
**herramienta** que le devuelva datos distintos. Un cambio de una frase en el
prompt movió resultados en esta misma sesión.

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
tienda) no se pisan: cada una va con `IfMatch` y se reintenta. El bot y el panel
usan el MISMO almacén (`backend/src/clientes-s3.js`), así que la ficha y su
renglón en el índice los escribe un solo código.

**«Sin respuesta».** Si el bot no pudo contestarle a alguien y se rindió, la
ficha lo dice (`marcarSinRespuesta`): sube al principio de la bandeja con una
marca roja, el panel avisa arriba cuántos hay, y la ficha explica qué pasó. Se
quita sola cuando alguien le contesta o la tienda cierra la conversación. No
cambia el estado: el bot puede contestar el siguiente mensaje.

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

Entró al bot el 2026-11-11, a petición del dueño. Atiende la Comarca Lagunera
—Torreón, Gómez Palacio, Lerdo, San Pedro de las Colonias, Matamoros— y los
estados de Coahuila y Durango (`COBERTURA` en `plazas.js`), como primer tiro
por cercanía: el dueño lo afina. **Mientras no tenga su número de WhatsApp en
el panel (Diseño → WhatsApp), sus leads llegan al número general**: el cliente
no se pierde, pero no cae directo en la tienda.

Lo que no puede volver a pasar es que el chat y la página diverjan sin que
nadie lo decida. `reglas.test.js` falla si la portada enseña una plaza que no
está ni en el bot ni apartada con su porqué, si una plaza del bot no tiene
ciudades, o si las reglas del modelo nombran una ciudad distinta de las que
atiende —la frase de presentación sale de la lista, no está escrita a mano—.

---

## La estructura de producción (2026-11-11)

```
Meta ──POST──▶ /meta/webhook ──▶ cola FIFO ──▶ trabajador ──▶ WhatsApp
               (backend, ms)     (SQS)         (Lambda aparte)
                                   │                 │
                                   ▼                 ▼
                              cola de fallidos   S3: crm/conversaciones/
                                                     crm/clientes/  crm/indice.json
```

Todo el código está escrito y probado con un S3 y una cola de mentira
(`falsos.js`). **En AWS no se ha aplicado nada**: no hay colas, ni función, ni
permisos. Eso va a mano, con los pasos de abajo.

| Pieza | Dónde | Qué hace |
|---|---|---|
| Ruta `/meta/webhook` | `backend/src/meta.js`, registrada en `index.js` | GET: el enganche. POST: valida la firma y encola. Milisegundos |
| Lectura del webhook y `recibir()` | `backend/src/meta-webhook.js` | Se mudó de `crm/` porque el zip del backend sólo lleva `backend/src`. `crm/webhook.js` y `crm/handler.js` lo reexportan: una sola copia |
| Cola | SQS FIFO, parámetros en `infra/crm-colas.json` | Grupo = teléfono, deduplicación = id del mensaje de Meta |
| Trabajador | `crm/trabajador.js` | Recibe de la cola y llama a `trabajar()` |
| Conversaciones | `enS3()` en `crm/almacen-s3.js` | Un archivo por teléfono en `crm/conversaciones/` |
| Fichas | `bandejaEnS3()`, sobre `backend/src/clientes-s3.js` | Las mismas llaves y el mismo índice que el panel |

### Por qué una cola FIFO, y qué garantiza

La gente manda «hola» y «tienes para iphone 13?» en dos mensajes seguidos.
Atendidos a la vez, los dos leen la conversación antes de que el otro la guarde
y el segundo pisa al primero. Con el **teléfono como grupo**, SQS no entrega el
segundo mensaje de un teléfono hasta que el primero se borró —o se rindió—.
Teléfonos distintos sí van a la vez.

Y el **id del mensaje de Meta como id de deduplicación**: si Meta repite el
envío dentro de los cinco minutos que SQS recuerda, la cola ni lo acepta.
Pasado ese rato lo para `yaAtendido()`, que vive en la conversación.

### Las escrituras van condicionadas, y eso es lo que evita perder datos

S3 no tiene transacciones. Tiene `If-Match` («escribe sólo si sigue siendo lo
que leí») y con eso basta:

- **La ficha.** El bot apunta un mensaje mientras alguien de la tienda edita la
  misma ficha. Sin condición gana el último y lo del otro desaparece sin que
  nada falle. Con ella, el segundo recibe un 412, vuelve a leer y aplica su
  cambio encima. Hasta 5 veces (`REINTENTOS_FICHA`).
- **La conversación.** La cola ya impide dos trabajadores con el mismo
  teléfono; la condición está para el día que no (una entrega doble de SQS).
  De dos que marquen el mismo mensaje a la vez, sólo uno escribe: una
  respuesta, no dos.

Y `enS3()` **no se traga los errores de lectura**: sólo «no existe» es una
conversación nueva. Un S3 caído leído como «nueva» haría que el bot saludara de
cero a media plática.

### 🔒 El límite de concurrencia de la cuenta es 10, y el trabajador lo comparte

Las diez ejecuciones simultáneas de la cuenta son para TODO: el panel, el login
y ahora el bot. Un turno del bot dura segundos —piensa— y una petición del
panel, milisegundos; sin tope, una racha de mensajes de un anuncio podría
ocupar las diez y dejar el panel sin sitio.

- El disparador de la cola lleva **`MaximumConcurrency: 2`**, el mínimo que SQS
  permite. El bot ocupa como mucho 2 de las 10; quedan 8 para el panel.
- **No** se usa concurrencia reservada: AWS exige dejar 10 sin reservar y la
  cuenta tiene exactamente 10, así que no se puede reservar ni una.
- Con dos a la vez y turnos de 5 a 15 segundos salen de 8 a 24 respuestas por
  minuto. Lo que no cabe **espera en la cola**, no se pierde. Para 5,000
  mensajes al mes sobra; si un anuncio trajera más de eso por minuto, lo que
  toca es pedir a AWS que suba el límite de la cuenta, no subir este número.
- El webhook corre en el backend y también cuenta, pero dura milisegundos.

### Los tiempos

| | Valor | Dónde |
|---|---|---|
| Tiempo límite del trabajador | **90 s** | `TIEMPO_TRABAJADOR_S` y la función |
| Margen para cerrar bien | 10 s | `MARGEN_MS` |
| Visibilidad de la cola | **180 s** | `VISIBILIDAD_S` y la cola |
| Tiempo límite del cliente de Claude | lo pone el dueño | `crm/cerebro.js` |

La visibilidad es MAYOR que el tiempo de la función: si fuera menor, SQS daría
por perdido un turno que sigue pensando y se lo entregaría a otra invocación.
No es mucho mayor a propósito: un turno que falla no se reintenta hasta que la
visibilidad vence, y mientras tanto ese teléfono espera.

El trabajador no espera a que la Lambda lo mate. A los 80 segundos cierra él:
desmarca el mensaje, le dice a SQS que falló y al turno abandonado le prohíbe
mandar. Sin eso, una función muerta por tiempo deja el mensaje marcado como
visto y su reintento se descarta por «repetido»: el cliente no recibe nada.

**El tiempo límite del cliente de Claude tiene que quedar por debajo de 80 s**
contando sus propios reintentos, o quien corta es el trabajador y no el
cliente.

### Cuando el bot no puede: reintentos, fallidos y el aviso en el panel

- SQS entrega cada mensaje hasta **3 veces** (`MAX_ENTREGAS`). Entre una y
  otra pasan los 180 s de visibilidad.
- En la **tercera** que falla, el trabajador marca la ficha como «sin
  respuesta» ANTES de rendirse: primera de la bandeja, en rojo, con un aviso
  arriba. Crea la ficha si no existía.
- El mensaje pasa a la **cola de fallidos** (`istuffs-crm-fallidos.fifo`), que
  lo guarda 14 días como evidencia. El aviso es la ficha, no esa cola.
- Si ni siquiera se pudo marcar la ficha (S3 caído), queda la alarma de
  CloudWatch sobre la cola de fallidos (`alarma` en `infra/crm-colas.json`).
- El bot **no se queda callado** con ese cliente: si vuelve a escribir y ya
  funciona, le contesta y la marca se quita.

Hay un caso más fino, y también sale en el panel: la función muere a media
respuesta (sin memoria) con el mensaje ya marcado como visto. El reintento lo
ve «repetido»; el trabajador mira la ficha, y si después de ese mensaje no
habló nadie, lo marca «sin respuesta» en vez de darlo por contestado. No lo
contesta a ciegas porque la respuesta pudo haber salido.

### El paquete del trabajador

```bash
npm run crm:empaquetar     # → scripts/out/crm-trabajador/index.mjs
```

El backend se sube como zip de `backend/src` + `backend/node_modules`. El
trabajador no puede: importa de `crm/`, de `backend/src/` y de `src/lib/`, y
sus dos paquetes (`@anthropic-ai/sdk`, `@aws-sdk/client-s3`) están en el
`package.json` de la RAÍZ. Así que `scripts/empaquetar-crm.mjs` lo arma en **un
solo archivo** siguiendo los `import` de verdad:

- El empaquetador es **esbuild**, el que ya trae Vite. No se instaló nada.
- Las dependencias salen del `node_modules` de la raíz (`npm ci`), las mismas
  versiones con las que corren las pruebas. Nada se deja «para que lo ponga
  Lambda». Aunque exista `backend/node_modules`, el SDK de AWS sale de la raíz:
  si no, el paquete llevaría dos copias.
- Después de armarlo **lo carga** y llama al handler con un evento vacío. Un
  import que falta no falla al empaquetar: falla al arrancar la función.
- Dentro no va ningún dato ni ningún secreto. El inventario, los teléfonos de
  las tiendas y el índice de fotos se leen por HTTPS al contestar.

Hoy pesa unos 2.7 MB: 20 archivos de la casa y el resto, los dos SDK.

### Las variables (nombres; los valores no van en ningún archivo)

| Función | Variable | Para qué |
|---|---|---|
| `istuffs-backend` | `META_APP_SECRET` | validar la firma del webhook |
| `istuffs-backend` | `META_VERIFY_TOKEN` | el enganche (GET) |
| `istuffs-backend` | `CRM_COLA_URL` | la URL de `istuffs-crm-mensajes.fifo` |
| `istuffs-crm-trabajador` | `ANTHROPIC_API_KEY` | el modelo |
| `istuffs-crm-trabajador` | `WHATSAPP_TOKEN` | mandar por la Cloud API |
| `istuffs-crm-trabajador` | `WHATSAPP_PHONE_NUMBER_ID` | el número de la casa |
| `istuffs-crm-trabajador` | `WHATSAPP_VERSION` | la versión de la Graph API (por omisión `v23.0`; caducan) |
| `istuffs-crm-trabajador` | `S3_BUCKET`, `S3_REGION` | dónde están las fichas y el inventario |
| `istuffs-crm-trabajador` | `CRM_SITIO` | de dónde se sirven las fotos |
| `istuffs-crm-trabajador` | `CRM_MODELO` | opcional; por omisión Haiku (`modelo.js`) |

Ninguna lleva prefijo `VITE_`: Vite incrusta en el JavaScript público toda
variable que empiece así. Y sin `CRM_COLA_URL` el webhook contesta **500**, no
200: Meta guarda el mensaje y reintenta en vez de darlo por entregado.

### Los permisos, en `infra/`

Se aplican a mano. En los cuatro hay que sustituir `REGION` y `CUENTA`.

| Archivo | A quién | Qué da |
|---|---|---|
| `crm-trabajador-rol.json` | el rol nuevo del trabajador | S3 sólo bajo `crm/*`, leer y borrar de su cola, su registro |
| `crm-backend-encolar.json` | el rol del backend | `sqs:SendMessage` en la cola, nada más |
| `crm-ci-desplegar.json` | el usuario que despliega desde GitHub | publicar el código de la función nueva |
| `istuffs-s3-policy.json` | el usuario que sube inventarios | ahora también niega `crm/*`: la automatización no toca clientes |

`crm-colas.json` no es una política: son los parámetros de las colas, de la
función, del disparador y de la alarma. **Sus números tienen que coincidir con
`crm/trabajador.js`** y hay una prueba que falla si se separan.

El trabajador no necesita permiso para leer el inventario: lo lee por HTTPS
del prefijo público, como cualquier visitante.

### Desplegarlo: los pasos, en orden

El orden importa: Meta no se conecta hasta el final, cuando todo lo de atrás
ya está probado. Hasta el paso 14 no le llega nada a ningún cliente.

1. **Crear la cola de fallidos** `istuffs-crm-fallidos.fifo` (SQS, tipo FIFO)
   con los atributos de `fallidos` en `infra/crm-colas.json`.
2. **Crear la cola** `istuffs-crm-mensajes.fifo` con los atributos de `cola`:
   visibilidad 180 s, retención 1 día, y como cola de mensajes fallidos la del
   paso 1 con **máximo de recepciones 3**. Deduplicación por contenido:
   **desactivada** (el id lo pone el backend).
3. **Crear el rol del trabajador** (IAM, para Lambda) y pegarle
   `infra/crm-trabajador-rol.json` como política en línea.
4. **Crear la función** `istuffs-crm-trabajador` con los datos de `funcion`:
   Node.js 22, handler `index.handler`, tiempo límite **90 s**, 512 MB, y el rol
   del paso 3. El código inicial da igual: lo pone el paso 7.
5. **Ponerle sus variables** (la tabla de arriba). Con el guion de la casa, que
   nunca imprime un valor y no pisa las demás:
   `LAMBDA_FUNCION=istuffs-crm-trabajador node backend/scripts/anadir-variable-lambda.js NOMBRE=valor --aplicar`
6. **Darle permiso al despliegue**: pegar `infra/crm-ci-desplegar.json` al
   usuario cuyas llaves son `AWS_DEPLOY_ACCESS_KEY` en GitHub.
7. **Publicar el código**: en GitHub, Actions → «Desplegar trabajador del
   CRM» → Run workflow. Corre las pruebas del CRM, empaqueta y sube.
8. **Crear el disparador** de la función con los datos de `disparador`: origen
   la cola del paso 2, **lote de 1**, **simultaneidad máxima 2**, y «Informar
   de errores de elementos del lote» **activado** (`ReportBatchItemFailures`).
   Sin esa casilla, un turno fallido se da por bueno y SQS borra el mensaje.
9. **Darle permiso al backend para encolar**: pegar
   `infra/crm-backend-encolar.json` al rol `istuffs-backend-role-…`.
10. **Variables del backend**, con el mismo guion (NUNCA con el CLI a pelo,
    que reemplaza el conjunto entero): `META_APP_SECRET`, `META_VERIFY_TOKEN`
    y `CRM_COLA_URL`.
11. **Publicar el backend**: sale solo al fusionar a `main` (toca `backend/`),
    o Actions → «Desplegar backend» → Run workflow.
12. **Crear la alarma** de `alarma` en CloudWatch, con aviso al correo: salta
    si la cola de fallidos tiene algún mensaje.
13. **Probar el enganche sin Meta.** Abrir en el navegador, con el token real:
    `https://<URL del backend>/meta/webhook?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=123`
    Tiene que contestar `123` a secas. Con otro token, 403.
14. **Conectar Meta**: en la app, WhatsApp → Configuración → Webhook. URL de
    devolución de llamada: la del paso 13 sin los parámetros. Token de
    verificación: el de `META_VERIFY_TOKEN`. Suscribir el campo **`messages`**.
15. **Probar de verdad**: escribir «hola» al número desde un teléfono. La
    respuesta llega en segundos y la conversación aparece en Clientes.

**Para apagarlo** sin perder nada: deshabilitar el disparador del paso 8. Los
mensajes se quedan en la cola hasta un día y se atienden al volver a
habilitarlo. Para cortar del todo, quitar la suscripción del paso 14.

### Lo que NO se ha podido comprobar

- **Nada de esto ha corrido contra el SQS ni el S3 de verdad.** Las pruebas
  usan falsos que imitan `If-Match`, el orden por grupo y la cola de fallidos.
  La primera prueba real es el paso 15.
- **El paquete se carga, pero no ha atendido un turno** fuera de las pruebas:
  eso necesita la llave y el bucket.
- **Un turno abandonado por tiempo que estuviera justo mandando** en ese
  instante puede llegar además del reintento. La bandera lo evita antes y
  después del envío, no durante.
- **Contestar desde el panel sigue sin salir por WhatsApp** (abajo, punto 2).

---

## Lo que sigue

1. **Un anuncio por plaza** con `ref=plaza=<slug>`. Es lo que hace que el lead
   llegue direccionado sin preguntar.
2. **Encender la respuesta desde el panel.** La bandeja ya existe (arriba); falta
   que `POST /crm/responder` mande por la API de WhatsApp en vez de sólo guardar.
   Hasta entonces, a un cliente «sin respuesta» hay que escribirle desde el
   WhatsApp de la tienda.

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

---

## Los datos de cada tienda y los emojis (2026-11-12)

Lo pidió el dueño tras probar el bot: preguntó el domicilio y el bot no tenía con
qué contestar, porque el sistema sólo conocía el NOMBRE de cada sucursal.

**`sucursales-info.js`** guarda lo que el bot dice de cada tienda: domicilio,
enlace de mapa y horario. La herramienta `datos_de_sucursal` lo entrega.

- **Lo que no está, no se dice.** Un campo `null` es «no se sabe». El bot dice
  que la tienda se lo confirma: una hora inventada manda a alguien a una puerta
  cerrada. Hay escenarios en el evaluador que fallan si el bot da una hora.
- **Toda plaza del bot tiene que estar en la lista**, aunque sea con `null`; hay
  prueba. Añadir una tienda obliga a decidir qué se dice de ella.
- **El enlace de mapa va limpio.** Se usa el `cid` de Google
  (`https://www.google.com/maps?cid=…`), que sale del enlace largo: la parte
  hexadecimal tras los dos puntos de `!1s0x…:0x…`, pasada a decimal. El enlace
  copiado de Google Maps trae rastreadores (`entry=ttu&g_ep=…`).
- **Hoy sólo León tiene datos.** San Luis, Aguascalientes y Torreón esperan el
  enlace, el domicilio y el horario que pase el dueño. León no tiene horario.

**Emojis.** Permitidos con tope: uno o dos por mensaje, al saludar, celebrar o
despedir; ninguno junto a un precio ni en una lista. El evaluador castiga más de
dos o dos pegados, no la presencia. El mensaje del lead que va a la tienda sigue
SIN emojis (se rompen al pasar por la URL del enlace de wa.me).

**El evaluador quita los enlaces del texto** antes de revisar cantidades y
precios (un «%20pz» de una dirección contaba como cantidad). Para comprobar un
enlace hay `debeCrudo`, que mira el texto tal cual salió.
