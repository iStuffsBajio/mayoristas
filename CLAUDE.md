@AGENTS.md

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
| `MESES_ALTA` | `surtido.js` | `[1, 11, 12]` | Qué meses son temporada alta |
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
| `DESVIACION` | `precios.js` | `0.15` | Desviación entre plazas digna de mirar |
| `BRECHA` | `precioCobrado.js` | `0.20` | Cuánto puede apartarse lo cobrado de la lista |
| `PIEZAS_MINIMAS` | `precioCobrado.js` | `3` | Piezas para que un código entre en esa cuenta |
| `DIAS_PARA_DAR_DE_ALTA` | `surtidos.js` | `4` | Gracia antes de reclamar el alta de un surtido |
| `TOLERANCIA` | `surtidos.js` | `0` | Piezas de diferencia que se dejan pasar |
| `INICIO_HISTORIAL` | `caja.js` | `2026-11-02` | Desde cuándo cuenta el flujo de efectivo |
| `DIAS_MINIMOS_PARA_BAJA` | `depuracion.js` y `backend/src/bajas.js` | `365` | El PISO para dar de baja un código: sin venta y con esa antigüedad. No existe un valor menor |
| `DIAS_CATEGORIA_SIN_MOVIMIENTO` | `depuracion.js` | `730` | Dos años sin movimiento para dar de baja una marca o departamento entero |
| `DIAS_SIN_ROTACION` | `depuracion.js` | `365` | Un año sin vender, con piezas, para la lista de «Sin rotación» |
| `PRECIO_DE_ETIQUETA` | `ventasTicket.js` | `0.01` | Lo cobrado a $0.01 es del esquema de mayoristas, no una pieza vendida |

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

### La clase se oxida: lo que ya no vende baja de escalón

`ritmoPorModelo` promedia TODO el historial, así que un modelo que vendió
mucho en diciembre y nada desde entonces seguía figurando como clase A: se le
reservaba sitio en bodega, se le surtía con prioridad y encabezaba las
alarmas por una venta que ya no existe.

Ahora baja **un escalón por cada tramo sin vender en ninguna plaza** —90 días
uno, 180 dos— y nunca por debajo de C. Es una escalera y no un recálculo a
propósito: la clase tiene que significar lo mismo en todas las pantallas, y
bajando de a poco un mes flojo no desploma un modelo a C.

Medido al estrenarla: bajaron 13 modelos, **6 de ellos de clase A**. Cinco
eran códigos duplicados con sufijo aleatorio —`PV-zuErp…`, `HDA-sPmqF…`— cuya
última venta fue en **2023**, y pesaban como clase A por el promedio de todo
el historial.

La última venta sale del acumulado por mes, **nunca de `UltimoMov`**: ese
campo cuenta los recuentos como movimiento y un ajuste de inventario
rejuvenecería un modelo parado desde hace dos años.

### Qué reponer antes de que se agote, y de dónde

Pedir al proveedor tarda **40 días**; al nacional —la competencia— **4**, con
menos margen. Con esos dos relojes la pantalla dice lo que antes se decidía
de memoria: si a la red le quedan menos de 40 días de venta y bodega no
tiene, el pedido normal NO LLEGA.

Los días que debe aguantar cada clase, que puso el dueño:

| | A | B | C |
|---|---|---|---|
| Tienda, temporada baja | 30 | 25 | 20 |
| Tienda, temporada alta | 60 | 45 | 30 |
| Bodega | **80** (2× el pedido) | 60 | 40 |

Vive en `reservas.js`. Y el ritmo con el que se calcula **no** es el promedio
de todo el historial: es el ponderado de `ritmo.js` —50% las últimas cuatro
semanas, 30% las anteriores, 20% las de antes—. El promedio plano fue la
causa de que se agotaran modelos recién surtidos: medido, 30 clase A iban a
×1.5 o más de su ritmo histórico y 42 a la mitad o menos.

Lo que todavía NO se puede medir es **cuántas veces se ha agotado** cada
modelo, que es lo que pide el excedente anti-quiebre: hace falta el historial
de existencias, y eso sólo sale de la tabla de movimientos de Eleventa.
**Los días en cero ya se miden** (abajo); el número de quiebres se sacaría
del mismo kárdex, pero todavía no se cuenta.

### 🔒 Una venta baja con el mostrador vacío no es poca demanda

Lo preguntó el dueño el 2026-11-09 mirando el HONOR X8D en «Pedir», que le
pedía una o dos piezas: «quiero saber si eso se debe a que estaba agotado o si
realmente es un número confiable».

Toda la cuenta de «Pedir» sale de lo VENDIDO, y lo que no está en el mostrador
no se vende. Un modelo agotado tres semanas sale con ritmo bajo, se le pide
poco, se vuelve a agotar, y la cuenta se confirma a sí misma. Es venta
**censurada**, no demanda baja.

**De dónde sale.** `INVENTARIO_HISTORIAL` guarda en cada movimiento la
existencia de JUSTO ANTES (`CANTIDAD_ANTERIOR`). No hay «después», y deducirlo
obliga a saber si cada movimiento suma o resta. No hace falta: **la existencia
entre un movimiento y el siguiente es la anterior del siguiente**, y del
último hasta hoy, la de hoy. Lo calcula `diasEnCero()` en `agotados.js`, con
pruebas; lo extrae `extraer-ventas-linea.js`, que ya restaura el respaldo de
cada plaza —una restauración más costaría minutos por plaza en cada corrida—,
y va en su propio `try/catch`: si falla, la venta sale igual.

**Se publica en `inventarios/<plaza>/agotados.json`, PÚBLICO, a propósito.**
Sólo lleva código y días, ningún nombre, y quien más lo necesita es bodega,
que no puede leer `ventas/`. Se saca del objeto de ventas ANTES de escribir
nada —también en `--dry-run`—: en un archivo privado no tiene nada que hacer.

Tres cosas que no hay que deshacer:

- **Un modelo nuevo se cuenta desde su `Alta`.** Antes de llegar no estaba
  agotado: no existía. Contado desde el principio de la ventana, cada novedad
  saldría «agotada» casi entera.
- **La fecha sola se lee como medianoche LOCAL** (`momento()`). Mezclando
  `'2026-10-21'` —UTC— con `'2026-10-21 00:00'` —local—, seis horas fantasma
  contaban como «en cero». La prueba lo cazó.
- **La ficha no estima.** Mira 30 o 60 días y esto mide 90 (`DIAS_AGOTADOS`);
  estimar con las ventas de una ventana y los días en cero de otra da un
  número con cara de cuenta que no lo es. Dice el hecho y lo que significa.

`PARTE_QUE_CENSURA` es **0.25** —una semana de cada cuatro sin mercancía— y
es criterio, no medida: un día suelto en cero pasa siempre entre que se vacía
y llega la caja, y avisar por eso haría que el aviso dejara de leerse.

🔒 **Se MARCA, no se corrige.** «Pedir por venta» y «Comprar» llevan ⚠ en el
ritmo y en la venta, pero la cantidad sigue saliendo de la misma cuenta.
Subirla con el ritmo de los días con mercancía es decisión del dueño, y está
PREGUNTADA, no decidida.

Medido en Aguascalientes con el respaldo del 2026-11-08: **169 códigos**
estuvieron en cero algún día de los últimos 90; **31 de los que hoy salen en
«Pedir por venta»** llevan la marca. Y la respuesta al X8D: en Aguascalientes
estuvo en cero **0.7 de 86 días** y no vendió ni una —su número bajo es de
fiar: es poca demanda—.

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

La escalera está escrita **dos veces a la fuerza**: `PASO` en `fichas.js` y
`ORDEN_PASO` en `incidencias.js`. No se puede compartir porque un hallazgo
puede llegar sin `orden` —los de prueba, y los que vienen de un registro viejo
sin ficha— y entonces no habría con qué ordenarlo. Las dos tienen que decir lo
mismo y **hay prueba que falla si se separan**: sin ella, añadir un paso en un
sitio dejaría la bandeja ordenando por una escalera que ya no es la del dueño,
y eso no se nota —sigue habiendo las mismas incidencias—.

En la bandeja, lo **vencido** y el **estado** van por encima de la escalera, y
eso es a propósito: un plazo pasado y un caso que nadie ha mirado son hechos
del trabajo, no un reordenamiento de la prioridad del negocio. Dentro de un
mismo estado manda `PASO`.

### La pestaña de Revisar es una BANDEJA, y la cola vieja se quitó

Antes era un recorrido de una ficha cada vez. Funcionaba, y por eso la primera
vez se dejó puesta debajo de la bandeja nueva. **Eso fue un error**, y el dueño
lo dijo con todas las letras: la instrucción era «reconstruye y rediseña la
manera de operar», no añadir una capa encima. Dejándola debajo, la forma de
operar no cambiaba, que era justo la queja.

Las dos razones que dio, que son con las que se mide si esto sirve:

1. **«No se guardaban registros de los movimientos.»** Sólo quedaba el último
   estado de cada caso. No había forma de saber quién lo movió, cuándo, ni
   cuántas veces había vuelto: la pantalla enseñaba una foto y no una película.
2. **«El llenado era muy obsoleto, era muy tedioso.»** Abrir la ficha, leer,
   pulsar, escribir el motivo a mano, pasar a la siguiente. Ciento doce veces.
   El objetivo que puso no es que funcione: es que **cualquiera lo haga el
   doble de rápido y le resulte intuitivo**.

**El historial lo escribe el BACKEND, no el navegador.** El autor y la hora los
pone el servidor con la sesión en la mano. Dejándoselo al cliente, cualquiera
podría mandar un historial con el nombre de otro, y un registro que se puede
escribir a gusto no prueba nada. Sólo se apunta renglón cuando algo **cambia**:
volver a pulsar Guardar sin tocar nada llenaría el historial de renglones
iguales, que es la otra forma de no tener registro.

**La nota y los comentarios son cosas distintas y no se pisan.** La nota es la
razón oficial de la decisión; el comentario es lo que se dicen entre quienes
trabajan el caso. Mezclándolos, apuntar algo borraría la razón.

**Los motivos son lista cerrada**, como los estados. Dos ventajas y las dos
hacían falta: se eligen en un gesto en vez de escribirse, y «se corrigió», «ya
se corrigió» y «corregido» dejan de ser tres motivos distintos cuando hay que
contarlos en la pantalla de causas.

Lo que **no** se tiró fue la información. Todo lo que enseñaba la ficha —lo que
se sabe, la tabla, los códigos, qué pasa si sí y si no, las otras fundas del
mismo teléfono— es la EVIDENCIA, y una decisión sin la evidencia delante es la
que se contesta mal. Vive en el panel de detalle, al lado de la lista. Lo que
se quitó fue la obligación de pasar por ella de una en una.

#### La configuración va en el mismo archivo y NO es una incidencia

Las excepciones y el catálogo de códigos de error se guardan en
`revisiones/<quien>.json`, que es el único archivo por persona que ya se junta
al leer. Llevan el prefijo **`cfg|`** y `conciliar` las salta.

Hace falta saltarlas: `conciliar` convierte todo registro **sin hallazgo** en
una CERRADA —ésa es la verificación automática— así que cada excepción y cada
entrada del catálogo salía en la bandeja como una **cerrada fantasma** y
contaba en el encabezado. Una excepción no es un caso resuelto.

**Revocar una excepción la BORRA, no la marca.** Una revocada que se quedara en
el archivo seguiría tapando la alerta mientras la pantalla la enseña como
retirada: el peor de los dos mundos, porque nadie volvería a mirarla.

Y una excepción **sin fecha de caducidad se permite pero se lista**: una alerta
apagada para siempre que nadie recuerda haber apagado es exactamente lo que
esto existe para evitar.

#### Las ocurrencias salen del historial, no de un contador

Un contador hay que acordarse de subirlo. Cada vez que un caso se dio por
cerrado y el respaldo lo volvió a producir queda un renglón de CONFLICTO, y eso
**es** «ha vuelto». Se cuentan de ahí.

#### La salud se mide sobre el catálogo de cada plaza

Veinte casos en una plaza de 800 códigos y veinte en una de 100 no son lo
mismo, y contándolos a secas se ven iguales.

#### El mensaje para la sucursal se genera, no se escribe

Catorce códigos con su nombre y lo que hay que hacer con cada uno es media hora
de teclear, y media hora de teclear **no ocurre nunca**. Sale con lo que hay que
HACER —`siHacer`, o el catálogo si la ficha no lo trae—, nunca con el nombre
interno de la regla, que a la tienda no le dice nada. Y nunca promete un plazo
que nadie fijó. Con cero casos abiertos sale **vacío**: mandarle a una tienda
que mire una pantalla donde no hay nada suyo hace que la siguiente ya no la
mire.

#### Y 760px era la medida de la cola, no de la bandeja

`.revisar` estaba a `max-width: 760px`, que es una columna de lectura. Con la
lista y el panel de detalle a la vez, eso deja dos columnas de 380 donde un
título de dos palabras parte en tres renglones. Está en **1180px**, y por
debajo de 900px las dos columnas **se apilan con el panel arriba**: si no,
abrir un caso obliga a bajar por delante de los sesenta renglones para verlo.
Eso no lo caza `verificar` —jsdom no maqueta— lo cazó abrir la página.

---

## 🔒 CONFIRMAR — El registro de surtidos se comprueba con el respaldo

Lo que sale de bodega a cada tienda deja folio. Antes no dejaba nada: se
mandaba la caja con su lista y se confiaba. Si llegan 8 de las 10 que salieron
**nadie se entera nunca**, porque la tienda da de alta 8, bodega descontó 10, y
las dos cuentas parecen correctas cada una por su lado.

| Constante | Dónde | Hoy | Qué decide |
|---|---|---|---|
| `DIAS_PARA_DAR_DE_ALTA` | `surtidos.js` | `4` | Gracia antes de reclamar el alta |
| `TOLERANCIA` | `surtidos.js` | `0` | Piezas de diferencia que se dejan pasar |

Los 4 días los puso el dueño: «por lo general puede tardar 4 días máximo».
Pasados, **no es que falte mercancía**: es que nadie la ha dado de alta, que es
otro problema y se dice distinto —`tarde`, no `diferencia`—. Dar un folio sin
alta por mercancía perdida mandaría a buscar cajas que están en su sitio.

Y la tolerancia es **cero**, que conviene que siga siéndolo: una tolerancia «de
una pieza o dos» es exactamente del tamaño de lo que se pierde de verdad, y la
volvería invisible justo en el caso que esto existe para detectar.

### Nadie cuenta a mano: el conteo es el alta de su propio Eleventa

No hay conteo a ciegas ni captura de recepción. El conteo ya existe y es mejor
que cualquiera que se teclee: el **alta** que la tienda hace en su caja, que
aparece en el respaldo siguiente. Lo decidió el dueño así y tiene dos ventajas
—no añade trabajo a la tienda, y el número no lo escribe nadie que pueda
equivocarse al escribirlo—.

### El folio se abre AL SALIR, y esto no es negociable

Para saber cuánto entró hay que saber cuánto había antes, y el «antes» sólo
existe mientras todavía es antes. Los respaldos por fecha **se quitaron a
propósito** —crecían 44 MB al año— y sólo queda `anterior.json`, UN paso atrás:
no se puede mirar cuatro días hacia atrás.

Por eso el folio **se guarda su propio antes**: al registrar la salida se
congela la existencia de cada código en la plaza de destino, y sólo de esos
códigos. Guardar el inventario entero por folio sería repetir el error de los
44 MB.

Si alguien cambia esto para que bodega registre *después* de la confirmación,
el folio deja de comprobar nada: el alta ya ocurrió y no hay contra qué
comparar.

### La trampa que hace falsas todas las cuentas: la tienda vende mientras recibe

    entraron = (existencia_después − existencia_antes) + lo_que_se_vendió

Sin el término de la venta, un modelo que recibió 10 y vendió 3 parece haber
recibido 7, y el folio acusaría de 3 piezas que están en una bolsa de cliente.
Por eso la pestaña de Surtido baja también `estadisticas.json` de cada plaza,
que antes no pedía. Cuando ese archivo falta, **la fila lo confiesa** en vez de
callarlo: una cuenta sin el término de venta no se puede leer como buena.

Un folio **cerrado** no se reescribe: ni sus líneas ni su «antes». Uno editable
después del alta no comprobaría nada, porque se podría ajustar hasta que cuadre.

El permiso va por **capacidad** (`PUEDE_SURTIR`), no atado a `admin`: el
usuario del encargado de bodega está pendiente y cuando exista lo hereda sin
tocar ninguna ruta.

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

### Una barra centrada que desborda esconde su principio

`justify-content: center` con `overflow-x: auto` recorta por los dos lados, y
a la parte de la IZQUIERDA no se llega ni arrastrando: `scrollLeft` no puede
ser negativo. En el menú del panel desaparecieron **Dashboard y Ventas** -las
dos primeras- y la sección parecía borrada. Con la barra de desplazamiento
escondida, además, nada indicaba que hubiera más.

Se centra con **márgenes automáticos** en el primer y el último hijo: centra
cuando cabe todo y se anula solo cuando no.

### `npm run preview` no puede leer el bucket

El CORS del bucket abre `http://localhost:5173` -el servidor de desarrollo- y
`https://istuffsbajio.com`, y nada más. En `npm run preview`, que sirve en el
**4173**, todas las peticiones a S3 fallan con «Failed to fetch» y el panel se
pinta entero diciendo «no tiene inventario publicado».

No es un fallo del código: es que esa puerta no está abierta. Para mirar
pantallas que dependen de datos, **el servidor de desarrollo**. Y si alguna
vez hace falta revisar la compilación de verdad en local, hay que añadir el
4173 al CORS del bucket, no pelearse con el código.

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
cd backend && npm test        # el backend, con la paridad del candado de bajas
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

También comprueba la sección de **modelos nuevos** de la pestaña de Ventas:
que estén las dos ediciones y la comparación entre ellas, los tres montones
—venden, ni una pieza, muy nuevos—, el ritmo en pz/mes, y que cambiar de
edición cambie la lista de verdad. Por eso las fechas de alta de los datos de
mentira van **en dos lotes** y relativas a hoy: con diez fechas sueltas cada
una sería su propio grupo, ninguno llegaría al mínimo de tres y la sección
caería al respaldo del goteo, sin segunda edición que comparar. El primer lote
se reparte en varios días a propósito, y lleva dentro uno de 25 días que
todavía no se puede juzgar: así se ejercita «muy nuevos» y de paso se comprueba
que una tanda partida en días NO salga como dos ediciones.

Hoy cubre: 4 sesiones · 15 pestañas · 18 secciones de panel · 145 cabeceras ·
**el corte semanal** con la tienda —sin tolerancia, guardando los tres colores,
sin ver nombres de otra plaza, con sus reglas de mayoreo y sus cobros sin
referencia— y con el administrador —todas, Torreón con su ciclo, la comisión y
el sueldo sin nombre, asignar el fondo y contar por una plaza—; además
comprueba lo que RECIBE la tienda, no sólo lo que se pinta: una pantalla que no
dibuja la columna del cajero escondía una fuga que seguía en los datos ·
12 incidencias de la bandeja de revisión —con **las dos sesiones que la
trabajan**, administrador y bodega, porque bodega escribe en ella igual y
comprobarla sólo con admin dejaba fuera justo la sesión a la que ya se le
perdió el trabajo una vez—, **los 4 lotes**, la bandeja de costos y
**las 5 plazas del flujo de efectivo** —tres de ellas por dentro, porque desde
que el historial arranca en ceros sólo hay una semana a la vista y las cuatro
ramas (con control, sin control, marcado, sin marcar) ya no caben en una sola
plaza—, y **«Consultar modelo» de bodega** con la lectura de venta censurada
en sus tres casos —León censurada, Aguascalientes de fiar, San Luis sin
archivo—, más la marca ⚠ en «Pedir», y **«Depurar»** con sus dos estados
reales: Torreón sin inventario (todo bloqueado, con el motivo a la vista) y
Torreón publicado (elegir, confirmar y dar de baja), más que marcar un modelo
como descontinuado lo saque de Revisar Y que al quitar la marca vuelva. Si alguno de esos números baja, algo
dejó de pintarse.

**Y para escribir en un campo controlado por React, el rastreador se siembra
con algo DISTINTO de lo que se va a escribir.** `escribir()` lo sembraba
siempre con `''`, así que BORRAR un campo no llegaba nunca: React comparaba
`''` contra `''` y descartaba el evento. Eso hacía parecer que un botón de
guardar seguía habilitado con el campo vacío —una regla rota que no lo
estaba— y dejaba sin comprobar todas las del tipo «vaciar deshabilita».

También busca un código en la sección de ventas y comprueba que la **ficha se
dibuje** —con su renglón por plaza— y que un código inexistente lo diga en vez
de dejar el hueco en blanco, que se ve igual que un fallo. La regla en sí no se
comprueba aquí: eso es cosa de `buscarVentas.test.js`.

Comprueba también que la **lista de folios de surtido** se dibuje, con sus
**dos caminos**: uno que cuadra y uno con diferencia. Con un solo folio de
mentira la mitad del componente no se ejecuta, porque el que cuadra no
despliega líneas y el que no, las despliega —y esas líneas son el único dato
por el que esto existe—. Tres cosas que costaron una vuelta cada una:

- **La fecha de los folios de mentira es la de HOY, no una fija.** El cuadre
  descuenta lo que la plaza vendió desde que salió la caja; con una fecha de
  octubre la ventana se tragaba todos los días de venta falsos, «entraron»
  salía enorme y los dos folios caían en «diferencia». Es la misma trampa que
  la sección existe para medir.
- **Las existencias se leen del arreglo `productos`, no se suponen.** Elegir un
  código «que suene» —`SGS23UT`, que está en cero— daba un folio con 24 piezas
  faltantes y otra vez los dos en «diferencia».
- **Que un botón diga «Surtido» no significa estar en Surtido.** El aviso del
  dashboard «Ver los 30 en Surtido» también lo dice, y pulsarlo dejaba la
  pantalla en Diseño: la comprobación fallaba sin que nada estuviera roto. El
  ancla es el botón del Excel, que sólo dibuja esa pestaña.

Y comprueba que la bandeja de **«Costos que faltan en bodega»** se dibuje, con
su botón de bajar el Excel, y que la frase de la utilidad diga de cuántos
modelos habla. Por eso el inventario de mentira de bodega lleva `Costo` en
todos menos **dos**: con costo en todos la bandeja no se pinta y no se
ejercita; sin costo en ninguno la utilidad y «Dinero parado» salen en blanco y
la sección pasaría en verde sin haber valorado nada. Lo que falla aquí es que
la sección deje de pintarse —una cifra incompleta que no se anuncia es peor que
ninguna—; que el cálculo sea correcto es cosa de `radiografia.test.js`.

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

### Y `verificar` no sustituye MIRAR: `node scripts/mirar-panel.mjs`

jsdom no maqueta. `verificar` comprueba que las cosas se dibujen y que las
reglas se cumplan —y eso es mucho— pero no ve si algo se encima, si una lista
es ilegible, o si la consola está llena de avisos.

La primera vez que se corrió `mirar-panel.mjs`, en **una sola pasada**,
encontró tres cosas que `verificar` daba por buenas:

- El desglose por clase decía «99 agotados · A 0 · B 2 · C 32». Treinta y
  cuatro de noventa y nueve: faltaban los 65 **sin clase**, y un desglose que
  no suma se lee como un error de la página.
- La bandeja de incidencias enseñaba **diecisiete renglones con la misma
  frase**, sin código ni plaza. Se dibujaba perfecta y no se podía usar.
- Cada cabecera numerica soltaba un aviso de React en consola, porque `num`
  caía en el `...resto` y acababa escupido al `<th>`.

**Ninguna de las tres rompe nada. Por eso ninguna prueba las veía.** Antes de
dar por buena una pantalla nueva, hay que abrirla.

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

## 🔒 CONFIRMAR — El flujo de efectivo: sin control de salidas, el esperado es un TECHO

Esta es la regla que puede costar dinero y una acusación injusta, así que va
primero.

Hasta el **2026-11-05** nadie registraba las salidas de caja en Eleventa.
Medido: `ACUMULADO_SALIDAS` sale en cero en **2,128 de los 2,136 días** de
Aguascalientes. Ese día el dueño dio la indicación de que todas las plazas
empiecen a registrarlas.

Entonces, para toda semana anterior a esa fecha, el «efectivo esperado» **no es
una cifra, es un máximo**: dice que debería haber más dinero del que de verdad
hay, porque hubo salidas que nadie anotó. Restarle el depósito daría un
faltante inventado, **y un faltante inventado no se distingue en pantalla de
uno real**.

Por eso `conControl()` manda en `src/lib/caja.js`: un día sin control se pinta,
se suma y se enseña, pero NO produce diferencia ni semáforo rojo. Sale en gris
con su aviso. Es la misma regla que ya rige `Alta`: sirve como cota, nunca como
prueba.

La fecha va **por plaza**, en los parámetros editables, porque una puede tardar
en adoptarlo más que otra. Sin fecha configurada, NINGÚN día tiene control:
equivocarse hacia el lado de no acusar a nadie es el error barato.

### ⚠️ «Hoy» NUNCA sale de `toISOString()`

`new Date().toISOString().slice(0, 10)` da la fecha en **UTC**, y en hora de
México eso ya es **el día siguiente a partir de las 18:00**.

No es teoría: tumbó esta pantalla. El **domingo 8 de noviembre de 2026 a las
18:11**, el panel preguntó la fecha y le contestaron «9 de noviembre». Como el
9 era lunes, la semana en curso pasó a ser la del **9 al 15 —que todavía no
había ocurrido—** y la tabla entera salió en ceros, con la venta real de esa
misma semana escondida en el bloque anterior.

Tiene la peor firma posible, la misma que ya costó una vuelta con «lleva 2
días sin actualizarse» contra «ayer»: **por la mañana acierta y por la tarde
falla**. Nadie lo reporta, porque la mitad del tiempo está bien, y cuando no
lo está parece que simplemente no hubo ventas.

La fecha de calendario sale de **`hoyLocal()` en `fechas.js`**, que es donde
vive esta regla. Hay prueba que compara los dos extremos del mismo día.

Ojo con la distinción: `toISOString()` sigue siendo lo correcto para un
INSTANTE —cuándo se guardó algo, con hora— y está bien en todos esos sitios.
Lo que no vale es usarlo como «qué día es hoy».

### El detalle de salidas: cuánto salió y EN QUÉ se fue

Lo pidió el dueño el 2026-11-08: «si hubo salidas, que me aparezcan en un menú
desplegable o algo parecido… no sé exactamente dónde pueda ver la descripción
de salidas que se han registrado».

La tabla de la semana sumaba por tipo y tiraba el detalle, así que un total de
salidas de $1,200 no se podía revisar ni discutir: no se sabía si fue el
garrafón, un adelanto o un pago a proveedor. Ahora `flujoDelDia` conserva los
movimientos tal cual en `movs`, y `movimientosDeSemana()` los junta.

Va **plegado**, porque la mayoría de las semanas no tiene ninguna y un bloque
vacío desplegado todos los días enseña a no mirarlo. Y cuando no hay ninguna
**se dice**, en vez de dejar el hueco: un hueco se lee como que no cargó.

🔒 **Los faltantes NO salen en esa lista.** No restan del efectivo neto —ver
`NO_RESTAN`— y llevan el nombre de quien cerró el turno pegado a una cantidad
de dinero que falta. Metido entre las salidas se leería como una salida más,
cuadraría la cuenta que esta pantalla existe para descuadrar, y de paso
acusaría a alguien en una lista donde no toca. `verificar` lo comprueba.

### ⚠️ Un día en blanco: «falta el corte» NO es «aún no llega»

La pantalla pintaba los dos casos igual, con un guion, y el dueño leyó el
domingo vacío como un fallo. Son cosas muy distintas:

| | qué es | ¿alarma? |
|---|---|---|
| **Aún no llega** | Las tiendas suben su respaldo **a partir de las 20:30**, así que durante toda la jornada el día más fresco que puede existir es el de AYER | No. Es lo normal |
| **Falta el corte** | El respaldo llegó, cubre ese día, y viene vacío: o nadie cerró turno, o se subió a medias | **Sí.** Lo vendido ese día no está contado en ningún sitio |

🔒 **La frontera es la fecha del RESPALDO, no «hoy».** Con «hoy» saltaría la
alerta cada tarde en las cinco plazas, y una alerta que sale siempre deja de
leerse —peor que no tenerla, porque el día que salga de verdad tampoco se
leerá—. Es la misma razón por la que `DIAS_INVENTARIO_VIEJO` es 2 y no 1.

Y **sin fecha de respaldo no se opina**: marcar días en rojo a ciegas manda a
buscar un corte que quizá nunca faltó. Vive en `cortesQueFaltan()`, con
pruebas.

### El renglón que hablaba del depósito encima de la tabla diaria

Decía «Cubre la venta del 26 de oct al 1 de nov» justo encima de una tabla que
enseñaba del 2 al 8. Era cierto —el depósito de una semana cubre la venta de
la anterior— pero colocado ahí se leía como si la tabla fuera de esas fechas.
El dueño lo leyó así. Ahora dice de quién habla.

### 🔒 Las devoluciones se EXTRAEN para enseñarlas, y nunca se suman

`extraer-caja.mjs` las descartaba con `WHERE cm.TIPO <> 'Devolucion'`, y por
una razón buena: ya vienen en `DEVOLUCIONES_VENTAS_EFECTIVO` del corte, y
sumar las dos fuentes las restaría dos veces. Pero con ellas se iba **el
concepto y la hora**, que es lo único que el agregado no tiene.

El dueño lo pidió el 2026-11-08: «sólo veo la salida, no puedo ver el concepto
que pusieron». Una devolución de $750 sin concepto es una cifra que no se
puede revisar ni preguntar a nadie.

Ahora se extraen **en su propia lista**, igual que los faltantes y por lo
mismo: el número que resta sale del corte y de ningún otro sitio. Si esa lista
entrara en una suma, cada devolución se restaría dos veces y el esperado
saldría por debajo de lo que hay —un faltante inventado, que en pantalla no se
distingue de uno real—.

**La consulta va en `try/catch`, y no por manía.** `EXTRACT(HOUR …)` no tenía
precedente en este proyecto y si `CUANDO_FUE` no fuera un TIMESTAMP reventaría;
sin el guardia, eso tumbaría la extracción ENTERA de la caja de esa plaza
—días, movimientos, arqueos— por una lista que sólo sirve para consultar. Lo
accesorio no puede tirar lo principal. Si falla, lo dice en el registro y el
resto sale igual.

**Y la hora está para mirar el ticket de al lado, nada más.** Eleventa **no
enlaza una devolución con la venta que la sustituyó** —ese dato no existe en
ninguna tabla— así que la página no puede decirlo sin inventárselo, y lo dice
en pantalla en vez de callarlo.

### Cada renglón del cálculo se despliega: cuánto, y EN QUÉ

El nombre del renglón abre el detalle; las celdas siguen abriendo el ajuste,
que es lo que ya hacían. Dos cosas distintas en el mismo renglón, cada una
donde se espera.

Se despliega la **semana entera**, no sólo un día: quien mira la fila ve una
cifra rara en una columna y lo que quiere es el concepto. Obligarle a acertar
la celda exacta es pedirle puntería a cambio de nada.

Cuando un movimiento viene sin concepto **se dice** —«sin concepto en la
caja»— en vez de dejar el hueco: un hueco se lee como que no cargó, y lo que
pasa es que nadie lo escribió al registrarlo.

### 🔒 Las cancelaciones y su «reemplazo» son una SOSPECHA, nunca un dato

Lo propuso el dueño el 2026-11-08, y lo propuso con la trampa ya vista:

> «Cancelo un iPhone 14 en 3 piezas. Y después doy de alta un iPhone 14 en
> TPU. Pero es el ticket exactamente siguiente después de cancelar. **En
> realidad nadie dice que es el reemplazo. Pero si el modelo coincide**, sí es
> posible hacer una especie de regla.»

Esa frase es todo el diseño. Eleventa **no enlaza** una cancelación con la
venta que la sustituyó: ese dato no existe en ninguna tabla. Lo que sí existe
es la hora, el cajero y los productos.

La regla vive en `reemplazos.js`, con pruebas, y empareja una cancelación con
el **siguiente ticket no cancelado del MISMO cajero** dentro de
`MINUTOS_PARA_REEMPLAZO` (**30**). El cajero importa: dos mostradores atienden
a la vez, y el ticket siguiente en el reloj puede ser de otro cliente.

Tres niveles, y los tres se dicen en pantalla con su motivo:

| | cuándo | qué es |
|---|---|---|
| **probable** | el siguiente ticket toca el mismo teléfono (`claveModelo`) | sospecha fundada |
| **dudosa** | hay venta después, pero de otro modelo | se enseña para que lo juzgue una persona |
| **ninguna** | no se vendió nada en la ventana | **esto no es sospecha: es venta que se fue** |

**No alimenta ninguna cifra.** Las piezas y el dinero siguen saliendo de
`agregarVentas`, que excluye los cancelados. Si esto entrara en una cuenta,
la cuenta pasaría a apoyarse en una suposición sin que se notara —que es la
clase de error que este archivo lleva entero documentando—. La única que sí es
un hecho, y por eso va en pesos, es `importeSinReemplazo`.

Y el emparejado **falla hacia no emparejar**: cuando no hay nada que
sospechar, se dice que no lo hay. Un emparejado falso es peor que ninguno
—enseña con seguridad algo que no pasó y nadie lo revisa, porque la pantalla
se ve perfecta—. Ya costó caro con las fotos de los mockups.

### El formulario de ajuste no borra lo de Eleventa, y ahora lo dice

El dueño lo abrió sin saber para qué era: «no sé si es para yo hacer un
movimiento». Es para corregir un número que Eleventa calculó mal, y lo que
había que decir es que **lo de Eleventa se guarda al lado** y se puede volver
a él. La celda queda con ✏️ y el motivo. No registra una salida ni mueve
dinero: para eso está «Registrar movimiento».

### Las salidas se ven en LOS DOS sitios

Primero sólo estaban en el calendario del tablero, y el dueño las buscó en el
bloque de su plaza: «no sé dónde puedo ver las salidas de efectivo». Es lo
lógico —ahí están los renglones de gastos, retiros y adelantos, pero sumados—
así que el detalle con conceptos va también dentro de cada plaza, y ahí
**abierto por defecto**: si hay salidas en la semana de una plaza concreta, es
lo que se vino a ver.

### Los botones de semana, y por qué hoy casi no se ven

El calendario enseñaba `bloques[0]` y punto, así que el domingo por la tarde
—con la semana recién cerrada— no había forma de volver a mirarla. Ahora hay
botones.

🔒 **MIRAR y TRABAJAR no son la misma lista, y conviene que sigan separadas.**

| | cuántas | para qué |
|---|---|---|
| `bloques` | `SEMANAS_A_LA_VISTA` = **2** | la lista con los botones de «marcar como depositado»: es para HACER |
| `todos` | `SEMANAS` = **8** | los botones del calendario: ahí no se hace nada, se MIRA |

El dueño bajó la lista de trabajo de ocho a dos el 2026-11-06 —«ocho semanas a
la vista eran dos meses de renglones para revisar un corte de ayer»— y el
2026-11-08 pidió poder elegir la semana en el calendario. Las dos cosas valen
a la vez **porque son listas distintas**: subir la de trabajo para poder
consultar habría vuelto a romper justo lo que él arregló dos días antes.

Con una sola semana de historia los botones no se dibujan: un único botón que
no lleva a ningún sitio es ruido. Crece solo cada lunes hasta las ocho.

### El historial arranca en CEROS: nada de antes del 2026-11-02 es un pendiente

Lo pidió el dueño el 2026-11-06: «como es una sección nueva y técnicamente
quiero empezar el historial en ceros, únicamente considerando la semana en
curso, que es la semana que inicia del lunes 2 de noviembre al domingo 8».

No es cosmética, y lo que arregla se vio en pantalla. «Lo que debe entrar al
banco» decía **$411,648 en 32 semanas sin marcar**, la más vieja del 14 de
septiembre. Ese dinero lleva meses en el banco; lo que pasa es que se depositó
antes de que existiera el botón de marcarlo, así que ocho semanas de venta de
Eleventa se leían como una deuda. **Una deuda inventada de medio millón de
pesos no se distingue en pantalla de una real**, que es la misma trampa que
`conControl` evita un escalón más abajo.

Vive en `INICIO_HISTORIAL`, en `caja.js`, y el recorte va **dentro de
`bloquesSemanales`**, no en las pantallas. Se intentó al revés y no bastó: el
concentrado seguía sumando por su cuenta las semanas que la lista de bloques
ya no enseñaba, y el dueño veía ocho donde la pantalla de al lado decía dos.

Tres cosas que hay que saber antes de tocarlo:

- **Tiene que ser un LUNES.** Cualquier otro día lo corre `semanaDe` a su
  lunes y el historial empieza antes de lo que dice la constante. Hay prueba.
- **Nunca devuelve una lista vacía.** La semana en curso sale siempre, aunque
  el inicio fuera posterior: cero bloques deja la pantalla en blanco, que se
  ve igual que un fallo.
- **Lo de antes no se borra.** Sigue entero en `caja/<plaza>.json` y se sigue
  extrayendo; lo único que cambia es que no cuenta como pendiente.

El número de semanas crece solo cada lunes hasta toparse en las dos que se
enseñan (`SEMANAS_A_LA_VISTA`). `verificar` lo calcula del mismo sitio en vez
de escribirlo, o fallaría solo el lunes siguiente sin estar nada roto.

### Bloques semanales, no un acumulado

Lo decidió el dueño: «maneja bloques semanales no acumuladas y en cada bloque
una sección para marcar como depositado y si no se marcó como depositado que se
pueda ir acumulando».

Cada semana es su propio bloque con su cifra y su botón. Lo que no se marcó se
va sumando, y el efectivo en caja es `fondo fijo + los bloques sin marcar`.
Con un saldo corrido no se podía saber QUÉ semana quedó sin depositar: sumaba
bien y no servía de nada, porque la pregunta es «¿de qué semana es este
dinero?» y un saldo de $38,000 no la contesta.

### 🔒 Un faltante es una salida REGISTRADA, no un descuadre de corte

Eleventa escribe sola una línea «Efectivo faltante al cerrar turno de ‹nombre›
del ‹fecha›» cada vez que lo contado no cuadra con lo cobrado. Medido de enero
a octubre de 2026:

| Plaza | Efectivo cobrado | Descuadres | % |
|---|---|---|---|
| León | $965,652.53 | $14,931.32 | 1.55% |
| San Luis | $588,389.78 | **$28,300.29** | **4.81%** |
| Aguascalientes | $420,589.10 | $8,610.18 | 2.05% |
| Torreón | $390,645.66 | $15,310.33 | 3.92% |
| **Total** | **$2,365,277.07** | **$67,152.12** | **2.84%** |

El dueño los quitó de la pantalla el 2026-11-06: «realmente la información no
es precisa, puesto que ellos a la hora de cerrar no consideran que siempre
tiene que coincidir el monto a la hora de cerrar el turno. Lo dejaría cuando
ellos registren una salida de efectivo por un faltante y no tanto por el
momento del corte».

Y los números le dan la razón. Un 5% de descuadre sostenido durante diez meses
no es dinero que desaparece: es un cierre que nadie cuadra. Enseñarlo como
faltante **acusa de un robo a quien sólo cerró deprisa**, con su nombre pegado
a una cantidad.

Lo que cuenta ahora son los movimientos de tipo `faltante`: la salida que
alguien tecleó —en Eleventa o en la página— porque de verdad faltó dinero.
`faltantesDe()` lee eso y nada más.

**Las líneas automáticas se siguen extrayendo, y apartarlas sigue siendo
imprescindible.** No por enseñarlas —no se enseñan— sino porque si cayeran en
`otra-salida` **restarían del efectivo neto**. Por eso `RE_DESCUADRE` no se
toca: su trabajo de verdad es ése. Viven en `faltantes` de
`caja/<plaza>.json`, por si alguna vez hacen falta.

**Y un faltante registrado tampoco resta del neto** —`NO_RESTAN` en
`caja.js`—. Si restara, el esperado bajaría justo lo que falta, el depósito
cuadraría al peso y el semáforo saldría verde: el único caso que esta pantalla
existe para detectar sería el único invisible. Dejándolo fuera sale al revés y
bien: el depósito viene corto por esa cantidad, el bloque sale en rojo, y la
sección de faltantes dice de dónde salió la diferencia. La alarma y su
explicación a la vez.

Se agrupa por `persona`, **nunca por `quien`**: `quien` es el usuario que
tecleó el movimiento —casi siempre el administrador— y agrupar por ahí le
colgaría a él los faltantes de las cuatro plazas.

San Luis lleva además **$134,810.01 en 51 descuadres durante 2025**, que por
lo mismo tampoco se enseñan.

**Sólo los ve el administrador.** Lo decidió el dueño: «solo admin tiene acceso,
ellos hacen todo directo en eleventa». Todas las rutas de `/caja` exigen
`sesion.admin`, ni su propia plaza, porque esas líneas llevan el nombre de quien
cerró pegado a una cantidad de dinero que falta. Y por eso `caja/` **no es
público**: lo sirve el backend, igual que `personal/` y `revisiones/`.

### El cuadro de la semana enseña dos cuentas que NO suman entre sí

Lo pidió el dueño el 2026-11-06: al lado del efectivo, «pagos con tarjeta,
transferencia o todo lo demás, y a un ladito total ventas de la sucursal», más
las ventas totales en general.

Las dos cifras gordas de cada renglón miden cosas distintas:

| | qué es |
|---|---|
| **Efectivo neto** | lo que debe quedar en el cajón: cobrado en efectivo − devoluciones − salidas |
| **Venta total** | todo lo que se vendió, se cobrara como se cobrara |

Por eso van separadas por una línea vertical y lo dice el pie: pegadas se leen
como una fila de números que suma, y restando una de otra no sale nada. La
fila de abajo suma las plazas, y no se dibuja con una sola —repetiría el
renglón de arriba—.

### Ningún parámetro trae valor por defecto

`PARAMETROS_VACIOS` los deja todos en `null` a propósito: fondo fijo, límite de
efectivo, tolerancia, hora límite, día de depósito, cuenta y responsable son
decisiones del dueño. Un número inventado en el código se leería en pantalla
igual que uno suyo, y se decidiría sobre él. Mientras falten, la plaza sale en
gris y no se juzga.

**Un campo vacío se guarda como `null`, NUNCA como cero** —`limpiarParametros()`
en el backend, con prueba—. Es la misma regla que los precios: un cero es «sin
capturar» y no «gratis». Aquí tiene dientes: un fondo fijo de cero se
compararía contra el límite y daría un semáforo verde sin que nadie hubiera
configurado nada. Lo mismo con los montos: `Number('')` da **cero**, así que el
texto vacío se rechaza antes de llegar a `Number`, o un campo en blanco se
guardaría como un depósito de $0.00.

---

## ⚠️ VERIFICAR — De dónde sale el flujo de efectivo, y las tres tablas que mienten

Del respaldo de Eleventa, con `node scripts/extraer-caja.mjs`. Va en la corrida
de GitHub Actions, junto a los turnos, y publica `caja/<slug>.json`.

**`CORTE_OPERACIONES` es LA fuente.** Una fila por día y caja, con las formas de
pago ya separadas —`VENTAS_EFECTIVO`, `VENTAS_TARJETA`,
`VENTAS_TRANSFERENCIA`, `VENTAS_VALES`, `VENTAS_CREDITO`, `VENTAS_CHEQUE`,
`DEVOLUCIONES_VENTAS_EFECTIVO`—. Aguascalientes tiene 2,136 días seguidos desde
el 2019-11-26. **Y ya reparte los pagos mixtos**, comprobado contra los tickets
de octubre de León al peso:

    efectivo  88,428.61 = 88,028.61 de tickets «e» + 400 del mixto
    tarjeta    9,690.09 =  9,590.09 de tickets «t» + 100 del mismo mixto

**`PAGOS_MIXTOS` NO se lee, aunque el nombre invite.** En León dice 352 líneas y
$178,376 de tarjeta cuando los tickets y el corte coinciden en $132,551 de
tarjeta EN TOTAL. Leyéndola, la tarjeta sale inflada un 35% y el efectivo
encogido otro tanto. Es basura heredada, igual que los precios de bodega.

**`ACUMULADO_ENTRADAS` y `ACUMULADO_SALIDAS` tampoco.** No cuadran con
`CORTE_MOVIMIENTOS`: el faltante de $1,960.02 del 2026-09-14 en Aguascalientes
está en el detalle y `ACUMULADO_SALIDAS` de ese día sale en cero. Se usa el
detalle, que además trae el CONCEPTO, que es lo que hay que enseñar.

**Las devoluciones se restan UNA vez.** `CORTE_MOVIMIENTOS` también las guarda
—473 líneas y $79,081.74 en Aguascalientes— y sumar las dos fuentes las
restaría dos veces: es el mismo suceso anotado en dos tablas. Se usa sólo
`DEVOLUCIONES_VENTAS_EFECTIVO` del corte.

**`FORMA_PAGO` es CHAR con relleno de espacios, no un número.** Castearla a
entero revienta con `SQLCODE -413`. Los códigos son `e` efectivo · `t` tarjeta ·
`s` transferencia · `m` mixto · `c` crédito. `ESTA_CANCELADO` es `'f'`/`'t'`
**minúscula** y `SOSPECHOSO` es `'F'` **mayúscula** —y está en `F` en los 2,195
turnos de Ags, así que no sirve para nada—. Hay 334 tickets cancelados en Ags y
379 en San Luis que hay que excluir.

**`TURNOS.EFECTIVO_AL_CIERRE` es el arqueo y está lleno** —2,057 de 2,195 en
Ags—. Cumple `cierre = ventas en efectivo − devoluciones en efectivo`,
comprobado en dos días al centavo. **`DINERO_INICIAL` no sirve**: cero en 2,195
de 2,195 turnos de Ags y 349 de 349 de León. El fondo fijo es un parámetro.

**Torreón vende y el código decía que no.** `sucursales.js` la tiene como
`activa: false` —que es cosa de lo que ve un mayorista— pero su respaldo trae
**$702,960 de venta en efectivo** desde junio de 2025. Es la «Sucursal 4» y
entra en el flujo de efectivo. Aparte, hay una carpeta `MORELIA` con respaldos
que se detienen el **2024-03-25** y que no aparece en el código: queda fuera.

**Y desde el 2026-11-09 también está en la sincronización.** Su carpeta
`TORREON` sigue mandando respaldo —el del 2026-11-09 estaba en Dropbox— y un
comentario viejo de `sincronizar-inventarios.js` decía lo contrario («sin
respaldos recientes»), así que **ninguna cuenta de existencia de la red la
incluía**. Se añadió como `opcional` a la sincronización, a la extracción de
ventas y al historial. Ver «Depurar el catálogo».

Pasos que NO hace la sincronización sola y hay que dar una vez, a mano, tras la
primera corrida:

- **El historial por mes de Torreón arranca vacío.** Se arma comparando fotos
  de inventario, y no hay una anterior. Para sembrarlo desde el kárdex:
  `node scripts/extraer-historial-respaldo.js --sucursal=torreon`.
- **Su sesión.** `HASH_TORREON` SÍ está en la Lambda (comprobado el 2026-11-09
  por nombre, sin leer el valor): se puso en la rotación del 2026-11-06. Para
  cambiar la contraseña de una plaza sin que nadie más la vea:
  `node backend/scripts/cambiar-contrasena.js torreon` —se teclea en la
  ventana, a la Lambda sólo va el hash y ofrece guardarla en el `.env`, de donde
  `generar-credenciales.js` las saca todas—.
- **Sus paneles.** `activa: false` sigue siendo cierto: un mayorista no la ve y
  Surtido, Inventarios, Revisar y el Dashboard no la cuentan. Sólo la cuentan
  la ficha de un modelo, la depuración y el flujo de efectivo.

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

### 🔒 El COSTO es al revés: sale de bodega y de nadie más

Esto parece contradecir el apartado de arriba y no lo hace. Son dos campos
distintos y cada uno lo mantiene quien lo sabe:

| | De dónde sale | Por qué |
|---|---|---|
| **Precio** (público y mayoreo) | las plazas que **venden** | bodega no vende: ahí es basura heredada |
| **Costo** | **bodega**, sólo bodega | bodega **compra**: es quien lo sabe |

Lo decidió el dueño el 2026-11-05, con estas palabras: «en tema de costos,
utiliza únicamente los valores de bodega, puesto que en sucursal los da de alta
otra persona y posiblemente se pueda equivocar». El mismo iPhone 15 dice **36
en bodega y 55 en Aguascalientes**, y mirando la pantalla no hay forma de saber
cuál es el bueno.

Vive en `costoPorModelo()` en `radiografia.js`, que recibe **de qué plaza**
leer y por defecto lee bodega. Antes hacía la mediana de las sucursales
excluyendo bodega; es justo lo contrario.

**Y tiene un precio que hay que conocer.** Medido el 2026-11-05: de los 296
modelos con venta en 30 días, **118 no tienen costo en bodega** —el **43% de
las piezas vendidas**—. 111 están dados de alta con el costo en cero y 7 no
están. Encabezan la lista los que más se mueven: I17PMT (26 pz), SGA17T (26),
SGA07T (23), MTG06T (14), I17PT (12).

El hueco **no se rellena** con el costo de la sucursal: un margen inventado no
se distingue en pantalla de uno bueno, y se decidiría sobre él. Se enseña:
`sinCostear()` arma la lista, la pestaña de Ventas la pinta en ámbar ordenada
por piezas y `exportarCostos.js` la baja en Excel con una hoja por trabajo
—capturar un número es de un rato; dar de alta un producto es una decisión—.
Se encoge sola en el respaldo siguiente.

Por eso **la utilidad dice siempre de cuántos modelos habla**. Una cifra que
cubre la mitad del catálogo se lee como si cubriera todo.

Y por eso la pestaña de Ventas **baja también el inventario de bodega**, que
antes no pedía: sin él no hay ningún costo, y todo lo que se valore a costo
sale en cero. Si alguna vez «Dinero parado» o la utilidad salen en blanco, eso
es lo primero que hay que mirar.

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

## ⚠️ VERIFICAR — La venta línea por línea, y lo que destapó

`scripts/extraer-ventas-linea.js` saca de `VENTATICKETS` y
`VENTATICKETS_ARTICULOS` lo que el agregado mensual no puede dar: el día y la
**hora** de cada venta, **qué precio se cobró** (`USA_MAYOREO` por línea), la
ganancia que calculó la caja, quién cobró y a qué mayorista se le apuntó.
Publica sólo agregados en `ventas/<plaza>.json`. Las reglas viven en
`src/lib/ventasTicket.js`, con pruebas.

**Va a un prefijo PRIVADO, y eso no es opcional.** Lleva NOMBRES: los de los
mayoristas y el de quién cobró cada ticket. Esa es la lista de clientes del
negocio. La política del bucket sólo abre `inventarios/*` y `config/*`;
comprobado de verdad: `ventas/leon.json` da **403** sin credenciales y
`inventarios/leon/inventario.json` sigue dando 200.

### Lo primero: el canal que ya teníamos está bien

| | piezas |
|---|---|
| Líneas de ticket de León, sin etiquetas ni stickers | **7,181** |
| `INVENTARIO_HISTORIAL`, lo que ya publicábamos | **7,184** |

Tres piezas de diferencia entre dos fuentes independientes. El historial
mensual no estaba corto; el «agujero del 29%» que aparecía al comparar en
crudo era otra cosa (abajo).

### 🔒 El mayoreo es la mitad del dinero, y cambia por plaza

| plaza | del dinero a mayoreo |
|---|---|
| Aguascalientes | **72%** |
| León | 52% |
| San Luis | 44% |
| Ferias | 1% |
| Bodega | 0% |

Y en el mismo código el mayoreo es un **38% más barato** por pieza: el I13T
sale a $229 al público y a $143 a mayoreo, y de 149 piezas, **104 salen a
mayoreo**. Lo mismo el SGA16T y el I15PMT.

La pestaña de Ventas valora hoy al **promedio de público y mayoreo** de las
plazas que venden. Con estos números eso infla el dinero en las plazas
mayoristas y lo desinfla en Ferias. Ya no hay que estimar: **la caja apuntó
qué precio cobró en cada línea**, y `pesoDelMayoreo()` da el precio medio real
por código. Cambiarlo es decisión de negocio: preguntar antes.

### La GANANCIA de Eleventa NO se puede usar

Viene por línea y parece el dato ideal. Medido, es basura, y por la razón que
ya conocíamos:

| plaza | margen que dice la caja |
|---|---|
| Aguascalientes | **92%** |
| Ferias | 67% |
| San Luis | 65% |
| León | 54% |
| Bodega | **8%** |

El 92% es imposible y el 8% también: la caja calcula la ganancia con el costo
que tiene capturado **cada plaza**, que es justo el número del que el dueño
desconfía. De ahí el reparto de responsabilidades, que ahora queda completo:

| | De dónde | Por qué |
|---|---|---|
| **Precio** | los TICKETS | es lo que se cobró, no una lista de precios |
| **Costo** | BODEGA | es quien compra |
| **Margen** | de esos dos, calculado | nunca de `GANANCIA` |

### 🔒 La temporada medida no es la que dice `MESES_ALTA`

Dinero por día de venta, 2023 en adelante, 1.00 = el promedio de la propia
plaza. Ferias queda fuera a propósito, que deforma cualquier promedio:

| | ene | feb | mar | abr | may | jun | jul | ago | sep | oct | nov | **dic** |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| San Luis | 1.19 | 1.02 | 0.80 | 0.90 | 1.04 | 1.00 | 0.97 | 0.89 | 0.78 | 0.73 | 0.83 | **1.84** |
| Aguascalientes | 1.25 | 1.16 | 0.86 | 0.91 | 0.93 | 1.00 | 0.89 | 0.83 | 0.73 | 0.68 | 0.86 | **1.88** |
| León | 1.49 | 0.96 | 0.78 | 0.85 | 0.89 | 0.97 | 0.86 | 0.91 | 0.75 | 0.80 | 0.64 | **2.11** |

Las tres plazas dicen lo mismo, y son años de datos, no una impresión:

- **Diciembre casi dobla** (×1.84 a ×2.11) y **enero es el segundo** (×1.19 a
  ×1.49).
- **Agosto y octubre están por DEBAJO** del promedio —octubre es el suelo, de
  ×0.68 a ×0.80—, aunque se recuerden como meses fuertes.
- **Noviembre también está por debajo** en las tres (×0.64 a ×0.86).

Ojo con la conclusión fácil: `MESES_ALTA = [11, 12]` incluye noviembre, y
noviembre vende poco. Pero hay que estar surtido en noviembre **para**
diciembre, así que como regla de COMPRA puede estar bien. El hueco de verdad
es otro: **enero no está en `MESES_ALTA`**, así que la cobertura baja a
«temporada baja» justo cuando enero corre a ×1.19–1.49.

No se cambia nada de esto sin preguntar.

### 🔒 El precio de $0.01 es del esquema de mayoristas, y Torreón lo escribe en singular

Lo definió el dueño el 2026-11-09: **todo lo que se procesa a $0.01 es del
esquema de mayoristas y NO es una pieza vendida.** `claseDeLinea` lo aplica
como segunda red, detrás del departamento: una línea cuyas piezas cuestan
$0.01 cada una es una etiqueta sea cual sea el departamento que alguien le
puso. Una línea en cero o a $1 NO lo es (esas son las «cobradas a $1» de más
abajo).

Hacía falta de verdad, no por limpieza: el departamento de clientes de Torreón
se llama **«MAYORISTA», en singular**, y los dos filtros sólo conocían
«mayoristas». Con la sincronización de Torreón, un cliente suyo habría salido
**con su nombre en el `inventario.json` PÚBLICO** y se habría contado como una
funda. Se detectó con la corrida en seco, antes de publicar nada.

Ahora hay una sola lista (`DEPTOS_MAYORISTAS`, en `ventasTicket.js`) que
comparten `claseDeLinea` y el filtro del inventario público
(`scripts/lib/departamentos.js`), y el inventario además oculta un producto
cobrado a $0.01 **sin existencia**. Sin existencia: un producto de verdad con
el precio mal capturado en $0.01 y piezas en el mostrador tiene que verse.

### Cuatro trampas medidas, todas silenciosas

**Los booleanos de Eleventa son `'t'`/`'f'`, no 1/0.** Comparar contra 1 no
devuelve cero filas: revienta la consulta entera con «conversion error from
string "t"».

**Un ticket CANCELADO conserva sus líneas.** En León hay 68 cancelados.
Sumar las líneas sin mirar el ticket las cuenta como venta y la cifra sale
alta sin que nada parezca roto.

**El departamento MAYORISTAS no son productos: son los CLIENTES**, dados de
alta como si fueran productos —con su nombre y su local, al estilo
«NOMBRE PLAZA (1234)»— y añadidos a la venta para apuntar de quién es el
ticket. Los nombres de verdad **no se escriben aquí**: `CLAUDE.md` va en git, y
esa es exactamente la lista que acabamos de dejar en un prefijo privado. Para
verlos, el archivo de la plaza. En León son **2,368 «piezas» que valen $24**. Sumarlas como fundas
infla todo; por eso `claseDeLinea()` las aparta. Son la otra mitad de aquel
«agujero del 29%» —la primera son los stickers, 614 pz y $5,710, que son venta
de verdad pero sin inventario—.

De paso resuelve una pregunta que llevaba abierta: **a qué mayorista se le
vendió cada ticket se puede saber, y está en uso**. León tiene 157 mayoristas
distintos; el primero, 290 tickets.

**La hora se lee del texto, no con `new Date()`.** Llegan como
«2026-10-31 15:03:02.0000», en hora local y sin zona: `new Date()` las trata
como UTC y la gráfica de horas sale corrida seis posiciones **con forma de
curva**, así que no se nota.

### 🔒 Enero entró en `MESES_ALTA`, y noviembre se queda aunque venda poco

Lo autorizó el dueño el 2026-11-05. Enero es el **segundo mes más fuerte**
—×1.19 a ×1.49— y estaba cayendo en «temporada baja», así que la cobertura
bajaba a 30 días justo cuando la venta corre un 20-50% por encima.

Noviembre parece que no debería estar ahí, porque vende **por debajo** del
promedio en las tres plazas. Es al revés, y es el punto de la regla: la
cobertura compra días de venta **al ritmo de hoy**, y si el mes siguiente corre
más rápido, esos días valen menos días.

| 60 días comprados en noviembre aguantan de diciembre |
|---|
| León **18 d** (×3.3) · San Luis **27 d** (×2.2) · Aguascalientes **27 d** (×2.2) |

Y el pedido al proveedor tarda **40 días**. O sea: **ni con la cobertura alta
puesta se llega a diciembre con un pedido normal**, y quitando noviembre León
pasaría de 18 días a 9. La regla no es obsoleta; se queda corta.

Lo que la arreglaría de verdad es escalar la cobertura por el **factor medido**
del mes que hay que cubrir, en vez de un interruptor de dos posiciones. El dato
ya está en `ventas/<plaza>.json`. Es decisión del dueño.

### 🔒 El precio promedio por plaza, y por qué el corte NO es en pesos

Es el dato que pidió el dueño, con sus palabras: «me habla precisamente de
cuánto vende la sucursal a público versus cuánto vende a mayoreo». Vive en
`precioPorPlaza()`, en `ventasTicket.js`.

Sobre la **ventana de 365 días**, que no es un detalle: ver abajo.

| plaza | público | mayoreo | descuento | piezas a mayoreo | invertidos |
|---|---|---|---|---|---|
| León | $221 | $146 | 35% | 65% | 15 |
| San Luis | $197 | $145 | 29% | 64% | 22 |
| Aguascalientes | $161 | $145 | 23% | 47% | 28 |
| Ferias | $254 | $264 | 0% | 0% | 1 |

Ferias no hace mayoreo: su precio de mayoreo es el mismo que el público.

El dueño pidió excluir «los productos que su costo es menor a 100 pesos, por
ejemplo stickers pequeños y productos adicionales». La intención está clara; el
corte en pesos no la cumple, **medido**:

- **Por COSTO no se puede.** Todo el catálogo cuesta entre $55 y $60: un umbral
  de $100 por costo deja fuera absolutamente todo. Misma lección que
  `MAYOREO_MINIMO` ya costó una vez.
- **Por PRECIO deja fuera fundas de verdad.** En Aguascalientes un corte de
  $100 se lleva el **61% de las piezas**: 595 códigos y $1.22M, con el iPhone 7
  Plus a $53 y el XR a $76, que son fundas liquidándose baratas. Y al mismo
  tiempo **deja dentro** el hidrogel de privacidad, a $109.

Lo que el dueño quiere decir —stickers y añadidos fuera, fundas dentro— es lo
que ya clasifican `produccion.js` y `familias.js`, por código y con el nombre
de red. Se usa eso. El piso en pesos existe y vale **cero**: sólo descarta el
precio cero, que no es un precio sino una línea regalada.

**El descuento se mide CÓDIGO CONTRA SÍ MISMO y se resume con la MEDIANA.**
Dos cosas distintas, y las dos se vieron en los datos:

- Dividir el total cobrado a mayoreo entre el total cobrado al público da la
  **paradoja de Simpson** —los modelos caros se van a mayoreo y los baratos al
  mostrador— y el descuento sale invertido sin que ningún precio esté mal.
- **Promediar los descuentos por código tampoco sirve**: la razón no está
  acotada por abajo. Un código vendido una vez a $1 al público y a $145 a
  mayoreo aporta un −144, y San Luis salía con un descuento del **−63%**
  teniendo público $197 y mayoreo $145.

La mediana no se mueve por un puñado de líneas raras, que en precios las hay
siempre. Y las líneas raras no se tiran: se cuentan en `invertidos`, que son
los códigos cobrados más caro a mayoreo que al público.

### 🔒 La lista de precios de dos plazas no es lo que cobran

Todo lo que el panel valora en pesos sale de la LISTA del inventario. Hasta
ahora no había con qué comprobarla. Con los tickets sí, y no cuadra
(`brechaDeLista()` en `precioCobrado.js`):

Sobre la ventana de 365 días:

| plaza | cobrado/lista | comparados | desviados | diferencia |
|---|---|---|---|---|
| León | **101%** | 225 | 13 | $12,807 |
| San Luis | **96%** | 176 | 26 | $9,657 |
| Ferias | **116%** | 195 | 5 | $50,779 |
| Aguascalientes | **75%** | 188 | **116** | **$75,160** |

**Sólo Aguascalientes tiene una brecha de verdad**: cobra el 75% de lo que su
lista dice, en 116 códigos, y el iPhone 13 figura a $250 y se cobra a $167.
León y San Luis cobran su lista; Ferias cobra algo por encima.

La brecha no dice quién tiene razón: puede ser que la lista esté alta o que el
mostrador esté regalando margen. Las dos se arreglan en la sucursal.

### ⚠️ Y el error que dio esta medición la primera vez: 164 veces de más

La primera versión de esta tabla decía que a San Luis le faltaban
**$1,582,316** y a Aguascalientes **$846,531**. Era falso, y el fallo vale más
que el número:

**Se comparaban ventas de 2021 contra la lista de precios de HOY.** El dueño lo
olió antes de que nadie lo buscara —«algo me hace ruido… una diferencia, o algo
está mal»— y tenía razón.

| plaza | 2021 | 2022 | 2023 | 2024 | 2025 | 2026 |
|---|---|---|---|---|---|---|
| San Luis | $108 | $123 | $124 | $134 | $148 | **$152** |
| Aguascalientes | — | $66 | $120 | $146 | $147 | **$137** |
| León | — | — | — | — | $151 | **$152** |

Los precios subieron un 40% en cinco años y **el 92% de las piezas de San Luis
son de antes de 2026**, así que su «precio medio de todo el historial» es el de
hace tres años. Contra la lista de hoy, eso son cinco años de subidas
disfrazadas de descuadre: la cifra real de San Luis es **$9,657**, 164 veces
menos.

El mismo error torcía la comparación entre plazas: decía que Aguascalientes
vendía a **$109** contra los **$221** de León, «a mitad de precio». Con ventana
comparable las tres venden casi igual —$152, $151, $140 de precio medio— y lo
que pasaba es que se comparaban **once meses de León contra siete años de
Aguascalientes**.

**La regla que queda:** cualquier cuenta de PRECIO se hace con ventana. Por eso
`ventas/<plaza>.json` publica dos agregados, y hay que coger el que toca:

| | para qué sirve |
|---|---|
| raíz del archivo | contar piezas y medir la temporada, donde lo viejo no estorba |
| `ventana` (365 d) | **cualquier cosa valorada en pesos** |

365 días y no 90: una ventana corta tomada en octubre —el mes más flojo— diría
que el negocio vale un 30% menos de lo que vale.

### 🔒 La lista de precios NO es el precio, y por eso no se compara contra ella

Esta pantalla comparaba lo cobrado contra el precio de lista y marcaba **116
códigos de Aguascalientes** como desviados. El dueño lo miró en el kárdex y
dijo que algo no se estaba interpretando bien. Tenía razón, aunque la causa no
fuera la que él suponía.

**Lo que NO era.** Pensaba que los ajustes de inventario —faltantes y
movimientos que bajan existencia— ensuciaban la cuenta. No la tocan: esto lee
líneas de ticket, y un ajuste no crea una línea de ticket. Comprobado en
Aguascalientes: **0 líneas con cantidad negativa, 0 en cero, 0 devueltas**.

**Lo que sí era.** En Aguascalientes, de **7,792 líneas al público**:

| | líneas | |
|---|---|---|
| al precio de **lista** | 921 | **12%** |
| al precio de **mayoreo**, sin marcar la casilla | 1,030 | |
| a otro precio negociado | ~5,841 | |

Allí la lista es un punto de partida y casi todo se negocia. El iPhone 13
tiene lista 250, se vende sin descuento a 230 y la mayoría sale a **150 o 140**
—que es justo su precio de mayoreo—. **El mostrador da precio de mayoreo sin
marcar la casilla.**

Así que marcar lo que se aparta de la lista era marcar casi todo.

**Lo que se mide ahora:** lo que se cobra a un cliente de mostrador **por
debajo de su propio precio de mayoreo** (`porDebajoDelMayoreo`). Ése es el
suelo que el negocio ya decidió; por debajo no se está negociando, se está
perdiendo. En Aguascalientes son 1,243 líneas y 1,367 piezas.

Y `mayoreoSinMarcar()` cuenta las piezas cobradas al precio de mayoreo sin la
casilla, que es la razón de que **la mezcla de mayoreo del panel se quede
corta**.

#### Y el mayoreo sólo es un suelo si está POR DEBAJO del público

Parece obvio y es la regla que salvó esta pantalla de volver a ser inútil. Sin
ella salían dos falsos positivos enormes:

- **León, $74,062**, casi todo del **STIKER PEQUEÑO**: se cobra a $9, que es
  exactamente su precio de lista, pero su «mayoreo» figura en **$120**. Es el
  precio invertido que ya conocíamos. No se vende barato: el dato está mal, y
  acusarlo manda a buscar un problema que no existe.
- **Ferias, $35,874.** Allí **745 de 816 productos tienen el mayoreo IGUAL al
  público** —no hace mayoreo: 9 piezas de 3,959—, así que «por debajo del
  mayoreo» volvía a significar «por debajo de la lista».

Con `esSueloDeVerdad()` puesto, la lista queda en **24 códigos en toda la red**:

| plaza | códigos | de los mirados | piezas | se deja de ganar |
|---|---|---|---|---|
| Aguascalientes | 12 | 188 | 50 | $929 |
| San Luis | 7 | 176 | 34 | $378 |
| León | 3 | 224 | 129 | $6,092 |
| Ferias | 2 | 42 | 803 | $21,819 |

Eso sí se puede revisar uno por uno, que es lo que hace que una lista se mire.

### ⚠️ Una línea cobrada a $1 no es un precio

Medido el 2026-11-06: **255 líneas con el 100% de descuento, cobradas a $1**.
No son ventas a un precio —son regalos, reposiciones de garantía o
correcciones metidas por caja— y en un promedio lo hunden: el iPhone 13 pasaba
de **$175 a $167**, un 5%, por 2 piezas de 44.

`DESCUENTO_MAXIMO = 80` las deja fuera de cualquier promedio de precio. Por
debajo de ese 80% sí cuentan: en Aguascalientes **la mitad de las líneas
llevan descuento** y son ventas de verdad.

No se tiran en silencio: se cuentan en `resumen.noSonPrecio` y en
`pzRegalada` por código. Un montón de ventas a un peso es un dato por sí solo.

### Los costos invertidos están en BODEGA, no en las tiendas

`costosInvertidos()` busca productos cuyo costo supera su precio de venta. Eso
no es opinable: está mal capturado.

| plaza | productos así |
|---|---|
| **bodega** | **552 de 556 (99%)** |
| León | 1 (el sticker pequeño) |
| San Luis | 0 de 756 |
| Aguascalientes | 0 de 783 |
| Ferias | 0 |

Se midió porque se sospechaba de San Luis, y San Luis está limpio: su costo es
$55 contra $216 de público, igual que León, y el mismo producto trae el mismo
costo en las tres plazas. **La inversión es de bodega y es casi total.**

No cambia la regla del costo —sigue saliendo de bodega, que es quien compra—
porque lo que está mal ahí es el PRECIO, no el costo. Pero conviene saber que
el 99% de bodega tiene esa forma antes de usar cualquier precio suyo.

### Lo que esto abre

Hay mucho más historial del que creíamos: **Aguascalientes desde 2019-11, San
Luis desde 2020-03, Ferias desde 2021-06**. La nota de que «no existe
antecedente de julio y agosto hacia abajo» era de las estadísticas propias, no
de los respaldos.

---

## 🔒 CONFIRMAR — Una edición es un LOTE, no una ventana de calendario

«Recién llegados» vivía en Surtido y se trasladó a **Ventas** el 2026-11-07,
con estas palabras del dueño: «servirá para evaluar si los modelos nuevos de
la edición anterior o de las últimas dos ediciones realmente están teniendo
ventas».

No es la misma pantalla cambiada de sitio, y la diferencia importa. En Surtido
contestaba una pregunta de COMPRA —qué entró y todavía no se ha visto vender,
para no volver a pedirlo— así que enseñaba **sólo los que llevan cero**. En
Ventas la pregunta es la contraria y más grande: de todo lo que entró, **qué
vende y qué no**. Una lista que sólo trae los fracasos no permite juzgar si la
edición entró bien, porque le falta el denominador.

### El corte no es por días: es por el lote con el que llegaron

La primera versión cortaba en tramos de 120 días. Funcionaba por casualidad.
Medido en el catálogo real el 2026-11-07, las entradas son lotes nítidos:

| entrada | días | modelos |
|---|---|---|
| 2026-08-10 | 89 | 13 |
| 2026-05-16 y 18 | 173-175 | 10 |
| 2026-01-28 y 31 | 280-283 | 26 |
| 2025-12-01 | 341 | 10 |
| 2025-10-11 | 392 | 20 |

Más **10 modelos de goteo** repartidos en ocho días sueltos.

Tres cosas que la ventana hacía mal y el lote arregla:

- **Una edición se reparte en varios días.** Mayo entró el 16 y el 18; enero
  el 28 y el 31. Agrupando por día exacto, una edición sale partida en dos y
  la comparación mide **una mitad contra la otra**: el número sale, y es
  falso.
- **Un lote puede quedarse fuera de la ventana.** La de enero está a 280 días:
  con tramos de 120 no salía nunca, por muchas ediciones que se pidieran.
- **El goteo no es una edición.** Llamar «la última edición» a un modelo suelto
  haría que la comparación midiera un modelo contra trece. Por debajo de
  `MINIMO_EDICION` se cuentan aparte y se dicen.

Las fechas se agrupan si están a menos de `DIAS_MISMA_EDICION` (**21 días**:
la tanda más apretada son dos días). Y una edición no puede durar más de
`DIAS_MAXIMO_EDICION` (**45**): el agrupado encadena, y con mercancía entrando
a goteo cada veinte días la cadena no se rompería nunca y todo el año sería
«la última edición», un solo montón sin nada con qué compararlo. La tanda más
larga de verdad dura 24 días, así que 45 no parte ninguna.

Vive en `src/lib/estrenos.js`, con pruebas.

### ⚠️ Un código nuevo NO es un modelo nuevo

El 2026-11-09 el dueño vio el Galaxy S10e en «Modelos nuevos» y pensó que era un
reabasto tras estar en cero. **No lo era**: el reabasto no mueve `Alta`. León
dio de alta el código `SGS10ETC` el 2 de mayo de 2026 para un teléfono que
Aguascalientes y San Luis vendían desde 2023 con otro código, y la lista
agrupaba por CÓDIGO, no por teléfono.

Medido el mismo día en las tres últimas ediciones: **9 de 46 códigos** eran otra
presentación de un teléfono que ya existía —un «3 en 1» de un A57 con TPU desde
enero, un REDMI NOTE 15 con dos códigos—, y inflaban «sí venden».

La regla (`variantesDeModelosViejos`, en `estrenos.js`):

- Es variante el código cuyos teléfonos YA tenían otro código con una alta
  anterior por `DIAS_MISMA_EDICION` (21) días o más. Se mira con `claveModelo`.
- **Cada** teléfono que cubre, no alguno: «MOTO G77/G67» con el G67 viejo y el G77
  nuevo SÍ es un estreno.
- Dos códigos del mismo teléfono con un día de diferencia son de la MISMA tanda
  y ninguno es variante del otro.
- Se calcula con las altas de **toda la red**, aunque se mire una sola plaza: que
  el teléfono existiera en otra tienda es lo que lo hace viejo.
- Se aparta ANTES de formar lotes: los lotes dependen de cuántos modelos junta
  cada fecha, y quitar uno de una edición ya armada la dejaba con menos de tres.
- **No se esconde en silencio:** sale en un desplegable con «ya existía como X».
- Micas, hidrogel y stickers no se emparejan nunca. `claveModelo` NO los deja en
  blanco, aunque su comentario lo diga: dos micas con el mismo nombre darían la
  misma «clave de teléfono».

**No existe `created_at`.** La especificación del 2026-11-09 pedía validar la
fecha de creación del SKU en el «Catálogo Maestro». Se comprobó el esquema de
Eleventa con `scripts/explorar-esquema.js`: `PRODUCTOS` tiene 26 columnas y las
únicas fechas son `ELIMINADO_EN` (borrado lógico) y `CHECADO_EN`. Lo más cercano
a una creación sigue siendo el primer movimiento del kárdex (`Alta`).

### ⚠️ La venta sale del acumulado MENSUAL, no del detalle diario

`estadisticas.json` guarda sólo los **últimos 60 días** de detalle
(`DIAS_QUE_SE_GUARDAN`). La pregunta es sobre lotes de hace tres, seis o nueve
meses.

Midiendo con el diario, un modelo que entró hace cuatro meses **y se vendió
entero en los dos primeros** saldría con CERO piezas, y la conclusión sería
matar justo el modelo que mejor entró. El acumulado por mes de
`historial.json` sí está entero, y es de donde se lee.

### Tres reglas más, que cambian la respuesta

**Se compara a igualdad de tiempo.** Un modelo de 115 días con 20 piezas vende
MENOS que uno de 35 con 15. Manda el ritmo —piezas por cada 30 días desde que
llegó— y las piezas van al lado como lo que son, un total. Ordenando por
piezas, la lista dice lo contrario de lo que pasa.

**Lo que acaba de llegar no ha fracasado.** Un modelo con dos semanas y cero
ventas no es un fracaso, es un modelo sin medir. Se aparta en su propio montón
—por debajo de `DIAS_PARA_OPINAR`, 30 días— y no cuenta como «no vende». Metido
con los demás, **toda edición recién entrada parecería un desastre** y se
dejaría de comprar lo que todavía no se ha probado. Por eso la parte que vende
se calcula sobre los MEDIDOS.

**Un «piso» no es una llegada.** Misma regla que en Surtido: `Alta` es el
primer movimiento del historial, no la fecha de entrada, y en León 579 de 647
productos comparten el día en que arrancó Eleventa. Incluirlos llenó la lista
de fundas de iPhone 6 una vez.

**La diferencia entre ediciones va en PUNTOS.** Del 40% al 50% son diez puntos;
decir «un 25% mejor» de dos porcentajes es la forma más fácil de que un número
suene al doble de lo que es. Y el ritmo de una edición se resume con la
**mediana**: un solo modelo que se vende como churros levanta el promedio y
hace parecer buena una edición con el resto parado.

### ⚠️ El fallo que esto destapó: todo el dinero de Ventas salía en blanco

`valorDe` esperaba `{ codigo: { promedio } }`, que es lo que devuelve
`promedioEntrePlazas`. Pero la pestaña de Ventas le pasa `soloPrecios(…)`, que
devuelve `{ codigo: 123 }`. Con un número, `e.promedio` era `undefined` y la
función devolvía **NaN**.

Y NaN es *falsy*. Así que no reventaba nada: lo facturado, la utilidad, el
dinero parado y el puente de variación se **escondían solos**, porque se
pintan con `if (cifra)`. Parecía que faltaba el dato cuando lo que fallaba era
la cuenta. En vivo, «Por qué cambió la venta» pasó de no enseñar nada a decir
$169,940 contra $185,457.

Ahora `valorDe` acepta las dos formas y devuelve **cero**, nunca NaN, ante
cualquier cosa que no sea un precio: un NaN se propaga por toda la suma y deja
en blanco la cifra entera, no sólo ese renglón. Hay prueba.

(`exportarSurtido.js` sigue bajando su hoja «Recién llegados» en el Excel de
compras: ahí la pregunta sigue siendo de compra y el dato no estorba.)

---

## 🔒 CONFIRMAR — El usuario de bodega

Bodega entra con su propia contraseña y ve **otro panel**. No es una tienda:
«lo que te toca recibir» es exactamente lo contrario de su trabajo.

| | Tienda | Bodega |
|---|---|---|
| Surtido | lo que le toca recibir, en su plaza | **Surtir**: qué mandar a cada tienda, y registrarlo |
| | — | **Comprar**: lo que hay que pedir al proveedor |
| | — | **Consultar modelo**: cuánto vende, cuánto hay y si su venta es de fiar |
| Revisar | sí | sí |

«Consultar modelo» (2026-11-09) sale **sólo de archivos públicos** —
estadísticas, historial, inventario y `agotados.json`—. Es la misma ficha que
ve el administrador en Ventas, sin un dato más: nada de `ventas/`, que lleva
la lista de mayoristas.

### El permiso va por CAPACIDAD, y está escrito dos veces a la fuerza

`PUEDE_SURTIR` vive en `backend/src/index.js` **y** en `src/lib/surtidos.js`.
Son dos paquetes y no se puede compartir, así que las dos listas tienen que
decir lo mismo: `['admin', 'bodega']`. Hay una prueba que la fija en el
frontend para que el fallo salga ahí y no en producción.

El que manda es **el del backend**. El del frontend sólo decide si se dibuja
el botón: enseñar uno que el servidor va a rechazar es peor que no enseñarlo,
pero esconderlo no protege nada por sí solo.

### `QUIENES_ESCRIBEN`: la lista que no puede quedarse corta

Cada quien escribe sólo su archivo —`revisiones/<quien>.json`,
`ajustes/<quien>.json`, `surtidos/<quien>.json`— y al leer se juntan. Esa
lista de a quién hay que ir a buscar **tiene que estar completa**, o el
trabajo de quien falte desaparece sin que nadie se entere: se guarda bien, y
al leer no se pide.

Pasó con bodega. Estaba escrita **tres veces** y sólo una incluía a bodega, así
que su usuario podía contestar la cola de revisión y corregir códigos, y nada
de eso volvía nunca. Ahora vive una sola vez en `QUIENES_ESCRIBEN`.

**Si algún día hay otro usuario que escriba, va ahí.** Es el único sitio.

### Lo que bodega NO ve, y por qué

- **Ventas línea por línea**: lleva la lista de mayoristas del negocio.
- **Efectivo**: lleva los faltantes al cerrar turno, con nombre pegado a una
  cantidad de dinero que falta.
- **Personal**: lo mismo.

Las tres dan 403 con su sesión, y hay pruebas que lo fijan.

### Para darlo de alta

Basta con **`HASH_BODEGA`** en las variables de la Lambda. No hay cambio de
código: el login busca `HASH_<SUCURSAL>` y `quienEs()` devuelve `bodega` para
una sesión no-administradora con esa plaza.

---

## ⚠️ VERIFICAR — Los días se cuentan por CALENDARIO, no por 24 horas

El dashboard decía «el inventario de León lleva 2 días sin actualizarse» y la
pestaña de Inventarios, en la misma sesión y leyendo la misma fecha, decía
«León: ayer».

La causa: `new Date('2026-11-05')` **no** es la medianoche del 5 aquí, es la
medianoche del 5 **en UTC**, que en hora de México son las 18:00 del día 4.
Restando de «ahora» y redondeando hacia abajo, el resultado dependía de la
hora a la que se mirara:

| | |
|---|---|
| a las 10:00 del día 6 | 1 día — bien, por casualidad |
| a las 21:00 del día 6 | 2 días — mal |

**Acertaba por la mañana y fallaba por la tarde**, que es la peor forma de
estar roto: nadie lo reporta porque la mitad del tiempo está bien, y cuando no
lo está parece que el respaldo falló de verdad.

La cuenta vive ahora **en un solo sitio**, `src/lib/fechas.js`, y compara
fechas de calendario a medianoche local: «ayer» es ayer tanto a las nueve de la
mañana como a las once de la noche. La prueba lo fija comparando los dos
extremos del mismo día, que es lo que lo caza en cualquier huso horario.

Y `null` no es cero: cero significa «hoy» y null «no se sabe». Una fecha
futura sale **negativa** y no recortada a cero, porque es un dato roto y
conviene que se note.

### La sincronización corre CINCO veces al día, y el cron va en UTC

`inventarios.yml` dispara a las **18:17, 21:17, 03:17, 09:17 y 15:17** hora de
México. Son varias y no una porque GitHub no respeta la hora exacta en repos
públicos —con una sola corrida las reales cayeron entre dos y cuatro horas
tarde, y algún día no disparó— y porque las sucursales suben a una hora
parecida: el 16 de septiembre la corrida entró a las 19:29 y los respaldos
llegaron entre 19:30 y 20:05, perdidos por un minuto.

La de las **18:17 la pidió el dueño el 2026-11-08**: los domingos cierran
antes y la venta del día no aparecía hasta las 21:17. Va todos los días y no
sólo el domingo, decisión suya: una corrida de más no hace daño —si el
respaldo no ha llegado, esa pasada no trae nada nuevo— y una corrida que sólo
existe un día de la semana es la que nadie revisa cuando falla.

**⚠️ El cron va en UTC y México va seis horas detrás, lo que cruza la
medianoche.** `17 0` no es «las 00:17 de México»: son **las 18:17 del día
anterior**. Por eso un cron con día de la semana cae en el día equivocado:
pedir «domingo a las 18:17» con `17 0 * * 0` daría el **sábado** por la tarde.
Hoy todas son diarias y no se nota; el día que se ponga un día concreto, hay
que correrlo uno hacia adelante.

### 🔒 Las tiendas suben su respaldo a partir de las 20:30

Por eso `DIAS_INVENTARIO_VIEJO` es **2** y no 1. Durante todo el día de
trabajo el respaldo más fresco que puede existir es el de **ayer**, y eso es
lo normal. Avisar a un día haría saltar la alerta en las cuatro plazas cada
mañana, y una alerta que sale siempre deja de leerse —peor que no tenerla,
porque el día que salga de verdad tampoco se leerá—.

---

## ⚠️ VERIFICAR — Despliegue

- **`revisiones/` no es público y no puede serlo.** Las notas de la cola de
  revisión llevan nombres de empleados. La política del bucket sólo abre
  `inventarios/*` y `config/*`; esas respuestas las sirve el backend, igual
  que `personal/`. Cada quien escribe **sólo su propio archivo**
  (`revisiones/<quien>.json`) y al leer se juntan: con uno compartido, dos
  personas contestando a la vez se borrarían la respuesta sin avisar.
- **Una carpeta nueva del bucket NO necesita permisos nuevos en la Lambda.**
  Comprobado el 2026-11-06: el rol `istuffs-backend-role-pw6qlxs6` lleva una
  sola política propia, `istuffs-s3-inventarios`, con `s3:GetObject` y
  `s3:PutObject` sobre `arn:aws:s3:::istuffs-inventarios/*` —comodín de todo el
  bucket—. Así que `caja/`, o cualquier prefijo que venga, ya está cubierto.
  Lo contrario se dio por hecho una vez y mandó a buscar un permiso que no
  faltaba.

  Lo que **sí** está limitado por prefijo es la lectura PÚBLICA, en la política
  del bucket: sólo `inventarios/*` y `config/*`. Por eso un archivo con datos
  de empleados o con el número de cuenta del banco **no puede ir en `config/`**
  aunque sea configuración. Los parámetros de caja viven en
  `caja/parametros.json` por eso, y hay una prueba en `backend/test/caja.test.js`
  que falla si alguien los regresa: el error no se ve —el archivo se guarda
  igual y la pantalla funciona perfecta—.
- **Nunca** poner un secreto en una variable `VITE_*`. Vite las incrusta en el
  JavaScript público. Así estuvieron meses la llave de AWS, el secreto de
  Dropbox y las cinco contraseñas.
- Amplify sólo tiene tres variables: `VITE_API_URL`, `VITE_S3_BUCKET`,
  `VITE_S3_REGION`. **Ninguna de las tres es un secreto**: la URL de la Lambda
  ya viene incrustada en el JavaScript público —se saca del paquete en vivo— y
  las rutas que importan piden sesión.
- **`VITE_API_URL` tiene que estar en el `.env` local.** Sin ella `pedir()` ni
  siquiera llega al `fetch`, así que todo lo que vive en el backend —ajustes,
  surtidos, la cola— no se puede probar: `npm run verificar` pasaba en verde
  sin haber ejercitado una sola ruta. **Ojo: con ella puesta, `npm run dev`
  escribe en el S3 de verdad**, y registrar un surtido desde desarrollo crea un
  folio real.
- `index.html` va con `no-store` (`customHttp.yml`). Sin eso, tras un
  despliegue el navegador pide un `.js` que ya no existe y la página sale en
  blanco.
- Comprobar sobre el archivo **en vivo**, no sobre la copia local: bajar el
  bundle que sirve la página y confirmar que es el mismo que se verificó.

---

## ⚠️ VERIFICAR — La ✕ de Inventarios NO borra nada, y hay que poder consultarlo

Lo preguntó el dueño el 2026-11-08: «quisiera saber si lo borro, a dónde se va
o dónde queda ese registro… me gustaría tener un archivo o un lugar para
consultar eso».

**La ✕ no borra nada de Eleventa, y no puede.** `inventario.json` se regenera
desde el respaldo cuatro veces al día, así que cualquier cosa que la página
escribiera encima se borraría esa misma tarde. Lo que hace es dejar una nota
en `ajustes/<quien>.json` —prefijo privado— y dejar de contar ese código en
los recuadros.

### Lo que faltaba era un agujero de verdad

La única pantalla que enseñaba esas notas —«Corregidos aquí, pendientes en la
caja», en Revisar— **filtra por PENDIENTE**. En cuanto el código desaparecía
del respaldo, el ajuste pasaba a resuelto y el renglón **se caía de la vista**.

El registro seguía entero en el archivo, porque nada lo borra nunca, pero no
había dónde mirarlo: el control se perdía **justo cuando el trabajo se había
hecho bien**, que es el peor momento posible para perderlo.

Ahora `historialDeBajas()` en `ajustes.js` devuelve TODO —resuelto o no— y la
sección «Lo que has dado de baja» vive en **Inventarios**, no en Revisar,
porque ahí es donde se pulsa la ✕: una lista que vive en otra pestaña es una
lista que nadie abre. Baja en Excel con `descargarArchivoDeBajas()`.

Tres detalles que no son cosméticos:

- **El estado no lo marca nadie.** Mientras el código siga vivo en alguna
  plaza queda pendiente; cuando desaparece de todas pasa a «ya no está» solo.
- **No se inventa la fecha en que desapareció.** Lo que se guarda es cuándo se
  DECIDIÓ. Dar una fecha de desaparición que nadie midió sería peor que no
  darla.
- **«Deshacer» sólo sale en lo pendiente.** Devolver a los recuadros un código
  que ya no existe no devolvería nada, y ese renglón ya es historia.

El Excel de Revisar sigue llevando **sólo lo pendiente**, y así tiene que
seguir: es una lista de tareas para la tienda, no un archivo histórico. Son
dos preguntas distintas —«qué me falta borrar» y «qué he quitado»— y
mezclarlas haría que ninguna de las dos se pudiera contestar de un vistazo.

---

## 🔒 CONFIRMAR — Depurar el catálogo: lo que se puede dar de baja

Se añadió el 2026-11-09 como sección **Depurar** del panel de administración,
con cuatro listas que pidió el dueño: modelos de salida, sin rotación de más de
un año, obsoletos en ceros y marca o departamento. Y una regla por delante de
todas, con sus palabras:

> Queda estrictamente PROHIBIDO eliminar un SKU si tiene stock global > 0 o si
> registra ventas en los últimos 365 días.

### «Estrictamente» no se cumple con un botón apagado

Cualquiera con sesión de administrador puede mandar la petición a mano. El
candado que MANDA vive en el servidor: `POST /ajustes/bajas`
(`backend/src/bajas.js`), que **lee los inventarios de S3 en el momento** y
rechaza lo que no pase. Lo que mande el navegador no cuenta como prueba. La
misma cuenta está escrita en `src/lib/depuracion.js` para que la pantalla no
ofrezca un botón que el servidor va a rechazar y diga POR QUÉ. Son dos
paquetes y no se puede compartir, así que `backend/test/bajas.test.js` pone las
dos frente a frente con los mismos 13 casos × 2 umbrales.

Se exige TODO a la vez:

1. **El inventario de CADA plaza.** Sin el de una, el stock global está
   incompleto y una cifra falsa no se distingue de una buena. Si falta alguno,
   el servidor contesta **409 y no escribe nada**.
2. Que el código exista en alguna caja.
3. Cero piezas en toda la red (las seis plazas, `PLAZAS_CON_STOCK`).
4. **MÁS** de `dias` desde su última venta —365 exactos todavía bloquean— o que
   nunca se haya vendido.
5. Que lleve al menos `dias` en el catálogo (`Alta` mínima de la red): un código
   nuevo sin ventas no está muerto, acaba de llegar.
6. Que la última venta sea EXACTA: cada plaza que lo tiene publica
   `UltimaVenta`. El historial por mes sólo sirve para BLOQUEAR, nunca para
   liberar.

`dias` es 365 o 730 (el dueño dijo «365–730») y **nunca baja de 365**, pida lo
que pida el cliente. La baja definitiva **no** se puede registrar por la ruta
genérica `/ajustes`: está rechazada ahí a propósito, o bastaría mandar el
motivo por esa ruta para saltarse el candado.

### Lo que NO hace

No borra nada de Eleventa. Dar de baja registra una nota —`ocultar` con motivo
`baja-definitiva`, la misma que usa la ✕— y arma el Excel de lo que cada tienda
borra en su caja; el estado se cierra solo cuando el código deja de salir en el
respaldo. Ver «La ✕ de Inventarios NO borra nada».

### Cinco cosas medidas el 2026-11-09 que cambian cómo se hace

1. **1,022 «obsoletos» eran 35.** De los códigos sin existencia y sin venta en
   un año, **985 ya no están en ninguna caja**: sólo viven en el historial por
   mes. No hay nada que dar de baja y no entran a ninguna lista (se cuentan
   aparte: «988 códigos con venta registrada ya no existen»).
2. **La venta sale del kárdex, no del historial por mes.** El historial que
   publica la sincronización llega a octubre de 2025 en Aguascalientes y San
   Luis, a enero de 2026 en León, y Torreón no tiene ninguno: con él no se
   puede probar «dos años sin venta». Cada `inventario.json` trae ahora
   **`UltimaVenta`**: la última vez que el kárdex registró una VENTA
   (`VENTA_ID IS NOT NULL`, como ya hace `extraer-historial-respaldo.js`). No
   sirve `UltimoMov`: cuenta los recuentos, y un ajuste hace parecer reciente un
   modelo parado.
3. **`Departamento` también se publica.** Ya se leía —es lo que filtra los
   clientes— pero no viajaba. Los departamentos son marcas (`GALAXY` y
   `SAMSUNG` coexisten: son lo mismo, se normalizan), más `HIDROGEL`, `ZTE`,
   `ONE PLUS`, `LG`... Donde no viaja se deduce del nombre (`marcaDe`).
4. **«Bodega en cero» no es «descontinuado».** De 187 modelos con bodega en cero
   y piezas en tiendas, 146 ni están en el catálogo de bodega (eso es
   descontinuar), 11 llevan más de `DIAS_DESCONTINUADO` (180) en cero y **30 son
   faltantes normales que se resurten**: hay que COMPRARLOS, no liquidarlos. Se
   separan en la pantalla, o la lista de liquidación se llena de lo que hay que
   pedir al proveedor.
5. **Los stickers no son catálogo que depurar** (`seProduce`): bodega no los
   almacena, los imprime. Con piezas en una tienda salían como «descontinuados»
   y en cero como «obsoletos».

Y un ejemplo que enseña lo que el candado hace: **LG lleva 734 días sin venta,
pero 7 de sus 10 códigos todavía tienen 75 piezas.** No se puede dar de baja la
marca entera; primero se liquida (está en «Sin rotación»).

### Torreón y el hueco que dejaba

Sin su inventario **no se puede dar de baja NADA** (409). Con los datos reales:
0 de 35 obsoletos se podían dar de baja sin Torreón, y 34 con ella. La
sincronización ya la incluye (ver «Torreón vende y el código decía que no»);
el candado se abre solo en cuanto publique.

**León ve sólo desde 2025-12-20.** Su kárdex es el de su Eleventa actual: una
venta suya de antes no está en ningún dato. La pantalla lo dice (calculado del
dato, no escrito: se apaga el 2026-12-20) y la regla de la antigüedad lo cubre
—un código sólo se da por muerto si ya existía en el resto de la red hace más
de un año—, pero la ventana ciega existe.

### Lo descontinuado en bodega: el flag `descontinuado_bodega`

Lo pidió el dueño como un booleano del catálogo. No hay catálogo editable —el
dato lo regenera Eleventa cuatro veces al día—, así que es un ajuste más
(`tipo: 'descontinuado'`, motivo `bodega-descontinuo`, en `ajustes/<quien>.json`)
y lo marcan administración y bodega.

- **No oculta nada.** El código sigue vendiéndose y contando. Sólo deja de
  reclamarse en Revisar como si fuera un error: es justo el escenario por el que
  el motor reclamaba códigos «que bodega no tiene».
- **Se aparta antes de agrupar**, no después. Un lote con un código marcado y
  otro no, filtrado ya armado, quedaba a medias.
- **No es una baja.** Vive en el mismo archivo y NO entra a «pendientes en la
  caja» (`esBaja`): mandar a una tienda a «corregir» algo que sólo se está
  liquidando era el error a evitar.
- **No sustituye el orden de la cola.** Los lotes de la escalera `PASO` siguen
  siendo del dueño (2026-10-27); esto sólo apaga lo ya marcado.

### Marcar varios: UNA petición

Cada petición a `/ajustes` lee el archivo de la persona, lo modifica y lo
reescribe entero. **Dos simultáneas se pisan y la última gana.** Marcar 146
modelos con 146 peticiones perdía marcas sin avisar. `/ajustes` acepta
`items: [{ codigo, producto }]` y todo se valida ANTES de leer ni escribir
nada: un lote con un motivo malo no puede dejar la mitad guardada.

### Cómo se probó que el candado no es decorativo

Un verde en `verificar` puede significar que una comprobación nunca se
ejecutó. Se rompió a propósito cada pieza y se comprobó que algo lo cazaba:

- Quitar el motivo «falta el inventario» de `razonesDeBloqueo` → `npm test`
  falla con 2 pruebas y `verificar` con 3 errores («LGQ6T se puede dar de baja
  SIN el inventario de Torreon»).
- Quitar el filtro de Revisar → `verificar` falla («HX7CT esta marcado como
  descontinuado y Revisar lo sigue reclamando»). Y la prueba comprueba también
  que al quitar la marca HX7CT **vuelve**: sin esa mitad, que desapareciera
  podría ser por cualquier otra cosa.
- Lo que NO se caza: el `incompleto` de la pantalla (`DepurarPanel`) es una
  segunda red redundante —sin filas elegibles el botón se apaga igual—. No es
  un hueco: el candado de verdad son la lógica y el servidor.

### Lo que NO se ha podido comprobar

- **Ninguna de estas pantallas se ha visto con datos publicados en el formato
  nuevo**, porque ese formato (`UltimaVenta`, `Departamento`, Torreón) sólo
  existe tras la próxima corrida de la sincronización. Se miró en un Chrome
  real con los inventarios de la corrida en seco servidos desde el navegador.
- **El servidor no se ha ejercitado contra el S3 real**: sus pruebas usan un S3
  de memoria. La primera baja real es la primera prueba contra S3.
- `UltimaVenta` y `Departamento` quedan en `inventario.json`, que es PÚBLICO. Son
  fechas y categorías, no nombres de personas, pero la fecha de la última venta
  de cada código por plaza es información de negocio que antes no se publicaba
  —`UltimoMov` ya daba algo parecido—.

---

## 🔒 CONFIRMAR — El panel de corte de la sucursal (construido el 2026-11-09)

El dueño pegó una especificación de cinco módulos el 2026-11-09. Primero se
construyó la **Fase 1** (modelos nuevos, ficha de un modelo, anomalías y
depuración) y después, el mismo día, este panel: la **Fase C**. Abajo está lo
que contestó, lo que se construyó y lo que se SUPUSO para poder terminar, que
es lo que hay que confirmarle.

### Lo que se construyó

| | dónde |
|---|---|
| La cuenta de la semana, el conteo y el ciclo de Torreón | `src/lib/corte.js`, con pruebas |
| El ranking de mayoristas | `src/lib/mayoristas.js`, con pruebas |
| Qué ve y qué escribe cada sesión | `backend/src/cortes.js` y las rutas `GET /corte` y `POST /corte/conteo` |
| La pantalla | `src/components/CortePanel.jsx`: sección **Corte** de cada tienda (la primera) y del administrador |
| Lo guardado | `cortes/<plaza>.json`, PRIVADO, un archivo por plaza y una entrada por lunes |

**El recorte lo hace el servidor, no la pantalla.** `caja/` y `ventas/` siguen
siendo privados; una tienda recibe de ellos SÓLO lo de su plaza, sin cajero,
sin arqueo, sin faltantes (llevan el nombre de quien cerró), sin la cuenta del
banco y sin la ventana de precios ni los cajeros de `ventas/`. Bodega no tiene
corte: no es una tienda. `backend/test/cortes.test.js` lo fija, y `verificar`
pasa el dato de mentira por el MISMO recorte importado del backend y comprueba
que ningún nombre de otra plaza ni de quien cobró llegue a la pantalla.

**El conteo lo totaliza el servidor**, y el autor y la hora también. Cada
cambio deja un renglón en el historial; volver a guardar lo mismo no deja otro.
Una semana que todavía no empieza, o anterior al 2026-11-02, se rechaza.

**Sin tolerancia, comprobado.** Se compara al PESO: el esperado se redondea
(el conteo no puede tener centavos) y de ahí para abajo no hay margen.
`verificar` cuenta el esperado exacto, uno más y uno menos, y exige verde, azul
y rojo; con una tolerancia de un peso metida a propósito, falló en tres sitios.

**Gris no es verde.** Sin fondo de caja, sin conteo, o en una semana sin control
de salidas (`conControl`), no se pinta color y se dice por qué.

**Torreón** enseña su ciclo de cuatro semanas desde el 2026-11-09: cada semana
compara contra lo esperado ACUMULADO hasta ahí —el dinero se va juntando— y el
bloque global compara el último conteo contra el ciclo entero. Las semanas que
todavía no empiezan salen como un renglón, no como un bloque de ceros.

**El administrador** ve «Todas las sucursales» —totales, piezas por tipo, una
fila por plaza con su estado, avisos de faltante o sobrante y el ranking de cada
plaza por separado— y puede abrir cualquiera y contar por ella. En «Todas» no se
puede contar: no se sabría de qué plaza. **Las diferencias no se suman entre
plazas**: un faltante en una y un sobrante en otra no se compensan.

### Lo que contestó el dueño sobre los supuestos (2026-11-09, por la noche)

- **El fondo de caja es fijo, distinto en cada plaza, y lo asigna el
  administrador en su panel.** Va en la sección Corte, al abrir una plaza
  («Fondo de caja de …»), y en «Todas» sale como columna. Se guarda en el mismo
  `fondoFijo` de `caja/parametros.json` por una ruta propia, `POST /caja/fondo`,
  que toca SÓLO el fondo: la de parámetros reescribe el bloque entero de la
  plaza, y mandarla desde el corte —que no tiene la cuenta ni el responsable—
  los borraría. Vacío es null, nunca cero. Hay prueba de las dos cosas.
- **🔒 El sueldo se reconoce porque el concepto dice «sueldo» y el nombre del
  trabajador. Las comisiones igual: «comisión» y el nombre.** Las comisiones
  van en su propia lista y su propio renglón, y restan del esperado igual que el
  sueldo. Un sueldo o una comisión SIN nombre se cuenta igual pero se señala
  («⚠ falta el nombre del trabajador»): la cuenta sale, lo que no se sabe es a
  quién se le pagó. Se siguen aceptando `nómina`, `salario`, `quincena` y el tipo
  `adelanto` como sueldo: sólo cambia la lista donde se ve. El nombre lo saca
  `trabajadorDe()` quitando el relleno, y los límites son de LETRA, no `\b`:
  con `\b`, «María» perdía la «a» final.
### ⚠️ Supuestos que se tomaron para terminar: CONFIRMAR con el dueño

- **El esperado sale del efectivo cobrado**, no de «ventas − tarjeta»: es lo
  mismo, pero el POS ya reparte los pagos mixtos (`CORTE_OPERACIONES`) y restar
  sólo la tarjeta dejaría dentro las transferencias.
  `esperado = efectivo cobrado − devoluciones + otras entradas − sueldo − comisiones − gastos`.
- **El banco por banco del Excel no está**: el POS no guarda a qué banco entró
  cada tarjeta, y el dueño dijo que lo único que se teclea es el conteo.
- **Las notas** del Excel quedaron en un campo de observaciones por semana.
- **Por día o turno** sigue pendiente: la tabla es por día, el cuadre por semana.

### 🔒 Las reglas de mayoreo: las puso el dueño el 2026-11-09

1. **No se cobra a precio de mayoreo sin una funda o una mica de hidrogel en el
   ticket.** Un ticket con alguna línea con `USA_MAYOREO` tiene que llevar al
   menos una funda o un hidrogel (`tipoDePieza`).
2. **Si el ticket lleva mayorista, la etiqueta del mayorista va tantas veces
   como productos.** «Compra dos fundas y un sticker, y el mayorista debe venir
   tres veces.» Las piezas de la línea a $0.01 tienen que sumar lo mismo que
   las de TODO lo demás: cuentan también stickers y popsockets, porque el
   ejemplo del dueño mete un sticker. De más también es no cuadrar.

Vive en `src/lib/reglasMayoreo.js`, con pruebas. La extracción publica en
`ventas/<plaza>.json` los tickets que las rompen en los últimos 120 días
(`reglasMayoreo`, con tope de 3 000 y el total aparte). **Señala, no corrige
ninguna cifra.** En el corte salen por semana; la tienda los ve SIN el nombre
de quien cobró y el administrador con él, y la vista de «Todas» avisa del
total. Los cancelados no cuentan.

Lo que NO es regla, y no se marca: un ticket a mayoreo **sin** mayorista. No lo
dijo el dueño, y el mostrador da precio de mayoreo sin la casilla (ver «La
lista de precios NO es el precio»).

### Los cobros con tarjeta o transferencia: la REFERENCIA

Lo preguntó el dueño el 2026-11-09: las tiendas pueden escribir una nota en el
ticket para identificar cada cobro. Se miró el esquema (explorador, León):
`VENTATICKETS` tiene **`REFERENCIA`** (VARCHAR 255), que es lo que Eleventa pide
al cobrar con tarjeta o transferencia, y además `NOTAS` y `NOTAS_AL_PIE`, que
son BLOB. Se usa `REFERENCIA`: es texto corto y no hace falta leer un BLOB con
el `isql` de Firebird 2.0.

La recomendación para las tiendas: en la referencia, **banco + número de
autorización** (tarjeta: el «AUT» del voucher) o **banco + clave de rastreo o
folio** (transferencia). La hora no hace falta: el ticket ya la guarda.

El corte enseña, plegados, los cobros electrónicos de la semana con su
referencia y avisa de los que vienen sin ella. En un pago mixto el importe es
el del ticket entero. Se extrae en su PROPIA consulta y en `try/catch`: si una
plaza no tuviera la columna, la venta de esa plaza sale igual. **No se ha
comprobado** que Eleventa guarde ahí lo que se teclea al cobrar: se verá con la
primera sincronización.

### Cada concepto tiene su color, y no es adorno

Lo pidió el dueño el 2026-11-09 viendo la primera versión: «se ve demasiado
plana, no se distingue una sección de la otra… otras entradas en verde, ventas
en azul, que hagan relación al concepto». Quedó así, y es el MISMO color en la
tabla de la semana, en su lista, en la cascada y en las cifras de arriba:

| ventas | otras entradas | tarjeta y transf. | gastos | sueldo | comisiones | caja |
|---|---|---|---|---|---|---|
| azul | verde | verde azulado | ámbar | morado | rosa | tinta |

El estado de resultados es una **cascada** —ventas, menos lo cobrado por otra
vía, igual a efectivo cobrado, más y menos lo demás, igual a lo esperado— con
una barra por renglón frente a la venta. Las tablas son las de Inventarios:
contenedor redondeado, cabecera fija y, donde se ordena, `aria-sort`.

### Corte y Efectivo van en la MISMA pestaña del administrador

Lo decidió el dueño el 2026-11-09: «van muy en armonía una con la otra». La
pestaña se llama **Efectivo y corte** y el corte es una vista más de
`EfectivoPanel` (Resumen · Corte semanal · Depósitos por sucursal · Faltantes ·
Parámetros), con un control segmentado para que no se confunda con las pastillas
de plaza que lleva cada vista debajo.

No se fundieron en una sola página, a propósito: salen de la MISMA cuenta
semanal, pero hacen dos trabajos —el corte dice si cuadra lo contado en la
caja; los depósitos, si llegó al banco— y la pestaña de Efectivo lleva faltantes
con nombre y la cuenta del banco, que una tienda no puede ver. **Las tiendas
siguen viendo SÓLO su Corte**, en su panel.

Los colores de cada concepto viven una sola vez en `src/lib/coloresCaja.js` y
los usan las dos vistas: la tabla diaria de depósitos pinta cada renglón con el
color de su concepto (`CONCEPTO_DE_LINEA`; un adelanto es sueldo, los retiros y
proveedores son gasto, los faltantes van en alerta porque NO restan).

### El diseño del corte es el diseño de TODO el panel

El dueño lo pidió el 2026-11-10: «muy intuitivo y muy fácil de comprender…
tiene más cuerpo y puedo distinguir de mejor manera cada sección». Las piezas
viven en `src/components/Diseno.jsx` —`Seccion`, `Cifra`, `Cifras`,
`CajaDeTabla`— y los colores en `src/lib/coloresCaja.js`, una sola paleta.

Lo que manda es el TEMA de una sección, no el gusto, y es el mismo en todas
las pestañas:

| ventas | inventario | agotado | comprar | dinero | revisar/alerta | neutro |
|---|---|---|---|---|---|---|
| azul | verde azulado | rosa | morado | verde | ámbar | tinta |

Se aplicó cambiando las piezas propias de cada pestaña (`Dato`, `Tarjeta`,
`Plegable`, `Caja`, `Contador`) y la envoltura de cada bloque, sin tocar su
lógica: Dashboard, Ventas, Inventarios, Surtido y Bodega, Revisar y Depurar.
Una pestaña nueva tiene que salir de `Diseno.jsx`, o volverá a verse plana.

### ⚠️ «No compraron» sin detalle por día decía que nadie compró

El ranking de mayoristas se pidió «como la venta de productos», y ahora lo es:
tabla con compras, % del total, piezas, visitas y ticket medio, ordenable. Pero
la captura con la que lo pidió destapó un error peor que el formato: **«157
mayoristas no compraron en estos 7 días»**, con la última compra de HOY.

Antes de la sincronización que trae `mayoristasPorDia`, la lista del rango sale
vacía y todos los clientes caían en «no compraron». Ahora, sin detalle por día
NO se dice que nadie compró (`hayDetalle` en `mayoristas.js`, con prueba): se
enseña la última compra de cada cliente según todo su historial, dicho como lo
que es, y el ranking del rango aparece cuando llega el dato.

### Cuándo se llena

Las piezas por tipo, los mayoristas por día, las reglas de mayoreo y los cobros
electrónicos salen de `porDiaTipo`, `mayoristasPorDia`, `reglasMayoreo` y
`cobrosElectronicos` de `ventas/<plaza>.json`, que `extraer-ventas-linea.js`
publica desde ahora con 120 días de detalle. **Hasta la próxima sincronización**
la tabla de piezas dice que se llena entonces y el ranking también, en vez de
pintar ceros. Las ventas en pesos ya salen de `caja/`, que existe.

### Lo que contestó el dueño

**Quién ve qué.** Cada sucursal ve las **ventas de la semana, de sólo lectura**,
para confirmar que el corte le cuadra. **Lo único que alimenta es el corte
semanal de efectivo** (cuántos billetes y monedas de cada denominación). Hoy
llenan a mano un Excel entero; la idea es una tabla igual de reconocible pero
**llena desde los movimientos del punto de venta**. Esto **revierte en parte**
la decisión del 2026-11-06 de que el efectivo era sólo del administrador: cada
tienda verá lo suyo, y NUNCA los faltantes con nombre ni otras plazas.

**Todo sale del POS**, incluidos los pagos con tarjeta y transferencia
(`CORTE_OPERACIONES`, que ya reparte los pagos mixtos). El Excel actual:

| Bloque | Contenido |
|---|---|
| Ventas de la semana | Día, fecha, ventas ($), piezas. Total semanal |
| Otras entradas / Gastos semana | Descripción y monto, con total |
| Estado de resultados semanal | Otras entradas, ventas, total ventas, gastos, sueldo, pago con tarjeta → **esperado en caja** |
| Corte semanal $ | Billetes 500, 200, 100, 50, 20, 10, 5, 2, 1: cantidad y total |
| Diferencia | contado − esperado |
| Notas | Concepto, costo, precio, anotaciones, fecha |

La cuenta del Excel es `esperado = total ventas − gastos − sueldo − tarjeta`.

**Respondido por el dueño el 2026-11-09:**

- **Todo lo que debe haber en caja o en el corte semanal sale del POS**, sin
  excepción: ventas, tarjeta, transferencias, gastos y sueldo. El empleado no
  teclea ninguna de esas cifras, y por eso la tarjeta que cuenta es la del POS.
- **El sueldo sale del acumulado de la semana, y el empleado SIEMPRE lo tiene
  que reflejar en el POS como una salida de efectivo.** Sin esa salida, el
  esperado queda por encima de lo que hay y se lee como faltante: es una regla
  de operación de las tiendas, no sólo de la página. Cómo se reconoce: ver
  «Supuestos» arriba.
- **NO hay ninguna tolerancia en el faltante de dinero.** Cualquier diferencia
  cuenta: $0 verde, negativo rojo, positivo azul. El parámetro `tolerancia` de
  caja se queda sin uso para este corte.
- **El fondo de caja** sigue sin respuesta: se tomó el `fondoFijo` de cada
  plaza (ver «Supuestos»).

Sigue valiendo: el cuadre debería poder verse **por día o turno**, no sólo por
semana, y antes del 2026-11-05 no había control de salidas (`conControl`).

**Torreón es el caso especial.** Deposita o transfiere **a las 4 semanas**, no
cada semana. Quiere un control de **4 semanas a partir del 2026-11-09 (lunes)**:
cuatro bloques semanales y **un bloque global mensual**. Es un lunes, como exige
`INICIO_HISTORIAL`.

**Mayoristas.** Ranking de CLIENTES (los «productos» del departamento
MAYORISTAS son clientes): el acumulado de cada mayorista, el más activo y el
menos activo. **Cada sucursal ve SÓLO el de su plaza; el único que ve todas es el
administrador.** El rango se elige **de 7 a 30 días como máximo** (7, 14, 21 y
30). `ventas/` sigue dando 403 a una tienda; la lista le llega por `GET /corte`,
sólo la de su plaza. Los que no compraron en el rango se listan aparte, los que
lo dejaron de hacer hace menos primero.

**Piezas vendidas** cuentan sólo **fundas, hidrogel y stickers**, con el desglose
por tipo. **Micas = todo el departamento HIDROGEL**, o cualquier producto con
«hidrogel» en el nombre (el departamento existe: 7 códigos). Las ventas a
$0.01 no cuentan como pieza.

---

## 🔒 CONFIRMAR — El segundo factor es SÓLO del administrador

Se añadió el 2026-11-07. Es TOTP estándar (RFC 6238) hecho con el `crypto` de
Node, sin dependencias: lo lee Microsoft Authenticator, Google Authenticator,
Authy o 1Password indistintamente.

**Y es sólo del administrador, a propósito.** El administrador ve el efectivo
de las cuatro plazas, los faltantes con el nombre de quien cerró el turno y la
lista de mayoristas del negocio. Una tienda ve su inventario, que de todas
formas se publica. Pedirle un código del móvil a quien está en el mostrador
sería un estorbo diario a cambio de proteger lo que ya es público, **y un
estorbo diario acaba en la contraseña pegada en un papel junto a la caja**.

Tres decisiones que lo hacen usable y que no hay que deshacer:

- **Sin `TOTP_ADMIN` en la Lambda, no se pide nada.** El día que la variable
  exista empieza a pedirse, y ni un minuto antes. Así se puede dar de alta el
  secreto sin riesgo de quedarse fuera por un despiste.
- **El código va en la MISMA petición que la contraseña.** Partirlo en dos
  llamadas obligaría a guardar en el servidor un «esta contraseña ya se
  validó, falta el código», y ese estado es justo lo que buscaría un atacante.
- **Un código malo cuenta como intento fallido.** Si no, el segundo factor se
  podría probar a fuerza bruta —son seis dígitos— con la contraseña ya en la
  mano.

La tolerancia de reloj es de una ventana a cada lado (90 s en total): menos y
falla por el desfase normal entre el móvil y el servidor, y un segundo factor
que falla se acaba desactivando. Más, y un código visto de reojo sigue
valiendo minutos después.

Para darlo de alta: `node backend/scripts/preparar-2fa.js`. **Comprueba el
código ANTES de publicar el secreto**, y ese orden es todo el punto: poniéndolo
en la Lambda primero, un dedazo al teclear la clave deja al administrador fuera
de su propio panel sin forma de entrar. El secreto no se escribe en ningún
archivo —vive en la pantalla y en el móvil— porque un archivo con el segundo
factor dentro, al lado del repositorio, anula el segundo factor entero.

### Una variable de la Lambda se añade con su guion, nunca con el CLI a pelo

`aws lambda update-function-configuration --environment` **REEMPLAZA el
conjunto entero**. Pasar una sola variable deja la función con esa y nada más:
sin los seis hashes no entra nadie, sin `SESION_SECRETO` ninguna sesión vale y
sin `ORIGENES_PERMITIDOS` el dominio real deja de poder llamar al backend. Y no
avisa: la orden sale bien y la página se cae en la siguiente petición.

Para eso está `backend/scripts/anadir-variable-lambda.js`, que lee las que ya
hay, suma la nueva, y comprueba después que no se perdió ninguna. Nunca
imprime un valor.

---

## ⚠️ VERIFICAR — Lo que endureció la auditoría del 2026-11-07

### El freno de intentos era un interruptor para apagarse solo

Hacía `intentos.clear()` al llegar a 5.000 entradas. Eso no era un detalle de
memoria: bastaba con lanzar cinco mil intentos desde direcciones inventadas
para vaciar el mapa entero —el contador del propio atacante incluido— y
recuperar ocho intentos limpios, tantas veces como hiciera falta.

Cambiarlo por «desalojar lo más viejo» tampoco bastaba, y la prueba lo enseñó:
quien lleva más rato atacando es precisamente el más antiguo del mapa, así que
era **el primero en salir**.

La regla que sí aguanta: **lo que ya está bloqueado no se desaloja nunca por
falta de sitio**, sólo cuando se le cumple el plazo. Hay prueba que inunda con
30.000 direcciones y comprueba que el bloqueado sigue bloqueado.

### Una imagen se comprueba por sus BYTES

`/diseno` es la única ruta por la que un desconocido escribe en el Dropbox del
negocio —es el pedido del cliente, que no tiene usuario—. Se fiaba del tipo que
mandaba el navegador, así que se podía subir cualquier cosa con nombre de
`.png`. Ahora se miran los primeros bytes, el tamaño se comprueba **antes** de
decodificar, y la ruta lleva freno por dirección. `/galeria`, que también es
pública y dispara varias llamadas a Dropbox por petición, lleva el suyo.

### La plaza del login se valida antes de leer ninguna variable

Era `process.env[\`HASH_${sucursal}\`]`, o sea: lo que tecleaba el usuario
elegía qué variable de entorno se leía. Entrando como `admin` se cogía
`HASH_ADMIN` y salía una sesión **no administradora** con plaza «admin», que
`puedeSurtir` aceptaba. Hacía falta la contraseña buena para llegar ahí, pero
una ruta que deja elegir la variable de entorno al que llama no se deja
abierta.

### `config/site.json` es público y ahora tiene lista de claves

Es el único archivo que la política del bucket abre al público además de los
inventarios, y la ruta aceptaba **cualquier objeto**. Un descuido —pegar algo
en el formulario equivocado— publicaba lo que fuera en una URL que lee
cualquiera, sin que nada avisara. Sólo pasan las seis secciones que la página
usa: `tabs`, `hero`, `colores`, `footer`, `dropboxCatalogos`, `whatsapp`.

### Lo que se cambió en AWS, y lo que queda

Hecho y comprobado el 2026-11-07 (el inventario público sigue dando 200 y
`caja/` sigue dando 403):

| | |
|---|---|
| `BlockPublicAcls` e `IgnorePublicAcls` | **activados**. No chocan con la política del bucket porque sólo afectan a las ACL, y cierran la vía de que un objeto se publique por error |
| Versionado del bucket | **activado**. Una sobrescritura mala en `caja/` o `revisiones/` ya se puede deshacer |

Los otros dos no se pueden tocar con las protecciones puestas y van a mano:

- **La política del CI** (`istuffs-s3-uploader`) da hoy `GetObject` y
  `PutObject` sobre **todo** el bucket, y su llave vive en GitHub: un
  compromiso de ahí lee los nombres de los mayoristas y las notas con nombres
  de empleados. La versión recortada —sólo los cuatro prefijos que de verdad
  publica, y Deny explícito sobre `revisiones/`, `ajustes/`, `surtidos/` y
  `config/`— está en **`infra/istuffs-s3-policy.json`**.
- **`istuffs-admin` tiene `AdministratorAccess`, llave permanente y sin MFA.**
  Es el riesgo más grande de todos y el más barato de cerrar.

**El límite de concurrencia de la cuenta es 10**, y eso cambia el análisis:
el gasto desbocado está acotado solo, pero diez peticiones a `/login` —cada una
quema 210.000 iteraciones de PBKDF2— bastan para dejar el backend sin sitio.
Reservar concurrencia dejaría cero libre, así que **no se hace**: lo que
protege ahí es el freno de intentos.

---

## Lo que está roto a sabiendas

- **La galería de Dropbox.** Las carpetas configuradas
  (`.../CATALOGOS/Fundas` y `/Personalizados`) **no existen**. Lleva roto
  desde antes y el código viejo se tragaba el error. Falta que el dueño diga
  dónde están esas imágenes.
- **Los turnos ya no se congelan.** El paso «Extraer turnos del personal»
  entró en la corrida de GitHub Actions y `personal/turnos.json` se publica
  solo. Comprobado el 2026-10-19.
- ~~**Las cinco contraseñas sin rotar.**~~ **HECHO el 2026-11-06.** Las cinco
  —más la de bodega, que es nueva— se rotaron con
  `backend/scripts/generar-credenciales.js` y se subieron con
  `backend/scripts/subir-variables-lambda.js --aplicar`. `SESION_SECRETO`
  también es nuevo, así que las sesiones viejas murieron. Comprobado: 14
  variables en la Lambda, los seis hashes presentes, una contraseña inventada
  da 401 y el dominio real sigue en `ORIGENES_PERMITIDOS`.

- **El SECRETO de la app de Dropbox sigue siendo el expuesto.** Medido el
  2026-11-06 comparando `.env` contra `.env.respaldo-seguridad`, que es la
  foto de antes de arreglar la fuga:

  | | |
  |---|---|
  | `DROPBOX_REFRESH_TOKEN` | **rotado** |
  | `S3_ACCESS_KEY` / `S3_SECRET_KEY` | **rotadas** |
  | `DROPBOX_APP_SECRET` | **el mismo que se expuso** |
  | `DROPBOX_APP_KEY` | el mismo, pero es un identificador, no un secreto |

  Así que las dos frases que había en este archivo estaban a medias: una decía
  que el token de Dropbox ya se había rotado —cierto— y la otra que seguía
  pendiente —cierto también, pero del SECRETO, no del token—.

  Por sí solo el secreto no abre la cuenta: hace falta además un refresh token
  válido, y ése se cambió. Pero es material expuesto y se regenera en la
  consola de apps de Dropbox.
- ~~**La llave de AWS vieja, inactiva pero sin borrar.**~~ **HECHO.**
  Comprobado el 2026-11-07: `istuffs-admin` sólo tiene una llave, activa, del
  2026-10-19. La inactiva del 2026-05-19 de **`istuffs-s3-uploader`** se borró
  el 2026-11-08; comprobado el 2026-11-09, sólo queda su llave activa.
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
