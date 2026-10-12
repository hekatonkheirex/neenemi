# Ñe'eñemi

Aplicación de escritorio **Electron + electron-vite + React, TypeScript y Tailwind CSS** para grabar audio, transcribir con **whisper.cpp medium Q5_0** y generar resúmenes locales con **Ollama / Qwen3 4B**.

**Sin .NET, C#, WinUI, Inno Setup ni ISCC.** Los servicios son TypeScript y usan SQLite integrado en el Node de Electron, dentro de un worker. No hay Express, servidor HTTP de aplicación, ejecutable de backend ni reconstrucción de módulos SQLite nativos.

## Uso

1. Abre **Configuración** y prepara Whisper si faltan recursos.
2. Instala Ollama desde el enlace oficial si hace falta. **Preparar Ollama** inicia el motor instalado y descarga el modelo seleccionado, con progreso/cancelación.
3. Escribe solo el **nombre de la grabación**, pulsa **Grabar** y **Terminar y procesar**.
4. Consulta transcripción y resumen. Puedes saltar al audio desde segmentos y citas individuales, copiar/exportar Markdown, importar, cancelar, reintentar y eliminar con confirmación.

No hay selector ni presentación de clientes. Sus asociaciones históricas permanecen en SQLite.

La captura usa `getUserMedia` y AudioWorklet: PCM mono de 16 bits a 16 kHz, guardado cada 30 segundos y del último bloque al detener. El cierre normal espera a que el renderer entregue y persista el audio antes de apagar servicios. Tras un cierre inesperado se conserva el audio ya confirmado y puedes procesarlo desde el historial.

Una sola cola durable ejecuta transcripción y resumen secuencialmente. Guardar transcripción terminada y encolar resumen automático es atómico. Los textos largos se resumen por bloques y consolidación; un fallo conserva transcripción y resumen anterior, sin resultados inventados ni truncación silenciosa. El modelo se libera al terminar el resumen. Los resultados están marcados como **IA**: verifica nombres, acuerdos, responsables y fechas contra el audio original.

## Equipo objetivo

Windows x64, CPU y objetivo desde 8 GB de RAM. Perfil: **Whisper medium Q5_0 + Qwen3 4B**, contexto de 8192 tokens y hasta cuatro hilos por defecto; Ollama recibe `num_gpu=0`. No se usan modelos cloud.

**La RAM y latencia en laptops Windows de 8 GB no están medidas.** Puedes elegir `qwen3:1.7b`, `qwen3:4b` o `qwen3:8b`, hilos y contexto. No selecciones 8B en 8 GB sin medir consumo. El cambio de framework no garantiza rendimiento.

## Datos y actualización

- Base normal: `%APPDATA%\neenemi\data\neenemi.sqlite`.
- Ajustes: `%APPDATA%\neenemi\settings.json`.
- Recursos instalados: `resources\tools\`; no hay `resources\host\`.
- Se conserva el **esquema 2** existente, sin reinicializar ni revertir la base. Los ajustes anteriores con claves C# se leen y se guardan en el formato TypeScript al guardar Configuración.
- Al abrir esquema histórico 1 se crea `neenemi.sqlite.before-native-v2.bak` antes de migrar; el nombre de ese respaldo se mantiene por compatibilidad de datos, no porque la app use .NET.
- Audio WebM histórico sin reemplazar originales; capturas nuevas en PCM.

Cierra la app anterior y respalda el perfil antes de actualizar. Desinstala la versión Inno antigua antes de instalar la nueva NSIS para evitar dos entradas de instalación; su desinstalador conserva datos. El nuevo instalador también conserva el perfil al desinstalar.

**Importar grabaciones** admite Ñe'eñemi y grabaciones compatibles DCSS: origen en solo lectura, snapshot consistente incluyendo WAL, asociaciones preservadas y sin sobrescribir identificadores existentes ni importar otros módulos. **No configures una base DCSS como perfil activo.** No abras esquema 2 con una versión antigua que solo admita esquema 1.

Las grabaciones se procesan localmente. La preparación descarga motores/modelos; Ollama escucha en `127.0.0.1:11434`. SQLite y respaldos no están cifrados: protege el perfil y usa cifrado de disco cuando corresponda. Eliminar retira audio, transcripción, resumen y reproducción temporal, no respaldos externos.

## Desarrollo

Requiere **Node.js 24.15+ LTS** (también 22.22.2+ o 26+) y **npm 12.2.0**. No requiere SDK .NET, Visual Studio ni ISCC.

```sh
npm ci --ignore-scripts
node node_modules/electron/install.js
npm run dev
```

`.npmrc` bloquea scripts de dependencias. La instalación explícita revisada de Electron descarga su binario oficial con hashes; no se habilitan scripts globalmente.

| Comando | Resultado |
|---|---|
| `npm run dev` | Abrir Electron con electron-vite/HMR |
| `npm run build` | Comprobar TypeScript y compilar main, worker, preload, renderer, AudioWorklet y Tailwind |
| `npm start` | Abrir la compilación de Electron |
| `npm test` | Pruebas TypeScript de datos, recuperación, cancelación, resúmenes, descargas y límites IPC |
| `npm run package:win` | Pruebas/build, recursos verificados e instalador NSIS con electron-builder; ejecutar en Windows |
| `npm run package:linux` | Paquete Linux de carpeta para comprobar la app |

En Linux, configura `NEENEMI_TOOLS_DIRECTORY` con `ffmpeg`, `whisper/whisper-cli` y `whisper/ggml-medium-q5_0.bin`. La descarga automática de motores de la interfaz prepara binarios Windows. `NEENEMI_DATA_DIRECTORY` y `NEENEMI_SETTINGS_PATH` permiten perfiles aislados. La captura Chromium no depende de NAudio ni de Windows, pero cada plataforma y dispositivo requieren aceptación real.

El instalador lleva Electron y los motores, no Node separado ni .NET. electron-builder descarga NSIS automáticamente: no debes instalar Inno/ISCC. Los motores Windows pueden necesitar Visual C++ Runtime; se incluye el redistribuible oficial, cuya firma Microsoft se comprueba en Windows antes de instalarlo si falta. Ollama sigue siendo independiente.

## Arquitectura

- `electron/main.ts`: ventana/instancia única, validación IPC, diálogos, clipboard y protocolo de audio autorizado con rangos.
- `electron/preload.ts`: API limitada, aislamiento, sandbox y renderer sin Node; handshake de cierre de captura.
- `electron/service-worker.ts`, `service-client.ts`: worker TypeScript y mensajes correlacionados, sin procesos .NET ni stdio.
- `electron/services`: SQLite compatible, cola durable, Whisper/ffmpeg, Ollama, Markdown, configuración y preparación.
- `src/shared/contracts.ts`: contrato tipado único.
- `src/renderer`: React/TypeScript, captura PCM mediante AudioWorklet y estilos Tailwind.
- `electron-builder.yml`, `scripts/package-windows.ts`, `build/installer.nsh`: distribución estándar Electron/NSIS.

Fuentes: [SQLite de Node](https://nodejs.org/docs/latest-v24.x/api/sqlite.html), [AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletNode), [electron-vite](https://electron-vite.org/guide/), [NSIS de electron-builder](https://www.electron.build/nsis/). Distribución: [docs/RELEASE.md](docs/RELEASE.md). Licencias: [docs/THIRD-PARTY.md](docs/THIRD-PARTY.md).

## Evidencia y límites

Se ejecutó Electron real sin .NET con perfil aislado: captura Chromium usando la muestra pública JFK como micrófono simulado, persistencia de siete bloques completos más el último bloque, transcripción real con Whisper medium Q5_0 y presentación de segmentos. La grabación conservó 229 segundos. Se comprobó la superficie Tailwind y la preparación de recursos Windows desde TypeScript con hashes verificados. Las pruebas de persistencia, importación, recuperación y procesamiento son TypeScript, no la antigua suite C#.

**No confundir entrada simulada con micrófono físico ni con aceptación Windows.** Falta comprobar micrófono/instalación Windows, una generación real nueva de Ollama y RAM en 8 GB. El comando de instalador se probó desde Linux y alcanzó electron-builder/NSIS, pero la edición del EXE y extracción del desinstalador requieren Windows o Wine. El hook NSIS sí se compiló por separado; no se publicó un instalador validado.
