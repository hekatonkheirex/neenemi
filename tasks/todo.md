# Tareas de migración

## Implementación y evidencia disponible

- [x] Contratos y proyectos C#: núcleo compilable, captura por nombre sin cliente.
- [x] SQLite: migración con respaldo previo y conservación de audio/segmentos/asociaciones; importación Ñe'eñemi/DCSS en solo lectura sin sobrescribir. Pruebas de repositorio aprobadas.
- [x] Audio/Whisper: captura Windows implementada, persistencia del último bloque, recuperación y cancelación del proceso. Transcripción CPU real con medium Q5_0 verificada usando audio de archivo.
- [x] Ollama/Qwen3: bloques acotados sin pérdida silenciosa, referencias validadas y liberación del modelo. Pruebas de fronteras y resumen CPU real con `qwen3:4b` aprobados; `/api/ps` terminó sin modelos cargados.
- [x] Interfaz WinUI e instalador implementados: historial, reproducción por segmento, resumen, exportación, errores/confirmaciones y preparación local. Restaurado arranque estándar con `App.xaml` y metadatos generados; MSBuild reconoce la definición de aplicación. El compilador XAML no puede ejecutarse en Linux y el arranque reparado aún no está confirmado en Windows.
- [x] Recorrido integrado real: audio PCM de archivo → SQLite → Whisper → resumen automático Qwen3 → Markdown → preparación de reproducción → eliminación de datos y copia temporal. La captura de micrófono se sustituyó exclusivamente en este recorrido temporal; los motores fueron reales.
- [x] Recursos Windows: descarga y preparación de whisper.cpp, medium Q5_0 y ffmpeg con hashes verificados.
- [x] Corte y documentación: retiradas fuentes y entradas Electron/React/Express/Node; bases personales sin modificar; README, release, licencias y changelog actualizados.
- [x] Repositorio indicado conectado como `origin` por SSH. Destino de publicación del código: rama `windows-native`, sin el historial heredado de DCSS. No hay un release binario Windows validado.

## Aceptación bloqueada por entorno

- [ ] Build completo WinUI autocontenido y generación/instalación del EXE con Inno Setup en Windows.
- [ ] Recorrido real de ventana WinUI, micrófono, permisos, reproducción y diálogos en Windows.
- [ ] Medición de RAM/latencia en laptop Windows de 8 GB sin GPU dedicada.

Bloqueo: estación Linux, sin Windows disponible ni hosts SSH Windows configurados. El build completo alcanza tareas nativas Windows de manifiesto/PRI que no funcionan aquí. No se desactivan esas tareas en el proyecto de distribución ni se presenta la compilación parcial como instalador validado. Recorrido obligatorio y comandos: `docs/RELEASE.md`.
