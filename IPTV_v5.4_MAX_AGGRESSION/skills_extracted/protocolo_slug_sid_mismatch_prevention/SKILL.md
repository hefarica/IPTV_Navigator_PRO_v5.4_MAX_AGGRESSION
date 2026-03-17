---
name: protocolo_slug_sid_mismatch_prevention
description: >
  Doctrina inmutable para prevenir el desacople silencioso entre Stream IDs numéricos
  (asignados por Xtream Codes API) y Slugs alfanuméricos (generados por el frontend o
  el channels_map.json). Exige validación cruzada en 3 puntos: generación de lista,
  channels_map.json, y resolvers PHP. Erradica el error de "canal fantasma" donde
  el reproductor solicita un stream_id que no existe en el mapa del ADN.
---

# Protocolo Anti-Mismatch: Stream ID vs Slug (SID Purity)

## Objetivo

Garantizar una **paridad 1:1 estricta** entre el `stream_id` numérico del proveedor Xtream
y el identificador `ch` que viaja en la URL del resolver (`?ch=14`), eliminando la posibilidad
de que un canal apunte a un ID inexistente o corrupto.

---

## Defecto a Erradicar

Cuando el frontend genera una lista M3U8 y extrae `stream_id` de los datos crudos del API,
puede ocurrir que:

1. El `stream_id` sea `null`, `undefined`, o `0` (proveedor no lo asignó).
2. El `channels_map.json` use un slug alfanumérico (`"tf1-fhd"`) mientras la URL usa el numérico (`?ch=4`).
3. El resolver PHP reciba un `ch` que no matchea ninguna clave del mapa.

**Resultado:** El reproductor recibe un HTTP 404 o un manifest vacío → pantalla negra.

---

## Reglas Estrictas

### 1. Generador Frontend (`export-module.js`)

```javascript
// OBLIGATORIO: Validar stream_id antes de inyectar en URL
const streamId = ch.stream_id || ch.num || ch.base?.stream_id;
if (!streamId || streamId === 0) {
    console.warn(`[SID-GUARD] Canal "${ch.name}" omitido: stream_id inválido`);
    continue; // NO generar entrada para este canal
}
```

### 2. Channels Map (`channels_map.json`)

```json
{
    "14": {
        "slug": "tf1-fhd",
        "stream_id": 14,
        "profile": "P3"
    }
}
```

**Regla:** La clave del objeto JSON **DEBE** ser el `stream_id` numérico como string.
El campo `slug` es informativo; el campo `stream_id` es la fuente de verdad.

### 3. Resolver PHP (`resolve_quality.php`)

```php
$ch = preg_replace('/[^a-zA-Z0-9_\-]/', '', q('ch', ''));
if (empty($ch)) {
    http_response_code(400);
    die('#EXTM3U' . PHP_EOL . '#EXT-X-ERROR:INVALID_CHANNEL_ID');
}
```

**Regla:** Sanitizar `$ch` con regex antes de usarlo como clave de lookup.

---

## Procedimiento de Verificación

```bash
# 1. Verificar que export-module.js valida stream_id
grep -n "stream_id.*||.*0" export-module.js

# 2. Verificar que channels_map.json usa claves numéricas
python3 -c "import json; m=json.load(open('channels_map.json')); print(all(k.isdigit() for k in m.keys()))"

# 3. Verificar sanitización en PHP
grep -n "preg_replace.*ch" resolve_quality.php
```

## Archivos Afectados

| Archivo | Parche | Función |
| --- | --- | --- |
| `export-module.js` | Validación de `stream_id` no-nulo | Generador frontend |
| `channels_map.json` | Claves numéricas estrictas | ADN del sistema |
| `resolve_quality.php` | Sanitización regex de `$ch` | Resolver backend |
