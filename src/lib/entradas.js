// Entradas por sección.
//
// El contenido nace VISIBLE en el HTML. El guion marca la página con la clase
// `js` y sólo entonces el CSS lo esconde para volver a mostrarlo al entrar en
// pantalla. Si el guion no corre -o lo bloquea una política de seguridad, que
// ya pasó una vez- la página se lee entera igual.
//
// El observador vigila además los nodos que LLEGAN DESPUÉS. La primera
// versión montaba el observador una vez, y la franja del catálogo -que
// aparece cuando responde el índice- quedaba escondida para siempre: el CSS
// ya la había ocultado y nadie volvía a mirarla. Una banda negra vacía a
// media página.

import { useEffect } from 'react'

// Se miran los que todavía NO han entrado, y se vuelven a mirar siempre.
//
// Antes cada nodo se marcaba `visto` la primera vez y ya no se observaba
// nunca más. Eso dejaba contenido invisible para siempre en cuanto el
// observador se reemplazaba -al cambiar de pestaña, o en desarrollo, donde
// React monta, desmonta y vuelve a montar-: el observador viejo se
// desconectaba, el nuevo no miraba nada porque todo estaba «visto», y lo que
// no hubiera entrado en pantalla se quedaba en opacidad cero.
//
// Pasó de verdad: dos de los tres puntos de la sección de oficios no se leían
// nunca. Observar dos veces el mismo nodo no cuesta nada -el navegador lo
// ignora- y quitar la marca quita el fallo entero.
function mirar(ojo, raiz) {
  for (const p of raiz.querySelectorAll?.('[data-entra]:not(.dentro)') ?? []) {
    ojo.observe(p)
  }
}

export function montarEntradas(raiz = document) {
  document.documentElement.classList.add('js')

  // Sin IntersectionObserver no hay animación, pero tampoco contenido oculto.
  if (!('IntersectionObserver' in window)) {
    for (const p of raiz.querySelectorAll('[data-entra]')) p.classList.add('dentro')
    return () => {}
  }

  const ojo = new IntersectionObserver(entradas => {
    for (const e of entradas) {
      if (!e.isIntersecting) continue
      e.target.classList.add('dentro')
      ojo.unobserve(e.target)
    }
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.05 })

  mirar(ojo, raiz)

  // Lo que React pinte después -una lista que llega de la red, otra pestaña-
  // entra al observador en cuanto aparece.
  const cambios = new MutationObserver(() => mirar(ojo, raiz))
  cambios.observe(raiz.body ?? raiz, { childList: true, subtree: true })

  // Red de seguridad: si algo quedara oculto sin que el observador lo viera
  // -una pestaña fuera de pantalla, un fallo del navegador- a los dos
  // segundos se muestra. Nunca se pierde contenido por culpa de la animación.
  const red = setTimeout(() => {
    for (const p of raiz.querySelectorAll('[data-entra]:not(.dentro)')) {
      const caja = p.getBoundingClientRect()
      if (caja.top < window.innerHeight * 1.5) p.classList.add('dentro')
    }
  }, 2000)

  return () => { ojo.disconnect(); cambios.disconnect(); clearTimeout(red) }
}

/** Monta las entradas y las vuelve a montar cuando cambia lo que se enseña. */
export function useEntradas(dep) {
  useEffect(() => montarEntradas(), [dep])
}
