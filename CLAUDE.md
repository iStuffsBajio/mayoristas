# Reglas de esta casa

Esto no es documentación de arquitectura. Es la lista de lo que **ya se rompió
al menos una vez**, por qué, y qué no se puede tocar sin preguntar antes.

La escribí después de romper la misma búsqueda tres veces seguidas. Cada
apartado de abajo costó una pantalla en blanco, un pedido mal calculado o una
tarde de depuración.

---

## Antes de tocar nada: el protocolo

Las cosas marcadas con **🔒 CONFIRMAR** no se cambian por iniciativa propia,
aunque parezca una mejora evidente. Se avisa primero, se explica qué cambia y
se espera respuesta. Son decisiones de negocio disfrazadas de código: el
número está donde está porque alguien lo decidió mirando sus ventas, no
porque fuera el valor bonito.

Las marcadas con **⚠️ VERIFICAR** sí se pueden cambiar, pero la comprobación
que acompaña es obligatoria. Sin ella no se publica.

---

## 🔒 CONFIRMAR — Reglas de negocio

Cambiar cualquiera de estos números cambia lo que se compra y lo que se manda
a las tiendas. Preguntar siempre.

| Constante | Dónde | Hoy | Qué decide |
|---|---|---|---|
| `MESES_ALTA` | `surtido.js` | `[11, 12]` | Qué meses son temporada alta |
| `COBERTURA` | `surtido.js` | `{baja:30, alta:60}` | Días que debe aguantar una tienda |
| `MESES_COBERTURA` | `compras.js` | `{normal:2, alta:3}` | Meses que debe aguantar bodega |
| `DIAS_PARA_DEPURAR` | `surtido.js` | `90` | Historial mínimo para proponer bajas |
| `DIAS_EN_CATALOGO` | `surtido.js` | `365` | A partir de cuándo «no vende» significa algo |
| `DIAS_RECIEN_LLEGADO` | `surtido.js` | `120` | Hasta cuándo un modelo es «nuevo» |
| `MESES_RECIENTES` | `compras.js` | `6` | Filtro de entrada a «Agotados que duelen» |
| `DIAS_SIN_COMPRAR` | `compras.js` | `60` | Cuándo la compra se considera detenida |
| `MARGEN_FERIA` | `surtido.js` | `0.3` | Cuánto se pide de más para una feria |
| `TOLERANCIA_MIN` | `personal.js` | `10` | Minutos de gracia antes de contar retardo |
| `HORARIOS` | `personal.js` | 10:30 / Torreón 10:00 | Hora de apertura por plaza |
| `CLASE_A` | `clases.js` | `5` | Piezas al mes desde las que un modelo es clase A |
| `CLASE_B` | `clases.js` | `2` | Y desde las que es clase B |
| `MAYOREO_MINIMO` | `precios.js` | `100` | Bajo este mayoreo no se vigila el precio |
| `DESVIACION` | `precios.js` | `0.15` | Desviación que se considera digna de mirar |

### Los cortes de clase se miden, no se copian

`CLASE_A` y `CLASE_B` salieron de mirar el catálogo real el 2026-10-24: 581
modelos con venta, 1,337 piezas al mes entre las cuatro tiendas.

|            | modelos | % de la venta |
|---|---|---|
| 5+ pz/mes  | 69      | **58%** |
| 2-5 pz/mes | 107     | 25% |
| 0-2 pz/mes | 405     | 18% |

El primer intento usó los números de manual —A: 20+, B: 5-20— y con esos
**todo el catálogo caía en clase C**: el modelo más vendido de la casa hace 22
piezas al mes y sólo 26 pasan de 10. La gráfica salía de un solo color.

Si el catálogo cambia de tamaño, se vuelven a medir. No se copian de ningún
sitio.

### Tres reglas que NO son números y pesan más

**Una funda no sirve para otro teléfono.** La demanda del Galaxy A06 no se
cubre comprando A07. La primera versión transfería la demanda a la generación
nueva y eso dejaba **136 códigos sin comprar, 125 de los cuales habían
vendido en los últimos seis meses** (1,720 piezas, con el iPhone 13 a la
cabeza). La generación anterior sirve **sólo para predecir** un modelo recién
llegado que no tiene historial, y **una sola hacia atrás**, no todas sumadas.

**La estadística de ferias no se usa para las tiendas.** Al revés sí. Ferias
cierra ocho meses al año y su temporada fuerte es enero; mezclarla deforma
cualquier promedio. Ya pasó: metía un factor de temporada de ×0.94 donde las
tiendas decían ×1.23.

**Los stickers no tienen inventario.** Bodega los imprime cuando hacen falta.
Un sticker en cero no es un agotado. Ver `produccion.js`.

**Las micas y el hidrogel no se comparan con las fundas.** Llevan su propio
control de venta y se reponen con otras reglas. Son **ocho códigos de 581**
—HDA, PV, MT, HDB, HDT, MTT, MU, HDR— pero el **8.3% de la venta**, y ocupan
**cuatro de los cinco primeros puestos** del ranking: mezclados, las fundas
que de verdad mueven el mostrador no aparecían por ningún lado.

El ranking pasó de encabezarlo cuatro micas a encabezarlo el Galaxy A07, que
es lo que había que ver. Ver `familias.js`.

Se identifican por CÓDIGO, igual que los de producción, con el nombre como red
de seguridad. El patrón acepta las erratas que hay en el catálogo de verdad:
**HIDRIOGEL** y **HODROGEL** conviven con HIDROGEL, y exigir que alguien
corrija el catálogo no es un plan.

---

## 🔒 CONFIRMAR — Buscar nunca respeta el filtro de existencia

Esto se rompió **tres veces**. Buscar es ir por un modelo concreto: si existe
tiene que aparecer, esté en el tramo de piezas que esté y sea de la marca que
sea.

Con el filtro «Urgente (1-3)» puesto, buscar `s23 ultra` en bodega devolvía
cero, cuando hay dos — con 34 y 4 piezas. El dato estaba bien y la respuesta
parecía mentira.

La regla vive en **`filtrarYBuscar()` en `src/lib/buscar.js`**, no dentro de
ningún componente, que es exactamente por lo que se rompía. Los dos
inventarios pasan por ahí. Está fijada con pruebas en `buscar.test.js`:
si alguien vuelve a atarla al filtro, `npm test` falla.

---

## ⚠️ VERIFICAR — Trampas que el compilador no ve

### Una función guardada en `useState` se ejecuta, no se guarda

React trata cualquier función que llegue a un setter como función de
actualización. Guardar un accesor de columna como estado hacía que React lo
llamara con `null` y **la página entera quedaba en blanco**.

Por eso `useOrdenTabla` guarda una **clave de texto** y la función va aparte.
No volver a guardar funciones en estado.

### Un import que falta compila igual

Vite no falla si usas un identificador que no importaste: lo deja como
variable global y revienta en el navegador. Ya pasó dos veces —`LogoutIcon` y
`coincideCon`— y la segunda compiló sin una queja.

**Compilar no es verificar.** Hay que ejecutar el paquete.

### Verificación obligatoria antes de publicar

```bash
npm test                      # reglas de negocio y búsqueda
cd backend && npm test        # 19 pruebas del backend
npm run build
npm run verificar             # ejecuta el paquete en jsdom
```

`npm run verificar` corre `scripts/verificar-panel.mjs`, que levanta el
paquete YA CONSTRUIDO con **las tres sesiones** (sin sesión, sucursal,
administrador), recorre las pestañas y las seis secciones del panel, y pulsa
**todas las cabeceras ordenables** —las dos direcciones— no las primeras. La
caída de la pantalla en blanco se escapó porque la comprobación pulsaba
cuatro y la columna rota era la octava. Falla si el cuerpo se queda vacío o
si la consola suelta un error.

Hoy cubre: 3 sesiones · 10 pestañas · 8 secciones de admin · 22 cabeceras ·
3 hallazgos de la cola de revisión. Si alguno de esos números baja, algo dejó
de pintarse.

Tres cosas que hacen falta para que la comprobación sea de verdad:

- **Los datos de mentira tienen que tener la forma exacta.** `dias` en
  estadísticas es una LISTA de `{ f, m }`, no un número, y `periodos` otra de
  `{ p, m, dias }`. Un número donde iba una lista tumbó el panel entero.
- **Los datos de mentira no pueden ser iguales en las cinco plazas.** La cola
  de revisión sale de comparar unas con otras: dándoles el mismo inventario
  salía vacía, y una cola vacía no pinta ninguna ficha —ni tabla, ni botones,
  ni avance—. La sección pasaba en verde sin haber comprobado nada. Por eso
  `inventarioDe()` le quita códigos a bodega y le cambia una palabra; y por
  eso ninguno de los que quita puede ser de los SAMSUNG: con dos códigos el
  patrón de escritura baja del mínimo y esa ficha deja de dibujarse sola.
- **Una cabecera ordenable se reconoce por `aria-sort`**, no por el cursor:
  el cursor sale del CSS y jsdom no maqueta. Toda columna ordenable nueva
  tiene que llevarlo, o la comprobación la salta en silencio.

**jsdom NO aplica la política de seguridad de contenido.** Un guion en línea
bloqueado en el navegador aquí corre tan campante; eso fue lo que dejó la
página de mockups en «cargando…». Esta comprobación no sustituye mirar la
página servida.

La sesión va en `sessionStorage` bajo `istuffs_session`, con forma
`{ isAdmin, branch, token }`. Para escribir en un campo controlado por React
hace falta `input._valueTracker.setValue('')` antes, o el cambio no llega.

---

## ⚠️ VERIFICAR — Los mockups salen de los PSD, y los PSD mienten

Las 83 imágenes de `public/mockups/` se componen de los PSD propios con
`node scripts/mockups/generar-web.mjs`. Tres cosas que ya salieron mal:

**Elegir UNA capa no funciona.** La capa «Editar color case» mide lo mismo
que la funda y está más llena, así que quedarse con la mayor devolvía un
rectángulo blanco liso. Se apilan todas las que no son adorno.

**A veces la funda ESTÁ en una capa con nombre de foto.** El filtro descarta
las capas llamadas `20240403_135357` y parecidas porque suelen ser recortes
que quedaron en el archivo. En diez PSD esa capa era la funda —una fotografía
real del producto— y descartarla dejaba una silueta blanca sin contorno ni
cámara. Ahora, si la composición sale en blanco, se reintenta con
`fundaDe(psd, { conFotos: true })` y se queda con el segundo intento sólo si
trae algo. **El reintento se pide únicamente cuando el primero falló**: si se
activa siempre, estropea los setenta y tres que ya salían bien.

**Lo que salga en blanco se marca, no se enseña.** `indice.json` lleva
`vacio: true` en esos casos y las dos secciones de la página los saltan. La
medición se hace ANTES de dibujar la cámara simulada; después, el módulo
aporta sus propios píxeles oscuros y una silueta en blanco deja de parecerlo.

Quedan **2 en blanco** (XRN13PT, HX7CT), **2 rechazados** porque el PSD es una
plantilla de corte (SGS25UT, SGS25U3) y **7 sin PSD**.

---

## ⚠️ VERIFICAR — Los precios de bodega NO sirven

Eleventa guarda 27 columnas por producto; durante meses se extraían cinco.
Ahora también salen `PVENTA`, `MAYOREO`, `PCOSTO` y `DINVMINIMO`.

**Bodega no mantiene precios porque bodega no vende.** Ahí el iPhone 15 figura
con precio igual al costo —36.00 contra 36.00, margen −13.8%— y un «mayoreo»
de 214.14, que es 5.95 veces el costo, la misma proporción exacta en todas las
fundas. Es basura heredada.

Los precios buenos están en las plazas que venden. En Aguascalientes el mismo
iPhone 15 es **costo $55, público $250, mayoreo $150**.

`promedioEntrePlazas()` excluye bodega por defecto. **Si alguien la mete, todo
lo que se valore en pesos saldrá mal.**

**El IVA no se maneja igual en cada plaza.** En bodega `PFINAL = PVENTA × 1.16`;
en Aguascalientes `PFINAL = PVENTA`. Por eso el precio se guarda tal cual viene
y no se le aplica ningún impuesto por nuestra cuenta.

**Un cero es «sin capturar», no «gratis».** Por eso los campos se omiten del
JSON cuando valen cero, en vez de publicar un cero que alguien sume.

**La desviación se mide contra la MEDIANA, no contra el promedio.** Con León a
$200, San Luis a $200 y Aguascalientes a $100, el promedio es $167 y salían las
tres plazas desviadas: el que se sale arrastra la referencia y ensucia a los
que están bien. Con la mediana sólo salta Aguascalientes.

**El umbral de $100 va sobre el MAYOREO, no sobre el costo.** Todo el catálogo
cuesta entre $55 y $60, así que un umbral de $100 por costo dejaba fuera
absolutamente todo.

**`USA_INVENTARIO` no sirve para detectar lo que se produce.** Viene en `t`
para todo, incluido el STIKER DISEÑO. `produccion.js` sigue haciendo falta.

---

## ⚠️ VERIFICAR — El Excel

`xlsx-js-style` **descarta en silencio** las funciones de pago: paneles
congelados y reglas de formato condicional. Se probó con las dos. Por eso el
semáforo de «Días agotado» tiene el color calculado al generar.

Un libro corrupto se abre sin quejarse con la misma librería que lo escribió.
Verificar así:

1. Descomprimir el `.xlsx` y revisar que el XML tenga `<dimension ref>` válido
   y ningún `NaN` ni `undefined`.
2. Abrirlo con Excel de verdad vía COM y confirmar que no pide reparación.

---

## ⚠️ VERIFICAR — Los datos de Eleventa mienten de formas concretas

**`Alta` no es la fecha de entrada.** Es el primer movimiento que queda en el
historial, y el historial de cada plaza arranca un día concreto: en León 579
de 647 productos comparten el 2025-12-20. Esa fecha dice cuándo empieza lo que
se puede ver, no cuándo llegó el modelo. Sirve como **edad mínima** («antes
de…»), nunca como prueba de que algo es reciente.

**`CANTIDAD` es lo vendido.** No restar `CANTIDAD_ANTERIOR`: daba 71 piezas
por línea de venta.

**Firebird 2.0:** sin `DATEADD`, sin agregados en `GROUP BY`, sin `ORDER BY`
por número de columna con agregados. `EXTRACT` rellena con espacios, así que
los meses ≥10 salían como `2024- 10`. Charset `NONE`: decodificar como latin1.
En Linux el prefijo `localhost:`. `gbak` necesita 64 MB de búfer.

**Cada plaza lleva medidos distintos días.** León 209, Aguascalientes 302. No
sumar piezas de todas y dividir entre el calendario más largo: eso dejaba el
ritmo del conjunto **18% por debajo**. Se suman los ritmos de cada plaza.

**La ventana reciente incluye el mes en curso, que va a medias.** Dividir
entre 61 días fijos la subestimaba **51%**. Hay que usar los días realmente
medidos, que `demandaDe` devuelve.

**León no aporta nada a la referencia de compra** (su historial empieza en
enero 2026, la referencia es oct–dic 2025) y es el **52% de la venta**.
Contarlo como cero calculaba la compra a la mitad. Se estima con su propio
ritmo corregido por temporada. Ferias **no** se estima: no tiene diciembre en
ningún año porque no abre.

---

## ⚠️ VERIFICAR — Despliegue

- **Nunca** poner un secreto en una variable `VITE_*`. Vite las incrusta en el
  JavaScript público. Así estuvieron meses la llave de AWS, el secreto de
  Dropbox y las cinco contraseñas.
- Amplify sólo tiene tres variables: `VITE_API_URL`, `VITE_S3_BUCKET`,
  `VITE_S3_REGION`. Las dos últimas no son secretos.
- `index.html` va con `no-store` (`customHttp.yml`). Sin eso, tras un
  despliegue el navegador pide un `.js` que ya no existe y la página sale en
  blanco.
- Comprobar sobre el archivo **en vivo**, no sobre la copia local: bajar el
  bundle que sirve la página y confirmar que es el mismo que se verificó.

---

## Lo que está roto a sabiendas

- **La galería de Dropbox.** Las carpetas configuradas
  (`.../CATALOGOS/Fundas` y `/Personalizados`) **no existen**. Lleva roto
  desde antes y el código viejo se tragaba el error. Falta que el dueño diga
  dónde están esas imágenes.
- **Los turnos ya no se congelan.** El paso «Extraer turnos del personal»
  entró en la corrida de GitHub Actions y `personal/turnos.json` se publica
  solo. Comprobado el 2026-10-19.
- **Las cinco contraseñas sin rotar.** León, San Luis, Aguascalientes, Torreón
  y administrador siguen siendo las que estuvieron publicadas en el
  JavaScript. Se cambian con `backend/scripts/generar-credenciales.js` y las
  variables de la Lambda; de paso hay que cambiar `SESION_SECRETO`, que tira
  cualquier sesión abierta. **Es lo último que queda de la fuga.**
- **La llave de AWS vieja, inactiva pero sin borrar.** `AKIA…(la vieja, ver consola IAM)`.
  Desactivada el 2026-10-19; borrarla pasados unos días.
- **La cuenta raíz ya no tiene claves de acceso.** El CLI va con
  `istuffs-admin`. Si alguna vez `aws sts get-caller-identity` devuelve algo
  que acabe en `:root`, algo se ha rehecho mal: una clave de root se salta el
  MFA de la cuenta.

### Lo que YA se rotó (2026-10-19)

La llave de S3 y el token de Dropbox. Ninguno de los dos sirve ya. El detalle
y el orden están en `SEGURIDAD.md`; lo que hay que recordar aquí es la regla:

**Ningún secreto lleva el prefijo `VITE_`.** Vite incrusta en el JavaScript
público toda variable que empiece así, y por eso estuvieron meses a la vista
la llave de AWS, el secreto de Dropbox y las cinco contraseñas. Sólo
`VITE_S3_BUCKET` y `VITE_S3_REGION` lo llevan, y no son secretos. Si un script
nuevo necesita una credencial, el nombre va **sin prefijo**.
