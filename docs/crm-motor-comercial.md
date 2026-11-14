# El CRM como motor comercial: diagnóstico

**Esto es un diagnóstico. No hay una línea de código detrás, y no la habrá
hasta que el dueño apruebe qué se construye.**

Cómo leerlo: cada afirmación sobre lo que existe se comprobó en el código de
la rama `crm-meta` el 2026-11-14 y lleva el archivo donde vive. Lo que se dice
de Meta sale de su documentación para desarrolladores leída el 2026-11-13, y
se marca cuando no se pudo confirmar. Nada se probó en vivo.

La vara con la que se mide cada propuesta: son cuatro tiendas. Lo que sirve es
lo que hace que a más gente se le conteste a tiempo y que más de esas
conversaciones acaben en una venta. No más funciones.

---

## Resumen para decidir

1. **Hoy el CRM sabe quién escribió y qué pasó con la conversación. No sabe si
   compró.** Ése es el hueco del que cuelga todo lo demás: sin venta no hay
   cliente, ni recurrente, ni retorno de la publicidad.
2. **La venta no se puede sacar de Eleventa.** El punto de venta no guarda el
   teléfono de quien compra en mostrador. La única forma es que la tienda la
   marque en la ficha: un botón «Marcar venta» con monto y piezas.
3. **Lo que más ventas pierde hoy no es la falta de automatización: es el lead
   que el bot entregó y nadie tomó.** Ya está medido en la ficha y no se
   avisa a nadie. Es lo primero que se propone, y no depende de Meta.
4. **Los mensajes de seguimiento al cliente fuera de las 24 horas cuestan
   dinero, exigen plantillas aprobadas, número real, método de pago y
   consentimiento.** Hoy no hay ninguna de las cuatro cosas. Y el aviso de
   privacidad publicado no cubre mandar promociones.
5. **No se promete ROAS.** Se puede llegar a «cuánto costó cada conversación y
   cuántas acabaron en venta marcada», y sólo con un permiso de Meta que hoy
   no se tiene.

---

## 1. Lo que existe hoy, comprobado

### La ficha de cada cliente

`backend/src/clientes.js`, guardada en `crm/clientes/<id>.json`.

| Dato | Existe | De dónde sale | Límite real |
|---|---|---|---|
| Canal | Sí | `whatsapp`, `tienda`, `tickets`; `instagram` y `messenger` están en la lista **sin nada que los alimente** | Sólo WhatsApp y el alta a mano producen fichas |
| Teléfono | Sí | El de WhatsApp, o el que captura la tienda | Sólo mexicanos (`telefonoMx`); uno extranjero no genera ficha |
| Nombre | Sí | El del perfil de WhatsApp, o capturado | El del perfil suele ser un apodo |
| Plaza | Sí | El bot (ciudad o anuncio), o una persona | Puede quedar vacía: «sin plaza» sólo la ve el administrador |
| Ciudad | Campo sí, **dato casi nunca** | Sólo si alguien lo edita a mano | El bot la usa para elegir plaza, pero **no la escribe en la ficha** |
| Modelo de teléfono | Campo sí, **dato casi nunca** | Sólo a mano | Igual: el bot lo sabe en la conversación y no lo apunta |
| Tipo | Sí | `publico` o `mayorista`. Nace como público | Sólo cambia a mano |
| Etiquetas | **En los datos sí, en la pantalla no** | `editarFicha` las acepta (hasta 12) | El panel no las enseña ni deja ponerlas. Hoy nadie puede usarlas |
| Estado | Sí | `bot`, `pendiente`, `atendiendo`, `cerrada` | Describe la CONVERSACIÓN, no al cliente |
| Quién atiende | Sí | La sesión que la tomó | Es la tienda, no la persona: las tiendas comparten usuario |
| Origen | Sí | `fuente`, `anuncio` (titular), `codigo` (el `ref`), `ctwaClid` | Se guarda una vez y no se pisa. Ver abajo |
| Avisos (consentimiento) | Campo sí, **sin uso** | `editarFicha` lo acepta, con fecha y vía | El panel lo enseña («No ha dicho si quiere recibirlos») pero **no hay dónde marcarlo**, y el bot no lo pregunta |
| Mensajes | Sí | Los últimos 200, con quién y cuándo | Sin la imagen. El motivo de cierre va en la bitácora |
| Bitácora | Sí | Los últimos 100 movimientos, con autor y hora puestos por el servidor | Es lo que permite medir tiempos |
| Sin respuesta | Sí | El trabajador, al tercer fallo | Es un fallo técnico, no «la tienda no contestó» |

### El origen, que es lo que permitiría atribuir

`crm/bandeja.js` (`origenDelAnuncio`) y `crm/LEEME.md`, «El `referral` del
anuncio llega UNA vez o se pierde».

- Meta manda el anuncio **sólo en el primer mensaje**. Se guarda ahí.
- Se guardan el titular, el `ref` que pusimos nosotros y el `ctwa_clid`.
- **El id del anuncio se lee y casi nunca se guarda.** El webhook lo recibe
  (`source_id`, y la URL), pero la ficha guarda un solo campo: el titular, y
  el id sólo si el anuncio no trae titular. La URL no se guarda. Sin el id no
  se puede cruzar con el gasto: dos anuncios con el mismo titular son
  indistinguibles. **Se pierde con cada conversación nueva** y es barato de
  arreglar (ver hallazgo A1).
- Quien escribe sin venir de un anuncio no tiene origen. No es un error: no
  se sabe, y así se dice.

### Lo que el bot entrega

`crm/herramientas.js` (no se propone tocarlo). Cuando el cliente está listo, el
bot lo pasa a una plaza: la ficha queda `pendiente` con un renglón `entregar`
en la bitácora. Esa hora, más la del renglón `tomar`, es **el tiempo que la
tienda tardó en atender un lead**. El dato ya existe; nadie lo mira.

### Lo que hay de los mayoristas, y no está conectado

`src/lib/mayoristas.js` y `ventas/<plaza>.json`: el ranking de mayoristas sale
de los tickets de Eleventa, donde cada mayorista es un «producto» que se añade
a la venta. Tiene compras, piezas y visitas por cliente.

- Es la **única venta con nombre** que existe en todo el sistema.
- **No tiene teléfono**: es un nombre y un local.
- La ficha del CRM prevé el canal `tickets` (`may:<plaza>:<clave>`), pero
  **ningún código crea esas fichas**. Los dos mundos no se tocan.

### El aviso de privacidad publicado

`public/privacidad.html` (actualizado el 2026-11-12). Dice para qué se usan los
datos: contestar, mandar fotos, pasar a la sucursal, **dar seguimiento a la
consulta o al pedido** y mejorar la atención.

- Seguimiento de una consulta: **cubierto**.
- Promociones, novedades o campañas: **no aparece**. Mandarlas hoy sería usar
  los datos para algo que el aviso no dice.

---

## 2. Lo que NO se puede medir, y por qué

| Lo que se querría saber | Por qué no se puede | Qué haría falta |
|---|---|---|
| **Si el cliente compró** | Eleventa no guarda el teléfono de quien compra en mostrador. No hay con qué unir un ticket a una conversación | Que la tienda lo marque |
| **Cuánto compró** | Lo mismo | Monto y piezas al marcar |
| **Si volvió a comprar** | Lo mismo | Varias ventas marcadas en la misma ficha |
| **Cuánto costó conseguirlo** | El gasto está en la cuenta publicitaria; aquí no entra | Permiso `ads_read` (sección 4) |
| **ROAS** | Faltan las dos mitades: la venta y el gasto | Las dos de arriba, y aun así sería parcial |
| **Qué anuncio exacto lo trajo** | Se guarda el titular, no el id | Guardar `source_id` |
| **Quién de la tienda atendió** | Cada tienda entra con un usuario compartido | Un usuario por persona. **No se propone**: el dueño ya decidió lo contrario para la nómina |
| **Por qué no compró** | El cierre tiene un motivo libre que casi nadie escribe | Motivos de lista cerrada |

### La propuesta: «Marcar venta»

Un botón en la ficha, para la tienda que la atiende.

| | |
|---|---|
| **Qué captura** | Monto, piezas, y la fecha (hoy por omisión). Nada más |
| **Qué deja** | Un renglón en la bitácora, escrito por el servidor con autor y hora, y una lista `ventas` en la ficha |
| **Qué cambia** | La clase del cliente (sección 3) y, si llegó de un anuncio, que esa conversación cuenta como venta |
| **Qué NO es** | No es contabilidad ni sustituye a Eleventa. No cuadra con la caja ni se suma a ninguna cifra del panel de ventas |

**Su límite, que hay que decir antes de construirlo:** depende de que la tienda
lo marque. Lo que no se marque no existe, y la cifra siempre quedará por
debajo de la real. Vale como **piso** («al menos estas ventas salieron del
chat»), nunca como total. Es la misma regla que ya rige `Alta` en este
proyecto: sirve como cota, no como prueba.

Dos cosas lo harían menos frágil, y las dos son decisiones del dueño:

- Que cerrar una conversación **pregunte** «¿compró?» en vez de dejarlo a la
  memoria. Un gesto, lista cerrada: compró / no compró / no se sabe.
- Para los **mayoristas**, el dato ya está en los tickets. Bastaría enlazar la
  ficha con su nombre en Eleventa, una vez y a mano, y sus compras llegarían
  solas. Es el único caso donde la venta no depende de que alguien la marque.

---

## 3. Clasificación de clientes

Hoy `estado` describe la conversación y `tipo` sólo distingue público de
mayorista. Falta decir **en qué punto está la persona**. Se propone una clase,
calculada, no tecleada: sale de datos que ya hay más las ventas marcadas.

| Clase | Criterio (se calcula) | Etiqueta en pantalla | Estado típico | Prioridad | Quién atiende |
|---|---|---|---|---|---|
| **Curioso** | Escribió, y el bot no lo ha entregado a ninguna plaza | Curioso | `bot` | Baja | El bot |
| **Potencial** | El bot lo entregó a una plaza (renglón `entregar`), sin venta | Potencial | `pendiente` o `atendiendo` | **Alta**: es a quien se le está perdiendo la venta si nadie contesta | La tienda |
| **Cliente** | Una venta marcada | Cliente | cualquiera | Media | La tienda |
| **Recurrente** | Dos ventas marcadas o más, en días distintos | Recurrente | cualquiera | Alta cuando escribe | La tienda |
| **Inactivo** | Era potencial, cliente o recurrente, y lleva N días sin escribir ni comprar | Inactivo | `cerrada` o `bot` | Baja | Nadie, hasta que vuelva |
| **VIP** | **Sólo con historial**: recurrente con un monto acumulado sobre un umbral, o mayorista enlazado con sus tickets | VIP | cualquiera | La más alta | La tienda, y lo ve el administrador |

Lo que hay que decidir, y **es del dueño** (son números de negocio, como los
`🔒 CONFIRMAR` de `CLAUDE.md`):

- Los **días** para pasar a inactivo. No se propone un número sin medir: con
  las fichas reales se puede ver a los cuántos días deja de volver la gente, y
  hoy hay muy pocas porque el número es de prueba.
- El **umbral** de VIP. Lo mismo. Y no se inventa un VIP por «parece buen
  cliente»: sin ventas marcadas la clase no se asigna.
- Si el **mayorista** es una clase o sigue siendo el `tipo`. Se recomienda que
  siga siendo el tipo: un mayorista también puede ser potencial o inactivo.

Lo que **no** se propone: puntuar clientes con el modelo («lead scoring»). Con
cuatro tiendas y decenas de conversaciones al día, una regla que se puede leer
es mejor que un número que nadie sabe explicar.

**Privacidad:** la clase la ve la tienda de su plaza y el administrador, igual
que la ficha. No cambia quién ve qué.

---

## 4. Atribución de anuncios

Cuatro cosas que suelen llamarse igual y no lo son. El panel tendría que
decirlas por separado:

| | Qué es | ¿Se mide hoy? |
|---|---|---|
| **Interacción** | Alguien escribió desde un anuncio | **Sí.** Fichas con `origen.fuente = meta` |
| **Prospecto** | Dio lo necesario para venderle: modelo y ciudad | **A medias.** El bot lo sabe; la ficha no lo apunta |
| **Oportunidad** | El bot lo entregó a una tienda | **Sí.** Renglón `entregar` |
| **Venta** | Compró | **No.** Depende de «Marcar venta» |

### Lo que se puede sacar hoy, sin pedirle nada a Meta

Por anuncio (titular) o por `ref`: cuántas conversaciones, cuántas llegaron a
oportunidad, cuánto tardó la tienda en tomarlas y cuántas se cerraron sin
tomar. **Es un embudo sin dinero**, y ya dice qué anuncio trae gente que
pregunta y se va, y qué plaza deja enfriar lo que le llega.

Con una condición: los anuncios tienen que llevar `ref` por plaza
(`ref=plaza=leon`). Está escrito como pendiente en `crm/LEEME.md` desde el
principio y sigue sin hacerse. Es trabajo en el administrador de anuncios, no
de código.

### Lo que exige una API de Meta

**a) El gasto: Marketing API, permiso `ads_read`.**

- Da el gasto, las impresiones y los clics por anuncio, sólo de cuentas
  publicitarias a las que el token tenga acceso.
- **El riesgo que hay que resolver primero:** la cuenta publicitaria puede
  estar en **otro portfolio** que la app «EMPRESA CRM». Si es así, el usuario
  del sistema actual no la ve, y hay que compartirla entre portfolios o crear
  un usuario del sistema en el otro. La documentación leída no dice cómo
  queda ese caso. **El dueño tiene que mirar en qué portfolio está la cuenta
  publicitaria antes de que nadie escriba nada.**
- `ads_read` con acceso avanzado pasa por revisión de la app. Para leer las
  cuentas propias puede bastar el acceso estándar; **no se confirmó**.
- No se confirmó qué nombre le da Meta a la acción «conversación de WhatsApp
  iniciada» en esos informes.

Con esto, y sin ventas, se llega a **costo por conversación** y **costo por
oportunidad**. Eso ya sirve para apagar anuncios malos.

**b) Devolverle la venta a Meta: API de conversiones para mensajería.**

- Existe para WhatsApp Cloud API: se manda un evento de compra con el
  `ctwa_clid` de la conversación, el identificador de la cuenta de WhatsApp,
  la moneda y el monto.
- Sirve para que Meta **optimice** los anuncios hacia quien compra, no sólo
  hacia quien escribe. Es lo que más mejora el rendimiento de un anuncio de
  clic a WhatsApp.
- **Condiciones leídas:** el evento tiene que mandarse dentro de los **7 días**
  de ocurrido; hace falta un conjunto de datos ligado a la cuenta de WhatsApp;
  y los permisos `whatsapp_business_management` y
  `whatsapp_business_manage_events`.
- **No confirmado:** si la cuenta publicitaria y la cuenta de WhatsApp tienen
  que estar en el mismo portfolio. Si la cuenta publicitaria está en otro,
  puede que esto no funcione sin moverla.
- Depende de «Marcar venta», y de que se marque **pronto**: una venta
  marcada a los diez días ya no se puede mandar.
- **Privacidad:** es mandarle a Meta que una persona compró. El aviso
  publicado dice que los datos se comparten con Meta «para poder atenderte»;
  esto es otra finalidad, y habría que añadirla al aviso antes.

### Lo que no se promete

**ROAS.** Para decirlo de verdad haría falta toda la venta, y sólo se tendría
la marcada a mano de quien llegó por chat. Lo honesto es enseñar «gasto» y
«ventas marcadas» lado a lado, con la advertencia de que las segundas son un
piso. Un ROAS calculado con la mitad de las ventas se leería como el real y se
decidiría sobre él.

Tampoco se puede atribuir la venta de quien vio el anuncio y **fue a la tienda
sin escribir**. No hay dato que lo una, y no lo habrá.

---

## 5. Seguimiento y automatización

### Las reglas de WhatsApp, que mandan sobre todo lo demás

- **Dentro de las 24 horas** desde el último mensaje del cliente se le puede
  escribir libremente. Si llegó por un anuncio de clic a WhatsApp, esa
  conversación tiene además una ventana gratuita más larga (la documentación
  leída dice hasta 7 días).
- **Fuera de las 24 horas, sólo plantillas aprobadas por Meta, y se pagan.**
  Las de marketing se cobran por mensaje entregado.
- Las plantillas de marketing exigen **consentimiento previo** del cliente, y
  Meta limita cuántas recibe una persona, de todas las empresas juntas.
- Un cliente que bloquea o reporta el número **baja la calidad del número**, y
  eso reduce lo que Meta deja mandar.

Lo que falta hoy para mandar una sola plantilla:

| Requisito | Estado |
|---|---|
| Número real (no el de prueba) | Pendiente del dueño |
| Negocio verificado | Pendiente del dueño |
| Método de pago en la cuenta de WhatsApp | Pendiente del dueño |
| Plantillas escritas y aprobadas por Meta | No hay ninguna |
| Consentimiento apuntado en la ficha | El campo existe; no hay dónde marcarlo |
| El aviso de privacidad lo cubre | Seguimiento sí; promociones **no** |

Por eso el orden que se propone empieza por lo que **no** le escribe al
cliente.

### Automatización 1: avisar a la TIENDA de un lead sin atender

Es la que se recomienda construir primero.

| | |
|---|---|
| **Evento** | La ficha lleva `pendiente` más de X minutos desde el renglón `entregar`, en horario de la tienda |
| **Datos** | Bitácora y horarios. Ya existen (`sucursales-info.js`) |
| **Acción** | Un mensaje de WhatsApp **al número de la tienda**, no al cliente |
| **Mensaje** | «Hay un cliente esperando en Clientes desde hace 20 min: ‹nombre o últimos 4›, pregunta por ‹modelo›.» Sin el teléfono completo |
| **Espera** | X minutos; un segundo aviso a los 2X; y ahí se detiene |
| **Cuándo se detiene** | Alguien la toma, la cierra o la transfiere. Fuera de horario no se manda: se manda al abrir |
| **Cuándo entra un humano** | Al segundo aviso sin respuesta, lo ve el administrador en su panel |

Lo que hay que resolver antes:

- **El número de la tienda también está sujeto a las 24 horas.** Escribirle a
  una tienda que no le ha escrito al número del bot en un día exige una
  plantilla (de utilidad, que es más barata que la de marketing). Hay dos
  salidas, y hay que elegir una:
  - una plantilla de utilidad aprobada, que necesita el número real y el
    método de pago;
  - **o un aviso que no pasa por WhatsApp**: una notificación en el propio
    panel, que la tienda ya tiene abierto, más el correo que ya recibe las
    alarmas para el administrador. Se puede construir **hoy**, sin Meta.
- Se recomienda empezar por la segunda y medir. Si la tienda no mira el panel,
  el problema no se arregla con una plantilla.
- X es un número de negocio: lo pone el dueño.
- Necesita algo que corra cada pocos minutos (una regla de EventBridge que
  dispare una Lambda). Es **infraestructura nueva** y gasta de las 10
  ejecuciones de la cuenta, aunque sea un instante.

### Automatización 2: el cliente que dejó de contestar, dentro de las 24 horas

| | |
|---|---|
| **Evento** | El bot hizo una pregunta y el cliente lleva N horas sin contestar, con la ventana abierta |
| **Acción** | UN mensaje del bot. Uno |
| **Cuándo se detiene** | Siempre después de ese mensaje. Y no se manda si una persona tomó la conversación, si la ficha está cerrada, o si el cliente dijo que no |
| **Cuándo entra un humano** | Si contesta y ya estaba entregado a una tienda |
| **Costo** | Dentro de la ventana no se cobra como plantilla |

Es gratis y no necesita aprobación. **Pero el texto y cuándo insistir son
reglas del bot**: son de quien lo afina, no de esta estructura. Aquí sólo se
propone el disparador.

### Automatización 3: seguimiento después de las 24 horas

Plantilla de utilidad o de marketing, según lo que diga. **No se recomienda
empezarla** hasta tener número real, verificación, método de pago, el
consentimiento funcionando y el aviso de privacidad actualizado. Y aun
entonces: una sola vez por conversación, nunca a quien dijo que no.

### El consentimiento, que hoy no se puede dar

El campo `avisos` existe y guarda si aceptó, cuándo y por qué vía. Faltan las
dos formas de llenarlo:

- que la tienda lo marque en la ficha cuando el cliente lo dice;
- que el bot lo pregunte, **una vez** y en el momento adecuado (al cerrar una
  compra, no al saludar). Eso es regla del bot.

`null` significa «no se sabe», y no es un sí. Ninguna automatización de
marketing puede tratarlo como sí.

---

## 6. ¿Qué falta de verdad?

Cada propuesta, con lo que resuelve y lo que cuesta. Dificultad: **baja** es un
PR con pruebas; **media**, varios y con infraestructura; **alta**, depende de
terceros.

### Se recomienda

| # | Qué | Problema que resuelve | Cómo funciona | Beneficio | Depende de | Dificultad | Módulos |
|---|---|---|---|---|---|---|---|
| R1 | **Guardar el id del anuncio** | Hoy se pierde para siempre con cada conversación nueva | El webhook ya lo lee; falta que la ficha lo guarde en su propio campo, junto al titular y la URL | Poder cruzar con el gasto el día que se pueda | Nada | Baja | `meta-webhook.js`, `bandeja.js`, `clientes.js` |
| R2 | **Que el bot apunte modelo y ciudad en la ficha** | La tienda recibe un lead y tiene que leer toda la conversación para saber qué quiere | El bot ya llama a una herramienta al entregar; la ficha tomaría de ahí los dos datos | La tienda contesta más rápido; el «prospecto» se vuelve medible | **Toca `herramientas.js`, que es de quien afina el bot** | Baja | `herramientas.js` (suyo), `bandeja.js` |
| R3 | **Aviso de lead sin atender** (Automatización 1, por el panel y correo) | Leads entregados que se enfrían | Sección 5 | Es la venta que hoy se pierde con más seguridad | El dueño pone X; EventBridge | Media | Lambda nueva pequeña, `ClientesPanel.jsx` |
| R4 | **Marcar venta** | No se sabe si alguien compró | Sección 2 | Abre la clasificación, el embudo con final y, después, la atribución | Disciplina de la tienda | Baja | `clientes.js`, `index.js`, `ClientesPanel.jsx` |
| R5 | **Cerrar con motivo de lista cerrada** | No se sabe por qué no compró | Compró / no había su modelo / precio / dejó de contestar / otro | «No había su modelo» es una lista de compra para bodega | R4 | Baja | Los mismos |
| R6 | **Clase del cliente** (sección 3) | La bandeja trata igual al curioso que al recurrente | Calculada; se enseña como etiqueta y ordena | La tienda sabe a quién contestar primero | R4; los números los pone el dueño | Baja | `clientes.js`, `ClientesPanel.jsx` |
| R7 | **Embudo por anuncio y por plaza, sin dinero** | No se sabe qué anuncio trae compradores ni qué plaza deja enfriar | Cuentas sobre las fichas: conversaciones, oportunidades, tiempo en tomar, ventas marcadas | Decidir publicidad con datos propios, sin permiso de nadie | R1, R4; anuncios con `ref` | Media | Sección nueva del administrador, con las piezas de `Diseno.jsx` |
| R8 | **Consentimiento** en la ficha | No se puede mandar nada de marketing sin él | Un control para la tienda; el bot lo pregunta una vez | Requisito legal y de Meta | Actualizar el aviso de privacidad | Baja | `ClientesPanel.jsx`; regla del bot (suya) |

### Depende de terceros: sólo después

| # | Qué | Depende de | Dificultad |
|---|---|---|---|
| T1 | **Gasto por anuncio** (`ads_read`) | Saber en qué portfolio está la cuenta publicitaria; quizá revisión de Meta | Alta |
| T2 | **Devolver la venta a Meta** (API de conversiones) | R4, T1, el aviso de privacidad, y que la venta se marque en 7 días | Alta |
| T3 | **Plantillas de seguimiento** | Número real, verificación, método de pago, R8 | Alta, y cuesta por mensaje |
| T4 | **Instagram y Messenger** | Verificación y revisión de Meta. Diseñado en `docs/crm-instagram-messenger.md` (PR de la Fase A) | Alta |
| T5 | **Enlazar mayoristas con sus tickets** | Que alguien empareje a mano cada ficha con su nombre en Eleventa, una vez | Media |

### Descartado, y por qué

| Qué | Por qué no |
|---|---|
| **ROAS en el panel** | Con ventas marcadas a mano es una cifra parcial que se leería como total |
| **Leer la venta de Eleventa por teléfono** | El dato no existe en el punto de venta |
| **Un usuario por empleado** | El dueño ya decidió que la tienda comparte usuario. Se pierde saber qué persona atendió; se acepta |
| **Puntuar clientes con el modelo** | Un número que nadie sabe explicar, para decenas de conversaciones al día |
| **Campañas masivas desde el CRM** | Es lo que más rápido quema un número de WhatsApp, y no hay consentimientos |
| **Recordatorios en cadena al cliente** | «Nunca insistir». Uno, y se detiene |
| **Un tablero de tiempo real** | La bandeja ya ordena por lo urgente. Otro tablero sería otra pantalla que mirar |
| **Una plataforma de CRM externa** | Ya se decidió CRM propio (`DECISIONS.md`) |
| **Unir fichas duplicadas sola** | Sin un dato seguro que las una, un emparejado falso mezcla a dos personas. Se hace a mano, como ya existe |
| **Etiquetas libres** | Existen en los datos y no se usan. Con la clase calculada y los motivos de lista cerrada dejan de hacer falta. Se recomienda **no** exponerlas, y no borrarlas de los datos: no estorban |

Nada de lo que existe se propone eliminar.

---

## 7. Hallazgos, por prioridad

### Crítica

- **C1. Un lead entregado que nadie toma no avisa a nadie.** El bot le dijo al
  cliente que la tienda le escribirá. Si la tienda no mira el panel, eso es
  una promesa rota y una venta perdida, y hoy sólo se nota entrando a mirar.
  Lo arregla R3.
- **C2. No existe la venta.** Todo lo que se llame «motor comercial» cuelga de
  este dato. Lo arregla R4.

### Alta

- **A1. El id del anuncio no llega a la ficha** (salvo que el anuncio no tenga titular). Cada conversación que entra sin él
  es atribución que no se podrá recuperar. Lo arregla R1, y conviene hacerlo
  antes de encender anuncios con el número real.
- **A2. El bot sabe el modelo y la ciudad y la ficha no.** La tienda relee la
  conversación entera. Lo arregla R2, que necesita a quien afina el bot.
- **A3. El aviso de privacidad no cubre promociones ni devolverle la compra a
  Meta.** Hay que actualizarlo **antes** de T2 y T3, no después.
- **A4. Los anuncios no llevan `ref` por plaza.** Sin él el bot tiene que
  preguntar la ciudad y el embudo por plaza sale del titular. No es código.
- **A5. No se sabe en qué portfolio está la cuenta publicitaria.** Decide si T1
  y T2 son posibles. Lo mira el dueño en Meta Business, cinco minutos.

### Media

- **M1. El consentimiento no se puede marcar** (R8).
- **M2. Cerrar no dice por qué** (R5).
- **M3. Los canales `instagram`, `messenger` y `tickets` están en la lista sin
  nada detrás.** No hacen daño, pero no deben enseñarse como filtro hasta que
  reciban datos.
- **M4. Las etiquetas existen en los datos y no en la pantalla.**
- **M5. «Sin respuesta» significa fallo técnico, no «la tienda no contestó».**
  Con R3 habrá dos avisos parecidos; hay que nombrarlos distinto.

### Futura

- **F1.** Gasto por anuncio (T1) y devolver la venta a Meta (T2).
- **F2.** Plantillas de seguimiento (T3).
- **F3.** Enlazar mayoristas con sus tickets (T5).
- **F4.** Instagram y Messenger (T4).
- **F5.** Teléfonos no mexicanos: hoy no generan ficha.

---

## Plan por fases

Cada fase es útil sola, y ninguna obliga a la siguiente.

| Fase | Qué | Depende de Meta | Lo que decide el dueño antes |
|---|---|---|---|
| **B1. Que no se pierda lo que ya llega** | R1 (id del anuncio), R3 (aviso de lead sin atender, por panel y correo), R2 con quien afina el bot | No | Los minutos de espera del aviso |
| **B2. Saber si compró** | R4 (marcar venta), R5 (motivos de cierre), R6 (clase) | No | Días para «inactivo», umbral de VIP, la lista de motivos |
| **B3. Mirar el embudo** | R7, con anuncios que lleven `ref` | No | Poner `ref` en los anuncios |
| **B4. Poder escribirle después** | R8 (consentimiento), aviso de privacidad, y luego T3 | **Sí**: número real, verificación, pago, plantillas | El texto del aviso y de cada plantilla; cuánto gastar |
| **B5. Cerrar el círculo con la publicidad** | T1 y T2 | **Sí**: permisos y portfolio | En qué portfolio está la cuenta publicitaria |

**Lo que se le pide al dueño para seguir:** aprobar o cambiar B1, y contestar
A5. Con eso se puede empezar sin esperar a Meta.

---

## Lo que este documento NO pudo comprobar

- Ninguna cifra de uso real: el número es de prueba y casi no hay fichas. Los
  umbrales (minutos, días, montos) no se pueden medir todavía.
- De Meta, sin confirmar: el caso de la cuenta publicitaria en otro portfolio;
  si `ads_read` necesita revisión para cuentas propias; el nombre de la acción
  de conversación de WhatsApp en los informes; si la API de conversiones exige
  el mismo portfolio; el límite exacto de plantillas de marketing por persona.
- Los precios de WhatsApp cambian: la tabla vigente hay que mirarla el día que
  se decida T3, no fiarse de este documento.
- Que el `referral` traiga siempre `source_id`: lo dice la documentación; con
  el número de prueba no ha llegado ningún anuncio real.
