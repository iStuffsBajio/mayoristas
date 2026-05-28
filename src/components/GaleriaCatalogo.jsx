import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { loadGaleriaIndex, uploadGaleriaImage, removeGaleriaImage, s3Configured } from '../lib/s3'

export default function GaleriaCatalogo({ tipo, seleccionado, onSelect, columnas = 3 }) {
  const { isAdmin } = useAuth()
  const [imagenes, setImagenes] = useState([])
  const [cargando, setCargando]   = useState(true)
  const [subiendo, setSubiendo]   = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const inputRef = useRef(null)

  const cargar = async () => {
    if (!s3Configured) { setCargando(false); return }
    setCargando(true)
    try {
      setImagenes(await loadGaleriaIndex(tipo))
    } catch (e) {
      console.error('[Galería] Error cargando:', e)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => { cargar() }, [tipo])

  const handleUpload = async (file) => {
    if (!file?.type.startsWith('image/')) return
    setSubiendo(true)
    try {
      const item = await uploadGaleriaImage(tipo, file)
      setImagenes(prev => [...prev, item])
    } catch (e) {
      console.error('[Galería] Error subiendo:', e)
      alert('Error al subir la imagen:\n' + (e?.message || String(e)))
    } finally {
      setSubiendo(false)
    }
  }

  const confirmarEliminar = async () => {
    if (!confirmDelete) return
    try {
      await removeGaleriaImage(tipo, confirmDelete.filename)
      setImagenes(prev => prev.filter(i => i.filename !== confirmDelete.filename))
      if (seleccionado?.filename === confirmDelete.filename) onSelect(null)
    } catch (e) {
      console.error('[Galería] Error eliminando:', e)
    } finally {
      setConfirmDelete(null)
    }
  }

  if (cargando) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0', color: '#bbb' }}>
        <div className="animate-spin" style={{ width: 16, height: 16, border: '2px solid #eee', borderTop: '2px solid #D51A7A', borderRadius: '50%' }} />
        <span style={{ fontSize: 12 }}>Cargando catálogo...</span>
      </div>
    )
  }

  if (imagenes.length === 0 && !isAdmin) return null

  return (
    <>
      {/* Modal de confirmación */}
      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'white', borderRadius: 20, padding: 28, maxWidth: 320, width: '100%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ width: 56, height: 56, margin: '0 auto 16px', borderRadius: 12, overflow: 'hidden' }}>
              <img src={confirmDelete.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <p style={{ fontWeight: 700, fontSize: 15, color: '#0A0A0A', marginBottom: 6 }}>¿Quitar del catálogo?</p>
            <p style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>La imagen ya no aparecerá en la galería.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmDelete(null)} style={{ flex: 1, padding: '10px 0', borderRadius: 999, border: '1.5px solid rgba(0,0,0,0.12)', background: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14, color: '#555' }}>Cancelar</button>
              <button onClick={confirmarEliminar} style={{ flex: 1, padding: '10px 0', borderRadius: 999, border: 'none', background: '#ef4444', color: 'white', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}

      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
            Catálogo de diseños
          </p>
          {isAdmin && (
            <span style={{ fontSize: 10, fontWeight: 700, color: '#D51A7A', background: 'rgba(213,26,122,0.08)', padding: '2px 8px', borderRadius: 999 }}>
              Admin
            </span>
          )}
        </div>

        {imagenes.length === 0 && isAdmin && (
          <div style={{ textAlign: 'center', padding: '20px 0', color: '#ccc' }}>
            <p style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Sin fotos aún</p>
            <p style={{ fontSize: 11 }}>Toca "+" para subir la primera</p>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columnas}, 1fr)`, gap: 8 }}>
          {imagenes.map(item => {
            const activo = seleccionado?.filename === item.filename
            return (
              <button key={item.filename} type="button" onClick={() => onSelect(activo ? null : item)}
                style={{ position: 'relative', aspectRatio: '1', borderRadius: 12, overflow: 'visible', border: activo ? '2.5px solid #D51A7A' : '2.5px solid transparent', cursor: 'pointer', padding: 0, background: 'none', outline: 'none', transition: 'all 0.15s', boxShadow: activo ? '0 0 0 3px rgba(213,26,122,0.2)' : 'none' }}>
                <div style={{ width: '100%', height: '100%', borderRadius: 10, overflow: 'hidden' }}>
                  <img src={item.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                </div>
                {activo && (
                  <div style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', background: '#D51A7A', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                )}
                {isAdmin && (
                  <button type="button"
                    onClick={e => { e.stopPropagation(); setConfirmDelete(item) }}
                    style={{ position: 'absolute', top: -6, left: -6, width: 20, height: 20, borderRadius: '50%', background: '#ef4444', border: '2px solid white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2, color: 'white', fontSize: 13, fontWeight: 700, lineHeight: 1, boxShadow: '0 2px 6px rgba(0,0,0,0.2)' }}>
                    ×
                  </button>
                )}
              </button>
            )
          })}

          {isAdmin && (
            <button type="button" onClick={() => inputRef.current?.click()} disabled={subiendo}
              style={{ aspectRatio: '1', borderRadius: 12, border: '2px dashed rgba(213,26,122,0.35)', background: 'rgba(213,26,122,0.04)', cursor: subiendo ? 'default' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, color: '#D51A7A', transition: 'all 0.15s' }}>
              {subiendo
                ? <div className="animate-spin" style={{ width: 22, height: 22, border: '2.5px solid rgba(213,26,122,0.2)', borderTop: '2.5px solid #D51A7A', borderRadius: '50%' }} />
                : <>
                    <span style={{ fontSize: 24, lineHeight: 1, fontWeight: 300 }}>+</span>
                    <span style={{ fontSize: 9, fontWeight: 700 }}>Subir foto</span>
                  </>
              }
            </button>
          )}
        </div>

        <input
          ref={inputRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
          onChange={async e => {
            const files = Array.from(e.target.files || [])
            e.target.value = ''
            for (const file of files) await handleUpload(file)
          }}
        />
      </div>
    </>
  )
}
