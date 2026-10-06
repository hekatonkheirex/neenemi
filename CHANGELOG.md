# Historial de cambios

Cada entrada es una versión de DCSS Suite, de la más reciente a la más antigua. La versión visible en la barra lateral abre este historial. El formato lo lee `src/core/changelog.ts`: `## X.Y.Z · AAAA-MM-DD` y debajo el texto de la versión.

## 0.1.62 · 2026-10-06

uniFLOW Online adopta el encabezado, las tarjetas, los campos, las tablas y los botones compartidos del rediseño. Conserva la selección y búsqueda de modelos, los volúmenes CPS/CIP, los tiers y las exportaciones XLSX/PDF. El editor distingue las tarifas pendientes de guardar y mantiene la advertencia al salir; editar un SKU no interrumpe el foco al escribir. El control de cantidad tiene un único borde exterior y separadores rectos, sin redondeados ni fondos anidados, en ambos temas. Se retiran los estilos de pantalla anteriores, conservando el informe comercial imprimible.

## 0.1.61 · 2026-10-06

Unifica el espaciado de los encabezados compartidos con Mantenimiento y Viáticos: la etiqueta superior queda a 16 px del título y la descripción usa el mismo interlineado. Software Selector y SLA mantienen así el mismo ritmo visual que los módulos existentes.

## 0.1.60 · 2026-10-06

Software Selector continúa el rediseño de Data Systems con las tarjetas, campos y botones compartidos que ya usa SLA. Documento, revisión y recomendaciones conservan el análisis local e IA, la selección por categorías, los filtros y la restauración desde SQLite. Las tarjetas de producto muestran cobertura y requisitos pendientes; los controles de categorías anuncian su estado al teclado y a lectores de pantalla. El informe PDF excluye los controles y la configuración de IA, pero incluye los límites de cada producto, la trazabilidad y los requisitos sin cobertura. Se retira el CSS anterior del módulo.

## 0.1.59 · 2026-10-06

Los botones se normalizan por intención en toda la suite: cargar archivos es celeste con ícono de subida, exportar y descargar es verde con ícono de descarga, procesar sigue siendo el botón primario y lo demás es neutro. Los selectores de archivo nativos (Tracking) y los estilos sueltos de carga pasan a un componente común, y "Importar contrato", "Importar informe PDF" y "Descargar original" siguen la misma regla en tema claro y oscuro. Las tarjetas de fuente de Carga en Discontinuador recuperan su borde, fondo y tipografía, se adaptan al ancho de la ventana y muestran una sola marca de verificación por archivo cargado. Se elimina el módulo Servicios sin uso.

Corrige Exportar XLSX en Control de viáticos: los polyfills de Buffer y process se inicializan antes de las dependencias del renderer, evitando el ciclo que bloqueaba la generación del archivo y dejaba el botón en «Exportando…».

## 0.1.58 · 2026-10-06

Discontinuador y Listado de precios abren mucho más rápido y ya no congelan la ventana: las tablas grandes se muestran por páginas (100 filas en Listado y en modelos discontinuados, 50 por contrato) con una barra de paginación que mantiene el estilo de cada tarjeta, y los cálculos de cruce de modelos, los conteos por modelo y las consultas de cartera son varias veces más rápidos. Abrir Listado de precios ya no marca "Cambios sin respaldar" sin que haya cambios, y el aviso "SQLite requiere atención" solo aparece tras varios fallos seguidos de la comprobación, no por una consulta pesada. El punto rojo de respaldo pendiente se anima con CSS y no mantiene ocupada la ventana. Los enlaces externos solo abren páginas web y correo, y la política de contenido bloquea estilos inyectados. Ajustes visuales: los títulos de pantalla son más compactos, los plazos de uniFLOW caben en una fila, los botones de texto tienen mayor área de clic, la tabla de mano de obra de Proformas y las barras mensuales de Viáticos caben completas a 960 px, y los bordes del tema oscuro usan cuatro intensidades unificadas.

## 0.1.57 · 2026-10-05

Las pestañas de Mantenimiento, Analítica de consumibles, Control de viáticos, Discontinuador, Servicios y Selector de software pasan a tarjetas con icono, como las del mapa de módulos; la selección se desliza con Framer Motion. En el Selector de software las categorías van en una sola fila con scroll y la pestaña elegida se centra sola. Corrige desbordes entre 960 y 1580 px: los montos largos en guaraníes se ajustan al ancho de las tarjetas de resumen, el ranking y los gráficos de Consumibles ya no cortan rótulos ni marcas de los ejes, y los campos Mes, Desde y Hasta, las cabeceras de Viáticos, SLA y Discontinuador y las tarjetas de Mantenimiento caben en su celda. El detalle de fuente de un cliente con muchas series tiene altura máxima con scroll, y el texto recortado con puntos suspensivos muestra su valor completo al pasar el cursor.

## 0.1.56 · 2026-10-05

Los textos de ejemplo dentro de los campos de Proformas se muestran al 65% de opacidad y con peso normal, para distinguirlos de los valores completados. El cambio alcanza entradas y áreas de texto en ambos temas; las etiquetas, los datos ingresados y los otros módulos conservan su apariencia.

## 0.1.55 · 2026-10-05

Unifica la familia tipográfica de la interfaz mediante un token compartido: navegación, formularios, tablas, indicadores y gráficos usan la misma familia sans serif, conservando sus tamaños y pesos. Viáticos deja de mostrar los botones y subtítulos en monoespaciada. Los números usan cifras tabulares; solo el contenido de código conserva monoespaciada. Los selectores y áreas de texto heredan la tipografía de la suite, y los informes HTML e impresos de SLA, Cobertura, uniFLOW y MPS siguen la misma familia. No modifica las plantillas de Excel.

## 0.1.54 · 2026-10-05

Las barras de navegación de Mantenimiento, Consumibles, Viáticos y Discontinuador muestran botones con fondo, borde y sombra sutil. La selección conserva el acento naranja y se desliza con Framer Motion; hover y pulsación tienen feedback breve, desactivado cuando el sistema pide reducir movimiento. Mantiene los contadores, subtítulos, foco de teclado y los temas claro y oscuro. Mantenimiento abre en Tablero resumen en lugar de Expedientes técnicos.

## 0.1.53 · 2026-10-05

Reorganiza la barra lateral en cuatro secciones: Servicio Técnico (Gestor de mantenimiento, Analítica de consumibles, Seguimiento de técnicos), Administrativo (Control de viáticos, Listado de precios, Discontinuador, Proformas), Software (Selector de software, Configurador uniFLOW Online) y Herramientas (Cobertura de tóner, Calculadora de insumos MPS, Analizador de cumplimiento de SLA). Quita el módulo Catálogo de repuestos: Listado de precios ya cubre su función y los datos del catálogo siguen en la base. Los respaldos existentes se restauran sin cambios.

## 0.1.52 · 2026-10-05

"Limpiar cargas" pasa al panel Respaldo y recuperación, junto a Restaurar respaldo (con su mensaje de resultado dentro del panel). El icono del aviso de respaldo se ve en blanco sobre el círculo de color.

## 0.1.51 · 2026-10-05

Quita el panel "Base compartida" de Inicio (inventario, fuentes recientes y estado de la consulta; las importaciones ya están en el visor de originales). El botón "Limpiar cargas" pasa a la primera ficha.

## 0.1.50 · 2026-10-05

Cada importación del visor de archivos originales muestra su fecha y hora (de aplicación, o de carga si aún no se aplicó). La lista de importaciones ocupa la misma altura que el panel Fuente seleccionada y desplaza por dentro.

## 0.1.49 · 2026-10-05

Respaldo y recuperación ahora es un panel de estado: aviso con color (rojo si nunca hubo respaldo o hay cargas sin respaldar, ámbar a los 7 días, verde si está al día), fecha del último respaldo y de la última carga, cargas sin respaldar y originales dentro de SQLite. El aviso también cuenta el trabajo manual (modelos de la calculadora MPS, viajes de Viáticos, ajustes): cualquier alta, edición o baja exitosa posterior al último respaldo lo marca como pendiente (ficha "Último cambio de datos"; la clave de IA no cuenta). La descarga registra la fecha del respaldo (`GET /api/system/backup/status`). Un punto rojo animado (framer-motion; sin movimiento si el sistema pide reducirlo) junto a Inicio en la barra lateral avisa cuando el respaldo está pendiente o vencido. Quita la sección "Módulos de la suite" de Inicio, redundante con la barra lateral. Corrige la etiqueta "Instalada" del historial: vuelve a verse en blanco sobre verde.

## 0.1.48 · 2026-10-05

Renombra Resumen a Inicio (barra lateral, barra superior, paleta de comandos). Sube Respaldo y recuperación justo debajo de las fichas. Reemplaza las fichas "clientes en la base común" y "equipos instalados" por "contratos en cartera" y "última carga aplicada" (fecha de la última importación aplicada); se mantiene el conteo de módulos funcionales.

## 0.1.47 · 2026-10-05

Las fichas de módulos de Resumen usan el icono de la barra lateral en lugar de la inicial. Corrige la regla general de tarjetas del tema claro: ya no pone sombra ni fondo blanco a las partes internas (encabezado de las fichas de modelos del Discontinuador, cabecera de las fichas de módulos de Resumen). Quita la sombra grande de las fichas de resumen (queda una línea sutil; la ficha destacada va sin sombra). Unifica el espaciado entre tarjetas en Resumen y Analítica de consumibles (margen global de `.summary-grid` de 4 rem a 1,25 rem; el monto de costo ya no se parte en varias líneas). Agrega este historial de cambios: la versión de la barra lateral es ahora un enlace que lo abre en un diálogo dentro de la aplicación. Quita "Solo en este equipo" de la barra superior y "SQLite local lista" de la barra lateral (el aviso de SQLite sigue apareciendo solo cuando requiere atención).

## 0.1.46 · 2026-10-05

Limita el traslado de Tracking a un viaje plausible según la distancia (el exceso del intervalo cuenta como espera o pausa), unifica el espaciado y la cabecera del módulo, y en Viáticos oculta el indicador verde vacío y avisa de rendiciones pendientes (monto y antigüedad).

## 0.1.45 · 2026-10-01

Retira el mecanismo de clave incluida en el instalador (`embedded-ai.json`, `extraResources`, `DS_EMBEDDED_AI_FILE`): el instalador no lleva ninguna clave y la IA se configura solo desde el panel o `OPENROUTER_API_KEY`.

## 0.1.44 · 2026-10-01

Corrige el panel de IA en modo oscuro (aparecía como tarjeta blanca): hereda el fondo de `.sales-card` y usa colores legibles en ambos temas.

## 0.1.43 · 2026-10-01

Añade el panel «Configuración de IA (OpenRouter)» en SLA y Software Selector con enlaces para crear una cuenta y generar una clave, y las rutas `GET/PUT/DELETE /api/ai/config` (valida el formato `sk-or-` y nunca devuelve la clave).

## 0.1.42 · 2026-10-01

Permite incluir la clave de OpenRouter en el instalador mediante `embedded-ai.json` (ignorado por git, copiado a `resources/` con `extraResources`); la API la usa solo si no hay clave en la instalación ni en el entorno.

## 0.1.41 · 2026-10-01

Reemplaza Gemini por OpenRouter en SLA y Software Selector (`src/core/openrouter.ts`), con modelo gratuito por defecto; se elimina `@google/genai` y `src/core/gemini.ts`, la eval pasa a `npm run eval:ai` (`evals/ai/`) y los botones dicen «Analizar con IA».

## 0.1.40 · 2026-10-01

El prompt y la fusión de IA del módulo SLA pasan a `src/modules/sla/ai.ts` (con pruebas) y se añade `npm run eval:openrouter`: la misma eval con modelos gratuitos de OpenRouter (solo sufijo `:free`), usada cuando la cuota de Gemini se agota. La app sigue usando únicamente Gemini.

## 0.1.39 · 2026-10-01

La eval de Gemini marca como INCOMPLETE una suite con pliegos sin evaluar (cuota 429, saturación 503) en lugar de aprobarla con el recall de los pliegos que sí respondieron.

## 0.1.38 · 2026-10-01

Corrige «Analizar con Gemini» en Software Selector: el prompt pedía 14 claves que no existen en el catálogo (p. ej. `secure-print`) y sus resultados se descartaban; ahora lista los ids reales y descarta los desconocidos (`src/modules/software-selector/ai.ts`). Añade `npm run eval:gemini` (`evals/gemini/`), una eval de pago con umbral de recall de 80 % sobre 10 pliegos sintéticos.

## 0.1.37 · 2026-10-01

Añade `src/modules/tracking/parser.test.ts` (11 pruebas): normalización de series e identidades, fechas imposibles, separador `;`, CSV inválido, encabezados faltantes, marcaciones inconsistentes y cruce de informes.

## 0.1.36 · 2026-10-01

Corrige el escaneo inicial de dependencias de Vite con caché vacía: resuelve el archivo de globals inyectado sin externalizarlo y limita las entradas a `index.html`, excluyendo el HTML de los artefactos de `release/`.

## 0.1.35 · 2026-10-01

Corrige UUID con un override a 11.1.1 sin degradar ExcelJS 4.4.0; el renderer compila las fuentes de ExcelJS y JSZip en lugar de reutilizar sus bundles precompilados, con una única implementación de Buffer para las importaciones y exportaciones XLSX.

## 0.1.34 · 2026-10-01

Reparte `server.test.ts` (3.084 líneas) en una prueba `routes.test.ts` junto a las rutas de cada módulo, con ayudantes compartidos en `src/test-support/api-helpers.ts`; las 316 pruebas se conservan.

## 0.1.33 · 2026-10-01

Mueve las rutas de Sistema (resumen, fuentes, respaldo, restauración, configuración) a `src/core/system-routes.ts` y las de Importaciones a `src/core/import-api-routes.ts`; `server.ts` queda con 179 líneas: solo middlewares de seguridad, registro de rutas y arranque.

## 0.1.32 · 2026-10-01

Mueve las rutas de Consumibles a `src/modules/consumibles/routes.ts` y la carga coordinada (preparación, staging y aplicación en una transacción) a `src/modules/consumibles/bundle-server.ts`; `server.ts` queda con 22 rutas y 658 líneas.

## 0.1.31 · 2026-10-01

Mueve las rutas de Operaciones (cartera, metadatos, Discontinuador y stock Waldbott) a `src/modules/operaciones/routes.ts`; `enqueueImportJob` pasa a `src/core/import-routes.ts`; `server.ts` queda con 33 rutas.

## 0.1.30 · 2026-10-01

Añade `server.routes-smoke.test.ts`: cada GET `/api/*` sin parámetros debe responder sin error 5xx, para detectar de inmediato un import o validador perdido al mover rutas.

## 0.1.29 · 2026-10-01

Mueve las rutas de Catálogo y Mantenimiento a `routes.ts` de cada módulo; `server.ts` queda con 47 rutas.

## 0.1.28 · 2026-10-01

Mueve las rutas de Ventas (Listado de precios y Proformas) a `src/modules/ventas/routes.ts`; `server.ts` queda con 62 rutas.

## 0.1.27 · 2026-10-01

Mueve las rutas de Viáticos y Servicios a `routes.ts`, y los ayudantes compartidos de importación y consulta a `src/core/import-routes.ts` y `src/core/request-parsing.ts`; `server.ts` queda con 75 rutas.

## 0.1.26 · 2026-10-01

Mueve también las rutas de MPS y Cobertura a `routes.ts` y reúne los validadores comunes en `src/core/validation.ts`; `server.ts` queda con 88 rutas.

## 0.1.25 · 2026-10-01

Mueve las rutas de uniFLOW, Software Selector y SLA fuera de `server.ts` a `routes.ts` de cada módulo, centraliza Gemini en `src/core/gemini.ts` y valida con `src/core/validation.ts`; añade pruebas de las exportaciones de Viáticos y uniFLOW.

## 0.1.24 · 2026-10-01

Elimina `docs/PARIDAD-LEGADO.md`, obsoleto tras la aprobación de la suite.

## 0.1.23 · 2026-10-01

Corrige contradicciones y erratas del README y documenta Tracking en la auditoría de paridad, el glosario y la nota de auditoría de dependencias.

## 0.1.22 · 2026-10-01

Excluye las claves de API del respaldo SQLite y de la lectura de configuración, actualiza pdfjs-dist a 6.x (corrige ejecución de JavaScript con PDF maliciosos) y fija el total de módulos en la prueba del manifiesto.

## 0.1.21 · 2026-10-01

Activa automáticamente el fondo de calles de Tracking, sin casilla de activación.

## 0.1.20 · 2026-09-30

Incorpora direcciones de casa matriz cuando no hay sucursal y búsqueda externa puntual de ubicaciones propuestas, con confirmación manual antes de validar.

## 0.1.19 · 2026-09-30

Corrige el resumen: muestra el tiempo total estimado de traslado sumando los intervalos entre visitas, en lugar del período total de marcaciones.

## 0.1.18 · 2026-09-30

Añade un resumen diario de Tracking con distancia directa acumulada, tiempo total registrado y tiempo de servicios sin duplicar intervalos solapados.

## 0.1.17 · 2026-09-30

Completa las rutas de exportación de Superset con las opciones “Detalle de Servicios” para informes y “Del mobile” para geolocalización.

## 0.1.16 · 2026-09-30

Identifica debajo de cada selector de archivos el reporte de Superset correspondiente: SGS - Tecnicos asignados y SGS - I.S. Pendientes y Asignados - Tracking.

## 0.1.15 · 2026-09-30

Guarda las sedes de Tracking por número de serie y las asigna automáticamente a los informes y futuras cargas del mismo equipo.

## 0.1.14 · 2026-09-30

Incorpora Tracking de técnicos: carga coordinada CSV/XLSX, mapa diario de marcaciones, intervalos y distancias directas, y validación de proximidad a sedes confirmadas manualmente con radio de 100 metros.

## 0.1.13 · 2026-09-30

Reemplaza el favicon SVG legado por el icono DCSS en PNG.

## 0.1.12 · 2026-09-30

Actualiza el logo del encabezado con el logotipo DCSS suministrado.

## 0.1.11 · 2026-09-30

Actualiza el icono instalado con el logotipo DCSS suministrado.

## 0.1.10 · 2026-09-29

Mejora el contraste y unifica los botones de cierre de los diálogos de Proformas.

## 0.1.9 · 2026-09-29

Protege la API local, permite elegir entre perfiles antiguos, recupera caídas del servicio, muestra los errores del Resumen y lleva el monograma al icono instalado.

## 0.1.8 · 2026-09-29

Introduce un monograma DC diseñado para la cabecera de la suite.

## 0.1.7 · 2026-09-29

Reemplaza el símbolo del encabezado por dos documentos superpuestos.

## 0.1.6 · 2026-09-29

Mantiene el subtítulo del encabezado en dos líneas sin reducir el icono.

## 0.1.5 · 2026-09-29

Sustituye las iniciales del encabezado por un símbolo de documento y colaboración.

## 0.1.4 · 2026-09-29

Devuelve los iconos del lanzador legado al selector de módulos.

## 0.1.3 · 2026-09-29

Renombra el instalador y la base SQLite a DCSS Suite.

## 0.1.2 · 2026-09-29

Mantiene fijos el selector de módulos y el número de versión al desplazar el contenido.

## 0.1.1 · 2026-09-29

Incorporó el nombre DCSS Suite.
