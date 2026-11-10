# Registro de cambios del proyecto

Este registro resume cambios relevantes del producto y de su documentación;
no sustituye el historial completo de Git.

## 2026-11-09

- Bodega tiene **Consultar modelo**: buscar un modelo o abrir uno de los más
  vendidos, con su venta y existencia por tienda y lo que hay en bodega.
- Se miden los **días en cero** de cada código en los últimos 90 desde el
  kárdex de Eleventa (`inventarios/<plaza>/agotados.json`). La ficha dice por
  plaza si su venta es de fiar, y «Pedir por venta» y «Comprar» marcan con ⚠
  los modelos que vendieron poco porque estaban agotados. La cantidad a pedir
  no cambia.

## 2026-11-08

- Se añadió `AGENTS.md` como fuente compartida de instrucciones para Codex y
  Claude Code; `CLAUDE.md` la importa sin reemplazar su historial existente.
- Se crearon los documentos de contexto, estado, tareas y decisiones.
- Se actualizó `README.md` y `SEGURIDAD.md` para corregir dos estados que
  contradecían las notas más recientes del proyecto.
- Se añadieron plantillas y guía de instalación para las instrucciones globales;
  las rutas fuera del repositorio siguen sin modificarse.
- Se refinó visualmente el dashboard administrativo (`84b9853`) y **se revirtió
  esa misma noche** (`22568de`). El dashboard en producción es el anterior al
  rediseño.
- Las pruebas de fechas corren con la zona horaria de México en Amplify
  (`cf95b84`), para que el build no dependa de la hora del servidor.
- Se borró la llave de acceso inactiva del usuario `istuffs-s3-uploader`;
  comprobado en AWS el 2026-11-09, sólo queda la activa.
