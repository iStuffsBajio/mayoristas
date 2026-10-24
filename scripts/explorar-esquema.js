// Lista las columnas de una tabla de Eleventa, para saber qué se puede
// extraer sin adivinar.
//
//   node scripts/explorar-esquema.js                     PRODUCTOS
//   node scripts/explorar-esquema.js --tabla=VENTAS      otra tabla
//   node scripts/explorar-esquema.js --sucursal=ags      otro respaldo
//
// Nació para una pregunta concreta: el panel no puede hablar en pesos porque
// el inventario no trae precio, y la consulta de sincronización no lo pide.
// Antes de añadirlo hay que saber cómo se llama la columna —no se adivina el
// esquema de la base de otro.
//
// Es de SOLO LECTURA: restaura una copia del respaldo en un directorio
// temporal y la borra al terminar. No toca el respaldo ni nada publicado.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { ultimoRespaldo, obtenerArchivo, origenPorDefecto } from './lib/respaldos.js'

const ejecutar = promisify(execFile)

try { process.loadEnvFile(path.join(import.meta.dirname, '..', '.env')) } catch { /* en CI viene del entorno */ }

const arg = n => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=')[1]

const TABLA     = (arg('tabla') || 'PRODUCTOS').toUpperCase()
const CARPETA   = arg('sucursal') || 'BODEGA'
const ORIGEN    = arg('origen') || origenPorDefecto()
const GBAK      = process.env.GBAK || 'gbak'
const ISQL      = process.env.ISQL || 'isql-fb'
const FB_USER   = process.env.FIREBIRD_USER || 'SYSDBA'
const FB_PASS   = process.env.FIREBIRD_PASS || 'masterkey'
const PREFIJO   = process.env.FB_PREFIJO || ''
const comoBase  = r => `${PREFIJO}${r}`

// Firebird 2.0 no admite `ORDER BY` por número de columna con agregados ni
// `DATEADD`; esto es una consulta simple del catálogo del sistema y basta.
//
// RDB$FIELD_TYPE: 7/8/16 enteros · 10/27 flotantes · 14/37 texto · 12/13/35 fechas
const SQL = tabla => `
SET HEADING OFF;
SELECT TRIM(rf.RDB$FIELD_NAME) || ' | tipo ' || f.RDB$FIELD_TYPE
       || ' | largo ' || COALESCE(f.RDB$FIELD_LENGTH, 0)
       || ' | escala ' || COALESCE(f.RDB$FIELD_SCALE, 0)
FROM RDB$RELATION_FIELDS rf
JOIN RDB$FIELDS f ON f.RDB$FIELD_NAME = rf.RDB$FIELD_SOURCE
WHERE rf.RDB$RELATION_NAME = '${tabla}'
ORDER BY rf.RDB$FIELD_POSITION;
`

// Una muestra de las columnas que suenan a dinero, para ver si traen valor o
// están vacías: una columna que existe pero nadie llena no sirve de nada.
const MUESTRA = cols => `
SET HEADING OFF;
SELECT FIRST 6 ${cols.map(c => `COALESCE(CAST(p."${c}" AS VARCHAR(20)), 'nulo')`).join(" || ' | ' || ")}
FROM PRODUCTOS p
WHERE p.ELIMINADO_EN IS NULL;
`

/** Cuantos productos traen valor en cada columna. Existir no es estar llena. */
const LLENAS = cols => `
SET HEADING OFF;
SELECT ${cols.map(c => `'${c}=' || COUNT(CASE WHEN p."${c}" IS NOT NULL AND p."${c}" <> 0 THEN 1 END) || '/' || COUNT(*)`).join(" || '  ' || ")}
FROM PRODUCTOS p
WHERE p.ELIMINADO_EN IS NULL;
`

async function isql(fdb, sql, workDir, nombre) {
  const sqlFile = path.join(workDir, `${nombre}.sql`)
  const outFile = path.join(workDir, `${nombre}.txt`)
  fs.writeFileSync(sqlFile, sql)
  fs.rmSync(outFile, { force: true })
  await ejecutar(ISQL, ['-user', FB_USER, '-password', FB_PASS, '-i', sqlFile, '-o', outFile, comoBase(fdb)])
  // Charset NONE: los bytes llegan tal cual y se decodifican como latin1.
  return fs.readFileSync(outFile, 'latin1')
    .split(/\r?\n/).map(l => l.trim()).filter(Boolean)
}

// No solo dinero: tambien lo que decide reposicion. `DINVMINIMO` es el punto
// de reorden que ya esta configurado en el punto de venta, y `USA_INVENTARIO`
// dice si el producto maneja existencias -la regla de los stickers, que aqui
// llevamos a mano en produccion.js, Eleventa ya la tiene-.
const DINERO = /PRECIO|PVENTA|PCOSTO|PFINAL|MAYOREO|COSTO|IMPORTE|MONTO|VALOR|UTILIDAD|MARGEN|GANANCIA|DINVMIN|DINVMAX|USA_INVENTARIO/i

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'esquema-'))
try {
  console.log(`respaldo de ${CARPETA} (origen ${ORIGEN})`)
  const respaldo = await ultimoRespaldo(CARPETA, ORIGEN)
  console.log(`  ${respaldo.nombre}  del ${respaldo.fecha}`)

  const fbk = await obtenerArchivo(respaldo, workDir, ORIGEN)
  const fdb = path.join(workDir, 'base.fdb')
  console.log('restaurando…')
  await ejecutar(GBAK, ['-c', '-user', FB_USER, '-password', FB_PASS, fbk, comoBase(fdb)])

  const filas = await isql(fdb, SQL(TABLA), workDir, 'columnas')
  console.log(`\n=== columnas de ${TABLA} (${filas.length}) ===`)
  for (const f of filas) console.log('  ' + f)

  const candidatas = filas
    .map(f => f.split('|')[0].trim())
    .filter(c => DINERO.test(c) && !/_ANTERIOR$/.test(c))

  console.log(`\n=== columnas que suenan a dinero (${candidatas.length}) ===`)
  if (!candidatas.length) {
    console.log('  ninguna — el precio no vive en esta tabla')
  } else {
    console.log('  ' + candidatas.join(', '))
    console.log('\n=== muestra de 5 productos ===')
    console.log('  ' + candidatas.join(' | '))
    try {
      for (const l of await isql(fdb, MUESTRA(candidatas), workDir, 'muestra')) console.log('  ' + l)
    } catch (e) {
      console.log('  no se pudo muestrear:', e.message.split('\n')[0])
    }
  }
} catch (e) {
  console.error('FALLÓ:', e.message)
  process.exitCode = 1
} finally {
  fs.rmSync(workDir, { recursive: true, force: true })
}
