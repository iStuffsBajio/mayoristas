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

Un usuario de IAM aparte, solo con `lambda:UpdateFunctionCode` sobre esa
función. Sus llaves se cargan como secretos del repositorio:

- `AWS_DEPLOY_ACCESS_KEY`
- `AWS_DEPLOY_SECRET_KEY`

A partir de ahí, cada cambio en `backend/` se publica solo.

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

Estas credenciales estuvieron públicas y hay que considerarlas comprometidas:

- Llave de acceso de S3: crear una nueva y desactivar la anterior
- Secreto de la app de Dropbox: regenerarlo en la consola de apps
- Contraseñas de sucursales y administrador: cambiarlas todas

Rotar antes del paso 6 no sirve de nada: las nuevas volverían a publicarse.

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
