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
  precioProducto, precioDeCombo, listaDePrecios,
} from './herramientas.js'
import { tipoDe, precioDe, precioCombo, TIPOS, DESCUENTO_COMBO } from './precio.js'
import { plazaPara } from './plazas.js'

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
  assert.ok(r.opciones.length === 3, 'debe ofrecer las tres tiendas para preguntar')
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
  assert.equal(esPlazaPublica('torreon'), false, 'Torreón está dada de alta pero cerrada')
  assert.equal(esPlazaPublica('leon'), true)
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
  assert.equal(r.porPlaza.length, 3)
  assert.ok(!('total' in r), 'un total mandaría a alguien por piezas repartidas')
  assert.ok(!('piezas' in r))
  // 8 + 5 + 7 = 20, y esas veinte piezas no existen para nadie.
  const nombres = r.porPlaza.map(p => p.plaza)
  assert.deepEqual(nombres.sort(), ['aguascalientes', 'leon', 'san-luis'])
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

  const transp = await buscarEnPlaza({ plaza: 'leon', texto: 'transparente a06' })
  assert.equal(transp.totalHallados, 1, 'los TPU son los transparentes')
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

test('Torreón no direcciona a nadie mientras esté cerrada', () => {
  assert.equal(plazaPara('Torreón'), null)
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
  for (const plaza of ['bodega', 'ferias', 'torreon', undefined]) {
    const e = entregarASucursal({ plaza, telefonos: { general: '5213315381571' }, interes: [] })
    assert.equal(e.error, 'falta-plaza', `no se entrega a ${plaza}`)
  }
})
