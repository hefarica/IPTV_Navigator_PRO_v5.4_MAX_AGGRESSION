<?php
/**
 * /prisma/api/ape-last-channel.php   (fuente: vps/prisma/api/ape-last-channel.php)
 *
 * Devuelve el ULTIMO canal que el player pidio por /pulse/<id> y su nombre real
 * de la lista. Nace del defecto medido en el overlay:
 *
 *   El badge de upscaling salia con "canal=sin titulo" porque OTT NO publica
 *   MediaSession (medido: `dumpsys media_session | grep studio.scillarium` vacio
 *   mientras OTT estaba en PlayerActivity reproduciendo). Sin sesion no hay
 *   MediaMetadata y la app no puede saber que canal estas viendo.
 *
 *   Pero el VPS SI lo sabe: cada manifest que el player pide entra por
 *   /pulse/<id> y deja linea en playlist_access.log (formato ape_playlist).
 *
 * COMO LO SACA
 *   1) Lee la COLA de playlist_access.log (ultimos ~200 KB) y toma el ultimo GET /pulse/<id>.
 *      No carga el log entero: el fichero crece sin limite.
 *   2) Traduce el id con channel_index.json, pre-generado desde la lista por
 *      ape-channel-index.sh. NO se recorre el .m3u8 de 1,3 GB por peticion
 *      (eso tardaria ~10 s por consulta y bloquearia un worker de php-fpm).
 *
 * NO INVENTA
 *   Sin peticiones o con un id fuera del indice devuelve {"ok":false}.
 *   El consumidor (el badge) simplemente no muestra el nombre.
 *
 * NO TOCA NADA
 *   Sin sockets, sin modificar el log, sin tocar al player. Solo lectura.
 */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Access-Control-Allow-Origin: *');

$log = getenv('APE_ACCESS_LOG') ?: '/var/log/nginx/playlist_access.log';
$idx = getenv('APE_CHANNEL_INDEX') ?: '/var/www/html/prisma/db/channel_index.json';

$id = null;
if (is_readable($log)) {
    $fh = @fopen($log, 'r');
    if ($fh) {
        $size = filesize($log);
        $seek = max(0, $size - 200000);
        fseek($fh, $seek);
        $tail = stream_get_contents($fh);
        fclose($fh);
        if (preg_match_all('#GET /pulse/([0-9]+)\.m3u8#', $tail, $m)) {
            $id = end($m[1]);
        }
    }
}

$nombre = null;
$ts = null;
if ($id !== null && is_readable($idx)) {
    $j = @file_get_contents($idx);
    if ($j !== false) {
        $d = json_decode($j, true);
        if (is_array($d) && isset($d[$id])) $nombre = $d[$id];
    }
    $ts = @filemtime($idx) ?: null;
}

echo json_encode(array(
    'ok'       => $id !== null,
    'channel'  => $id,
    'name'     => $nombre,
    'index_ts' => $ts,
    'source'   => 'access.log + channel_index.json',
    'measured' => true,
), JSON_UNESCAPED_UNICODE);
