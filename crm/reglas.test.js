// Las reglas del bot, fijadas.
//
// Cada prueba de aquí abajo corresponde a una regla de CLAUDE.md que ya costó
// algo en la página. Si alguien las rompe en el chat, `npm test` falla antes
// de que un cliente lea un número mal.
//
// Los inventarios se SIEMBRAN, no se bajan de S3: el de verdad cambia a
// diario y una prueba que dependa de él falla el día que una tienda venda la
// última pieza de lo que la prueba buscaba.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { sembrar, olvidar, diasDeAtraso, esPlazaPublica } from './inventario.js'
import {
  buscarEnPlaza, dondeHay, fotoDe, entregarASucursal,
  precioProducto, precioDeCombo, listaDePrecios, nombreParaCliente,
} from './herramientas.js'
import { tipoDe, precioDe, precioCombo, TIPOS, DESCUENTO_COMBO } from './precio.js'
import { plazaPara, COBERTURA, FUERA_DEL_BOT, PLAZAS_DEL_BOT } from './plazas.js'
import { SUCURSALES_CONSULTA } from '../src/lib/sucursales.js'
import { REGLAS } from './cerebro.js'

// ── Inventarios de mentira ──────────────────────────────────────────────────
//
// Con piezas distintas en cada plaza a propósito: dándoles el mismo inventario
// no se puede comprobar que no se suman.

const producto = (Codigo, Producto, Existencia, extra = {}) =>
  ({ Codigo, Producto, Existencia, ...extra })

function montar() {
  olvidar()
  sembrar('leon', {
    nombre: 'León', corte: '2026-10-29', dias: 1, viejo: false,
    productos: [
      producto('SGS23U3', 'SAMSUNG S23 ULTRA 3 IN 1', 34),
      producto('SGS23UT', 'SAMSUNG S23 ULTRA TPU CASE', 4),
      producto('SGA06T',  'SAMSUNG A06 TPU CASE', 8,  { Mayoreo: 129.3103, Precio: 215.5172 }),
      producto('SGA07T',  'GALAXY A07 TPU CASE', 10, { Mayoreo: 150 }),
      producto('I13T',    'IPHONE 13 TPU CASE', 0,   { Mayoreo: 190 }),
      producto('HDA',     'MICA HIDRIOGEL HD ALTA', 25, { Mayoreo: 120 }),
    ],
  })
  sembrar('san-luis', {
    nombre: 'San Luis Potosí', corte: '2026-10-29', dias: 1, viejo: false,
    productos: [
      producto('SGA06T', 'SAMSUNG A06 TPU CASE', 5, { Mayoreo: 150 }),
      producto('I13T',   'IPHONE 13 TPU CASE', 7,   { Mayoreo: 190 }),
    ],
  })
  sembrar('aguascalientes', {
    nombre: 'Aguascalientes', corte: '2026-10-24', dias: 6, viejo: true,
    productos: [
      producto('SGA06T', 'SAMSUNG A06 TPU CASE', 7, { Mayoreo: 150 }),
      producto('I13T',   'IPHONE 13 TPU CASE', 0,   { Mayoreo: 190 }),
    ],
  })
}

// ── Sin plaza no hay números ────────────────────────────────────────────────

test('sin plaza no se devuelve ningún número, ni un cero', async () => {
  montar()
  const r = await buscarEnPlaza({ texto: 'a06' })
  assert.equal(r.error, 'falta-plaza')
  assert.equal(r.hayPiezas, undefined, 'no debe traer existencias sin plaza')
  assert.equal(r.sinExistencia, undefined)
  assert.ok(r.opciones.length === 4, 'debe ofrecer las cuatro tiendas para preguntar')
})

test('una plaza inventada se rechaza igual que la falta de plaza', async () => {
  montar()
  const r = await buscarEnPlaza({ plaza: 'morelia', texto: 'a06' })
  assert.equal(r.error, 'falta-plaza')
})

// ── Bodega, Ferias y Torreón no existen para un cliente ────────────────────

test('bodega y Ferias nunca son plazas del bot', () => {
  assert.equal(esPlazaPublica('bodega'), false, 'bodega es almacén, no atiende')
  assert.equal(esPlazaPublica('ferias'), false, 'Ferias cierra ocho meses al año')
  assert.equal(esPlazaPublica('leon'), true)
})

// ── El chat y la portada parten de la misma lista ──────────────────────────
//
// El 2026-11-11 Torreón entró en la portada y el bot siguió diciendo que no
// existía, sin que nadie lo decidiera. Estas pruebas hacen que una diferencia
// entre los dos tenga que escribirse, con su razón, en FUERA_DEL_BOT.

test('toda plaza que enseña la portada la atiende el bot o está apartada con su razón', () => {
  for (const s of SUCURSALES_CONSULTA) {
    const apartada = s.slug in FUERA_DEL_BOT
    assert.equal(
      esPlazaPublica(s.slug), !apartada,
      `${s.nombre} sale en la portada: o el bot la atiende o FUERA_DEL_BOT dice por qué no`
    )
  }
})

test('FUERA_DEL_BOT sólo aparta plazas que la portada enseña, y cada una con su porqué', () => {
  const portada = new Set(SUCURSALES_CONSULTA.map(s => s.slug))
  for (const [slug, razon] of Object.entries(FUERA_DEL_BOT)) {
    assert.ok(portada.has(slug), `"${slug}" ya no está en la portada: sobra en FUERA_DEL_BOT`)
    assert.ok(String(razon).trim().length > 20, `"${slug}" está apartada sin decir por qué`)
  }
})

test('a toda plaza del bot se puede llegar por su ciudad', () => {
  for (const s of PLAZAS_DEL_BOT) {
    assert.ok(COBERTURA[s.slug]?.length, `${s.nombre} no tiene ciudades en COBERTURA: nadie llegaría a ella`)
    assert.equal(plazaPara(s.nombre), s.slug, `escribir «${s.nombre}» tiene que llevar a ${s.slug}`)
  }
})

test('el bot se presenta con las mismas ciudades que atiende', () => {
  for (const s of PLAZAS_DEL_BOT) {
    assert.ok(REGLAS.includes(s.nombre), `las reglas no mencionan ${s.nombre}`)
  }
  for (const slug of Object.keys(FUERA_DEL_BOT)) {
    const nombre = SUCURSALES_CONSULTA.find(s => s.slug === slug).nombre
    assert.ok(!REGLAS.includes(nombre), `las reglas nombran ${nombre} y el bot no la atiende`)
  }
})

// ── Buscar no respeta ningún filtro (la regla que se rompió tres veces) ────

test('buscar un modelo lo encuentra esté en el tramo de piezas que esté', async () => {
  montar()
  const r = await buscarEnPlaza({ plaza: 'leon', texto: 's23 ultra' })
  assert.equal(r.totalHallados, 2, 'los dos S23 Ultra tienen que salir: 34 piezas y 4')
  const piezas = r.hayPiezas.map(p => p.piezas).sort((a, b) => a - b)
  assert.deepEqual(piezas, [4, 34])
})

test('la búsqueda tolera cómo esté escrito el modelo', async () => {
  montar()
  for (const texto of ['a06', 'A 06', 'samsung a06', 'SGA06T']) {
    const r = await buscarEnPlaza({ plaza: 'leon', texto })
    assert.equal(r.totalHallados, 1, `"${texto}" debería encontrar el A06`)
  }
})

// ── Cero no es «no encontrado» ──────────────────────────────────────────────

test('un código en cero sale como sin existencia, no como inexistente', async () => {
  montar()
  const r = await buscarEnPlaza({ plaza: 'leon', texto: 'iphone 13' })
  assert.equal(r.enCatalogo, true, 'el I13T existe en el catálogo de León')
  assert.equal(r.hayPiezas.length, 0)
  assert.equal(r.sinExistencia.length, 1, 'tiene que aparecer como «lo manejo y está en ceros»')
  assert.equal(r.sinExistencia[0].codigo, 'I13T')
})

test('un código que no está en el catálogo se distingue del que está en cero', async () => {
  montar()
  const r = await buscarEnPlaza({ plaza: 'leon', texto: 'nokia 3310' })
  assert.equal(r.enCatalogo, false)
  assert.equal(r.hayPiezas.length, 0)
  assert.equal(r.sinExistencia.length, 0)
})

// ── Nunca se suma entre plazas ──────────────────────────────────────────────

test('dondeHay desglosa por plaza y no devuelve ningún total', async () => {
  montar()
  const r = await dondeHay({ codigo: 'SGA06T' })
  assert.equal(r.porPlaza.length, 4)
  assert.ok(!('total' in r), 'un total mandaría a alguien por piezas repartidas')
  assert.ok(!('piezas' in r))
  // 8 + 5 + 7 = 20, y esas veinte piezas no existen para nadie.
  const nombres = r.porPlaza.map(p => p.plaza)
  assert.deepEqual(nombres.sort(), ['aguascalientes', 'leon', 'san-luis', 'torreon'])
  for (const p of r.porPlaza) assert.ok(p.corte, 'cada plaza lleva su propio corte')
})

test('dondeHay solo mira las plazas públicas', async () => {
  montar()
  const r = await dondeHay({ codigo: 'SGA06T' })
  assert.ok(!r.porPlaza.some(p => p.plaza === 'bodega' || p.plaza === 'ferias'))
})

// ── El corte va pegado al número ───────────────────────────────────────────

test('toda búsqueda devuelve el corte y si está viejo', async () => {
  montar()
  const fresco = await buscarEnPlaza({ plaza: 'leon', texto: 'a06' })
  assert.equal(fresco.corte, '2026-10-29')
  assert.equal(fresco.corteViejo, false)

  const viejo = await buscarEnPlaza({ plaza: 'aguascalientes', texto: 'a06' })
  assert.equal(viejo.corte, '2026-10-24')
  assert.equal(viejo.corteViejo, true, 'seis días de atraso hay que avisarlo')
})

test('el atraso se cuenta en días completos', () => {
  const hoy = new Date('2026-10-30T12:00:00Z')
  assert.equal(diasDeAtraso('2026-10-30', hoy), 0)
  assert.equal(diasDeAtraso('2026-10-29', hoy), 1)
  assert.equal(diasDeAtraso('2026-10-25', hoy), 5)
  assert.equal(diasDeAtraso(null, hoy), null)
})

// ── El tipo de producto, que es de donde sale el precio ────────────────────

test('el tipo se deduce del nombre del catálogo', () => {
  assert.equal(tipoDe('SGA06T',  'SAMSUNG A06 TPU CASE'),        'tpu')
  assert.equal(tipoDe('HM10',    'HUAWEI MATE 10 HARD CASE'),    'hard')
  assert.equal(tipoDe('SGA563',  'GALAXY A56/A36/A37 3 IN 1'),   'uso-rudo')
  assert.equal(tipoDe('I13T',    'IPHONE 13 TPU CASE'),          'tpu')
  assert.equal(tipoDe('I11D',    'IPHONE 11 DUO CASE'),          'duo')
})

test('MILITAR TPU CASE es TPU de 250, no uso rudo de 300', () => {
  // Los doce MILITAR del catálogo valen 250 en las tres plazas. Clasificarlos
  // como uso rudo cotizaba 50 pesos de más por pieza sobre 69 piezas.
  for (const [c, n] of [
    ['I13MIT',   'IPHONE 13 MILITAR TPU CASE'],
    ['I14PMMIT', 'IPHONE 14 PRO MAX MILITAR TPU CASE'],
    ['I7MIT',    'IPHONE 7 MILITAR TPU CASE'],
  ]) {
    assert.equal(tipoDe(c, n), 'tpu', n)
    assert.equal(precioDe({ codigo: c, nombre: n }).monto, 250, n)
  }
  // Y el 3 en 1 de verdad sigue siendo 300.
  assert.equal(precioDe({ codigo: 'I113', nombre: 'IPHONE 11 3 IN 1' }).monto, 300)
})

test('HD USO RUDO es mica, no funda de uso rudo', () => {
  // HDR no dice «mica» en ninguna parte del nombre, pero está en
  // CODIGOS_PROTECTOR. Si se mirara «uso rudo» antes que el protector, una
  // mica de 200 se cotizaría como funda de 300.
  assert.equal(tipoDe('HDR', 'HD USO RUDO'), 'mica-uso-rudo')
  assert.equal(precioDe({ codigo: 'HDR', nombre: 'HD USO RUDO' }).monto, 200)
})

test('las micas de tablet se distinguen de las normales', () => {
  // «MICA HIDROGEL MATE TABLET» lleva MATE y TABLET: es la de tablet.
  assert.equal(tipoDe('MTT', 'MICA HIDROGEL MATE TABLET'), 'mica-tablet-mate')
  assert.equal(tipoDe('HDT', 'MICA HODROGEL TABLET HD'),   'mica-tablet-hd')
  assert.equal(tipoDe('MT',  'MICA HIDROGEL MATE'),        'mica-mate')
  // La errata del catálogo (HODROGEL) no debe dejarla fuera.
  assert.equal(tipoDe('HDA', 'MICA HIDRIOGEL HD ALTA'),    'mica-hd')
})

test('lo que no es funda ni mica no tiene precio de lista', () => {
  assert.equal(tipoDe('EM', 'EXHIBIDOR MAYORISTA'), null)
  assert.equal(tipoDe('SP', 'Stiker Pequeño'), null)
  const r = precioDe({ codigo: 'EM', nombre: 'EXHIBIDOR MAYORISTA' })
  assert.equal(r.decir, false)
  assert.equal(r.monto, null)
})

// ── Los precios de la lista ────────────────────────────────────────────────

test('el precio al público sale de la lista del dueño', () => {
  const esperado = { tpu: 250, hard: 220, 'uso-rudo': 300, 'mica-hd': 150, 'mica-mate': 180, 'mica-privacidad': 200, 'mica-uso-rudo': 200 }
  for (const [tipo, monto] of Object.entries(esperado)) {
    assert.equal(TIPOS[tipo].publico, monto, `${tipo} al público`)
  }
})

test('el mayoreo sólo existe para las fundas', () => {
  assert.equal(TIPOS['tpu'].mayoreo, 150)
  assert.equal(TIPOS['hard'].mayoreo, 130)
  assert.equal(TIPOS['uso-rudo'].mayoreo, 190)

  // De las micas no hay precio de mayoreo en la lista. Eso no es cero.
  const r = precioDe({ codigo: 'MT', nombre: 'MICA HIDROGEL MATE', cliente: 'mayoreo' })
  assert.equal(r.decir, false)
  assert.equal(r.monto, null, 'sin precio de mayoreo no se inventa uno')
  assert.match(r.porQueNo, /mayoreo/)
})

test('los precios de la lista YA llevan IVA y no se les suma nada', () => {
  // El error que esto previene: 250 x 1.16 = 290, cobrado a un cliente que
  // vio 250 en el anuncio.
  const r = precioDe({ codigo: 'SGA06T', nombre: 'SAMSUNG A06 TPU CASE' })
  assert.equal(r.monto, 250)
  assert.notEqual(r.monto, 290)
  assert.equal(precioProducto({ codigo: 'SGA06T', nombre: 'SAMSUNG A06 TPU CASE' }).conIva, true)
})

test('TPU CRISTAL es su propio tipo, no un TPU normal', () => {
  // Son 15 códigos con lista de 300, aunque hoy se rematen a 250. Si el
  // clasificador los metiera en 'tpu' se perdería el remate y, el día que
  // suba el precio, se cotizarían 50 pesos por debajo.
  assert.equal(tipoDe('I11TC',    'IPHONE 11 TPU CRISTAL'),      'tpu-cristal')
  assert.equal(tipoDe('SGS9PTC',  'SAMSUNG S9 PLUS TPU CRISTAL'),'tpu-cristal')
  assert.equal(tipoDe('SGA06T',   'SAMSUNG A06 TPU CASE'),       'tpu')
})

test('los modelos viejos se rematan a 250 y se dice de cuánto bajaron', () => {
  const cristal = precioDe({ codigo: 'I11TC', nombre: 'IPHONE 11 TPU CRISTAL' })
  assert.equal(cristal.monto, 250)
  assert.equal(cristal.remate, true)
  assert.equal(cristal.antes, 300, 'el antes es la lista de verdad, no una rebaja inventada')

  const duo = precioDe({ codigo: 'I11D', nombre: 'IPHONE 11 DUO CASE' })
  assert.equal(duo.monto, 250)
  assert.equal(duo.antes, 260)
})

test('el remate no se anuncia en mayoreo, porque ahí no hay con qué comparar', () => {
  const r = precioDe({ codigo: 'I11TC', nombre: 'IPHONE 11 TPU CRISTAL', cliente: 'mayoreo' })
  assert.equal(r.remate, undefined)
  assert.equal(r.monto, null, 'de los viejos no se dio precio de mayoreo')
  assert.match(r.porQueNo, /mayoreo/)
})

test('las micas de tablet ya tienen precio', () => {
  assert.equal(precioDe({ codigo: 'HDT', nombre: 'MICA HODROGEL TABLET HD' }).monto, 300)
  assert.equal(precioDe({ codigo: 'MTT', nombre: 'MICA HIDROGEL MATE TABLET' }).monto, 300)
})

test('lo que no tiene tipo sigue sin cotizarse', () => {
  const r = precioDe({ codigo: 'EM', nombre: 'EXHIBIDOR MAYORISTA' })
  assert.equal(r.decir, false)
  assert.equal(r.monto, null)
  assert.match(r.porQueNo, /precio de lista/)
})

// ── El combo ───────────────────────────────────────────────────────────────

test('el combo baja 30 pesos la MICA, no la funda', () => {
  const mica = precioDe({ codigo: 'MT', nombre: 'MICA HIDROGEL MATE', combo: true })
  assert.equal(mica.monto, 180 - DESCUENTO_COMBO)
  assert.equal(mica.combo, true)

  // Una funda no baja por llevar mica.
  const funda = precioDe({ codigo: 'SGA06T', nombre: 'SAMSUNG A06 TPU CASE', combo: true })
  assert.equal(funda.monto, 250)
  assert.equal(funda.combo, false)
})

test('el descuento del combo aplica a cualquier presentación de mica', () => {
  const casos = [
    ['HDA', 'MICA HIDRIOGEL HD ALTA',   150],
    ['MT',  'MICA HIDROGEL MATE',       180],
    ['PV',  'HIDROGEL PRIVACIDAD',      200],
    ['HDR', 'HD USO RUDO',              200],
  ]
  for (const [codigo, nombre, lista] of casos) {
    const r = precioDe({ codigo, nombre, combo: true })
    assert.equal(r.monto, lista - DESCUENTO_COMBO, `${nombre} en combo`)
  }
})

test('el total del combo lo calcula la herramienta, no el modelo', () => {
  const r = precioCombo({
    funda: { codigo: 'SGA06T', nombre: 'SAMSUNG A06 TPU CASE' },
    mica:  { codigo: 'MT',     nombre: 'MICA HIDROGEL MATE' },
  })
  assert.equal(r.decir, true)
  assert.equal(r.monto, 250 + 150, 'TPU 250 + mate 180 menos 30 = 400')
  assert.equal(r.ahorro, DESCUENTO_COMBO)
})

test('un combo con una pieza sin precio no da total a medias', () => {
  const r = precioDeCombo({
    funda: { codigo: 'EM', nombre: 'EXHIBIDOR MAYORISTA' },   // sin precio de lista
    mica:  { codigo: 'MT', nombre: 'MICA HIDROGEL MATE' },
  })
  assert.equal(r.monto, null, 'un total a medias es peor que ningún total')
  assert.ok(r.porQueNo)

  // Y en mayoreo, donde las micas no tienen precio, tampoco se da total.
  const may = precioDeCombo({
    funda: { codigo: 'SGA06T', nombre: 'SAMSUNG A06 TPU CASE' },
    mica:  { codigo: 'MT',     nombre: 'MICA HIDROGEL MATE' },
    cliente: 'mayoreo',
  })
  assert.equal(may.monto, null)
  assert.match(may.porQueNo, /mayoreo/)
})

// ── El precio no necesita plaza ────────────────────────────────────────────

test('el precio es el mismo en las tres tiendas', () => {
  // Los que cada caja tiene capturados no sirven: el HARD CASE figura a 220
  // en León, 200 en San Luis y 230 en Aguascalientes, y la lista dice 220.
  const r = precioProducto({ codigo: 'HM10', nombre: 'HUAWEI MATE 10 HARD CASE' })
  assert.equal(r.monto, 220)
  assert.ok(!('plaza' in r), 'el precio no se pide por plaza')
})

test('la búsqueda trae el precio ya puesto en cada renglón', async () => {
  montar()
  const r = await buscarEnPlaza({ plaza: 'leon', texto: 'a06' })
  assert.equal(r.hayPiezas[0].precio, 250, 'para no citar una existencia sin el precio delante')
  assert.equal(r.hayPiezas[0].tipo, 'TPU')

  const may = await buscarEnPlaza({ plaza: 'leon', texto: 'a06', cliente: 'mayoreo' })
  assert.equal(may.hayPiezas[0].precio, 150)
})

test('la lista al público está completa y marca los remates', () => {
  const l = listaDePrecios()
  assert.equal(l.conIva, true)
  assert.equal(l.descuentoComboMica, 30)

  // Al público ya no queda ningún tipo sin precio.
  const huecos = l.precios.filter(p => p.sinConfirmar)
  assert.deepEqual(huecos, [], 'todos los tipos tienen precio al público')

  assert.equal(l.precios.find(p => p.tipo === 'TPU').monto, 250)
  const duo = l.precios.find(p => p.tipo === 'Duo')
  assert.equal(duo.monto, 250)
  assert.equal(duo.remate, true)
  assert.equal(duo.antes, 260)
})

test('la lista de mayoreo marca las micas como no cotizables', () => {
  const l = listaDePrecios({ cliente: 'mayoreo' })
  assert.equal(l.precios.find(p => p.tipo === 'TPU').monto, 150)
  assert.equal(l.precios.find(p => p.tipo === 'Hard').monto, 130)

  // De las micas y de los remates no hay mayoreo en lista.
  for (const t of ['Hidrogel HD', 'Hidrogel mate', 'TPU cristal', 'Duo']) {
    const p = l.precios.find(x => x.tipo === t)
    assert.equal(p.monto, null, `${t} no tiene mayoreo`)
    assert.equal(p.sinConfirmar, true)
  }
  // Y el remate no se anuncia como rebaja en mayoreo.
  assert.equal(l.precios.find(p => p.tipo === 'Duo').remate, undefined)
})

// ── Micas y fundas no se mezclan ───────────────────────────────────────────

test('las micas se marcan como familia aparte', async () => {
  montar()
  const r = await buscarEnPlaza({ plaza: 'leon', texto: 'hidrogel' })
  assert.equal(r.hayPiezas.length, 1)
  assert.equal(r.hayPiezas[0].familia, 'mica/hidrogel', 'ocho códigos son el 8.3% de la venta y no son fundas')
  assert.equal(r.hayPiezas[0].precio, 150, 'hidrogel HD al público')

  const f = await buscarEnPlaza({ plaza: 'leon', texto: 'a07' })
  assert.equal(f.hayPiezas[0].familia, 'funda')
})

test('«hidrogel» encuentra las micas aunque el catálogo las escriba con errata', async () => {
  // El catálogo de verdad escribe HIDROGEL, HIDRIOGEL y HODROGEL. Quien
  // escribía «hidrogel» en el chat encontraba 4 de 7 micas: se quedaban fuera
  // la HDA (78 pz entre las tres tiendas) y la HDT.
  olvidar()
  sembrar('leon', {
    nombre: 'León', corte: '2026-10-29', dias: 1, viejo: false,
    productos: [
      producto('HDA', 'MICA HIDRIOGEL HD ALTA', 13),     // errata real
      producto('HDT', 'MICA HODROGEL TABLET HD', 3),     // la otra errata real
      producto('HDB', 'MICA HIDROGEL HD BASICA', 32),    // bien escrita
      producto('HDR', 'MICA HD USO RUDO', 24),           // no dice hidrogel
      producto('PV',  'HIDROGEL PRIVACIDAD', 19),
    ],
  })
  const r = await buscarEnPlaza({ plaza: 'leon', texto: 'hidrogel' })
  assert.equal(r.totalHallados, 5, 'las cinco, erratas incluidas')

  // Y «mica» también las encuentra todas, incluida la que sólo dice hidrogel.
  const m = await buscarEnPlaza({ plaza: 'leon', texto: 'mica' })
  assert.equal(m.totalHallados, 5)

  // Lo que ya funcionaba sigue funcionando: buscar la errata tal cual.
  const e = await buscarEnPlaza({ plaza: 'leon', texto: 'hidriogel' })
  assert.equal(e.totalHallados, 1)
  assert.equal(e.hayPiezas[0].codigo, 'HDA')
})

test('se encuentra por tipo, como pregunta la gente', async () => {
  montar()
  const rudo = await buscarEnPlaza({ plaza: 'leon', texto: 'uso rudo' })
  assert.ok(rudo.totalHallados >= 1, '«uso rudo» debe encontrar los 3 en 1')
  assert.equal(rudo.hayPiezas[0].tipo, 'Uso rudo 3 en 1')

  // Esta prueba afirmaba antes que «transparente a06» encontraba la TPU, «porque
  // los TPU son los transparentes». Era una suposición sin datos: de 544 TPU
  // del catálogo real sólo 10 se llaman transparentes y 36 llevan color, así
  // que se la daba a quien no la pedía. La TPU normal NO es «transparente».
  const transp = await buscarEnPlaza({ plaza: 'leon', texto: 'transparente a06' })
  assert.equal(transp.totalHallados, 0, 'la TPU normal no es una transparente')
})

// ── La foto prestada se declara ────────────────────────────────────────────

test('una foto de otro modelo lo dice en el pie', async () => {
  const f = await fotoDe({ codigo: 'SGS26UT', nombre: 'SAMSUNG S26 ULTRA TPU CASE' })
  assert.ok(f, 'el S26 Ultra debería al menos tomar prestada la del S26')
  if (!f.exacta) {
    assert.match(f.pie, /^Foto de referencia: es del /,
      'enseñar la funda de otro teléfono callándolo es enseñar la que no es')
  }
})

test('una foto propia lleva el nombre del producto, sin advertencia', async () => {
  const f = await fotoDe({ codigo: 'I13T', nombre: 'IPHONE 13 TPU CASE' })
  assert.ok(f)
  assert.equal(f.exacta, true)
  assert.doesNotMatch(f.pie, /Foto de referencia/)
})

test('la URL de la foto es pública: WhatsApp la descarga él mismo', async () => {
  const f = await fotoDe({ codigo: 'I13T', nombre: 'IPHONE 13 TPU CASE' })
  assert.match(f.url, /^https:\/\//)
})

// ── El direccionamiento no adivina ─────────────────────────────────────────

test('una ciudad conocida da su plaza', () => {
  assert.equal(plazaPara('Celaya'), 'leon')
  assert.equal(plazaPara('SLP'), 'san-luis')
  assert.equal(plazaPara('zacatecas'), 'aguascalientes')
})

test('una ciudad desconocida devuelve null, no la plaza más grande', () => {
  for (const c of ['Monterrey', 'Tijuana', 'Cancún', '', null]) {
    assert.equal(plazaPara(c), null, `"${c}" no debe caer en ninguna plaza por descarte`)
  }
})

test('Torreón atiende la Comarca Lagunera (2026-11-11)', () => {
  assert.equal(esPlazaPublica('torreon'), true)
  for (const c of ['Torreón', 'Gómez Palacio', 'Lerdo', 'Saltillo, Coahuila', 'Durango']) {
    assert.equal(plazaPara(c), 'torreon', c)
  }
  // Los homónimos de otros estados no se cuelan por contención.
  assert.notEqual(plazaPara('San Pedro Garza García'), 'torreon')
  assert.notEqual(plazaPara('Matamoros, Tamaulipas'), 'torreon')
})

// ── La entrega del lead ────────────────────────────────────────────────────

test('el lead se entrega con el contexto ya escrito', () => {
  const e = entregarASucursal({
    plaza: 'leon',
    telefonos: { leon: '4776639890', general: '5213315381571' },
    cliente: { nombre: 'Marisol', ciudad: 'Celaya' },
    interes: [{ codigo: 'SGA06T', nombre: 'SAMSUNG A06 TPU CASE', piezas: 12 }],
  })
  assert.equal(e.numero, '524776639890', 'el teléfono se normaliza a 52 + 10 dígitos')
  assert.match(e.mensaje, /Marisol/)
  assert.match(e.mensaje, /SGA06T/)
  assert.match(e.mensaje, /12 pz/, 'la tienda no debe volver a preguntar la cantidad')
  assert.match(e.enlace, /^https:\/\/wa\.me\/524776639890\?text=/)
})

test('sin número de la plaza se cae al general y si no, falla en voz alta', () => {
  const conGeneral = entregarASucursal({
    plaza: 'leon', telefonos: { general: '5213315381571' }, interes: [],
  })
  assert.equal(conGeneral.numero, '523315381571')

  const sinNada = entregarASucursal({ plaza: 'leon', telefonos: {}, interes: [] })
  assert.equal(sinNada.error, 'sin-numero', 'mejor un fallo visible que un número inventado')
})

test('el mensaje del lead va sin emojis', () => {
  const e = entregarASucursal({
    plaza: 'leon',
    telefonos: { leon: '4776639890' },
    cliente: { nombre: 'Ana 🎉' },
    interes: [{ codigo: 'SGA06T', nombre: 'A06 ✨', piezas: 3 }],
    nota: 'urge 🔥',
  })
  // Varios emojis son secuencias con selector de variante invisible y se
  // rompen al pasar por la URL: salen como cuadros en WhatsApp de Android.
  assert.doesNotMatch(e.mensaje, /\p{Extended_Pictographic}/u)
})

test('un lead no se entrega a una plaza que no atiende', () => {
  for (const plaza of ['bodega', 'ferias', undefined]) {
    const e = entregarASucursal({ plaza, telefonos: { general: '5213315381571' }, interes: [] })
    assert.equal(e.error, 'falta-plaza', `no se entrega a ${plaza}`)
  }
})

// ── El teléfono se normaliza igual en el bot, la página y el backend ───────

import { telefonoMx } from '../backend/src/clientes.js'
import { telefonoWhatsApp } from '../src/lib/sucursales.js'

test('telefonoMx (backend) y telefonoWhatsApp (página) dicen lo mismo', () => {
  // Son dos copias a la fuerza: el backend se despliega solo y no puede
  // importar de src/. Si se separan, la ficha de un cliente y el enlace que
  // arma la página apuntarían a números distintos.
  const casos = ['477 123 4567', '+52 477 123 4567', '5214771234567', '524771234567', '0444771234567',
    '12345', '', null, '52 55 1234 5678', '5512345678', '+1 555 123 4567']
  for (const c of casos) assert.equal(telefonoMx(c), telefonoWhatsApp(c), String(c))
})

// ── El costo que enseñan las pruebas sale del modelo puesto ────────────────

import { PRECIOS, costoUsd, MODELO } from './modelo.js'

test('el costo de un turno se calcula con el precio del modelo, no con uno copiado', () => {
  assert.ok(PRECIOS[MODELO], 'el modelo puesto tiene precio')
  const uso = { entrada: 1_000_000, cacheLeido: 0, salida: 0 }
  assert.equal(costoUsd(uso, 'claude-opus-5-5'), 4)
  assert.equal(costoUsd(uso, 'claude-haiku-5-5'), 0.10)
  // `entrada` NO incluye lo leído de caché: la API los reporta como contadores
  // SEPARADOS. Restar uno del otro daba un costo negativo en pantalla.
  assert.equal(costoUsd({ entrada: 1_000_000, cacheLeido: 1_000_000, salida: 0 }, 'claude-opus-5-5'), 4.20)
})

test('el costo nunca sale negativo cuando el caché pega', () => {
  // El fallo real: la fórmula restaba lo leído de caché de la entrada, y la
  // pantalla enseñaba -$0.0006. Con 500 tokens nuevos y 12,000 leídos de caché
  // la resta daba negativo; los contadores son independientes.
  for (const modelo of Object.keys(PRECIOS)) {
    const uso = { entrada: 500, salida: 300, cacheLeido: 12_000, cacheEscrito: 0 }
    assert.ok(costoUsd(uso, modelo) > 0, `${modelo}: un turno con caché cuesta algo`)
  }
})

test('cada contador suma por su cuenta, al precio de su modelo', () => {
  for (const [modelo, p] of Object.entries(PRECIOS)) {
    assert.equal(costoUsd({ entrada: 1e6 }, modelo),      p.entrada,      `${modelo} entrada`)
    assert.equal(costoUsd({ salida: 1e6 }, modelo),       p.salida,       `${modelo} salida`)
    assert.equal(costoUsd({ cacheLeido: 1e6 }, modelo),   p.cache,        `${modelo} cache leido`)
    assert.equal(costoUsd({ cacheEscrito: 1e6 }, modelo), p.cacheEscrito, `${modelo} cache escrito`)
  }
})

test('el caché abarata de verdad, que es la razón de usarlo', () => {
  const sin = costoUsd({ entrada: 12_500, salida: 300 })
  const con = costoUsd({ entrada: 500, cacheLeido: 12_000, salida: 300 })
  assert.ok(con < sin, 'leer del caché tiene que costar menos que no usarlo')
})

test('un uso vacío o a medias cuesta cero, no NaN', () => {
  // Un NaN se propaga por toda la suma y deja la cifra en blanco, que se ve
  // igual que un fallo de carga.
  for (const u of [{}, undefined, { entrada: 0 }]) assert.equal(costoUsd(u), 0)
})

// ── La marca se escribe de dos formas en el mismo catálogo ─────────────────

test('«galaxy» y «samsung» encuentran lo mismo, lo escriba como lo escriba el catálogo', async () => {
  // En León hay 189 productos Samsung: 171 escritos SAMSUNG y 18 GALAXY.
  // Quien escribía «galaxy a06» recibía «no manejamos» teniendo 7 piezas en
  // el mostrador. Lo cazó una conversación con el modelo de verdad; ninguna
  // prueba lo veía, porque todas buscaban con la palabra del catálogo.
  olvidar()
  sembrar('leon', {
    nombre: 'León', corte: '2026-11-10', dias: 1, viejo: false,
    productos: [
      producto('SGA06T', 'SAMSUNG A06 TPU CASE', 7),   // el catálogo dice SAMSUNG
      producto('SGA07T', 'GALAXY A07 TPU CASE', 10),   // y aquí dice GALAXY
    ],
  })
  for (const texto of ['samsung a06', 'galaxy a06']) {
    const r = await buscarEnPlaza({ plaza: 'leon', texto })
    assert.equal(r.totalHallados, 1, `"${texto}" debe encontrar el A06`)
  }
  for (const texto of ['samsung a07', 'galaxy a07']) {
    const r = await buscarEnPlaza({ plaza: 'leon', texto })
    assert.equal(r.totalHallados, 1, `"${texto}" debe encontrar el A07`)
  }
})

test('cada marca se encuentra por todos sus nombres', async () => {
  olvidar()
  sembrar('leon', {
    nombre: 'León', corte: '2026-11-10', dias: 1, viejo: false,
    productos: [
      producto('MTG54T', 'MOTO G54 TPU CASE', 5),        // 97 de 98 dicen MOTO
      producto('I13T',   'IPHONE 13 TPU CASE', 4),       // los 157 dicen IPHONE
      producto('XRN13T', 'REDMI NOTE 13 TPU CASE', 3),
      producto('GP8T',   'PIXEL 8 TPU CASE', 2),
    ],
  })
  const casos = [
    ['motorola g54', 'MTG54T'], ['moto g54',  'MTG54T'],
    ['apple 13',     'I13T'],   ['iphone 13', 'I13T'],
    ['xiaomi note 13', 'XRN13T'], ['redmi note 13', 'XRN13T'],
    ['google 8',     'GP8T'],   ['pixel 8',   'GP8T'],
  ]
  for (const [texto, codigo] of casos) {
    const r = await buscarEnPlaza({ plaza: 'leon', texto })
    assert.equal(r.totalHallados, 1, `"${texto}" no encontró nada`)
    assert.equal(r.hayPiezas[0].codigo, codigo, `"${texto}"`)
  }
})

test('buscar una marca NO devuelve micas', async () => {
  // `familiaDe` da HUAWEI para «MICA HIDROGEL MATE», porque MATE es uno de
  // sus modelos. Sin la guarda, buscar «huawei» devolvía protectores.
  olvidar()
  sembrar('leon', {
    nombre: 'León', corte: '2026-11-10', dias: 1, viejo: false,
    productos: [
      producto('HM10', 'HUAWEI MATE 10 HARD CASE', 5),
      producto('MT',   'MICA HIDROGEL MATE', 21),
    ],
  })
  const r = await buscarEnPlaza({ plaza: 'leon', texto: 'huawei' })
  assert.equal(r.totalHallados, 1)
  assert.equal(r.hayPiezas[0].codigo, 'HM10', 'una mica mate no es un Huawei')
})

// ── Cómo se le llama a un producto delante de un cliente ──────────────────

test('la palabra «case» del catálogo no sale nunca', () => {
  // El catálogo está escrito para quien surte: «SAMSUNG S25 ULTRA TPU CASE».
  // Eso aparecía como pie de la foto que le llega a quien vio un anuncio.
  const casos = [
    ['SGS25UT', 'SAMSUNG S25 ULTRA TPU CASE'],
    ['I13',     'IPHONE 13 HARD CASE'],
    ['I11D',    'IPHONE 11 DUO CASE'],
  ]
  for (const [c, n] of casos) {
    assert.doesNotMatch(nombreParaCliente(c, n), /\bcase\b/i, n)
  }
})

test('cada tipo se dice con las palabras del dueño', () => {
  assert.match(nombreParaCliente('SGS25UT', 'SAMSUNG S25 ULTRA TPU CASE'), /goma flexible/)
  assert.match(nombreParaCliente('SGS25U3', 'SAMSUNG S25 ULTRA 3 IN 1'),   /uso rudo/)
  // «3 en 1» es jerga de catálogo y no se repite.
  assert.doesNotMatch(nombreParaCliente('SGS25U3', 'SAMSUNG S25 ULTRA 3 IN 1'), /3 ?[ei]n ?1/i)
})

test('el teléfono se conserva y se escribe como se escribe', () => {
  assert.equal(nombreParaCliente('SGS25UT', 'SAMSUNG S25 ULTRA TPU CASE'),
    'Funda de goma flexible para Samsung S25 Ultra')
  // iPhone lleva su i minúscula; «Iphone» se lee como error de la tienda.
  assert.match(nombreParaCliente('I13T', 'IPHONE 13 TPU CASE'), /iPhone 13/)
})

test('una mica no lleva teléfono, porque es genérica', () => {
  // Quitando las palabras de catálogo queda basura —«HD Alta», «Privacidad»—
  // y pegarla detrás de «para» inventaba un modelo que no existe.
  for (const [c, n] of [['HDA', 'MICA HIDRIOGEL HD ALTA'], ['PV', 'HIDROGEL PRIVACIDAD'], ['HDR', 'HD USO RUDO']]) {
    assert.doesNotMatch(nombreParaCliente(c, n), / para /, n)
  }
  assert.equal(nombreParaCliente('MT', 'MICA HIDROGEL MATE'), 'Mica mate')
})

test('lo que no se reconoce se deja tal cual, feo pero nunca falso', () => {
  assert.equal(nombreParaCliente('EM', 'EXHIBIDOR MAYORISTA'), 'EXHIBIDOR MAYORISTA')
})

test('la búsqueda devuelve el nombre de cliente junto al de catálogo', async () => {
  montar()
  const r = await buscarEnPlaza({ plaza: 'leon', texto: 'a06' })
  assert.equal(r.hayPiezas[0].nombre, 'SAMSUNG A06 TPU CASE', 'el de catálogo, para las herramientas')
  assert.match(r.hayPiezas[0].comoSeDice, /goma flexible/, 'y el de cliente, para el chat')
})

test('el pie de una foto prestada sigue avisando', async () => {
  // La advertencia no se traduce: lo que importa es reconocer de qué teléfono
  // es la foto, no que suene bonito.
  const f = await fotoDe({ codigo: 'SGS26UT', nombre: 'SAMSUNG S26 ULTRA TPU CASE' })
  if (f && !f.exacta) assert.match(f.pie, /^Foto de referencia: es del /)
})

// ── El color y «transparente» no se pierden ni se regalan ─────────────────

test('el color se dice como adjetivo de la funda, no pegado al teléfono', () => {
  // Antes salía «Funda de goma flexible para iPhone 11 Azul», que parece un
  // modelo de teléfono llamado «11 Azul».
  assert.equal(nombreParaCliente('I11AZ', 'IPHONE 11 AZUL TPU CASE'),
    'Funda de goma flexible azul para iPhone 11')
})

test('el color concuerda con «funda», que es femenino', () => {
  assert.match(nombreParaCliente('a', 'IPHONE 11 MORADO TPU CASE'), /morada/)
  assert.match(nombreParaCliente('b', 'IPHONE 11 NEGRO TPU CASE'),  /negra/)
  assert.match(nombreParaCliente('c', 'IPHONE 11 BLANCO TPU CASE'), /blanca/)
  // Los invariables se dejan como están.
  assert.match(nombreParaCliente('d', 'IPHONE 11 AZUL TPU CASE'), /azul/)
})

test('una TPU «transparente» lo dice, y una cristal no lo repite', () => {
  assert.equal(nombreParaCliente('I11T', 'IPHONE 11 TRANSPARENTE TPU CASE'),
    'Funda de goma flexible transparente para iPhone 11')
  // «Funda transparente» ya es el nombre del tipo cristal: no «transparente transparente».
  assert.equal(nombreParaCliente('I11TC', 'IPHONE 11 TPU CRISTAL'), 'Funda transparente para iPhone 11')
})

test('«transparente» no encuentra las TPU de color', async () => {
  // De 544 TPU del catálogo real sólo 10 se llaman TRANSPARENTE y 36 llevan
  // color. El alias que se puso primero —TRANSPARENTE a todas las TPU— hacía
  // que quien pedía una transparente recibiera una morada.
  olvidar()
  sembrar('leon', {
    nombre: 'León', corte: '2026-11-10', dias: 1, viejo: false,
    productos: [
      producto('I11TR', 'IPHONE 11 TRANSPARENTE TPU CASE', 3),
      producto('I11MO', 'IPHONE 11 MORADO TPU CASE', 2),
      producto('I11TC', 'IPHONE 11 TPU CRISTAL', 5),
    ],
  })
  const r = await buscarEnPlaza({ plaza: 'leon', texto: 'iphone 11 transparente' })
  const codigos = r.hayPiezas.map(x => x.codigo).sort()
  assert.deepEqual(codigos, ['I11TC', 'I11TR'], 'la cristal y la que se llama transparente, y NO la morada')
})

// ── El modelo por omisión ──────────────────────────────────────────────────

import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const RAIZ = fileURLToPath(new URL('..', import.meta.url))

/** Lee `MODELO` en un proceso aparte, con el entorno que se le diga. */
function modeloCon(entorno) {
  const env = { ...process.env }
  delete env.CRM_MODELO
  return execFileSync(
    process.execPath,
    ['--input-type=module', '-e', "import('./crm/modelo.js').then(m => console.log(m.MODELO))"],
    { cwd: RAIZ, env: { ...env, ...entorno }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  ).trim()
}

test('el bot usa Haiku 5.5 por omisión', () => {
  // Lo pidió el dueño: el más barato que pase las pruebas, y Haiku las pasa
  // (`npm run crm:evaluar`). Sin esta prueba, cambiarlo por «uno mejor» no lo
  // notaría nadie y el costo se multiplicaría por cuarenta sin que nada avisara.
  // Se lee en un proceso aparte para que un CRM_MODELO puesto en el entorno de
  // quien corre las pruebas no la falsee.
  assert.equal(modeloCon({}), 'claude-haiku-5-5')
})

test('sólo CRM_MODELO cambia el modelo, y sólo a uno con precio', () => {
  assert.equal(modeloCon({ CRM_MODELO: 'claude-sonnet-5-5' }), 'claude-sonnet-5-5')
  // Un modelo sin precio en la tabla no arranca: el costo que enseñan las tres
  // pantallas de prueba saldría falso, y con ese número se decide qué modelo usar.
  assert.throws(() => modeloCon({ CRM_MODELO: 'claude-inventado-9' }), /tabla de precios/)
})

// ── Tiempos y sitio de las fotos, para producción ──────────────────────────

import { TIEMPO_POR_LLAMADA_MS, REINTENTOS } from './cerebro.js'

test('una llamada a Claude cabe en lo que el trabajador deja para pensar', () => {
  // El trabajador tiene 90 s y guarda 10 para cerrar bien (crm/trabajador.js).
  // El SDK reintenta también cuando se agota el tiempo, así que el peor caso de
  // UNA llamada es el tiempo por llamada multiplicado por los intentos. Sin
  // tope propio el SDK esperaba diez minutos, y con dos ejecuciones a la vez
  // dos llamadas colgadas congelaban el bot entero.
  const peorCaso = TIEMPO_POR_LLAMADA_MS * (1 + REINTENTOS)
  assert.ok(peorCaso <= 80_000, `el peor caso de una llamada es ${peorCaso} ms y el trabajador deja 80 000`)
  assert.ok(TIEMPO_POR_LLAMADA_MS >= 10_000, 'tan corto cortaría respuestas normales en un día lento')
})

/** Lee una exportación en un proceso aparte, sin las variables de quien corre las pruebas. */
function exportadoEnLimpio(modulo, nombre, quitar) {
  const env = { ...process.env }
  for (const v of quitar) delete env[v]
  return execFileSync(
    process.execPath,
    ['--input-type=module', '-e', `import('./${modulo}').then(m => console.log(m.${nombre}))`],
    { cwd: RAIZ, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  ).trim()
}

test('las fotos se sirven por omisión de un dominio que sí contesta', () => {
  // Durante dos semanas el valor por omisión fue un dominio de Amplify que no
  // responde, y nada fallaba: el bot mandaba una URL bien formada a ninguna
  // parte. Que la foto se BAJE de verdad lo comprueba `npm run crm:evaluar`,
  // que sí sale a la red; esto fija que no se vuelva a poner aquél.
  const sitio = exportadoEnLimpio('crm/herramientas.js', 'SITIO', ['CRM_SITIO'])
  assert.equal(sitio, 'https://istuffsbajio.com')
  assert.doesNotMatch(sitio, /amplifyapp/)
})
