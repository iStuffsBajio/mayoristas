import { createContext, useContext, useState, useEffect } from 'react'
import { login as loginApi, apiConfigurada, alVencerSesion, reiniciarAvisoSesion } from '../lib/api'

const AuthContext = createContext(null)

// Antes las contraseñas vivían en variables VITE_, que Vite compila dentro del
// JavaScript público: cualquiera que abriera el código las leía, y la
// comparación ocurría en el navegador del visitante, así que además se podía
// saltar editando el código. Ahora la contraseña viaja al backend, que la
// compara contra un hash PBKDF2 y devuelve una sesión firmada.

const NOMBRES = {
  'leon':           'León',
  'san-luis':       'San Luis Potosí',
  'aguascalientes': 'Aguascalientes',
  'torreon':        'Torreón',
  'all':            'Administrador',
}

const CLAVE_SESION = 'istuffs_session'

function sesionGuardada() {
  try {
    const s = sessionStorage.getItem(CLAVE_SESION)
    if (!s) return null
    const d = JSON.parse(s)
    // Sin token la sesión no sirve para nada: el backend rechaza cualquier
    // escritura que no lo lleve. Una sesión vieja del esquema anterior se
    // descarta en vez de aparentar que sigue viva.
    return d?.token ? d : null
  } catch { return null }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(sesionGuardada)

  // Se enseña una sola vez, cuando el backend rechaza un token que el
  // navegador daba por bueno. No es un error: es que caducó.
  const [vencida, setVencida] = useState(false)

  const login = async (branchSlug, password) => {
    if (!apiConfigurada) {
      return { ok: false, msg: 'El servidor de acceso no está configurado todavía.' }
    }
    try {
      const r = await loginApi(branchSlug, password)
      const s = {
        branch:  r.sucursal,
        isAdmin: !!r.admin,
        token:   r.token,
      }
      setSession(s)
      try { sessionStorage.setItem(CLAVE_SESION, JSON.stringify(s)) } catch { /* modo privado */ }
      return { ok: true }
    } catch (err) {
      return { ok: false, msg: err.message || 'No se pudo iniciar sesión.' }
    }
  }

  const logout = () => {
    setSession(null)
    setVencida(false)
    reiniciarAvisoSesion()
    try { sessionStorage.removeItem(CLAVE_SESION) } catch { /* ignora */ }
  }

  // El backend avisa cuando rechaza el token. Sin esto, la pantalla seguía
  // diciendo «administrador» con una sesión muerta y cada seccion fallaba por
  // su cuenta con un mensaje distinto: «no se pudieron leer los turnos» parecía
  // un problema de los turnos cuando sólo había que volver a entrar.
  //
  // Un token dura ocho horas, así que esto pasa todos los días.
  useEffect(() => alVencerSesion(() => {
    setVencida(true)
    setSession(null)
    try { sessionStorage.removeItem(CLAVE_SESION) } catch { /* ignora */ }
  }), [])

  // Sigue siendo una comprobación de interfaz, para no enseñar botones que no
  // van a funcionar. Quien manda es el backend, que revalida el token en cada
  // escritura: falsificar esto en el navegador no consigue nada.
  const canUpload = (branchSlug) => {
    if (!session) return false
    return session.isAdmin || session.branch === 'all' || session.branch === branchSlug
  }

  const branchName = session ? NOMBRES[session.branch] || session.branch : null
  const isAdmin    = !!session?.isAdmin
  const token      = session?.token ?? null

  return (
    <AuthContext.Provider value={{ session, token, login, logout, canUpload, branchName, isAdmin, vencida }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
