// La bandeja de clientes del CRM.
//
// Lo pidió el dueño el 2026-11-11: que las conversaciones se repartan según el
// cliente que escribe, y llevar el control de todos los clientes, mayoristas
// incluidos. Esta es la pantalla donde cada tienda ve lo suyo y lo trabaja.
//
// Tres cosas que no son de diseño y no hay que deshacer:
//
//   · **La lista viene recortada del servidor.** Una tienda recibe SÓLO los de
//     su plaza; esconderlos aquí no protegería nada.
//   · **Contestar es tomar.** En cuanto alguien de la tienda escribe, la
//     conversación queda a su nombre y el bot se calla. Lo decide el servidor.
//   · **Mientras la línea de Meta no esté encendida, lo que se escribe aquí NO
//     sale por WhatsApp**, y la pantalla lo dice en cada mensaje. Fingir que
//     salió sería dejar a un cliente esperando una respuesta que nadie mandó.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { Seccion, Cifra, Cifras } from './Diseno'
import { nombreSucursal } from '../lib/sucursales'
import {
  clientesCrm, clienteCrm, altaClienteCrm, editarClienteCrm, accionClienteCrm, responderClienteCrm, apiConfigurada,
} from '../lib/api'

const PLAZAS = ['leon', 'san-luis', 'aguascalientes', 'torreon']

const ESTADO = {
  pendiente:  { nombre: 'Pendiente',  tema: 'alerta',  nota: 'El bot la pasó a la tienda: nadie la ha tomado' },
  atendiendo: { nombre: 'Atendiendo', tema: 'ventas',  nota: 'La tiene alguien de la tienda; el bot no contesta' },
  bot:        { nombre: 'Con el bot', tema: 'neutro',  nota: 'El bot la está atendiendo' },
  cerrada:    { nombre: 'Cerrada',    tema: 'neutro',  nota: 'Resuelta. Si vuelve a escribir, la toma el bot' },
}
const FILTROS = ['todos', 'pendiente', 'atendiendo', 'bot', 'cerrada']
const FUENTE = { meta: 'Anuncio de Meta', google: 'Google', web: 'Página', tienda: 'En tienda', tickets: 'Tickets de Eleventa' }
const QUIEN = { bot: 'el bot', admin: 'administración', sistema: 'el sistema' }

const hora = iso => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const hoy = new Date()
  const mismoDia = d.toDateString() === hoy.toDateString()
  return mismoDia
    ? d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}
const quienDijo = q => QUIEN[q] ?? (PLAZAS.includes(q) ? nombreSucursal(q) : q)
const telefonoBonito = t => (t && /^52\d{10}$/.test(t) ? `${t.slice(2, 5)} ${t.slice(5, 8)} ${t.slice(8)}` : t ?? '')

function Pastilla({ activa, onClick, children, ...resto }) {
  return (
    <button type="button" className="chip-plaza" onClick={onClick} {...resto}
            style={{ fontWeight: activa ? 800 : 500, background: activa ? '#101619' : undefined, color: activa ? '#fff' : undefined }}>
      {children}
    </button>
  )
}

function Etiqueta({ estado }) {
  const e = ESTADO[estado] ?? ESTADO.bot
  const color = { alerta: '#B45309', ventas: '#0277A0', neutro: '#4A5A61' }[e.tema]
  return (
    <span style={{ fontSize: 10.5, fontWeight: 800, color, border: `1px solid ${color}55`, borderRadius: 999, padding: '1px 8px', whiteSpace: 'nowrap' }}>
      {e.nombre}
    </span>
  )
}

// ── La lista ────────────────────────────────────────────────────────────────

function Renglon({ c, activo, onAbrir, verPlaza }) {
  return (
    <button type="button" data-cliente={c.id} data-estado-cliente={c.estado} onClick={() => onAbrir(c.id)}
            style={{
              display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', border: 0,
              borderBottom: '1px solid #EEF2F4', background: activo ? 'rgba(2,136,173,0.07)' : '#fff', cursor: 'pointer',
            }}>
      <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
        <strong style={{ fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {c.nombre || telefonoBonito(c.telefono) || 'Sin nombre'}
        </strong>
        <span style={{ fontSize: 11, color: '#8598A1', whiteSpace: 'nowrap' }}>{hora(c.ultimoMensaje ?? c.actualizado)}</span>
      </span>
      <span style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
        <Etiqueta estado={c.estado} />
        {c.tipo === 'mayorista' && <span style={{ fontSize: 10.5, fontWeight: 700, color: '#6D28D9' }}>Mayorista</span>}
        {verPlaza && <span style={{ fontSize: 11, color: '#4A5A61' }}>{c.plaza ? nombreSucursal(c.plaza) : 'Sin plaza'}</span>}
        {/* A éste NADIE le contestó: el bot falló y el mensaje se quedó sin
            respuesta. Va en rojo y no en ámbar a propósito: «pendiente» es
            alguien a quien ya se le dijo que lo atienden; esto es silencio. */}
        {c.sinRespuesta && (
          <span data-sin-respuesta style={{ fontSize: 10.5, fontWeight: 800, color: '#fff', background: '#B91C1C', borderRadius: 999, padding: '0 7px' }}>
            Sin respuesta
          </span>
        )}
        {c.noLeidos > 0 && (
          <span data-no-leidos={c.noLeidos} style={{ fontSize: 10.5, fontWeight: 800, color: '#fff', background: '#B45309', borderRadius: 999, padding: '0 7px' }}>
            {c.noLeidos} sin leer
          </span>
        )}
      </span>
      {c.ultimo && (
        <span style={{ display: 'block', fontSize: 12, color: '#4A5A61', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {c.ultimo.de === 'cliente' ? '' : c.ultimo.de === 'bot' ? 'Bot: ' : 'Tienda: '}{c.ultimo.texto}
        </span>
      )}
    </button>
  )
}

// ── La ficha ────────────────────────────────────────────────────────────────

function Ficha({ cliente: c, token, esAdmin, onCambio, onCerrar }) {
  const [texto, setTexto] = useState('')
  const [aviso, setAviso] = useState(null)
  const [error, setError] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [editando, setEditando] = useState(false)
  const [campos, setCampos] = useState({})
  const [destino, setDestino] = useState('')

  useEffect(() => { setTexto(''); setAviso(null); setError(null); setEditando(false); setDestino('') }, [c.id])

  const hacer = async (fn, exito) => {
    setOcupado(true); setError(null); setAviso(null)
    try {
      const r = await fn()
      onCambio(r.cliente)
      if (r.aviso) setAviso(r.aviso)
      exito?.(r)
    } catch (e) {
      setError(e.message)
    } finally {
      setOcupado(false)
    }
  }

  const mandar = () => texto.trim() && hacer(() => responderClienteCrm(c.id, texto.trim(), token), () => setTexto(''))
  const accion = (a, extra = {}) => hacer(() => accionClienteCrm({ id: c.id, accion: a, ...extra }, token))
  const guardarFicha = () => hacer(() => editarClienteCrm(c.id, campos, token), () => setEditando(false))
  const abrirEdicion = () => {
    setCampos({ nombre: c.nombre ?? '', tipo: c.tipo, ciudad: c.ciudad ?? '', modelo: c.modelo ?? '', notas: c.notas ?? '', ...(c.id.startsWith('wa:') ? {} : { telefono: c.telefono ?? '' }) })
    setEditando(true)
  }

  const e = ESTADO[c.estado] ?? ESTADO.bot
  const sinCanal = c.mensajes?.some(m => m.envio === 'sin-canal')

  return (
    <Seccion tema={e.tema} data-ficha={c.id}
             titulo={c.nombre || telefonoBonito(c.telefono) || 'Sin nombre'}
             sub={[c.telefono && telefonoBonito(c.telefono), c.plaza ? nombreSucursal(c.plaza) : 'Sin plaza', c.tipo === 'mayorista' ? 'Mayorista' : 'Público'].filter(Boolean).join(' · ')}
             extra={<button type="button" className="rev-saltar" onClick={onCerrar}>Cerrar ficha</button>}>
      <p style={{ fontSize: 12, color: '#4A5A61', margin: '0 0 10px' }}>
        <Etiqueta estado={c.estado} /> {e.nota}{c.atiende ? ` · la tiene ${quienDijo(c.atiende)}` : ''}
      </p>

      {c.sinRespuesta && (
        <p data-ficha-sin-respuesta role="alert"
           style={{ fontSize: 12.5, color: '#7F1D1D', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 10, padding: '8px 10px', margin: '0 0 10px' }}>
          <strong>Nadie le ha contestado.</strong> El bot no pudo responderle su mensaje de {hora(c.sinRespuesta.desde)} y dejó
          de intentarlo. Hay que contestarle; el aviso se quita en cuanto alguien le responda o se cierre la conversación.
        </p>
      )}

      {/* Los datos que hacen falta para venderle, y de dónde vino. */}
      {!editando ? (
        <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '3px 12px', fontSize: 12.5, margin: '0 0 10px' }}>
          <dt style={{ color: '#8598A1' }}>Su celular</dt><dd style={{ margin: 0 }}>{c.modelo || '—'}</dd>
          <dt style={{ color: '#8598A1' }}>Ciudad</dt><dd style={{ margin: 0 }}>{c.ciudad || '—'}</dd>
          <dt style={{ color: '#8598A1' }}>Llegó por</dt>
          <dd style={{ margin: 0 }} data-origen>{FUENTE[c.origen?.fuente] ?? 'No se sabe'}{c.origen?.anuncio ? ` · ${c.origen.anuncio}` : ''}</dd>
          <dt style={{ color: '#8598A1' }}>Avisos</dt>
          <dd style={{ margin: 0 }}>{c.avisos == null ? 'No ha dicho si quiere recibirlos' : c.avisos.acepta ? `Sí, desde ${c.avisos.fecha}` : `No, desde ${c.avisos.fecha}`}</dd>
          {c.notas && <><dt style={{ color: '#8598A1' }}>Notas</dt><dd style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{c.notas}</dd></>}
        </dl>
      ) : (
        <div style={{ display: 'grid', gap: 8, marginBottom: 10 }} data-editando-ficha>
          {[['nombre', 'Nombre'], ['modelo', 'Su celular (marca y modelo)'], ['ciudad', 'Ciudad'], ...('telefono' in campos ? [['telefono', 'Su número de WhatsApp']] : [])].map(([k, l]) => (
            <label key={k} style={{ fontSize: 12, display: 'grid', gap: 3 }}>{l}
              <input data-campo={k} value={campos[k]} onChange={ev => setCampos(x => ({ ...x, [k]: ev.target.value }))}
                     style={{ border: '1px solid #D6E0E4', borderRadius: 10, padding: '6px 10px', fontSize: 13 }} />
            </label>
          ))}
          <label style={{ fontSize: 12, display: 'grid', gap: 3 }}>Tipo
            <select data-campo="tipo" value={campos.tipo} onChange={ev => setCampos(x => ({ ...x, tipo: ev.target.value }))}
                    style={{ border: '1px solid #D6E0E4', borderRadius: 10, padding: '6px 10px', fontSize: 13 }}>
              <option value="publico">Público</option>
              <option value="mayorista">Mayorista</option>
            </select>
          </label>
          <label style={{ fontSize: 12, display: 'grid', gap: 3 }}>Notas
            <textarea data-campo="notas" rows={3} value={campos.notas} onChange={ev => setCampos(x => ({ ...x, notas: ev.target.value }))}
                      style={{ border: '1px solid #D6E0E4', borderRadius: 10, padding: '6px 10px', fontSize: 13 }} />
          </label>
          <span style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="boton-tinta" data-guardar-ficha disabled={ocupado} onClick={guardarFicha}>Guardar ficha</button>
            <button type="button" className="rev-saltar" onClick={() => setEditando(false)}>Cancelar</button>
          </span>
        </div>
      )}

      {/* Las acciones. Lo que no aplica al estado no se enseña. */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {!editando && <button type="button" className="rev-saltar" data-editar-ficha onClick={abrirEdicion}>Editar ficha</button>}
        {c.plaza && c.estado !== 'atendiendo' && <button type="button" className="boton-tinta" data-accion="tomar" disabled={ocupado} onClick={() => accion('tomar')}>Tomar</button>}
        {c.estado !== 'cerrada' && <button type="button" className="rev-saltar" data-accion="cerrar" disabled={ocupado} onClick={() => accion('cerrar')}>Cerrar</button>}
        {(c.estado === 'pendiente' || c.estado === 'atendiendo') && (
          <button type="button" className="rev-saltar" data-accion="devolver" disabled={ocupado} onClick={() => accion('devolver')}>Devolver al bot</button>
        )}
        <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <select data-transferir value={destino} onChange={ev => setDestino(ev.target.value)}
                  style={{ border: '1px solid #D6E0E4', borderRadius: 10, padding: '4px 8px', fontSize: 12.5 }}>
            <option value="">{esAdmin && !c.plaza ? 'Asignar a…' : 'Pasar a…'}</option>
            {PLAZAS.filter(p => p !== c.plaza).map(p => <option key={p} value={p}>{nombreSucursal(p)}</option>)}
          </select>
          {destino && <button type="button" className="rev-saltar" data-accion="transferir" disabled={ocupado} onClick={() => accion('transferir', { plaza: destino })}>Pasar</button>}
        </span>
      </div>

      {error && <p role="alert" style={{ color: '#B42318', fontSize: 12.5, margin: '0 0 8px' }}>{error}</p>}
      {aviso && <p data-aviso-envio style={{ color: '#B45309', fontSize: 12.5, margin: '0 0 8px' }}>{aviso}</p>}

      {/* La conversación, como se dijo. */}
      <div data-conversacion style={{ background: '#F7FAFB', border: '1px solid #EEF2F4', borderRadius: 14, padding: 10, maxHeight: 380, overflowY: 'auto', display: 'grid', gap: 6 }}>
        {c.mensajes?.length ? c.mensajes.map((m, i) => (
          <div key={i} data-mensaje={m.de} style={{
            justifySelf: m.de === 'cliente' ? 'start' : 'end', maxWidth: '82%',
            background: m.de === 'cliente' ? '#fff' : m.de === 'bot' ? 'rgba(16,22,25,0.05)' : 'rgba(2,136,173,0.10)',
            border: '1px solid #E3EAED', borderRadius: 12, padding: '6px 10px', fontSize: 13, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
          }}>
            {m.texto}
            {m.imagenes > 0 && <span style={{ display: 'block', fontSize: 11, color: '#8598A1' }}>con {m.imagenes} foto{m.imagenes === 1 ? '' : 's'}</span>}
            <span style={{ display: 'block', fontSize: 10.5, color: '#8598A1', marginTop: 2, textAlign: m.de === 'cliente' ? 'left' : 'right' }}>
              {m.de === 'cliente' ? 'Cliente' : m.de === 'bot' ? 'Bot' : quienDijo(m.quien)} · {hora(m.hora)}
              {m.envio === 'sin-canal' && <strong style={{ color: '#B45309' }}> · no salió por WhatsApp</strong>}
            </span>
          </div>
        )) : <p style={{ fontSize: 12.5, color: '#8598A1', margin: 0 }}>Todavía no hay mensajes con este cliente.</p>}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <textarea data-respuesta rows={2} value={texto} onChange={ev => setTexto(ev.target.value)}
                  placeholder={c.estado === 'atendiendo' ? 'Escribe tu respuesta' : 'Escribir aquí toma la conversación: el bot deja de contestar'}
                  style={{ flex: 1, border: '1px solid #D6E0E4', borderRadius: 12, padding: '8px 10px', fontSize: 13, resize: 'vertical' }} />
        <button type="button" className="boton-tinta" data-mandar disabled={ocupado || !texto.trim()} onClick={mandar}>Mandar</button>
      </div>
      {sinCanal && (
        <p style={{ fontSize: 11.5, color: '#8598A1', margin: '6px 0 0' }}>
          Mientras la línea de WhatsApp de Meta no esté encendida, lo que se escribe aquí se guarda pero no le llega al cliente.
        </p>
      )}

      <details style={{ marginTop: 12 }}>
        <summary style={{ fontSize: 12, color: '#4A5A61', cursor: 'pointer' }}>Lo que ha pasado con este cliente</summary>
        <ul style={{ fontSize: 12, color: '#4A5A61', margin: '6px 0 0', paddingLeft: 18 }} data-bitacora>
          {[...(c.bitacora ?? [])].reverse().map((b, i) => (
            <li key={i}>{hora(b.hora)} · {quienDijo(b.quien)} · {b.accion}{b.detalle ? ` (${b.detalle})` : ''}</li>
          ))}
        </ul>
      </details>
    </Seccion>
  )
}

// ── Alta en tienda ──────────────────────────────────────────────────────────

function Alta({ token, esAdmin, plazaFija, onHecho, onCerrar }) {
  const [d, setD] = useState({ nombre: '', telefono: '', tipo: 'mayorista', plaza: plazaFija ?? '', modelo: '', notas: '' })
  const [error, setError] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const guardar = async () => {
    setOcupado(true); setError(null)
    try { const r = await altaClienteCrm(d, token); onHecho(r.cliente) } catch (e) { setError(e.message) } finally { setOcupado(false) }
  }
  const campo = (k, l) => (
    <label style={{ fontSize: 12, display: 'grid', gap: 3 }}>{l}
      <input data-alta={k} value={d[k]} onChange={ev => setD(x => ({ ...x, [k]: ev.target.value }))}
             style={{ border: '1px solid #D6E0E4', borderRadius: 10, padding: '6px 10px', fontSize: 13 }} />
    </label>
  )
  return (
    <Seccion tema="dinero" titulo="Dar de alta un cliente" sub="Un mayorista que llegó a la tienda, o alguien que pidió que le avisen. Con su WhatsApp, el bot lo reconoce cuando escriba."
             extra={<button type="button" className="rev-saltar" onClick={onCerrar}>Cancelar</button>} data-alta-cliente>
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        {campo('nombre', 'Nombre o negocio')}
        {campo('telefono', 'WhatsApp (10 dígitos)')}
        {campo('modelo', 'Su celular (marca y modelo)')}
        <label style={{ fontSize: 12, display: 'grid', gap: 3 }}>Tipo
          <select data-alta="tipo" value={d.tipo} onChange={ev => setD(x => ({ ...x, tipo: ev.target.value }))}
                  style={{ border: '1px solid #D6E0E4', borderRadius: 10, padding: '6px 10px', fontSize: 13 }}>
            <option value="mayorista">Mayorista</option>
            <option value="publico">Público</option>
          </select>
        </label>
        {esAdmin && (
          <label style={{ fontSize: 12, display: 'grid', gap: 3 }}>Plaza
            <select data-alta="plaza" value={d.plaza} onChange={ev => setD(x => ({ ...x, plaza: ev.target.value }))}
                    style={{ border: '1px solid #D6E0E4', borderRadius: 10, padding: '6px 10px', fontSize: 13 }}>
              <option value="">Sin plaza</option>
              {PLAZAS.map(p => <option key={p} value={p}>{nombreSucursal(p)}</option>)}
            </select>
          </label>
        )}
      </div>
      {error && <p role="alert" style={{ color: '#B42318', fontSize: 12.5, margin: '8px 0 0' }}>{error}</p>}
      <button type="button" className="boton-tinta" data-guardar-alta disabled={ocupado || (!d.nombre.trim() && !d.telefono.trim())}
              onClick={guardar} style={{ marginTop: 10 }}>Dar de alta</button>
    </Seccion>
  )
}

// ── La pantalla ─────────────────────────────────────────────────────────────

export default function ClientesPanel({ plazaFija = null }) {
  const { token, isAdmin } = useAuth()
  const [lista, setLista] = useState(null)
  const [cuenta, setCuenta] = useState(null)
  const [error, setError] = useState(null)
  const [filtro, setFiltro] = useState('todos')
  const [plaza, setPlaza] = useState('')
  const [busca, setBusca] = useState('')
  const [abierto, setAbierto] = useState(null)
  const [ficha, setFicha] = useState(null)
  const [alta, setAlta] = useState(false)

  const cargar = useCallback(async () => {
    if (!apiConfigurada) { setError('El servidor no está configurado todavía.'); return }
    try {
      const r = await clientesCrm(isAdmin ? plaza : null, token)
      setLista(r.clientes ?? []); setCuenta(r.cuenta ?? null); setError(null)
    } catch (e) { setError(e.message) }
  }, [token, isAdmin, plaza])

  useEffect(() => { cargar() }, [cargar])

  useEffect(() => {
    if (!abierto) { setFicha(null); return }
    let vivo = true
    clienteCrm(abierto, token).then(r => vivo && setFicha(r.cliente)).catch(e => vivo && setError(e.message))
    return () => { vivo = false }
  }, [abierto, token])

  const visibles = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const digitos = q.replace(/\D/g, '')
    return (lista ?? [])
      .filter(c => filtro === 'todos' || c.estado === filtro)
      .filter(c => !q || (c.nombre ?? '').toLowerCase().includes(q) || (digitos.length >= 3 && (c.telefono ?? '').includes(digitos)))
  }, [lista, filtro, busca])

  const alCambiar = c => {
    setFicha(c)
    if (c.id !== abierto) setAbierto(c.id)
    cargar()
  }

  return (
    <div style={{ display: 'grid', gap: 14 }} data-clientes>
      <Cifras>
        <Cifra tema="alerta" titulo="Pendientes" valor={cuenta?.pendiente ?? '—'} sub="El bot ya les dijo que los pasa con la tienda" />
        <Cifra tema="ventas" titulo="Atendiendo" valor={cuenta?.atendiendo ?? '—'} sub={cuenta?.noLeidos ? `${cuenta.noLeidos} mensajes sin leer` : 'Al día'} />
        <Cifra tema="neutro" titulo="Con el bot" valor={cuenta?.bot ?? '—'} />
        <Cifra tema="neutro" titulo="Clientes" valor={cuenta?.total ?? '—'} sub={isAdmin ? 'De todas las plazas' : `De ${nombreSucursal(plazaFija)}`} />
      </Cifras>

      {/* Sólo sale cuando hay alguno: un aviso rojo permanente en cero enseña a
          no mirarlo. */}
      {cuenta?.sinRespuesta > 0 && (
        <p data-aviso-sin-respuesta role="alert"
           style={{ fontSize: 13, color: '#7F1D1D', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 12, padding: '10px 12px', margin: 0 }}>
          <strong>{cuenta.sinRespuesta === 1 ? 'Hay 1 cliente al que nadie le contestó.' : `Hay ${cuenta.sinRespuesta} clientes a los que nadie les contestó.`}</strong>{' '}
          {cuenta.sinRespuesta === 1
            ? 'El bot no pudo responderle. Va al principio de la bandeja, marcado «Sin respuesta».'
            : 'El bot no pudo responderles. Van al principio de la bandeja, marcados «Sin respuesta».'}
        </p>
      )}

      {alta && <Alta token={token} esAdmin={isAdmin} plazaFija={plazaFija} onCerrar={() => setAlta(false)} onHecho={c => { setAlta(false); alCambiar(c) }} />}

      <div className={`crm-columnas${ficha ? ' con-ficha' : ''}`}>
        <Seccion tema="ventas" titulo="Bandeja" sinRelleno
                 sub="Primero a quien nadie le contestó; luego lo pendiente, y de ahí quien más lleva esperando."
                 extra={!alta && <button type="button" className="boton-tinta" data-nuevo-cliente onClick={() => setAlta(true)}>Dar de alta</button>}>
          <div style={{ padding: '10px 12px', display: 'grid', gap: 8, borderBottom: '1px solid #EEF2F4' }}>
            <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {FILTROS.map(f => (
                <Pastilla key={f} activa={filtro === f} onClick={() => setFiltro(f)} data-filtro-estado={f}>
                  {f === 'todos' ? 'Todos' : ESTADO[f].nombre}{f !== 'todos' && cuenta ? ` ${cuenta[f]}` : ''}
                </Pastilla>
              ))}
            </span>
            <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <input data-buscar-cliente value={busca} onChange={ev => setBusca(ev.target.value)} placeholder="Buscar por nombre o teléfono"
                     style={{ flex: '1 1 180px', border: '1px solid #D6E0E4', borderRadius: 10, padding: '6px 10px', fontSize: 13 }} />
              {isAdmin && (
                <select data-filtro-plaza value={plaza} onChange={ev => setPlaza(ev.target.value)}
                        style={{ border: '1px solid #D6E0E4', borderRadius: 10, padding: '6px 8px', fontSize: 13 }}>
                  <option value="">Todas las plazas</option>
                  {PLAZAS.map(p => <option key={p} value={p}>{nombreSucursal(p)}</option>)}
                  <option value="sin-plaza">Sin plaza</option>
                </select>
              )}
            </span>
          </div>
          {error && <p role="alert" style={{ color: '#B42318', fontSize: 12.5, padding: '8px 12px', margin: 0 }}>{error}</p>}
          {lista === null && !error && <p style={{ padding: 12, fontSize: 12.5, color: '#8598A1', margin: 0 }}>Cargando…</p>}
          {lista && !visibles.length && (
            <p data-bandeja-vacia style={{ padding: 12, fontSize: 12.5, color: '#4A5A61', margin: 0 }}>
              {lista.length
                ? 'Nadie en este filtro.'
                : 'Todavía no hay clientes. Llegan solos cuando alguien le escribe al bot, o dalos de alta aquí.'}
            </p>
          )}
          <div style={{ maxHeight: 620, overflowY: 'auto' }}>
            {visibles.map(c => <Renglon key={c.id} c={c} activo={c.id === abierto} onAbrir={setAbierto} verPlaza={isAdmin} />)}
          </div>
        </Seccion>

        {ficha && <div className="crm-ficha"><Ficha cliente={ficha} token={token} esAdmin={isAdmin} onCambio={alCambiar} onCerrar={() => setAbierto(null)} /></div>}
      </div>
    </div>
  )
}
