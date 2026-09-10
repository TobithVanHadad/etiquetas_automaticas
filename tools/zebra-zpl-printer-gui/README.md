# Zebra ZPL Printer

Aplicacion sencilla para Windows que imprime archivos `.zpl` directamente en una impresora Zebra instalada en el equipo.

Uso:

1. Abre `ZebraZplPrinter.exe`.
2. Selecciona el archivo `.zpl`.
3. Selecciona la impresora Zebra instalada en Windows.
4. Presiona `Imprimir ZPL`.

Tambien puedes arrastrar un archivo `.zpl` encima de la ventana.

Para ver las fuentes cargadas en la impresora:

1. Selecciona la impresora Zebra.
2. Presiona `Listar fuentes`.
3. Revisa las etiquetas impresas. Los nombres `.FNT`, `.TTF`, `.TTE` u `.OTF` son los que puedes usar como fuente ZPL.

Notas:

- No requiere BarTender.
- No abre el ZPL como PDF: lo manda en modo RAW a la impresora.
- Si la impresora no aparece, escribe el nombre exacto de Windows en el selector de impresora.
- Incluye `test-label.zpl` para hacer una prueba rapida.
