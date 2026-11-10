// El corte semanal de una sucursal, calculado sólo con lo que sale del punto de
// venta.
//
// Lo pidió el dueño el 2026-11-09, enseñando el Excel que hoy llena cada tienda
// a mano: ventas, entradas, gastos, sueldo, tarjeta, billetes, diferencia. Lo
// que decidió, con sus palabras:
//
//   · «toda la información en base a lo que debe de estar en la caja o en el
//     corte semanal, debe de ser en base al POS»;
//   · «el sueldo sale del acumulado de la semana, pero el empleado siempre lo
//     debe de reflejar en el POS como una salida»;
//   · «no hay ninguna tolerancia de faltante de dinero»;
//   · y que lo ÚNICO que alimenta la tienda es el conteo de billetes y monedas.
//
// Por eso este archivo no recibe ninguna cifra tecleada salvo ese conteo. Las
// cuentas de dinero son las de `caja.js` —`flujoSemana`, que ya sabe qué
// semanas tienen control de salidas— y aquí sólo se añade lo que el corte
// pide: separar sueldo de gastos, sumar el conteo y comparar.
//
// ── Cuatro decisiones que no se deducen del Excel ──────────────────────────
//
// 1. **El esperado sale del efectivo cobrado, no de «ventas − tarjeta».** La
//    fórmula del Excel (`ventas − gastos − sueldo − tarjeta`) trata como
//    efectivo todo lo que no sea tarjeta, y eso incluye las transferencias, los
//    vales y el crédito. `flujoSemana` ya trae el efectivo cobrado aparte, que
//    es lo que de verdad entra al cajón. Las dos cuentas coinciden cuando todo
//    lo que no es tarjeta es efectivo; cuando no, ésta es la que cuadra.
//
// 2. **Se compara al peso.** El POS lleva centavos —530.02— y el conteo cuenta
//    de a un peso, que es la denominación más chica del Excel: con centavos en
//    uno y nada en el otro, ninguna caja podría cuadrar jamás. El esperado se
//    redondea al peso y desde ahí NO hay tolerancia: un peso de más o de menos
//    ya es sobrante o faltante. Es resolución, no tolerancia.
//
// 3. **Sin fondo de caja no se juzga.** La diferencia es `contado − (fondo +
//    esperado)`: el cajón lleva el fondo, y sin saber cuánto es cualquier
//    resultado sería inventado. El fondo es un parámetro por plaza —el mismo de
//    la pantalla de Efectivo— y mientras falte, el corte dice que falta en vez
//    de pintar un color.
//
// 4. **El sueldo se reconoce por el concepto.** Eleventa sólo distingue Entrada
//    de Salida; el tipo fino lo pone la página. Una salida es sueldo si es un
//    `adelanto` o si su concepto lo dice (`PALABRAS_SUELDO`). Lo que un
//    empleado escriba de otro modo cae en gastos, y se enseña la lista de
//    salidas para que se vea. Falta que el dueño confirme las palabras.

import { flujoSemana, semanaDe, correrSemana, diasDeSemana, nombreDia, conControl, INICIO_HISTORIAL } from './caja.js'

const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0)

/** Billetes y monedas del corte, de mayor a menor: los del Excel del dueño. */
export const DENOMINACIONES = [500, 200, 100, 50, 20, 10, 5, 2, 1]

/**
 * 🔒 Cómo se reconoce una salida de sueldo por lo que escribió quien la
 * registró. Va aparte para que sea fácil cambiarla: es lo único de esta cuenta
 * que depende de cómo escriba la gente.
 */
export const PALABRAS_SUELDO = /\b(sueldos?|n[oó]minas?|salarios?|quincenas?|raya|pago\s+(de\s+)?(personal|empleados?|trabajadores?))\b/i

/**
 * Las plazas que llevan corte, en el orden en que se miran.
 *
 * Torreón es el caso especial: deposita o transfiere a las CUATRO semanas, no
 * cada una, así que se le lleva un ciclo de cuatro bloques semanales y un
 * bloque global del ciclo. Arranca el lunes 2026-11-09, el día en que el dueño
 * lo pidió —tiene que ser lunes, o `semanaDe` lo correría y el ciclo empezaría
 * antes de lo que dice esta constante—.
 */
export const PLAZAS_CORTE = [
  { slug: 'leon',           nombre: 'León' },
  { slug: 'san-luis',       nombre: 'San Luis Potosí' },
  { slug: 'aguascalientes', nombre: 'Aguascalientes' },
  { slug: 'torreon',        nombre: 'Torreón', ciclo: { desde: '2026-11-09', semanas: 4 } },
]

/** Cuántas semanas se enseñan de una tienda que deposita cada semana. */
export const SEMANAS_DE_CORTE = 2

// ── El conteo ───────────────────────────────────────────────────────────────

/** Una cantidad de billetes: un entero de cero a arriba, y nada más. */
export const cantidadValida = v => Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 100000

/**
 * Cuánto dinero hay en el conteo. Suma `denominación × cantidad` y descarta lo
 * que no sea una denominación de la lista o una cantidad entera: lo demás no es
 * un conteo, es un error de captura.
 */
export function totalContado(cantidades = {}) {
  let t = 0
  for (const d of DENOMINACIONES) {
    const q = cantidades?.[d] ?? cantidades?.[String(d)]
    if (q === undefined || q === null || q === '') continue
    if (cantidadValida(q)) t += d * Number(q)
  }
  return t
}

/** El conteo limpio: sólo las denominaciones válidas y sólo lo que no es cero. */
export function limpiarConteo(cantidades = {}) {
  const out = {}
  for (const d of DENOMINACIONES) {
    const q = cantidades?.[d] ?? cantidades?.[String(d)]
    if (q !== undefined && q !== null && q !== '' && cantidadValida(q) && Number(q) > 0) out[d] = Number(q)
  }
  return out
}

// ── El sueldo y las salidas ─────────────────────────────────────────────────

/** ¿Esta salida es un sueldo? Un adelanto lo es; lo demás, por lo que dice. */
export const esSueldo = m =>
  m?.tipo !== 'entrada' && m?.tipo !== 'faltante'
  && (m?.tipo === 'adelanto' || PALABRAS_SUELDO.test(String(m?.concepto ?? '')))

/**
 * Separa los movimientos de la semana en lo que entró, lo que se pagó de sueldo
 * y lo que se fue en gastos.
 *
 * Los faltantes NO entran: no restan del efectivo —ver `NO_RESTAN` en
 * `caja.js`— y llevan el nombre de quien cerró el turno. Esta pantalla es de
 * la tienda y no los enseña.
 */
export function clasificarMovimientos(movs = []) {
  const entradas = [], sueldos = [], gastos = []
  for (const m of movs ?? []) {
    if (m?.tipo === 'faltante') continue
    if (m?.tipo === 'entrada') entradas.push(m)
    else if (esSueldo(m)) sueldos.push(m)
    else gastos.push(m)
  }
  const suma = xs => xs.reduce((a, m) => a + num(m.monto), 0)
  return {
    entradas, sueldos, gastos,
    totalEntradas: suma(entradas), totalSueldos: suma(sueldos), totalGastos: suma(gastos),
  }
}

// ── La semana ───────────────────────────────────────────────────────────────

/**
 * Redondea al peso. El esperado sale con centavos y el conteo no puede
 * tenerlos: se compara al peso, y de ahí para abajo no hay tolerancia.
 */
export const alPeso = v => Math.round(num(v))

/**
 * Lo que dice una semana de corte, de punta a punta.
 *
 * `caja` trae `{ dias, movimientos }` del POS; `ventas` trae `{ porDiaTipo }`;
 * `params` los parámetros de la plaza (`fondoFijo`, `desdeControlSalidas`);
 * `conteo` es lo que contó la tienda —o `null— y `acumuladoPrevio` el esperado
 * de las semanas anteriores que todavía no se han entregado (Torreón).
 *
 * Los estados, que son los que pintan el color:
 *
 *   · `cuadra`      verde: el conteo es exactamente lo esperado
 *   · `faltante`    rojo: hay menos
 *   · `sobrante`    azul: hay más
 *   · `sin-conteo`  falta capturar el corte
 *   · `sin-fondo`   falta el fondo de caja de la plaza: no se puede comparar
 *   · `sin-control` la semana es anterior a que la plaza registrara sus
 *                   salidas: el esperado es un techo, no una cifra
 */
export function cuadreSemanal({ semana, caja = {}, ventas = {}, params = {}, conteo = null, acumuladoPrevio = 0 } = {}) {
  const flujo = flujoSemana(semana, {
    dias: caja?.dias ?? [], movimientos: caja?.movimientos ?? [], params,
  })

  // Los movimientos de toda la semana, planos, para clasificarlos de una vez.
  const movs = flujo.filas.flatMap(f => f.movs ?? [])
  const mov = clasificarMovimientos(movs)

  const t = flujo.total
  // El efectivo teórico de la semana: lo cobrado en efectivo, menos
  // devoluciones, más lo que entró, menos sueldo y gastos. Es el `neto` de
  // `caja.js` con el sueldo separado de los gastos.
  const esperado = num(t.efectivoCobrado) - num(t.devoluciones) + mov.totalEntradas - mov.totalSueldos - mov.totalGastos

  const porFecha = new Map((ventas?.porDiaTipo ?? []).map(d => [d.f, d]))
  const dias = flujo.filas.map(f => {
    const p = porFecha.get(f.f)
    return {
      f: f.f, dia: f.dia, hayDato: f.hayDato,
      ventaTotal: f.ventaTotal, efectivo: f.efectivoCobrado, tarjeta: f.tarjeta,
      transferencia: f.transferencia, otras: f.otrasNoEfectivo,
      // `null` es «no hay desglose»; cero es «no se vendió nada de eso».
      piezas: p ? {
        fundas: num(p.fundas), hidrogel: num(p.hidrogel), stickers: num(p.stickers),
        total: num(p.fundas) + num(p.hidrogel) + num(p.stickers),
        otros: num(p.otros),
      } : null,
    }
  })
  const conPiezas = dias.filter(d => d.piezas)
  const piezas = conPiezas.length ? {
    fundas: conPiezas.reduce((a, d) => a + d.piezas.fundas, 0),
    hidrogel: conPiezas.reduce((a, d) => a + d.piezas.hidrogel, 0),
    stickers: conPiezas.reduce((a, d) => a + d.piezas.stickers, 0),
    total: conPiezas.reduce((a, d) => a + d.piezas.total, 0),
    otros: conPiezas.reduce((a, d) => a + d.piezas.otros, 0),
  } : null

  const fondo = params?.fondoFijo === null || params?.fondoFijo === undefined ? null : num(params.fondoFijo)
  const esperadoEnCaja = fondo === null ? null : alPeso(fondo + acumuladoPrevio + esperado)
  const contado = conteo ? totalContado(conteo.cantidades ?? conteo) : null
  const diferencia = contado !== null && esperadoEnCaja !== null ? contado - esperadoEnCaja : null

  let estado
  if (!flujo.conControl) estado = 'sin-control'
  else if (fondo === null) estado = 'sin-fondo'
  else if (contado === null) estado = 'sin-conteo'
  else if (diferencia === 0) estado = 'cuadra'
  else estado = diferencia < 0 ? 'faltante' : 'sobrante'

  return {
    semana: { desde: semana.desde, hasta: semana.hasta },
    clave: semana.desde,
    dias,
    ventaTotal: t.ventaTotal,
    efectivoCobrado: t.efectivoCobrado,
    tarjeta: t.tarjeta,
    transferencia: t.transferencia,
    otrasNoEfectivo: t.otrasNoEfectivo,
    ingresosElectronicos: num(t.tarjeta) + num(t.transferencia),
    devoluciones: t.devoluciones,
    entradas: mov.totalEntradas,
    sueldo: mov.totalSueldos,
    gastos: mov.totalGastos,
    listas: { entradas: mov.entradas, sueldos: mov.sueldos, gastos: mov.gastos },
    ventasBrutas: num(t.ventaTotal) + mov.totalEntradas,
    esperado,
    fondo,
    esperadoEnCaja,
    contado,
    diferencia,
    // Lo que se entrega: lo contado menos el fondo, que se queda en la caja.
    entregable: contado !== null && fondo !== null ? contado - fondo : null,
    piezas,
    conControl: flujo.conControl,
    diasSinControl: flujo.diasSinControl,
    estado,
    conteo: conteo ?? null,
  }
}

// ── El color ────────────────────────────────────────────────────────────────

/**
 * Lo que se pinta para cada estado. Los tres colores los puso el dueño:
 * verde ($0, cuadra), rojo (faltante) y azul (sobrante). El gris no es suyo y
 * hace falta: es lo que no se puede juzgar, y pintarlo verde diría que cuadra
 * y pintarlo rojo acusaría de un faltante que nadie midió.
 */
export const SEMAFORO_DE_CORTE = {
  'cuadra':      { color: 'verde', texto: 'Caja cuadrada' },
  'faltante':    { color: 'rojo',  texto: 'Faltante en caja' },
  'sobrante':    { color: 'azul',  texto: 'Sobrante en caja' },
  'sin-conteo':  { color: 'gris',  texto: 'Falta capturar el corte' },
  'sin-fondo':   { color: 'gris',  texto: 'Falta el fondo de caja de esta plaza' },
  'sin-control': { color: 'gris',  texto: 'Semana sin control de salidas: el esperado es un máximo' },
}

// ── Torreón: el ciclo de cuatro semanas ─────────────────────────────────────

const MS_DIA = 86400000
const comoFecha = f => { const [y, m, d] = String(f).split('-').map(Number); return new Date(y, m - 1, d) }
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * El ciclo de semanas que contiene una fecha, o `null` si no hay ciclo.
 *
 * Los ciclos son tramos seguidos de `ciclo.semanas` semanas desde `ciclo.desde`.
 * Una fecha anterior al arranque cae en el primer ciclo: la pantalla no se
 * queda sin nada que enseñar.
 */
export function cicloDe(plaza, fecha) {
  const c = plaza?.ciclo
  if (!c) return null
  const dias = Math.round((comoFecha(fecha) - comoFecha(c.desde)) / MS_DIA)
  const n = Math.max(0, Math.floor(dias / (7 * c.semanas)))
  const inicio = comoFecha(c.desde)
  inicio.setDate(inicio.getDate() + n * 7 * c.semanas)
  const semanas = Array.from({ length: c.semanas }, (_, i) => {
    const d = new Date(inicio); d.setDate(d.getDate() + i * 7)
    return semanaDe(iso(d))
  })
  return { n, desde: semanas[0].desde, hasta: semanas[semanas.length - 1].hasta, semanas }
}

/**
 * Los bloques de corte de una plaza alrededor de una fecha.
 *
 * Una tienda normal enseña la semana de esa fecha y la anterior, sin pasar de
 * `INICIO_HISTORIAL`. Torreón enseña su CICLO entero: cuatro semanas, cada una
 * contra lo acumulado hasta ahí —el efectivo no se entrega semana a semana, se
 * va juntando— y un bloque global del ciclo.
 *
 * `conteos` va indexado por el lunes de cada semana.
 */
export function bloquesDeCorte({ plaza, fecha, caja = {}, ventas = {}, params = {}, conteos = {} } = {}) {
  const ciclo = cicloDe(plaza, fecha)

  if (!ciclo) {
    const ultima = semanaDe(fecha)
    const out = []
    for (let i = 0; i < SEMANAS_DE_CORTE; i++) {
      const semana = correrSemana(ultima, -i)
      if (semana.desde < semanaDe(INICIO_HISTORIAL).desde) break
      out.push(cuadreSemanal({ semana, caja, ventas, params, conteo: conteos[semana.desde] ?? null }))
    }
    // Nunca vacío: la semana en curso sale siempre.
    if (!out.length) out.push(cuadreSemanal({ semana: ultima, caja, ventas, params, conteo: conteos[ultima.desde] ?? null }))
    return { ciclo: null, bloques: out, global: null }
  }

  // Cada semana del ciclo suma lo esperado de las anteriores: el dinero se va
  // juntando hasta el día de entregarlo.
  let previo = 0
  const bloques = ciclo.semanas.map(semana => {
    const b = cuadreSemanal({
      semana, caja, ventas, params, conteo: conteos[semana.desde] ?? null, acumuladoPrevio: previo,
    })
    previo += b.esperado
    return b
  })

  const suma = k => bloques.reduce((a, b) => a + num(b[k]), 0)
  // El bloque global compara lo último que se contó contra lo acumulado hasta
  // esa semana: es la cifra que importa el día de entregar.
  const ultimaContada = [...bloques].reverse().find(b => b.contado !== null) ?? null
  const fondo = bloques[0].fondo
  const esperadoTotal = fondo === null ? null : alPeso(fondo + suma('esperado'))
  const global = {
    desde: ciclo.desde, hasta: ciclo.hasta,
    ventaTotal: suma('ventaTotal'), efectivoCobrado: suma('efectivoCobrado'),
    tarjeta: suma('tarjeta'), transferencia: suma('transferencia'),
    devoluciones: suma('devoluciones'), entradas: suma('entradas'),
    sueldo: suma('sueldo'), gastos: suma('gastos'), esperado: suma('esperado'),
    esperadoEnCaja: esperadoTotal,
    piezas: bloques.some(b => b.piezas) ? {
      fundas: bloques.reduce((a, b) => a + (b.piezas?.fundas ?? 0), 0),
      hidrogel: bloques.reduce((a, b) => a + (b.piezas?.hidrogel ?? 0), 0),
      stickers: bloques.reduce((a, b) => a + (b.piezas?.stickers ?? 0), 0),
      total: bloques.reduce((a, b) => a + (b.piezas?.total ?? 0), 0),
    } : null,
    contado: ultimaContada?.contado ?? null,
    contadoEn: ultimaContada?.clave ?? null,
    diferencia: ultimaContada?.diferencia ?? null,
    estado: ultimaContada ? ultimaContada.estado : bloques.every(b => b.estado === 'sin-control') ? 'sin-control' : (fondo === null ? 'sin-fondo' : 'sin-conteo'),
    semanasConConteo: bloques.filter(b => b.contado !== null).length,
    semanas: bloques.length,
  }
  return { ciclo, bloques, global }
}

/**
 * El resumen de varias plazas, para la vista global del administrador.
 *
 * Suma lo que se puede sumar sin mentir —ventas, piezas, esperado— y deja cada
 * plaza con su propio estado. La diferencia global NO se suma: un faltante en
 * una plaza y un sobrante en otra no se compensan, y verde porque se
 * cancelan sería tapar justo lo que esta pantalla existe para enseñar.
 */
export function resumenGlobal(bloquesPorPlaza = {}) {
  const filas = Object.entries(bloquesPorPlaza).map(([slug, b]) => {
    const cur = b.global ?? b.bloques?.[0]
    return { slug, ...cur, bloques: b.bloques, ciclo: b.ciclo }
  })
  const suma = k => filas.reduce((a, f) => a + num(f[k]), 0)
  const hay = filas.filter(f => f.piezas)
  return {
    filas,
    ventaTotal: suma('ventaTotal'), efectivoCobrado: suma('efectivoCobrado'),
    tarjeta: suma('tarjeta'), transferencia: suma('transferencia'),
    gastos: suma('gastos'), sueldo: suma('sueldo'), esperado: suma('esperado'),
    piezas: hay.length ? {
      fundas: hay.reduce((a, f) => a + f.piezas.fundas, 0),
      hidrogel: hay.reduce((a, f) => a + f.piezas.hidrogel, 0),
      stickers: hay.reduce((a, f) => a + f.piezas.stickers, 0),
      total: hay.reduce((a, f) => a + f.piezas.total, 0),
    } : null,
    alertas: filas.filter(f => f.estado === 'faltante' || f.estado === 'sobrante'),
    faltantes: filas.filter(f => f.estado === 'faltante'),
  }
}

export { diasDeSemana, nombreDia, conControl }
