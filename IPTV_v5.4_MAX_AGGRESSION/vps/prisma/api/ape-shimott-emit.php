<?php
/**
 * ape-shimott-emit.php — emisor del bloque `shimott` (payload de #EXTSHIMOTT).
 *
 * QUÉ ES
 *   El tag `#EXTSHIMOTT:{json}` vive en la LISTA y lo emite
 *   tools/pulse/ape-pulse-wrap.js, una vez por canal, justo antes de la URI.
 *   Estos endpoints NO construyen ningún .m3u8: devuelven JSON por device. Aquí
 *   se añade el MISMO payload como CAMPO `shimott` de la respuesta, para que el
 *   shim de la APK reciba por el bus (SSE/one-shot) lo que en la lista es
 *   estático. NO se emite ninguna línea `#EXTSHIMOTT` desde PHP: eso duplicaría
 *   el tag que ya pone el wrap (el contrato exige exactamente 1 por canal).
 *
 * QUÉ LLEVA (y qué NO, y por qué)
 *   ver,id,tgt  Identidad del canal + routing. `id` es el canal que el endpoint
 *               ya conoce (`ch` del GET o el correlacionado por IP). Sin canal
 *               conocido NO se emite el bloque: no se inventa un id de canal.
 *   dev.*       SOLO las claves Android que este VPS REALMENTE computa y manda
 *               al daemon en `device_settings` ("<ns> <key> <val>", allowlist de
 *               ape_mesh.php). Si una clave no está, su campo se omite. Valores
 *               fuera del dominio del contrato se omiten, no se corrigen.
 *   NO v.*      El VPS no probea el canal. `codec_hint` / `resolution_hint` del
 *               estado por IP son HINTS del cliente, no la fuente real servida;
 *               escribirlos como `v` sería declarar medido lo que no se midió.
 *               La `v` real la pone el wrap desde `#EXT-X-APE-STREAM-TRUTH`.
 *   NO hdr.*    El VPS no tiene el `#EXTHTTP` del canal; esas cabeceras las pone
 *               el wrap desde la propia lista.
 *   NO flt      La cadena de filtros es del recetario de imagen. Inventarla aquí
 *               sería ordenar una ejecución que nadie validó en este endpoint.
 *
 * CONTRATO: contracts/extshimott_contract.json — `ape.extshimott.v1`.
 * FLAG: APE_SHIMOTT_EMIT=0 (o off/false/no) desactiva el bloque sin tocar el
 *       endpoint ni su respuesta actual (queda exactamente como hoy).
 *
 * IMPORTANTE: este archivo NO toca `device_settings`, `presets` ni su orden; sólo
 * produce un objeto nuevo para un campo nuevo (aditivo puro).
 */

if (!function_exists('ape_shimott_enabled')) {
    /** Flag de emisión. Sin variable de entorno => ON (comportamiento pedido). */
    function ape_shimott_enabled() {
        $v = getenv('APE_SHIMOTT_EMIT');
        if ($v === false || $v === '') { return true; }
        $s = strtolower(trim((string)$v));
        return !($s === '0' || $s === 'off' || $s === 'false' || $s === 'no');
    }
}

if (!function_exists('ape_shimott_int')) {
    /** Entero dentro de [min,max] o null (null = NO se emite el campo). */
    function ape_shimott_int($value, $min, $max) {
        if (is_int($value)) {
            $n = $value;
        } elseif (is_float($value)) {
            if (!is_finite($value) || floor($value) != $value) { return null; }
            $n = (int)$value;
        } elseif (is_string($value) && preg_match('/^-?\d{1,6}$/', trim($value))) {
            $n = (int)trim($value);
        } else {
            return null;
        }
        return ($n >= $min && $n <= $max) ? $n : null;
    }
}

if (!function_exists('ape_shimott_id')) {
    /** Clave de canal conforme al patrón del contrato; null si no hay forma honesta. */
    function ape_shimott_id($channel) {
        $raw = trim((string)$channel);
        if ($raw === '') { return null; }
        if (preg_match('/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/', $raw)) { return $raw; }
        $s = preg_replace('/[^A-Za-z0-9_.:-]/', '_', $raw);
        if (!is_string($s)) { return null; }
        $s = preg_replace('/^[^A-Za-z0-9]+/', '', $s);
        if (!is_string($s) || $s === '') { return null; }
        $s = substr($s, 0, 64);
        return preg_match('/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/', $s) ? $s : null;
    }
}

if (!function_exists('ape_shimott_dev')) {
    /**
     * `device_settings` ("<ns> <key> <val>") -> dev.* del contrato.
     * Mapa CERRADO: sólo claves que el contrato ver:1 declara. El primer valor
     * gana (es el orden real de emisión de ape_mesh_device_settings). Lo que no
     * está en el mapa (p. ej. levers VPP o claves Amazon de texto) se ignora.
     */
    function ape_shimott_dev(array $deviceSettings) {
        $map = array(
            'hdr_conversion_mode'              => array('hdr_c', 0, 3),
            'match_content_frame_rate'         => array('mcr',   0, 2),
            'minimal_post_processing_allowed'  => array('mmp',   0, 1),
            'user_preferred_resolution_width'  => array('res_w', 1, 7680),
            'user_preferred_resolution_height' => array('res_h', 1, 4320),
        );
        $dev = array();
        foreach ($deviceSettings as $row) {
            if (!is_string($row)) { continue; }
            $parts = preg_split('/\s+/', trim($row));
            if (!is_array($parts) || count($parts) < 3) { continue; }
            $key = $parts[1];
            if (!isset($map[$key])) { continue; }
            $field = $map[$key][0];
            if (isset($dev[$field])) { continue; }
            $n = ape_shimott_int($parts[2], $map[$key][1], $map[$key][2]);
            if ($n !== null) { $dev[$field] = $n; }
        }
        // Orden FIJO del contrato: el payload no cambia porque cambie el orden de
        // las filas de device_settings (determinismo de la salida).
        $ordered = array();
        foreach (array('hdr_c', 'mcr', 'mmp', 'res_w', 'res_h') as $field) {
            if (isset($dev[$field])) { $ordered[$field] = $dev[$field]; }
        }
        return $ordered;
    }
}

if (!function_exists('ape_shimott_payload')) {
    /**
     * Payload del tag (objeto, SIN el prefijo `#EXTSHIMOTT:`).
     *
     * @param string $channel         canal real (ch del GET o correlacionado por IP)
     * @param array  $deviceSettings  filas "<ns> <key> <val>" YA calculadas
     * @param array  $opts            ['tgt' => 'ott'|'vlc'|'kod'|pipe-list]
     * @return array|null  null = no se emite (sin canal, flag OFF o id no conforme)
     */
    function ape_shimott_payload($channel, array $deviceSettings = array(), array $opts = array()) {
        if (!ape_shimott_enabled()) { return null; }
        $id = ape_shimott_id($channel);
        if ($id === null) { return null; }

        $payload = array('ver' => 1, 'id' => $id);

        $dev = ape_shimott_dev($deviceSettings);
        if (!empty($dev)) { $payload['dev'] = $dev; }

        $tgt = isset($opts['tgt']) ? (string)$opts['tgt'] : 'ott';
        if (!preg_match('/^(ott|vlc|kod)(\|(ott|vlc|kod))*$/', $tgt)) { $tgt = 'ott'; }
        $seen = array();
        $list = array();
        foreach (explode('|', $tgt) as $t) {
            if (!isset($seen[$t])) { $seen[$t] = true; $list[] = $t; }
        }
        $payload['tgt'] = implode('|', $list);

        return $payload;
    }
}
