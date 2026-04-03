---
description: How to audit a generated M3U8 Master Playlist or PHP Resolver to prevent RFC 8216 Parser Violations (Unexpected Type Error).
---

# Workflow: Audit RFC8216 Strict HLS Syntax (#EXT-X-STREAM-INF)

Usa este workflow si tu generador o backend está retornando `Error occurred: Loaded playlist has unexpected type` en OTT Navigator. Verifica que los generadores de Master Playlists o Listas Locales no estén "ensuciando" la línea que divide las etiquetas M3U8 y las URL de los streams.

## Step 1: Auditoría Quirúrgica en el Código PHP / JS
Cuando estés ensamblando, editando o iterando el código base que concatena los string de M3U8 (`$abr_playlist .= ...` en PHP, o `m3uString += ...` en JS), busca violaciones a la ley de precedencia.

### Chequeo Local M3U8 (PowerShell)
```powershell
# Extrae el tag `#EXT-X-STREAM-INF` y las dos líneas inmediatas para ver si están invertidas.
Select-String -Path "ruta/a/tu/playlist.m3u8" -Pattern "^#EXT-X-STREAM-INF" -Context 0,2
```
Si el resultado tras la coincidencia **no empieza por HTTP**, entonces la lista está corrupta por diseño.

## Step 2: Revisión de Archivos en el Ecosistema
Busca en el código de backend (`resolve_quality_unified.php` o similares):
```powershell
Select-String -Path "IPTV_v5.4_MAX_AGGRESSION\backend\resolve_quality_unified.php" -Pattern "EXT-X-STREAM-INF" -Context 2,2
```
Asegúrate de que la formación respete ESTE orden EXACTO:
1. `"#EXTHTTP:..."`
2. `"#EXTVLCOPT:..."`
3. `"#KODIPROP:..."`
4. `"#EXT-X-STREAM-INF:..."`
5. `$url_del_canal`

## Step 3: Corrección Inmediata (Hotfix Rápido)
Si descubres la violación, el bloque de código php se tiene que reorganizar lógicamente de esta manera:
```php
// 1. Tags HTTP Adicionales Extremos
$abr_playlist .= "#EXTHTTP:{$json_exthttp}\n";
$abr_playlist .= "#EXTVLCOPT:network-caching={$net_cache}\n";

// 2. Definición Estándar del Estándar HLS
$abr_playlist .= "#EXT-X-STREAM-INF:BANDWIDTH=50000000,RESOLUTION=3840x2160,FRAME-RATE=60\n";

// 3. LA URL - ESTRICTAMENTE AL FINAL NO COMPARTIDA
$abr_playlist .= $url . "\n\n";
```

## Step 4: Aplicar el Hotfix y Renovar
1. Edita el bloque local.
2. Sube inmediatamente el `php` al VPS por `scp`. (Usa el comando del workflow `/deploy-vps`)
3. Pide un Stream Request y comprueba que la primera línea tras el bloque `EXT` ahora sí es la terminal `http`.
