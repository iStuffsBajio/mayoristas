# Registro de cambios del proyecto

Este registro resume cambios relevantes del producto y de su documentación;
no sustituye el historial completo de Git.

## 2026-11-11

- **Torreón en la consulta del mayorista.** La portada ya deja elegir Torreón y
  enseña sus piezas con la fecha de su respaldo. El panel sigue sin contarla.

- **El bono de puntualidad va por minutos acumulados:** 10 de tolerancia al día;
  lo que pasa se suma en la semana —hasta 20 entero, hasta 30 a la mitad, más
  nada— y proporcional para quien trabaja menos días. Los límites se editan en
  Parámetros.
- **Daniela y Jenni, cada una con su recibo:** $2,000 y $500 de bono cada una,
  Jenni no abre caja: cobra su sueldo fijo y su bono sigue la puntualidad de
  Daniela («Puntualidad compartida con» y «no abre caja», en Parámetros).

- **Nómina y RH.** «Mi pago» en el panel de cada sucursal (sueldo, aperturas,
  bono de puntualidad, comisiones, total, historial y recibo para imprimir y
  firmar) y «Nómina y RH» dentro de Personal: resumen de pago con «marcar
  pagado», puntualidad con justificaciones y quién abrió, bandeja de comisiones
  con foto y autorización en lote, vacaciones y antigüedad según la ley,
  parámetros editables (empleados, sueldos, bonos, horarios, tolerancia,
  comisión) y bitácora. Las comisiones autorizadas se registran solas como
  salida de efectivo, y el corte ahora resta también lo capturado en la página.
  La extracción publica los tickets con cruce de productos y trae los turnos de
  Torreón.

## 2026-11-10

- **El diseño del corte en todo el panel:** Dashboard, Ventas, Inventarios,
  Surtido, Bodega, Revisar y Depurar llevan secciones con cabecera de color,
  cifras grandes con su color de fondo y franjas por tema (ventas azul,
  inventario verde azulado, agotado rosa, comprar morado, dinero verde,
  revisar ámbar). Piezas compartidas en `src/components/Diseno.jsx`.

## 2026-11-09

- **Efectivo y corte, en una sola pestaña** del administrador: el corte semanal
  es una subsección de Efectivo, junto a Resumen, Depósitos por sucursal,
  Faltantes y Parámetros, y la tabla diaria de depósitos usa los mismos colores
  por concepto que el corte. Las tiendas siguen viendo sólo su corte.

- **El corte, más visual:** cada concepto con su color (ventas azul, otras
  entradas verde, tarjeta y transferencia verde azulado, gastos ámbar, sueldo
  morado, comisiones rosa), cifras grandes arriba de cada semana, barras en las
  ventas por día y el estado de resultados como cascada. El ranking de
  mayoristas pasa a ser una tabla ordenable como la venta de productos, y ya no
  dice que «no compraron» los clientes cuando lo que falta es el detalle por día.

- **Corte, segunda vuelta con las respuestas del dueño:** el administrador
  asigna el fondo de caja de cada plaza desde el corte; las comisiones van
  aparte del sueldo y los dos se señalan si no traen el nombre del trabajador;
  cada semana enseña los tickets que rompen las **reglas de mayoreo** (mayoreo
  sin funda ni mica; el mayorista que no viene tantas veces como productos) y
  los **cobros con tarjeta y transferencia con su referencia**, avisando de los
  que vienen sin ella. Nuevo guion `backend/scripts/cambiar-contrasena.js` para
  cambiar la contraseña de una plaza tecleándola en una ventana.

- **Fase C — el corte semanal de cada sucursal.** Sección **Corte** en el panel
  de cada tienda y del administrador: ventas de la semana del punto de venta
  día por día, piezas de fundas, hidrogel y stickers, otras entradas, gastos y
  sueldo con su concepto, el estado de resultados y el conteo de billetes y
  monedas con la diferencia en vivo, sin tolerancia. Torreón lleva un ciclo de
  cuatro semanas con bloque global. El administrador ve todas las plazas juntas
  con avisos y puede abrir cada una. **Ranking de mayoristas** de 7 a 30 días:
  cada tienda el suyo, el administrador todos. Nuevas rutas `GET /corte` y
  `POST /corte/conteo`; los conteos se guardan en `cortes/<plaza>.json`
  (privado). La extracción de ventas publica el detalle por día y tipo y por
  mayorista.

- Bodega tiene **Consultar modelo**: buscar un modelo o abrir uno de los más
  vendidos, con su venta y existencia por tienda y lo que hay en bodega.
- Se miden los **días en cero** de cada código en los últimos 90 desde el
  kárdex de Eleventa (`inventarios/<plaza>/agotados.json`). La ficha dice por
  plaza si su venta es de fiar, y «Pedir por venta» y «Comprar» marcan con ⚠
  los modelos que vendieron poco porque estaban agotados. La cantidad a pedir
  no cambia.

- **Fase 1 de la especificación del 2026-11-09:**
  - Sección **Depurar** en el panel de administración, con cuatro listas
    (modelos de salida, sin rotación de más de un año, obsoletos en ceros, marca
    o departamento), Excel de cuatro hojas y un candado que impide dar de baja
    un código con piezas en la red o con ventas en el último año. El candado
    manda en el servidor y sin el inventario de cualquier plaza no se baja nada.
  - Marca «descontinuado en bodega»: lo marcado deja de reclamarse en Revisar.
  - «Modelos nuevos» ya no cuenta como nuevo un código nuevo de un teléfono que
    existía (el caso del Galaxy S10e).
  - La ficha de un modelo en Ventas trae existencia por tienda y bodega, días en
    cero y rotación; es la misma que ve bodega. Ahora incluye Torreón.
  - La sincronización publica `UltimaVenta` y `Departamento` en cada inventario,
    y **Torreón entra a la sincronización**, a la extracción de ventas y al
    historial.
  - El inventario público ya no puede publicar a un cliente mayorista: el
    departamento de Torreón se escribe en singular y se coló por ahí.
  - Lo cobrado a $0.01 se trata como mayorista y no cuenta como pieza.

## 2026-11-08

- Se añadió `AGENTS.md` como fuente compartida de instrucciones para Codex y
  Claude Code; `CLAUDE.md` la importa sin reemplazar su historial existente.
- Se crearon los documentos de contexto, estado, tareas y decisiones.
- Se actualizó `README.md` y `SEGURIDAD.md` para corregir dos estados que
  contradecían las notas más recientes del proyecto.
- Se añadieron plantillas y guía de instalación para las instrucciones globales;
  las rutas fuera del repositorio siguen sin modificarse.
- Se refinó visualmente el dashboard administrativo (`84b9853`) y **se revirtió
  esa misma noche** (`22568de`). El dashboard en producción es el anterior al
  rediseño.
- Las pruebas de fechas corren con la zona horaria de México en Amplify
  (`cf95b84`), para que el build no dependa de la hora del servidor.
- Se borró la llave de acceso inactiva del usuario `istuffs-s3-uploader`;
  comprobado en AWS el 2026-11-09, sólo queda la activa.
