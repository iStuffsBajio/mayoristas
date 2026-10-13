import { useState, useEffect, useMemo } from 'react'
import {
  resumirSemana, semanaPasada, semanaEnCurso, formatoRango,
  soloHora, nombreDia, horarioDe, tieneHorario, TOLERANCIA_MIN,
} from '../lib/personal'

/** El saldo con su signo, que es lo que hay que leer de un vistazo. */
const conSigno = n => (n > 0 ? `+${Math.round(n)}` : String(Math.round(n)))

/** Píldora con el acumulado de minutos de la semana. */
function Saldo({ min, etiqueta = 'en la semana', grande = false }) {
  const malo = min > 0
  const color = malo ? ROSA : VERDE
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'baseline', gap: 5,
      padding: grande ? '5px 12px' : '3px 9px',
      borderRadius: 999,
      background: malo ? 'rgba(196,21,111,0.07)' : 'rgba(94,148,34,0.08)',
      border: '1px solid ' + (malo ? 'rgba(196,21,111,0.2)' : 'rgba(94,148,34,0.22)'),
    }}>
      <strong style={{ fontSize: grande ? 15 : 12.5, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>
        {conSigno(min)} min
      </strong>
      <span style={{ fontSize: grande ? 11.5 : 10.5, color: TINTA_SUAVE }}>{etiqueta}</span>
    </span>
  )
}
import { turnos as pedirTurnos, apiConfigurada } from '../lib/api'
import { useAuth } from '../context/AuthContext'

const TINTA       = '#101619'
const TINTA_SUAVE = '#4A5A61'
const TINTA_TENUE = '#8598A1'
const LINEA       = '#D6E0E4'
const ROSA        = '#C4156F'
const VERDE       = '#5E9422'
const AMBAR       = '#B45309'

function Pildora({ activa, onClick, children }) {
  return (
    <button type="button" onClick={onClick}
      className="px-3.5 py-1.5 text-xs font-semibold transition-all"
      style={activa
        ? { background: 'linear-gradient(135deg, #00BCF2, #8DC63F)', borderRadius: 999, color: '#fff', border: 'none', cursor: 'pointer', boxShadow: '0 3px 12px rgba(0,188,242,0.22)' }
        : { backgroundColor: 'rgba(16,22,25,0.05)', border: '1px solid ' + LINEA, borderRadius: 999, color: TINTA_SUAVE, cursor: 'pointer', background: 'none' }}>
      {children}
    </button>
  )
}

function Cifra({ valor, etiqueta, color }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5 }}>
      <strong style={{ fontSize: 21, fontWeight: 800, color: color || TINTA, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{valor}</strong>
      <span style={{ fontSize: 12, color: TINTA_SUAVE }}>{etiqueta}</span>
    </span>
  )
}

/** El día de la semana con su hora, en una celdita. */
function Dia({ d, conHorario }) {
  // Un relevo no abrió la tienda, así que su hora no se juzga.
  const medible = conHorario && d.abrio !== false
  const color = !medible ? TINTA_SUAVE
    : d.esRetardo ? ROSA
    : d.tarde <= 0 ? VERDE
    : AMBAR

  return (
    <div style={{
      flex: 1, minWidth: 62, textAlign: 'center', padding: '7px 4px',
      borderRadius: 12, background: d.esRetardo ? 'rgba(196,21,111,0.06)' : 'rgba(16,22,25,0.025)',
    }}>
      <div style={{ fontSize: 10, color: TINTA_TENUE, textTransform: 'capitalize' }}>
        {nombreDia(d.fecha).slice(0, 3)}
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>
        {soloHora(d.inicio)}
      </div>
      {/* La hora de corte del turno. Sin ella no se sabe si el día fue
          completo: llegar diez minutos tarde y cerrar a las ocho no es lo
          mismo que llegar tarde y cerrar a media tarde. */}
      <div style={{ fontSize: 9.5, color: TINTA_TENUE, fontVariantNumeric: 'tabular-nums' }}>
        a {d.fin ? soloHora(d.fin) : '—'}
      </div>
      {medible ? (
        <div style={{ fontSize: 9.5, color, marginTop: 1 }}>
          {d.tarde > 0 ? `+${d.tarde}` : d.tarde === 0 ? '0' : d.tarde}
        </div>
      ) : conHorario && (
        <div style={{ fontSize: 9, color: TINTA_TENUE, marginTop: 1 }}>relevo</div>
      )}
    </div>
  )
}

export default function PersonalPanel() {
  const { token } = useAuth()
  const [turnos, setTurnos]     = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError]       = useState(null)
  const [cual, setCual]         = useState('pasada')

  useEffect(() => {
    let cancelado = false
    setCargando(true)
    ;(async () => {
      if (!apiConfigurada) {
        if (!cancelado) { setError('sin-backend'); setCargando(false) }
        return
      }
      try {
        const d = await pedirTurnos(token)
        if (!cancelado) { setTurnos(d?.turnos ?? []); setError(null) }
      } catch (e) {
        // Un 404 es «todavía no se ha publicado el archivo», que no es una
        // falla: el backend contestó bien. Merece un aviso tranquilo y no uno
        // rojo que parezca que algo se rompió.
        if (!cancelado) setError(e.codigo === 404 ? 'sin-publicar' : (e.message || 'sin-datos'))
      } finally {
        if (!cancelado) setCargando(false)
      }
    })()
    return () => { cancelado = true }
  }, [token])

  const rango = useMemo(() => (cual === 'pasada' ? semanaPasada() : semanaEnCurso()), [cual])
  const resumen = useMemo(() => (turnos ? resumirSemana(turnos, rango) : null), [turnos, rango])

  return (
    <div style={{ backgroundColor: '#fff', borderRadius: 30, border: '1px solid ' + LINEA, padding: '24px 22px', boxShadow: '0 2px 12px rgba(16,22,25,0.04)' }}>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <span style={{ fontSize: 11.5, color: TINTA_TENUE }}>
          hora de apertura de caja · entrada {horarioDe('leon').abre} con {TOLERANCIA_MIN} min de tolerancia
        </span>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <Pildora activa={cual === 'pasada'} onClick={() => setCual('pasada')}>Semana pasada</Pildora>
        <Pildora activa={cual === 'curso'} onClick={() => setCual('curso')}>Semana en curso</Pildora>
        <span style={{ fontSize: 12, color: TINTA_SUAVE, alignSelf: 'center', marginLeft: 4 }}>
          {formatoRango(rango)}
        </span>
      </div>

      {cargando && <p style={{ fontSize: 13, color: TINTA_TENUE }}>Cargando turnos...</p>}

      {!cargando && error === 'sin-publicar' && (
        <div style={{ padding: '14px 16px', borderRadius: 16, background: 'rgba(16,22,25,0.03)', border: '1px solid ' + LINEA }}>
          <p style={{ fontSize: 13, color: TINTA, fontWeight: 700, margin: 0 }}>
            Todavía no hay turnos publicados
          </p>
          <p style={{ fontSize: 12, color: TINTA_SUAVE, margin: '4px 0 0', lineHeight: 1.5 }}>
            El backend responde bien; lo que falta es el archivo. Los turnos salen de la tabla
            TURNOS de los respaldos de cada sucursal, y se publican
            con <code>node scripts/extraer-turnos.js</code>. En cuanto corra una vez, esta
            sección se llena sola y se mantiene al día con la sincronización.
          </p>
        </div>
      )}

      {!cargando && error && error !== 'sin-publicar' && (
        <div style={{ padding: '14px 16px', borderRadius: 16, background: 'rgba(196,21,111,0.05)', border: '1px solid rgba(196,21,111,0.18)' }}>
          <p style={{ fontSize: 13, color: ROSA, fontWeight: 700, margin: 0 }}>
            {error === 'sin-backend' ? 'Esta sección necesita el backend' : 'No se pudieron leer los turnos'}
          </p>
          <p style={{ fontSize: 12, color: TINTA_SUAVE, margin: '4px 0 0', lineHeight: 1.5 }}>
            Los turnos son nombres de empleados y la hora a la que llegaron cada día, así que viven
            en un prefijo privado del bucket y no en el público. Alcanzarlos desde el navegador
            obligaría a llevar credenciales, que es justo lo que se quitó, así que los sirve el
            backend. Mientras tanto el reporte se saca en Excel
            con <code>node scripts/extraer-turnos.js --reporte</code>.
          </p>
        </div>
      )}

      {resumen && !cargando && !error && (
        <>
          <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            <Cifra valor={resumen.personas} etiqueta="personas" />
            <Cifra valor={resumen.totalTurnos} etiqueta="turnos" />
            <Cifra valor={resumen.totalRetardos} etiqueta="retardos"
                   color={resumen.totalRetardos > 0 ? ROSA : VERDE} />
            <Saldo min={resumen.saldoMin} etiqueta="acumulado de todas" grande />
          </div>

          {/* El acumulado de cada plaza. Es la cifra que se puede comentar en
              una junta: si León va en −20 y Aguascalientes en +95, el problema
              tiene nombre de sucursal y no de persona. */}
          {resumen.porSucursal.filter(x => x.medible).length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              {resumen.porSucursal.filter(x => x.medible).map(x => (
                <span key={x.slug} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  padding: '6px 12px', borderRadius: 14,
                  border: '1px solid ' + LINEA, background: '#FBFDFD',
                }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: TINTA }}>{x.sucursal}</span>
                  <Saldo min={x.saldoMin} etiqueta={x.retardos === 1 ? '1 retardo' : `${x.retardos} retardos`} />
                </span>
              ))}
            </div>
          )}

          {resumen.filas.length === 0 && (
            <p style={{ fontSize: 13, color: TINTA_TENUE }}>Sin turnos en esta semana.</p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {resumen.filas.map(f => {
              const conHorario = tieneHorario(f.slug)
              return (
                <div key={f.slug + f.persona}
                  style={{ border: '1px solid ' + LINEA, borderRadius: 20, padding: '14px 16px' }}>

                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: TINTA, textTransform: 'capitalize' }}>
                      {f.persona}
                    </span>
                    <span style={{ fontSize: 11.5, color: TINTA_TENUE }}>{f.sucursal}</span>
                    <span style={{ marginLeft: 'auto', display: 'flex', gap: 14, fontSize: 11.5, color: TINTA_SUAVE }}>
                      <span>{f.diasTrabajados} {f.diasTrabajados === 1 ? 'día' : 'días'}</span>
                      {conHorario ? (
                        <>
                          <span style={{ color: f.retardos > 0 ? ROSA : VERDE, fontWeight: 700 }}>
                            {f.retardos} {f.retardos === 1 ? 'retardo' : 'retardos'}
                          </span>
                          {f.promedioMin !== null && (
                            <span>
                              promedio{' '}
                              <strong style={{ color: f.promedioMin > TOLERANCIA_MIN ? ROSA : TINTA }}>
                                {f.promedioMin > 0 ? '+' : ''}{f.promedioMin.toFixed(0)} min
                              </strong>
                            </span>
                          )}
                          <Saldo min={f.saldoMin} />
                        </>
                      ) : (
                        <span style={{ color: TINTA_TENUE }}>sin horario fijo</span>
                      )}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {f.dias.map(d => <Dia key={d.fecha} d={d} conHorario={conHorario} />)}
                  </div>

                  {conHorario && f.peor && (
                    <p style={{ fontSize: 11.5, color: AMBAR, margin: '9px 0 0' }}>
                      El peor fue el {nombreDia(f.peor.fecha)}: abrió a las {soloHora(f.peor.inicio)},
                      {' '}{f.peor.tarde} minutos tarde.
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          <p style={{ fontSize: 11, color: TINTA_TENUE, margin: '16px 0 0', lineHeight: 1.55, paddingTop: 12, borderTop: '1px solid ' + LINEA }}>
            Esto mide cuándo se <strong>abrió la caja</strong>, no cuándo llegó la persona. Quien llega
            puntual pero tarda en abrir sale como retardo, así que sirve para ver tendencias y no para
            cobrar un minuto. Ferias no se califica: un puesto no abre a hora fija.
            {' '}Un día sin turno es un día sin caja abierta, que puede ser descanso.
            {' '}Quien entra a relevar abre caja a media tarde y eso no es un retardo: aparece
            como «relevo». Pero si toma la caja dentro de la primera hora sí cuenta, porque
            entonces no releva un turno, releva a quien abrió y se fue.
            {' '}El saldo suma todos los días medibles con su signo, así que los adelantos
            descuentan: es el acumulado de la semana, no la cuenta de los castigos.
          </p>
        </>
      )}
    </div>
  )
}
