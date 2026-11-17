# Prepara las fotos de muestra que el bot del CRM manda por WhatsApp.
#
#   python scripts/crm-preparar-fotos.py "C:/Users/<usuario>/fotos-crm/1-materiales"
#
# Los originales viven FUERA del repositorio (pesan hasta 23 MB cada uno). Aquí
# sólo entra la versión ligera, en public/crm/. Tres decisiones:
#
# - JPEG y no WebP: la Cloud API de WhatsApp documenta JPEG y PNG para imágenes.
# - Se endereza con EXIF: las fotos de celular vienen «acostadas» con una marca
#   de giro, y sin esto salen de lado.
# - Lado mayor de 1280 px: de sobra para un teléfono, y pesa ~100-250 KB.
#
# El mapa de abajo es la SELECCIÓN: qué original se publica y con qué nombre.
# Lo que no está aquí no se publica.
import os, sys
from PIL import Image, ImageOps

SELECCION = {
    'material-goma-flexible.jpg':          'goma-flexible/TPU 5.jpg',
    'ejemplo-goma-flexible.jpg':           'goma-flexible/muestra personalizado/20261003_153022.jpg',
    'material-goma-flexible-color.jpg':    'goma-flexible COLORES/COLOR TPU 9.jpg',
    'ejemplo-goma-flexible-color.jpg':     'goma-flexible COLORES/muestra personalizado/IMG-20260609-WA0054.jpg',
    'material-cristal.jpg':                'goma-flexible cristal/GLASS 1.jpg',
    'material-hard.jpg':                   'hard/hard case 2.jpg',
    'ejemplo-hard.jpg':                    'hard/muestra personalizado/hard case.jpg',
    'ejemplo-uso-rudo.jpg':                'uso-rudo/3 in 1.jpg',
    'ejemplo-uso-rudo-2.jpg':              'uso-rudo/3 in 1 3.jpg',
    'sucursal-leon.jpg':                   'SUCURSALES/SUCURSAL LEON.jpg',
    'sucursal-san-luis.jpg':               'SUCURSALES/SLP.jpg',
    'sucursal-aguascalientes.jpg':         'SUCURSALES/AGUASCALIENTES LOCAL 143.jpeg',
}
LADO = 1280

def main():
    origen = sys.argv[1]
    destino = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'crm')
    os.makedirs(destino, exist_ok=True)
    for nombre, relativo in SELECCION.items():
        im = ImageOps.exif_transpose(Image.open(os.path.join(origen, relativo))).convert('RGB')
        im.thumbnail((LADO, LADO))
        salida = os.path.join(destino, nombre)
        im.save(salida, 'JPEG', quality=82, optimize=True)  # sin EXIF: no viaja la ubicación de la foto
        print(f'{nombre:38} {im.size[0]}x{im.size[1]}  {os.path.getsize(salida) // 1024} KB')

main()
