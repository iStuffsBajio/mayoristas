# Estado del proyecto

Actualizado: 2026-11-08.

## Código y repositorio

- Rama `main`, alineada con `origin/main` durante la auditoría.
- El árbol estaba limpio antes de añadir esta documentación.
- El commit más reciente revisado es `4a1ca61`, sobre ventas posteriores a una
  cancelación tratadas como sospecha. Los cambios anteriores inmediatos cubren
  el detalle de movimientos de efectivo, horarios de sincronización y consulta
  de cortes.
- No se encontró una tarea de desarrollo en curso registrada en el repositorio.

## Pendientes

Consulta `TASKS.md`. Los pendientes de AWS y Dropbox allí reflejan notas de
`CLAUDE.md` (comprobaciones anotadas el 2026-11-07); su estado actual requiere
validación directa en esos servicios.

## Verificación de esta actualización

- Frontend: `npm.cmd test` — 436 pruebas pasaron.
- Backend: `npm.cmd test` en `backend/` — 95 pruebas pasaron. La salida incluyó
  errores de credenciales AWS ausentes y conexiones a Dropbox bloqueadas por el
  entorno; esto no verifica conectividad con los servicios externos.
- `git diff --check` pasó. No se hicieron cambios globales ni publicaciones.
- Rediseño visual del dashboard: `npm.cmd run verificar` pasó con 4 sesiones,
  15 secciones del panel y 42 encabezados ordenables comprobados. **Ese
  rediseño se revirtió después** (`22568de`); lo que está en producción es el
  dashboard anterior.
- La compilación pasa con advertencias no bloqueantes: datos de Browserslist
  antiguos y bundle JavaScript superior a 500 kB.

## Documentación

- `CLAUDE.md` conserva el historial de reglas de negocio, errores evitados y
  riesgos operativos.
- `SEGURIDAD.md` documenta el diseño de seguridad; `README.md`, la sincronización
  y operación del inventario.
- `PROJECT_CONTEXT.md` resume la arquitectura local detectada. Actualízalo si
  cambian las tecnologías o los límites entre componentes.
