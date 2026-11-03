# T39 · PROPUESTA DE PARCHE — `ape_vpp` por canal en la URL-2 (NO aplicado)

> **Estado: NO aplicado. No se ha tocado el VPS ni el código de producción.**
> Diseño que lo justifica: [`docs/rea/09_URL2_VPP_METADATA.md`](../../../docs/rea/09_URL2_VPP_METADATA.md)
> Rutas afectadas: `vps/prisma/lib/ape_mesh.php` · `vps/prisma/api/ape-feedforward.php` ·
> `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js`. Ninguna de ellas está en el árbol desplegado por
> `_vps_stage/deploy/manifest.tsv` salvo el consumidor PHP; **requiere ventana + `nginx -t` + rollback**
> si algún día se aplica. Todo el parche es **aditivo** y **apagado por defecto**.

## 1 · Qué añade (y qué NO)

| Añade | NO toca |
|---|---|
| Una clave `ape_vpp` en el JSON de la URL-2 | `presets[]` (siguen siendo player-blind, nunca STREAM-INF) |
| Gate server-side `soc_allow` contra `ara_heartbeats.caps_json` | `device_settings` actuales (`match_content_frame_rate`, `hdr_conversion_mode`) |
| Un tag inerte `#EXT-X-APE-VPP` en la lista | `RESOLUTION`, `CODECS`, `BANDWIDTH`, `VIDEO-RANGE` |
| — | `declare_auto` / su guarda (`ape_uhd.lua`, `ape_gateway.lua`) |

## 2 · Diff 1 — `vps/prisma/lib/ape_mesh.php` (aditivo, al final del bloque URL-2)

```php
if (!function_exists('ape_vpp_levers')) {
    /**
     * Levers VPP (AI-SR/AI-PQ) REALES del cartucho. Claves bare; el ARA mapea namespace.
     * Fuente: push_pq_profile.php:22-30 (13 levers) + adb_master_directives_rule:55,60.
     * NOTA: NO existe clave `memc` de SoC en el repo (MEMC es filtro de player, no setting):
     * se acepta la clave por compatibilidad y se IGNORA.
     */
    function ape_vpp_levers($pq_profile = 'max_image') {
        $l = array(
            'pq_ai_sr_enable' => 1, 'ai_sr_level' => 3,
            'ai_pq_mode' => 3, 'aipq_enable' => 1,
            'pq_sharpness_enable' => 1,
            'pq_ai_dnr_enable' => 1, 'pq_dnr_enable' => 1, 'pq_nr_enable' => 1,
            'pq_ai_fbc_enable' => 1,
            'pq_hdr_enable' => 1, 'pq_hdr_mode' => 1,
            'match_content_frame_rate' => 1,
        );
        if ($pq_profile === 'sports') { $l['pq_ai_dnr_enable'] = 0; $l['pq_dnr_enable'] = 0; }
        if ($pq_profile === 'off')    { foreach ($l as $k => $v) { $l[$k] = 0; } }
        return $l;
    }
}

if (!function_exists('ape_soc_allowlisted')) {
    /** Gate FAIL-CLOSED: sin caps o SoC no allowlisted ⇒ false. */
    function ape_soc_allowlisted($device_id, array $allow) {
        if (!$device_id) return false;
        $db = ape_policy_db(); if (!$db) return false;
        try {
            $st = $db->prepare('SELECT caps_json FROM ara_heartbeats WHERE device_id = :d LIMIT 1');
            $st->execute(array(':d' => $device_id));
            $row = $st->fetch(PDO::FETCH_ASSOC);
        } catch (\Throwable $e) { return false; }
        if (!$row || empty($row['caps_json'])) return false;          // sin caps ⇒ sin VPP
        $caps = json_decode($row['caps_json'], true);
        if (!is_array($caps)) return false;
        $soc = isset($caps['soc']) ? strtolower((string)$caps['soc']) : '';
        if ($soc === '') return false;
        foreach ($allow as $a) { if (strtolower((string)$a) === $soc) return true; }
        return false;
    }
}

if (!function_exists('ape_vpp_block')) {
    /**
     * Bloque `ape_vpp` o null. NUNCA lanza: cualquier fallo ⇒ null (comportamiento de hoy).
     * $opts: ['pq_profile'=>'max_image','target'=>'4k|8k','profile'=>'P1','src'=>'WxH',
     *          'soc_allow'=>array(...)]
     */
    function ape_vpp_block($device_id, array $opts = array()) {
        $allow = isset($opts['soc_allow']) ? (array)$opts['soc_allow'] : array('mt8696', 'amlogic');
        if (!ape_soc_allowlisted($device_id, $allow)) return null;   // ← fallback seguro
        return array(
            'schema'      => 'ape.vpp.v1',
            'profile'     => isset($opts['profile']) ? (string)$opts['profile'] : 'P1',
            'pq_profile'  => isset($opts['pq_profile']) ? (string)$opts['pq_profile'] : 'max_image',
            'target'      => isset($opts['target']) && $opts['target'] === '8k' ? '8k' : '4k',
            'src'         => isset($opts['src']) ? (string)$opts['src'] : null,
            'soc'         => 'allowlisted',
            'levers'      => ape_vpp_levers(isset($opts['pq_profile']) ? $opts['pq_profile'] : 'max_image'),
            'note'        => 'post-proceso en el SoC; el VPS NO toca pixeles',
        );
    }
}
```

## 3 · Diff 2 — `vps/prisma/api/ape-feedforward.php` (una línea + una clave)

```php
 // …justo después de $device_settings = ape_mesh_device_settings($streamInfo);
+// T39: bloque VPP por canal/device, gateado por SoC (null si no allowlisted ⇒ como hoy).
+$vpp = function_exists('ape_vpp_block')
+    ? ape_vpp_block($device !== '' ? $device : null, array(
+        'target' => isset($_GET['target']) && $_GET['target'] === '8k' ? '8k' : '4k',
+        'src'    => (isset($_GET['w'], $_GET['h']) && (int)$_GET['w'] > 0)
+                    ? ((int)$_GET['w'] . 'x' . (int)$_GET['h']) : null,
+      ))
+    : null;
 
 echo json_encode(array(
     // …claves actuales intactas…
+    'ape_vpp'         => $vpp,          // null ⇒ el emisor NO cambia nada
 ), JSON_UNESCAPED_SLASHES);
```

**Retrocompatibilidad:** si `$vpp === null`, el único cambio en la respuesta es la presencia de la clave con valor `null`. Para byte-identidad estricta (gate V-3) se emite con `array_filter` cuando `--strict`/flag `APE_VPP_EMIT=0`:

```php
$out = array(/* …actuales… */);
if ($vpp !== null) { $out['ape_vpp'] = $vpp; }   // sin VPP ⇒ respuesta byte-idéntica
echo json_encode($out, JSON_UNESCAPED_SLASHES);
```

## 4 · Diff 3 — `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` (una línea)

En el bloque de tags por canal, junto a las hermanas (`WAKE`/`FEEDFORWARD`, ~L3028-3029):

```js
 // T39: marcador INERTE (RFC 8216 §6.3.1). NO toca RESOLUTION/CODECS/BANDWIDTH.
 if (vppTarget && vppSocAllowlisted) {
   tags.push(`#EXT-X-APE-VPP:profile=${vppProfile};target=${vppTarget};src=${vppSrc};pq=${vppPq};soc=${vppSoc};can8k=${vppCan8k}`);
 }
```

**Sin `vppTarget` (default) ⇒ no se emite nada** y la lista queda byte-idéntica.

## 5 · Verificación propuesta (gates V-1…V-5 del diseño)

| Gate | Comando/criterio | Esperado |
|---|---|---|
| V-1 | `sha256` del manifiesto servido antes/después con `ape_vpp` **off**; con **on**: diff de **1** línea y 0 cambios en `RESOLUTION`/`CODECS`/`BANDWIDTH` | idéntico / 1 línea |
| V-2 | 3 caps sintéticas en `ara_heartbeats` (`mt8696`, `amlogic`, `samsung`) ⇒ `ape_vpp` presente sólo en las 2 primeras | fail-closed probado |
| V-3 | respuesta de `ape-feedforward.php` sin `APE_VPP_EMIT` ⇒ byte-idéntica | 0 diffs |
| V-4 | lista con el tag en TiviMate/OTT/hls.js/ExoPlayer ⇒ mismo comportamiento; `uhd_doctrine_guard.mjs` sigue `exit 0` (no ve el tag como marca UHD) | sin regresión |
| V-5 | la respuesta no expone `caps_json` (sólo `soc:"allowlisted"`) | sin fuga |

## 6 · Rollback

| Fichero | Reversión |
|---|---|
| `ape_mesh.php` | borrar el bloque `T39` (3 funciones `if (!function_exists)`) — no toca nada existente |
| `ape-feedforward.php` | quitar la clave `ape_vpp` del `json_encode` (1 línea) |
| `m3u8-typed-arrays-ultimate.js` | quitar el `if (vppTarget …) tags.push(…)` (1 línea) |
| Base de datos | **ninguna migración**: `soc_allow` se lee de `ara_heartbeats.caps_json`, que ya existe |

## 7 · Lo que este parche NO puede demostrar

- **Efecto visual del VPP**: `NOT_RUN` — requiere el ARA/daemon en el device autorizado.
- **Que la clave `memc` exista como setting de SoC**: **no existe** en el repo; el parche la ignora a propósito.
- **Que el ARA respete `soc_allow`**: el gate propuesto es **server-side**; si el ARA aplicara un delta viejo de `policy_deltas` sin el bloque, el gate del feedforward no lo cubre. Cerrar eso exige que `push_pq_profile.php` **también** consulte `ape_soc_allowlisted()` antes de insertar el delta — cambio de 3 líneas, **propuesto pero no incluido** para no ampliar el alcance sin OK.
