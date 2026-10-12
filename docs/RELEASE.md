# Distribución de Ñe'eñemi

## Generar el instalador Windows

Requiere **Node.js 24.15+ LTS**, **npm 12.2.0** y conexión para la preparación inicial. **No requiere .NET SDK, WinUI, Visual Studio, Inno Setup ni ISCC.** electron-builder descarga su herramienta NSIS automáticamente.

```sh
npm ci --ignore-scripts
node node_modules/electron/install.js
npm run package:win
```

Ejecuta el comando de entrega en Windows x64. Desde Linux, electron-builder necesita Wine para editar los recursos del EXE y ejecutar la etapa de extracción del desinstalador NSIS. No se desactivan esas etapas en la configuración de distribución para fingir una entrega validada.

El comando ejecuta pruebas TypeScript, comprueba tipos/compila Electron y Tailwind, prepara motores Windows con hashes verificados, descarga el redistribuible Visual C++ oficial y genera NSIS. Se aborta ante errores y la publicación automática está desactivada.

| Artefacto | Ubicación |
|---|---|
| Recursos preparados | `build/resources/` |
| App Windows de carpeta | `release/electron/win-unpacked/` |
| Instalador NSIS | `release/electron/Neenemi-0.1.0-Setup.exe` |
| App Linux de comprobación | `release/electron/linux-unpacked/` |

El paquete Windows contiene Electron/Node/SQLite, JavaScript del worker, `resources/tools/`, el redistribuible y avisos de terceros. No incluye `resources/host/`, DLL .NET, `.downloads`, perfiles ni bases personales. El paquete Linux no incluye motores Windows; configura `NEENEMI_TOOLS_DIRECTORY` con motores Linux existentes para el recorrido de procesamiento.

El instalador NSIS es asistido, por usuario, permite escoger directorio y conserva app data. Si no hay Visual C++ Runtime x64, comprueba en Windows la firma Microsoft del redistribuible antes de pedir elevación e instalarlo. El hook `build/installer.nsh` usa las extensiones estándar de electron-builder, no un instalador Inno personalizado.

**Preparar Ollama** instala automáticamente el runtime standalone oficial v0.40.3 en `%APPDATA%\neenemi\runtime\ollama\0.40.3` cuando no existe otro motor utilizable, con SHA-256 fijado y extracción incremental/atómica. No requiere administrador ni ejecuta un instalador Inno; tampoco registra un servicio ni inicio automático del sistema. Necesita aproximadamente 1,5 GB de descarga más espacio para bibliotecas y modelos. La API local arranca a demanda en `127.0.0.1:11434`, con cloud desactivado y un modelo a la vez. Se reutiliza un servidor existente sin alterar su configuración ni detenerlo; se detiene al cerrar solo el proceso iniciado por la app. Los pesos Qwen3 no van en el paquete. No se configuran certificados de firma de la app/instalador: Windows puede mostrar SmartScreen. No se publica un release automáticamente.

## Actualización y datos

Cierra la app anterior y respalda `%APPDATA%\neenemi`. La implementación TS usa el mismo esquema 2 y conserva audio, segmentos, resúmenes y asociaciones. Esquema histórico 1 se migra con `neenemi.sqlite.before-native-v2.bak`; este nombre histórico no implica una dependencia .NET.

**Desinstala la instalación Inno anterior antes de instalar la nueva NSIS.** Sus identificadores/desinstaladores no son intercambiables y no se presenta un cambio de instalador como actualización transparente. La versión anterior conserva el perfil al desinstalar y la nueva también. No mezcles instalaciones simultáneas contra la misma base.

Los ajustes C# con claves PascalCase se leen y se guardan con el contrato TS al guardar Configuración; no se conserva ninguna ruta de un host .NET. Las rutas normales de datos/ajustes siguen siendo las del perfil standalone. Para respaldar, cierra la app y copia el perfil completo.

**Importar grabaciones** lee Ñe'eñemi/DCSS en solo lectura y obtiene un snapshot consistente, incluyendo WAL. No sobrescribe IDs existentes ni altera el origen. No distribuyas `data/`, ajustes, respaldos, logs ni muestras privadas. No abras esquema 2 con un antiguo renderer/servidor que solo soporte esquema 1.

## Recorrido obligatorio Windows

- [ ] Generar el NSIS completo en Windows o con Wine y comprobar motores/licencias, sin un host .NET.
- [ ] Desinstalar la versión Inno, comprobar conservación del perfil e instalar NSIS.
- [ ] Abrir la app instalada sin Node separado, SDK .NET ni Windows App SDK.
- [ ] Sin Ollama preinstalado: preparar Ollama/Qwen3, verificar descarga, cancelación, reintento, arranque local y cierre del proceso propio; repetir tras reiniciar la app.
- [ ] Con Ollama ya instalado o su API activa: reutilizarlo, generar resumen con arranque a demanda si estaba detenido y comprobar que una API externa no se detiene al cerrar.
- [ ] Grabar más de 30 segundos con micrófono físico, detener y comprobar último bloque, transcripción y resumen automático.
- [ ] Probar permiso denegado/dispositivo desconectado y cierre durante captura; preservar bloques confirmados y recuperación.
- [ ] Reproducir, saltar por segmento/cita individual y copiar/exportar ambos Markdown mediante diálogos reales.
- [ ] Cancelar/reintentar trabajos; fallo del resumen conserva transcripción y resumen previo.
- [ ] Cerrar mientras se procesa y comprobar recuperación durable al abrir.
- [ ] Eliminar después de reproducir y verificar retirada de datos/temporales, sin recreación tras cancelar.
- [ ] Abrir un perfil anterior e importar otra base sin modificar origen ni asociaciones históricas.
- [ ] Medir RAM máxima de Electron/Whisper/Ollama, latencia y respuesta en laptop de 8 GB sin GPU dedicada.
- [ ] Desinstalar NSIS y comprobar conservación del perfil.

## Evidencia y límites

La suite TypeScript comprueba migración con respaldo, conservación del esquema 2, importación WAL/idempotencia/asociaciones, PCM/WAV, transacciones, recuperación, cancelación real de procesos, preservación de resúmenes, límites Unicode/contexto, validación y cancelación/integridad de descargas e IPC. No se cuenta la suite C# retirada como verificación de la nueva implementación.

Se ejecutó Electron sin .NET con perfil aislado. La captura Chromium usó la muestra pública `jfk.wav` de whisper.cpp como micrófono simulado, guardó siete bloques completos y el último bloque (229 segundos), y produjo transcripción real con Whisper medium Q5_0. Se comprobó la superficie Tailwind. Los recursos Windows fueron preparados desde TypeScript con sus SHA-256 verificados.

El comando Windows alcanzó electron-builder, pero en este Linux faltó Wine: fallaron edición del EXE/extracción del desinstalador. También se probó una configuración temporal sin edición del EXE para aislar el requisito, no como configuración de entrega. El hook NSIS completo se compiló por separado con el compilador descargado; esto no prueba instalación/UAC/firma en Windows.

El usuario confirmó funcionamiento correcto de la aplicación en Windows antes de esta automatización. Para la nueva ruta se verificaron descarga real del ZIP Windows, SHA-256, extracción del ejecutable/bibliotecas/avisos, marcador de instalación y reutilización sin descargar; no se ejecutó ese PE en Linux. Electron inició Ollama 0.40.3 real en Linux, mostró descarga del modelo y permitió cancelarla; la API continuó viva tras cancelar y dejó de responder al cerrar la app. Pasaron 33 pruebas y build, incluidas seis pruebas nuevas de seguridad/ciclo de vida también dentro de Electron. **Pendientes: instalación automática y ejecución del runtime administrado en Windows, generación nueva real por esta ruta y RAM/latencia en 8 GB.**

Los avisos moderados de herramientas de empaquetado deben reevaluarse antes de distribuir. No aplicar degradaciones o `npm audit fix --force` sin comprobar compatibilidad; auditar el lockfile y conservar scripts de dependencias bloqueados.

## Diagnóstico

Los errores del worker y de motores se muestran en la interfaz. Una salida inesperada rechaza solicitudes pendientes; no se deja la UI ocupada indefinidamente. Un cierre normal espera el handshake de captura y el worker. No hay logs de arranque WinUI, protocolo stdio, telemetría ni servidor HTTP de aplicación.

Para comprobar una compilación Windows sin reinstalar, abre `release\electron\win-unpacked\neenemi.exe`; su arranque instalado se acepta por separado. No distribuyas una carpeta de pruebas cruzadas con edición de metadatos desactivada como paquete oficial.
