// ISTUFFS - Imprimir
//
// Prepara la hoja para sublimar SIN tocar la plantilla de trabajo:
//   1. Duplica el documento abierto.
//   2. En la copia deja solo la mascara visible + el diseno recortado
//      (fuera mockup, marca de agua y la mascara oculta).
//   3. Las junta en una capa y la gira 90 grados exactos dentro de la hoja.
//   4. Abre el menu normal de Imprimir para elegir los ajustes de sublimacion.
//   5. Cierra la copia sin guardar.
//
// La plantilla original se queda derecha, con sus bloqueos, lista para
// corregir y volver a imprimir.

#target photoshop
//@include "istuffs-comun.jsxinc"

conPixeles(function () {
    if (!app.documents.length) { alert('No hay ninguna plantilla abierta.'); return; }

    var original = app.activeDocument;
    var copia = original.duplicate(sinExtension(original.name) + ' - IMPRIMIR');

    try {
        var imp = buscarImpresion(copia);
        if (!imp) {
            alert('No encontré la máscara con el diseño recortado encima.\n' +
                  'Revisa que el diseño del cliente esté recortado (Alt+clic) sobre la máscara visible.');
            return;
        }

        var guardar = {};
        guardar[imp.base.id] = true;
        for (var i = 0; i < imp.recortadas.length; i++) {
            if (imp.recortadas[i].visible) guardar[imp.recortadas[i].id] = true;
        }

        // Fuera todo lo demas, de abajo hacia arriba para no romper recortes.
        var capas = capasPlanas(copia);
        for (var k = capas.length - 1; k >= 0; k--) {
            var l = capas[k];
            if (guardar[l.id]) { desbloquear(l); continue; }
            desbloquear(l);
            try { l.remove(); } catch (e) { l.visible = false; } // el Fondo no siempre se deja borrar
        }

        if (copia.layers.length > 1) copia.mergeVisibleLayers();

        var capa = null;
        for (var j = 0; j < copia.artLayers.length; j++) {
            if (copia.artLayers[j].visible) { capa = copia.artLayers[j]; break; }
        }
        copia.activeLayer = capa;
        desbloquear(capa);
        capa.rotate(90, AnchorPosition.MIDDLECENTER);

        // Girado puede quedar pegado o salido de la orilla, donde la impresora
        // no llega: se centra en la hoja.
        var W = copia.width.as('px'), H = copia.height.as('px');
        var b = limites(capa);
        if (b[2] - b[0] > W || b[3] - b[1] > H) {
            alert('Ojo: girado, el molde no cabe en la hoja. Revisa la vista previa antes de imprimir.');
        }
        capa.translate((W - b[0] - b[2]) / 2, (H - b[1] - b[3]) / 2);

        // Modo prueba (lo pone el verificador): guarda la hoja en vez de imprimir.
        if ($.global.ISTUFFS_PRUEBA) {
            copia.saveAs(new File($.global.ISTUFFS_PRUEBA + '/imprimir.png'), new PNGSaveOptions(), true);
            return;
        }

        // El menu de Imprimir de siempre, para elegir impresora y ajustes.
        try {
            executeAction(charIDToTypeID('Prnt'), undefined, DialogModes.ALL);
        } catch (e) {
            // Cancelar en el menu de Imprimir tambien llega aqui: no es un error.
        }
    } finally {
        copia.close(SaveOptions.DONOTSAVECHANGES);
        app.activeDocument = original;
    }
});
