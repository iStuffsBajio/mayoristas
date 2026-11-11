# Configuración global de agentes

Las instrucciones del proyecto están en `AGENTS.md`; `CLAUDE.md` las importa y
añade reglas específicas del repositorio. Los archivos de esta carpeta son
plantillas personales, sin contexto privado del negocio.

## Destinos en Windows

- Codex: `%USERPROFILE%\.codex\AGENTS.md`
- Claude Code: `%USERPROFILE%\.claude\CLAUDE.md`

En este equipo corresponden a `C:\Users\fabia\.codex\AGENTS.md` y
`C:\Users\fabia\.claude\CLAUDE.md`. En macOS/Linux se usan
`~/.codex/AGENTS.md` y `~/.claude/CLAUDE.md`.

## Instalación manual

1. Revisa si los archivos de destino ya existen. Si existen, consérvalos y
   combina estas reglas con su contenido; no los reemplaces a ciegas.
2. Si no existen, copia `docs/ai/global/AGENTS.md` al destino de Codex y crea
   `%USERPROFILE%\.claude\CLAUDE.md` con el contenido de
   `docs/ai/global/CLAUDE.md`.
3. En Claude Code, ejecuta `/memory` para confirmar que la importación global y
   `CLAUDE.md` del proyecto se cargaron. En Codex, inicia una sesión desde el
   repositorio y confirma que toma las instrucciones globales y locales.
4. Mantén el conocimiento del negocio en el repositorio. No copies `.env`,
   credenciales, archivos de datos ni todo `PROJECT_CONTEXT.md` a la
   configuración global.

`docs/ai/global/CLAUDE.md` importa `../.codex/AGENTS.md`, que desde
`%USERPROFILE%\.claude\CLAUDE.md` resuelve a `%USERPROFILE%\.codex\AGENTS.md`.
Si una versión o modo de Claude Code no acepta esa ruta externa, copia las
reglas globales al archivo de Claude y verifica la carga con `/memory`.

Estas instrucciones describen la instalación; no modifican los destinos
globales. La autorización para escribir fuera del repositorio debe darse antes
de instalarlas.
