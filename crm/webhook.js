// El webhook de Meta se mudó a `backend/src/meta-webhook.js` el 2026-11-11.
//
// La ruta `/meta/webhook` corre en la Lambda del backend, y su zip sólo lleva
// `backend/src`: no puede importar de aquí. Este archivo queda como la puerta
// de siempre para todo lo de `crm/`, reexportando la ÚNICA copia.
export * from '../backend/src/meta-webhook.js'
