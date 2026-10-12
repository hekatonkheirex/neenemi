# Historial de Ñe'eñemi

## 0.1.0 · sin publicar

La versión de Ñe'eñemi es independiente de DCSS y se establece en `0.1.0`; no continúa la numeración del módulo extraído.

- Migración completa a Electron + electron-vite + React, TypeScript y Tailwind CSS. Retirados C#/.NET, WinUI, NAudio, el host externo y el instalador Inno/ISCC; sin Express ni servidor HTTP de aplicación.
- Grabación solo por nombre, sin selector ni presentación de clientes. Se conservan las asociaciones históricas en SQLite.
- Captura Chromium mediante AudioWorklet: PCM 16 kHz con guardado cada 30 segundos y último bloque, handshake de cierre y lectura del WebM histórico sin reemplazar originales.
- Resúmenes locales estructurados con Ollama y Qwen3 4B en CPU, bloques acotados/consolidación, referencias al audio y responsables/fechas solo si se mencionan.
- Cola secuencial durable con encolado atómico del resumen automático; cancelar, recuperar, reintentar y preservar transcripciones/resúmenes ante errores.
- Interfaz Electron para historial, reproducción por segmento/referencia, exportación Markdown, importación, confirmaciones y preparación de modelos sin terminal. Renderer aislado y sandbox, sin Node; diálogos y acceso a archivos controlados por el main.
- Migración SQLite con respaldo previo e importación de Ñe'eñemi/DCSS en solo lectura sin sobrescribir grabaciones.
- Instalador NSIS estándar de electron-builder, con motores Whisper/ffmpeg verificados por SHA-256 y redistribuible Visual C++ oficial. Perfil y esquema 2 preservados; desinstalar Inno antes de instalar NSIS.
- Verificadas pruebas TypeScript y compilación de main/worker/preload/renderer/AudioWorklet/Tailwind. Recorrido real sin .NET: micrófono simulado con muestra pública, siete bloques completos más el último (229 segundos) y transcripción real con Whisper medium Q5_0.
- Corregidos los bloques de resumen en Windows: separadores LF explícitos, coherentes con el lector y el presupuesto UTF-8, sin añadir CR al texto ni exceder el contexto. Verificada la frontera exacta del presupuesto con texto Unicode.
- SQLite integrado en Electron, sin addon nativo ni backend ejecutable. Migración/importación, transacciones, cancelación, recuperación y resúmenes portados a TypeScript; retirada la suite C# en lugar de presentarla como evidencia del nuevo núcleo.
- Scripts de instalación de dependencias bloqueados; descarga de Electron explícita y revisada. Auditoría de producción sin avisos; herramientas de empaquetado con avisos moderados documentados en la guía de release.
- Corregida la independencia de Whisper ante un fallo de conexión inicial de Ollama: no se considera cargado un modelo que nunca respondió; solo un fallo real de liberación bloquea el próximo trabajo hasta liberarlo.
- Corregidos los estilos Tailwind en desarrollo mediante nonce CSP de Vite, sin habilitar `unsafe-inline` ni modificar la política estricta de producción. Verificado en la ventana Electron real.

Pendiente de aceptación: instalación/micrófono físicos Windows, generación nueva con Ollama real y RAM/latencia en 8 GB. La generación NSIS desde Linux alcanzó etapas que requieren Wine, ausente en este entorno; el hook NSIS sí compiló por separado. No se publicó un instalador validado.

## 0.3.2 · 2026-10-09

Separación del módulo Reuniones de DCSS Suite como aplicación standalone **Ñe'eñemi**.

- Grabación de micrófono, reproducción y transcripción local con Whisper medium cuantizado q5_0.
- Historial, progreso, cancelación, reintentos, copia y exportación Markdown.
- Perfil, base SQLite, identificador e instalador independientes de DCSS.
- Importación de grabaciones y vocabulario de DCSS sin modificar el origen ni sobrescribir grabaciones existentes.
- Retirados los demás módulos, APIs, migraciones y dependencias de la suite.

Se conserva la versión del módulo extraído; no es una actualización de DCSS Suite.
DCSS vuelve a su versión anterior a Reuniones, `0.2.3`.
