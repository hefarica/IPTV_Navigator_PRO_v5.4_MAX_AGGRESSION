---
name: Convención de Nombres - Listas M3U8 y Channel Maps en VPS
description: Reglas absolutas de nomenclatura, emparejamiento y rutas de almacenamiento para listas M3U8 y sus channel maps en el VPS Hetzner.
---

# 🗂️ Convención de Nombres — Listas M3U8 y Channel Maps en VPS

## REGLA ABSOLUTA #1: EMPAREJAMIENTO DE NOMBRES

Cada lista M3U8 generada SIEMPRE viene acompañada de un archivo `channels_map.json` con el **MISMO basename exacto**.

```
APE_TYPED_ARRAYS_ULTIMATE_20260315_102305.m3u8
APE_TYPED_ARRAYS_ULTIMATE_20260315_102305.channels_map.json
```

**NUNCA** referirse a `latest.m3u8` como URL de la lista. La URL oficial de la lista **SIEMPRE** debe usar el nombre real del archivo que coincide con el `channels_map`.

### ❌ PROHIBIDO
```
https://iptv-ape.duckdns.org/lists/latest.m3u8
```

### ✅ CORRECTO
```
https://iptv-ape.duckdns.org/lists/APE_TYPED_ARRAYS_ULTIMATE_20260315_102305.m3u8
```

## REGLA ABSOLUTA #2: RUTA DE ALMACENAMIENTO EN VPS

Los archivos `.m3u8` y `.channels_map.json` se almacenan en:

```
/var/www/iptv-ape/lists/    ← directorio REAL
/var/www/lists/              ← symlink a /var/www/iptv-ape/lists/
```

`list_files.php` busca en cadena de fallback:
1. `/var/www/lists/` (symlink)
2. `/var/www/html/lists/`
3. `/var/www/iptv-ape/lists/` (real)

**NUNCA** subir listas a `/var/www/html/` directamente. Siempre a `/var/www/iptv-ape/lists/` o `/var/www/lists/`.

## REGLA ABSOLUTA #3: AL SUBIR POR SCP

Después de subir por SCP, **SIEMPRE** verificar:
1. Que el `.m3u8` y el `.channels_map.json` estén en la **misma carpeta**
2. Que tengan el **mismo basename**
3. Que estén en `/var/www/iptv-ape/lists/` (no en `/var/www/html/`)
4. Permisos: `www-data:www-data`

## REGLA ABSOLUTA #4: RESOLVE_QUALITY.PHP

`resolve_quality.php` busca el `channels_map` haciendo `glob("*.channels_map.json")` en el directorio de listas. Si el archivo no tiene el mismo basename que el `.m3u8`, **NO LO ENCONTRARÁ** y la resolución de calidad fallará.

## REGLA ABSOLUTA #5: URL DEL USUARIO

Cuando el usuario pregunte por la URL de su lista, **SIEMPRE** responder con el nombre completo real:
```
https://iptv-ape.duckdns.org/lists/{NOMBRE_EXACTO_DEL_ARCHIVO}.m3u8
```

**PROHIBIDO** usar `latest.m3u8` como respuesta. El symlink `latest.m3u8` es solo para uso interno del sistema, **NUNCA** para el usuario final.
