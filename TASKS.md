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
- [ ] **4. Comprobar `HASH_TORREON` en la Lambda.** El backend ya conoce a
  Torreón, pero nadie puede entrar como ella sin esa variable. No se pudo
  consultar. Para añadirla se usa `backend/scripts/anadir-variable-lambda.js`,
  nunca el CLI a pelo (reemplaza el conjunto entero).
- [ ] **5. Abrir Depurar y mirar** que ya no diga que falta el inventario de
  Torreón, y que «Obsoletos en ceros» muestre algo en «Se pueden».
- [ ] **6. La primera baja real es la primera prueba del servidor contra S3.**
  Hacerla con un solo código y revisar `ajustes/admin.json` y el Excel por tienda.
- [ ] Comprobar que `inventarios/torreon/inventario.json` no trae ningún nombre
  de cliente: la corrida en seco lo comprobó, pero es público.
- [ ] El aviso de «historial corto» de León se apaga solo el 2026-12-20.

## Fases siguientes (decididas, no construidas)

- [ ] **Fase B — incidencias manuales con foto**, sobre la bandeja de Revisar
  (un solo sistema con un campo de origen, no dos con estados distintos). Falta
  confirmar categorías y dónde se guardan las fotos (prefijo privado).
- [ ] **Fase C — panel de corte de la sucursal**, Torreón a cuatro semanas y
  ranking de mayoristas. Las respuestas del dueño están en `CLAUDE.md`, “El
  panel de corte de la sucursal”, junto con lo que queda por preguntarle.

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
