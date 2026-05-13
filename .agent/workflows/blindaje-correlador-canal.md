---
description: Pipeline Entry Absolute Injection Rule (Nivel Cero) y Correlador de 5 Capas para el Ecosistema OMEGA
---

# Blindaje Absoluto del Correlador de Canal (Hardening God-Tier)

Este workflow documenta la doctrina estricta (Hardening) que **NUNCA DEBE ROMPERSE** al interactuar con el ecosistema OMEGA, en particular con `resolve_quality_unified.php`. El objetivo es garantizar que la telemetría asíncrona del KNN jamás quede "ciega" ante modos de reproducción inmediatos como `mode=200ok` o salidas tempranas (`exit;`).

## Paso 1: Localización del "Pipeline Entry" (Nivel Cero)
**NUNCA** coloques lógica de Telemetría o extracción de canal al final del archivo. Se deben poner en las líneas inmediatas a la carga estática de cabeceras, típicamente `Líneas ~70-75`, **antes** de cualquier evaluación tipo `$mode = $_GET['mode']`. 
- **Razón Estratégica:** Modos de alto rendimiento (`mode=200ok`, `health`, o `polymorphic`) cortan la ejecución y devuelven 200 OK con un `exit;` fulminante para tener cero latencia, omitiendo cualquier código que esté por debajo de ellos.

## Paso 2: Implementación de las 5 Capas
El `get_correlated_channel_id()` debe seguir el patrón iterativo de 5 capas. NUNCA extraigas el ID de una sola fuente. El reproductor (ExoPlayer / VLC) siempre puede fallar.
1. Capa 1: Tokens criptográficos en URI (Alta Fidelidad).
2. Capa 2: Variables `$_SERVER['HTTP_X_APE_CHANNEL']` y Regex de User-Agents.
3. Capa 3: Arreglos nativos extendidos (`ch`, `id`, `c`, `stream`).
4. Capa 4: Inferencia Léxica sobre URI (Evitar `MASTER` y `STREAM`).
5. Capa 5: HTTP_REFERER.

## Paso 3: Hook de Aislamiento de Estado (IPC RAM)
Justo debajo de obtener `$ch_global`, asegura el commit atómico en RAM (`/dev/shm`).

```php
$ch_global = get_correlated_channel_id();
if ($ch_global !== 'UNKNOWN') {
    // ... 
    @file_put_contents('/dev/shm/guardian_telemetry_v16.log', $logLine, FILE_APPEND | LOCK_EX);
    if (class_exists('GuardianTelemetry')) {
        GuardianTelemetry::sessionPing($latencyMs, false, $ch_global, "CH: {$ch_global}");
    }
}
```

## Paso 4: Caza de "UNKNOWNS" (Auditoría Forense)
Si un día pierdes el rastro de la telemetría, OBLIGA a correr:
`ssh root@VPS "tail -n 100 /dev/shm/guardian_telemetry_v16.log | grep UNKNOWN"`

- Si encuentras UNKNOWNS: Significa que hay reproductores extraños o bots raspando la ruta, y el modelo KNN lo interpretó con éxito y aplicará filtros en base a los pre-flags de desconfianza.
- Si simplemente la IP NO SE REGISTRA: ¡Alarma Roja! Alguien movió el código fuera del **Pipeline Entry** y el modo `200ok` está matando la telemetría. Vuelve a ejecutar este Workflow.
