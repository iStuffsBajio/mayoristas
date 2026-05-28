import { useState, useEffect } from 'react'
import { useSiteConfig } from '../context/SiteConfigContext'
import { gradStr } from '../lib/siteConfig'

const Section = ({ title, emoji, children, onSave, guardando, guardado }) => (
  <div style={{ backgroundColor: '#fff', borderRadius: 24, border: '1px solid rgba(0,0,0,0.08)', padding: '24px 22px', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
      <h3 style={{ fontSize: 15, fontWeight: 800, color: '#0A0A0A', margin: 0 }}>{emoji} {title}</h3>
      <button
        onClick={onSave}
        disabled={guardando}
        style={{ padding: '8px 20px', borderRadius: 999, border: 'none', fontSize: 13, fontWeight: 700, cursor: guardando ? 'default' : 'pointer', background: guardado ? '#22c55e' : 'linear-gradient(135deg,#D51A7A,#FF6B1A)', color: 'white', transition: 'all 0.2s', boxShadow: guardando ? 'none' : '0 4px 14px rgba(213,26,122,0.25)', fontFamily: 'inherit' }}>
        {guardando ? 'Guardando...' : guardado ? '✓ Guardado' : 'Guardar'}
      </button>
    </div>
    {children}
  </div>
)

const Label = ({ children }) => (
  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
    {children}
  </label>
)

const inp = {
  width: '100%', padding: '10px 14px', borderRadius: 12, border: '1.5px solid rgba(0,0,0,0.1)',
  backgroundColor: '#f7f8fa', fontSize: 14, color: '#0A0A0A', outline: 'none',
  fontFamily: 'inherit', boxSizing: 'border-box', transition: 'border-color 0.15s',
}
const fp = e => { e.target.style.borderColor = 'rgba(213,26,122,0.5)'; e.target.style.backgroundColor = 'rgba(213,26,122,0.02)' }
const bl = e => { e.target.style.borderColor = 'rgba(0,0,0,0.1)'; e.target.style.backgroundColor = '#f7f8fa' }

function useGuardado() {
  const [guardado, setGuardado] = useState(false)
  const marcar = () => { setGuardado(true); setTimeout(() => setGuardado(false), 2500) }
  return [guardado, marcar]
}

// ── Sección Pestañas ──────────────────────────────────────────────────────────
function SeccionTabs({ config, save, guardando: gGlobal }) {
  const [tabs, setTabs] = useState(config.tabs)
  const [gLocal, setGLocal] = useState(false)
  const [guardado, marcar]  = useGuardado()

  useEffect(() => { setTabs(config.tabs) }, [config.tabs])

  const handleSave = async () => {
    setGLocal(true)
    await save({ tabs })
    setGLocal(false)
    marcar()
  }

  const TAB_KEYS = ['inventario', 'personaliza', 'stikers']

  return (
    <Section title="Pestañas" emoji="🗂️" onSave={handleSave} guardando={gLocal} guardado={guardado}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {TAB_KEYS.map(key => {
          const tab = tabs[key] || {}
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 14, background: '#f7f8fa', border: '1.5px solid rgba(0,0,0,0.07)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flexShrink: 0 }}>
                <div
                  onClick={() => setTabs(t => ({ ...t, [key]: { ...t[key], visible: !t[key]?.visible } }))}
                  style={{ width: 40, height: 22, borderRadius: 999, background: tab.visible ? 'linear-gradient(135deg,#D51A7A,#FF6B1A)' : 'rgba(0,0,0,0.15)', cursor: 'pointer', position: 'relative', transition: 'all 0.2s', flexShrink: 0 }}>
                  <div style={{ position: 'absolute', top: 2, left: tab.visible ? 20 : 2, width: 18, height: 18, borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
                </div>
              </label>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{tab.emoji}</span>
              <div style={{ flex: 1 }}>
                <Label>Etiqueta</Label>
                <input value={tab.label || ''} onChange={e => setTabs(t => ({ ...t, [key]: { ...t[key], label: e.target.value } }))}
                  style={{ ...inp, padding: '7px 12px' }} onFocus={fp} onBlur={bl} />
              </div>
              <div style={{ flexShrink: 0 }}>
                <Label>Emoji</Label>
                <input value={tab.emoji || ''} onChange={e => setTabs(t => ({ ...t, [key]: { ...t[key], emoji: e.target.value } }))}
                  style={{ ...inp, padding: '7px 12px', width: 64, textAlign: 'center', fontSize: 18 }} onFocus={fp} onBlur={bl} />
              </div>
            </div>
          )
        })}
      </div>
    </Section>
  )
}

// ── Sección Hero ──────────────────────────────────────────────────────────────
function SeccionHero({ config, save }) {
  const [hero, setHero]     = useState(config.hero)
  const [gLocal, setGLocal] = useState(false)
  const [guardado, marcar]  = useGuardado()

  useEffect(() => { setHero(config.hero) }, [config.hero])

  const set = k => e => setHero(h => ({ ...h, [k]: e.target.value }))
  const setStat = (i, k) => e => setHero(h => {
    const stats = [...h.stats]
    stats[i] = { ...stats[i], [k]: e.target.value }
    return { ...h, stats }
  })

  const handleSave = async () => {
    setGLocal(true)
    await save({ hero })
    setGLocal(false)
    marcar()
  }

  return (
    <Section title="Hero (portada)" emoji="✏️" onSave={handleSave} guardando={gLocal} guardado={guardado}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <Label>Badge (texto del chip superior)</Label>
          <input value={hero.badge} onChange={set('badge')} style={inp} onFocus={fp} onBlur={bl} />
        </div>
        <div>
          <Label>Subtítulo</Label>
          <textarea value={hero.subtitulo} onChange={set('subtitulo')} rows={3}
            style={{ ...inp, resize: 'vertical' }} onFocus={fp} onBlur={bl} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Botón principal</Label>
            <input value={hero.boton1} onChange={set('boton1')} style={inp} onFocus={fp} onBlur={bl} />
          </div>
          <div>
            <Label>Botón secundario</Label>
            <input value={hero.boton2} onChange={set('boton2')} style={inp} onFocus={fp} onBlur={bl} />
          </div>
        </div>
        <div>
          <Label>Estadísticas</Label>
          <div style={{ display: 'flex', gap: 10 }}>
            {hero.stats.map((s, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input value={s.value} onChange={setStat(i, 'value')} placeholder="500+"
                  style={{ ...inp, textAlign: 'center', fontWeight: 700 }} onFocus={fp} onBlur={bl} />
                <input value={s.label} onChange={setStat(i, 'label')} placeholder="Diseños"
                  style={{ ...inp, textAlign: 'center', fontSize: 12 }} onFocus={fp} onBlur={bl} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </Section>
  )
}

// ── Sección Colores + Degradados ──────────────────────────────────────────────
function EditorDegradado({ gradKey, label, gradientes, onChange }) {
  const g = gradientes?.[gradKey] || { angulo: 135, color1: '#D51A7A', color2: '#FF6B1A' }
  const preview = gradStr(g)

  const set = field => e => {
    const val = field === 'angulo' ? Number(e.target.value) : e.target.value
    onChange(gradKey, { ...g, [field]: val })
  }

  return (
    <div style={{ padding: '16px', borderRadius: 16, background: '#f7f8fa', border: '1.5px solid rgba(0,0,0,0.07)' }}>
      <Label>{label}</Label>

      {/* Preview barra */}
      <div style={{ height: 48, borderRadius: 12, background: preview, marginBottom: 14, boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }} />

      {/* Ángulo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>Ángulo</span>
        <input type="range" min="0" max="360" value={g.angulo ?? 135} onChange={set('angulo')}
          style={{ flex: 1, accentColor: '#D51A7A' }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: '#555', minWidth: 38, textAlign: 'right' }}>{g.angulo ?? 135}°</span>
      </div>

      {/* Colores */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {[
          { field: 'color1', label: 'Color 1' },
          { field: 'color2', label: 'Color 2' },
          { field: 'color3', label: 'Color 3 (opcional)' },
        ].map(({ field, label: fl }) => (
          <div key={field} style={{ flex: '1 1 80px', minWidth: 80 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>{fl}</span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="color" value={g[field] || '#ffffff'} onChange={set(field)}
                style={{ width: 36, height: 36, borderRadius: 10, border: '1.5px solid rgba(0,0,0,0.1)', cursor: 'pointer', padding: 2, background: 'white', flexShrink: 0 }} />
              <input value={g[field] || ''} onChange={set(field)} maxLength={7}
                placeholder="#000000"
                style={{ ...inp, padding: '7px 8px', fontFamily: 'monospace', fontSize: 11, width: 80, minWidth: 0 }}
                onFocus={fp} onBlur={bl} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SeccionColores({ config, save }) {
  const [colores, setColores] = useState(config.colores)
  const [gLocal, setGLocal]   = useState(false)
  const [guardado, marcar]    = useGuardado()

  useEffect(() => { setColores(config.colores) }, [config.colores])

  const setColor = k => e => setColores(c => ({ ...c, [k]: e.target.value }))

  const setGrad = (gradKey, newG) => setColores(c => ({
    ...c,
    gradientes: { ...c.gradientes, [gradKey]: newG },
    // sincronizar colores sólidos con color1 del degradado correspondiente
    ...(gradKey === 'principal' ? { primario: newG.color1, secundario: newG.color2 } : {}),
    ...(gradKey === 'acento'    ? { acento:   newG.color1, acento2:   newG.color2 } : {}),
  }))

  const handleSave = async () => {
    setGLocal(true)
    await save({ colores })
    setGLocal(false)
    marcar()
  }

  const SOLIDOS = [
    { key: 'primario',   label: 'Primario' },
    { key: 'secundario', label: 'Secundario' },
    { key: 'acento',     label: 'Acento 1' },
    { key: 'acento2',    label: 'Acento 2' },
  ]

  return (
    <Section title="Colores y degradados" emoji="🎨" onSave={handleSave} guardando={gLocal} guardado={guardado}>
      <p style={{ fontSize: 12, color: '#aaa', marginBottom: 16, marginTop: -8 }}>
        Al editar un degradado, los colores sólidos se sincronizan automáticamente. Los cambios aplican al guardar y recargar.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Degradados */}
        <EditorDegradado gradKey="principal" label="Degradado principal (botones, textos destacados)"
          gradientes={colores.gradientes} onChange={setGrad} />
        <EditorDegradado gradKey="acento"    label="Degradado acento (estadísticas, badges)"
          gradientes={colores.gradientes} onChange={setGrad} />

        {/* Colores sólidos */}
        <div style={{ padding: '14px 16px', borderRadius: 16, background: '#f7f8fa', border: '1.5px solid rgba(0,0,0,0.07)' }}>
          <Label>Colores sólidos (para texto y bordes)</Label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginTop: 8 }}>
            {SOLIDOS.map(({ key, label }) => (
              <div key={key}>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>{label}</span>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="color" value={colores[key] || '#000000'} onChange={setColor(key)}
                    style={{ width: 36, height: 36, borderRadius: 10, border: '1.5px solid rgba(0,0,0,0.1)', cursor: 'pointer', padding: 2, background: 'white' }} />
                  <input value={colores[key] || ''} onChange={setColor(key)} maxLength={7}
                    style={{ ...inp, padding: '7px 10px', fontFamily: 'monospace', fontSize: 12, width: 90 }} onFocus={fp} onBlur={bl} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Section>
  )
}

// ── Sección Footer ────────────────────────────────────────────────────────────
function SeccionFooter({ config, save }) {
  const [footer, setFooter]   = useState(config.footer)
  const [gLocal, setGLocal]   = useState(false)
  const [guardado, marcar]    = useGuardado()

  useEffect(() => { setFooter(config.footer) }, [config.footer])

  const set = k => e => setFooter(f => ({ ...f, [k]: e.target.value }))

  const handleSave = async () => {
    setGLocal(true)
    await save({ footer })
    setGLocal(false)
    marcar()
  }

  return (
    <Section title="Pie de página" emoji="📄" onSave={handleSave} guardando={gLocal} guardado={guardado}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <Label>Descripción de la marca</Label>
          <textarea value={footer.descripcion} onChange={set('descripcion')} rows={2}
            style={{ ...inp, resize: 'vertical' }} onFocus={fp} onBlur={bl} />
        </div>
        <div>
          <Label>Texto de copyright</Label>
          <input value={footer.copyright} onChange={set('copyright')} style={inp} onFocus={fp} onBlur={bl} />
        </div>
      </div>
    </Section>
  )
}

// ── Sección Dropbox Catálogos ─────────────────────────────────────────────────
function SeccionDropbox({ config, save }) {
  const [dc, setDc]             = useState(config.dropboxCatalogos || {})
  const [gLocal, setGLocal]     = useState(false)
  const [guardado, marcar]      = useGuardado()

  useEffect(() => { setDc(config.dropboxCatalogos || {}) }, [config.dropboxCatalogos])

  const set = k => e => setDc(d => ({ ...d, [k]: e.target.value }))

  const handleSave = async () => {
    setGLocal(true)
    await save({ dropboxCatalogos: dc })
    setGLocal(false)
    marcar()
  }

  const ITEMS = [
    { key: 'fundas',         label: 'Carpeta Stiker Funda para Celular', placeholder: '/Espacio familiar/.../Fundas' },
    { key: 'personalizados', label: 'Carpeta Stiker Personalizado',      placeholder: '/Espacio familiar/.../Personalizados' },
  ]

  return (
    <Section title="Catálogos de Dropbox" emoji="📂" onSave={handleSave} guardando={gLocal} guardado={guardado}>
      <p style={{ fontSize: 12, color: '#aaa', marginBottom: 16, marginTop: -8 }}>
        Pon imágenes en estas carpetas de Dropbox desde tu PC y aparecerán automáticamente en la galería de pedidos.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {ITEMS.map(({ key, label, placeholder }) => (
          <div key={key}>
            <Label>{label}</Label>
            <input value={dc[key] || ''} onChange={set(key)} placeholder={placeholder}
              style={{ ...inp, fontFamily: 'monospace', fontSize: 12 }} onFocus={fp} onBlur={bl} />
          </div>
        ))}
      </div>
    </Section>
  )
}

// ── Panel principal ───────────────────────────────────────────────────────────
export default function AdminPanel() {
  const { config, save, guardando } = useSiteConfig()

  return (
    <section className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <div className="mb-8">
        <p className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: '#D51A7A' }}>Solo administrador</p>
        <h2 className="text-3xl sm:text-4xl font-black mb-1" style={{ color: '#0A0A0A' }}>Panel de administración</h2>
        <p className="text-sm" style={{ color: '#888' }}>Los cambios se guardan en la nube y aplican a todos los dispositivos al instante.</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <SeccionTabs    config={config} save={save} guardando={guardando} />
        <SeccionHero    config={config} save={save} />
        <SeccionColores config={config} save={save} />
        <SeccionFooter  config={config} save={save} />
        <SeccionDropbox config={config} save={save} />
      </div>
    </section>
  )
}
