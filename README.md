# Ñe'eñemi

Aplicación Windows **WinUI 3 + C#** para grabar audio, transcribirlo con **whisper.cpp medium Q5_0** y generar resúmenes locales con **Ollama / Qwen3 4B**. Sin Electron, React, Node.js ni servidor HTTP propio.

## Uso

1. Abre Ñe'eñemi. En **Ajustes**, prepara los recursos locales si estás ejecutando una compilación de desarrollo.
2. Instala Ollama desde el enlace oficial de Ajustes si aún no está instalado. **Preparar Ollama** inicia el motor instalado cuando hace falta y descarga el modelo seleccionado. La primera descarga necesita conexión; la app muestra progreso y permite cancelar.
3. Escribe únicamente el **nombre de la grabación**, inicia la captura y termina para procesar.
4. Consulta transcripción y resumen en el historial. Las referencias permiten saltar al audio correspondiente; puedes copiar o exportar Markdown, cancelar, reintentar y eliminar con confirmación.

No hay selector, catálogo ni presentación de clientes. Las asociaciones de grabaciones antiguas se conservan en la base, pero no se muestran ni se requieren para grabaciones nuevas.

El reconocimiento usa español. La captura guarda PCM mono de 16 bits a 16 kHz cada 30 segundos y conserva el último bloque al detener. Tras un cierre inesperado puedes procesar el audio conservado. Los trabajos interrumpidos se recuperan al iniciar.

Una sola cola ejecuta transcripción y resumen **secuencialmente**. El resumen automático se guarda como pendiente en la misma transacción que la transcripción terminada. El modelo de Ollama se libera al terminar cada resumen. Los textos largos se procesan en bloques y se consolidan; los errores no se sustituyen por resúmenes inventados. Un fallo de resumen conserva la transcripción y cualquier resumen anterior.

Los resúmenes incluyen temas, decisiones y pendientes, con responsable y fecha solo cuando aparecen en el texto. Están marcados como **IA**: revisa nombres, acuerdos y fechas contra el audio original.

## Equipo objetivo

Windows 10 1809 o posterior, x64, laptops sin GPU dedicada y desde 8 GB de RAM. El perfil aprobado es **Whisper medium Q5_0 + Qwen3 4B**, contexto de 8192 tokens y hasta cuatro hilos por defecto. Ollama recibe `num_gpu=0`; no se usan modelos cloud.

**La RAM y latencia en una laptop Windows de 8 GB aún no están medidas.** Ajustes permite cambiar hilos, contexto y modelo local (`qwen3:1.7b`, `qwen3:4b`, `qwen3:8b`). No selecciones 8B en un equipo de 8 GB sin medir el consumo. Las pruebas CPU realizadas en Linux no garantizan rendimiento en esas laptops.

## Datos y migración

- Base de uso normal: `%APPDATA%\neenemi\data\neenemi.sqlite`.
- Ajustes: `%APPDATA%\neenemi\settings.json`.
- Recursos de la instalación: `resources\` junto al ejecutable.
- La migración del esquema histórico crea `neenemi.sqlite.before-native-v2.bak` antes de modificarlo y conserva audio, segmentos, fechas y asociaciones existentes.
- Los WebM históricos se leen sin reemplazar el audio original. Las grabaciones nuevas usan PCM.
- El instalador y desinstalador no eliminan el perfil de datos.

Para importar otra base, cierra la app antigua y usa **Importar** en Ñe'eñemi. Se admiten bases compatibles de Ñe'eñemi y grabaciones del esquema DCSS: el origen se abre en solo lectura y se obtiene una copia SQLite consistente. No se sobrescriben identificadores existentes ni se importan otros módulos de DCSS. **No configures una base DCSS como base activa de esta app.**

Para respaldar manualmente, cierra la aplicación y copia la carpeta de datos completa. La copia anterior a la migración sirve para una reversión al esquema antiguo; no abras la base ya migrada con una versión antigua de Ñe'eñemi. Eliminar una grabación retira su audio/transcripción/resumen de la base y la copia temporal de reproducción, pero no altera respaldos que hayas conservado.

Las grabaciones y transcripciones se procesan localmente. Solo la preparación descarga motores/modelos desde sus proveedores. Ollama usa `127.0.0.1:11434`; no se envían grabaciones a una API cloud. SQLite y los respaldos no están cifrados: protege el perfil Windows y usa cifrado de disco cuando corresponda.

## Desarrollo

Requiere **.NET SDK 10**. La interfaz y el empaquetado se compilan y ejecutan en **Windows**; el núcleo y sus pruebas también funcionan en Linux.

| Comando | Resultado |
|---|---|
| `dotnet build native/Neenemi.Core/Neenemi.Core.csproj` | Compilar servicios y persistencia |
| `dotnet test native/Neenemi.Core.Tests/Neenemi.Core.Tests.csproj` | Pruebas de comportamiento y recuperación |
| `dotnet run --project native/Neenemi.App/Neenemi.App.csproj -p:Platform=x64` | Ejecutar WinUI en Windows |
| `powershell -ExecutionPolicy Bypass -File scripts/package-windows.ps1` | Publicar x64, preparar recursos y generar instalador con Inno Setup 6 |

El script genera `release/Neenemi-0.1.0-Setup.exe`; no publica commits ni releases. Requisitos, dependencias y recorrido de aceptación: [docs/RELEASE.md](docs/RELEASE.md). Licencias de recursos: [docs/THIRD-PARTY.md](docs/THIRD-PARTY.md).

### Estructura

- `native/Neenemi.App`: ventana WinUI, captura Windows, reproducción, diálogos y configuración.
- `native/Neenemi.Core`: SQLite, cola durable, procesos ffmpeg/Whisper, resúmenes Ollama, exportación y preparación de recursos.
- `native/Neenemi.Core.Tests`: migración sin pérdida, recuperación, cancelación, preservación de resultados y límites/validación del resumen.
- `native/Neenemi.Tools`: preparación de recursos Windows para el empaquetado.
- `installer/neenemi.iss`: instalación por usuario y conservación de datos.

La aplicación procede de la separación de Reuniones de DCSS Suite `0.3.2` (`c3927a5`). Esta migración no modifica DCSS ni depende de que esté ejecutándose. Repositorio: [hekatonkheirex/neenemi](https://github.com/hekatonkheirex/neenemi).

### Fuentes y estado de verificación

El despliegue sigue la [guía de Microsoft para apps autocontenidas](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/self-contained-deploy/deploy-self-contained-apps): .NET y Windows App SDK se incluyen, sin intentar convertir WinUI en un EXE de archivo único. Los resúmenes usan el [contrato oficial de Ollama `/api/chat`](https://docs.ollama.com/api/chat), salida estructurada y control de permanencia del modelo.

El arranque usa `App.xaml` y `InitializeComponent`, siguiendo el [ejemplo oficial WinUI autocontenido](https://github.com/microsoft/WindowsAppSDK-Samples/blob/f1a30c2524c785739fee842d02a1ea15c1362f8f/Samples/SelfContainedDeployment/cs-winui-unpackaged/App.xaml.cs). El compilador XAML genera los metadatos necesarios para los recursos y estilos de controles; no se construye una aplicación sin ese proveedor.

Se aprobaron **21 pruebas del núcleo** y un recorrido real desde audio PCM de archivo por SQLite → Whisper → resumen automático Qwen3 4B → generación de Markdown/preparación de audio para reproducción → eliminación. Ollama terminó sin modelos cargados. También se prepararon recursos Windows con SHA-256 y NuGet no reportó vulnerabilidades conocidas en las dependencias transitivas de la app. La comprobación anterior de tipos WinUI en Linux no cubre la inicialización XAML actual: MSBuild reconoce `App.xaml` como `ApplicationDefinition`, pero el compilador XAML requiere Windows. **Faltan la comprobación del arranque reparado, micrófono real y medición en 8 GB.** Consulta el checklist de entrega antes de distribuir.
