// ISTUFFS - Previo WhatsApp
//
// Saca la imagen para mandar a un mayorista SIN tocar la plantilla:
//   1. Duplica el documento abierto.
//   2. En la copia prende la marca de agua (aunque en la plantilla este apagada).
//   3. Recorta al celular (mockup + molde) con un margen.
//   4. Guarda un JPG ligero en Escritorio\PREVIOS WHATSAPP y abre la carpeta
//      para arrastrarlo a WhatsApp.
//   5. Cierra la copia sin guardar.

#target photoshop
//@include "istuffs-comun.jsxinc"

var LADO_MAXIMO = 1600; // px del lado largo del JPG
var MARGEN = 60;        // px alrededor del celular

function dosDigitos(n) { return (n < 10 ? '0' : '') + n; }

conPixeles(function () {
    if (!app.documents.length) { alert('No hay ninguna plantilla abierta.'); return; }

    var original = app.activeDocument;
    var nombre = sinExtension(original.name);
    var copia = original.duplicate(nombre + ' - PREVIO');
    var prueba = $.global.ISTUFFS_PRUEBA; // lo pone el verificador
    var carpeta = new Folder(prueba || (Folder.desktop + '/PREVIOS WHATSAPP'));

    try {
        var marca = buscarMarca(copia);
        if (marca) marca.visible = true;
        else alert('Esta plantilla no tiene marca de agua: el previo sale sin ella.');

        // Recorte al celular: lo que ocupen el mockup y el molde que se imprime.
        var cajas = [];
        var mockup = buscarMockup(copia);
        if (mockup && mockup.visible) cajas.push(limites(mockup));
        var imp = buscarImpresion(copia);
        if (imp) cajas.push(limites(imp.base));

        if (cajas.length) {
            var c = cajas[0].slice(0);
            for (var i = 1; i < cajas.length; i++) {
                c[0] = Math.min(c[0], cajas[i][0]); c[1] = Math.min(c[1], cajas[i][1]);
                c[2] = Math.max(c[2], cajas[i][2]); c[3] = Math.max(c[3], cajas[i][3]);
            }
            var W = copia.width.as('px'), H = copia.height.as('px');
            copia.crop([Math.max(0, c[0] - MARGEN), Math.max(0, c[1] - MARGEN),
                        Math.min(W, c[2] + MARGEN), Math.min(H, c[3] + MARGEN)]);
        }

        copia.flatten(); // las capas ocultas (la otra mascara) se descartan aqui
        if (copia.height.as('px') > LADO_MAXIMO) {
            copia.resizeImage(undefined, UnitValue(LADO_MAXIMO, 'px'), undefined, ResampleMethod.BICUBIC);
        }

        if (!carpeta.exists) carpeta.create();
        var d = new Date();
        var sello = d.getFullYear() + '-' + dosDigitos(d.getMonth() + 1) + '-' + dosDigitos(d.getDate()) +
                    ' ' + dosDigitos(d.getHours()) + dosDigitos(d.getMinutes()) + dosDigitos(d.getSeconds());
        // Guardar para Web: sin esto el JPG arrastra los metadatos del PSD (~12 MB).
        var opciones = new ExportOptionsSaveForWeb();
        opciones.format = SaveDocumentType.JPEG;
        opciones.quality = 80;
        opciones.includeProfile = false;
        // Guardar para Web cambia los espacios por guiones: se exporta y se renombra.
        var temporal = new File(carpeta.fsName + '/previo-temporal.jpg');
        copia.exportDocument(temporal, ExportType.SAVEFORWEB, opciones);
        temporal.rename(nombre + ' ' + sello + '.jpg');
    } finally {
        copia.close(SaveOptions.DONOTSAVECHANGES);
        app.activeDocument = original;
    }

    if (!prueba) carpeta.execute();
});
