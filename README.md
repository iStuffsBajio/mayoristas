# mayoristas
en esta seccion los mayoristas pueden consultar el inventario actual de la sucursal de su preferencia

## Inventarios automáticos

Cada sucursal (Eleventa) sube su respaldo `.fbk` a Dropbox en
`RESPALDOS SUCURSALES/<sucursal>/`. El script `scripts/sincronizar-inventarios.js`
toma el respaldo más reciente de cada carpeta, lo restaura con el `gbak`/`isql` que
trae Eleventa, consulta `PRODUCTOS` + `INVENTARIO_BALANCES` y publica
`inventarios/<slug>/inventario.json` en S3. La página lee ese JSON y, si no existe,
cae al `inventario.xlsx` de la carga manual.

- Corre a diario a las 10:00 (hora local) por la tarea de Windows
  **"iStuffs Inventarios 10am"**, en la PC que tiene Eleventa y Dropbox.
- Registro de cada corrida: `%LOCALAPPDATA%\istuffs-inventarios\logs\`.
- Ejecución manual: `node scripts/sincronizar-inventarios.js` (agrega `--dry-run`
  para no subir a S3, o `--sucursal=leon` para una sola).
- Para activar Torreón, agrégala a `SUCURSALES` dentro del script.

### Protección de los datos

El script no reemplaza un inventario bueno a ciegas. Antes de publicar:

- **Guarda copia fechada** del inventario que va a reemplazar, en
  `inventarios/<slug>/historico/<fecha>.json`. Para volver atrás, se copia ese
  archivo sobre `inventario.json`.
- **Rechaza respaldos incompletos**: menos de 50 productos se considera un
  respaldo truncado o a medio sincronizar.
- **Rechaza caídas bruscas**: si el inventario baja más de 40% contra lo ya
  publicado, se detiene y avisa en el registro.
- Si la caída es real (por ejemplo, se dio de baja media tienda), se publica con
  `node scripts/sincronizar-inventarios.js --forzar`.

Un fallo en una sucursal no detiene a las demás: cada una se procesa aparte y el
registro indica cuál falló y por qué.

Pendiente recomendado: activar **versionado del bucket** de S3 desde la consola de
AWS. La llave que usa la página es de solo objetos y no puede hacerlo.

### Ejecucion en la nube (GitHub Actions)

El flujo `.github/workflows/inventarios.yml` corre la misma sincronizacion en los
servidores de GitHub todos los dias a las 10:00 de Mexico, sin depender de que
ninguna computadora este encendida. Descarga los respaldos por la API de Dropbox
en lugar de leer la carpeta local.

Para activarlo hacen falta dos cosas:

**1. Permiso de lectura en la app de Dropbox.** En
<https://www.dropbox.com/developers/apps>, pestana Permissions, activar
`files.content.read` y guardar. Despues hay que generar un refresh token nuevo,
porque el token existente conserva los permisos que tenia al crearse.

**2. Secretos del repositorio.** En Settings > Secrets and variables > Actions:

| Secreto | De donde sale |
|---|---|
| `DROPBOX_REFRESH_TOKEN` | el refresh token nuevo |
| `DROPBOX_APP_KEY` | consola de apps de Dropbox |
| `DROPBOX_APP_SECRET` | consola de apps de Dropbox |
| `S3_BUCKET` | nombre del bucket |
| `S3_REGION` | region del bucket |
| `S3_ACCESS_KEY` | llave de IAM |
| `S3_SECRET_KEY` | llave de IAM |

Se puede lanzar a mano desde la pestana Actions con el boton Run workflow, que
acepta una opcion para probar sin publicar y otra para procesar una sola sucursal.

La tarea de Windows puede seguir activa como respaldo: las dos publican el mismo
archivo y la ultima en correr gana.
