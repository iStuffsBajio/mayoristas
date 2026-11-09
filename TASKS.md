# Tareas y pendientes

El estado **por verificar** significa que existe una nota pendiente en la
documentación del proyecto, pero no se consultó el servicio externo en esta
sesión. Confirma el estado actual antes de ejecutar una operación.

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
