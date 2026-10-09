# Plan Windows aprobado

Alcance: `SPEC-windows.md`. No selector de cliente. Perfil intermedio de modelos configurable.

1. Contratos C# y proyectos: fijar los datos y servicios antes de dividir trabajo.
2. Persistencia: migración aditiva del esquema 1, importación consistente sin sobrescritura, estados separados de resumen.
3. Audio: captura Windows PCM, guardado de bloques, transcripción por proceso y cancelación.
4. Resumen: Ollama local, contexto acotado, validación de salida y descarga de modelo.
5. Integración: cola única persistente, recuperación, app WinUI completa y preparación de modelos.
6. Corte: retirar entradas Electron/React/Express obsoletas; actualizar instalación y comandos.
7. Verificación: núcleo compilado y pruebas en Linux; smoke real disponible; compilación y superficie Windows requieren Windows.

Contratos en `native/Neenemi.Core/Models.cs` y `AppController`: almacenamiento y audio son slices independientes; WinUI consume esos contratos. El integrador posee proyectos, controlador, Ollama, empaquetado y documentación.

Riesgos: WinUI no puede ejecutarse en Linux; modelos no garantizados dentro de 8 GB; los WebM históricos requieren ffmpeg para reproducción WAV. No afirmar aceptación Windows sin observarla.
