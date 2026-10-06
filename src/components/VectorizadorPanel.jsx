import { useState, useRef, useEffect } from 'react'
import {
  leerImagen, vectorizar, conTamanoFisico, medidasDe, descargarSvg,
  DETALLES, COLORES,
} from '../lib/vectorizar'

const TINTA       = '#101619'
const TINTA_SUAVE = '#4A5A61'
const TINTA_TENUE = '#8598A1'
const LINEA       = '#D6E0E4'
const ROSA        = '#C4156F'
const VERDE       = '#5E9422'

const ZOOMS = [1, 2, 4, 8]

function Pildora({ activa, onClick, children, titulo }) {
  return (
    <button type="button" onClick={onClick} title={titulo}
      className="px-3.5 py-1.5 text-xs font-semibold transition-all"
      style={activa
        ? { background: 'linear-gradient(135deg, #00BCF2, #8DC63F)', borderRadius: 999, color: '#fff', border: 'none', cursor: 'pointer', boxShadow: '0 3px 12px rgba(0,188,242,0.22)' }
        : { backgroundColor: 'rgba(16,22,25,0.05)', border: '1px solid ' + LINEA, borderRadius: 999, color: TINTA_SUAVE, cursor: 'pointer', background: 'none' }}>
      {children}
    </button>
  )
}

function Dato({ valor, etiqueta, color }) {
  return (
    <div style={{ flex: 1, minWidth: 86, padding: '10px 12px', background: '#fff', border: '1px solid ' + LINEA, borderRadius: 16 }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: color || TINTA, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{valor}</div>
      <div style={{ fontSize: 11, color: TINTA_SUAVE, marginTop: 2 }}>{etiqueta}</div>
    </div>
  )
}

/** Lado a lado, con el mismo zoom en los dos, que es donde se ve la diferencia. */
function Comparador({ original, svg, zoom }) {
  const marco = {
    flex: 1, minWidth: 220, height: 260, borderRadius: 18, border: '1px solid ' + LINEA,
    background: '#fff', overflow: 'hidden', display: 'flex', alignItems: 'center',
    justifyContent: 'center', position: 'relative',
  }
  const contenido = {
    width: `${zoom * 100}%`, height: `${zoom * 100}%`,
    objectFit: 'contain', imageRendering: zoom > 2 ? 'pixelated' : 'auto',
  }
  const etiqueta = {
    position: 'absolute', top: 8, left: 10, fontSize: 10.5, fontWeight: 700,
    padding: '2px 8px', borderRadius: 999, background: 'rgba(16,22,25,0.72)', color: '#fff',
  }

  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      <div style={marco}>
        <span style={etiqueta}>Original</span>
        <img src={original} alt="Imagen original" style={contenido} />
      </div>
      <div style={marco}>
        <span style={{ ...etiqueta, background: 'rgba(94,148,34,0.9)' }}>Vectorizado</span>
        <div style={{ ...contenido, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
             dangerouslySetInnerHTML={{ __html: svg }} />
      </div>
    </div>
  )
}

export default function VectorizadorPanel() {
  const [archivo, setArchivo]   = useState(null)
  const [imagen, setImagen]     = useState(null)
  const [salida, setSalida]     = useState(null)
  const [detalle, setDetalle]   = useState('normal')
  const [colores, setColores]   = useState(8)
  const [ruido, setRuido]       = useState(true)
  const [anchoCm, setAnchoCm]   = useState(10)
  const [zoom, setZoom]         = useState(1)
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError]       = useState(null)
  const [arrastrando, setArrastrando] = useState(false)
  const inputRef = useRef(null)

  const cargar = async file => {
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('Eso no es una imagen.'); return }
    setError(null); setSalida(null); setZoom(1)
    setArchivo(file)
    try {
      setImagen(await leerImagen(file))
    } catch (e) {
      setError(e.message)
      setImagen(null)
    }
  }

  // Se vuelve a trazar al cambiar cualquier ajuste. El retraso evita rehacerlo
  // tres veces si se tocan dos botones seguidos.
  useEffect(() => {
    if (!imagen) return
    let cancelado = false
    setTrabajando(true)
    const t = setTimeout(async () => {
      try {
        const r = await vectorizar(imagen.imageData, { detalle, colores, quitarRuido: ruido })
        if (!cancelado) { setSalida(r); setError(null) }
      } catch (e) {
        if (!cancelado) setError('No se pudo vectorizar: ' + e.message)
      } finally {
        if (!cancelado) setTrabajando(false)
      }
    }, 180)
    return () => { cancelado = true; clearTimeout(t) }
  }, [imagen, detalle, colores, ruido])

  const medidas = salida ? medidasDe(salida.svg) : null
  const altoCm  = medidas && medidas.ancho ? (anchoCm * medidas.alto) / medidas.ancho : 0

  const bajar = () => descargarSvg(conTamanoFisico(salida.svg, anchoCm), archivo?.name)

  return (
    <div style={{ backgroundColor: '#fff', borderRadius: 30, border: '1px solid ' + LINEA, padding: '24px 22px', boxShadow: '0 2px 12px rgba(16,22,25,0.04)' }}>

      <div style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, fontWeight: 800, color: TINTA, margin: '0 0 4px' }}>🖊️ Vectorizar imagen</h3>
        <p style={{ fontSize: 12, color: TINTA_SUAVE, margin: 0, lineHeight: 1.5 }}>
          Convierte un logo en trazados para imprimirlo en la UV a cualquier tamaño sin que
          se pixelee. Todo se procesa aquí mismo: la imagen no se sube a ningún lado.
        </p>
      </div>

      {/* Zona de carga */}
      <div
        onDragOver={e => { e.preventDefault(); setArrastrando(true) }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={e => { e.preventDefault(); setArrastrando(false); cargar(e.dataTransfer.files?.[0]) }}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `1.5px dashed ${arrastrando ? '#00BCF2' : LINEA}`,
          background: arrastrando ? 'rgba(0,188,242,0.05)' : 'rgba(16,22,25,0.02)',
          borderRadius: 22, padding: '22px 18px', textAlign: 'center', cursor: 'pointer',
          marginBottom: 16, transition: 'background .15s, border-color .15s',
        }}>
        <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }}
               onChange={e => cargar(e.target.files?.[0])} />
        <p style={{ fontSize: 13, fontWeight: 700, color: TINTA, margin: '0 0 3px' }}>
          {archivo ? archivo.name : 'Arrastra una imagen o haz clic para elegirla'}
        </p>
        <p style={{ fontSize: 11.5, color: TINTA_TENUE, margin: 0 }}>
          {imagen
            ? `${imagen.anchoOriginal}×${imagen.altoOriginal} px${imagen.reducida ? ` · se trabaja a ${imagen.ancho}×${imagen.alto}` : ''}`
            : 'PNG, JPG o WEBP · funciona con logos y dibujos de colores planos'}
        </p>
      </div>

      {error && (
        <div style={{ padding: '12px 14px', borderRadius: 16, background: 'rgba(196,21,111,0.05)', border: '1px solid rgba(196,21,111,0.18)', marginBottom: 16 }}>
          <p style={{ fontSize: 12.5, color: ROSA, fontWeight: 700, margin: 0 }}>{error}</p>
        </div>
      )}

      {imagen && (
        <>
          {/* Ajustes */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: TINTA_SUAVE, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '.04em' }}>Detalle</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {DETALLES.map(d => (
                  <Pildora key={d.id} activa={detalle === d.id} onClick={() => setDetalle(d.id)} titulo={d.desc}>
                    {d.nombre}
                  </Pildora>
                ))}
              </div>
            </div>

            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: TINTA_SUAVE, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '.04em' }}>Colores</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {COLORES.map(n => (
                  <Pildora key={n} activa={colores === n} onClick={() => setColores(n)}>{n}</Pildora>
                ))}
                <Pildora activa={ruido} onClick={() => setRuido(!ruido)}
                         titulo="Borra el ruido de compresión de WhatsApp antes de trazar">
                  {ruido ? '✓ ' : ''}Limpiar ruido
                </Pildora>
              </div>
            </div>
          </div>

          {trabajando && <p style={{ fontSize: 12.5, color: TINTA_TENUE, margin: '0 0 12px' }}>Trazando...</p>}

          {salida && (
            <>
              {salida.pareceFoto && (
                <div style={{ padding: '12px 14px', borderRadius: 16, background: 'rgba(180,83,9,0.06)', border: '1px solid rgba(180,83,9,0.22)', marginBottom: 14 }}>
                  <p style={{ fontSize: 12.5, fontWeight: 700, color: '#B45309', margin: '0 0 4px' }}>
                    Esta imagen no es buena candidata
                  </p>
                  <p style={{ fontSize: 11.5, color: TINTA_SUAVE, margin: 0, lineHeight: 1.5 }}>
                    Salieron {salida.trazados.toLocaleString('es-MX')} trazados, señal de que es una foto o
                    tiene degradados. Vectorizarla no la mejora: para imprimir, conviene más la imagen
                    original a buena resolución. Prueba bajar los colores y subir el detalle a «Suave»,
                    pero si sigue en miles, no vale la pena.
                  </p>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                <Dato valor={salida.colores} etiqueta="colores" />
                <Dato valor={salida.trazados.toLocaleString('es-MX')} etiqueta="trazados"
                      color={salida.pareceFoto ? '#B45309' : TINTA} />
                <Dato valor={salida.bytes < 1024 * 1024
                        ? `${(salida.bytes / 1024).toFixed(0)} KB`
                        : `${(salida.bytes / 1048576).toFixed(1)} MB`}
                      etiqueta="peso del SVG"
                      color={salida.pareceFoto ? '#B45309' : VERDE} />
              </div>

              {/* Comparación */}
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: TINTA_SUAVE, margin: 0, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                  Comparar
                </p>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: TINTA_TENUE }}>acercar</span>
                  {ZOOMS.map(z => (
                    <Pildora key={z} activa={zoom === z} onClick={() => setZoom(z)}>{z}×</Pildora>
                  ))}
                </div>
              </div>

              <Comparador original={imagen.vistaPrevia} svg={salida.svg} zoom={zoom} />

              <p style={{ fontSize: 11, color: TINTA_TENUE, margin: '8px 0 16px', lineHeight: 1.5 }}>
                Sube el zoom a 4× u 8×: el original se pixelea y el vectorizado conserva el borde
                limpio. Esa es justo la diferencia al imprimir grande.
              </p>

              {/* Tamaño de impresión */}
              <div style={{ padding: '14px 16px', borderRadius: 18, border: '1px solid ' + LINEA, background: 'rgba(16,22,25,0.02)', marginBottom: 14 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: TINTA_SUAVE, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                  Tamaño al imprimir
                </p>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <label style={{ fontSize: 12.5, color: TINTA_SUAVE, display: 'flex', alignItems: 'center', gap: 7 }}>
                    Ancho
                    <input type="number" min="1" max="200" step="0.5" value={anchoCm}
                           onChange={e => setAnchoCm(Math.max(0.5, Number(e.target.value) || 1))}
                           style={{ width: 74, padding: '6px 10px', fontSize: 13, borderRadius: 999, border: '1px solid ' + LINEA, outline: 'none', color: TINTA }} />
                    cm
                  </label>
                  <span style={{ fontSize: 12.5, color: TINTA_TENUE }}>
                    alto {altoCm.toFixed(1)} cm <span style={{ color: '#C8D4D9' }}>·</span> proporción respetada
                  </span>
                </div>
                <p style={{ fontSize: 11, color: TINTA_TENUE, margin: '8px 0 0', lineHeight: 1.5 }}>
                  El archivo sale ya medido en centímetros, así que se abre a este tamaño en el
                  programa de la impresora sin tener que escalarlo a mano. Al ser vector, puedes
                  cambiarlo después sin perder nitidez.
                </p>
              </div>

              <button type="button" onClick={bajar}
                className="px-4 py-2 text-sm font-semibold transition-all"
                style={{ background: 'linear-gradient(135deg, #5E9422, #8DC63F)', borderRadius: 999, color: '#fff', border: 'none', cursor: 'pointer', boxShadow: '0 4px 14px rgba(94,148,34,0.22)' }}>
                Bajar SVG de {anchoCm} × {altoCm.toFixed(1)} cm
              </button>
            </>
          )}
        </>
      )}
    </div>
  )
}
