# Instrucciones compartidas para agentes

Estas instrucciones aplican a Codex, Claude Code y otras herramientas que lean
`AGENTS.md`. `CLAUDE.md` importa este archivo y conserva las reglas históricas
específicas del proyecto.

## Antes de trabajar

- Revisa `git status` y los cambios recientes. Conserva cualquier cambio local y
  no sobrescribas trabajo ajeno.
- Lee `PROJECT_CONTEXT.md` para orientarte y consulta `PROJECT_STATUS.md`,
  `TASKS.md` y `DECISIONS.md` cuando sean pertinentes a la tarea.
- Lee `CLAUDE.md` antes de tocar reglas de negocio, flujos de publicación,
  efectivo, seguridad o datos de Eleventa. Sus apartados marcados **CONFIRMAR**
  requieren consultar al dueño antes de cambiar la decisión.
- Inspecciona el código que participa en la tarea antes de modificarlo.

## Cambios y seguridad

- Mantén el alcance solicitado. Reutiliza componentes y funciones existentes;
  evita reconstruir funciones que ya trabajan.
- No instales dependencias, cambies archivos de entorno ni alteres configuración
  externa sin autorización explícita.
- No leas, copies ni imprimas valores de `.env`, secretos de CI, credenciales,
  tokens o datos privados. Nunca expongas secretos en documentación o logs.
- No despliegues, publiques, cambies recursos de AWS/Dropbox ni borres datos u
  objetos remotos sin autorización explícita y revisión del impacto.
- No uses operaciones destructivas de Git (`reset`, `clean`, checkout de
  archivos ajenos) ni descartes cambios del usuario.
- Documenta decisiones nuevas en `DECISIONS.md`; registra cambios de producto
  importantes en `CHANGELOG.md`. No dupliques allí el detalle que ya vive en
  `CLAUDE.md` o `SEGURIDAD.md`.

## Verificación

- Ejecuta las comprobaciones pertinentes al cambio y registra el resultado.
- Pruebas del frontend: `npm test`.
- Pruebas del backend: `npm test` desde `backend/`.
- En PowerShell, si la política bloquea `npm.ps1`, usa `npm.cmd` con los mismos
  argumentos (por ejemplo, `npm.cmd test`).
- Para cambios de interfaz, consulta en `CLAUDE.md` el procedimiento visual del
  proyecto; una compilación correcta por sí sola no valida la pantalla.
- No afirmes que una prueba, publicación o estado de un servicio externo se
  verificó si no se ejecutó o consultó directamente.

## Trabajo entre sesiones y agentes

### Inicio

1. Revisa instrucciones, el estado de Git y el contexto aplicable a la tarea.
2. Identifica los archivos y límites afectados antes de editar.
3. Si hay varios agentes, acuerden los archivos que tocará cada uno y revisen
   `git status` antes de compartir cambios.

### Cierre

1. Revisa el diff y ejecuta las comprobaciones pertinentes.
2. Actualiza estado, tareas y documentación sólo cuando el trabajo cambie esa
   información.
3. Deja un resumen con archivos tocados, verificaciones y pendientes para la
   siguiente sesión.

Codex suele implementar y corregir; Claude Code suele revisar y auditar. Es una
distribución sugerida, no una limitación: ambos pueden asumir cualquiera de esas
tareas siguiendo las mismas instrucciones.
