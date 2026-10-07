import type { SuiteDatabase } from '../db/database';

export type SourceSupport = 'complete' | 'partial' | 'pending';

export type SourceFieldMapping = {
  source: string;
  target: string;
};

export type SourceDefinition = {
  id: string;
  moduleIds: readonly string[];
  label: string;
  expectedFiles: readonly string[];
  filePrefixes?: readonly string[];
  importTypes?: readonly string[];
  importDomains?: readonly string[];
  origin: string;
  purpose: string;
  normalizedFields?: readonly SourceFieldMapping[];
  support: SourceSupport;
  supportNote: string;
};

export type SourceImportStatus = {
  total: number;
  applied: number;
  failed: number;
  lastImportedAt: string | null;
  rawRows: number;
  rawSheets: number;
};

export type SourceCoverage = SourceDefinition & {
  imported: SourceImportStatus;
};

/**
 * Canonical source map for the legacy applications included in the suite.
 *
 * The origin text is intentionally explicit. When the legacy project did not
 * document an SGS/Superset path, that absence is recorded instead of being
 * guessed. This map is the contract used by the migration UI and the audit
 * documentation.
 */
export const SOURCE_CATALOG: readonly SourceDefinition[] = [
  {
    id: 'fleet.equipment',
    moduleIds: ['mantenimiento', 'descontinuador', 'consumibles'],
    label: 'Equipos en contrato',
    expectedFiles: ['Detalles de equipos en contrato.xlsx'],
    importTypes: ['fleet.equipment'],
    importDomains: ['operations'],
    origin: 'Superset > SGS Equipos vs Contratos > Equipos CON Contratos > Detalle de Equipos con Contrato',
    purpose: 'Construye la relación cliente, contrato, modelo, serie, sucursal, ciudad y dirección.',
    normalizedFields: [
      { source: 'Cliente / sector / tipo de contrato', target: 'Cliente, sector y contrato' },
      { source: 'Ref Data / Nº OV', target: 'Referencia y orden de venta' },
      { source: 'Modelo / serie', target: 'Equipo instalado' },
      { source: 'Marca / descripción', target: 'Metadatos del equipo' },
      { source: 'Interior / ciudad / sucursal / dirección', target: 'Ubicación operativa' },
    ],
    support: 'partial',
    supportNote: 'La carga independiente ya está disponible y conserva los campos principales; la vista de cartera ofrece filtros y exporta clientes, contratos, equipos y detalles de origen, mientras las columnas no proyectadas siguen disponibles desde la fila original.',
  },
  {
    id: 'fleet.contracts',
    moduleIds: ['mantenimiento', 'descontinuador', 'consumibles'],
    label: 'Contratos afectados',
    expectedFiles: ['Contratos.xlsx'],
    importTypes: ['contracts'],
    importDomains: ['operations-fleet-contracts'],
    origin: 'Superset > SGS Equipos vs Contratos > Contratos afectados',
    purpose: 'Completa contrato, tipo, vigencia, división y orden de venta.',
    normalizedFields: [
      { source: 'Cliente / referencia', target: 'Identidad del contrato' },
      { source: 'Tipo de contrato', target: 'Alquiler, Leasing o Mantenimiento' },
      { source: 'Fecha inicio / fecha fin', target: 'Vigencia' },
      { source: 'Nº OV / división', target: 'Orden de venta y unidad' },
      { source: 'Vigente / requiere cierre', target: 'Estado operativo' },
    ],
    support: 'partial',
    supportNote: 'La carga independiente ya está disponible y actualiza clientes y contratos; la cartera permite filtrar y exportar los contratos con sus metadatos y detalles de origen, mientras las columnas no proyectadas siguen en la fila original.',
  },
  {
    id: 'fleet.contract-details',
    moduleIds: ['mantenimiento', 'descontinuador', 'consumibles'],
    label: 'Detalles de contratos',
    expectedFiles: ['Detalles de contratos.xlsx'],
    importTypes: ['contract-details'],
    importDomains: ['operations-fleet-contract-details'],
    origin: 'Superset > SGS Contratos > Detalle de Contratos',
    purpose: 'Aporta área comercial, fechas de inicio y fin, vigencia, división y requisito de cierre.',
    normalizedFields: [
      { source: 'Referencia del contrato', target: 'Contrato compartido' },
      { source: 'Área comercial / división', target: 'Filtros operativos' },
      { source: 'Fecha inicio / fecha fin', target: 'Vigencia del contrato' },
      { source: 'Vigente / requiere cierre', target: 'Estado y cierre' },
    ],
    support: 'partial',
    supportNote: 'La carga independiente ya proyecta el área del contrato y conserva sus metadatos principales; permite exportarlos junto con los detalles de origen, mientras el identificador interno y las columnas no mapeadas siguen guardados en el XLSX original.',
  },
  {
    id: 'fleet.customer-classification',
    moduleIds: ['mantenimiento', 'descontinuador'],
    label: 'Clasificación de clientes',
    expectedFiles: ['Clasificación de clientes.xlsx'],
    filePrefixes: ['clasificacion de clientes', 'clasificacion'],
    importTypes: ['classification'],
    importDomains: ['operations-fleet-classification'],
    origin: 'Superset > SGS Equipos vs Contratos > Equipos CON Contratos > Detalle de Equipos con Contrato',
    purpose: 'Clasifica cliente por tipo de cliente y área comercial interna.',
    normalizedFields: [
      { source: 'Cliente', target: 'Cliente compartido' },
      { source: 'Tipo de cliente', target: 'Público o privado' },
      { source: 'Área comercial interna', target: 'Strategic o Commercial' },
    ],
    support: 'partial',
    supportNote: 'La carga separada ya cruza la clasificación por nombre normalizado; las filas sin cliente previo se incorporan y el resto del registro queda en el archivo original.',
  },
  {
    id: 'consumibles.detail',
    moduleIds: ['consumibles'],
    label: 'Detalle de consumibles',
    expectedFiles: ['Detalles de consumibles.xlsx'],
    importTypes: ['consumibles'],
    importDomains: ['consumibles'],
    origin: 'Superset > SGS Cliente 360 > Consumibles > Consumibles, Detalles',
    purpose: 'Registra consumo por fecha, equipo, serie, código, descripción, cantidad y total.',
    normalizedFields: [
      { source: 'Fecha', target: 'Fecha y mes' },
      { source: 'Equipo / serie', target: 'Equipo instalado' },
      { source: 'Código / descripción', target: 'Pieza, familia y categoría' },
      { source: 'Cantidad', target: 'Unidades consumidas' },
      { source: 'Costo', target: 'Costo normalizado y PYG de consulta' },
      { source: 'Cliente / sector / área comercial / contrato', target: 'Cartera compartida cuando existe' },
      { source: 'Id.Cab', target: 'Detalle de origen consultable' },
    ],
    support: 'partial',
    supportNote: 'Se importan las líneas analizadas y, cuando sus encabezados existen, también se proyectan cliente, OV, división y período; las demás columnas siguen disponibles en la fila original.',
  },
  {
    id: 'consumibles.parts-detail',
    moduleIds: ['consumibles'],
    label: 'Detalle de repuestos',
    expectedFiles: ['Detalles de repuestos.xlsx'],
    importTypes: ['repuestos'],
    importDomains: ['consumibles'],
    origin: 'Superset > SGS Cliente 360 > Repuestos > Repuestos, Detalles',
    purpose: 'Completa el consumo de repuestos y permite clasificar rodillos, cilindros y piezas.',
    normalizedFields: [
      { source: 'Fecha', target: 'Fecha y mes' },
      { source: 'Equipo / serie', target: 'Equipo instalado' },
      { source: 'Código / descripción', target: 'Pieza, familia y categoría' },
      { source: 'Cantidad / costo', target: 'Unidades y costo normalizado' },
      { source: 'Tipo de pieza', target: 'Consumible migrado o repuesto' },
      { source: 'Sector / área comercial / contrato', target: 'Clasificación operativa compartida' },
      { source: 'Id.Cab', target: 'Detalle de origen consultable' },
    ],
    support: 'partial',
    supportNote: 'Se conserva el subconjunto usado por el análisis y, cuando sus encabezados existen, también se proyectan cliente, OV, división y período; las demás columnas siguen disponibles en la fila original.',
  },
  {
    id: 'consumibles.parts-usage',
    moduleIds: ['consumibles'],
    label: 'Uso de repuestos',
    expectedFiles: ['Detalles de uso de repuestos.xlsx'],
    importTypes: ['uso-repuestos'],
    importDomains: ['consumibles'],
    origin: 'Superset > SGS Uso de Repuestos > Consolidados y selectores > Detalle de Repuestos',
    purpose: 'Relaciona salida, técnico, cliente, contrato, informe de servicio, pieza, cantidad y total en PYG.',
    normalizedFields: [
      { source: 'Fecha / mes', target: 'Fecha y período' },
      { source: 'Cliente / OV / tipo de contrato', target: 'Trazabilidad comercial de origen' },
      { source: 'Equipo / serie', target: 'Equipo instalado' },
      { source: 'Código / descripción', target: 'Pieza, familia y categoría' },
      { source: 'Cantidad', target: 'Unidades usadas' },
      { source: 'Precio unitario PYG / total PYG', target: 'Costo normalizado y referencia PYG' },
      { source: 'Sector / área comercial', target: 'Clasificación operativa compartida' },
      { source: 'División / salida / técnico / sucursal / vigencia', target: 'Detalle operativo consultable' },
      { source: 'Informe / tarea / repuestos usados', target: 'Trazabilidad técnica de origen' },
    ],
    support: 'partial',
    supportNote: 'El lector detecta la cabecera aunque esté precedida por títulos, resuelve encabezados con respaldo posicional, conserva cliente/OV y precios PYG, y proyecta el detalle operativo reconocido en un bloque reutilizable; las columnas restantes siguen en la fila original.',
  },
  {
    id: 'consumibles.dispatch',
    moduleIds: ['consumibles'],
    label: 'Salida de consumibles',
    expectedFiles: ['Salida de Consumibles.xlsx'],
    importTypes: ['salida-consumibles'],
    importDomains: ['consumibles'],
    filePrefixes: ['salida de consumibles'],
    origin: 'SGS > REPORTES > Consumibles > Rango de fechas',
    purpose: 'Registra remisiones, cantidades, rendimiento, equipo, cliente y observaciones.',
    normalizedFields: [
      { source: 'Remisión / fecha', target: 'Documento y fecha de salida' },
      { source: 'Código / descripción', target: 'Pieza, familia y categoría' },
      { source: 'Cantidad / rendimiento', target: 'Unidades y páginas declaradas' },
      { source: 'Serie / modelo / cliente', target: 'Equipo y cliente de origen' },
      { source: 'Sector / área comercial / contrato', target: 'Clasificación operativa compartida' },
      { source: 'Precio / total / observaciones / contacto', target: 'Detalle del comprobante consultable' },
    ],
    support: 'partial',
    supportNote: 'La suite detecta la cabecera aunque esté precedida por títulos, guarda despachos normalizados y proyecta rendimiento, precios, observaciones y contacto; el comprobante completo sigue en la fila original.',
  },
  {
    id: 'consumibles.parts-dispatch',
    moduleIds: ['consumibles'],
    label: 'Salida de repuestos',
    expectedFiles: ['Salida de Repuestos.xlsx'],
    importTypes: ['salida-repuestos'],
    importDomains: ['consumibles'],
    filePrefixes: ['salida de repuestos'],
    origin: 'SGS > REPORTES > Repuestos',
    purpose: 'Registra comprobante, fecha, pieza, cantidad, precio, cliente, equipo, técnico y Nº de informe.',
    normalizedFields: [
      { source: 'Comprobante / fecha', target: 'Documento y fecha de salida' },
      { source: 'Código / descripción', target: 'Pieza, familia y categoría' },
      { source: 'Cantidad', target: 'Unidades despachadas' },
      { source: 'Cliente / modelo / serie', target: 'Equipo y cliente de origen' },
      { source: 'Sector / área comercial / contrato', target: 'Clasificación operativa compartida' },
      { source: 'Técnico / Nº de informe', target: 'Trazabilidad del servicio' },
      { source: 'Precio / total / contrato', target: 'Detalle del comprobante consultable' },
    ],
    support: 'partial',
    supportNote: 'La suite detecta la cabecera aunque esté precedida por títulos y guarda la salida para métricas y fichas, con precios y contrato de origen cuando están disponibles; el resto del comprobante sigue en la fila original.',
  },
  {
    id: 'services.lam',
    moduleIds: ['consumibles'],
    label: 'Servicios LAM',
    expectedFiles: ['Servicios LAM.xlsx'],
    filePrefixes: ['servicios lam'],
    importTypes: ['servicios'],
    importDomains: ['services'],
    origin: 'Superset > SGS Cantidad y Tiempos en Servicios > Planilla detallada > Detalle de los Servicios',
    purpose: 'Relaciona informes de servicio, cliente, OV, serie, equipo, horas, responsable, tarea, estado y técnico.',
    normalizedFields: [
      { source: 'Nº I.S. / Nº OV', target: 'Servicio y orden de venta' },
      { source: 'Cliente / serie / equipo', target: 'Equipo instalado y cliente' },
      { source: 'Sector / área comercial / contrato', target: 'Clasificación operativa compartida' },
      { source: 'Tipo servicio / fecha inicio', target: 'Tipo y fecha de intervención' },
      { source: 'Tipo contrato / tipo tarea', target: 'Clasificación operativa' },
      { source: 'Técnico / tarea realizada', target: 'Responsable y trabajo ejecutado' },
      { source: 'Repuestos utilizados', target: 'Relación con consumibles' },
      { source: 'Horas / estados / cierres / ciudades / banderas', target: 'Detalle operativo consultable' },
    ],
    support: 'partial',
    supportNote: 'La suite detecta la cabecera aunque esté precedida por títulos, importa el historial y proyecta tiempos, estados, cierres, ciudades y banderas reconocidas; las columnas restantes siguen en la fila original.',
  },
  {
    id: 'catalog.shared',
    moduleIds: ['catalogo', 'listado-precios', 'proformas', 'descontinuador'],
    label: 'Catálogo general de repuestos',
    expectedFiles: ['Listado Gral mayo_2026_para_Mura.xlsx'],
    filePrefixes: ['listado gral'],
    importTypes: ['catalog-seed'],
    importDomains: ['catalog'],
    origin: 'Archivo Excel extraído de Waldbott y utilizado por el proyecto legado catálogo-de-repuestos-canon.',
    purpose: 'Alimenta repuestos, modelos compatibles, stock, costos y precios comerciales.',
    normalizedFields: [
      { source: 'Código / N° de parte', target: 'Parte comercial' },
      { source: 'Descripción', target: 'Descripción de repuesto' },
      { source: 'Modelo / familia / Equivalencia', target: 'Modelos compatibles' },
      { source: 'Nota técnica del modelo', target: 'Referencia técnica por modelo' },
      { source: 'labor / fixedGs', target: 'Mano de obra y cargos fijos' },
      { source: 'Stock', target: 'Stock disponible' },
      { source: 'Costo USD / Precio Gs.', target: 'Costo y precio local' },
    ],
    support: 'complete',
    supportNote: 'Esta fuente no proviene de SGS ni Superset: es un Excel extraído de Waldbott. La integración del Catálogo cubre la consulta de repuestos, modelos, stock, costos y precios, además de importación, filtros, selección, trazabilidad y exportación; también conserva la semilla heredada de 13 familias y sus reglas comerciales. Las filas genéricas o de otros fabricantes se conservan y pueden incluirse explícitamente para auditoría.',
  },
  {
    id: 'maintenance.counters',
    moduleIds: ['mantenimiento'],
    label: 'Contadores de mantenimiento',
    expectedFiles: ['Contadores.csv', 'Contadores.xlsx'],
    filePrefixes: ['database sqlite', 'contadores'],
    importDomains: ['maintenance'],
    origin: 'Superset > SGS - Evolución de Copias - Rankings.',
    purpose: 'Analiza lecturas por equipo, período, tipo de papel, vida útil, óptimo y merma.',
    normalizedFields: [
      { source: 'Cliente / Nº O.V.', target: 'Cliente y contrato compartidos' },
      { source: 'Equipo / Nº Serie', target: 'Equipo y expediente técnico' },
      { source: 'Año-Mes / Papel', target: 'Período y tipo de papel' },
      { source: 'Copias / Contador', target: 'Análisis de volumen y desgaste' },
      { source: 'División / sucursal / informe / tarea', target: 'Detalle operativo y trazabilidad de origen' },
    ],
    support: 'partial',
    supportNote: 'La suite acepta CSV y XLSX, conserva hoja/fila, muestra el tablero ejecutivo y las prioridades por estado, permite editar reglas, descargar el archivo original archivado y exporta el análisis filtrado a XLSX/PDF; el usuario confirmó todas las columnas del XLSX histórico exportado. Siguen pendientes la importación directa de .xls binario y la equivalencia visual exacta del PDF legado.',
  },
  {
    id: 'mps.database',
    moduleIds: ['mps'],
    label: 'Base MPS Canon',
    expectedFiles: ['canon_mps.db'],
    filePrefixes: ['canon mps'],
    importDomains: ['mps'],
    origin: 'Calculadora MPS local: base SQLite generada por el proyecto anterior.',
    purpose: 'Importa modelos, volúmenes recomendados y consumibles con rendimiento y SKU.',
    normalizedFields: [
      { source: 'brand / model', target: 'Marca y modelo MPS' },
      { source: 'speedPpm / isColor', target: 'Velocidad y color' },
      { source: 'recVolumeMin / recVolumeMax', target: 'Volumen recomendado' },
      { source: 'name / type / color', target: 'Consumible y categoría' },
      { source: 'yieldPages / sku', target: 'Rendimiento y código comercial' },
    ],
    support: 'partial',
    supportNote: 'La base se migra, enlaza modelos canónicos y permite CRUD de perfiles manuales con sus consumibles; la ficha técnica, su exportación independiente de consumibles, el análisis ejecutivo, el libro XLSX, el PDF local desde Electron y la descarga de la base original archivada ya están disponibles. Falta verificar equivalencia visual exacta con el PDF legado.',
  },
  {
    id: 'travel.control',
    moduleIds: ['viaticos'],
    label: 'Control de viáticos',
    expectedFiles: ['CONTROL DE VIATICO 2026.xlsx'],
    filePrefixes: ['control de viatico'],
    importDomains: ['viaticos'],
    origin: 'Planilla local de Administración: VIAJES2026, CALCULO AUX, PEAJES y PASAJES EN BUS.',
    purpose: 'Importa viajes, históricos anuales/mensuales y tarifas auxiliares para estimaciones.',
    normalizedFields: [
      { source: 'VIAJES2026: Cant / Fecha / I.S. / Cliente / Destino', target: 'Identidad y fecha del viaje' },
      { source: 'VIAJES2026: Medio / Técnicos / Chofer', target: 'Responsables y transporte' },
      { source: 'VIAJES2026: Monto / Viático / Hospedaje / Peajes / Varios', target: 'Importes de la rendición' },
      { source: 'VIAJES2026: pagos / Km / combustible / Gasto total', target: 'Costos normalizados en guaraníes' },
      { source: 'VIAJES2026: Móvil / consumo x 100 km / Costos x Lts / totales auxiliares', target: 'Columnas calculadas de origen' },
      { source: 'CALCULO AUX / PEAJES / PASAJES EN BUS', target: 'Catálogo local para estimaciones' },
      { source: 'GRAFICO VIAJES / GRAFICO COSTOS', target: 'Resúmenes históricos anuales y mensuales' },
    ],
    support: 'partial',
    supportNote: 'La suite importa viajes y resúmenes, previsualiza antes de guardar, permite reemplazar la fuente aplicada, expone las hojas originales, ofrece municipios asistidos, proyecta las ocho columnas calculadas de VIAJES2026 y exporta el detalle; queda pendiente verificar la equivalencia exacta de cualquier auxiliar nuevo del libro.',
  },
  {
    id: 'discontinuation.canon',
    moduleIds: ['descontinuador'],
    label: 'Modelos Canon discontinuados',
    expectedFiles: ['Lista Canon de modelos discontinuados.xlsx'],
    filePrefixes: [
      'modelos discontinuos',
      'canon discontinu',
      '2023 discontinued machine list',
      '2024 discontinued machine list',
      '2025 discontinued machine list',
      '2026 discontinued machine list',
    ],
    importDomains: ['operations-canon'],
    origin: 'Archivo de soporte Canon utilizado por Operaciones; el proyecto legado no documenta una ruta SGS/Superset.',
    purpose: 'Relaciona modelo, código de parte y fecha de fin de soporte.',
    normalizedFields: [
      { source: 'Machine / Machines / Model', target: 'Modelo Canon' },
      { source: 'Parts Item Code', target: 'Código de parte' },
      { source: 'Voltage / Tensión', target: 'Tensión del modelo o repuesto' },
      { source: 'Support End / End Date / Parts End Date', target: 'Fin de soporte' },
      { source: 'Columnas adicionales con valor', target: 'Notas de fuente' },
    ],
    support: 'partial',
    supportNote: 'La carga independiente y múltiple, incluida la familia de listas anuales Discontinued Machine List, la acumulación sin duplicados, la tabla de modelos, el cruce con la cartera, los filtros, el resumen gráfico y las vistas internas ya están integrados; el código de parte, la tensión y las notas de columnas adicionales se proyectan en el registro Canon, mientras cualquier campo futuro sigue visible en la fuente original.',
  },
  {
    id: 'discontinuation.waldbott',
    moduleIds: ['descontinuador'],
    label: 'Stock Waldbott',
    expectedFiles: ['Equipos en Contratos y en Dpto MRA.xlsx'],
    filePrefixes: ['equipos en contratos y en dpto mra'],
    importDomains: ['operations-waldbott'],
    origin: 'Inventario Waldbott: se toma la columna Depósito/Deposits = 04.',
    purpose: 'Cruza modelos y cantidades recuperables con soporte Canon y cartera instalada.',
    normalizedFields: [
      { source: 'Descripción / Modelo', target: 'Modelo de stock' },
      { source: 'Depósito / Deposits', target: 'Depósito 04' },
      { source: 'Cantidad (si existe)', target: 'Unidades en stock' },
    ],
    support: 'partial',
    supportNote: 'La carga del Depósito 04, el cruce con soporte Canon y cartera instalada, los filtros, la navegación por vistas y la exportación de cartera ya están disponibles; la planilla se trata como inventario de modelos y conserva su origen.',
  },
  {
    id: 'proformas.catalog-consumables',
    moduleIds: ['proformas'],
    label: 'Catálogo de consumibles para proformas',
    expectedFiles: ['CONSUMIBLES_SISTEMA_ING.xlsx'],
    importTypes: ['proformas-catalog-consumibles'],
    importDomains: ['sales-catalog'],
    origin: 'Catálogo local del proyecto de Proformas; el origen SGS/Superset no está documentado.',
    purpose: 'Carga líneas de consumibles usadas en proformas sin contrato.',
    support: 'partial',
    supportNote: 'La suite acepta la planilla separada, conserva el XLSX original y usa sus precios, stock y estado en la búsqueda y carga manual por código de Proformas; las columnas no proyectadas siguen disponibles en la fila original.',
  },
  {
    id: 'proformas.catalog-parts',
    moduleIds: ['proformas'],
    label: 'Catálogo de repuestos para proformas',
    expectedFiles: ['REPUESTOS_SISTEMA_ING.xlsx'],
    importTypes: ['proformas-catalog-repuestos'],
    importDomains: ['sales-catalog'],
    origin: 'Catálogo local del proyecto de Proformas; el origen SGS/Superset no está documentado.',
    purpose: 'Carga líneas de repuestos usadas en proformas sin contrato.',
    support: 'partial',
    supportNote: 'La suite acepta la planilla separada, conserva el XLSX original y usa sus precios, stock y estado en la búsqueda y carga manual por código de Proformas; las columnas no proyectadas siguen disponibles en la fila original.',
  },
  {
    id: 'proformas.open-contract',
    moduleIds: ['proformas'],
    label: 'Contrato abierto',
    expectedFiles: ['Contrato abierto (.xlsx o .pdf)'],
    importTypes: ['open-contract'],
    importDomains: ['sales-open-contract'],
    origin: 'Archivo contractual entregado por el cliente.',
    purpose: 'Extrae líneas y precios fijos para cotizar repuestos y consumibles de un contrato abierto.',
    support: 'partial',
    supportNote: 'La suite importa XLSX o PDF con texto, muestra una vista previa, conserva el archivo original, detecta la moneda del precio (Gs. o USD) y la mantiene en la proforma y el XLSX; los PDF escaneados y las variantes no tabulares requieren revisión manual.',
  },
  {
    id: 'proformas.service-report',
    moduleIds: ['proformas'],
    label: 'Informe de servicio',
    expectedFiles: ['Informe de servicio (.pdf)'],
    origin: 'Informe técnico entregado por Operaciones o el cliente.',
    purpose: 'Detecta modelo, técnico, tarea y repuestos sugeridos para una proforma.',
    support: 'partial',
    supportNote: 'La suite lee localmente PDF con texto, muestra vista previa, aplica la cabecera incluida la fecha/hora de emisión y sugiere líneas del catálogo común; los PDF escaneados como imagen siguen pendientes.',
  },
  {
    id: 'coverage.client-pdf',
    moduleIds: ['cobertura'],
    label: 'Informe PDF de cobertura',
    expectedFiles: ['Informe de cobertura del cliente (.pdf)'],
    origin: 'Documento PDF generado por el equipo o suministrado por el cliente.',
    purpose: 'Calcula cobertura por página a 300 DPI y estima rendimiento de tóner según ISO/IEC 19798.',
    support: 'pending',
    supportNote: 'La suite conserva el cálculo manual/JSON y permite guardar el informe como PDF local; todavía no lee el PDF de entrada directamente.',
  },
  {
    id: 'sla.client-pdf',
    moduleIds: ['sla'],
    label: 'Pliego de bases y condiciones',
    expectedFiles: ['Pliego del cliente (.pdf)'],
    origin: 'Documento de licitación entregado por el cliente.',
    purpose: 'Compara requisitos del pliego contra el SLA de Data Systems.',
    normalizedFields: [
      { source: 'Horarios / tiempos de atención', target: 'Cláusulas operativas' },
      { source: 'Consumibles / contadores / backup', target: 'Cobertura del SLA' },
      { source: 'Confidencialidad / responsabilidades', target: 'Riesgo y negociación' },
    ],
    support: 'partial',
    supportNote: 'La suite acepta TXT, MD, CSV, JSON y PDF con capa de texto, aplica reglas locales y permite guardar el informe como PDF local; los PDF escaneados y el análisis IA configurable del proyecto anterior siguen pendientes.',
  },
  {
    id: 'software-selector.pbc',
    moduleIds: ['software-selector'],
    label: 'PBC para selector de software',
    expectedFiles: ['Pliego de bases y condiciones (.pdf o .docx)'],
    origin: 'Pliego o especificación entregada por el cliente.',
    purpose: 'Detecta requisitos de impresión, escaneo, seguridad y nube para recomendar productos Canon.',
    normalizedFields: [
      { source: 'Impresión / liberación / cuotas', target: 'Gestión de impresión' },
      { source: 'Escaneo / OCR / DMS / nube', target: 'Flujos documentales' },
      { source: 'Contadores / flotas / alertas', target: 'Gestión y servicio' },
      { source: 'SSO / Active Directory / Zero Trust', target: 'Seguridad e identidad' },
    ],
    support: 'partial',
    supportNote: 'La suite acepta TXT, MD, CSV, JSON, PDF con capa de texto y DOCX, extrae el contenido localmente, ofrece selección manual/presets y aplica heurísticas deterministas; permite guardar el resultado en PDF local o JSON. El proveedor IA configurable y el layout exacto del PDF legado siguen pendientes.',
  },
  {
    id: 'uniflow.price-catalog',
    moduleIds: ['uniflow'],
    label: 'Tarifas uniFLOW Online',
    expectedFiles: ['Catálogo de tarifas uniFLOW Online'],
    origin: 'Catálogo comercial local embebido en la aplicación anterior y editable por Ventas.',
    purpose: 'Define SKU, tiers, precios y vigencia de CPS/CIP T1/T2.',
    normalizedFields: [
      { source: 'Modelo Canon', target: 'Clasificación CPS T1/T2' },
      { source: 'CPS T1 / CPS T2', target: 'Licencias base por volumen' },
      { source: 'CIP T1 / CIP T2', target: 'Escaneo avanzado por volumen' },
      { source: 'Tier / SKU / precio', target: 'Cotización mensual y contractual' },
      { source: 'Fuente / vigencia', target: 'Trazabilidad comercial' },
    ],
    support: 'partial',
    supportNote: 'La suite replica los 20 modelos, las cuatro listas de 13 tiers, el editor persistente, el cálculo comercial y los informes PDF/XLSX locales; el catálogo permanece como fuente comercial editable, no como export SGS/Superset.',
  },
] as const;

type ImportBatchRow = {
  id: string;
  domain: string;
  source_name: string;
  source_type: string | null;
  status: 'staged' | 'applied' | 'failed';
  created_at: string;
  applied_at: string | null;
  raw_rows: number;
  raw_sheets: number;
};

export function normalizeSourceName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    ?.replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim() ?? '';
}

export function sourceMatchesDefinition(
  definition: SourceDefinition,
  sourceName: string,
  sourceType?: string | null,
  sourceDomain?: string | null,
): boolean {
  const hasTypeConstraint = Boolean(definition.importTypes?.length);
  if (sourceType && hasTypeConstraint) {
    return definition.importTypes!.includes(sourceType);
  }
  const hasDomainConstraint = Boolean(definition.importDomains?.length);
  if (sourceDomain && hasDomainConstraint) {
    return definition.importDomains!.includes(sourceDomain);
  }
  if ((sourceType && hasTypeConstraint) || (sourceDomain && hasDomainConstraint)) {
    return false;
  }
  const normalized = normalizeSourceName(sourceName);
  return definition.expectedFiles.some((fileName) => normalizeSourceName(fileName) === normalized)
    || (definition.filePrefixes ?? []).some((prefix) => normalized.startsWith(normalizeSourceName(prefix)));
}

export function getSourceCoverage(database: SuiteDatabase): SourceCoverage[] {
  const importBatchColumns = database
    .prepare('PRAGMA table_info(import_batches)')
    .all() as Array<{ name: string }>;
  const hasSourceType = importBatchColumns
    .some((column) => column.name === 'source_type');
  const hasDomain = importBatchColumns
    .some((column) => column.name === 'domain');
  const imports = database
    .prepare(`
      SELECT
        batch.id,
        ${hasDomain ? 'batch.domain' : "'' AS domain"},
        batch.source_name,
        ${hasSourceType ? 'batch.source_type' : 'NULL AS source_type'},
        batch.status,
        batch.created_at,
        batch.applied_at,
        COUNT(DISTINCT raw.id) AS raw_rows,
        COUNT(DISTINCT raw.import_file_id || ':' || raw.sheet_name) AS raw_sheets
      FROM import_batches batch
      LEFT JOIN import_source_rows raw ON raw.batch_id = batch.id
      GROUP BY batch.id
    `)
    .all() as ImportBatchRow[];

  return SOURCE_CATALOG.map((definition) => {
    const matchingImports = imports.filter((item) => sourceMatchesDefinition(definition, item.source_name, item.source_type, item.domain));
    const timestamps = matchingImports
      .map((item) => item.applied_at ?? item.created_at)
      .sort((left, right) => right.localeCompare(left));

    return {
      ...definition,
      imported: {
        total: matchingImports.length,
        applied: matchingImports.filter((item) => item.status === 'applied').length,
        failed: matchingImports.filter((item) => item.status === 'failed').length,
        lastImportedAt: timestamps[0] ?? null,
        rawRows: matchingImports.reduce((total, item) => total + item.raw_rows, 0),
        rawSheets: matchingImports.reduce((total, item) => total + item.raw_sheets, 0),
      },
    };
  });
}
