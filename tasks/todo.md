# Migración TypeScript + Tailwind

## Implementación y evidencia

- [x] App Electron/electron-vite + React/TypeScript/Tailwind; sin .NET, C#, WinUI, NAudio, Inno/ISCC ni host externo.
- [x] Contrato IPC/worker tipado, renderer aislado/sandbox sin Node y audio por tokens/rangos; sin Express ni HTTP de aplicación.
- [x] Servicios TS: SQLite integrado, esquema 2 conservado, migración con respaldo, importación WAL/idempotencia/asociaciones y ajustes anteriores convertidos.
- [x] Cola durable secuencial, guardado/encolado atómico, cancelación y recuperación; Whisper/ffmpeg, Ollama estructurado/bloques/referencias y Markdown.
- [x] Captura AudioWorklet PCM 16 kHz por nombre, bloques de 30 segundos, último bloque, errores y handshake de cierre.
- [x] 33 pruebas TS aprobadas y build de main/worker/preload/renderer/AudioWorklet/Tailwind. La suite anterior C# fue retirada, no contada como evidencia del nuevo núcleo.
- [x] SQLite/migración/importación comprobados también dentro del Node integrado de Electron.
- [x] Recorrido Electron real: micrófono simulado con JFK público, siete bloques completos más el último (229 segundos), transcripción real Whisper medium Q5_0 y presentación Tailwind.
- [x] Paquete Linux generado con worker dentro de ASAR y sin .NET; audio, presentación y preservación de fixture de resumen ante fallo real de conexión Ollama.
- [x] Regresión reproducida/corregida: un fallo inicial de Ollama no marca un modelo como cargado ni bloquea el siguiente Whisper. La grabación que fallaba antes se transcribió después de repetir el fallo Ollama en el paquete corregido.
- [x] Desarrollo Electron con Tailwind verificado visualmente; estilos inyectados por Vite autorizados mediante nonce CSP. Producción conserva `script-src 'self'` y `style-src 'self'`, sin nonce ni `unsafe-inline`.
- [x] Recursos Windows preparados desde TypeScript con SHA-256; hook NSIS completo compilado por separado. El NSIS completo desde Linux se detuvo por ausencia de Wine, no de .NET/ISCC.
- [x] Retirados proyectos/fuentes/tests/bin/obj .NET, cliente stdio, script PowerShell de empaquetado e instalador Inno. Documentación/contratos/licencias actualizados; perfiles personales sin modificar.
- [x] Ollama standalone Windows x64: descarga oficial v0.40.3/SHA-256, extracción incremental segura, bibliotecas/avisos/licencia y publicación atómica en perfil. ZIP real extraído y reutilización sin descarga comprobada.
- [x] API iniciada a demanda antes de preparación/resumen; servidor externo intacto y cierre del proceso propio. Electron real con Ollama 0.40.3 en Linux: progreso, cancelación y cierre comprobados; seis pruebas nuevas también aprobadas en el Node integrado.
- [x] Usuario confirmó funcionamiento correcto de la app en Windows antes de esta automatización; sin atribuirle aceptación específica de cada caso de distribución.

## Aceptación de distribución

- [ ] Generar NSIS completo en Windows o con Wine y probar instalación/desinstalación sobre una máquina limpia.
- [ ] Migrar desde instalación Inno: conservar perfil y no mantener dos apps activas contra la misma base.
- [ ] Micrófono físico Windows, permisos/dispositivo desconectado, más de 30 segundos y cierre/recuperación.
- [ ] Generación nueva con Ollama real y recorrido transcripción → resumen automático; no presentar fixture como inferencia real.
- [ ] Nueva instalación automática Ollama en Windows sin motor previo, arranque del PE administrado, reinicio y cierre; servidor externo ya activo conservado.
- [ ] Diálogos nativos Windows de importación/exportación y conservación del perfil tras desinstalar.
- [ ] RAM máxima/latencia en laptop de 8 GB sin GPU dedicada.
- [ ] Reevaluar los avisos moderados de herramientas de empaquetado antes de publicar.

No se publicó un instalador validado. No volver a introducir .NET/ISCC ni desactivar etapas de entrega para ocultar el requisito Windows/Wine. Checklist: `docs/RELEASE.md`.
