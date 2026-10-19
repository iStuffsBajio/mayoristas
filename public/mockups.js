// Revisión de mockups. Va en un archivo aparte y no dentro del HTML porque
// la cabecera Content-Security-Policy del sitio declara `script-src 'self'`:
// eso prohíbe los scripts escritos dentro de la página. Estaba en línea y el
// navegador se negaba a ejecutarlo, así que la página se quedaba en
// «cargando…» para siempre.
//
// La salida fácil habría sido añadir 'unsafe-inline' a la política. No: esa
// es justo la defensa que impide que un script inyectado se ejecute.

// Normaliza igual que el buscador del inventario: sin acentos ni signos y por
// palabras, para que «a 16» encuentre el «A16» del catálogo.
const normalizar = t => String(t ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toUpperCase().replace(/[^A-Z0-9]/g, '')

const coincide = (q, campos) => {
  const palabras = String(q).split(/\s+/).map(normalizar).filter(Boolean)
  if (!palabras.length) return true
  const heno = campos.map(normalizar).join(' ')
  return palabras.every(p => heno.includes(p))
}

// Los que todavía no tienen mockup. Se escriben aquí a mano porque vienen del
// proceso de generación, no del índice: el índice sólo lleva lo que sí salió.
const SIN_MOCKUP = [
  { codigo: 'I17T',    nombre: 'IPHONE 17 TPU CASE',                   razon: 'falta el PSD' },
  { codigo: 'I17PMT',  nombre: 'IPHONE 17 PRO MAX TPU CASE',           razon: 'falta el PSD' },
  { codigo: 'I17PM3',  nombre: 'IPHONE 17 PRO MAX 3 IN 1',             razon: 'falta el PSD' },
  { codigo: 'SGA07T',  nombre: 'GALAXY A07 TPU CASE',                  razon: 'falta el PSD' },
  { codigo: 'OPR14FT', nombre: 'OPPO RENO 14F TPU CASE',               razon: 'falta el PSD' },
  { codigo: 'MTED60T', nombre: 'MOTO EDGE 60/EDGE 60 FUSION TPU CASE', razon: 'falta el PSD' },
  { codigo: 'HX6CT',   nombre: 'HONOR X6C TPU CASE',                   razon: 'falta el PSD' },
  { codigo: 'SGS25UT', nombre: 'SAMSUNG S25 ULTRA TPU CASE',           razon: 'el PSD es plantilla de corte, no mockup' },
  { codigo: 'SGS25U3', nombre: 'SAMSUNG S25 ULTRA 3 IN 1',             razon: 'el PSD es plantilla de corte, no mockup' },
]

let datos = []

const tarjeta = m => `
  <div class="card">
    <div class="lienzo" data-src="/mockups/${m.archivo}" data-txt="${m.codigo} · ${m.nombre}">
      <img src="/mockups/${m.archivo}" alt="${m.nombre}" loading="lazy">
    </div>
    <div>
      <div class="codigo">${m.codigo}</div>
      <div class="nombre">${m.nombre}</div>
    </div>
    <div class="pie"><span>${m.piezas} pz vendidas</span></div>
  </div>`

const tarjetaFalta = m => `
  <div class="card falta">
    <div class="lienzo">${m.razon}</div>
    <div>
      <div class="codigo">${m.codigo}</div>
      <div class="nombre">${m.nombre}</div>
    </div>
    <div class="pie"><span>sin mockup</span></div>
  </div>`

function pintar(q = '') {
  const vis = datos.filter(m => coincide(q, [m.codigo, m.nombre]))
  document.getElementById('rejilla').innerHTML = vis.map(tarjeta).join('')

  const faltan = SIN_MOCKUP.filter(m => coincide(q, [m.codigo, m.nombre]))
  document.getElementById('pendientes').innerHTML = faltan.length
    ? `<div class="seccion">Sin mockup todavía (${faltan.length})</div>
       <div class="rejilla">${faltan.map(tarjetaFalta).join('')}</div>`
    : ''

  document.getElementById('resumen').textContent =
    q ? `${vis.length} de ${datos.length} coinciden` : `${datos.length} fundas listas`
}

fetch('/mockups/indice.json?t=' + Date.now())
  .then(r => r.json())
  .then(j => {
    datos = j.mockups
    const fecha = new Date(j.generado).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })
    document.getElementById('cifras').innerHTML = `
      <span class="cifra"><b>${j.total}</b> listas</span>
      <span class="cifra"><b>${SIN_MOCKUP.length}</b> pendientes</span>
      <span class="cifra">generadas el ${fecha}</span>`
    pintar()
  })
  .catch(() => { document.getElementById('resumen').textContent = 'No se pudo leer el índice.' })

document.getElementById('buscar').addEventListener('input', e => pintar(e.target.value))

// Ver una en grande
const lupa = document.getElementById('lupa')
document.addEventListener('click', e => {
  const l = e.target.closest('.lienzo[data-src]')
  if (l) {
    document.getElementById('lupaImg').src = l.dataset.src
    document.getElementById('lupaTxt').textContent = l.dataset.txt
    lupa.classList.add('abierta')
  } else if (e.target.closest('.lupa')) {
    lupa.classList.remove('abierta')
  }
})
document.addEventListener('keydown', e => { if (e.key === 'Escape') lupa.classList.remove('abierta') })
