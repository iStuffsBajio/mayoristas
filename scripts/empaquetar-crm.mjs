// Arma el paquete del trabajador del CRM: UN archivo, listo para la Lambda.
//
//   npm run crm:empaquetar      →  scripts/out/crm-trabajador/index.mjs
//
// ── Por qué hace falta empaquetar, y el backend no ──────────────────────────
//
// El backend se sube como un zip de `backend/src` más `backend/node_modules`,
// y funciona porque todo lo que importa vive dentro de `backend/`. El
// trabajador no: `crm/` importa de TRES sitios —`crm/`, `backend/src/` (las
// reglas de la ficha) y `src/lib/` (las del catálogo, nueve archivos)— y de
// dos paquetes, `@anthropic-ai/sdk` y `@aws-sdk/client-s3`, que están en el
// `package.json` de la RAÍZ, no en el del backend.
//
// Un zip «de carpetas» tendría que copiar las tres con sus rutas relativas
// intactas y además los `node_modules` de la raíz, que traen Vite, React y
// jsdom: cientos de megas para subir veinte archivos. Y el día que alguien
// añadiera un import a una cuarta carpeta, el zip seguiría armándose sin él y
// reventaría en producción, con el primer cliente.
//
// El empaquetador sigue los `import` de verdad: entra por `crm/trabajador.js`
// y mete lo que se usa, venga de donde venga. Si falta algo, falla AQUÍ.
//
// ── De dónde sale cada cosa ─────────────────────────────────────────────────
//
//   · El empaquetador es esbuild, el que ya trae Vite. No se instala nada.
//   · Las dependencias salen del `node_modules` de la raíz, o sea de
//     `npm ci` con el `package-lock.json` de la raíz: las mismas versiones con
//     las que corren las pruebas y `npm run crm:evaluar`.
//   · Nada se deja «para que lo ponga Lambda». El entorno de Lambda trae un
//     SDK de AWS, pero de la versión que AWS decida ese mes.
//
// ── Lo que NO va dentro ─────────────────────────────────────────────────────
//
// Ningún dato: el inventario, los teléfonos de las tiendas y el índice de
// fotos se leen por HTTPS al contestar. `herramientas.js` busca el índice de
// fotos en `public/` y, si no está —y en el paquete no está—, lo pide al
// sitio (`CRM_SITIO`). Y ningún secreto: las llaves son variables de la
// función y se leen al usarse.

import { build } from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SALIDA = path.join(RAIZ, 'scripts', 'out', 'crm-trabajador')

fs.rmSync(SALIDA, { recursive: true, force: true })

const r = await build({
  absWorkingDir: RAIZ,
  entryPoints: ['crm/trabajador.js'],
  outfile: path.join(SALIDA, 'index.mjs'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  // Los SDK traen código CommonJS que hace `require('node:fs')` y parecidos.
  // En un módulo ES `require` no existe; sin esto el paquete se arma y truena
  // al cargar con «Dynamic require of "fs" is not supported».
  banner: { js: "import { createRequire as __crearRequire } from 'node:module'; const require = __crearRequire(import.meta.url);" },
  legalComments: 'none',
  plugins: [{
    // `backend/src/clientes-s3.js` importa `@aws-sdk/client-s3`, y si existe
    // `backend/node_modules` —en la máquina de quien desarrolla sí— esbuild lo
    // resolvería ahí: el paquete llevaría DOS copias del SDK, la de la raíz y
    // la del backend, posiblemente de versiones distintas, y un cliente de una
    // ejecutando comandos de la otra. En el flujo de despliegue no pasaría
    // (sólo se instala la raíz), así que el paquete local y el publicado
    // serían distintos sin que nada lo dijera. Todo sale de la raíz, siempre.
    name: 'dependencias-de-la-raiz',
    setup(b) {
      b.onResolve({ filter: /^[^./]/ }, args => {
        if (args.pluginData?.deLaRaiz || !args.importer.startsWith(path.join(RAIZ, 'backend') + path.sep)) return
        return b.resolve(args.path, { resolveDir: RAIZ, kind: args.kind, pluginData: { deLaRaiz: true } })
      })
    },
  }],
  metafile: true,
  logLevel: 'warning',
})

// De qué carpetas salió lo que entró: es la respuesta a «¿qué lleva el zip?».
const porOrigen = {}
for (const [archivo, { bytesInOutput }] of Object.entries(Object.values(r.metafile.outputs)[0].inputs)) {
  const origen = archivo.startsWith('node_modules/')
    ? 'node_modules/' + archivo.split('/').slice(1, archivo.split('/')[1].startsWith('@') ? 3 : 2).join('/')
    : archivo.split('/').slice(0, archivo.startsWith('backend/') || archivo.startsWith('src/') ? 2 : 1).join('/')
  porOrigen[origen] ??= { archivos: 0, bytes: 0 }
  porOrigen[origen].archivos++
  porOrigen[origen].bytes += bytesInOutput
}
const propios = Object.entries(porOrigen).filter(([o]) => !o.startsWith('node_modules/'))
const ajenos = Object.entries(porOrigen).filter(([o]) => o.startsWith('node_modules/'))
const kb = b => `${(b / 1024).toFixed(0)} KB`
console.log('Código de la casa:')
for (const [o, v] of propios) console.log(`  ${o.padEnd(14)} ${String(v.archivos).padStart(3)} archivos  ${kb(v.bytes)}`)
if (Object.keys(porOrigen).some(o => o.startsWith('backend/node_modules'))) {
  console.error('El paquete lleva dependencias de backend/node_modules: tienen que salir todas de la raíz.')
  process.exit(1)
}
console.log(`Dependencias: ${ajenos.length} paquetes, ${kb(ajenos.reduce((s, [, v]) => s + v.bytes, 0))}`)
for (const [o, v] of ajenos.sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 4)) console.log(`  ${o}  ${kb(v.bytes)}`)

// Compilar no es verificar: se CARGA el paquete. Un import que falta o un
// `require` dinámico no fallan al empaquetar, fallan al arrancar la función.
const paquete = path.join(SALIDA, 'index.mjs')
// Con `file://` y no con la ruta a secas: en Windows una ruta absoluta empieza
// por `C:\`, Node la lee como un esquema de URL y el import revienta con
// ERR_UNSUPPORTED_ESM_URL_SCHEME. En Linux la ruta a secas funciona, así que
// pasaba en CI y fallaba justo donde se hace el primer despliegue, a mano.
const modulo = await import(`${pathToFileURL(paquete).href}?t=${Date.now()}`)
if (typeof modulo.handler !== 'function') {
  console.error('El paquete no exporta `handler`: la Lambda no tendría qué llamar.')
  process.exit(1)
}
// Y se le pasa un evento vacío: tiene que contestar sin tocar AWS.
const vacio = await modulo.handler({ Records: [] }, {}).catch(e => e)
if (vacio instanceof Error && !/S3_BUCKET/.test(vacio.message)) {
  console.error('El paquete carga pero su handler revienta:', vacio.message)
  process.exit(1)
}

console.log(`\n${path.relative(RAIZ, paquete)}  ${kb(fs.statSync(paquete).size)}  ·  handler: index.handler`)
