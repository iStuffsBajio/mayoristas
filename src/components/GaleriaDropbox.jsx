import { useState, useEffect } from 'react'
import { listDropboxImagesWithUrls } from '../lib/dropboxGaleria'
import { dropboxConfigured } from '../lib/dropbox'

export default function GaleriaDropbox({ folderPath, seleccionado, onSelect, label = 'Catálogo' }) {
  const [imagenes, setImagenes] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError]       = useState(null)

  useEffect(() => {
    if (!folderPath || !dropboxConfigured) { setCargando(false); return }
    setCargando(true)
    setError(null)
    listDropboxImagesWithUrls(folderPath)
      .then(imgs => { setImagenes(imgs); setCargando(false) })
      .catch(e => { setError(e.message); setCargando(false) })
  }, [folderPath])

  if (!dropboxConfigured) return null

  if (cargando) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#bbb', padding: '8px 0' }}>
        <div className="animate-spin" style={{ width: 14, height: 14, border: '2px solid #eee', borderTop: '2px solid #D51A7A', borderRadius: '50%' }} />
        <span style={{ fontSize: 12 }}>Cargando catálogo de Dropbox...</span>
      </div>
    )
  }

  if (error) {
    return <p style={{ fontSize: 11, color: '#f87171' }}>⚠ Error al cargar Dropbox: {error}</p>
  }

  if (imagenes.length === 0) {
    return (
      <p style={{ fontSize: 12, color: '#ccc', fontStyle: 'italic' }}>
        Sin imágenes en la carpeta de Dropbox aún.
      </p>
    )
  }

  return (
    <div>
      <p style={{ fontSize: 10, fontWeight: 700, color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
        {label} · Dropbox ({imagenes.length})
      </p>

      {/* Carrusel horizontal */}
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6, scrollSnapType: 'x mandatory' }}>
        {imagenes.map(item => {
          const activo = seleccionado?.path === item.path
          return (
            <button key={item.path} type="button" onClick={() => onSelect(activo ? null : item)}
              style={{ flexShrink: 0, width: 90, height: 90, borderRadius: 14, overflow: 'hidden', border: activo ? '2.5px solid #D51A7A' : '2.5px solid transparent', cursor: 'pointer', padding: 0, background: 'none', outline: 'none', transition: 'all 0.15s', boxShadow: activo ? '0 0 0 3px rgba(213,26,122,0.2)' : '0 2px 8px rgba(0,0,0,0.1)', scrollSnapAlign: 'start', position: 'relative' }}>
              <img src={item.url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
              {activo && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(213,26,122,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#D51A7A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                </div>
              )}
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '3px 4px', background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}>
                <p style={{ fontSize: 8, color: 'white', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{item.name.replace(/\.[^.]+$/, '')}</p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
