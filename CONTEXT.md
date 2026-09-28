# Data Systems Suite Context

Este contexto define el lenguaje común de la suite local de Data Systems. La aplicación reúne los módulos heredados en una sola ventana Electron, conserva las fuentes originales y proyecta sus datos en una SQLite compartida.

## Fuentes e importaciones

**Fuente original**:
El archivo XLSX, JSON o base histórica recibido desde SGS, Superset o un proyecto legado, conservado sin alterar.
_Avoid_: archivo normalizado, dato importado

**Importación**:
Una carga identificable de una o más fuentes originales, con sus archivos, filas, estado y resultados de proyección.
_Avoid_: proceso, sincronización

**Fila de origen**:
La fila exacta de una fuente original, identificada por archivo, hoja y número de fila, cuyos valores se conservan en la suite.
_Avoid_: registro normalizado, línea calculada

**Detalle de origen**:
Los campos operativos de una fila original que se proyectan junto al registro normalizado para consulta sin volver a leer el archivo.
_Avoid_: metadatos genéricos, columna calculada

**Carga coordinada**:
La selección conjunta de las nueve fuentes del flujo de Consumibles para actualizar la cartera, los registros de consumo, los despachos y las intervenciones con una misma referencia operativa.
_Avoid_: archivo único, sincronización automática

## Cartera y operaciones

**Cartera instalada**:
La relación compartida entre clientes, contratos y equipos instalados que permite enlazar los módulos operativos.
_Avoid_: base de clientes, inventario

**Registro normalizado**:
Una fila validada y enlazada a la cartera instalada, con la forma necesaria para consultas, filtros y análisis de un módulo.
_Avoid_: fila original, copia del XLSX

**Despacho**:
La salida de un consumible o repuesto registrada con su documento, equipo, cantidad y trazabilidad de origen.
_Avoid_: consumo, movimiento

**Intervención**:
Un servicio técnico registrado para un equipo, informe, orden, responsable y tarea.
_Avoid_: visita, mantenimiento genérico

**Rendición**:
El estado administrativo de los importes asociados a un viaje, desde su registro hasta su aprobación.
_Avoid_: liquidación, viático

## Perfiles de cálculo

**Perfil MPS**:
La configuración de un modelo de equipo y sus consumibles, rendimientos y volumen recomendado para proyectar reemplazos.
_Avoid_: equipo instalado, regla de mantenimiento

**Perfil manual**:
Un perfil MPS creado o ajustado en la suite, separado de la fuente importada para conservar las dos referencias.
_Avoid_: modificación de la fuente original
