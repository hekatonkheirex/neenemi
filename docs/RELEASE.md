# Release de DCSS Suite

La suite se distribuye como una sola aplicación Electron. El instalador no debe
arrancar Node, Vite ni una API externa: `electron/main.cjs` inicia `electron/api-child.cjs`
como proceso hijo para servir la API local y el renderer compilado desde `dist/`.
Así, ExcelJS, SQLite y las importaciones pesadas no comparten el proceso principal de
la ventana.

## Comprobación local

Desde `dcss-suite/`:

```bash
npm run desktop:check
```

Este comando compila el renderer y la API, prepara el binding de `better-sqlite3`
para Electron y comprueba que el runtime de producción puede abrir una SQLite en
memoria. También verifica que la aplicación use el directorio de datos de usuario
y que `redact-ds` no esté en el manifiesto de módulos.

Para abrir la aplicación compilada localmente:

```bash
npm run desktop
```

## Instalador de Windows

La configuración reproducible está en `electron-builder.yml` y define un objetivo
NSIS x64 con instalación personalizable. Los comandos preparados son:

```bash
# Genera un directorio ejecutable para una comprobación local en Linux.
npm run desktop:package
# Genera el instalador NSIS x64; ejecutar en Windows o CI Windows.
npm run desktop:package:win
```

`electron-builder@26.15.3` está declarado como dependencia de desarrollo de esta suite;
no se reutiliza la dependencia del `launcher` legado. `desktop-package.mjs` compila,
prepara el binding nativo correcto y ejecuta el release check antes de llamar a Builder.
`ensure-native.mjs` usa `@electron/rebuild` para compilar `better-sqlite3` contra la versión
de Electron instalada; `npm rebuild` por sí solo no asegura ese ABI. En Windows, usa Node
22.12 o posterior, Python y las herramientas C++ de Visual Studio, y guarda el proyecto en
una ruta sin espacios para evitar fallos de `node-gyp` con módulos nativos.
La configuración usa `npmRebuild: false` porque `ensure-native.mjs` es la fuente de verdad
para el ABI de `better-sqlite3`; así el empaquetador no descarga ni reemplaza ese binding
durante la distribución.

El objetivo NSIS debe generarse en Windows o CI Windows para usar el ABI de Windows y
validarse luego en una máquina limpia. El paquete Linux `--dir` sirve para comprobar el
contenido y el arranque local, pero no sustituye esa validación.
El smoke gráfico Linux depende de que el host configure correctamente el helper de
sandbox de Chromium y su dispositivo GPU; si esa infraestructura no está disponible,
el release check y la inspección del contenido siguen siendo la validación aplicable.
El script rechaza explícitamente intentar generar Windows desde Linux o macOS, porque
`better-sqlite3` es nativo y no debe mezclarse el binding del sistema anfitrión con el
artefacto Windows.

Si hubo una instalación de prueba de Data Systems Suite en Windows, cerrarla antes de abrir
DCSS Suite. En el primer arranque empaquetado se copian los datos de
`%APPDATA%/datasystems-suite/data/` (también se reconoce
`%APPDATA%/Data Systems Suite/data/`) a `%APPDATA%/dcss-suite/data/` y la base pasa
de `datasystems.sqlite` a `dcss.sqlite`; la carpeta original no se elimina. El nuevo
`appId` puede dejar ambas aplicaciones instaladas: verificar los datos en DCSS Suite
antes de desinstalar la anterior. Si ya hay datos en la carpeta nueva, no se sobrescriben.

Si existen ambos perfiles anteriores, el primer arranque ofrece elegir explícitamente
cuál copiar y muestra las dos rutas completas. Cancelar no copia ninguno. Si la base
de destino ya existe, no vuelve a solicitar la elección. Los perfiles originales permanecen
intactos y las copias dañadas se rechazan antes de activarse.
La ventana comprueba periódicamente la API: si se cierra inesperadamente, Electron
intenta reiniciarla y recarga la ventana en su nuevo puerto. Tras tres fallos, presenta
una opción visible para reintentar o cerrar. El icono DCSS se incluye en el instalador
y en la ventana Linux; `appId` y carpeta de datos se mantienen.

## Auditoría de dependencias

La auditoría de 2026-09-29 informa cuatro vulnerabilidades moderadas en
`express`/`qs` y `exceljs`/`uuid`, y una alta en `pdfjs-dist` 5.x
([GHSA-hq66-cqwq-w95j](https://github.com/advisories/GHSA-hq66-cqwq-w95j)).
La alerta alta requiere abrir un PDF malicioso con scripting activado en el
visor PDF.js; la suite usa `getDocument` para extraer y rasterizar páginas, no
el visor con scripting. No se ejecuta `npm audit fix --force`: actualizar
`pdfjs-dist` a 6.x y sustituir ExcelJS por una versión anterior son cambios
incompatibles que requieren una migración y pruebas específicas. Revisar antes
de distribuir con PDFs no confiables; próxima revisión: 2026-10-15.

## Validación en una máquina limpia

1. Instalar la versión de Node soportada por el proyecto y ejecutar `npm ci`.
2. Ejecutar `npm run desktop:check`.
3. Abrir la aplicación sin Node ni Vite ejecutándose aparte.
4. Importar una fuente pequeña de prueba y confirmar que aparece en Resumen.
5. Descargar un respaldo desde Resumen y verificar que comienza con la firma SQLite.
6. Cerrar y volver a abrir la aplicación; los datos deben permanecer en el directorio
   de usuario de Electron, fuera del directorio de instalación.
7. En un perfil/directorio de datos desechable, restaurar una copia, confirmar que la Suite
   vuelve a iniciar con esos datos y que conserva el respaldo automático previo. No probar la
   restauración sobre la única copia de datos de una instalación real.

Los originales importados y la SQLite no forman parte del instalador. La aplicación
los conserva por instalación. Resumen permite descargar una SQLite autocontenida con datos
normalizados y archivos originales activos y archivados. Una restauración reemplaza toda la base
activa solo después de validar el archivo y crear una copia de seguridad automática; luego reinicia
el servicio local.
