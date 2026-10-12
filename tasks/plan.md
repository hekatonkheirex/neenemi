# Plan TypeScript + Tailwind aprobado

Alcance: `SPEC-windows.md`. Electron/electron-vite + React/TypeScript/Tailwind reemplazan toda la ruta .NET/WinUI/Inno. Sin selector de cliente ni regreso a DCSS.

1. Contrato tipado renderer/preload/main/worker, sin HTTP de aplicación ni backend externo.
2. Portar SQLite compatible, cola durable, Whisper/Ollama, recursos, Markdown y ajustes a servicios TypeScript. Usar `node:sqlite` integrado, sin addon SQLite reconstruido.
3. Captura Chromium con AudioWorklet PCM: persistencia de bloques, final, errores y handshake de cierre. Preservar audio histórico.
4. Compilar estilos Tailwind y mantener las operaciones completas de historial/resultados/ajustes.
5. Distribución electron-builder/NSIS con recursos y perfil preservado; retirar proyectos/binarios/tests C#, NAudio y scripts Inno/ISCC.
6. Pruebas TS y smoke real del paquete Electron sin .NET, con perfil aislado y motores reales disponibles. No confundir micrófono simulado ni fixtures de resumen con aceptación física/LLM Windows.

Contratos: `src/shared/contracts.ts`. Servicios en `electron/services`; main controla diálogos/exportación/audio y valida el emisor. El worker no depende de stdio, executables .NET ni servidor web.

Riesgos: motor Ollama independiente, binarios Windows requieren aceptación física y posible runtime C++; 8 GB sin medición. Generar NSIS desde Linux requiere Wine para etapas que ejecutan PE; el hook se puede comprobar por separado, pero eso no valida instalación. Mantener configuración de entrega estándar y registrar límites en `docs/RELEASE.md`.
