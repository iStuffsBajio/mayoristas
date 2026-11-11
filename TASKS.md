# Tareas y pendientes

El estado **por verificar** significa que existe una nota pendiente en la
documentación del proyecto, pero no se consultó el servicio externo en esta
sesión. Confirma el estado actual antes de ejecutar una operación.

## Fase 1 (2026-11-09): para desplegar y comprobar

Orden que no interrumpe el servicio. El backend y el frontend salen en el mismo
`push`; el cambio del backend es compatible hacia atrás (la ruta `/ajustes` con un
solo código sigue igual), así que la ventana en que la página nueva ve un
servidor viejo sólo afecta a quien pulse un botón de Depurar en esos minutos.

- [ ] **1. Subir el código.** El flujo `Desplegar backend` corre las pruebas del
  backend y publica la Lambda; Amplify compila el frontend.
- [ ] **2. Esperar la próxima corrida de `inventarios.yml`** (cinco al día, a las
  18:17, 21:17, 03:17, 09:17 y 15:17 hora de México) o lanzarla a mano. Ahí
  aparecen `UltimaVenta`, `Departamento` y, por primera vez,
  `inventarios/torreon/`. **Hasta entonces Depurar bloquea toda baja y lo dice.**
- [ ] **3. Sembrar el historial de Torreón**, una sola vez y con la sincronización
  ya corrida: `node scripts/extraer-historial-respaldo.js --sucursal=torreon`.
- [x] **4. `HASH_TORREON` en la Lambda:** está (comprobado el 2026-11-09 por
  nombre). Para cambiar la contraseña: `node backend/scripts/cambiar-contrasena.js torreon`.
- [ ] **5. Abrir Depurar y mirar** que ya no diga que falta el inventario de
  Torreón, y que «Obsoletos en ceros» muestre algo en «Se pueden».
- [ ] **6. La primera baja real es la primera prueba del servidor contra S3.**
  Hacerla con un solo código y revisar `ajustes/admin.json` y el Excel por tienda.
- [ ] Comprobar que `inventarios/torreon/inventario.json` no trae ningún nombre
  de cliente: la corrida en seco lo comprobó, pero es público.
- [ ] El aviso de «historial corto» de León se apaga solo el 2026-12-20.

## Fase C (2026-11-09): el corte de la sucursal, para comprobar

- [ ] **Tras la próxima sincronización**, abrir Corte con una tienda: la tabla
  de piezas y el ranking de mayoristas se llenan entonces (`porDiaTipo` y
  `mayoristasPorDia` en `ventas/<plaza>.json`). Antes lo dicen en pantalla.
- [ ] **Asignar el fondo de caja** de cada plaza: Corte → la plaza → «Fondo de
  caja». Sin él la plaza sale en gris y no se juzga. Torreón incluido.
- [ ] **Confirmar con el dueño** lo que queda en «Supuestos que se tomaron»: el
  esperado desde el efectivo cobrado y que el banco por banco no hace falta.
- [ ] **Comprobar con la primera sincronización** que `REFERENCIA` trae lo que
  se teclea al cobrar con tarjeta o transferencia.
- [ ] **Avisar a las tiendas** de las reglas de mayoreo y de qué escribir en la
  referencia: banco + autorización (tarjeta) o banco + clave de rastreo
  (transferencia).
- [ ] El primer conteo real es la primera prueba de `POST /corte/conteo` contra
  S3: revisar `cortes/<plaza>.json` y que una tienda no pueda abrir otra plaza.
- [ ] Avisar a las tiendas: **el sueldo y las comisiones se registran en el POS
  como salida**, con «sueldo» o «comisión» y el nombre del trabajador.

## Nómina y RH (2026-11-11): para arrancar

- [ ] **Capturar en Parámetros** la fecha de ingreso de cada persona, el nombre de
  la sobrina de Brenda y su bono, y el sueldo, el bono y el usuario del punto de
  venta de Ángel y Ximena (Torreón).
- [ ] **Avisar a las tiendas:** las comisiones ya NO se capturan en la caja (las
  registra el sistema al autorizarlas); el sueldo sí, como «Sueldo ‹nombre›».
- [ ] Tras la próxima sincronización: comprobar que llegan `comisionables` y los
  turnos de Torreón, y que los usuarios de Torreón casan con sus registros.
- [ ] La primera autorización real es la primera prueba contra S3 de
  `caja/movimientos.json` desde la nómina: revisar que aparezca en Efectivo y en
  el corte de esa plaza.
- [ ] Unificar los horarios: «Puntualidad del personal» sigue con los fijos.
- [ ] Fase 2 de RH (expediente, adelantos y préstamos, aguinaldo y prima
  vacacional, finiquito, metas): propuesta, sin construir.

## Fases siguientes (decididas, no construidas)

- [ ] **Fase B — incidencias manuales con foto** (el dueño la dejó para más adelante el 2026-11-09), sobre la bandeja de Revisar
  (un solo sistema con un campo de origen, no dos con estados distintos). Falta
  confirmar categorías y dónde se guardan las fotos (prefijo privado).
- [x] **Fase C — panel de corte de la sucursal**, Torreón a cuatro semanas y
  ranking de mayoristas. Construida el 2026-11-09; lo que queda es comprobarla
  (arriba) y el cuadre por día o turno.

## Pendientes documentados

- [ ] **Por verificar — Galería de Dropbox:** el registro de `CLAUDE.md` dice que
  las carpetas configuradas para los catálogos no existen. Hace falta que el
  dueño indique las rutas correctas antes de cambiar la configuración.
- [ ] **Por verificar — Credencial de Dropbox expuesta:** `CLAUDE.md` indica que
  un secreto de la aplicación seguía pendiente de rotación tras cambiar el token
  de acceso. Gestionar la rotación en la consola de Dropbox y revisar el flujo
  que usa la credencial.
- [x] **Llave IAM inactiva:** borrada el 2026-11-08. Comprobado en AWS el
  2026-11-09: `istuffs-s3-uploader` sólo tiene su llave activa.
- [ ] **Por verificar — Permisos del cargador CI:** revisar y, con acceso y
  autorización, aplicar la política de permisos acotados de
  `infra/istuffs-s3-policy.json`.
- [ ] **Por verificar — Usuario administrador de AWS:** la nota de seguridad
  indica permisos administrativos amplios y una llave permanente sin MFA.
  Revisar opciones de MFA y reducción de permisos sin interrumpir operaciones.
- [ ] **Por verificar — Revalidar hallazgos externos:** confirmar en AWS y
  Dropbox los hechos anotados en `CLAUDE.md` el 2026-11-07 antes de tomar
  decisiones operativas.

## Próximo trabajo local

- [ ] Cuando el dueño confirme las rutas de Dropbox, probar y documentar la
  galería sin publicar credenciales ni datos privados.
- [ ] Mantener sincronizados `README.md`, `SEGURIDAD.md` y `CLAUDE.md` si cambia
  el estado de la infraestructura externa.
- [ ] **Visto y no tocado:** `salidasPorCodigo` (`estadisticas.js`) y `isoHace`
  (`buscarVentas.js`) sacan una fecha de `toISOString().slice(0, 10)`, la trampa
  que `CLAUDE.md` ya documenta para el efectivo: pasadas las 18:00 de México el
  día es el siguiente y una ventana de 30 días se queda en 29. Es pequeño y
  cambia cifras ya publicadas, así que se deja para decidirlo aparte.
