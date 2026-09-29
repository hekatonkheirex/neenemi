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
del servicio, muestra los errores del Resumen y lleva el monograma al icono instalado.

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

## Estado

Rodrigo revisó todos los módulos actuales y aprobó el estado de la suite para despliegue
y uso corporativo por el momento (2026-09-25). Las diferencias funcionales y limitaciones
conocidas descritas aquí y en [la auditoría de paridad](docs/PARIDAD-LEGADO.md) quedan
aceptadas para esta etapa; las mejoras pendientes no bloquean esta aprobación.

La carpeta contiene la shell Electron, el manifiesto de módulos, la API local y el
kernel SQLite. El slice funcional actual incluye Catálogo, Listado de Precios,
Proformas, Mantenimiento, Discontinuador, Consumibles (incluida la vista de Servicios vs Consumibles), Viáticos, uniFLOW Online, Software Selector, SLA, Cobertura y MPS: los XLSX se normalizan en
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
el Histórico permite comparar actividad/costos, revisar la tendencia mensual y navegar las
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
localmente. Para el análisis IA usa únicamente Gemini, según el alcance acordado; al pulsar
«Analizar con Gemini», el texto se envía a la API de Google.

`SLA Compliance Analyzer` compara texto de pliegos con las cláusulas estándar de Data Systems,
calcula score y riesgo, muestra trazabilidad por requisito y guarda el último informe en
`app_settings`. Acepta TXT/MD/CSV/JSON y PDF con capa de texto; en Electron el informe se guarda
como PDF mediante el diálogo nativo local, en Vite se abre la impresión del navegador, y también
se puede exportar a HTML autónomo o JSON. Para el análisis IA usa únicamente Gemini, según el
alcance acordado; los PDF escaneados todavía requieren OCR.

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
El detalle verificable de esa diferencia está en
[`docs/PARIDAD-LEGADO.md`](docs/PARIDAD-LEGADO.md). El Resumen muestra las últimas cargas
detectadas y el estado operativo de la instalación.

Cobertura permite subir un PDF y calcula en este equipo la cobertura por canal de cada página a
300 DPI, igual que el analizador legado. Muestra el progreso y las páginas que no se pudieron leer,
persiste el último análisis y conserva el catálogo manual de modelos Canon con su cálculo de
rendimiento ISO/IEC 19798. Se retiraron las entradas de cobertura manual y la importación JSON;
el informe se puede guardar como PDF.

La suite no modifica ni migra automáticamente bases históricas al abrirse: cada fuente se
incorpora mediante su importador explícito, se archiva junto con sus filas originales y no
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
