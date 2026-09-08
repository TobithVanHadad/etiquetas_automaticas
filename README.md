# Industrial Multilingual Label Platform

MVP full-stack para generacion dinamica de etiquetas industriales multiidioma enfocada en Zebra ZT610 203 DPI y exportacion compatible con BarTender.

El sistema esta disenado como motor de composicion desde datos semanticos, no como editor manual de plantillas. El layout se calcula automaticamente desde producto, idiomas, informacion nutricional y tamano fisico de etiqueta.

## Arquitectura

- `packages/core`: modelo semantico, idiomas, motor de layout, preview model, ZPL, BTXML, JSON y CSV.
- `apps/api`: Fastify + SQLite nativo de Node para persistir productos y generar exports.
- `apps/web`: Next.js 14 + React + TailwindCSS para edicion de datos, combinaciones, preview y exportacion.

## Comandos

```bash
npm install
npm run build
npm run dev
```

Builds separados para deploy:

```bash
npm run build:api
npm run build:web
npm run start:api
npm run start:web
```

Web: `http://localhost:3000`

API: `http://localhost:4000`

## Principios implementados

- No se guardan posiciones manuales ni cajas de usuario.
- Las secciones se almacenan por idioma.
- Las tablas nutricionales se generan desde JSON estructurado.
- El layout adapta margenes, columnas, spacing, tamano de fuente y posicion/ancho de tabla.
- La altura minima de texto se bloquea en `1.2 mm`.
- La salida ZPL usa coordenadas en dots para 203 DPI, `^CI28` y bloques multilinea.
- BarTender queda como exportacion enterprise/fallback mediante BTXML y datos estructurados.
- El preset `Crevel actual` usa composicion compacta: titulo corto, idiomas inline como `(DE) Zutaten:` y tabla nutricional con borde industrial.
- Los GTIN son opcionales y no se imprimen si el campo queda vacio.
- El minimo en Arial se bloquea en `6.2 pt`; Zebra interna conserva el minimo industrial equivalente configurado por el motor.
- Las columnas nutricionales de porcion y `%RI` solo se imprimen cuando se activan explicitamente.
- Los perfiles de impresora soportados en la UI son `Zebra ZT610 203 DPI` y `Zebra ZT610 300 DPI`; el ZPL recalcula dots fisicos segun el DPI activo.
- La configuracion visual de etiqueta se guarda en `metadata.labelSpec` junto al producto para conservar margen, tamano, DPI y ajustes de tabla.

## Direccion local-first

La direccion recomendada es convertir este MVP en una app instalable local-first:

- UI empaquetada en Tauri o Electron.
- SQLite local como base principal, sin depender de Excel como almacenamiento.
- Importacion/exportacion Excel/CSV como adaptador de entrada y salida.
- Impresion ZPL RAW directa a Windows/Zebra.
- Sin servidor publico obligatorio para operar en planta.
- Sincronizacion futura opcional con Railway, Cloudflare, Odoo, SAP o SharePoint.

Esto mantiene el motor independiente: la etiqueta sale de datos estructurados y reglas de composicion, no de objetos manuales.

## Endpoints principales

- `GET /health`
- `GET /languages`
- `GET /products`
- `GET /products/:sku`
- `POST /products`
- `POST /layout`
- `POST /export/zpl`
- `POST /export/btxml`
- `POST /export/json`
- `POST /export/csv`
- `POST /print/zebra`

## Carga desde Excel

El MVP importa CSV/TSV. En Excel, guarda o exporta la hoja como CSV y usa el boton `Importar`.

Si el producto ya tiene `Notas etiqueta` o adjuntos de etiqueta, la importacion conserva esos datos a menos que la fila importada traiga un valor nuevo para ese campo. El estatus inicial queda en blanco.

Columnas esperadas:

```csv
sku,language,section,value,per100g,perServing,riPercent
TAM001,,name,Corn tamale with chili,,,
TAM001,ES,ingredients,"Masa de maiz, agua, chile",,,
TAM001,ES,nutrition.vitamin_c,Vitamina C,9 mg,6.3 mg,8%
```

Secciones de idioma: `name`, `ingredients`, `warnings`, `conservation`, `origin`, `importer`.

Filas nutricionales: usar `nutrition.<id>`, por ejemplo `nutrition.energy`, `nutrition.fat`, `nutrition.vitamin_c`, `nutrition.calcium`.

Unidad base nutricional:

```csv
sku,language,section,value,per100g,perServing,riPercent
TAM001,,nutrition.baseQuantity,100,,,
TAM001,,nutrition.baseUnit,g,,,
```

Unidades soportadas en el MVP: `g`, `ml`, `kg`, `l`.

La tabla nutricional combina dinamicamente los terminos de los idiomas seleccionados, por ejemplo `DE-ES` genera `Energie / valor energético` y `Fett / grasas` usando los terminos oficiales del catalogo importado desde `nutrition_terms_comparison.xlsx`.

## Raw text

El panel `Raw text` permite pegar texto crudo de una etiqueta. El MVP detecta:

- `SKU`
- `GTIN` si existe
- peso/contenido neto
- titulo base
- idiomas marcados como `(DE)`, `(ES)`, `(EN)`, etc.
- secciones principales como ingredientes, advertencias, conservacion, origen e importador
- valores nutricionales cuando encuentra filas reconocibles

Al detectar texto crudo, el producto se regenera desde ese contenido para no arrastrar datos viejos del ejemplo. Si no existen marcadores explicitos como `(DE)` o `(ES)`, el MVP infiere el idioma mas probable desde vocabulario de secciones y terminos nutricionales. Las vitaminas y minerales solo aparecen si estan en el texto detectado o si se agregan manualmente desde el catalogo nutricional. Las frases en mayusculas detectadas en el cuerpo se guardan con marcador de negrita.

Los faltantes aparecen en rojo. El usuario puede completar, agregar o quitar filas desde el panel nutricional. El boton `Guardar` del panel Raw detecta y persiste el producto en el catalogo/API cuando no hay faltantes.

## Archivos de etiqueta

Cada producto puede guardar adjuntos de referencia: imagenes, PDF, `.nlbl` y `.btw`. Estos archivos quedan en `metadata.attachments` junto al producto para conservar notas historicas sin mezclar eso con el motor de layout.

Limites del MVP:

- 15 MB maximo por archivo.
- 45 MB maximo por producto.
- La app muestra un aviso si el archivo no es permitido o si no se pudo guardar.

## Impresion de prueba

Perfiles de impresora previstos:

- `ZDesigner ZT610-203dpi ZPL`
- `ZDesigner ZT610-300dpi ZPL`

La UI incluye `Imprimir`, que pide confirmacion antes de enviar ZPL RAW a Windows. Para una prueba sin papel, el endpoint acepta `dryRun: true` y devuelve el ZPL sin mandarlo al spooler.

En Railway/Linux el endpoint genera ZPL, pero no puede imprimir fisicamente en una Zebra conectada por USB a una computadora local. Para impresion real se debe usar el equipo Windows conectado a la impresora o un agente local de impresion.

## Deploy Railway

Este repo es un monorepo npm compartido. En Railway se recomienda crear dos servicios desde el mismo repo de GitHub:

- Servicio API: build command `npm run build:api`, start command `npm run start:api`.
- Servicio Web: build command `npm run build:web`, start command `npm run start:web`.

Variable requerida en el servicio Web:

```bash
SERVICE_ROLE=web
NEXT_PUBLIC_API_URL=https://TU-DOMINIO-DE-API.up.railway.app
```

Variables requeridas/recomendadas en el servicio API:

```bash
SERVICE_ROLE=api
DATA_DIR=/data
```

El servicio API usa `PORT` de Railway automaticamente. El repo incluye `.nvmrc` con Node 24 y `apps/web/.env.example`. Despues se puede apuntar un subdominio de Cloudflare al dominio publico de Railway con un `CNAME`, sin tunel.

## Nota industrial

Para produccion, la Zebra ZT610 deberia recibir fuentes descargables Unicode compatibles con los alfabetos requeridos. El ZPL generado ya prepara `^CI28`; la seleccion y despliegue de fuente fisica queda como paso de instalacion por planta.
