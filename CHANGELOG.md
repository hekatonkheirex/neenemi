# Historial de cambios

Cada entrada es una versión de DCSS Suite, de la más reciente a la más antigua. La versión visible en la barra lateral abre este historial. El formato lo lee `src/core/changelog.ts`: `## X.Y.Z · AAAA-MM-DD` y debajo el texto de la versión.

## 0.2.0 · 2026-10-07

Inicio pasa a ser el tablero general con los gráficos de Mantenimiento, Consumibles y Control de viáticos, y los respaldos se mueven a Configuración. Esta versión cierra esa serie de ajustes (0.1.95 a 0.1.100) sin cambios funcionales nuevos.

## 0.1.100 · 2026-10-07

El gráfico «Estado del parque» de Inicio queda centrado en su tarjeta: etiquetas y barras ocupan el ancho disponible sin el hueco de la izquierda y las filas se reparten por igual arriba y abajo.

## 0.1.99 · 2026-10-07

El gráfico «Servicios y viajes» por año muestra la cantidad sobre cada barra, sin necesidad de pasar el cursor, tanto en Inicio como en el Histórico de Control de viáticos. Las barras dejan espacio arriba para el valor y la letra se reduce en pantallas angostas para que los números no se pisen.

## 0.1.98 · 2026-10-07

En Inicio, los gráficos de Control de viáticos (título, botón, gráficos y nota) quedan dentro de una sola tarjeta, igual que Estado del parque y Top 10 clientes.

## 0.1.97 · 2026-10-07

En Inicio, los gráficos que comparten fila tienen el mismo ancho y la misma altura: Estado del parque y Top 10 clientes, y Servicios y viajes con Comparativa anual. Ambos usan el mismo tamaño de texto en las descripciones, el gráfico queda centrado en el espacio disponible y los botones de cada módulo se alinean al pie.

## 0.1.96 · 2026-10-07

En Inicio, el estado del parque de Mantenimiento y el Top 10 de clientes de consumibles quedan uno al lado del otro cuando el área de contenido mide 1400 px o más (antes hacía falta una ventana de 1920 px). El gráfico de Mantenimiento pierde el espacio vacío sobre y bajo las barras, y los gráficos de viáticos ocupan el ancho completo debajo. En áreas más angostas se apilan sin desborde horizontal.

## 0.1.95 · 2026-10-07

Los respaldos SQLite descargados guardan su propia fecha de respaldo. Al restaurarlos ya no se recupera la fecha del respaldo anterior ni aparece un falso aviso de «Cambios sin respaldar» por datos que ya están incluidos en el archivo. La base activa solo se marca como respaldada cuando la descarga termina correctamente.

Gestor de mantenimiento calcula siempre sobre los últimos 3 meses disponibles por equipo. Se elimina el selector de 1, 3, 6 y 12 meses y se muestra el período fijo; el tablero, los expedientes y los informes PDF/XLSX usan el mismo alcance.

Consultar Tracking de técnicos y pasar a Control de viáticos ya no activa «Cambios sin respaldar». Las consultas de rutas y direcciones no modifican SQLite y quedan fuera del detector; importar datos o guardar y quitar sedes confirmadas siguen marcándose como cambios pendientes.

El panel de respaldo actualiza su estado mientras está visible y al volver a la ventana. Una descarga que tarda más de 2,5 segundos ya no deja el aviso «Cambios sin respaldar» en pantalla después de completar el respaldo.

Respaldo y recuperación muestra spinner, estado de la operación y tiempo transcurrido al guardar un respaldo, restaurarlo, incorporar originales o limpiar cargas. Los resultados de éxito, cancelación y error quedan visibles; no se inventan porcentajes ni tiempos restantes. En Electron el respaldo se escribe por streaming y solo reemplaza un archivo existente tras completar la transferencia. Tras limpiar cargas, el aviso explica que se retiraron datos activos y se conservaron los originales y el trabajo manual, en lugar de hablar de datos agregados.

Tracking de técnicos recupera la disposición amplia del mapa: el panel de sede ocupa 19 rem y el recorrido utiliza el ancho restante, en lugar de reservar el 40 % de la pantalla para la sede. En ventanas de hasta 1200 px, la sede vuelve a aparecer debajo del mapa.

La barra lateral muestra un solo contorno al enfocar el módulo activo con teclado: el anillo de foco queda dentro del botón y sustituye la barra de selección mientras tiene foco. Se conserva el indicador activo al usar el ratón y el foco visible en los demás módulos.

Inicio pasa a ser el dashboard general y conserva las tres fichas superiores. Añade equipos únicos con contrato, contratos activos por tipo, referencias activas de repuestos y consumibles de Proformas y modelos Canon con fin de soporte ocurrido o futuro. No duplica series, códigos ni modelos; separa los estados desconocidos y distingue fuentes ausentes de conteos reales en cero. Cada ficha abre su módulo. Configuración, al pie del menú y disponible en la paleta de navegación, reúne respaldos, restauración, originales y limpieza de cargas; Inicio conserva solo un aviso compacto. La limpieza mantiene su resultado visible en Configuración.

Inicio muestra tres gráficos tomados de los datos de cada módulo, sin filtros: el estado del tablero de Mantenimiento, el Top 10 de clientes por costo de Analítica de consumibles (originales, compatibles y repuestos, en guaraníes) y, de Control de viáticos, servicios y viajes por año con la comparativa de costos reales. Los años en curso se rotulan como parciales para no confundirlos con un ahorro frente a un año cerrado. Cada gráfico abre su módulo y el del ranking se desplaza con el teclado en pantallas angostas.

## 0.1.94 · 2026-10-07

Los informes impresos (expedientes, dictamen y diagnóstico de Mantenimiento, MPS, Cobertura de tóner, uniFLOW y SLA) llevan en la línea superior el nombre del módulo tal como aparece en el sidebar. El título de cada documento no cambia.

## 0.1.93 · 2026-10-07

La línea pequeña sobre el título de cada módulo ahora empieza por su sección del sidebar (Servicio Técnico, Administrativo, Software, Herramientas). Antes Listado de precios decía «Ventas», Tracking «Operaciones», MPS y Cobertura «Análisis», y Software Selector y SLA «Soporte».

## 0.1.92 · 2026-10-07

El título de cada módulo ahora es el mismo nombre que tiene en la barra lateral: Gestor de mantenimiento, Analítica de consumibles, Calculadora de insumos MPS, Cobertura de tóner y Discontinuador. Un test compara cada título con el sidebar para que no vuelvan a divergir.

## 0.1.91 · 2026-10-07

En Mantenimiento, el botón XLSX queda arriba a la derecha aunque el subtítulo ocupe varias líneas, y se quita el minigráfico de la ficha Críticos.

## 0.1.90 · 2026-10-07

En Archivos y filas de origen se quita el botón «Quitar carga», que solo aparecía en las importaciones de Consumibles. Ahora el panel es de consulta y descarga para todos los dominios; las cargas se quitan desde su módulo.

## 0.1.89 · 2026-10-07

En Archivos y filas de origen, la lista de importaciones ocupa la misma altura que el visor de la fuente seleccionada y hace scroll por dentro, en lugar de quedar con una altura fija más corta. Además va dentro de un recuadro con borde, igual que el visor.

## 0.1.88 · 2026-10-07

Quita de la pestaña Resumen de Consumibles la columna lateral de cargas (las cinco fuentes directas, las fuentes relacionadas del legado y las reglas de cruce). Todas las cargas se hacen desde la pestaña Cargas, así que la tabla de registros ocupa todo el ancho.

## 0.1.87 · 2026-10-07

El filtro «Mes» de Viáticos usa el mismo selector de mes que Consumibles (texto del mes, flechas de año, cuadrícula de 12 meses, «Limpiar» y «Este mes») en lugar del calendario nativo del navegador. Sigue guardando `AAAA-MM`, así que no cambia qué viáticos se muestran.

## 0.1.86 · 2026-10-07

Mejora los filtros Desde y Hasta de Consumibles. El calendario nativo del navegador (campo `---------- ----`, cuadrícula de meses sin estilo) se reemplaza por un selector propio: muestra el mes elegido en texto («octubre 2026»), con flechas de año, cuadrícula de 12 meses en los colores de la marca, el mes actual marcado y los atajos «Limpiar» y «Este mes». Se cierra con Escape o al hacer clic fuera. El filtro sigue guardando `AAAA-MM`, así que no cambia qué datos se muestran.

## 0.1.85 · 2026-10-07

Corrige el recorte de los gráficos de Servicios vs. Consumibles. La vista de análisis pedía como máximo 10 000 registros y el servidor no aceptaba más, así que con 21 023 servicios cargados solo se veían los últimos 10 000 (desde 2025-10) y los meses anteriores salían en cero aunque estaban importados. Lo mismo recortaba las primeras salidas de consumibles (10 951 registros). El tope sube a 100 000 en un solo lugar (`MAX_LIST_LIMIT`) para Consumibles, Salidas, Servicios y Viáticos.

## 0.1.84 · 2026-10-07

Corrige el cuelgue de la carga coordinada de las nueve fuentes, que se quedaba minutos en «Validando fuente 9 de 9». Causa: al guardar, cada fila de Consumibles, Salidas y Servicios buscaba su equipo por número de serie recorriendo toda la tabla de equipos, y mientras tanto el servidor no respondía y la barra no avanzaba. Ahora la búsqueda usa un índice (migración 44) y el guardado de las nueve fuentes con los archivos reales pasa de unos 165 s a unos 6 s. Además la lectura de cabeceras de los XLSX se calcula una vez por hoja y no por fila: validar Servicios LAM baja de 13 s a 3 s. No cambia qué filas se aceptan.

## 0.1.83 · 2026-10-07

Corrige el origen de «Salida de repuestos»: es «SGS > REPORTES > Repuestos», no «Consumibles > Rango de fechas». Se corrige en la carga coordinada y en la tarjeta de Despachos de Consumibles.

## 0.1.82 · 2026-10-07

Consumibles muestra qué archivo está cargado en cada una de las nueve fuentes de la carga coordinada, con su fecha y hora («Cargado: Detalles de consumibles.xlsx · 07/10/2026, 14:32»). Las fuentes sin carga dicen «Sin archivo cargado». Se toma la última carga aplicada de cada fuente.

## 0.1.81 · 2026-10-07

Fecha y hora de carga junto al nombre del archivo en las secciones de carga. Se ve en Expedientes técnicos, MPS, Descontinuador (fuentes y archivos originales), Proformas (contrato abierto y planillas de consumibles y repuestos), Listado de precios, Viáticos (fuente histórica), Cobertura, SLA y Selector de software. Formato «Cargado el 07/10/2026, 14:32». Consumibles no muestra el nombre del archivo cargado, así que no cambia.

## 0.1.80 · 2026-10-07

Indicador de actividad en exportaciones, impresiones y cargas. Los botones de exportar, cargar e «Imprimir / PDF» muestran un spinner y el texto «Exportando…», «Importando…», «Leyendo…» o «Preparando…» mientras trabajan, y no admiten un segundo clic hasta terminar. Antes solo cambiaba el texto en algunos botones; ahora lo hacen también Listado de precios, Proformas, uniFLOW, Expedientes técnicos (XLSX por panel y PDF), SLA, Selector de software y Cobertura. El spinner no gira si el sistema pide reducir el movimiento. Corrige el nombre del origen del XLSX de Expedientes técnicos: «SGS - Evolución de Copias - Rankings».

## 0.1.79 · 2026-10-07

El PDF tabular de Expedientes técnicos ya no lleva «xlsx» en el nombre del archivo (`mantenimiento-20260918-120817.pdf`). En el informe ejecutivo, los cuadros de «Eventos y prioridades detectadas» cierran a la derecha y abajo en cada página y la lista ya no salta entera a otra hoja, que dejaba la primera casi vacía.

## 0.1.78 · 2026-10-07

Alinea la suite con el stack de la marca. Los iconos pasan de Hugeicons a Lucide (`lucide-react`) y se retiran `@hugeicons/react` y `@hugeicons/core-free-icons`; una prueba falla si vuelve a importarse Hugeicons. Los dos manejadores de PDF del proceso principal solo atienden al marco principal de la ventana cargado desde el servidor local, y rechazan iframes y orígenes externos. No cambia el comportamiento visible salvo la forma de los iconos.

## 0.1.77 · 2026-10-06

Corrige los cuatro defectos funcionales detectados al validar el rediseño:

- Listado de precios guarda y recupera las excepciones de tipo de cambio por familia, valida sus valores y conserva el factor comercial de la familia al usar el T.C. global.
- Consumibles y Salidas normalizan fechas textuales `DD/MM/AAAA` y períodos `MM/AAAA`. Al iniciar la API, repara las fechas válidas de los registros históricos para que entren en los filtros mensuales, sin cambiar cantidades, costos ni originales, y sin eliminar filas cuando coinciden claves históricas.
- Proformas valida y persiste categoría, stock y estado de discontinuación de las líneas. Reabrir conserva esos metadatos, incluido stock desconocido (`null`), también cuando el catálogo común actual cambió.
- El PDF tabular de Expedientes técnicos usa un informe exclusivo en A4 horizontal con los equipos filtrados, todas las acciones sugeridas y encabezados repetidos; no imprime controles ni la columna Inspector. Los informes individual y ejecutivo mantienen sus formatos.

## 0.1.76 · 2026-10-06

Corrige tres puntos de usabilidad del rediseño. Proformas desplaza el formulario al enfocar un control que quedaría bajo el resumen inferior, conservando la barra y su disposición lateral desde 1500 px. Cambiar de módulo abre la pantalla desde arriba; cancelar la salida por cambios sin guardar conserva la pantalla actual. En el Resumen General de Consumibles, las tablas de salidas y registros normalizados tienen altura máxima con desplazamiento interno, sin quitar datos ni cambiar la paginación. Conserva los cálculos, los filtros y las fuentes.

## 0.1.75 · 2026-10-06

Segunda entrega del rediseño de Analítica de consumibles, que completa el rediseño de todos los módulos de la suite. Los indicadores, la analítica agregada, los despachos, las tablas por código y por registro, y las pestañas T03, T06, GPR-53, Impacto en contratos, Repuestos, Consumibles vs Repuestos, Servicios vs Consumibles, Ranking y Equipos adoptan los componentes compartidos. Las listas agregadas desplazan dentro de su tarjeta: el Resumen General bajó de unos 54.000 px de alto a unos 23.000. Los registros normalizados de cada familia se muestran de a 50, ya ordenados por la columna elegida. Las filas expandibles (fichas, servicios) ocupan el ancho visible de la tarjeta y su historial desplaza por dentro. Los gráficos usan utilidades Tailwind: la serie «Originales» tiene un azul visible en el tema oscuro y las marcas del eje de meses se espacian para no pisarse. Se retiran las últimas clases globales heredadas (tarjetas, tablas, botones, campos y fichas de resumen) y una prueba falla si vuelven a usarse.

## 0.1.74 · 2026-10-06

Primera entrega del rediseño de Analítica de consumibles: el encabezado, los filtros globales, las fichas de resumen, la tabla de registros normalizados, las fuentes de importación, la pestaña Datos y la carga coordinada de las nueve fuentes adoptan los componentes compartidos. Los montos largos en guaraníes se ajustan al ancho de la ficha. La columna lateral de importaciones pasa bajo la tabla por debajo de 1500 px. Conserva las importaciones, la carga coordinada atómica, el recálculo desde los originales y la limpieza de cargas. Los paneles de análisis, los despachos y las pestañas T03, T06, GPR-53, contratos, repuestos, ranking y equipos siguen con el diseño anterior hasta la segunda entrega. La etiqueta de origen compartida usa el texto secundario del rediseño y se retira el CSS que dejó de usarse, incluido el botón primario heredado.

## 0.1.73 · 2026-10-06

Proformas adopta el encabezado, las tarjetas, los campos, los botones, las tablas y los estados compartidos del rediseño. Cabecera, búsqueda de partes, ítems, mano de obra, resumen, catálogos, contrato abierto e historial conservan sus datos, cálculos y exportación XLSX. Bajo 1500 px el resumen queda como barra fija inferior, más compacta, y desde 1500 px pasa a la columna lateral. Las coincidencias de cada línea se muestran bajo el código sin recortarse. Importar contrato, Actualizar catálogos e Importar informe PDF son diálogos nativos (foco atrapado, Esc, fondo difuminado) que no se cierran mientras procesan. Se agrega el enlace de descarga compartido `ExportLink` y se retira el CSS anterior de pantalla del módulo.

## 0.1.72 · 2026-10-06

Discontinuador adopta el encabezado, las tarjetas, los campos, los botones, las tablas y los estados compartidos del rediseño. Discontinuados, Stock Waldbott y Carga conservan sus datos, filtros por contrato, cliente y área, exportaciones XLSX, importaciones por fuente y filas originales. El resumen de cartera (estado Canon, equipos y contratos por tipo), los modelos identificados y el directorio de clientes se adaptan al ancho de su tarjeta; las tablas desplazan dentro de ella. La paginación y el detalle de origen compartidos con Consumibles, Listado de precios y Viáticos pasan a los componentes del rediseño, sin cambiar su comportamiento. Se retira el CSS anterior de pantalla del módulo.

## 0.1.71 · 2026-10-06

Control de viáticos adopta el encabezado, las tarjetas, los campos, los botones, las tablas y los estados compartidos del rediseño. Resumen, Viajes, Rendiciones e Histórico mantienen sus datos, filtros, paginación y exportación XLSX. Los gráficos de gasto, las comparativas anuales y la tendencia mensual se adaptan al ancho de su tarjeta; las tablas desplazan dentro de ella y el detalle de cada rendición ocupa el ancho visible. El panel «Registrar viaje» y la previsualización de importación son diálogos nativos con el mismo fondo difuminado y foco atrapado; el panel conserva la estimación orientativa, el catálogo de peajes y pasajes y la confirmación antes de descartar cambios. Se retira el CSS anterior de pantalla del módulo.

## 0.1.70 · 2026-10-06

Mantenimiento adopta el encabezado, las tarjetas, los campos, los botones, las tablas y los estados compartidos del rediseño. La fuente de contadores conserva la carga por arrastre, la descarga del original y «Limpiar datos». El tablero muestra los seis indicadores en una fila cuando caben y las listas de prioridad se apilan según el ancho de su tarjeta. En Expedientes técnicos el inspector ocupa el ancho visible de la tarjeta aunque la tabla desplace; conserva el medidor de desgaste, el historial, las lecturas y el informe técnico PDF. Límites por modelo abre el editor como diálogo nativo (foco en Modelo, Esc, foco atrapado) y muestra los errores de validación dentro del diálogo. Conserva los cálculos, los filtros, las exportaciones XLSX, los informes PDF y el atajo «/» de búsqueda. Se retira el CSS anterior de pantalla del módulo, manteniendo los estilos de los informes impresos.

## 0.1.69 · 2026-10-06

Tracking de técnicos adopta el encabezado, las tarjetas, los campos, los botones, las tablas y los estados compartidos del rediseño. Las cargas muestran los nombres completos de los archivos; cobertura, filtros y evidencias quedan separados. El mapa y el editor de sedes comparten columnas sólo cuando caben y se apilan en anchos menores. Conserva las importaciones CSV/XLSX, los cruces, las rutas, la búsqueda explícita en Photon, las referencias por serie, el radio de 100 m y todos los cálculos y límites de evidencia. Se retira el CSS anterior de pantalla, manteniendo los estilos especializados del mapa y de la barra de jornada.

## 0.1.68 · 2026-10-06

Retira la ficha «Familias del catálogo» del resumen de Listado de precios. Las dos fichas restantes, partes visibles y modelos disponibles, comparten el ancho de forma equilibrada. Conserva las familias como filtro y mantiene la separación entre las acciones y la descarga del original.

## 0.1.67 · 2026-10-06

Separa verticalmente la barra de acciones de Listado de precios y el enlace «Descargar original», evitando que quede pegado a «Exportar listado XLSX» en ambos temas. El resumen muestra partes visibles, modelos disponibles y familias del catálogo en lugar de servicios y modelos seleccionados; la selección conserva su contador en su propio panel. No modifica las importaciones ni las descargas.

## 0.1.66 · 2026-10-06

Listado de precios adopta el encabezado, las tarjetas, los campos, las tablas y los botones compartidos del rediseño. Separa el resumen, las reglas comerciales, los filtros y la selección de modelos; conserva las importaciones XLSX/JSON, la restauración de las 13 familias, las notas, los servicios, la selección persistida y la exportación multihoja. Las tablas desplazan dentro de sus tarjetas y los nombres largos se ajustan en ambos temas. Guardar las reglas actualiza inmediatamente los precios visibles. Se retira el CSS anterior exclusivo del módulo.

## 0.1.65 · 2026-10-06

Cobertura de tóner adopta el encabezado, las tarjetas, los campos, las tablas y los botones compartidos del rediseño. La carga PDF distingue el procesamiento, el guardado y los errores; conserva el progreso por página, la restauración desde SQLite, el catálogo color/monocromo y el rendimiento estimado. Los nombres largos se ajustan a sus tarjetas y las tablas desplazan dentro de su contenedor. Se retira el CSS anterior de pantalla, conservando el cálculo local a 300 DPI y el informe PDF ejecutivo.

## 0.1.64 · 2026-10-06

Corrige el desborde entre «Importar perfiles» y «Lectura del perfil» en MPS. Las columnas se adaptan al ancho disponible del contenedor: en la barra lateral de 320 px, las tarjetas quedan una debajo de otra; con espacio suficiente, comparten una fila. Los textos y las acciones de carga y descarga se ajustan al interior de su tarjeta, sin invadir la vecina.

## 0.1.63 · 2026-10-06

MPS adopta el encabezado, las tarjetas, los campos, las tablas y los botones compartidos del rediseño. El catálogo distingue los perfiles manuales de la fuente importada y conserva la búsqueda, los presets de volumen, las proyecciones a cinco años y el análisis ejecutivo. El editor abre como diálogo nativo, enfoca Marca, mantiene el foco dentro y lo devuelve al cerrar; con muchos consumibles, el cuerpo desplaza sin ocultar las acciones. Conserva la creación, edición y duplicación, los presets monocromo/color y la copia de parámetros. Las exportaciones separan el listado de consumibles del análisis completo. Se retira el CSS anterior de pantalla, conservando el informe PDF horizontal y los estilos usados por otros módulos.

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
