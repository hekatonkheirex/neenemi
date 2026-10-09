# Historial de Ñe'eñemi

## 0.4.0 · sin publicar

- Migración de Electron/React/Express a WinUI 3 + C# y .NET 10 para Windows x64; retiradas las fuentes, dependencias y entradas de ejecución anteriores.
- Grabación solo por nombre, sin selector ni presentación de clientes. Se conservan las asociaciones históricas en SQLite.
- Captura Windows PCM 16 kHz con persistencia periódica y último bloque; lectura del audio WebM histórico sin reemplazar originales.
- Resúmenes locales estructurados con Ollama y Qwen3 4B en CPU, bloques acotados/consolidación, referencias al audio y responsables/fechas solo si se mencionan.
- Cola secuencial durable con encolado atómico del resumen automático; cancelar, recuperar, reintentar y preservar transcripciones/resúmenes ante errores.
- Interfaz nativa para historial, reproducción por segmento, exportación, confirmaciones y preparación de modelos sin terminal.
- Migración SQLite con respaldo previo e importación de Ñe'eñemi/DCSS en solo lectura sin sobrescribir grabaciones.
- Automatización de instalador Inno Setup por usuario, runtimes autocontenidos y recursos Whisper/ffmpeg con SHA-256.
- Verificados 21 tests del núcleo y recorridos reales de Whisper, Qwen3 y procesamiento completo desde audio de archivo hasta generación de Markdown, preparación de reproducción y eliminación. Comprobación de tipos WinUI realizada en Linux.
- Corregidos los bloques de resumen en Windows: separadores LF explícitos, coherentes con el lector y el presupuesto UTF-8, sin añadir CR al texto ni exceder el contexto. Verificada la frontera exacta del presupuesto con texto Unicode.
- Restaurada la inicialización estándar de WinUI mediante `App.xaml`, clase parcial e `InitializeComponent`, para generar los metadatos que faltaban al cargar `XamlControlsResources`. El arranque tras esta reparación aún requiere comprobación en Windows; `c000027b` por sí solo no identifica la excepción interna.

Pendiente de aceptación en Windows: build completo/instalador, ventana, micrófono real y consumo en laptop de 8 GB. No se publicó un instalador ni se garantiza aún ese rendimiento.

## 0.3.2 · 2026-10-09

Separación del módulo Reuniones de DCSS Suite como aplicación standalone **Ñe'eñemi**.

- Grabación de micrófono, reproducción y transcripción local con Whisper medium cuantizado q5_0.
- Historial, progreso, cancelación, reintentos, copia y exportación Markdown.
- Perfil, base SQLite, identificador e instalador independientes de DCSS.
- Importación de grabaciones y vocabulario de DCSS sin modificar el origen ni sobrescribir grabaciones existentes.
- Retirados los demás módulos, APIs, migraciones y dependencias de la suite.

Se conserva la versión del módulo extraído; no es una actualización de DCSS Suite.
DCSS vuelve a su versión anterior a Reuniones, `0.2.3`.
