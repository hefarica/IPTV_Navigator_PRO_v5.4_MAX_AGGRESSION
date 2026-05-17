---
name: Puente Matemático Frontend-Backend (Sync Absoluto)
description: Habilidad Maestra que unifica el cerebro matemático del Frontend con el ejecutor en Backend (resolve.php) vía la directiva EXTATTRFROMURL, garantizando la persistencia del ancho de banda y buffers dinámicos.
---

# Puente Matemático Frontend-Backend (Sincronización Absoluta)

## Filosofía de la Habilidad

La matemática dinámica calculada en el navegador por los distintos Sincronizadores (Latencia Rayo, Netflix Max, Auto-Speedtest) no debe morir en el Frontend. Puesto que el sistema confía en la ejecución en tiempo de carga mediante `#EXTATTRFROMURL` interceptada por el VPS (`resolve.php`), es vital que las directivas de capa de red (ancho de banda, buffers y prefetch) se teletransporten vivas al servidor.

## Reglas Arquitectónicas (Inmutables)

1. **Empaquetado de Meta-Variables (Frontend)**:
   Cuando cualquier generador construya un enlace `#EXTATTRFROMURL`, debe incrustar los resultados de la Sincronización Universal como Query Parameters en la URL.
   - `bw=[max_bandwidth]`
   - `buf=[buffer_ms]`
   - `th1=[throughput_t1]`
   - `th2=[throughput_t2]`
   - `pfseg=[prefetch_segments]`
   - `pfpar=[prefetch_parallel]`
   - `tbw=[targetBitrateKbps]`

2. **Interceptación y Sobreescritura (Backend)**:
   Dentro de `resolve.php`, el script debe atrapar (`$_GET`) proactivamente todas estas variables teletransportadas.  
   Si estas variables dinámicas existen, deben tener **máxima prioridad** y sobreescribir la capa base de configuración estática predefinida para cada perfil (P0-P5) (`$profileCfg`).

3. **Cero Omisiones Genéricas**:
   El array dinámico debe alimentar retroactivamente tanto a los bloques `#EXTVLCOPT` (caching), como a `#KODIPROP` y `#EXT-X-APE`. Nunca permitiendo que el servidor decida arbitrariamente qué valor es mejor si el Frontend ya entregó una orden pre-calculada y adaptada a la métrica local.

4. **Coherencia Mínima Fallback**:
   Si, debido al modo legacy o petición externa, las variables dinámicas `bw`, `buf`, etc. no viajan en el Query, el Backend caerá fluidamente al diccionario `$profileCfg` como última capa de blindaje, asegurando que la transmisión inicie sin interrupción con los mejores fallbacks globales disponibles.
