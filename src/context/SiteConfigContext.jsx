import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { loadSiteConfig, saveSiteConfig, DEFAULT_CONFIG } from '../lib/siteConfig'
import { useAuth } from './AuthContext'

const Ctx = createContext(null)

export function SiteConfigProvider({ children }) {
  // El token de la sesión viaja con el guardado: el backend lo exige y
  // comprueba que sea de administrador antes de escribir nada.
  const { token } = useAuth()
  const [config, setConfig]     = useState(DEFAULT_CONFIG)
  const [guardando, setGuardando] = useState(false)
  const [cargando, setCargando]   = useState(true)

  useEffect(() => {
    loadSiteConfig().then(cfg => {
      setConfig(cfg)
      setCargando(false)
    })
  }, [])

  const save = useCallback(async (parcial) => {
    const next = {
      ...config,
      ...parcial,
      // preserve nested objects
      tabs:             parcial.tabs             ? { ...config.tabs,             ...parcial.tabs }             : config.tabs,
      hero:             parcial.hero             ? { ...config.hero,             ...parcial.hero }             : config.hero,
      colores:          parcial.colores          ? { ...config.colores, ...parcial.colores, gradientes: { ...config.colores.gradientes, ...parcial.colores.gradientes } } : config.colores,
      footer:           parcial.footer           ? { ...config.footer,           ...parcial.footer }           : config.footer,
      dropboxCatalogos: parcial.dropboxCatalogos ? { ...config.dropboxCatalogos, ...parcial.dropboxCatalogos } : config.dropboxCatalogos,
      whatsapp:         parcial.whatsapp         ? { ...config.whatsapp,         ...parcial.whatsapp }         : config.whatsapp,
    }
    setConfig(next)
    setGuardando(true)
    try {
      await saveSiteConfig(next, token)
    } finally {
      setGuardando(false)
    }
  }, [config, token])

  return (
    <Ctx.Provider value={{ config, save, guardando, cargando }}>
      {children}
    </Ctx.Provider>
  )
}

export const useSiteConfig = () => useContext(Ctx)
