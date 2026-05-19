import { createContext, useContext, useState } from 'react'

const AuthContext = createContext(null)

// Contraseñas leídas desde variables de entorno de Amplify.
// Se configuran en: AWS Amplify → App Settings → Environment variables
const PASSWORDS = {
  'leon':           import.meta.env.VITE_PASS_LEON    || '',
  'san-luis':       import.meta.env.VITE_PASS_SLP     || '',
  'aguascalientes': import.meta.env.VITE_PASS_AGS     || '',
  'torreon':        import.meta.env.VITE_PASS_TORREON || '',
}
const ADMIN_PASS = import.meta.env.VITE_PASS_ADMIN || ''

const BRANCH_NAMES = {
  'leon':           'León',
  'san-luis':       'San Luis Potosí',
  'aguascalientes': 'Aguascalientes',
  'torreon':        'Torreón',
  'all':            'Administrador',
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => {
    try {
      const s = sessionStorage.getItem('istuffs_session')
      return s ? JSON.parse(s) : null
    } catch { return null }
  })

  const login = (branchSlug, password) => {
    // Contraseña de administrador — accede a todas las sucursales
    if (ADMIN_PASS && password === ADMIN_PASS) {
      const s = { branch: 'all', isAdmin: true }
      setSession(s)
      sessionStorage.setItem('istuffs_session', JSON.stringify(s))
      return { ok: true }
    }
    // Contraseña de sucursal específica
    const expected = PASSWORDS[branchSlug]
    if (!expected) return { ok: false, msg: 'Sucursal sin contraseña configurada.' }
    if (password === expected) {
      const s = { branch: branchSlug, isAdmin: false }
      setSession(s)
      sessionStorage.setItem('istuffs_session', JSON.stringify(s))
      return { ok: true }
    }
    return { ok: false, msg: 'Contraseña incorrecta.' }
  }

  const logout = () => {
    setSession(null)
    sessionStorage.removeItem('istuffs_session')
  }

  // Devuelve true si el usuario actual puede cargar inventario para ese branch
  const canUpload = (branchSlug) => {
    if (!session) return false
    if (session.isAdmin || session.branch === 'all') return true
    return session.branch === branchSlug
  }

  const branchName = session ? BRANCH_NAMES[session.branch] || session.branch : null

  return (
    <AuthContext.Provider value={{ session, login, logout, canUpload, branchName }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
