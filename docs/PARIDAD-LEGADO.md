# Auditoría de migración y cobertura de los proyectos legados

Fecha de corte: 2026-09-25.
Estado de aceptación actualizado: 2026-09-25.

`datasystems-suite` tiene la shell Electron, la API local y la SQLite compartida.
Rodrigo revisó todos los módulos actuales y aprobó el estado de la suite para despliegue
y uso corporativo por el momento (2026-09-25). Las etiquetas `Parcial` de esta auditoría
describen diferencias funcionales frente a los proyectos legados; las diferencias y
limitaciones enumeradas fueron revisadas y no bloquean esta aprobación. La primera
integración creó módulos resumidos y normalizadores parciales, por lo que esta auditoría
mantiene esos detalles como referencia para futuras mejoras.

## Por qué faltan datos y opciones

### 1. Se migró el contrato de datos, no cada pantalla

La suite tiene 12 rutas y una base común, pero varias rutas exponen solo el primer
caso de uso. Por ejemplo, Consumibles muestra un resumen, registros y salidas; el
proyecto original tenía 11 pestañas: Resumen General, T03, T06, GPR-53, Impacto en
Contratos, Repuestos, Fichas, Servicios, Ranking, Equipos y Datos.

Lo mismo ocurre en otros módulos:

| Proyecto legado | Opciones principales del original | Estado actual de la suite |
| --- | --- | --- |
| `consumibles-analytics` | 11 pestañas, filtros globales, carga individual de 9 fuentes, múltiples archivos por fuente, recálculo y eliminación | Parcial: las 11 vistas, filtros globales, filtros específicos de Fichas/Servicios, gráficos/KPIs, ordenamiento, historiales y las nueve entradas de fuente ya están disponibles; la carga múltiple, el paquete coordinado atómico de nueve archivos y la eliminación individual de lotes directos ya funcionan; los campos tipados del legado tienen equivalente normalizado y las columnas adicionales sin uso funcional identificado quedan preservadas en la fila original |
| `viaticos` | Resumen, viajes, rendiciones, histórico, previsualización/reimportación, hojas auxiliares, exportación y municipios asistidos | Parcial: ya hay vistas separadas, comparativas, visor de hojas/filas con encabezados reales detectados por hoja, previsualización antes de importar, reemplazo seguro de la fuente, municipios asistidos, alta/edición/eliminación de viajes con confirmación, exportación XLSX y consulta visible de rutas de peaje/pasajes auxiliares; la vista principal ya recupera todos los viajes por defecto, sin el truncamiento histórico de 500 filas |
| `gestor-mantenimiento-canon` | Tablero, expedientes, límites por modelo, carga CSV/XLSX de contadores, análisis por período, exportación XLSX/PDF | **Paridad operativa aprobada por el usuario (2026-09-24)**: tablero ejecutivo, expedientes, reglas editables, análisis y exportaciones XLSX/PDF disponibles. El usuario confirmó que el XLSX histórico exportado muestra todas sus columnas. Limitaciones conocidas aceptadas para este cierre: no se importa directamente el formato binario `.xls` y los PDF no replican exactamente el diseño legado; la confirmación del XLSX no implica soporte de `.xls`. |
| `descontinuador` | Discontinuados, Stock, Carga, clasificación independiente, filtros por contrato/cliente/área, exportación por cliente | Parcial: los cruces, las tablas integradas, el resumen gráfico, la carga múltiple de cartera, clasificación, stock y listas Canon, los filtros de cartera, la navegación por vistas, la recuperación de vista/filtros/cliente desde la URL y la exportación por cliente ya están disponibles; la auditoría de la planilla Canon real cubre las variantes históricas de encabezado y conserva futuras columnas en la fila original |
| `listado-precios` | Carga Excel, familias/modelos, selección múltiple, reglas comerciales, restaurar semilla, exportación resumen + hoja por modelo | Parcial: el catálogo común, carga directa XLSX/JSON, exploración por familia, reglas, selección persistida, la semilla heredada de 13 familias, notas técnicas, filas de mano de obra/cargos fijos, restauración trazable y exportación por modelo ya están disponibles; grupo, referencia y vida útil se proyectan cuando existen, los costos USD ausentes conservan el valor Gs. de planilla como referencia, mientras otras columnas permanecen en la fuente original |
| `proformas` | Modos sin contrato/contrato abierto, dos catálogos, importación de contrato, informe de servicio PDF, sugerencias y exportación | **Paridad operativa aprobada por el usuario (2026-09-24)**: modos con/sin contrato, catálogos separados, lectura local de informes de servicio PDF y contratos abiertos XLSX/PDF, proformas en SQLite, plantilla fija de 12 repuestos/7 mano de obra, y visor original archivado disponibles. El usuario verificó que la exportación XLSX coincide exactamente con el formato legado. |
| `canon-software-selector` | Texto o PDF/DOCX, selección de modelo IA, idioma, análisis, coincidencias, límites y propuesta PDF | **Paridad operativa aprobada (2026-09-24)**: incluye heurística local estricta y lectura local de PDF/DOCX; se agregó integración directa con la API de Google Gemini como alternativa por demanda para el análisis de características del pliego. |
| `sla-compliance-analyzer` | PDF del cliente, API key/modelo/idioma, análisis IA, matriz, reporte PDF/HTML | **Paridad operativa aprobada (2026-09-24)**: lectura local de PDF con texto (faltan los escaneados puros/OCR). Se agregó integración con la API de Google Gemini configurando la key en SQLite para mapear requerimientos del SLA del pliego. |
| `configurador-uniflow-online` | Dispositivos, cliente/proyecto, meses, tarifas editables, cálculo y PDF/Excel | Parcial: selector de modelos con búsqueda, plazos enteros positivos sin límite artificial, guía T1/T2 y CPS/CIP, tarifas persistidas, XLSX y propuesta PDF independiente con las secciones del formato legado desde Electron; queda pendiente cualquier campo que aparezca en una versión histórica adicional |
| `calculadora-de-insumos-canon-mps` | Fichas, especificaciones, selección avanzada, volúmenes, análisis ejecutivo y PDF/XLSX | Parcial: importa la base, proyecta reemplazos, muestra ficha y análisis ejecutivo, exporta XLSX, genera el informe PDF horizontal con metadatos, tabla de cinco años y notas del formato legado desde Electron, permite CRUD de perfiles manuales, carga rápida de consumibles monocromáticos/color y descargar la base original archivada; queda pendiente cualquier diferencia visual menor frente a una versión histórica adicional |
| `toner-coverage-analyzer` | Carga de PDF, cobertura por página, progreso/errores, catálogo Canon y estimación ISO | Parcial: la entrada ya es PDF directo, procesado localmente página por página a 300 DPI; las entradas manuales y JSON se retiraron. El análisis, el progreso y las páginas fallidas se conservan en la Suite; falta comparar un PDF real del usuario con el resultado del legado antes de declarar equivalencia de medición |

`redact-ds` queda fuera de esta integración por decisión explícita.

### 2. La SQLite separa el origen de la proyección normalizada

Las tablas actuales (`customers`, `contracts`, `contract_equipment`,
`consumables_usage_records`, `consumables_output_records` y `service_records`)
guardan el subconjunto necesario para las consultas y un detalle estructurado de los
campos operativos reconocidos. Además,
`import_source_rows` conserva cada fila del XLSX por lote, archivo, hoja y número de fila,
incluyendo sus valores originales serializados. Los bytes de cada original también se
conservan como BLOB en `import_files`; al retirar un lote, un trigger los retiene en
`archived_import_files` antes de eliminar sus metadatos activos. Las copias físicas de
compatibilidad y archivo siguen en `data/imports/`. Resumen verifica y descarga una SQLite
autocontenida, y permite restaurarla con validación y copia automática de seguridad. La cartera
compartida conserva además los valores poblados en los
registros de clientes, contratos y equipos, con su hoja/fila de origen cuando la
fuente fue importada por el parser actual.

Esto explica pérdidas concretas:

- `Detalles de equipos en contrato.xlsx` tiene división, sector, vigencia, marca,
  descripción, interior, ciudad, sucursal y dirección; la suite ya conserva esos
  campos principales en la base instalada y los muestra en Mantenimiento, aunque
  todavía no replica todos los filtros y exportes del original.
- `Detalles de contratos.xlsx` tiene área, fechas, vigencia y requisito de cierre;
  el área ya se proyecta en el contrato compartido y las columnas restantes siguen
  disponibles desde el origen conservado.
- `Uso de repuestos.xlsx` tiene 24 columnas; el parser recorre todas las hojas con sus
  propios encabezados y normaliza fecha, cliente, OV,
  tipo de contrato, equipo, serie, pieza, cantidad y clasificación, conserva precio
  unitario PYG y total PYG, y proyecta el detalle operativo reconocido: división, salida,
  técnico, sucursal, referencia DATA, vigencia, fechas contractuales, informe y tareas.
- `Servicios LAM.xlsx` tiene 34 columnas; además del historial básico, la suite recorre todas
  las hojas con sus propios encabezados y proyecta
  horas, estados, cierres, responsables, ciudades y banderas operativas reconocidas.
- Las salidas de consumibles y repuestos recorren todas las hojas, conservan métricas
  normalizadas y proyectan
  precio, total, rendimiento, observaciones, contacto o contrato según el formato. La fila
  completa del comprobante sigue disponible en la fuente original conservada.
- Las líneas normalizadas de Consumibles y sus despachos también proyectan el sector y el área
  comercial del cliente enlazado en la cartera compartida. Se muestran en los registros,
  rankings, equipos y contratos; si el cliente todavía no está clasificado, el detalle original
  sigue disponible para completar la clasificación sin perder la línea.

La corrección estructural es conservar el archivo original y una fila JSON por fuente
antes de proyectar datos normalizados. La pestaña **Datos** de Consumibles expone esa
capa con selección de importación, hoja y paginación. Las vistas pueden usar el modelo
común sin volver a perder información. Las filas normalizadas de Consumibles y Servicios
también guardan y muestran el archivo, la hoja y la fila de origen. Al iniciar la suite, los
XLSX históricos conservados se reindexan de forma idempotente para completar esa información
en los registros creados por versiones anteriores; si el archivo original ya no existe o no
se puede identificar su tipo, el lote conserva los datos normalizados disponibles y queda
señalado como pendiente de revisión.
Los campos operativos reconocidos y las columnas originales restantes con valor se guardan
como detalle estructurado junto al registro. Los campos reconocidos también se muestran en las
tablas normalizadas principales, mientras las columnas sin valor continúan consultables en la
fila JSON original.
La pestaña **Datos** conserva también la acción heredada **Recalcular datos**: permite repetir
manualmente la reindexación de los XLSX archivados de Consumibles, Servicios y Viáticos, informa
archivos revisados, filas recuperadas y errores, y no cambia los valores normalizados.
También conserva **Limpiar todos** para quitar con confirmación las cargas directas de Consumibles;
los originales se archivan en `data/imports/.removed/` y no se eliminan las fuentes compartidas de
cartera, Servicios o Viáticos.

El visor de filas originales detecta también encabezados de cartera y de archivos renombrados
cuando las primeras filas contienen títulos o metadatos del informe. Si el lote no está
catalogado, usa señales conocidas de columnas como respaldo y conserva la fila detectada marcada
en la tabla.

El catálogo heredado tiene además una proyección específica para su información comercial sin
código: las notas técnicas de cada modelo se guardan en `catalog_model_notes` y las filas de
mano de obra/cargos fijos en `catalog_service_items`, siempre enlazadas al lote que las originó.
El archivo `Listado_Gral_mayo_2026_para_Mura.xlsx` es un Excel extraído de Waldbott, no una
fuente de SGS/Superset. La integración de la pestaña Catálogo se considera completa y agrega
funciones de consulta, filtros, trazabilidad y exportación; el estado de las filas sin modelo
solo determina si se muestran en la consulta normal o en la auditoría histórica.
El lector recorre todas las hojas Canon y los bloques repetidos que genera el Listado antiguo,
descarta hojas explícitas de otras marcas y toma tanto `Modelo` como `Equivalencia` cuando el
XLSX general los ofrece, para no perder asociaciones posteriores al primer encabezado. La hoja
histórica `Lista Canon` también trae filas genéricas o de otros fabricantes; esas filas se
conservan en el archivo original, pero la vista normal del Catálogo solo proyecta las que tienen
asociación con un modelo Canon. Listado
los muestra por modelo y los incluye en la exportación; la mano de obra usa la tarifa configurable
y los cargos fijos conservan su precio local de la semilla. Si una fila no tiene costo USD, se conserva
su precio Gs. de planilla y se marca como referencia, sin convertirlo en un precio calculado. El T.C.
y el factor de cada familia del JSON legado también se conservan; al filtrar una familia, el Listado
aplica esas reglas de origen para que iR, Pantum y las demás familias no queden forzadas al T.C. global;
las hojas individuales de la exportación usan la misma regla de la familia seleccionada.
La pantalla también permite volver al T.C. global o guardar una excepción por familia, igual que
el flujo heredado.

### 3. La carga de Consumibles está incompleta

El proyecto anterior necesitaba estas nueve fuentes:

| Archivo | Origen documentado | Función |
| --- | --- | --- |
| `Detalles de equipos en contrato.xlsx` | Superset > SGS Equipos vs Contratos > Equipos CON Contratos > Detalle de Equipos con Contrato | Mapa de serie, equipo, cliente y contrato |
| `Contratos.xlsx` | Superset > SGS Equipos vs Contratos > Contratos afectados | Contratos, tipo y vigencia |
| `Detalles de contratos.xlsx` | Superset > SGS Contratos > Detalle de Contratos | Área y fechas del contrato |
| `Detalles de consumibles.xlsx` | Superset > SGS Cliente 360 > Consumibles > Consumibles, Detalles | Uso de consumibles |
| `Detalles de repuestos.xlsx` | Superset > SGS Cliente 360 > Repuestos > Repuestos, Detalles | Uso de repuestos |
| `Detalles de uso de repuestos.xlsx` | Superset > SGS Uso de Repuestos > Consolidados y selectores > Detalle de Repuestos | Repuestos ligados a informes y contratos |
| `Salida de Consumibles.xlsx` | SGS > REPORTES > Consumibles > Rango de fechas | Despachos de consumibles |
| `Salida de Repuestos.xlsx` | SGS > REPORTES > Consumibles > Rango de fechas | Despachos de repuestos |
| `Servicios LAM.xlsx` | Superset > SGS Cantidad y Tiempos en Servicios > Planilla detallada > Detalle de los Servicios | Consumibles / pestaña Servicios vs Consumibles |

La suite mantiene entrada directa para los cinco archivos de consumo y despacho, acepta
varios XLSX por cada fuente y registra el tipo de fuente en cada lote, y ahora
expone además cargas independientes para Equipos, Contratos, Detalles de contratos y
Clasificación de clientes desde Mantenimiento/Discontinuador. El cruce ya no depende de
que una cartera combinada haya llegado primero, aunque los campos que todavía no tienen
destino normalizado permanecen disponibles en el archivo original conservado.

Proformas también acepta por separado las planillas antiguas `CONSUMIBLES_SISTEMA_ING.xlsx`
y `REPUESTOS_SISTEMA_ING.xlsx`. Cada carga queda en la SQLite compartida, conserva su archivo
original y usa precios, stock y estado de la planilla específica antes de completar con el
catálogo común. Las columnas que no se proyectan continúan disponibles en la fila original
del lote importado.

La matriz interna de estas fuentes sigue disponible en `GET /api/sources` para los
importadores y tareas de mantenimiento. El historial físico y las filas originales están
disponibles en `GET /api/imports` y `GET /api/imports/:batchId/raw-rows`.
Los visores de Consumibles, Operaciones y Viáticos también permiten descargar directamente
el archivo original asociado a la hoja seleccionada mediante `GET /api/imports/:batchId/files/:fileId`.
Las tarjetas de migración de Mantenimiento y MPS ofrecen el mismo acceso para recuperar sus
bases heredadas archivadas.

## Plan de recuperación

### Fase 1: trazabilidad y contrato de importación

Completada en esta iteración:

- catálogo central de fuentes, nombres esperados y orígenes documentados;
- estado de soporte `Completa`, `Parcial` o `Pendiente`;
- coincidencia con importaciones reales por nombre de archivo;
- explicación del propósito y de la pérdida conocida;
- mapeo interno de campos normalizados para las nueve fuentes relacionadas con Consumibles;
- endpoint local `GET /api/sources` para los importadores y tareas de mantenimiento;
- endpoints separados para Contratos, Detalles de contratos y Clasificación de clientes;
- persistencia de referencia OV, división, vigencia y requisito de cierre en `contracts`;
- persistencia de marca, descripción, interior, ciudad, sucursal, dirección y vigencia
  del equipo en `contract_equipment`;
- las nueve fuentes del flujo de Consumibles ya tienen una entrada visible: cinco en
  Consumibles, tres de cartera reutilizables desde allí y Servicios LAM;
- las fuentes de cartera relacionadas se cargan desde Consumibles y la clasificación también es accesible desde Discontinuador; Mantenimiento conserva el flujo único de carga de contadores del proyecto legado.
- pestañas del legado de Consumibles visibles dentro de una sola ruta, con el resumen
  normalizado reutilizado donde todavía no existe una réplica exacta;

### Fase 2: base de datos sin pérdida

- completada en parte: filas de origen por archivo, hoja y número de fila en
  `import_source_rows`;
- completada en parte: encabezados y valores se conservan en el orden recibido y se
  pueden revisar desde la pestaña **Datos**;
- completada: Consumibles y Servicios enlazan cada fila normalizada con archivo, hoja y
  número de fila de origen cuando fueron importados con el parser actual;
- completada: la pestaña **Datos** permite seleccionar varios archivos de una misma fuente y
  quitar un lote directo de Consumibles; sus filas normalizadas se eliminan por cascada y el
  archivo XLSX original se conserva en `data/imports/.removed/`;
- completada: cada lote directo de Consumibles guarda su `source_type`, por lo que una
  exportación renombrada todavía puede identificarse con la fuente elegida; ese tipo también se
  proyecta en cada registro normalizado y despacho, se muestra en las tablas y participa del buscador;
- completada: la cobertura de fuentes usa también el `domain` persistido para reconocer cargas
  históricas cuyo nombre es temporal y que todavía no tenían `source_type`, sin atribuirlas a otra
  fuente por coincidencia de nombre;
- completada: Viáticos conserva también la hoja y la fila del viaje importado;
- completada: la consulta principal de Viáticos recupera todos los viajes por defecto, mientras
  las consultas API que necesitan acotar resultados pueden seguir enviando un límite explícito;
- completada: Viáticos puede reemplazar la fuente aplicada desde la previsualización, conserva
  los viajes manuales y mantiene estado/notas locales cuando el viaje sigue existiendo;
- completada: el alta y edición de Viáticos ofrece búsqueda asistida sin tildes sobre los 263
  municipios de la fuente legada, sin impedir destinos personalizados;
- completada para la primera proyección de Consumibles, despachos, Servicios y Contadores: los campos
  operativos no métricos reconocidos se guardan en bloques estructurados y la fila original sigue en
  `source_details_json`; `Uso de repuestos` también conserva
  salida, técnico, sucursal, referencia DATA, vigencia, fechas contractuales, informe, tarea y
  repuestos usados en `source_operational_json`, mientras las salidas guardan rendimiento unitario,
  observaciones, contacto, sector, área comercial y contrato de origen en el mismo tipo de
  proyección, para que la API y las tablas los puedan reutilizar. En Consumibles y Salidas esos
  valores de sector/área se conservan aunque todavía no exista una clasificación equivalente en
  la cartera compartida;
- completada para Viáticos: las tarifas de viático, hotel, peajes y pasajes se recuperan de las
  hojas auxiliares y se muestran en la estimación y en el detalle desplegable del catálogo local;
- completada para Viáticos: las ocho columnas calculadas que acompañan a los viajes en
  `VIAJES2026` se proyectan en `travel_trips.source_operational_json`, se muestran en el detalle,
  se buscan desde la API y se incluyen en la exportación; los viajes históricos se reindexan
  automáticamente desde los archivos XLSX conservados;
- completada para Viáticos: las rutas de peaje de `CALCULO AUX` conservan todos sus controles y
  su total aun cuando el XLSX usa celdas combinadas para los encabezados;
- completada para la cartera: los clientes clasificados, contratos y equipos importados
  guardan también las columnas originales pobladas en `source_details_json`, además de
  hoja y fila para volver a ubicar el registro;
- completada para las listas de Operaciones: las cargas Canon y Waldbott conservan sus archivos,
  hojas y filas originales, y Discontinuador ofrece un visor separado para inspeccionarlas sin
  depender de las columnas normalizadas;
- completada: Consumibles, Salidas, Servicios y el visor de hojas auxiliares de Viáticos normalizan o
  inspeccionan todas las hojas de un XLSX y
  respetan los encabezados propios de cada hoja, incluso cuando están precedidos por títulos
  o filas introductorias, conservando su ubicación de origen; los visores identifican y
  marcan también esa cabecera real;
- completada: esa detección tolera las variantes habituales de los encabezados históricos
  (`Nº de serie`, `Nº de OV`, `Fch/Hora de inicio`, `Razón social`, cantidades, rendimientos y
  precios en guaraníes) con un resolvedor común, sin eliminar el respaldo posicional;
- completada: Consumibles y Salidas proyectan también sector, área comercial y, cuando existe,
  referencia contractual de la fila histórica en sus metadatos estructurados, sin confundirlos con
  la clasificación o el contrato normalizados de la cartera;
- completada: los lotes históricos de Consumibles, Salidas y Servicios se reindexan al iniciar
  cuando su XLSX original sigue archivado, recuperando hoja, fila y detalle de columnas sin
  modificar los valores normalizados; la operación es idempotente;
- completada: la reindexación de Viáticos también revisa la versión del lector de `CALCULO AUX` y
  actualiza el catálogo de peajes/tarifas de la fuente vigente cuando una corrección del formato
  cambia sus valores; después de reparar la instalación, la operación vuelve a ser idempotente;
- completada en el flujo de usuario: el panel Datos prepara las nueve fuentes, muestra el
  nombre/origen de cada archivo, confirma el reemplazo y devuelve el resultado agregado por
  fuente; las cinco fuentes directas y Servicios reemplazan sus lotes aplicados anteriores,
  mientras las tres fuentes de cartera actualizan la cartera compartida sin borrar registros existentes.
- completada: antes de aplicar un paquete, la suite valida las nueve planillas y sus cabeceras
  con los lectores reales; un archivo ilegible o incompatible detiene la operación antes de
  comenzar a escribir datos.
- completada: la aplicación del paquete se realiza desde staging temporal y una única
  transacción SQLite; si falla una fuente durante la escritura, se revierten todas las fuentes
  del paquete y se restauran los archivos reemplazados.

### Fase 3: paridad funcional por módulo

Avance de Consumibles en esta iteración:

- las vistas Fichas, Servicios vs Consumibles, Ranking, Equipos e Impacto en Contratos ya
  tienen controles propios, agregados, gráficos y tablas detalladas;
- Fichas y Servicios permiten abrir el historial por número de serie y cruzar eventos de
  salidas con servicios técnicos;
- Ranking separa clientes y equipos y muestra originales, compatibles, repuestos y total;
- los importes visibles del módulo se presentan en guaraníes, con la tasa heredada documentada
  para los costos que llegan en PYG;
- `Uso de repuestos` conserva cliente/OV de origen y precio unitario/total PYG en la proyección
  normalizada, además de la copia de la fila XLSX completa y el detalle operativo desplegable.
- Los detalles de consumibles y repuestos detectan también cliente, OV, división y período
  cuando sus encabezados están presentes; la cartera compartida guarda por separado referencia
  interna, OV y división en cada consumo o despacho enlazado.
- Consumibles y Servicios conservan la ubicación de la fila proyectada en el XLSX para poder
  volver a la fuente exacta desde la pestaña **Datos**.
- Mantenimiento conserva la ubicación de cada contador cargado desde CSV/XLSX y muestra su
  detalle desde el inspector del expediente.
- Mantenimiento también conserva el tipo de papel de cada lectura dentro del período analizado,
  lo muestra en el inspector y lo incluye en la hoja de detalle del XLSX exportado.
- Mantenimiento recupera también el rango mensual recomendado del gestor legado y recalcula el óptimo base
  al 65% desde el editor de reglas.
- Mantenimiento conserva las tres vistas del gestor legado: **Tablero resumen**, **Expedientes
  técnicos** y **Límites por modelo**; la fuente activa, su nombre y su estado de carga quedan
  visibles junto a la cabecera para poder cambiar de archivo sin perder contexto.
- Los buscadores de Consumibles y Servicios también recorren el detalle de columnas originales,
  por lo que una división, sucursal, estado u observación recuperada puede localizarse sin
  abrir fila por fila el visor de Datos.
- Los mismos buscadores también recorren los bloques estructurados de campos operativos recuperados,
  incluidos división, sucursal, estado, informe, tarea y valores calculados, tanto desde las tablas
  principales como desde la vista **Servicios vs consumibles**.
- Mantenimiento acepta también la carga directa de contadores CSV/XLSX, con detección de
  separador, números locales, filtros de cliente/modelo/período, ocultación de equipos normales
  y edición/restauración de los límites por modelo, incluido el rango mensual recomendado del legado.
- Mantenimiento recupera el tablero ejecutivo del legado: conteos por estado, equipos con contador
  cero, equipos sobre el óptimo, listas priorizadas de críticos/atención, tendencia de críticos,
  exportes XLSX por lista y un resumen ejecutivo PDF con definiciones, eventos, insights y
  metodología determinista por cliente, modelo y vida útil.
- Viáticos vuelve a mostrar en su Resumen la distribución del gasto por medio y los destinos con
  mayor costo, datos que ya calculaba la API pero no estaban visibles en la integración inicial.
- La cartera, el inventario instalado y el análisis de contadores aceptan búsquedas normalizadas
  por cliente, contrato, OV, tipo, fechas, división, vigencia, cierre, modelo, serie, ubicación,
  ciudad, dirección, estado y columnas de origen conservadas; el inventario también expone esos
  campos desde su endpoint de SQLite y muestra por separado la referencia interna del contrato,
  su número de OV y sus metadatos de vigencia.
- Las salidas conservan precio unitario/total PYG, rendimiento, observaciones, contacto o
  contrato de origen cuando los encabezados están presentes; la tabla de despachos y las
  fichas cronológicas muestran ahora esos valores junto con el número de informe de servicio.
  Servicios LAM conserva además sus columnas de tiempos, estados, cierres, ciudades y banderas
  reconocidas.
- Consumibles conserva además sector y área comercial desde `customers`, de modo que la
  clasificación usada por los filtros globales no queda solo implícita en la consulta.
- Servicios LAM usa el mismo puente: las intervenciones también devuelven sector y área
  comercial del cliente enlazado y los muestran junto al equipo.
- Servicios LAM guarda además sus 21 columnas operativas reconocidas en un bloque estructurado
  (`source_operational_json`), incluyendo división, recepción, tiempos, cumplimiento, cierres,
  estado, ciudades, banderas y datos del servicio anterior; el bloque se recupera también al
  reindexar lotes históricos y la fila original completa sigue disponible.
- La vista **Servicios vs consumibles** recupera la alerta del legado para equipos con clientes
  anteriores: usa los nombres de origen, agrupa sus períodos y conserva las OVs históricas al
  abrir la ficha.
- Catálogo y Listado de precios recuperan desde la misma API el archivo original de la última
  carga aplicada, de modo que las columnas que todavía no tienen destino normalizado se pueden
  descargar sin abandonar la pantalla de trabajo.
- Proformas conserva también en SQLite el stock y el estado de discontinuación de cada línea
  seleccionada, para que la plantilla XLSX fija los recupere incluso al volver a abrir una
  proforma guardada o cuando la línea proviene de una planilla específica.

Avance de Discontinuador en esta iteración:

- el resumen de cartera recupera los indicadores del formato legado: estado Canon, equipos
  por tipo de contrato y contratos por tipo; todos responden al tipo de contrato, tipo de
  cliente, área comercial y búsqueda de cliente activos.
- el buscador de cartera también encuentra OV, referencia de contrato, división, serie,
  ubicación y columnas de origen conservadas, sin limitarse a la razón social.
- la vista inicial Discontinuados recupera el tablero operativo del legado con filtros, indicadores,
  gráficos y modelos afectados; Stock Waldbott y Carga quedan como vistas separadas, sin duplicar
  las cargas de archivos compartidas.
- la vista operativa se centra en modelos de impresoras y equipos instalados; el catálogo de repuestos
  permanece en su módulo propio y ya no se presenta como una alerta adicional dentro de Discontinuador.
- el cruce de modelos Canon tolera las anotaciones de voltaje y los alias habituales de
  `imageRUNNER`, `IR-ADV` e `IRC`, para que una variante de nombre no quede como equipo sin soporte.
- las filas Canon con columnas históricas de tensión y comentarios conservan esos valores en el
  registro normalizado y los muestran en la tabla, sin perder el resto de la fila original.
- las cargas de cartera, clasificación, listas Canon y stock Waldbott conservan sus archivos,
  hojas y filas originales; las listas Canon aceptan varios archivos y acumulan sus registros
  sin duplicarlos.
- las consultas de soporte y stock indexan los modelos instalados y preparan la comparación
  de variantes una sola vez por respuesta; la apertura de Discontinuador ya no repite miles
  de cruces innecesarios ni deja el socket de la API expuesto a un cierre por demora; las
  consultas iniciales reintentan brevemente errores de red o respuestas 5xx mientras termina
  de levantarse la API local.
- Discontinuador ahora recibe cartera, equipos, soporte y stock en una sola instantánea: la
  consulta de base instalada pasa de cuatro recorridos a uno. Mantenimiento también recibe
  clientes y equipos desde el mismo recorrido; al importar cartera, los equipos existentes
  se consultan una vez por contrato en vez de una vez por fila.
- las cuatro importaciones pesadas del flujo de Discontinuador se ejecutan como trabajos
  consultables; la interfaz muestra archivo, etapa y porcentaje, y Electron mantiene la
  ventana disponible mientras ExcelJS y SQLite procesan la carga.
- La acción **Limpiar listas Canon / stock** retira solo esas cargas exclusivas, archiva sus
  originales y deja intacta la cartera compartida.
- La vista activa se conserva en el parámetro `vista` de la URL, como en el flujo legado.
- el bloque **Filas originales de Canon y Waldbott** permite seleccionar cada carga, hoja y página,
  marca la cabecera real aunque existan filas introductorias y conserva los números de fila del archivo.

Mantenimiento: paridad operativa aprobada por el usuario el 2026-09-24. El
usuario verificó que el XLSX histórico exportado muestra todas sus columnas.
El formato binario `.xls` (Excel 97-2003) no se importa directamente y el
diseño exacto de los PDF legados sigue siendo una diferencia aceptada.

Mejoras diferidas, sin bloquear el despliegue aprobado:

1. Consumibles: revisar únicamente columnas adicionales de una fuente histórica cuando aparezca
   un uso operativo concreto; la comparación actual no encontró un campo tipado del legado sin
   equivalente y la fila completa ya queda conservada para esa decisión posterior.
2. Cartera compartida: ampliar las proyecciones y exportes específicos si aparece un uso
   adicional; la vista ya permite filtrar la selección y exportarla en un libro con hojas de
   Clientes, Contratos, Equipos y Detalles de origen.
3. Viáticos: la bandeja ya permite desplegar el detalle operativo, monto/anticipo, desglose de
   importes, columnas calculadas de origen, notas y trazabilidad de fuente de cada rendición, y
   la exportación respeta los filtros activos; queda pendiente solo cualquier campo nuevo que
   aparezca en una fuente histórica adicional.
4. Discontinuador: la auditoría de la planilla Canon real ya verificó las variantes
   históricas de encabezado y no encontró un campo con uso visible sin equivalente; queda pendiente
   mantener las columnas futuras en la fila original. Proformas tiene la paridad aprobada
   tras la verificación del XLSX. La suite ya recuperó el visor de filas originales, la
   semilla heredada de Listado con sus notas y filas de mano de obra/cargos fijos, los catálogos
   separados, el contrato abierto y el informe de servicio PDF.
5. MPS: la ficha técnica ya permite exportar el listado de consumibles sin proyección y el
   informe MPS ya replica la estructura visual operativa del PDF legado en impresión horizontal;
   SLA y Software Selector ya tienen integración opcional de IA (Gemini) implementada y su 
   lectura/heurística local sigue disponible, dando su paridad por aprobada.

### Fase 4: lectores y servicios que requieren una decisión

Cobertura ahora usa `pdfjs-dist` en el renderer para rasterizar localmente cada página del PDF a
300 DPI y calcular su cobertura por píxel; no necesita OCR para ese cálculo. Los demás lectores de
PDF con texto seleccionable mantienen el extractor local existente. Los PDF escaneados que deben
convertirse a texto, como algunos pliegos, todavía requieren OCR. Software Selector y SLA usan
únicamente Gemini para sus consultas IA, de acuerdo con el alcance elegido para esos módulos.

### Recuperación usando los archivos originales (2026-09-23)

Rodrigo confirmó que conserva las fuentes originales. La recuperación se hará cargándolas
desde los importadores de la Suite; no se exportarán bases del navegador ni preferencias
manuales. Los formatos son: XLSX/JSON para Catálogo y Listado de Precios; las nueve fuentes
XLSX documentadas arriba para Consumibles; dos XLSX de catálogo y un contrato XLSX o PDF con
capa de texto para Proformas; y la planilla XLSX de Viáticos.

Catálogo/Listado y los tres importadores de Proformas calculan SHA-256 antes de aplicar la
carga. Si el mismo archivo ya es la fuente aplicada vigente del dominio/tipo, la Suite lo
indica y no crea otro lote ni vuelve a escribir los datos normalizados. Una fuente diferente
sigue el flujo de importación existente. Consumibles y Viáticos ya tenían sus propias
comprobaciones de duplicado/previsualización. Los archivos cargados quedan conservados en el
archivo local de importaciones.

Resumen también permite guardar en SQLite los originales históricos que aún solo existen en la
carpeta de importaciones, descargar una copia autocontenida y restaurarla en otra instalación. La
restauración valida esquema, integridad y hashes; pide confirmación, crea un respaldo automático de
la base activa, la sustituye completa y reinicia la Suite. Importar nuevos XLSX después de restaurar
no reemplaza el archivo SQLite: se aplican las reglas existentes por módulo y se guardan los bytes
de cada nueva fuente junto con su carga.

Este cambio prepara el flujo, pero no ejecuta la recuperación: los archivos no están en este
workspace y deben seleccionarse en la Suite. Si la instalación ya contiene datos que podrían
reemplazarse, descargar primero el respaldo SQLite desde Resumen. La información manual que
no figure en las fuentes no se recuperará mediante este procedimiento.
