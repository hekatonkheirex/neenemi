# DCSS Suite

DCSS significa **Document & Collaborative Solutions Support**. Es la suite unificada de Data Systems para Electron.

Este proyecto se construirá de forma aislada de las aplicaciones actuales del
workspace. Los directorios hermanos son la referencia funcional durante la migración y
no deben modificarse para implementar esta suite.

## Versionado

Cada cambio entregado actualiza la versión visible en la barra lateral, el manifiesto y el
instalador. Se incrementa el parche por defecto; cambios funcionales o incompatibles
pueden requerir un incremento menor o mayor. v0.1.1 incorporó el nombre DCSS Suite;
v0.1.2 mantiene fijos el selector de módulos y el número de versión al desplazar el contenido;
v0.1.3 renombra el instalador y la base SQLite a DCSS Suite;
v0.1.4 devuelve los iconos del lanzador legado al selector de módulos;
v0.1.5 sustituye las iniciales del encabezado por un símbolo de documento y colaboración;
v0.1.6 mantiene el subtítulo del encabezado en dos líneas sin reducir el icono;
v0.1.7 reemplaza el símbolo del encabezado por dos documentos superpuestos;
v0.1.8 introduce un monograma DC diseñado para la cabecera de la suite;
v0.1.9 protege la API local, permite elegir entre perfiles antiguos, recupera caídas
del servicio, muestra los errores del Resumen y lleva el monograma al icono instalado;
v0.1.10 mejora el contraste y unifica los botones de cierre de los diálogos de Proformas.
v0.1.11 actualiza el icono instalado con el logotipo DCSS suministrado.
v0.1.12 actualiza el logo del encabezado con el logotipo DCSS suministrado.
v0.1.13 reemplaza el favicon SVG legado por el icono DCSS en PNG.
v0.1.14 incorpora Tracking de técnicos: carga coordinada CSV/XLSX, mapa diario de
marcaciones, intervalos y distancias directas, y validación de proximidad a sedes
confirmadas manualmente con radio de 100 metros.
v0.1.15 guarda las sedes de Tracking por número de serie y las asigna automáticamente
a los informes y futuras cargas del mismo equipo.
v0.1.16 identifica debajo de cada selector de archivos el reporte de Superset
correspondiente: SGS - Tecnicos asignados y SGS - I.S. Pendientes y Asignados - Tracking.
v0.1.17 completa las rutas de exportación de Superset con las opciones
“Detalle de Servicios” para informes y “Del mobile” para geolocalización.
v0.1.18 añade un resumen diario de Tracking con distancia directa acumulada,
tiempo total registrado y tiempo de servicios sin duplicar intervalos solapados.
v0.1.19 corrige el resumen: muestra el tiempo total estimado de traslado sumando
los intervalos entre visitas, en lugar del período total de marcaciones.
v0.1.20 incorpora direcciones de casa matriz cuando no hay sucursal y búsqueda
externa puntual de ubicaciones propuestas, con confirmación manual antes de validar.
v0.1.21 activa automáticamente el fondo de calles de Tracking, sin casilla de activación.
v0.1.22 excluye las claves de API del respaldo SQLite y de la lectura de configuración, actualiza
pdfjs-dist a 6.x (corrige ejecución de JavaScript con PDF maliciosos) y fija el total de módulos en la prueba del manifiesto.
v0.1.23 corrige contradicciones y erratas del README y documenta Tracking en la auditoría de
paridad, el glosario y la nota de auditoría de dependencias.
v0.1.24 elimina `docs/PARIDAD-LEGADO.md`, obsoleto tras la aprobación de la suite.
v0.1.25 mueve las rutas de uniFLOW, Software Selector y SLA fuera de `server.ts` a `routes.ts` de cada
módulo, centraliza Gemini en `src/core/gemini.ts` y valida con `src/core/validation.ts`; añade pruebas de
las exportaciones de Viáticos y uniFLOW.
v0.1.26 mueve también las rutas de MPS y Cobertura a `routes.ts` y reúne los validadores comunes en
`src/core/validation.ts`; `server.ts` queda con 88 rutas.
v0.1.27 mueve las rutas de Viáticos y Servicios a `routes.ts`, y los ayudantes compartidos de
importación y consulta a `src/core/import-routes.ts` y `src/core/request-parsing.ts`; `server.ts` queda con 75 rutas.
v0.1.28 mueve las rutas de Ventas (Listado de precios y Proformas) a `src/modules/ventas/routes.ts`;
`server.ts` queda con 62 rutas.
v0.1.29 mueve las rutas de Catálogo y Mantenimiento a `routes.ts` de cada módulo;
`server.ts` queda con 47 rutas.
v0.1.30 añade `server.routes-smoke.test.ts`: cada GET `/api/*` sin parámetros debe responder sin error 5xx,
para detectar de inmediato un import o validador perdido al mover rutas.
v0.1.31 mueve las rutas de Operaciones (cartera, metadatos, Discontinuador y stock Waldbott) a
`src/modules/operaciones/routes.ts`; `enqueueImportJob` pasa a `src/core/import-routes.ts`; `server.ts` queda con 33 rutas.
v0.1.32 mueve las rutas de Consumibles a `src/modules/consumibles/routes.ts` y la carga coordinada (preparación,
staging y aplicación en una transacción) a `src/modules/consumibles/bundle-server.ts`; `server.ts` queda con 22 rutas
y 658 líneas.
v0.1.33 mueve las rutas de Sistema (resumen, fuentes, respaldo, restauración, configuración) a
`src/core/system-routes.ts` y las de Importaciones a `src/core/import-api-routes.ts`; `server.ts` queda con 179
líneas: solo middlewares de seguridad, registro de rutas y arranque.
v0.1.34 reparte `server.test.ts` (3.084 líneas) en una prueba `routes.test.ts` junto a las rutas de cada
módulo, con ayudantes compartidos en `src/test-support/api-helpers.ts`; las 316 pruebas se conservan.
v0.1.35 corrige UUID con un override a 11.1.1 sin degradar ExcelJS 4.4.0; el renderer
compila las fuentes de ExcelJS y JSZip en lugar de reutilizar sus bundles precompilados,
con una única implementación de Buffer para las importaciones y exportaciones XLSX.
v0.1.36 corrige el escaneo inicial de dependencias de Vite con caché vacía:
resuelve el archivo de globals inyectado sin externalizarlo y limita las entradas
a `index.html`, excluyendo el HTML de los artefactos de `release/`.
v0.1.37 añade `src/modules/tracking/parser.test.ts` (11 pruebas): normalización de series e identidades, fechas
imposibles, separador `;`, CSV inválido, encabezados faltantes, marcaciones inconsistentes y cruce de informes.
v0.1.38 corrige «Analizar con Gemini» en Software Selector: el prompt pedía 14 claves que no existen en el catálogo
(p. ej. `secure-print`) y sus resultados se descartaban; ahora lista los ids reales y descarta los desconocidos
(`src/modules/software-selector/ai.ts`). Añade `npm run eval:gemini` (`evals/gemini/`), una eval de pago con umbral
de recall de 80 % sobre 10 pliegos sintéticos.
v0.1.39 la eval de Gemini marca como INCOMPLETE una suite con pliegos sin evaluar (cuota 429, saturación 503) en lugar de
aprobarla con el recall de los pliegos que sí respondieron.
v0.1.40 el prompt y la fusión de IA del módulo SLA pasan a `src/modules/sla/ai.ts` (con pruebas) y se añade
`npm run eval:openrouter`: la misma eval con modelos gratuitos de OpenRouter (solo sufijo `:free`), usada cuando la
cuota de Gemini se agota. La app sigue usando únicamente Gemini.
v0.1.41 reemplaza Gemini por OpenRouter en SLA y Software Selector (`src/core/openrouter.ts`), con modelo gratuito por
defecto; se elimina `@google/genai` y `src/core/gemini.ts`, la eval pasa a `npm run eval:ai` (`evals/ai/`) y los botones
dicen «Analizar con IA».
v0.1.42 permite incluir la clave de OpenRouter en el instalador mediante `embedded-ai.json` (ignorado por git, copiado a
`resources/` con `extraResources`); la API la usa solo si no hay clave en la instalación ni en el entorno.
v0.1.43 añade el panel «Configuración de IA (OpenRouter)» en SLA y Software Selector con enlaces para crear una cuenta y
generar una clave, y las rutas `GET/PUT/DELETE /api/ai/config` (valida el formato `sk-or-` y nunca devuelve la clave).

## Análisis con IA

SLA Compliance Analyzer y Canon Software Selector llaman a **OpenRouter** (`https://openrouter.ai/api/v1`) desde la
API local; el renderer nunca ve la clave. El modelo por defecto es gratuito (`nvidia/nemotron-3-super-120b-a12b:free`).

- **Clave desde la interfaz:** SLA Compliance Analyzer y Canon Software Selector tienen el panel plegable «Configuración de
  IA (OpenRouter)» con el estado de la IA, enlaces para crear una cuenta en OpenRouter y generar una clave, y un campo
  para guardarla o quitarla en este equipo (`GET/PUT/DELETE /api/ai/config`; la clave nunca vuelve al renderer).
- **Clave, por orden de prioridad:** (1) guardada en la instalación desde ese panel; (2) `OPENROUTER_API_KEY` en el entorno de la API; (3) la incluida en el instalador
  (`embedded-ai.json`). Las dos primeras no se pueden leer desde la interfaz ni salen en los respaldos SQLite.
- **Clave incluida en el instalador:** para que cualquiera con la app pueda usar la IA sin configurar nada, copia
  `embedded-ai.example.json` a `embedded-ai.json` (raíz del proyecto), pon la clave y empaqueta. El archivo está en
  `.gitignore`, no va en el repositorio, ni dentro del asar ni del renderer: electron-builder lo copia a
  `resources/embedded-ai.json` y Electron pasa su ruta a la API (`DS_EMBEDDED_AI_FILE`). **Cualquiera que tenga el
  instalador puede extraer esa clave**: usa una clave creada solo para esto, con límite de crédito en $0, y rótala si
  el instalador sale de la empresa. Todas las instalaciones comparten el límite de uso de esa cuenta.
- **Modelo:** `OPENROUTER_MODEL` o `PUT /api/settings/ai/openrouter_model`. Los modelos con sufijo `:free` no tienen
  costo, pero tienen límites de uso y disponibilidad; la API reintenta 429 y 5xx y muestra un mensaje claro si persisten.
- **Privacidad:** se envía el texto del pliego (hasta 30.000 caracteres) al proveedor del modelo a través de OpenRouter.
  Los modelos gratuitos pueden aplicar políticas de registro distintas a las de los modelos de pago: revisa la
  configuración de privacidad de la cuenta de OpenRouter antes de enviar documentos de clientes.
- **Calidad:** `npm run eval:ai` mide el recall sobre 10 pliegos sintéticos con umbral de 80 % (`evals/ai/README.md`).
  Los análisis guardados antes con Gemini siguen visibles (`IA Gemini`).

## Alcance

Incluye las herramientas web de Data Systems dentro de una sola aplicación Electron,
con una única interfaz, una única API local y una base SQLite por instalación.

`redact-ds` queda fuera permanentemente y continúa como aplicación Tauri independiente.

## Persistencia objetivo

La base final se ubicará en el directorio de datos de usuario de Electron:

```text
%APPDATA%/dcss-suite/data/dcss.sqlite
```

Al abrir la aplicación instalada por primera vez, la suite copia los datos de prueba de
`%APPDATA%/datasystems-suite/data/` (o de `%APPDATA%/Data Systems Suite/data/`
si se creó con ese nombre) a la carpeta nueva y comprueba la integridad de
la base antes de usarla. La carpeta anterior se conserva como respaldo; cierre la
versión antigua antes de instalar DCSS Suite y compruebe los datos antes de desinstalarla.
En desarrollo, si existe `data/datasystems.sqlite` y aún no existe `data/dcss.sqlite`,
la API crea una copia SQLite consistente con el nombre nuevo sin borrar la base anterior.

Los originales importados se guardan como BLOB en `import_files`, junto con sus metadatos
y los resultados normalizados, para que un respaldo SQLite pueda ser autocontenido. Durante
la transición también se conservan las copias físicas de `data/imports/` como compatibilidad
y recuperación. Al retirar una carga, un trigger conserva su original en
`archived_import_files` antes de eliminar los metadatos de la carga activa. En Resumen se
pueden completar y verificar las fuentes históricas, incluidas las copias anteriores que ya
estaban en `data/imports/.removed/`, sin eliminar los archivos físicos.
Cada fila importada también conserva su posición exacta en la fuente y un detalle consultable
de los campos operativos y de las columnas originales con valor que no forman parte de las
métricas principales. Los importadores de Consumibles, Salidas y Servicios procesan todas las
hojas del XLSX usando los encabezados propios de cada una. Los visores de filas también detectan
encabezados de cartera y de archivos renombrados cuando el export trae títulos previos, para que
la inspección conserve nombres de columnas útiles. Al iniciar, la suite reindexa de forma
idempotente los XLSX históricos ya archivados para completar esa trazabilidad en los registros
antiguos, sin recalcular sus valores normalizados.
La misma reindexación actualiza una sola vez los catálogos derivados de Viáticos cuando cambia el
lector de `CALCULO AUX`, por lo que una corrección del formato no obliga a volver a importar
manualmente la fuente vigente.
La resolución de cabeceras también tolera las variantes habituales de los exports antiguos,
como `Nº de serie`, `Nº de OV`, `Fch/Hora de inicio`, `Razón social` y abreviaturas de cantidad,
rendimiento y precios en guaraníes, manteniendo el respaldo posicional de cada formato.
Cuando una fuente histórica trae sector, área comercial o referencia contractual, esos valores
también quedan en metadatos de origen estructurados, sin reemplazar la clasificación compartida
de la cartera. Los registros normalizados de Consumibles y sus despachos conservan además el tipo
de fuente elegido al importar, por lo que un archivo renombrado sigue identificándose como detalle,
uso o salida desde las tablas y el buscador.
Desde la pestaña Datos de Consumibles también se puede ejecutar manualmente “Recalcular datos”
para volver a leer los XLSX archivados y ver un resumen de archivos, filas recuperadas y posibles
pendientes, sin cambiar los valores normalizados.
La misma pestaña permite limpiar todas las cargas directas de Consumibles con confirmación; los
archivos originales se mueven al archivo recuperable `data/imports/.removed/` y las fuentes
relacionadas quedan intactas.

## Tracking de técnicos

En **Operaciones → Tracking de técnicos**, selecciona dos fuentes originales CSV UTF-8
o XLSX: detalle de informes y geolocalización. El límite es 18 MB por archivo.
La carga se procesa en conjunto y conserva ambos originales, todas las filas y sus
posiciones en el archivo de importaciones compartido. El análisis vigente y las
referencias de sedes se guardan en SQLite (`app_settings`, namespace `tracking`).
Una nueva carga reemplaza el análisis vigente, conserva las referencias y mantiene
las importaciones anteriores en el archivo histórico. “Limpiar cargas” retira el
análisis y archiva los originales; no borra las referencias manuales.

El cruce usa **Nº I.S., técnico y cliente**; un informe sin técnico sólo se vincula
si existe una coincidencia única del I.S. y cliente. Las filas ambiguas o sin
coincidencia permanecen visibles, sin atribuirles un detalle de otro informe.
El detalle admite columnas opcionales `Sucursal`/`Sede` y `Dirección`/`Domicilio`.
Ambas fuentes admiten columnas de número de serie (`Nº de serie`, `N Serie`,
`Serial`, `Serial Number`, entre otras variantes). Se conservan los ceros iniciales
cuando el archivo los contiene como texto. Las series se normalizan a mayúsculas,
sin unir identificadores distintos; etiquetas como `N/A` o `Sin serie` no identifican
un equipo. Si las dos fuentes indican series distintas para el mismo informe,
el detalle no se vincula y se muestra la discrepancia.
La geolocalización lee `TS check-in`, `TS check-out`, `GPS_IN` y `GPS_OUT`.
Las columnas `GPS IN` y `GPS OUT` del export SGS son indicadores, no coordenadas.
Los CSV de referencia suministrados tienen 34 filas de informes, 6.610 registros de
geolocalización de 24 técnicos y ningún Nº I.S. compartido; el módulo informa esa
falta de cobertura sin descartar las marcaciones.

Selecciona técnico y día de **marcación**, no fecha de creación del informe.
Por defecto sólo se incluyen servicios “En Sitio”. El mapa conecta en orden
cronológico los puntos registrados; no reconstruye calles ni posiciones entre
eventos. Un evento sin GPS corta la línea, sin puentear una ubicación desconocida.
La tabla de traslados calcula la distancia geodésica directa entre el GPS de salida
y el siguiente GPS de entrada, y el intervalo entre ambas horas. Ese intervalo puede
incluir esperas y paradas: **no representa tiempo efectivo de conducción**.
Salidas faltantes, marcaciones inconsistentes y servicios solapados se identifican
sin fabricar métricas. Las horas se interpretan como horas locales literales de SGS,
sin convertir su zona horaria; entradas y salidas que cruzan medianoche aparecen
en sus respectivos días.

El **Resumen general**, debajo de los traslados, respeta el técnico, día y filtro
de servicios seleccionados. Suma las distancias directas calculables entre visitas,
no kilometraje vial ni desplazamientos al inicio o fin de la jornada. Indica cuántos
tramos tienen evidencia y señala un total parcial cuando faltan distancias.
El tiempo total estimado de traslado suma los intervalos calculables entre el
check-out de una visita y el siguiente check-in, sin incluir tiempo de servicios.
Las horas permiten calcularlo aunque falte GPS; los tramos sin horas válidas
o solapados se excluyen y se señala un total parcial. Puede incluir esperas
y pausas, por lo que no acredita tiempo efectivo de conducción.
El tiempo de servicios es la unión de los intervalos completos de check-in/check-out:
los duplicados y solapamientos no se suman dos veces, los intervalos que cruzan
medianoche se limitan al día seleccionado y los incompletos o invertidos se excluyen
con aviso. Sin evidencia calculable se muestra “No calculable”, no un cero supuesto.
Estas horas provienen de las marcaciones y **no demuestran trabajo real dentro
del cliente**; la validación geográfica de la sede permanece independiente.

Para validar una visita, selecciona su I.S., elige la **sede real** en el mapa o
introduce coordenadas verificadas y pulsa “Confirmar sede verificada”.
No se propone la posición del técnico como referencia: sería una validación circular.
La dirección puede importarse desde `Dirección`/`Domicilio`/`Dir/Tel`. Las columnas
`Dirección Casa Matriz`, `Domicilio Casa Matriz`, `Dirección Matriz` o
`Dirección de Casa Matriz` se usan sólo cuando falta la dirección de servicio y no
hay sucursal informada. Esto propone una referencia; no demuestra que el equipo
esté en la matriz. Si el archivo no trae direcciones, se pueden escribir en el formulario.

“Buscar dirección en Paraguay” consulta [Photon/Komoot](https://github.com/komoot/photon)
solamente al pulsar el botón y envía el texto de la dirección, no los archivos,
series, nombres de técnicos ni marcaciones GPS. No hay búsquedas automáticas,
por lote o al escribir. Usa una dirección pública con ciudad, calle y número;
no envíes información confidencial. La búsqueda se restringe a Paraguay y muestra
hasta cinco coincidencias con tipo de ubicación y coordenadas. Elegir una centra
el mapa y propone un pin: **no guarda ni valida la sede** hasta confirmar.
Un resultado puede ser una calle, ciudad o sitio aproximado, no el acceso exacto.
Revisa el punto y, si hace falta, ajústalo manualmente antes de confirmar.
El servicio público permite [uso moderado y no garantiza disponibilidad](https://github.com/komoot/photon#demo-server).
La API local limita consultas concurrentes y separa los inicios al menos un segundo;
un error o falta de coincidencias deja disponible la selección manual.
Los resultados muestran atribución a Photon/Komoot y OpenStreetMap.
Si el informe tiene **número de serie**, la referencia se guarda por ese identificador
y se utiliza automáticamente en todos sus informes, técnicos, días y futuras cargas,
sin tener que confirmar la ubicación de nuevo para cada I.S.
El campo “Número de serie del equipo” permite asociarla manualmente al I.S. y cliente
cuando no viene en los archivos. Esa asociación se conserva en SQLite
(`series-by-report`) y se aplica a las filas del mismo informe y cliente, sin modificar
los originales. Una asociación manual confirmada tiene prioridad para ese I.S.
Si se introduce una serie que ya tiene sede confirmada, el formulario recupera
sus coordenadas; confirmar vincula ese informe al equipo.
Cuando un archivo no incluye series, los otros I.S. deben identificarse
manualmente o recibirse en una nueva exportación con la columna de serie.
No se deduce el equipo a partir del nombre del cliente ni la descripción del servicio.

Sin serie, se mantiene el alcance anterior por cliente y sucursal; sin sucursal,
queda limitado al mismo cliente y Nº I.S. Las referencias existentes se conservan
y no se convierten automáticamente en referencias de equipos sin una confirmación.
Si el equipo se traslada, reconfirma su ubicación: la nueva referencia reemplaza
la sede compartida de esa serie y recalcula sus marcaciones. Retirar la referencia
de una serie deja sin sede confirmada todos los informes que la reutilizaban.
Entrada y salida se evalúan independientemente: dentro de 100 m (inclusive), fuera
de 100 m, sin marcación, sin GPS o sin sede confirmada. Se muestran las horas, las
coordenadas y la distancia a la referencia. La proximidad **no demuestra ingreso
físico al edificio ni, por sí sola, una conducta irregular**.

El fondo de calles OpenStreetMap se activa automáticamente y requiere internet;
ya no hay una casilla para habilitarlo. El proveedor recibe la zona visible del mapa,
no los archivos, nombres de técnicos ni direcciones. Si falla la carga del fondo,
se informa el error y se muestra la cuadrícula geográfica; los puntos y cálculos
locales siguen disponibles. El mapa permite desplazamiento, zoom, ajuste del recorrido
y selección manual de ubicaciones. La confirmación de sede sigue siendo explícita.
La superficie objetivo es la aplicación Electron de escritorio.

API local: `GET /api/tracking`, `POST /api/tracking/import` (dos archivos con
`fileName` y `contentBase64`), `PUT /api/tracking/sites` (`visitKey`, `latitude`,
`longitude`, `address` y `serialNumber` opcionales) y `DELETE /api/tracking/sites/:key`.
La búsqueda usa `POST /api/tracking/geocode` (`address`, de 5 a 500 caracteres);
devuelve ubicaciones propuestas sin modificar referencias ni el análisis importado.
No se añadieron dependencias ni tablas nuevas.

## Estado

Rodrigo revisó todos los módulos actuales y aprobó el estado de la suite para despliegue
y uso corporativo por el momento (2026-09-25). Las diferencias funcionales y limitaciones
conocidas descritas aquí quedan
aceptadas para esta etapa; las mejoras pendientes no bloquean esta aprobación.

La carpeta contiene la shell Electron, el manifiesto de módulos, la API local y el
kernel SQLite. El slice funcional actual incluye Catálogo, Listado de Precios,
Proformas, Mantenimiento, Discontinuador, Consumibles (incluida la vista de Servicios vs Consumibles), Viáticos, Tracking de técnicos, uniFLOW Online, Software Selector, SLA, Cobertura y MPS: los XLSX se normalizan en
la base compartida, las reglas comerciales y proformas se guardan en SQLite, y la base
instalada de clientes, contratos y equipos se consulta y actualiza desde las importaciones de Operaciones.
Discontinuador ya cruza las fechas de soporte Canon con los modelos instalados. Mantenimiento
acepta desde la interfaz los archivos CSV/XLSX de contadores, conserva el archivo original y
muestra el análisis por equipo sobre los últimos meses. La cartera y el inventario se pueden buscar por cliente, contrato, OV, tipo, fechas, división,
vigencia, cierre, modelo, serie, ubicación, ciudad, dirección y columnas de origen, con
normalización de tildes y separadores; el inventario conserva y muestra por separado la
referencia interna, el número de OV y los metadatos de contrato.
También acepta la carga directa de contadores CSV/XLSX con filtros, inspector de
historial, tablero ejecutivo, resumen ejecutivo PDF, informe técnico PDF individual por equipo y
reglas por modelo editables; la exportación XLSX histórica fue comprobada por el usuario
con todas sus columnas visibles. Quedan fuera de esa comprobación la importación directa
del formato binario `.xls` (Excel 97-2003) y la equivalencia visual exacta de los PDF legados.

Las exportaciones PDF usan una hoja blanca y colores de informe legibles aunque la aplicación
esté en modo oscuro; al terminar el guardado o la impresión se restablece el tema elegido.

La carga activa se puede limpiar desde el mismo panel para preparar otro archivo; los originales
se mueven al archivo recuperable `data/imports/.removed/` y la cartera compartida permanece intacta.
MPS también puede importar el `canon_mps.db` anterior, enlazar sus modelos
canónicos, proyectar reemplazos por volumen, consultar la ficha técnica, revisar un análisis
ejecutivo, guardar un informe PDF local en formato horizontal MPS y exportar un libro Excel con el resumen, la ficha y la proyección.
Desde la ficha técnica también permite exportar directamente el listado de consumibles del modelo
seleccionado, sin ejecutar una proyección. También permite
crear, editar o duplicar perfiles manuales con sus consumibles; los perfiles importados quedan
protegidos como fuente de referencia. El editor manual conserva los atajos heredados para cargar de una vez los consumibles de perfiles monocromáticos o color. En Electron, la ficha y el análisis se guardan como PDF mediante un diálogo local; si se ejecuta solo el renderer con Vite, se usa el diálogo de impresión del navegador. Discontinuador también puede importar desde
la interfaz una o varias carteras XLSX históricas, conservar sus originales, deduplicar las filas y
enlazar clientes, contratos y equipos con las tablas operativas compartidas. Las columnas pobladas
del registro heredado quedan disponibles desde el cliente, contrato o equipo correspondiente, junto
con la hoja y fila de origen. La cartera filtrada también se puede exportar a un libro XLSX con
hojas de Clientes, Contratos, Equipos y Detalles de origen. También puede
importar la lista Canon `MODELOS DISCONTINUOS...xlsx`: sus registros válidos se guardan como
soporte de modelos, con código de parte opcional, fecha de fin, hoja de origen y cruce contra
la base instalada. También conserva la tensión y las notas de las columnas adicionales que traen
las hojas históricas. Los registros sin código no se convierten artificialmente en repuestos.
Al cruzar los modelos, el sufijo `V` de nombres como `iR 5000 V` permanece como
parte del código; solo se omiten tensiones adicionales después del modelo para
evitar asignar a equipos de otra familia una fecha de fin de soporte incorrecta.
También puede importar el stock Waldbott del Depósito 04, excluir familias fuera de alcance,
consolidar variantes del mismo modelo y cruzar las unidades con el soporte Canon y la cartera
instalada. La pantalla conserva el histórico de importaciones, pero muestra como stock vigente
la última carga aplicada; las listas Canon aceptan varios XLSX y acumulan registros sin duplicarlos. Las consultas de
soporte y stock indexan los modelos instalados antes de cruzarlos, para que la carga de esta
vista no recalcule miles de comparaciones repetidas ni cierre la conexión de la API.
También se pueden limpiar las cargas exclusivas de listas Canon y stock Waldbott para preparar otra
fuente; los originales se archivan en `data/imports/.removed/` y la cartera compartida no se toca.
La vista seleccionada del Discontinuador se conserva en el parámetro `vista` de la URL para poder
volver directamente a Discontinuados, Stock Waldbott o Carga.
Los filtros de cartera del Discontinuador se distribuyen en filas cuando el espacio
disponible es menor, sin recortar las opciones ni el botón para limpiar filtros.
En el detalle de un cliente, cada contrato permite contraer o mostrar sus equipos
por separado desde el encabezado; el resumen y la exportación del cliente no cambian.
Mantenimiento también permite cargar por separado uno o varios XLSX de los exports de `Contratos.xlsx`, `Detalles de
contratos.xlsx` y la clasificación de clientes, conservando OV, división, vigencia, fechas,
área comercial y requisito de cierre en la base compartida. Discontinuador ofrece además la
carga directa de una o varias clasificaciones para mantener la opción del proyecto original. Ambas rutas
conservan los archivos originales y sus filas para repetir o revisar una carga cuando sea necesario.
La pantalla Resumen consulta la misma base y muestra métricas de cartera, inventario, soporte e
importaciones recientes, para verificar el estado de la instalación antes de entrar a cada módulo.
Desde ese resumen se puede descargar un respaldo consistente de la SQLite normalizada; los
originales activos se conservan también en `data/imports/` y pueden consultarse, inspeccionar
por hoja y descargar desde el visor global de archivos y filas de origen que aparece en Resumen.
El respaldo incluye los originales activos y retirados. Se puede restaurar desde Resumen en otra
instalación: primero valida integridad, versión y hashes, guarda una copia de seguridad automática
de la base actual y luego la sustituye y reinicia la Suite.
La pestaña Datos de Consumibles conserva únicamente las herramientas de carga coordinada y
mantenimiento de sus fuentes.
El encabezado global permite limpiar las cargas importadas y sus datos derivados con confirmación;
los archivos originales se mueven al archivo recuperable `data/imports/.removed/` y sus BLOB
permanecen en SQLite, mientras se conservan los perfiles MPS manuales, los viajes manuales y las
configuraciones locales.

Catálogo acepta la planilla técnica XLSX y también el respaldo JSON con la estructura de familias
de `Listado de Precios`. Además reconoce el XLSX que el catálogo web antiguo exporta por modelo,
y el formato legado de `Listado de precios` con varias hojas o bloques repetidos, recuperando el
modelo o equivalencia, el precio local y el estado activo sin descartar las secciones posteriores.
La planilla `Listado_Gral_mayo_2026_para_Mura.xlsx` es un Excel extraído de Waldbott y contiene
una hoja histórica `Lista Canon` con filas genéricas y algunas filas de otros fabricantes; la
consulta normal del Catálogo solo expone las filas enlazadas a un modelo Canon, mientras las
filas restantes se conservan en el original archivado y pueden incluirse explícitamente para
auditoría. La integración del Catálogo se considera completa; ese filtro separa el uso normal
de la revisión histórica, no indica una migración incompleta.
La vista de Catálogo conserva además los filtros de stock y discontinuados del proyecto antiguo;
el filtro de modelo acepta fragmentos y no distingue mayúsculas de minúsculas. También permite
ordenar las columnas principales y exporta a XLSX exactamente el resultado filtrado.
También muestra un enlace para descargar nuevamente el archivo original de la última carga aplicada.
Listado de precios permite cargar directamente una planilla XLSX o el respaldo JSON heredado,
explorar por familia y seleccionar modelos completos. Cuando el legado no tiene costo USD,
conserva el precio Gs. de la planilla como referencia y no lo presenta como un cálculo. También conserva dentro de la suite la semilla heredada de 13 familias. Su restauración
reemplaza solo el catálogo Canon compartido, deja el JSON completo en el historial de importaciones
y proyecta también las notas técnicas de los modelos y las filas originales de mano de obra y
cargos fijos. Además de código, descripción, modelo, stock, precios y estado, la suite conserva
grupo, referencia y vida útil cuando esos campos existen en la fuente. Las opciones comerciales
se muestran por modelo y se incluyen en el XLSX exportado. Cuando una familia heredada trae un
tipo de cambio propio, queda guardado junto a sus modelos y se aplica al consultar esa familia;
el valor global sigue siendo el predeterminado para consultas sin familia, y las hojas por modelo
de la exportación respetan la regla de su familia. La pantalla conserva y permite descargar el
archivo original de la última carga del catálogo compartido, y permite volver al T.C. global o
guardar una excepción por familia.

Proformas tiene su **paridad operativa aprobada (2026-09-24)** tras verificarse que el XLSX exportado
coincide con el legado. Ya permite importar un informe de servicio PDF con lectura local: muestra cliente,
número de informe, referencia, fecha/hora, modelo, serie, técnico, problema y tarea antes de aplicar los datos,
traslada la fecha y hora detectadas a la emisión y propone líneas del catálogo común para revisión.
Los PDF escaneados sin capa de texto todavía requieren carga manual. También permite importar el contrato
abierto desde XLSX o PDF tabular, conserva el archivo original, muestra las líneas detectadas y respeta la
moneda del precio fijo detectada en el encabezado (Gs. o USD), sin exigir que esas partes existan en el
catálogo Canon común. La moneda elegida queda guardada junto con la proforma y se conserva en el XLSX exportado.
El detalle permite además agregar una línea manual, elegir Repuesto o Consumible, escribir el
código y resolverlo desde la planilla específica o el catálogo común antes de guardar; las líneas
sin resolver quedan bloqueadas para evitar cotizaciones incompletas.
En el modo sin contrato también recupera por separado `CONSUMIBLES_SISTEMA_ING.xlsx` y
`REPUESTOS_SISTEMA_ING.xlsx`: ambas planillas se guardan en la SQLite compartida, sus archivos
originales se conservan y sus precios, stock y estado tienen prioridad sobre el catálogo común.
Las columnas adicionales permanecen consultables desde la fuente original importada y las tarjetas
de cada catálogo permiten descargar nuevamente el XLSX archivado. El contrato abierto conserva el
mismo enlace al XLSX/PDF original desde la lista contractual activa.

Viáticos puede importar `CONTROL DE VIATICO 2026.xlsx`, conservar la planilla original,
normalizar los viajes y guardar en SQLite el catálogo de costos y los resúmenes históricos
anuales. La pantalla permite registrar viajes manuales, estimar costos orientativos,
buscar por cliente/destino, columnas calculadas y gestionar el estado de cada rendición. Sus vistas separadas
de Resumen, Viajes, Rendiciones e Histórico recuperan el flujo de la aplicación anterior;
el Resumen también muestra la distribución del gasto por medio y los destinos con mayor costo.
El Histórico permite comparar actividad/costos, revisar la tendencia mensual y navegar las
hojas y filas originales conservadas con sus encabezados detectados por hoja. La importación se previsualiza antes de modificar la
base y muestra viajes, años, hojas, históricos y referencias de costos. Si ya existe una fuente
aplicada, la confirmación la reemplaza, conserva los viajes manuales y mantiene estado/notas
locales de los viajes importados que sigan existiendo. Los viajes importados conservan también
el archivo, la hoja y la fila de origen. La vista Viajes permite exportar el detalle normalizado
filtrado a XLSX manteniendo sus importes en guaraníes y la trazabilidad de fuente. La bandeja de
Rendiciones permite desplegar el detalle operativo, las ocho columnas calculadas del origen
(móvil, consumo, costo por litro, costos de servicio/combustible y totales), el desglose de
costos, notas y ubicación original antes de editar el viaje. Esos campos también se recuperan
al reindexar los viajes históricos desde los XLSX ya guardados y se incluyen en la exportación.
El campo Destino ofrece búsqueda asistida sin tildes sobre los 263 municipios de la fuente
legada y permite conservar destinos personalizados. La carga de las rutas auxiliares también
recupera correctamente todos los peajes de las secciones con encabezados combinados, sin reducir
el total de una ruta al primer control visible.

El `Configurador uniFLOW Online` calcula el costo mensual, anual y contractual de licencias a
partir de los equipos agregados, consolida los volúmenes T1/T2 y CIP, y permite editar en SQLite
las cuatro listas de precios heredadas del proyecto. En Electron la configuración se guarda como
PDF mediante el diálogo nativo local; si se ejecuta solo el renderer con Vite, se usa el diálogo de
impresión del navegador. También se puede exportar a XLSX.

`Canon Software Selector` analiza texto de pliegos con reglas locales deterministas, permite
revisar manualmente 35 requisitos, compara uniFLOW e imageWARE y conserva el último análisis en
`app_settings`. Acepta TXT/MD/CSV/JSON, PDF con capa de texto y DOCX; la extracción se ejecuta
localmente. Para el análisis IA usa únicamente OpenRouter (ver «Análisis con IA»); al pulsar
«Analizar con IA», el texto se envía a la API de OpenRouter.

`SLA Compliance Analyzer` compara texto de pliegos con las cláusulas estándar de Data Systems,
calcula score y riesgo, muestra trazabilidad por requisito y guarda el último informe en
`app_settings`. Acepta TXT/MD/CSV/JSON y PDF con capa de texto; en Electron el informe se guarda
como PDF mediante el diálogo nativo local, en Vite se abre la impresión del navegador, y también
se puede exportar a HTML autónomo o JSON. Para el análisis IA usa únicamente OpenRouter (ver
«Análisis con IA»); los PDF escaneados todavía requieren OCR.

La pestaña **Servicios vs Consumibles** de Analítica de consumibles puede importar uno o varios `Servicios LAM.xlsx`, conservar cada fuente original y
guardar las intervenciones enlazadas a la cartera instalada. La pantalla permite buscar
por cliente, equipo, serie, orden, técnico o tarea y resume el historial por tipo de
tarea; el buscador también encuentra los valores recuperados de las columnas originales. Muestra el detalle operativo adicional del export y no lo mezcla con los costos ni
con los despachos de Consumibles.

Consumibles ya puede importar los XLSX históricos de `Detalles de consumibles`,
`Detalles de repuestos` y `Detalles de uso de repuestos`, además de `Salida de
Consumibles` y `Salida de Repuestos`. Los detalles de uso se cruzan con los equipos
instalados y se guardan como costo normalizado en SQLite; las salidas quedan en una
tabla separada de despachos con remisión/comprobante, rendimiento y técnico. El último formato
trae totales en PYG y se normaliza internamente usando la tasa referencial heredada del
proyecto, fechada el 2026-08-04. La pantalla muestra los importes consolidados en guaraníes,
además del resumen de costo, cantidades,
originales/compatibles, evolución mensual, familias, categorías y ranking por equipo
calculados sobre SQLite, además de las últimas líneas importadas y despachadas. También
construye fichas agregadas por número de serie para relacionar consumibles y repuestos
despachados sobre el mismo equipo. Las 11 vistas del proyecto legado ya están disponibles
como pestañas, incluyendo Impacto en Contratos, Repuestos, Servicios vs Consumibles, Ranking,
Equipos y Datos. Fichas permite buscar por serie/modelo/cliente, filtrar por familia y tipo,
ordenar columnas y abrir el historial de salidas. Servicios permite filtrar por familia,
tarea y clasificación y abrir una línea de tiempo de servicios y consumibles. Ranking, Equipos
e Impacto en Contratos muestran cantidades, costos en guaraníes, agregados y ordenamiento.
Los registros y despachos muestran también el sector y el área comercial del cliente enlazado,
que son los mismos valores usados por los filtros globales. La referencia interna del contrato,
el número de OV y la división se conservan por separado para no confundirlos en los listados.
Datos conserva las filas originales de los XLSX por archivo, hoja y número de fila para revisar
las columnas que todavía no tienen destino normalizado. Consumibles, Salidas y Servicios también
exponen esas columnas con valor dentro del detalle desplegable de cada registro y sus buscadores
también encuentran esos valores. El panel también muestra, fuente por
fuente, el origen SGS/Superset y el puente de campos que ya llega a la SQLite; `Uso de repuestos`
conserva además cliente, OV, precio unitario PYG y total PYG del export original. Sus campos
operativos de salida, técnico, sucursal, referencia DATA, vigencia, fechas contractuales, informe,
tarea y repuestos usados también se guardan en un bloque estructurado reutilizable por la API y
se muestran en la tabla normalizada principal y en el detalle de cada registro. Los detalles de
consumibles y repuestos también proyectan cliente, OV, división y período cuando el XLSX los incluye. Las fuentes de
cartera y Servicios LAM también pueden cargarse desde el panel de fuentes relacionadas. El área
proveniente de `Detalles de contratos.xlsx` se conserva separada del área comercial del cliente y
se muestra en cartera, exportes y cruces de Consumibles. Ya están
incorporados los gráficos y KPIs específicos de las pestañas de Consumibles. Datos permite
seleccionar varios XLSX por fuente y quitar una carga directa: sus filas normalizadas se eliminan
y el original queda archivado en `data/imports/.removed/`. Cada lote directo conserva también el
tipo de fuente, incluso si el archivo fue renombrado. Sigue pendiente la proyección de las
columnas originales que todavía no tienen destino normalizado. Las cargas históricas que no
registraron tipo también se identifican por su dominio de importación cuando ese dato existe.
El panel Datos también permite preparar las nueve fuentes del flujo legado
en un paquete coordinado: las cinco cargas directas y Servicios reemplazan todas sus versiones
aplicadas anteriores, mientras Equipos, Contratos y Detalles de contratos actualizan la cartera
compartida sin borrar registros existentes. Primero se guardan temporalmente y luego las nueve fuentes
se aplican en una única transacción SQLite, por lo que un error durante la escritura no deja el
paquete a medias. Las filas normalizadas de
Consumibles y Servicios muestran además el archivo, hoja y
fila de origen cuando esa información está disponible, y permiten desplegar los campos
operativos conservados del registro original. Esto cubre división, salida, técnico, sucursal,
vigencia, fechas contractuales, informe y tarea en `Uso de repuestos`; rendimiento, precios,
observaciones y contacto en las salidas; y tiempos, estados, cierres, ciudades y banderas en
Servicios LAM, que además guarda esos 21 campos operativos en un bloque reutilizable por la API y
los backfills históricos. Las columnas aún no proyectadas siguen visibles en la pestaña **Datos**; las de
cartera ya proyectadas también se pueden desplegar desde Mantenimiento y Discontinuador.
El Resumen muestra las últimas cargas
detectadas y el estado operativo de la instalación.

Cobertura permite subir un PDF y calcula en este equipo la cobertura por canal de cada página a
300 DPI, igual que el analizador legado. Muestra el progreso y las páginas que no se pudieron leer,
persiste el último análisis y conserva el catálogo manual de modelos Canon con su cálculo de
rendimiento ISO/IEC 19798. Se retiraron las entradas de cobertura manual y la importación JSON;
el informe se puede guardar como PDF.

Salvo la copia inicial de los datos de prueba y la reindexación idempotente de fuentes ya
archivadas, descritas en «Persistencia objetivo», la suite no modifica ni migra bases
históricas al abrirse: cada fuente se incorpora mediante su importador explícito, se archiva junto con sus filas originales y no
altera los proyectos originales. Esto permite revisar y repetir la carga desde el módulo
correspondiente; Consumibles ya consume la cartera compartida para asociar sus líneas a
contratos y equipos.

La migración se hará por slices funcionales, conservando los proyectos actuales como
respaldo hasta validar cada etapa.

Comandos de la suite:

```bash
npm test
npm run lint
npm run build
npm run dev
# después de `npm run build`
npm run desktop
# compila y valida el runtime de producción de Electron
npm run desktop:check
# genera un directorio ejecutable local
npm run desktop:package
# genera el instalador NSIS x64 desde Windows o CI Windows
npm run desktop:package:win
```

En desarrollo, `npm run dev` es el comando único: levanta API, Vite y Electron, y usa
`data/` dentro de esta carpeta. `npm run dev:renderer` es solo una herramienta interna
para depurar el renderer y requiere que la API esté levantada aparte. En producción,
Electron inicia la API local como proceso hijo en un puerto loopback efímero y sirve el
renderer desde `dist/`; el directorio de datos de usuario se pasa explícitamente para que
la instalación no escriba en su directorio de programa. Las importaciones pesadas devuelven
un trabajo consultable y reportan sus etapas sin bloquear la shell Electron. La shell bloquea
segundas instancias y prefiere
Ozone/Wayland cuando la sesión Linux lo anuncia.
Durante el desarrollo, el orquestador supervisa la API y la relanza si el proceso termina
mientras Electron sigue abierto; el renderer también limpia los resultados anteriores
cuando una consulta falla, para no presentar información obsoleta como si estuviera activa.
En Linux usa renderizado por software por defecto para evitar cierres del proceso GPU en
sesiones o equipos sin aceleración utilizable; se puede probar la aceleración con
`DS_ENABLE_GPU=true`.

`better-sqlite3` es un módulo nativo y Node y Electron usan ABI distintos. El script
`scripts/ensure-native.mjs` conserva una variante para cada runtime y la selecciona
automáticamente antes de `npm test`, `npm run dev` o `npm run desktop`. La primera
compilación de cada variante puede tardar; las siguientes usan la caché local.

La configuración de distribución está en `electron-builder.yml`. `npm run desktop:check`
valida los artefactos compilados, el binding de SQLite para Electron y el aislamiento del
directorio de datos. `electron-builder@26.15.3` ya está incorporado como dependencia de
desarrollo propia; `npm run desktop:package` valida un paquete local y
`npm run desktop:package:win` genera el instalador NSIS x64 desde Windows o CI Windows.
El último comando se rechaza en Linux o macOS para no incluir por accidente un binding
nativo de SQLite del sistema anfitrión.
El rebuild nativo de Builder está desactivado porque `ensure-native.mjs` prepara y valida
explícitamente la variante ABI que corresponde a cada runtime; no se reutiliza el paquete
del launcher legado.
