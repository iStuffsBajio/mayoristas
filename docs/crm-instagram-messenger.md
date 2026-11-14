# Instagram DM y Messenger: cómo entrarían, y qué exige Meta antes

**Esto es un DISEÑO. No hay nada integrado.** En el repositorio no existe una
sola línea que reciba o mande un mensaje de Instagram o de Messenger, y no debe
enseñarse como canal conectado en ninguna pantalla hasta que lo esté.

Lo que dice de Meta sale de su documentación para desarrolladores leída el
2026-11-13. Nada de eso se ha probado en vivo: sin la revisión de la app no se
puede.

---

## Lo primero: por qué no se puede probar hoy

| Requisito | Estado hoy | Qué bloquea |
|---|---|---|
| **Acceso avanzado** a los permisos de mensajes | No pedido | Con acceso estándar la app sólo conversa con gente que tiene un rol en la propia app. Un cliente de verdad no recibe respuesta |
| **Revisión de la app** (App Review) | No pedida | Es como se obtiene el acceso avanzado. Meta pide una grabación de pantalla del flujo y una explicación de para qué se usa cada permiso |
| **Verificación del negocio** | **Pendiente del dueño** | Meta la exige a toda app que pida acceso avanzado. Sin ella la revisión ni se abre |
| Cuenta de Instagram **profesional** enlazada a una página de Facebook | Sin comprobar | Los DM de una cuenta personal no llegan a la API |

**El orden lo impone Meta:** verificar el negocio, luego pedir la revisión,
luego probar con clientes. La verificación ya estaba pendiente por WhatsApp
(el número real); es la misma y desbloquea las dos cosas.

Lo único que sí se puede probar antes: una conversación entre la app y una
persona con rol en la app (el dueño, un probador). Sirve para comprobar que el
tubo funciona, no para atender a nadie.

## Los permisos que hay que pedir

| Canal | Permiso | Depende de |
|---|---|---|
| Messenger | `pages_messaging` | `pages_manage_metadata`, `pages_show_list` |
| Instagram, por la página de Facebook | `instagram_manage_messages` | los tres de arriba (la lista completa de dependencias no se confirmó) |
| Instagram, con inicio de sesión de Instagram | `instagram_business_manage_messages` | otro flujo y otro dominio (`graph.instagram.com`); **no se leyó a fondo y no se recomienda**: obliga a un segundo tipo de token |

Se recomienda el camino **por la página de Facebook** para los dos canales: un
solo token de página sirve a ambos, y es el mismo usuario del sistema que ya
tiene el token de WhatsApp.

Lo que la documentación leída **no dice** y habrá que confirmar al pedir la
revisión:

- Si el token del usuario del sistema que ya existe puede generar el token de
  página, o hay que asignarle la página en el portfolio primero.
- El valor exacto de `object` en el webhook de Instagram (el de Messenger es
  `page`).
- El tope de caracteres de un mensaje de texto en cada canal.
- Si la etiqueta `HUMAN_AGENT` —que alarga la ventana de respuesta de 24 horas
  a 7 días para un agente humano— necesita su propia aprobación.

## Cómo entraría, reutilizando lo que hay

El enganche, la cola y el trabajador son los mismos. Lo que cambia son las dos
puntas: leer la carga y mandar la respuesta.

```
Meta ──▶ /meta/webhook ──▶ leerCarga ──▶ cola FIFO ──▶ trabajador ──▶ enviar
          (la misma URL       (rama nueva     (la misma)   (el mismo)     (rama nueva
           y la misma firma)   por `object`)                               por canal)
```

### 1. El enganche (`backend/src/meta-webhook.js`)

- **La firma no cambia.** Los tres productos firman con `X-Hub-Signature-256`
  y el secreto de la app. `META_APP_SECRET` sirve tal cual si los tres viven en
  la MISMA app, que es lo que se recomienda.
- **La verificación (GET) no cambia.**
- **`leerCarga` gana una rama.** WhatsApp llega en `entry[].changes[].value`;
  Messenger e Instagram en `entry[].messaging[]`, con `sender.id`,
  `recipient.id`, `timestamp` y `message.{mid,text,attachments}`. La rama nueva
  produce el MISMO mensaje normalizado que ya consume el trabajador, con dos
  campos más: `canal` (`'instagram'` o `'messenger'`) y `de` = el identificador
  de la persona en ese canal.
- **Los ecos se descartan.** Lo que manda la propia página vuelve como
  `message.is_echo`. Sin filtrarlo, el bot se contestaría a sí mismo.
- **Hay que suscribir la página** a la app, además de configurar el webhook:
  `POST /{id-de-la-página}/subscribed_apps?subscribed_fields=messages`. Es un
  paso manual.

### 2. La cola (`backend/src/meta.js`)

Sin cambios de forma. El grupo pasa de «el teléfono» a «canal + identificador»
para que un identificador de Instagram no pueda coincidir con un teléfono. El
mecanismo ya existe desde que entraron los clientes sin teléfono (`grupoDe`).

### 3. La ficha (`backend/src/clientes.js`)

**Ya está previsto y no hay que tocarlo:** `CANALES` incluye `instagram` y
`messenger`, e `idDe` ya arma `ig:<id>` y `fb:<id>`. La ficha, el índice, los
estados, las etiquetas y la bitácora son los mismos.

Lo que NO existe en esos canales, y la pantalla tendrá que decirlo:

- **No hay teléfono.** El identificador es propio de la página (no es el
  usuario de Instagram que se ve en la app). El enlace para escribirle por
  WhatsApp no aplica; la respuesta sale desde el panel, como ya pasa con un
  cliente de WhatsApp sin número.
- **La misma persona por dos canales son dos fichas.** No hay dato para
  unirlas solo. Unirlas a mano ya existe (la acción de fusionar).

### 4. La conversación (`crm/conversaciones.js`, `crm/almacen-s3.js`)

La llave pasa por `llaveDeRemitente`, que ya distingue un teléfono de un
identificador. Hay que añadirle el prefijo del canal.

### 5. El envío (archivo nuevo: `crm/messenger-api.js`)

`POST /{id-de-la-página}/messages` con el token de página y
`{ recipient: { id }, messaging_type: 'RESPONSE', message: { text } }`. Sirve a
los dos canales. El trabajador elige `whatsapp-api.js` o `messenger-api.js`
por `mensaje.canal`; la función `enviar` ya se le inyecta, así que no cambia su
lógica.

- **La ventana es de 24 horas**, igual que en WhatsApp: `salidaDe` ya la
  calcula y la caja del panel ya se apaga. Fuera de ella, en estos canales no
  hay plantillas de pago: sólo la etiqueta de agente humano (7 días).
- **Los errores se clasifican distinto.** `crm/envio-errores.js` conoce los
  códigos de WhatsApp. El 190 (token) es común; los demás hay que añadirlos.
- **Las fotos**: en estos canales el adjunto llega con una URL directa, no con
  un id. `crm/medios.js` ganaría una entrada que se salta el primer paso.

### 6. El bot (`crm/cerebro.js`): **no se toca aquí**

Las reglas y el tono son de quien afina el bot. Dos cosas que tendrá que
decidir él, porque cambian lo que el bot dice:

- Mandar al cliente a WhatsApp desde Instagram puede no ser lo que se quiere.
- En Instagram no se pueden mandar los mismos formatos (listas, botones) que
  en WhatsApp.

### 7. El panel (`src/components/ClientesPanel.jsx`)

La ficha ya enseña `canal`. Falta el filtro por canal y que el aviso de salud
distinga qué canal está caído. **No se añade ningún filtro ni insignia de
Instagram hasta que el canal reciba mensajes de verdad.**

## Variables nuevas (sólo nombres)

| Variable | Función | Para qué |
|---|---|---|
| `META_PAGE_TOKEN` | `istuffs-crm-trabajador` | Token de la página: manda por Messenger e Instagram |
| `META_PAGE_ID` | `istuffs-crm-trabajador` | La página desde la que se contesta |

Ninguna va en el backend: el backend sólo comprueba la firma y encola.

## Pasos manuales, en orden

1. **El dueño:** terminar la verificación del negocio en el portfolio.
2. **El dueño:** confirmar que la cuenta de Instagram es profesional y está
   enlazada a la página de Facebook.
3. En la app «EMPRESA CRM», añadir los productos Messenger e Instagram, y
   apuntar su webhook a la misma URL de `/meta/webhook`, con los campos
   `messages` y `messaging_referrals`.
4. Asignar la página al usuario del sistema y generar el token de página.
5. Guardar las dos variables con `backend/scripts/poner-secreto.js`.
6. Suscribir la página a la app (el `POST` de arriba).
7. Probar con una persona que tenga rol en la app.
8. Pedir la revisión de `pages_messaging` e `instagram_manage_messages`, con la
   grabación del flujo.
9. Sólo con el acceso avanzado concedido: abrirlo a clientes.

## Qué tan grande es

| Parte | Tamaño |
|---|---|
| Rama de `leerCarga`, grupo de cola y llave de conversación | Pequeño. Con pruebas, un PR |
| `messenger-api.js`, códigos de error y elección por canal | Pequeño |
| Adjuntos por URL | Pequeño |
| Reglas del bot por canal | De quien afina el bot |
| Revisión de Meta | **Fuera de nuestro control.** No se promete fecha |

## Riesgos

- **Construirlo antes de la verificación es construir a ciegas.** El código se
  puede escribir con la documentación, pero no se puede comprobar con un
  cliente. Se recomienda escribirlo cuando la verificación esté concedida y
  haya al menos la prueba con una persona con rol.
- **Meta puede rechazar la revisión**, y suele pedir cambios en la grabación.
- **Un token de página vencido** tendría el mismo modo de fallo silencioso que
  ya tuvo el de WhatsApp. La alarma del canal mudo cubre el código 190 sea cual
  sea el canal, siempre que el envío pase por `clasificarEnvio`.
