// El flujo de efectivo de las cinco plazas, listo para pintar.
//
// Vive aparte por lo mismo que `useSurtidos` y `useAjustes`: lo pide la
// pestaña de Efectivo, donde se trabaja, y el dashboard, donde tiene que
// avisar. Si cada una lo cargara por su cuenta, bastaría con que una se
// olvidara para que una semana sin depositar no apareciera en ningún sitio.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  caja as pedirCaja, marcarDeposito, ajustarCaja,
  guardarParametrosCaja, guardarMovimientoCaja,
} from './api'
import { PARAMETROS_VACIOS, bloquesSemanales, acumuladoPorDepositar, efectivoEnCaja, tieneDatos } from './caja'

/** Las cinco plazas que manejan efectivo, en el orden en que se miran. */
export const PLAZAS_CAJA = [
  { slug: 'leon',           nombre: 'León' },
  { slug: 'san-luis',       nombre: 'San Luis Potosí' },
  { slug: 'aguascalientes', nombre: 'Aguascalientes' },
  // Torreón NO está activa como tienda: no publica inventario ni
  // estadísticas. Lo que sí tiene es el histórico de caja que viene en su
  // respaldo -498 días-, y el dueño decidió el 2026-11-06 aprovechar sólo eso:
  // «podemos utilizar únicamente el historial que viene en el respaldo».
  //
  // Por eso se marca. Sin la marca aparecía igual que una tienda abierta, con
  // sus semanas «sin depositar», y eso manda a perseguir un depósito de una
  // plaza que no está operando.
  { slug: 'torreon',        nombre: 'Torreón', historico: true },
  // Ferias cierra ocho meses al año: va al final y no entra en el promedio de
  // nada, por lo mismo que no entra en el surtido de las tiendas.
  { slug: 'ferias',         nombre: 'Ferias', estacional: true },
]

/**
 * Cuántas semanas se CALCULAN como mucho. Ocho, y no se bajan.
 *
 * Es distinto de lo que se enseña. `acumuladoPorDepositar` suma las semanas
 * cargadas que nadie ha marcado como depositadas, así que recortar esto a dos
 * haría desaparecer de la cuenta una semana de hace un mes que siga sin
 * depositar —sin avisar, y es justo el dinero que hay que perseguir—.
 *
 * Quien manda de verdad hoy es `INICIO_HISTORIAL`: el historial arranca el
 * 2026-11-02, así que ahora mismo esto da UNA semana y no ocho, y irá
 * creciendo hasta toparse aquí. Este número es el techo, no la cifra.
 */
export const SEMANAS = 8

/**
 * 🔒 Cuántas semanas se ENSEÑAN. Dos: la pasada y ésta.
 *
 * Lo pidió el dueño el 2026-11-06. Ocho semanas a la vista eran dos meses de
 * renglones para revisar un corte de ayer.
 *
 * Las otras seis se siguen calculando y siguen contando en «lo que falta por
 * depositar»; lo único que cambia es que no se dibujan.
 */
export const SEMANAS_A_LA_VISTA = 2

/**
 * Tres cosas que esta pantalla NO cuenta, y conviene tenerlas juntas:
 *
 *   `INICIO_HISTORIAL`  nada de antes del 2026-11-02 es un pendiente
 *   `conControl`        una semana sin control de salidas no da diferencia
 *   `NO_RESTAN`         un faltante registrado no baja el efectivo neto
 *
 * Las tres son del dueño y las tres van en la misma dirección: antes de
 * acusar a alguien de un faltante, estar seguro de que el número es suyo.
 */

export function useCaja(token, { semanas = SEMANAS, hasta = null } = {}) {
  const [datos, setDatos]       = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError]       = useState(null)
  const [vuelta, setVuelta]     = useState(0)

  useEffect(() => {
    if (!token) { setCargando(false); return }
    let vivo = true
    setCargando(true)
    pedirCaja(token)
      .then(r => { if (vivo) { setDatos(r); setError(null) } })
      // Un fallo se DICE. Un flujo vacío se lee como «no hay nada que
      // depositar», que es lo contrario de «no pude mirar».
      .catch(e => { if (vivo) setError(e.message || 'No se pudo leer el flujo de efectivo.') })
      .finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
  }, [token, vuelta])

  const recargar = useCallback(() => setVuelta(v => v + 1), [])

  // `hoy` se congela por vuelta y no se lee en cada render: con `new Date()`
  // suelto, cada repintado daba una hora distinta y un bloque podía pasar de
  // «pendiente» a «atrasado» sin que nadie tocara nada.
  const hoy = useMemo(() => new Date().toISOString(), [vuelta])

  const plazas = useMemo(() => PLAZAS_CAJA.map(p => {
    const flujo  = datos?.flujos?.[p.slug] ?? null
    const params = { ...PARAMETROS_VACIOS, ...(datos?.parametros?.[p.slug] ?? {}) }

    // Lo que capturó el personal en Eleventa y lo que se capturó aquí, juntos.
    // Se distinguen por `origen` para poder decirlo en pantalla: uno lo teclea
    // quien cobra y el otro quien revisa.
    const movimientos = [
      ...(flujo?.movimientos ?? []),
      ...Object.values(datos?.movimientos?.[p.slug] ?? {}),
    ]

    // Las ocho semanas, para las cuentas que NO pueden olvidar lo viejo.
    const todos = bloquesSemanales({
      hasta: hasta ?? hoy.slice(0, 10),
      cuantas: semanas,
      dias: flujo?.dias ?? [],
      movimientos,
      ajustes: datos?.ajustes?.[p.slug] ?? {},
      depositos: datos?.depositos?.[p.slug] ?? {},
      params, hoy,
    })

    // Lo que debe al banco y lo que debe haber en el cajón se calculan sobre
    // las OCHO. Una semana de hace un mes sin depositar sigue siendo dinero
    // que falta, y recortarla aquí la haría desaparecer de la cuenta sin que
    // nadie se enterara.
    const acumulado = acumuladoPorDepositar(todos)

    return {
      ...p,
      params, acumulado, movimientos,
      // ── Y lo que se DIBUJA son dos: la semana pasada y ésta ────────────
      //
      // El recorte va aquí, en el origen, y no en cada pantalla. Se intentó
      // al revés -recortando donde se pintan los bloques- y no bastó: el
      // concentrado seguía sumando el efectivo cobrado de las ocho semanas
      // por su cuenta, así que el dueño seguía viendo ocho. Con una sola
      // lista `bloques`, ninguna pantalla puede volver a mezclarlas sin
      // querer.
      //
      // Lo viejo no se tira: sigue en `todos` y sigue contando arriba.
      bloques:   todos.slice(0, SEMANAS_A_LA_VISTA),
      todos,
      // `flujo.faltantes` —los descuadres que escribe Eleventa sola al cerrar
      // turno— NO se pasa a la pantalla. El dueño los quitó el 2026-11-06
      // porque no son precisos: ver `faltantesDe` en `caja.js`. Se siguen
      // extrayendo y apartando, que es lo que impide que resten del neto.
      respaldo:  flujo?.respaldo ?? null,
      enCaja:    efectivoEnCaja({ bloques: todos, params }),
      // Sin archivo publicado no es que no haya movimiento: es que el
      // extractor no ha corrido para esa plaza, y se dice distinto.
      //
      // Ojo con la comprobación: `leerJson` del backend devuelve `{}` cuando
      // la clave no existe en S3, y `{}` es VERDADERO. Mirando sólo `!flujo`
      // la pantalla daba por buena una plaza sin archivo y pintaba la semana
      // entera en CEROS, que se lee como «no se vendió» cuando lo que pasa es
      // que no se pudo mirar. Pasó de verdad el 2026-11-06, antes de que el
      // extractor corriera por primera vez.
      //
      // Por eso se mira el contenido: un archivo de verdad siempre trae días.
      sinDatos:  !tieneDatos(flujo),
    }
  }), [datos, semanas, hasta, hoy])

  // ── Escrituras ──
  //
  // Todas recargan al terminar en vez de parchear el estado a mano. Es más
  // lento y es a propósito: marcar un depósito cambia el acumulado, el
  // efectivo en caja y el semáforo de esa plaza a la vez, y parchear sólo una
  // de las tres dejaba la tarjeta diciendo dos cosas distintas.

  const marcar = useCallback(async d => {
    await marcarDeposito(d, token)
    recargar()
  }, [token, recargar])

  const desmarcar = useCallback(async (sucursal, semana) => {
    await marcarDeposito({ sucursal, semana, monto: null }, token)
    recargar()
  }, [token, recargar])

  const ajustar = useCallback(async a => {
    await ajustarCaja(a, token)
    recargar()
  }, [token, recargar])

  const deshacerAjuste = useCallback(async (sucursal, fecha) => {
    await ajustarCaja({ sucursal, fecha, motivo: null }, token)
    recargar()
  }, [token, recargar])

  const guardarParametros = useCallback(async (sucursal, params) => {
    await guardarParametrosCaja(sucursal, params, token)
    recargar()
  }, [token, recargar])

  const guardarMovimiento = useCallback(async mov => {
    await guardarMovimientoCaja(mov, token)
    recargar()
  }, [token, recargar])

  const borrarMovimiento = useCallback(async (sucursal, id) => {
    await guardarMovimientoCaja({ sucursal, id, borrar: true }, token)
    recargar()
  }, [token, recargar])

  return {
    plazas, cargando, error, recargar, hoy,
    marcar, desmarcar, ajustar, deshacerAjuste,
    guardarParametros, guardarMovimiento, borrarMovimiento,
  }
}
