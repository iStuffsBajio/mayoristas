# Contexto del proyecto

Última revisión local: 2026-11-08. Este documento resume el código y la
documentación disponibles; no sustituye la revisión de la tarea concreta.

## Propósito

`mayoristas` es el sitio iStuffs para consultar inventario por sucursal y operar
funciones internas de administración. Incluye flujos para personalizar pedidos,
consultar estadísticas, surtidos, efectivo y revisiones de inventario. La fuente
principal de esas vistas está en `src/App.jsx` y `src/components/`.

## Arquitectura observada

- **Frontend:** React 18 con Vite 5 y JavaScript ES modules. La entrada está en
  `src/main.jsx`; la aplicación en `src/App.jsx`; componentes, contexto de
  autenticación/configuración y lógica compartida viven bajo `src/`.
- **Backend:** función AWS Lambda en Node.js (el flujo de despliegue usa Node 22),
  implementada en `backend/src/`. Mantiene operaciones autenticadas y las
  credenciales fuera del navegador.
- **Datos y automatización:** `scripts/` contiene procesos para inventarios,
  respaldos de Eleventa/Firebird, ventas y datos de operación. La sincronización
  usa respaldos de Dropbox y publica archivos en S3; los detalles operativos
  están en `README.md`.
- **Entrega:** `.github/workflows/` contiene flujos de sincronización,
  exploración de esquema y despliegue del backend. `amplify.yml` define la
  compilación del frontend.
- **Infraestructura:** `infra/istuffs-s3-policy.json` contiene una política de
  S3 documentada para permisos acotados. La existencia del archivo no confirma
  que esa política ya esté aplicada en AWS.
- **Pruebas:** pruebas automatizadas de lógica en `src/lib/` y pruebas del
  backend en `backend/test/`.

La carpeta `crm/` está vacía en el árbol revisado; no hay base para describirla
como un componente activo del proyecto.

## Dependencias directas

Las versiones declaradas en los manifiestos son la fuente de verdad:

- Raíz, dependencias de ejecución: `@aws-sdk/client-s3` `^3.1050.0`,
  `@napi-rs/canvas` `^1.0.11`, `ag-psd` `^31.0.3`, `lucide-react` `^0.344.0`,
  `react` y `react-dom` `^18.3.1`, `xlsx-js-style` `^1.2.0`.
- Raíz, dependencias de desarrollo: `@vitejs/plugin-react` `^4.2.1`,
  `autoprefixer` `^10.4.18`, `postcss` `^8.4.35`, `tailwindcss` `^3.4.1` y
  `vite` `^5.1.4`.
- `backend/`: `@aws-sdk/client-s3` `^3.1050.0`; `qrcode` `^1.5.4` como
  dependencia de desarrollo.
- Hay `package-lock.json` en la raíz y en `backend/`.

## Comandos conocidos

- `npm run dev`: servidor de desarrollo frontend.
- `npm test`: pruebas del frontend.
- `npm run build`: compilación frontend.
- `npm run verificar`: verificación del panel definida en `scripts/`.
- `npm test` desde `backend/`: pruebas del backend.

## Límites de seguridad y decisiones

- No uses secretos en variables `VITE_*`; Vite las incorpora al bundle del
  navegador. Consulta `SEGURIDAD.md` y las reglas de `CLAUDE.md` para cambios de
  credenciales, autenticación, S3 o publicación.
- Los valores en servicios externos (AWS, Dropbox y GitHub) no se deducen del
  código. Verifica esos estados directamente antes de actuar sobre ellos.
- Las decisiones de negocio que requieren confirmación y los casos que ya
  causaron fallos están documentados en `CLAUDE.md`.
