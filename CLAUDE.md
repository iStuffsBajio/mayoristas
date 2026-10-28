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

### El orden de la cola de revisión lo decidió el dueño, no el peso

La cola no se ordena por piezas paradas, se ordena por **lo que hay que hacer
con cada ficha**. La escalera vive en `PASO`, en `fichas.js`:

| | Paso | Qué es |
|---|---|---|
| 0 | borrar    | sin existencia en ninguna plaza: una respuesta y se ejecuta hoy |
| 1 | vivo      | se vende y bodega no lo tiene de alta: cuesta ventas cada semana |
| 2 | duplicado | dos códigos para un teléfono: reparte en dos todo lo que se cuente |
| 3 | decidir   | suelto en un solo mostrador: la prueba es más floja |
| 4 | anotar    | bodega los descontinuó: sólo guardar la nota |
| 5 | ignorar   | colores que bodega ya no surte |
| 6 | nombre    | orden y limpieza |

Ordenando por peso salía **al revés de lo que se contestó**: el lote de los 30
códigos sin existencia tiene 0 piezas y caía al último puesto, y el de los
colores que se mandaron ignorar tiene 53 y subía al primero.

Los pasos 4 y 5 son dos fichas, así que da igual que vayan al final: se
contestan de una vez. Lo que no puede quedar detrás son los casos vivos, que
son uno por uno y son los únicos que **no** se agrupan.

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

### En ventas la trampa es la misma, con dos pastillas

La barra de búsqueda por código de la sección de ventas **no mira la plaza ni
el rango** que estén puestos. La ficha se arma siempre con todas las plazas y
con el archivo por mes completo, porque desde «San Luis · 7 días» un código
que sólo se movió en León, o que vendió el mes pasado y este no, daría cero
teniendo el dato a la vista. El rango decide qué gráfica se dibuja; nunca si
el modelo aparece.

Y un código que existe y no se movió **no es «no encontrado»**: es «no salió
ni una pieza», que es un dato, y de los que más duelen. Se dicen distinto a
propósito, y cuando de verdad no hay nada se explica dónde sí está —el
archivo de movimiento sólo tiene los códigos que han bajado de existencia
alguna vez, no todo el catálogo—.

La regla vive en **`src/lib/buscarVentas.js`**, fuera del componente por lo
mismo que la otra, y está fijada en `buscarVentas.test.js`.

---

## ⚠️ VERIFICAR — Trampas que el compilador no ve

### Una función guardada en `useState` se ejecuta, no se guarda

React trata cualquier función que llegue a un setter como función de
actualización. Guardar un accesor de columna como estado hacía que React lo
llamara con `null` y **la página entera quedaba en blanco**.

Por eso `useOrdenTabla` guarda una **clave de texto** y la función va aparte.
No volver a guardar funciones en estado.

### Una imagen escondida a mano se queda escondida

`onError` que hace `style.visibility = 'hidden'` deja el estilo puesto en el
nodo. Si la llave de React no cambia, el nodo se reusa: la imagen buena carga,
`complete` es `true`, `naturalWidth` trae píxeles… y no se ve nada. Pasó dos
veces el mismo día —la funda de la portada y la de la sección de oficios—
porque en el primer dibujo todavía no hay índice, se pide por código y eso da
404.

La llave va por **archivo**, no por código, y siempre hay un `onLoad` que
devuelve la visibilidad.

### Un nodo marcado «visto» no se vuelve a mirar nunca

`entradas.js` marcaba cada `[data-entra]` con `dataset.visto` la primera vez
que lo observaba. Al reemplazarse el observador —al cambiar de pestaña, o en
desarrollo, donde React monta, desmonta y vuelve a montar— el viejo se
desconectaba y el nuevo no miraba nada, porque todo estaba «visto». Lo que no
hubiera entrado en pantalla se quedaba en **opacidad cero para siempre**: dos
de los tres puntos de la sección de oficios no los leyó nadie.

Se observa `[data-entra]:not(.dentro)` y se vuelve a observar siempre.
Observar dos veces el mismo nodo no cuesta nada.

### `--window-size` de Chrome NO fija el viewport

Pidiendo 390 el documento salía de **512** y la captura recortaba 390 de esos
512: todo lo que se juzgó así estaba mal medido, y un desbordamiento real
pasó por bueno. Para mirar de verdad hay que fijar
`Emulation.setDeviceMetricsOverride` por el protocolo de Chrome. Y por debajo
de unos 320px —un panel de vista previa estrecho, no un teléfono— cualquier
texto parte por palabras: eso no es un fallo del diseño.

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
administrador), recorre las pestañas y todas las secciones del panel, y pulsa
**todas las cabeceras ordenables** —las dos direcciones— no las primeras. La
caída de la pantalla en blanco se escapó porque la comprobación pulsaba
cuatro y la columna rota era la octava. Falla si el cuerpo se queda vacío o
si la consola suelta un error.

Hoy cubre: 3 sesiones · 11 pestañas · 10 secciones de panel · 29 cabeceras ·
12 hallazgos de la cola de revisión, **y los 4 lotes**. Si alguno de esos
números baja, algo dejó de pintarse.

También busca un código en la sección de ventas y comprueba que la **ficha se
dibuje** —con su renglón por plaza— y que un código inexistente lo diga en vez
de dejar el hueco en blanco, que se ve igual que un fallo. La regla en sí no se
comprueba aquí: eso es cosa de `buscarVentas.test.js`.

También comprueba que la cola va **en orden**: cada ficha lleva su sitio en
`data-paso` y el recorrido falla si uno sube detrás de otro más bajo. Es la
única forma de notarlo, porque reordenar la cola no cambia cuántos hallazgos
hay —cambia cuáles van primero— y eso no sale en ningún número.

Los lotes se cuentan aparte del total a propósito. Un lote es una pregunta
que ordena muchos códigos de golpe: si la agrupación se rompiera y la cola
volviera a preguntar código por código, el total de hallazgos **subiría**, no
bajaría, y la alarma no sonaría. Por eso `verificar` apunta el título de cada
lote que dibuja y falla si no son cuatro.

Y contestar va **al final** del recorrido. Contestar reordena la cola —lo
contestado se va al fondo— así que la ficha que sube al primer puesto ya no
se vuelve a ver. Haciéndolo en la primera, dos lotes enteros no los miraba
nadie y el número de hallazgos seguía siendo el mismo: lo que cambiaba era
CUÁLES.

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

## 🔒 CONFIRMAR — La portada del mayorista

Tres decisiones de negocio disfrazadas de interfaz. Ninguna se cambia sin
preguntar.

**«Todas» no se le enseña a un mayorista.** Sumar las tres tiendas manda a
alguien a la suya a por once piezas que están repartidas. La consulta sale
bien y el viaje sale mal, y la culpa es de la pantalla. Sin tienda elegida no
se enseña **ningún** número —tampoco un cero, que diría «no hay»—; el
consolidado queda sólo para quien tiene panel. La plaza elegida se recuerda en
`localStorage` bajo `istuffs_plaza`: quien consulta diez veces al día la elige
una vez.

**El inventario NO se publica cuatro veces al día.** Esa es la frecuencia con
la que corre la sincronización; si una tienda no cerró, no hay respaldo nuevo
y se vuelve a publicar lo de ayer. Por eso la portada enseña la fecha del
respaldo —`respaldo.fecha` del inventario, no `generado`— y avisa en ámbar a
partir de dos días. Con «Todas» puesto enseña el corte **más viejo** de las
tres: un consolidado vale lo que valga su dato más rancio. Decir «cuatro veces
al día» en cualquier texto de la página es mentir.

**Buscar vive del INVENTARIO, no del índice de fotos.** La lista de la que
sale el buscador son los productos dados de alta; la fotografía es un adorno
que se añade cuando existe. Al revés —que fue como nació— buscar «S26»
devolvía un solo renglón de los cuatro que hay: un modelo que no sale es un
modelo que no hay, y la página estaba escondiendo mercancía. Vive en
`src/lib/mockups.js`, con pruebas.

---

## ⚠️ VERIFICAR — Las fotos de producto, y por qué un emparejado falso es peor que ninguno

Las fotografías de las fundas viven en Dropbox —`MASCARAS 2027/MOKUPS`— y las
trae `node scripts/mockups/importar-mascaras.mjs`. Cuatro reglas que costaron
sangre:

**La marca manda sobre el parecido.** Emparejando por el nombre sin la marca,
el IPHONE 13 se llevó la foto del **Redmi 13**, el 11 la del **Xiaomi 11** y el
12 la del **Realme 12+**. Si los dos lados dicen de qué marca son y no
coinciden, no hay emparejado.

**Ni por contención.** El segundo intento aceptaba que una clave estuviera
dentro de la otra: el **IPHONE 6 PLUS** se llevó la del iPhone **16** Plus,
porque «6PLUS» está dentro de «16PLUS». Daba 40 emparejados y casi todos eran
mentira. Se eliminó entero. Una foto equivocada es peor que ninguna: enseña
con toda seguridad la funda que no es y nadie la revisa, porque la página se
ve perfecta.

**4G y 5G no son el mismo teléfono.** `clave()` —la de los PSD— los borra como
ruido, y con eso el REDMI NOTE 13 PRO 5G se llevaba la funda del 4G.

**Una imagen por FOTOGRAFÍA, no por código.** Los colores y acabados del mismo
teléfono son códigos distintos y comparten foto: un archivo por código ponía
`public/` en medio giga. El índice reparte. Y van en **WebP**: la misma foto
pesa 159 KB en PNG y 21 KB en WebP, con transparencia igual.

Cuando no hay foto del modelo exacto se presta la del pariente de la misma
gama y **se dice en pantalla** —«Foto de referencia: es del GALAXY S26»—.
Enseñarla callando sería enseñar algo que no es.

Hoy: **294 fotografías** cubren 821 códigos. Quedan **14 con el mockup viejo
del PSD**, encabezados por el iPhone 13, el 11 y el 12 —los tres más vendidos
de la casa, 1 177 piezas— porque de esos no hay fotografía en la carpeta.

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

**`UltimoMov` incluye los recuentos, y un recuento no es una venta.** Guarda
el último movimiento, y un ajuste de inventario es un movimiento. Medido el
2026-10-26: el día mediano toca **1 o 2** productos por plaza, pero
Aguascalientes tiene **208** con fecha 2026-03-11, Ferias **225** con
2026-01-03 y León **104** con 2025-12-20. Un cuarto del catálogo no se vende
el mismo día.

Contar esos días como venta rejuvenece lo que lleva años parado, que es justo
lo que hay que detectar: con ellos dentro, un modelo sin vender desde 2024
figuraba como vendido este año. `lotes.js` descarta los días que tocan 20
productos o más **en esa misma plaza** —el umbral se mide, no se copia— y lo
que queda es `ultimaVentaPorCodigo`. La clasificación de `anomalias.js` NO usa
esto: cambiarla movería qué códigos se dan por descontinuados.

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

- **`revisiones/` no es público y no puede serlo.** Las notas de la cola de
  revisión llevan nombres de empleados. La política del bucket sólo abre
  `inventarios/*` y `config/*`; esas respuestas las sirve el backend, igual
  que `personal/`. Cada quien escribe **sólo su propio archivo**
  (`revisiones/<quien>.json`) y al leer se juntan: con uno compartido, dos
  personas contestando a la vez se borrarían la respuesta sin avisar.
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
