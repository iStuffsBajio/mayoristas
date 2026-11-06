// Pruebas de las rutas del flujo de efectivo.
//
// SOLO ADMINISTRADOR, todas. Lo decidió el dueño: las plazas hacen todo
// directo en Eleventa y nadie más entra aquí. Y hay un motivo más fuerte que
// el permiso: los faltantes al cerrar turno llevan el NOMBRE de quien cerró
// pegado a una cantidad de dinero que falta, y eso no puede quedar accesible
// por URL ni para el mostrador.
//
// Lo que se fija aquí es el permiso y la validación. Las cuentas —el techo sin
// control de salidas, los bloques semanales, que un faltante no sea un
// retiro— viven en `src/lib/caja.js` con sus propias pruebas.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hashearContrasena, crearSesion } from '../src/seguridad.js'

const ORIGEN = 'https://ejemplo.test'
const SECRETO = 'secreto-de-pruebas-suficientemente-largo'

process.env.S3_BUCKET           = 'bucket-de-pruebas'
process.env.S3_REGION           = 'us-east-1'
process.env.SESION_SECRETO      = SECRETO
process.env.ORIGENES_PERMITIDOS = ORIGEN
process.env.HASH_ADMIN          = hashearContrasena('clave-admin')
process.env.HASH_LEON           = hashearContrasena('clave-leon')

const { handler, limpiarParametros } = await import('../src/index.js')

const pedir = (metodo, ruta, { cuerpo, token, origen = ORIGEN, query } = {}) => handler({
  rawPath: ruta,
  requestContext: { http: { method: metodo, sourceIp: '1.2.3.4' } },
  headers: { origin: origen, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  queryStringParameters: query,
  body: cuerpo ? JSON.stringify(cuerpo) : undefined,
})

const cuerpoDe = r => JSON.parse(r.body)
const tokenLeon  = () => crearSesion({ sucursal: 'leon', admin: false }, SECRETO)
const tokenAdmin = () => crearSesion({ sucursal: 'leon', admin: true }, SECRETO)

// Las rutas que escriben llegan a S3, que en pruebas no existe y devuelve 500.
// Lo que se comprueba es que NO sea un 400 ni un 403: que la validación y el
// permiso dejaron pasar la petición.
const paso = r => r.statusCode !== 400 && r.statusCode !== 403

// ── Permisos ────────────────────────────────────────────────────────────────

test('todo el flujo de efectivo es solo del administrador, ni su propia plaza', async () => {
  const rutas = [
    ['GET',  '/caja',            undefined],
    ['POST', '/caja/deposito',   { sucursal: 'leon', semana: '2026-11-02', monto: 100 }],
    ['POST', '/caja/ajuste',     { sucursal: 'leon', fecha: '2026-11-02', motivo: 'otro', valores: { gastos: 10 } }],
    ['POST', '/caja/parametros', { sucursal: 'leon', parametros: {} }],
    ['POST', '/caja/movimiento', { sucursal: 'leon', id: 'x', fecha: '2026-11-02', tipo: 'gasto', monto: 10, concepto: 'y' }],
  ]
  for (const [metodo, ruta, cuerpo] of rutas) {
    assert.equal((await pedir(metodo, ruta, { cuerpo })).statusCode, 403, `${ruta} sin sesion`)
    assert.equal((await pedir(metodo, ruta, { cuerpo, token: tokenLeon() })).statusCode, 403,
      `${ruta} con sesion de sucursal`)
  }
})

// ── Qué plazas manejan efectivo ─────────────────────────────────────────────

test('una plaza que no maneja efectivo se rechaza antes de tocar S3', async () => {
  // Bodega no vende y Morelia no existe para esta pagina: su ultimo respaldo
  // es del 2024-03-25 y no aparece en ningun sitio del codigo.
  for (const sucursal of ['bodega', 'morelia', '']) {
    const r = await pedir('POST', '/caja/deposito', {
      token: tokenAdmin(), cuerpo: { sucursal, semana: '2026-11-02', monto: 100 },
    })
    assert.equal(r.statusCode, 400, sucursal || '(vacia)')
  }
})

test('las cinco plazas que venden si entran, Torreon incluida', async () => {
  // Torreon vende y esta al dia -medido el 2026-11-05: $702,960 en efectivo
  // desde junio de 2025 y vendio ayer- aunque `sucursales.js` la tenga como
  // inactiva, que es cosa de lo que ve un mayorista, no de su caja.
  for (const sucursal of ['leon', 'san-luis', 'aguascalientes', 'torreon', 'ferias']) {
    const r = await pedir('POST', '/caja/deposito', {
      token: tokenAdmin(), cuerpo: { sucursal, semana: '2026-11-02', monto: 100 },
    })
    assert.ok(paso(r), `${sucursal} deberia entrar y devolvio ${r.statusCode}`)
  }
})

// ── Los bloques semanales ───────────────────────────────────────────────────

test('un bloque se identifica por el lunes de su semana, no por cualquier texto', async () => {
  const mal = await pedir('POST', '/caja/deposito', {
    token: tokenAdmin(), cuerpo: { sucursal: 'leon', semana: 'noviembre', monto: 100 },
  })
  assert.equal(mal.statusCode, 400)
  assert.match(cuerpoDe(mal).error, /lunes/, 'el mensaje dice cual es la clave')

  const sin = await pedir('POST', '/caja/deposito', {
    token: tokenAdmin(), cuerpo: { sucursal: 'leon', monto: 100 },
  })
  assert.equal(sin.statusCode, 400)
})

test('monto nulo quita la marca y el bloque vuelve a acumular', async () => {
  // Es como se deshace un deposito apuntado por error. Sin esto, una marca
  // equivocada dejaria esa semana fuera del acumulado para siempre.
  assert.ok(paso(await pedir('POST', '/caja/deposito', {
    token: tokenAdmin(), cuerpo: { sucursal: 'leon', semana: '2026-11-02', monto: null },
  })))
})

test('un monto que no es numero se rechaza en vez de guardarse mal', async () => {
  // Un NaN en el JSON envenena todas las sumas de la pantalla y no se ve de
  // donde salio. Y nada de negativos: una salida se expresa por su tipo, no
  // por el signo, o restar dos veces seria un descuido de una tecla.
  //
  // El texto vacio esta en la lista a proposito: `Number('')` da CERO, asi que
  // un campo en blanco se habria guardado como un deposito de $0.00, que en
  // pantalla no se distingue de no haber depositado nada.
  for (const monto of ['mucho', '', '   ', -500, '12abc']) {
    const r = await pedir('POST', '/caja/deposito', {
      token: tokenAdmin(), cuerpo: { sucursal: 'leon', semana: '2026-11-02', monto },
    })
    assert.equal(r.statusCode, 400, JSON.stringify(monto))
  }
})

test('un deposito de cero SI se acepta: una semana sin venta deposita cero', async () => {
  // Es la diferencia con el campo en blanco: el cero lo escribio alguien.
  assert.ok(paso(await pedir('POST', '/caja/deposito', {
    token: tokenAdmin(), cuerpo: { sucursal: 'ferias', semana: '2026-11-02', monto: 0 },
  })), 'Ferias cierra ocho meses al año: sus semanas de cero son lo normal')
})

// ── Los ajustes ─────────────────────────────────────────────────────────────

test('un ajuste sin motivo de la lista no se guarda', async () => {
  // La lista es cerrada para que la bitacora se pueda contar y ordenar: una
  // cifra corregida sin explicacion no se distingue de un error de captura,
  // que es justo una de las cosas que esto sirve para corregir.
  const r = await pedir('POST', '/caja/ajuste', {
    token: tokenAdmin(),
    cuerpo: { sucursal: 'leon', fecha: '2026-11-02', motivo: 'porque si', valores: { gastos: 10 } },
  })
  assert.equal(r.statusCode, 400)
})

test('los cinco motivos que puso el dueño se aceptan', async () => {
  for (const motivo of ['error-de-captura', 'gasto-no-registrado', 'devolucion', 'faltante', 'otro']) {
    const r = await pedir('POST', '/caja/ajuste', {
      token: tokenAdmin(),
      cuerpo: { sucursal: 'leon', fecha: '2026-11-02', motivo, valores: { gastos: 10 } },
    })
    assert.ok(paso(r), `${motivo} devolvio ${r.statusCode}`)
  }
})

test('un ajuste sin ningun valor no es un ajuste', async () => {
  const vacio = await pedir('POST', '/caja/ajuste', {
    token: tokenAdmin(), cuerpo: { sucursal: 'leon', fecha: '2026-11-02', motivo: 'otro', valores: {} },
  })
  assert.equal(vacio.statusCode, 400)

  // Un campo que no existe se descarta, y si no queda ninguno tampoco pasa:
  // asi un nombre de campo mal escrito no guarda un ajuste que no hace nada y
  // que en pantalla se veria igual que uno bueno.
  const inventado = await pedir('POST', '/caja/ajuste', {
    token: tokenAdmin(),
    cuerpo: { sucursal: 'leon', fecha: '2026-11-02', motivo: 'otro', valores: { loQueSea: 10 } },
  })
  assert.equal(inventado.statusCode, 400)
})

test('motivo nulo deshace el ajuste, no es un error', async () => {
  assert.ok(paso(await pedir('POST', '/caja/ajuste', {
    token: tokenAdmin(), cuerpo: { sucursal: 'leon', fecha: '2026-11-02', motivo: null },
  })))
})

test('un ajuste necesita el dia al que se aplica', async () => {
  const r = await pedir('POST', '/caja/ajuste', {
    token: tokenAdmin(), cuerpo: { sucursal: 'leon', motivo: 'otro', valores: { gastos: 10 } },
  })
  assert.equal(r.statusCode, 400)
})

// ── Los parámetros ──────────────────────────────────────────────────────────

test('un parametro vacio queda en nulo, NUNCA en cero', () => {
  // Es la misma regla que los precios: un cero es «sin capturar» y no
  // «gratis». Y aqui tiene dientes: un fondo fijo de cero se compararia contra
  // el limite y daria un verde sin que nadie hubiera configurado nada.
  const p = limpiarParametros({
    fondoFijo: '', limiteEfectivo: null, tolerancia: 'x',
    gastoMaxSinComprobante: '   ',
  })
  assert.equal(p.fondoFijo, null)
  assert.equal(p.limiteEfectivo, null)
  assert.equal(p.tolerancia, null)
  assert.equal(p.gastoMaxSinComprobante, null)
})

test('un cero escrito a proposito si se guarda como cero', () => {
  // Una tolerancia de cero es una decision valida: no se deja pasar ni un peso.
  assert.equal(limpiarParametros({ tolerancia: 0 }).tolerancia, 0)
  assert.equal(limpiarParametros({ fondoFijo: 0 }).fondoFijo, 0)
})

test('el dia de deposito solo acepta 1 a 7, y la hora solo una hora', () => {
  const mal = limpiarParametros({ diaDeposito: 9, horaLimite: 'por la tarde' })
  assert.equal(mal.diaDeposito, null, 'un dia 9 no existe y no se guarda a medias')
  assert.equal(mal.horaLimite, '', 'una hora que no es hora no se guarda')

  assert.equal(limpiarParametros({ diaDeposito: 0 }).diaDeposito, null, 'el domingo es 7, no 0')
  assert.equal(limpiarParametros({ diaDeposito: 1.5 }).diaDeposito, null)

  const bien = limpiarParametros({ diaDeposito: 2, horaLimite: '14:00' })
  assert.equal(bien.diaDeposito, 2, 'San Luis deposita en martes')
  assert.equal(bien.horaLimite, '14:00')
  assert.equal(limpiarParametros({ diaDeposito: 1 }).diaDeposito, 1, 'Leon y Aguascalientes, lunes')
  assert.equal(limpiarParametros({ diaDeposito: 7 }).diaDeposito, 7, 'el domingo')
  assert.equal(limpiarParametros({ horaLimite: '25:00' }).horaLimite, '', 'no hay hora 25')
})

test('la fecha de control de salidas solo se guarda si es una fecha', () => {
  // Es la que decide si el esperado de una semana es una cifra o un techo. Una
  // fecha a medias dejaria semanas juzgadas que no se pueden juzgar, y un
  // faltante inventado no se distingue en pantalla de uno real.
  assert.equal(limpiarParametros({ desdeControlSalidas: 'ya' }).desdeControlSalidas, null)
  assert.equal(limpiarParametros({ desdeControlSalidas: '05/11/2026' }).desdeControlSalidas, null)
  assert.equal(limpiarParametros({ desdeControlSalidas: '2026-11-05' }).desdeControlSalidas, '2026-11-05')
  assert.equal(limpiarParametros({}).desdeControlSalidas, null,
    'sin configurar es null, y sin ella NINGUN dia tiene control')
})

test('el periodo que cubre el deposito no acepta valores inventados', () => {
  assert.equal(limpiarParametros({ periodoCubre: 'cuando sea' }).periodoCubre, 'semana-anterior',
    'cae al que puso el dueño')
  assert.equal(limpiarParametros({ periodoCubre: 'semana-en-curso' }).periodoCubre, 'semana-en-curso')
  assert.equal(limpiarParametros({}).periodoCubre, 'semana-anterior')
})

test('los parametros siempre salen con las diez llaves, aunque lleguen vacios', () => {
  // La pantalla lee `params.tolerancia` para decidir si puede juzgar. Una
  // llave que falta y una en null se leen igual en JavaScript, pero al
  // GUARDARLAS la que falta se quedaria con el valor anterior al mezclar.
  assert.deepEqual(Object.keys(limpiarParametros({})).sort(), [
    'cuenta', 'desdeControlSalidas', 'diaDeposito', 'fondoFijo',
    'gastoMaxSinComprobante', 'horaLimite', 'limiteEfectivo', 'periodoCubre',
    'responsable', 'tolerancia',
  ])
})

test('la ruta de parametros sigue pidiendo una plaza que maneje efectivo', async () => {
  assert.equal((await pedir('POST', '/caja/parametros', {
    token: tokenAdmin(), cuerpo: { sucursal: 'bodega', parametros: {} },
  })).statusCode, 400)
  assert.ok(paso(await pedir('POST', '/caja/parametros', {
    token: tokenAdmin(), cuerpo: { sucursal: 'leon', parametros: { diaDeposito: 1 } },
  })))
})

test('unos parametros que no son un objeto se rechazan', async () => {
  assert.equal((await pedir('POST', '/caja/parametros', {
    token: tokenAdmin(), cuerpo: { sucursal: 'leon' },
  })).statusCode, 400)
})

// ── Los movimientos capturados a mano ───────────────────────────────────────

test('todo movimiento de caja lleva concepto, tipo conocido, dia y monto', async () => {
  const base = {
    sucursal: 'leon', id: 'm1', fecha: '2026-11-05',
    tipo: 'gasto', monto: 120, concepto: 'garrafon de agua',
  }
  const con = campos => pedir('POST', '/caja/movimiento', { token: tokenAdmin(), cuerpo: { ...base, ...campos } })

  assert.equal((await con({ concepto: '   ' })).statusCode, 400, 'sin concepto no se sabe en que se gasto')
  assert.equal((await con({ tipo: 'regalo' })).statusCode, 400, 'tipo inventado')
  assert.equal((await con({ monto: 0 })).statusCode, 400, 'un movimiento de cero no es un movimiento')
  assert.equal((await con({ fecha: '05/11/2026' })).statusCode, 400, 'la fecha va en formato ISO')
  assert.equal((await con({ id: '' })).statusCode, 400, 'sin id no se puede borrar luego')

  assert.ok(paso(await con({})), 'el movimiento completo tiene que pasar')
})

test('los seis tipos de movimiento se aceptan', async () => {
  for (const tipo of ['gasto', 'retiro', 'adelanto', 'proveedor', 'otra-salida', 'entrada']) {
    const r = await pedir('POST', '/caja/movimiento', {
      token: tokenAdmin(),
      cuerpo: { sucursal: 'leon', id: `m-${tipo}`, fecha: '2026-11-05', tipo, monto: 50, concepto: 'x' },
    })
    assert.ok(paso(r), `${tipo} devolvio ${r.statusCode}`)
  }
})

test('borrar un movimiento no exige volver a mandar sus datos', async () => {
  assert.ok(paso(await pedir('POST', '/caja/movimiento', {
    token: tokenAdmin(), cuerpo: { sucursal: 'leon', id: 'm1', borrar: true },
  })))
})

test('los parametros NO viven en config/, que es de lectura publica', async () => {
  // Llevan el NUMERO DE CUENTA bancaria destino y el nombre del responsable
  // del deposito. La politica del bucket abre `config/*` al publico, asi que
  // van en `caja/`, que no. Esto se fija aqui porque el error no se ve: el
  // archivo se guardaria igual y la pantalla funcionaria perfecta.
  const fuente = await import('node:fs').then(fs =>
    fs.readFileSync(new URL('../src/index.js', import.meta.url), 'utf8'))
  assert.ok(!/config\/caja\.json/.test(fuente),
    'los parametros de caja no pueden guardarse bajo config/')
  assert.ok(/caja\/parametros\.json/.test(fuente),
    'tienen que guardarse bajo caja/, que es privado')
})
