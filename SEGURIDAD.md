# Seguridad

## El problema que se está resolviendo

Hasta ahora todas las credenciales del negocio viajaban dentro del JavaScript
que descarga cualquier visitante del sitio. Vite compila en el archivo público
toda variable que empiece con `VITE_`, y ahí estaban las llaves de S3, el
secreto de la app de Dropbox, un refresh token vivo y las contraseñas de las
sucursales y del administrador.

Se comprobó el 11 de septiembre de 2026 sobre el sitio publicado: el token de
Dropbox extraído del código funcionaba y daba acceso a la cuenta.

Las contraseñas por sucursal tampoco protegían nada: la comparación ocurría en
el navegador del visitante, así que bastaba editar el código para saltarlas.

## La solución

Un backend en AWS Lambda guarda las credenciales del lado del servidor. El
navegador deja de tenerlas y solo recibe respuestas ya procesadas.

| Operación | Antes | Ahora |
|---|---|---|
| Leer inventario | JSON público en S3 | Igual, no necesita credenciales |
| Leer configuración | JSON en S3 | Igual, debe ser de lectura pública |
| Iniciar sesión | Comparación en el navegador | Backend, contra hashes |
| Ver galería de Dropbox | Token en el navegador | Backend |
| Subir diseño de pedido | Token en el navegador | Backend |
| Guardar configuración | Llave de S3 en el navegador | Backend, solo administrador |
| Subir inventario Excel | Llave de S3 en el navegador | Backend, solo esa sucursal |

## Orden de los pasos

Este orden importa. Cambiar el frontend antes de tener el backend en pie deja
el sitio sin funcionar.

### 1. Crear la función Lambda

En la consola de AWS, servicio Lambda, crear función:

- Nombre: `istuffs-backend`
- Entorno de ejecución: Node.js 22
- Arquitectura: arm64, sale más barata
- En Configuración, Function URL: crear, tipo de autenticación `NONE`
  (el backend valida por su cuenta con la lista de orígenes permitidos)

Anotar la URL que se genera. Se ve así:
`https://xxxxxxxx.lambda-url.us-east-1.on.aws/`

### 2. Cargar las variables de entorno de la Lambda

Generarlas con:

```
node backend/scripts/generar-credenciales.js
```

Quedan en `backend/out/variables-lambda.txt`, que está ignorado por git.
Copiarlas en Lambda, sección Configuración, Variables de entorno.

**Borrar ese archivo al terminar.** Contiene credenciales.

### 3. Dar permiso a la Lambda sobre S3

En el rol de ejecución de la función, agregar una política que permita
`s3:PutObject` sobre `arn:aws:s3:::istuffs-inventarios/*`. Nada más: la Lambda
no necesita borrar ni listar el bucket.

### 4. Crear el usuario de despliegue

**Hecho el 2026-10-19.** Usuario `istuffs-deploy`, con una política en línea
que permite exactamente dos acciones —`lambda:UpdateFunctionCode` y
`lambda:GetFunctionConfiguration`, esta última porque el workflow espera a que
la función termine de actualizarse— sobre un único recurso:
`arn:aws:lambda:us-east-1:<cuenta>:function:istuffs-backend`. Nada más.

Sus llaves están en los secretos del repositorio:

- `AWS_DEPLOY_ACCESS_KEY`
- `AWS_DEPLOY_SECRET_KEY`

**Esto llevaba roto desde el principio y nadie lo había notado**: el workflow
pedía esos dos secretos y no existían, así que `desplegar-backend.yml` nunca
se había ejecutado ni una vez. Cada cambio en `backend/` había que subirlo a
mano. Ahora corre solo.

Antes de activarlo se comparó el código desplegado con el del repo —`src/index.js`
y `src/seguridad.js`, idénticos— para que el primer despliegue no cambiara el
comportamiento en vivo. Conviene repetir esa comprobación si el despliegue
lleva mucho tiempo parado.

El paquete pasó de 7 KB a 3.3 MB porque el workflow incluye `node_modules` a
propósito, para no depender de la versión del SDK que traiga Lambda. Las
variables de entorno **no** se tocan aquí: `update-function-code` sólo sustituye
el código. Se comprobó después: las 13 siguen en su sitio.

### 4b. El usuario administrador

**Hecho el 2026-10-19.** El CLI de la máquina de trabajo iba con una **llave
de la cuenta raíz**. Una llave de root no se puede limitar, no se puede
auditar bien y, sobre todo, **se salta el MFA**: la cuenta tenía dos
dispositivos de MFA configurados y no servían de nada frente a una llamada por
API con esa clave.

Había **dos** claves de root, las dos de 40 días. Una no se había usado nunca.

El orden que se siguió, y que hay que repetir si alguna vez se rehace:

1. Crear `istuffs-admin` con `AdministratorAccess` (desde la consola).
2. Crearle una clave de acceso.
3. Ponerla en `~/.aws/credentials` **como un perfil aparte**, no como
   `[default]`, y probar con `--profile` los servicios que se usan de verdad:
   Lambda, S3, IAM, Route53, Amplify y CloudWatch Logs.
4. Sólo con los seis respondiendo, pasarla a `[default]`.
5. Sólo entonces, borrar las claves de root desde la consola.

Nunca al revés: borrar la de root antes de probar la nueva deja sin acceso.

**Un tropiezo que parecía falta de permisos y no lo era.** Un perfil nuevo en
`~/.aws/credentials` no hereda la región: tres comandos fallaron con
`NoRegion`. La región va en `~/.aws/config`, en su propia sección
`[profile <nombre>]`. No era IAM.

**Y `get-account-summary` miente un rato.** Su `AccountAccessKeysPresent` es
un sí/no, no un conteo, y va cacheado horas: seguía diciendo que había claves
de root después de borrarlas. Para comprobarlo de verdad:

```
aws iam generate-credential-report
aws iam get-credential-report --query Content --output text | base64 -d
```

La fila `<root_account>` trae `access_key_1_active` y `access_key_2_active`, y
`GeneratedTime` dice de cuándo es el informe.

### Quién puede hacer qué, desde el 2026-10-19

| Usuario | Permisos | Para qué |
|---|---|---|
| `istuffs-admin` | `AdministratorAccess` | El CLI de la máquina de trabajo |
| `istuffs-deploy` | 2 acciones sobre 1 función Lambda | GitHub Actions, desplegar el backend |
| `istuffs-s3-uploader` | Escribir en el bucket | GitHub Actions, publicar inventarios |
| rol de la Lambda | `s3:PutObject` en un prefijo | El backend |
| cuenta raíz | **sin claves de acceso** | Sólo consola, con MFA |

### 5. Conectar el frontend

Pendiente. Requiere que los pasos anteriores estén listos, porque el sitio
dejará de hablar con S3 y Dropbox directamente.

### 6. Retirar las credenciales del frontend

Solo cuando el paso 5 esté probado. En Amplify, variables de entorno, borrar:

```
VITE_S3_ACCESS_KEY   VITE_S3_SECRET_KEY
VITE_DROPBOX_APP_SECRET   VITE_DROPBOX_REFRESH_TOKEN
VITE_PASS_LEON   VITE_PASS_SLP   VITE_PASS_AGS
VITE_PASS_TORREON   VITE_PASS_ADMIN
```

Se quedan `VITE_S3_BUCKET` y `VITE_S3_REGION`, que no son secretos: solo
apuntan a archivos que ya son públicos.

### 7. Rotar lo que estuvo expuesto

Rotar antes del paso 6 no sirve de nada: las nuevas volverían a publicarse.
Se comprobó sobre el archivo en vivo que el paso 6 estaba hecho —cero rastros
de llaves, tokens o contraseñas— antes de tocar nada.

**Hecho el 2026-10-19:**

- **Llave de S3.** Creada `AKIA…(ver consola IAM)`, cargada en los secretos de
  GitHub, comprobada con una corrida real de inventarios que escribió en S3, y
  sólo entonces desactivada la anterior `AKIA…(la vieja, ver consola IAM)`. AWS admite dos
  llaves activas a la vez, así que no hubo un segundo de caída. **Falta
  borrarla del todo**; conviene dejarla inactiva unos días por si algo la usaba
  sin que lo supiéramos.
- **Dropbox.** La consola de apps no deja regenerar el App secret. Da igual: el
  secreto solo no abre nada, hace falta un token. Se desconectó la app desde
  *Cuenta → Aplicaciones conectadas*, lo que **revoca todos los tokens** que
  haya emitido, incluido el filtrado —comprobado: el viejo devuelve
  `invalid_grant`—. Luego se autorizó de nuevo y el token nuevo se repartió a
  la Lambda y a GitHub.
- **El `.env` local.** Reescrito. **Ningún secreto lleva ya el prefijo
  `VITE_`**, que era la causa raíz: los scripts ya aceptaban los nombres sin
  prefijo, así que sólo hubo que renombrar. Se quitaron las cinco
  `VITE_PASS_*`, muertas desde que la sesión se valida en el backend.
- **`backend/out/variables-lambda.txt`** borrado. Sus 13 variables ya vivían en
  la Lambda.

**Pendiente: las cinco contraseñas.** Siguen siendo las que estuvieron
públicas. Se cambian generando hashes nuevos con
`backend/scripts/generar-credenciales.js` y subiéndolos a la Lambda. Conviene
cambiar también `SESION_SECRETO` en la misma pasada: eso tira al instante
cualquier sesión abierta con las contraseñas filtradas.

### Dos trampas que costaron tiempo aquí

**`canjear-token-dropbox.js` escribía el token en `VITE_DROPBOX_REFRESH_TOKEN`.**
O sea, el canje volvía a sembrar un token recién creado justo en el prefijo que
Vite publica. Y como el resto del proyecto lee `DROPBOX_REFRESH_TOKEN`, el
token nuevo quedaba donde nadie lo leía mientras el viejo seguía en uso. Ya
escribe el nombre correcto y borra la línea con prefijo si la encuentra.

**Un 403 «Carpeta no permitida» que no era un fallo.** `curl --data-urlencode`
codifica el espacio como `+`, y el Function URL no lo decodifica como espacio,
así que la ruta no coincidía con la lista blanca. Con `%20` pasa. Para probar
rutas con espacios, codificar a mano.

## Decisiones del backend

**Sin librerías externas para autenticación.** PBKDF2 y HMAC salen del módulo
`crypto` de Node. Menos dependencias significa menos superficie de ataque y
nada que parchear por vulnerabilidades de terceros.

**Contraseñas hasheadas con sal.** 210 mil iteraciones de PBKDF2-SHA512, que es
la recomendación de OWASP. Si alguien obtiene los hashes no puede revertirlos.

**Comparaciones en tiempo constante.** Para que el tiempo de respuesta no
revele cuántos caracteres de la contraseña coinciden.

**Sesiones firmadas que caducan.** Ocho horas. Cambiar `SESION_SECRETO`
invalida todas las sesiones abiertas al instante, que es lo que se quiere si se
sospecha una fuga.

**Mismo mensaje para usuario inexistente y contraseña incorrecta.** Para no
revelar qué sucursales tienen acceso configurado.

**Listas blancas.** Solo los orígenes declarados pueden llamar al backend, y
solo las carpetas declaradas de Dropbox se pueden consultar.

**Nombres de archivo limpiados.** Se prueban entradas como `../../../etc/passwd`
para confirmar que no se puede escribir fuera de la carpeta de la sucursal.

**Errores sin detalle.** El navegador recibe "Error interno". El detalle queda
en CloudWatch, donde no lo ve un atacante.

## Pruebas

```
cd backend && npm test
```

16 pruebas cubren autenticación, permisos por sucursal, límites de tamaño,
tipos de archivo, tokens manipulados y fuga de información en las respuestas.

## Pendientes conocidos

**El límite de intentos vive en memoria.** Solo cubre las peticiones que caen
en la misma instancia de Lambda. Es una molestia para el atacante, no una
defensa completa. La defensa real es que las contraseñas sean largas y estén
hasheadas. Si hace falta algo serio, se mueve a DynamoDB.

**La configuración del sitio no es de lectura pública.** Por eso el panel de
administración guarda cambios que ningún visitante ve. Hay que dar lectura
pública al prefijo `config/*` en la política del bucket.

**Para la tienda en línea.** Los datos de pago nunca deben pasar por este
backend ni guardarse en el sitio. Se usa una pasarela como Mercado Pago, que
recibe la tarjeta directamente y devuelve solo una confirmación.
