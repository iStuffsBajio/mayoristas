// Los teléfonos de las sucursales, leídos de donde los edita el panel.
//
// No se importa `src/lib/siteConfig.js` por dos razones. La primera es
// técnica: ese módulo importa `./api` sin extensión, que Vite resuelve y Node
// no —la misma trampa del «import que falta compila igual», al revés—. La
// segunda pesa más: `DEFAULT_CONFIG` es el respaldo del navegador, no la
// verdad. Los números buenos están en `config/site.json`, que el panel
// sobreescribe. Un bot con los teléfonos pegados en el código manda leads al
// número viejo el día que una tienda cambie de línea, y nadie se entera
// porque el chat se ve perfecto.

const BUCKET = process.env.S3_BUCKET || 'istuffs-inventarios'
const REGION = process.env.S3_REGION || 'us-east-1'

const CACHE_MINUTOS = 15

/** Último recurso si S3 no responde. Deliberadamente vacío salvo el general:
 *  es mejor que el bot diga «te paso con la tienda» y falle en voz alta que
 *  mandar a alguien a un número inventado. */
const MINIMO = { general: '' }

let cache = { cuando: 0, valor: null }

/** `{ general, leon, 'san-luis', aguascalientes, torreon }` */
export async function telefonos({ ahora = Date.now() } = {}) {
  if (cache.valor && ahora - cache.cuando < CACHE_MINUTOS * 60000) return cache.valor

  try {
    const res = await fetch(
      `https://${BUCKET}.s3.${REGION}.amazonaws.com/config/site.json?t=${ahora}`,
      { cache: 'no-store' }
    )
    if (!res.ok) throw new Error(String(res.status))
    const json = await res.json()
    const valor = { ...MINIMO, ...(json?.whatsapp ?? {}) }
    cache = { cuando: ahora, valor }
    return valor
  } catch {
    // Sin config remota se devuelve el mínimo, y `entregarASucursal` contestará
    // `sin-numero`, que es un fallo visible. Lo que no hace es adivinar.
    return { ...MINIMO }
  }
}

export const olvidar = () => { cache = { cuando: 0, valor: null } }
