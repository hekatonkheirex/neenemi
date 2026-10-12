# Ñe'eñemi Windows

Alcance aprobado: **Electron + electron-vite + React, TypeScript y Tailwind CSS**. Servicios TypeScript con SQLite integrado en Electron; sin C#, .NET, NAudio, WinUI, Inno Setup ni ISCC. whisper.cpp medium Q5_0 y Ollama/Qwen3 4B locales, CPU, objetivo desde 8 GB pendiente de medición. Grabación solo por nombre, sin presentación de clientes; asociaciones históricas conservadas.

## Fronteras

| Componente | Responsabilidad |
|---|---|
| Main Electron | Instancia/ventana, origen IPC, diálogos, clipboard/exportación y audio autorizado |
| Preload | API limitada y eventos removibles; handshake para detener captura al cerrar |
| Renderer React/TypeScript | Historial, grabación, resultados, reproducción y configuración |
| AudioWorklet | PCM mono 16-bit/16 kHz, bloques de 30 segundos y último bloque |
| Worker TypeScript | SQLite, cola durable, procesos Whisper/ffmpeg, Ollama, recursos y Markdown |
| electron-builder/NSIS | Distribución Windows sin SDK .NET ni Inno/ISCC |

Contrato único en `src/shared/contracts.ts`. Mensajes correlacionados entre main y worker, respuestas con resultado o error y eventos de cambios/progreso. No backend ejecutable ni protocolo stdio. No HTTP de aplicación ni Express. El renderer no accede a Node/filesystem ni elige URLs externas: main controla diálogos y acciones explícitas. Audio por token opaco y rangos dentro de un protocolo local.

## Contrato y aceptación

- Renderer aislado, sandbox, sin Node, navegación/ventanas externas bloqueadas. IPC valida emisor y parámetros; micrófono permitido solo para audio de la aplicación. Texto externo como datos, no HTML ejecutable.
- SQLite conserva esquema 2. Esquema 1 migrado con respaldo previo, sin perder audio, segmentos, fechas o asociaciones. Rechaza DCSS como perfil activo y versiones futuras. Importación en solo lectura/snapshot consistente, sin sobrescritura ni otros módulos de DCSS.
- Ajustes anteriores con claves C# se convierten al contrato TS sin conservar rutas de un host retirado. Perfil `%APPDATA%\neenemi` sin reset.
- Captura Chromium PCM 16-bit/16 kHz, persistencia periódica y último bloque; nunca encolar antes de confirmar el guardado. Audio WebM histórico conservado. Los fallos de captura/persistencia dejan audio reconocido como conservado o interrumpido, no éxito inventado.
- Cola secuencial durable: transcripción y resumen no paralelos; guardar transcripción y encolar resumen automático es atómico. Cancelar termina Whisper o petición Ollama; cerrar espera captura, cancela preparación/trabajos y preserva pendientes. Eliminar cancela y retira temporales antes de borrar datos.
- Resumen estructurado por bloques/consolidación, con visión general, temas, decisiones, acciones, referencias y responsable/fecha solo si se mencionan. Sin truncación silenciosa. Validación de respuestas y documentos persistidos; fallo conserva transcripción/resumen previo.
- Interfaz: controles/nombre, historial, audio y seek desde segmentos/citas individuales, transcripción/resumen, cancelar/reintentar/eliminar con confirmación, copiar/exportar Markdown, importar y configurar/preparar recursos sin terminal. Estilos Tailwind compilados, sin runtime CSS adicional.
- Windows x64: Electron incluye Node/SQLite. Recursos Whisper/ffmpeg con SHA-256; redistribuible Visual C++ oficial validado en Windows si hace falta. Ollama independiente, enlace oficial y preparación local. Instalador NSIS por usuario conserva datos; cerrar/desinstalar la instalación Inno antigua antes de instalar la nueva.
- No afirmar rendimiento en 8 GB sin medir Electron + Whisper + Ollama ni aceptación Windows a partir de una entrada de audio simulada.

## Verificación

- `npm test`: suite TypeScript de datos, migración/importación, recuperación, cancelación, resúmenes, descargas e IPC.
- `npm run build`: tipos y main/worker/preload/renderer/AudioWorklet/Tailwind.
- `npm run dev`: aplicación Electron real sin .NET.
- `npm run package:win`: recursos y NSIS vía electron-builder; Windows para edición del EXE/extracción del desinstalador, o Wine para compilación cruzada.
- `npm run package:linux`: paquete de comprobación; motores Linux configurados externamente.

Recorrido obligatorio: `docs/RELEASE.md`. Una compilación Linux y un hook NSIS compilado no demuestran instalación/micrófono Windows. Se retiraron fuentes/proyectos/tests C# y el instalador Inno; no shims ni segunda ruta de ejecución.
