import { useState, useRef, useEffect, useMemo } from 'react'
import GaleriaDropbox from './GaleriaDropbox'
import StockBadge from './StockBadge'
import { useSiteConfig } from '../context/SiteConfigContext'
import { loadInventarioJson, s3Configured } from '../lib/s3'
import { SUCURSALES, telefonoWhatsApp } from '../lib/sucursales'
import { uploadStikerDropbox, dropboxConfigured } from '../lib/dropbox'
import { armarMensaje, enlaceWhatsApp, carpetaDeRuta } from '../lib/whatsapp'
import { renombrar, puedeCompartirArchivos, compartirArchivos, descargarArchivos } from '../lib/compartir'

// ── Iconos ────────────────────────────────────────────────────────────────────

const IconoFoto = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" />
  </svg>
)

const IconoBuscar = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
  </svg>
)

const IconoWhatsApp = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.558 4.122 1.532 5.86L.078 23.561a.5.5 0 0 0 .612.612l5.701-1.454A11.94 11.94 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.907 0-3.693-.502-5.236-1.379l-.374-.216-3.884.991.991-3.884-.216-.374A9.96 9.96 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
  </svg>
)

// ── Estilos compartidos ───────────────────────────────────────────────────────

const inp = {
  width: '100%', padding: '10px 14px', borderRadius: 12, border: '1.5px solid rgba(0,0,0,0.1)',
  backgroundColor: '#f7f8fa', fontSize: 13.5, color: '#0A0A0A', outline: 'none',
  fontFamily: 'inherit', transition: 'border-color 0.15s', boxSizing: 'border-box',
}
const fp = e => { e.target.style.borderColor = 'rgba(213,26,122,0.5)'; e.target.style.backgroundColor = 'rgba(213,26,122,0.02)' }
const bl = e => { e.target.style.borderColor = 'rgba(0,0,0,0.1)'; e.target.style.backgroundColor = '#f7f8fa' }

const Campo = ({ label, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
    <label style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</label>
    {children}
  </div>
)

function Paso({ n, titulo, hecho, resumen, ultimo, children }) {
  return (
    <div style={{ display: 'flex', gap: 14 }}>
      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 800, color: 'white', background: hecho ? 'linear-gradient(135deg,#00BCF2,#8DC63F)' : 'rgba(0,0,0,0.16)', transition: 'background 0.25s' }}>
          {hecho ? '✓' : n}
        </div>
        {!ultimo && <div style={{ flex: 1, width: 2, backgroundColor: 'rgba(0,0,0,0.06)', marginTop: 6, minHeight: 8 }} />}
      </div>
      <div style={{ flex: 1, paddingBottom: 24, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '3px 0 12px', flexWrap: 'wrap' }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0A0A0A', margin: 0 }}>{titulo}</h3>
          {resumen && <span style={{ fontSize: 12, color: '#8DC63F', fontWeight: 700 }}>{resumen}</span>}
        </div>
        {children}
      </div>
    </div>
  )
}

// ── Resumen visual del pedido ─────────────────────────────────────────────────

function ResumenPedido({ lineas, totalPiezas }) {
  const conImagen = lineas.filter(l => l.imagen)

  return (
    <div style={{ position: 'sticky', top: 120 }}>
      <div style={{ background: '#fff', borderRadius: 22, border: '1px solid rgba(0,0,0,0.08)', padding: 18, boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' }}>
          Tu pedido
        </p>

        {lineas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '28px 10px' }}>
            <div style={{ fontSize: 38, marginBottom: 8 }}>📱</div>
            <p style={{ fontSize: 12.5, color: '#bbb', margin: 0, lineHeight: 1.5 }}>
              Elige uno o varios modelos y aparecerán aquí
            </p>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, maxHeight: 340, overflowY: 'auto' }}>
              {lineas.map(l => (
                <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 10, flexShrink: 0, overflow: 'hidden', background: 'linear-gradient(135deg,#f2f3f5,#e8e9eb)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {l.imagen
                      ? <img src={l.imagen.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ fontSize: 15, opacity: 0.35 }}>📷</span>}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: '#0A0A0A', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {l.producto}
                    </p>
                    <p style={{ fontSize: 11, color: l.imagen ? '#8DC63F' : '#d97706', margin: 0, fontWeight: 600 }}>
                      {l.cantidad} pz · {l.imagen ? 'con diseño' : 'falta diseño'}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(0,0,0,0.07)', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12.5, color: '#666' }}>
                {lineas.length} modelo{lineas.length !== 1 ? 's' : ''} · {conImagen.length} con diseño
              </span>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#0A0A0A' }}>{totalPiezas} pz</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

let contadorId = 0

export default function Personalizer() {
  const { config } = useSiteConfig()

  const [sucursal, setSucursal] = useState(SUCURSALES[0])
  const [modelos, setModelos]   = useState(null)
  const [cargando, setCargando] = useState(false)
  const [errorInv, setErrorInv] = useState(null)
  const [busca, setBusca]       = useState('')
  const [lineas, setLineas]     = useState([])
  const [form, setForm]         = useState({ nombre: '', mayorista: false, registro: '', notas: '' })
  const [subiendo, setSubiendo] = useState(false)
  const [progreso, setProgreso] = useState('')
  const [enviado, setEnviado]   = useState(false)
  const [aviso, setAviso]       = useState('')
  const archivoRefs = useRef({})

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  // Al cambiar de sucursal se recarga el inventario y se limpia el pedido,
  // porque los modelos disponibles son distintos en cada una.
  useEffect(() => {
    let cancelado = false
    setCargando(true); setErrorInv(null); setModelos(null); setLineas([]); setBusca('')
    ;(async () => {
      try {
        if (!s3Configured) throw new Error('sin-s3')
        const data = await loadInventarioJson(sucursal.slug)
        if (cancelado) return
        if (!data) { setErrorInv('sin-inventario'); return }
        setModelos({
          fecha: data.respaldo?.fecha || null,
          items: data.productos
            .map(p => ({ producto: String(p.Producto).trim(), stock: Number(p.Existencia) || 0 }))
            .filter(m => m.stock >= 1),
          totalCatalogo: data.productos.length,
        })
      } catch {
        if (!cancelado) setErrorInv('sin-inventario')
      } finally {
        if (!cancelado) setCargando(false)
      }
    })()
    return () => { cancelado = true }
  }, [sucursal])

  const yaElegido = producto => lineas.some(l => l.producto === producto)

  const disponibles = useMemo(() => {
    if (!modelos) return []
    const q = busca.trim().toLowerCase()
    const base = q ? modelos.items.filter(m => m.producto.toLowerCase().includes(q)) : modelos.items
    return base.slice(0, 50)
  }, [modelos, busca])

  const totalPiezas = lineas.reduce((s, l) => s + (Number(l.cantidad) || 0), 0)

  // ── Manejo de líneas ──

  const agregar = m => {
    if (yaElegido(m.producto)) return
    setLineas(ls => [...ls, {
      id: ++contadorId, producto: m.producto, stock: m.stock,
      cantidad: 1, imagen: null, archivo: null, descripcion: '',
    }])
  }

  const quitar   = id => setLineas(ls => ls.filter(l => l.id !== id))
  const cambiar  = (id, campo, valor) => setLineas(ls => ls.map(l => l.id === id ? { ...l, [campo]: valor } : l))

  const ponerArchivo = (id, file) => {
    if (!file?.type.startsWith('image/')) return
    const r = new FileReader()
    r.onload = e => setLineas(ls => ls.map(l => l.id === id
      ? { ...l, imagen: { url: e.target.result, name: file.name }, archivo: file }
      : l))
    r.readAsDataURL(file)
  }

  const ponerDeGaleria = (id, item) =>
    setLineas(ls => ls.map(l => l.id === id ? { ...l, imagen: item, archivo: null } : l))

  // ── Envío ──

  const numeroSucursal = telefonoWhatsApp(config.whatsapp?.[sucursal.slug]) || telefonoWhatsApp(config.whatsapp?.general)
  const usaGeneral     = !telefonoWhatsApp(config.whatsapp?.[sucursal.slug])
  const sinDiseno      = lineas.filter(l => !l.imagen)
  const completo       = lineas.length > 0 && sinDiseno.length === 0 && form.nombre.trim() && numeroSucursal

  // Las imágenes del cliente, renombradas con su modelo. El contenido no se
  // toca, solo la etiqueta con la que viajan, para que en el chat se vea a qué
  // funda corresponde cada una sin tener que preguntarlo.
  const archivosRenombrados = useMemo(
    () => lineas.filter(l => l.archivo).map(l => renombrar(l.archivo, l.producto, form.nombre)),
    [lineas, form.nombre]
  )
  const sePuedeAdjuntar = puedeCompartirArchivos(archivosRenombrados)

  const textoPedido = ({ carpetas = [], guardadas = 0, fallidas = 0 } = {}) => {
    const detalle = lineas.flatMap((l, i) => [
      `${i + 1}. *${l.producto}* — ${l.cantidad} pz`,
      l.descripcion.trim() ? `   ${l.descripcion.trim()}` : null,
      l.imagen && !l.archivo ? `   Diseño del catálogo: ${l.imagen.name?.replace(/\.[^.]+$/, '') || ''}` : null,
      l.archivo ? `   Imagen: ${renombrar(l.archivo, l.producto, form.nombre).name}` : null,
    ].filter(Boolean))

    return armarMensaje([
      '*PEDIDO FUNDAS PERSONALIZADAS - iStuffs*',
      '',
      `*Sucursal:* ${sucursal.nombre}`,
      `*Cliente:* ${form.nombre}`,
      form.mayorista
        ? `*Mayorista:* Si${form.registro.trim() ? ` - Registro: ${form.registro.trim()}` : ''}`
        : '*Mayorista:* No',
      '',
      `*Modelos:* ${lineas.length} · *Total:* ${totalPiezas} pieza(s)`,
      ...detalle,
      '',
      form.notas.trim() ? `*Notas:* ${form.notas.trim()}` : null,
      guardadas
        ? `*${guardadas} imagen(es) en Dropbox,* carpeta ${carpetas.join(', ')}, con el nombre del modelo.`
        : null,
      fallidas ? `*OJO:* ${fallidas} imagen(es) no se guardaron, se adjuntan en este chat.` : null,
    ])
  }

  const enviar = async e => {
    e.preventDefault()
    if (!completo) return
    setAviso('')

    // 1) Dropbox es la via garantizada. WhatsApp Web no acepta adjuntos por
    //    enlace y las descargas multiples las bloquea el navegador, asi que
    //    sin esto las imagenes simplemente no llegaban desde computadora.
    const carpetas = new Set()
    let guardadas = 0, fallidas = 0
    const propias = lineas.filter(l => l.archivo)

    if (propias.length && dropboxConfigured) {
      setSubiendo(true)
      for (const [i, l] of propias.entries()) {
        setProgreso(`Guardando imagen ${i + 1} de ${propias.length}...`)
        try {
          const ruta = await uploadStikerDropbox(sucursal.slug, l.archivo, form.nombre, l.producto)
          carpetas.add(carpetaDeRuta(ruta))
          guardadas++
        } catch (err) {
          fallidas++
          console.error('No se pudo subir', l.producto, err)
        }
      }
      setProgreso('')
      setSubiendo(false)
    }

    const msg = textoPedido({ carpetas: [...carpetas], guardadas, fallidas })

    // 2) Si ademas el dispositivo puede adjuntar, se hace: la sucursal ve las
    //    imagenes en el chat al instante, sin abrir Dropbox.
    if (sePuedeAdjuntar) {
      const listo = await compartirArchivos(archivosRenombrados, msg)
      if (listo) {
        setEnviado(true)
        setTimeout(() => setEnviado(false), 6000)
        return
      }
      // Si cancelo la hoja de compartir, sigue el camino normal por enlace.
    }

    window.open(enlaceWhatsApp(numeroSucursal, msg), '_blank')

    if (fallidas || (propias.length && !dropboxConfigured)) {
      const sinGuardar = fallidas || propias.length
      descargarArchivos(archivosRenombrados)
      setAviso(`${sinGuardar} imagen(es) no se pudieron guardar en Dropbox. Se descargaron a tu equipo para que las adjuntes al chat.`)
    }

    setEnviado(true)
    setTimeout(() => setEnviado(false), 7000)
  }

  const carpetaFundas = config.dropboxCatalogos?.fundas || ''
  const ocultos = modelos ? modelos.totalCatalogo - modelos.items.length : 0

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <div className="mb-8">
        <p className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: '#D51A7A' }}>Diseña tu funda</p>
        <h2 className="text-3xl sm:text-4xl font-black mb-1" style={{ color: '#0A0A0A' }}>Arma tu pedido</h2>
        <p className="text-sm" style={{ color: '#888' }}>
          Elige los modelos que necesites con su cantidad, asigna un diseño a cada uno y el pedido llega al WhatsApp de la sucursal.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">

        <div className="lg:col-span-2 order-2 lg:order-1">
          <ResumenPedido lineas={lineas} totalPiezas={totalPiezas} />
        </div>

        <form onSubmit={enviar} className="lg:col-span-3 order-1 lg:order-2">

          {/* Paso 1 — Sucursal */}
          <Paso n={1} titulo="¿A qué sucursal va el pedido?" hecho={!!sucursal} resumen={sucursal.nombre}>
            <div className="flex gap-2 flex-wrap">
              {SUCURSALES.map(s => {
                const activa = sucursal.slug === s.slug
                return (
                  <button key={s.slug} type="button" onClick={() => setSucursal(s)}
                    className="px-5 py-2.5 text-sm font-semibold transition-all"
                    style={activa
                      ? { background: 'linear-gradient(135deg, #00BCF2, #8DC63F)', borderRadius: 999, color: 'white', border: 'none', cursor: 'pointer', boxShadow: '0 4px 16px rgba(0,188,242,0.25)' }
                      : { backgroundColor: 'rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.09)', borderRadius: 999, color: '#555', cursor: 'pointer', background: 'none' }}>
                    {s.nombre}
                  </button>
                )
              })}
            </div>
            {usaGeneral && (
              <p style={{ fontSize: 11, color: '#d97706', marginTop: 10 }}>
                Esta sucursal no tiene WhatsApp propio. El pedido irá al número general.
              </p>
            )}
          </Paso>

          {/* Paso 2 — Modelos */}
          <Paso n={2} titulo="Elige los modelos" hecho={lineas.length > 0}
                resumen={lineas.length ? `${lineas.length} modelo${lineas.length !== 1 ? 's' : ''} · ${totalPiezas} pz` : ''}>

            {cargando && <p style={{ fontSize: 13, color: '#aaa' }}>Cargando existencias de {sucursal.nombre}...</p>}

            {!cargando && errorInv && (
              <div style={{ padding: '13px 15px', borderRadius: 12, background: 'rgba(213,26,122,0.05)', border: '1px solid rgba(213,26,122,0.15)' }}>
                <p style={{ fontSize: 13, color: '#D51A7A', fontWeight: 600, margin: 0 }}>Sin inventario para {sucursal.nombre}</p>
                <p style={{ fontSize: 12, color: '#888', margin: '4px 0 0' }}>Elige otra sucursal o comunícate directamente.</p>
              </div>
            )}

            {modelos && !cargando && (
              <>
                <div style={{ position: 'relative', marginBottom: 10 }}>
                  <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(0,0,0,0.28)', pointerEvents: 'none' }}><IconoBuscar /></span>
                  <input value={busca} onChange={e => setBusca(e.target.value)}
                    placeholder={`Buscar entre ${modelos.items.length} modelos disponibles...`}
                    style={{ ...inp, padding: '10px 14px 10px 38px' }} onFocus={fp} onBlur={bl} />
                </div>

                <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12 }}>
                  {disponibles.length === 0 && (
                    <p style={{ fontSize: 13, color: '#bbb', padding: '16px', textAlign: 'center' }}>Sin resultados</p>
                  )}
                  {disponibles.map((m, i) => {
                    const elegido = yaElegido(m.producto)
                    return (
                      <button key={m.producto + i} type="button" onClick={() => agregar(m)} disabled={elegido}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 14px', background: elegido ? 'rgba(141,198,63,0.08)' : 'none', border: 'none', borderBottom: i < disponibles.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none', cursor: elegido ? 'default' : 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                        <span style={{ fontSize: 13, color: elegido ? '#8DC63F' : '#0A0A0A', fontWeight: elegido ? 700 : 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {elegido ? '✓ ' : '+ '}{m.producto}
                        </span>
                        <StockBadge value={m.stock} size={12.5} />
                      </button>
                    )
                  })}
                </div>

                <p style={{ fontSize: 11, color: '#bbb', marginTop: 7, lineHeight: 1.6 }}>
                  {disponibles.length === 50 && modelos.items.length > 50 ? `Mostrando 50 de ${modelos.items.length}, escribe para filtrar. ` : ''}
                  {modelos.fecha ? `Existencias del ${modelos.fecha}. ` : ''}
                  {ocultos > 0 ? `${ocultos} modelos sin existencia no se muestran.` : ''}
                </p>
              </>
            )}
          </Paso>

          {/* Paso 3 — Diseño por modelo */}
          <Paso n={3} titulo="Asigna el diseño de cada modelo"
                hecho={lineas.length > 0 && sinDiseno.length === 0}
                resumen={lineas.length ? `${lineas.length - sinDiseno.length} de ${lineas.length} listos` : ''}>

            {lineas.length === 0 && <p style={{ fontSize: 13, color: '#bbb' }}>Primero elige al menos un modelo.</p>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {lineas.map(l => (
                <div key={l.id} style={{ border: `1.5px solid ${l.imagen ? 'rgba(141,198,63,0.35)' : 'rgba(0,0,0,0.1)'}`, borderRadius: 14, padding: 13, background: l.imagen ? 'rgba(141,198,63,0.03)' : '#fff', transition: 'all 0.2s' }}>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 11 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#0A0A0A', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {l.producto}
                    </span>
                    <StockBadge value={l.stock} size={12} />
                    <button type="button" onClick={() => quitar(l.id)} title="Quitar"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ccc', fontSize: 19, lineHeight: 1, padding: '0 2px' }}>×</button>
                  </div>

                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    {/* Vista previa y selector de imagen */}
                    <button type="button" onClick={() => archivoRefs.current[l.id]?.click()}
                      style={{ width: 68, height: 68, borderRadius: 12, flexShrink: 0, overflow: 'hidden', cursor: 'pointer', padding: 0, border: l.imagen ? 'none' : '2px dashed rgba(0,0,0,0.15)', background: l.imagen ? 'none' : 'rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, color: '#D51A7A' }}>
                      {l.imagen
                        ? <img src={l.imagen.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <><IconoFoto /><span style={{ fontSize: 9, fontWeight: 700, color: '#999' }}>Galería</span></>}
                    </button>
                    <input type="file" accept="image/*" style={{ display: 'none' }}
                      ref={el => { archivoRefs.current[l.id] = el }}
                      onChange={e => ponerArchivo(l.id, e.target.files[0])} />

                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <input value={l.descripcion} onChange={e => cambiar(l.id, 'descripcion', e.target.value)}
                        placeholder="Descripción del diseño para este modelo"
                        style={{ ...inp, padding: '8px 12px', fontSize: 12.5 }} onFocus={fp} onBlur={bl} />

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Piezas</span>
                        <button type="button" onClick={() => cambiar(l.id, 'cantidad', Math.max(1, Number(l.cantidad) - 1))}
                          style={{ width: 26, height: 26, borderRadius: 8, border: '1px solid rgba(0,0,0,0.12)', background: '#fff', cursor: 'pointer', fontSize: 15, lineHeight: 1, color: '#555' }}>−</button>
                        <input type="number" min="1" value={l.cantidad}
                          onChange={e => cambiar(l.id, 'cantidad', Math.max(1, Number(e.target.value) || 1))}
                          style={{ ...inp, width: 62, textAlign: 'center', padding: '5px 6px', fontSize: 13, fontWeight: 700 }} onFocus={fp} onBlur={bl} />
                        <button type="button" onClick={() => cambiar(l.id, 'cantidad', Number(l.cantidad) + 1)}
                          style={{ width: 26, height: 26, borderRadius: 8, border: '1px solid rgba(0,0,0,0.12)', background: '#fff', cursor: 'pointer', fontSize: 15, lineHeight: 1, color: '#555' }}>+</button>
                        {Number(l.cantidad) > l.stock && (
                          <span style={{ fontSize: 11, color: '#d97706', fontWeight: 600 }}>Supera las {l.stock} en existencia</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Catálogo de Dropbox para este modelo */}
                  {carpetaFundas && (
                    <div style={{ marginTop: 10 }}>
                      <GaleriaDropbox
                        folderPath={carpetaFundas}
                        seleccionado={l.imagen}
                        onSelect={item => ponerDeGaleria(l.id, item)}
                        label="O elige del catálogo"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Paso>

          {/* Paso 4 — Datos y envío */}
          <Paso n={4} titulo="Tus datos y envío" hecho={enviado} ultimo>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Campo label="Nombre del cliente">
                <input value={form.nombre} onChange={set('nombre')} placeholder="Ej. Juan Pérez" style={inp} onFocus={fp} onBlur={bl} />
              </Campo>

              <div style={{ padding: '13px 15px', borderRadius: 13, border: `1.5px solid ${form.mayorista ? 'rgba(0,188,242,0.35)' : 'rgba(0,0,0,0.1)'}`, background: form.mayorista ? 'rgba(0,188,242,0.04)' : '#f7f8fa', transition: 'all 0.2s' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 11, cursor: 'pointer' }}>
                  <div onClick={() => setForm(f => ({ ...f, mayorista: !f.mayorista }))}
                    style={{ width: 40, height: 23, borderRadius: 999, background: form.mayorista ? 'linear-gradient(135deg,#00BCF2,#8DC63F)' : 'rgba(0,0,0,0.15)', position: 'relative', transition: 'all 0.2s', flexShrink: 0 }}>
                    <div style={{ position: 'absolute', top: 2, left: form.mayorista ? 19 : 2, width: 19, height: 19, borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
                  </div>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#0A0A0A', margin: 0 }}>¿Cuentas con registro de mayorista?</p>
                    <p style={{ fontSize: 11.5, color: '#999', margin: 0 }}>Para aplicar precio y condiciones de mayoreo.</p>
                  </div>
                </label>
                {form.mayorista && (
                  <input value={form.registro} onChange={set('registro')} placeholder="Número o nombre de registro (opcional)"
                    style={{ ...inp, marginTop: 10, backgroundColor: '#fff' }} onFocus={fp} onBlur={bl} />
                )}
              </div>

              <Campo label="Notas del pedido (opcional)">
                <textarea value={form.notas} onChange={set('notas')} rows={3}
                  placeholder="Día específico en que lo necesitas, forma de entrega, condiciones de mayoreo..."
                  style={{ ...inp, resize: 'vertical', minHeight: 74, lineHeight: 1.6 }} onFocus={fp} onBlur={bl} />
              </Campo>

              {/* Se explica ANTES de enviar como van a llegar las imagenes,
                  porque el comportamiento cambia entre celular y computadora. */}
              {archivosRenombrados.length > 0 && (
                <div style={{ padding: '11px 14px', borderRadius: 12, background: 'rgba(141,198,63,0.08)', border: '1px solid rgba(141,198,63,0.3)' }}>
                  <p style={{ fontSize: 12.5, fontWeight: 700, margin: 0, color: '#4d7c0f' }}>
                    {archivosRenombrados.length} imagen(es) se guardarán con el nombre de su modelo
                  </p>
                  <p style={{ fontSize: 12, margin: '3px 0 0', lineHeight: 1.5, color: '#3f6212' }}>
                    Quedan en la carpeta de {sucursal.nombre} en Dropbox.
                    {sePuedeAdjuntar ? ' Además se adjuntan al chat.' : ''}
                  </p>
                </div>
              )}

              {aviso && <p style={{ fontSize: 12, color: '#d97706' }}>{aviso}</p>}
              {!numeroSucursal && (
                <p style={{ fontSize: 12, color: '#D51A7A', fontWeight: 600 }}>
                  No hay WhatsApp configurado para {sucursal.nombre}. Pide al administrador que lo capture.
                </p>
              )}

              <button type="submit" disabled={!completo || subiendo}
                style={{ width: '100%', padding: '14px 0', borderRadius: 999, border: 'none', fontSize: 15, fontWeight: 700, cursor: completo && !subiendo ? 'pointer' : 'default', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, transition: 'all 0.2s', background: completo && !subiendo ? 'linear-gradient(135deg,#25D366,#128C7E)' : 'rgba(0,0,0,0.07)', color: completo && !subiendo ? 'white' : 'rgba(0,0,0,0.28)', boxShadow: completo && !subiendo ? '0 6px 20px rgba(37,211,102,0.3)' : 'none' }}>
                <IconoWhatsApp />
                {subiendo ? (progreso || 'Guardando...') : enviado ? '¡Pedido enviado!' : `Enviar a ${sucursal.nombre} por WhatsApp`}
              </button>

              {!completo && !enviado && (
                <p style={{ fontSize: 11, color: '#bbb', textAlign: 'center', marginTop: -6 }}>
                  {lineas.length === 0 ? 'Elige al menos un modelo.'
                    : sinDiseno.length ? `Falta el diseño de ${sinDiseno.length} modelo(s).`
                    : !form.nombre.trim() ? 'Escribe tu nombre.'
                    : 'Falta configurar el WhatsApp de la sucursal.'}
                </p>
              )}
            </div>
          </Paso>
        </form>
      </div>
    </section>
  )
}
