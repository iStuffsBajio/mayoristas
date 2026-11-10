# Estado del proyecto

Actualizado: 2026-11-09.

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

## Fase 1 de la especificación del 2026-11-09

Implementada y verificada en local; **sin subir** (ver `TASKS.md` para el orden
de despliegue): sección Depurar con candado en el servidor, marca de descontinuado
en bodega, corrección de «Modelos nuevos», ficha de un modelo con existencia y
rotación para el administrador, Torreón en la sincronización, y `UltimaVenta` y
`Departamento` publicados. Las fases B (incidencias con foto) y C (panel de corte
de la sucursal) están decididas pero no construidas.

## Verificación de esta actualización

- Frontend: `npm test` — 504 pruebas pasaron.
- Backend: `npm test` en `backend/` — 120 pruebas pasaron, incluida la paridad
  entre el candado del servidor y el de la página.
- `npm run build` pasó (con la advertencia de tamaño de paquete de siempre).
- `npm run verificar`: 4 sesiones, 17 secciones de panel y 73 cabeceras. Se
  comprobó rompiendo a propósito dos piezas del candado y del filtro de Revisar
  que la verificación falla cuando debe.
- Mirado en un Chrome real, en escritorio y a 390 px, con los inventarios de la
  corrida en seco servidos desde el navegador.
- **No se comprobó:** el servidor contra el S3 real (sus pruebas usan un S3 de
  memoria) ni ninguna pantalla con datos publicados en el formato nuevo, que no
  existe hasta la próxima sincronización.

## Documentación

- `CLAUDE.md` conserva el historial de reglas de negocio, errores evitados y
  riesgos operativos.
- `SEGURIDAD.md` documenta el diseño de seguridad; `README.md`, la sincronización
  y operación del inventario.
- `PROJECT_CONTEXT.md` resume la arquitectura local detectada. Actualízalo si
  cambian las tecnologías o los límites entre componentes.
