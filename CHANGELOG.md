# Historial de cambios

Cada entrada es una versión de DCSS Suite, de la más reciente a la más antigua. La versión visible en la barra lateral abre este historial. El formato lo lee `src/core/changelog.ts`: `## X.Y.Z · AAAA-MM-DD` y debajo el texto de la versión.

## 0.1.48 · 2026-10-05

Respaldo y recuperación ahora es un panel de estado: aviso con color (rojo si nunca hubo respaldo o hay cargas sin respaldar, ámbar a los 7 días, verde si está al día), fecha del último respaldo y de la última carga, cargas sin respaldar y originales dentro de SQLite. La descarga registra la fecha del respaldo (`GET /api/system/backup/status`). Quita la sección "Módulos de la suite" de Inicio, redundante con la barra lateral.

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
