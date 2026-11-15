<?php
/**
 * /prisma/api/ape-last-channel.php   (fuente: vps/prisma/api/ape-last-channel.php)
 *
 * Devuelve el ULTIMO canal que el player pidio por /pulse/<id>, su nombre real de
 * la lista y — si se puede MEDIR — la resolucion/codec/fps REALES del stream.
 *
 * POR QUE EXISTE
 *   El badge de upscaling del agente necesita saber de que resolucion a cual va la
 *   imagen. La salida la sabe el device (DisplayManager). La ENTRADA no: OTT no
 *   publica MediaSession y sin root no se puede leer el decoder de otra app.
 *   Pero el VPS SI puede: tiene el segmento, y ffprobe lo mide.
 *
 * COMO MIDE LA ENTRADA (sin inventar)
 *   1) del access log saca el ultimo /pulse/<id> y su u= (URL del proveedor)
 *   2) pide el manifest por el propio pulse y toma el primer /seg/
 *   3) descarga los primeros 3 MB de ese segmento y le pasa ffprobe
 *   4) cachea width/height/codec/profile/fps por canal
 *
 *   Si algo falla (sin ffprobe, canal bloqueado, timeout) devuelve resolution=null.
 *   El badge entonces dice "entrada: N/D", que es la verdad. NUNCA se estima.
 *
 * MEDIDO (2026-11-14, canal 1312008)
 *   segmento de 13.307.956 B -> ffprobe: hevc / Main 10 / 3840x2160 / 50 fps
 *
 * COSTE
 *   Primera consulta de un canal: ~13-21 MB y ~2-4 s. Despues, lectura de cache.
 *
 * NO TOCA NADA
 *   Solo lectura del log y de la red; escribe unicamente su propia cache.
 */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Access-Control-Allow-Origin: *');

$log     = getenv('APE_ACCESS_LOG')        ?: '/var/log/nginx/playlist_access.log';
$idx     = getenv('APE_CHANNEL_INDEX')     ?: '/var/www/html/prisma/db/channel_index.json';
$cacheF  = getenv('APE_RESOLUTION_CACHE')  ?: '/var/www/html/prisma/db/resolution_cache.json';
$ffprobe = getenv('APE_FFPROBE')           ?: '/usr/bin/ffprobe';
$ua      = 'OTT Navigator/1.7.3.3';

// ── 1. Ultimo canal pedido + su u= ──────────────────────────────────────────
$id = null;
$u  = null;
$ageS = null;   // segundos desde el ultimo /pulse/ — para saber si OTT sigue ahi
if (is_readable($log)) {
    $fh = @fopen($log, 'r');
    if ($fh) {
        $size = filesize($log);
        fseek($fh, max(0, $size - 400000));
        $tail = stream_get_contents($fh);
        fclose($fh);
        if (preg_match_all('#GET /pulse/([0-9]+)\.m3u8\?u=([^&\s"]+)#', $tail, $m, PREG_SET_ORDER)) {
            $last = end($m);
            $id = $last[1];
            $u  = urldecode($last[2]);
        }
        // [2026-11-14] Edad del ultimo zapeo.
        //
        // POR QUE: el ticker del agente detecta reproduccion con
        // AudioManager.isMusicActive(), que es GLOBAL: si el operador pone YouTube TV
        // con audio, el badge salia igual con datos de un canal OTT de hacia 20
        // minutos. Medido en vivo: "canal=|UK| TNT SPORTS ULTIMATE 4K entrada=3840x2160"
        // mientras el foco estaba en youtube.tv.
        //
        // Con age_s la app puede exigir que el /pulse/ sea RECIENTE para creerse que
        // OTT esta reproduciendo. Si el ultimo manifiesto tiene mas de 120 s, no hay
        // OTT delante y el badge no debe salir.
        //
        // Se calcula solo si la linea del ultimo match trae su timestamp.
        if (preg_match_all('#\[(\d{2})/([A-Za-z]{3})/(\d{4}):(\d{2}):(\d{2}):(\d{2})[^\]]*\][^\n]*?GET /pulse/#', $tail, $tm, PREG_SET_ORDER)) {
            $lt = end($tm);
            $meses = array('Jan'=>1,'Feb'=>2,'Mar'=>3,'Apr'=>4,'May'=>5,'Jun'=>6,
                           'Jul'=>7,'Aug'=>8,'Sep'=>9,'Oct'=>10,'Nov'=>11,'Dec'=>12);
            $mo = $meses[$lt[2]] ?? 0;
            if ($mo > 0) {
                // El log de nginx esta en UTC (+0000 en el formato).
                $epoch = gmmktime((int)$lt[4], (int)$lt[5], (int)$lt[6], $mo, (int)$lt[1], (int)$lt[3]);
                if ($epoch > 0) $ageS = max(0, time() - $epoch);
            }
        }
    }
}

// ── 2. Nombre desde el indice ───────────────────────────────────────────────
$nombre = null;
if ($id !== null && is_readable($idx)) {
    $j = @file_get_contents($idx);
    if ($j !== false) {
        $d = json_decode($j, true);
        if (is_array($d) && isset($d[$id])) $nombre = $d[$id];
    }
}

// ── 3. Resolucion: cache primero ────────────────────────────────────────────
$cache = array();
if (is_readable($cacheF)) {
    $cj = @file_get_contents($cacheF);
    if ($cj !== false) {
        $tmp = json_decode($cj, true);
        if (is_array($tmp)) $cache = $tmp;
    }
}

$medido = null;
$cacheHit = false;
if ($id !== null && isset($cache[$id]) && is_array($cache[$id])) {
    $medido = $cache[$id];
    $cacheHit = true;
}

// ── 4. Si no esta en cache y hay URL, medir con ffprobe ─────────────────────
if ($medido === null && $id !== null && $u !== null
    && is_file($ffprobe) && is_executable($ffprobe)) {

    $manifestUrl = 'https://iptv-ape.duckdns.org/pulse/' . rawurlencode($id) . '.m3u8?u='
                 . rawurlencode($u) . '&d=eyJ0IjoiZ2VuZXJpYyJ9';
    $seg = null;
    $ch = curl_init($manifestUrl);
    curl_setopt_array($ch, array(
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 12,
        CURLOPT_CONNECTTIMEOUT => 4,
        CURLOPT_USERAGENT      => $ua,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => 0,
    ));
    $body = (string) curl_exec($ch);
    curl_close($ch);
    if (preg_match('#^(/seg/[A-Za-z0-9_\-=]+)$#m', $body, $mm)) {
        $seg = 'https://iptv-ape.duckdns.org' . $mm[1];
    }

    if ($seg !== null) {
        $tmpf = @tempnam(sys_get_temp_dir(), 'ape_res_');
        $out = @fopen($tmpf, 'wb');
        $ch = curl_init($seg);
        curl_setopt_array($ch, array(
            CURLOPT_TIMEOUT        => 25,
            CURLOPT_CONNECTTIMEOUT => 4,
            CURLOPT_USERAGENT      => $ua,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_SSL_VERIFYHOST => 0,
            CURLOPT_RANGE          => '0-3145727', // 3 MB: basta para el header del TS
        ));
        if ($out) curl_setopt($ch, CURLOPT_FILE, $out);
        curl_exec($ch);
        curl_close($ch);
        if ($out) fclose($out);

        if (is_file($tmpf) && filesize($tmpf) > 65536) {
            $cmd = escapeshellcmd($ffprobe) . ' -v error -select_streams v:0'
                 . ' -show_entries stream=width,height,codec_name,profile,r_frame_rate'
                 . ' -of default=noprint_wrappers=1 ' . escapeshellarg($tmpf) . ' 2>/dev/null';
            $o = array();
            @exec($cmd, $o);
            $kv = array();
            foreach ($o as $line) {
                $p = explode('=', $line, 2);
                if (count($p) === 2) $kv[trim($p[0])] = trim($p[1]);
            }
            if (isset($kv['width'], $kv['height']) && (int)$kv['width'] > 0) {
                $medido = array(
                    'width'   => (int)$kv['width'],
                    'height'  => (int)$kv['height'],
                    'codec'   => $kv['codec_name']  ?? null,
                    'profile' => $kv['profile']     ?? null,
                    'fps'     => $kv['r_frame_rate'] ?? null,
                    'ts'      => time(),
                );
                $cache[$id] = $medido;
                @file_put_contents($cacheF, json_encode($cache, JSON_UNESCAPED_UNICODE));
            }
        }
        @unlink($tmpf);
    }
}

$resTxt = null;
if (is_array($medido) && isset($medido['width'], $medido['height'])) {
    $resTxt = $medido['width'] . 'x' . $medido['height'];
}

echo json_encode(array(
    'ok'         => $id !== null,
    'channel'    => $id,
    'name'       => $nombre,
    'resolution' => $resTxt,
    'codec'      => $medido['codec']   ?? null,
    'profile'    => $medido['profile'] ?? null,
    'fps'        => $medido['fps']     ?? null,
    // Segundos desde el ultimo GET /pulse/. null = no se pudo leer del log.
    // La app exige <=120 s para creerse que OTT esta reproduciendo AHORA: sin esto,
    // el badge salia sobre YouTube TV con datos de un canal OTT de hace 20 minutos
    // (medido en vivo el 2026-11-14).
    'age_s'      => $ageS,
    'cache_hit'  => $cacheHit,
    'source'     => 'playlist_access.log + channel_index.json + ffprobe',
    'measured'   => true,
), JSON_UNESCAPED_UNICODE);
