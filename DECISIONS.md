# Índice de decisiones técnicas y de negocio

Este archivo ayuda a encontrar la decisión vigente sin copiar el registro
detallado. `CLAUDE.md` conserva el razonamiento histórico; `SEGURIDAD.md`
describe controles y operación de seguridad.

| Área | Decisión vigente | Registro detallado |
|---|---|---|
| Reglas de negocio | Los valores marcados **CONFIRMAR** en `CLAUDE.md` requieren aprobación del dueño para cambiarse. | `CLAUDE.md`, “Reglas de negocio” y secciones **CONFIRMAR** |
| Búsqueda y datos | Conservar los comportamientos descritos para búsqueda, ventas, inventario y datos de Eleventa; verificar casos medidos antes de refactorizar. | `CLAUDE.md`, secciones **CONFIRMAR** y **VERIFICAR** |
| Secretos | Las credenciales no van en el bundle del navegador ni en variables `VITE_*`; el backend guarda las credenciales de servidor. | `SEGURIDAD.md`; `CLAUDE.md`, “Lo que YA se rotó” |
| Configuración pública | `config/site.json` puede ser público sólo con las secciones permitidas por el backend; no debe contener datos privados. | `backend/src/index.js`; `CLAUDE.md`, “config/site.json es público” |
| Inventarios | La publicación valida respaldos y protege el inventario existente contra archivos incompletos o más antiguos. | `README.md`, “Protección de los datos” y “Por qué es seguro que corran las dos” |
| Seguridad de S3 | Mantener separados los datos públicos y privados y limitar permisos a prefijos requeridos. Verificar aplicación en AWS por separado. | `infra/istuffs-s3-policy.json`; `CLAUDE.md`, “Lo que se cambió en AWS, y lo que queda” |
| Trabajo entre agentes | Instrucciones compartidas en `AGENTS.md`; `CLAUDE.md` importa esa fuente y mantiene el conocimiento específico de este repo. | `AGENTS.md`, `CLAUDE.md` |

Las operaciones sobre cuentas, buckets, credenciales y publicación requieren
confirmación del dueño y verificación del estado externo.
