<?php
/**
 * conteo_cableado.php — conteo REAL de canales cableables de la lista del operador.
 *
 * NO ESCRIBE NADA: lee el .gz en streaming y emite solo numeros por stdout.
 * No toca la lista servida (/var/www/lists/pulse/), no abre conexiones al
 * proveedor y no crea ficheros.
 *
 * Aplica las reglas de wiring del contrato t59 (§wiring):
 *   - cortar en el PRIMER '|' (headers pegados) antes de codificar
 *   - extraer el id en el orden del contrato: /live/USER/PASS/<id>.m3u8,
 *     /<id>.m3u8, /<id>.(ts|mp4)
 *   - u= con rawurlencode (nunca base64)
 *   - si ya trae /pulse/ -> ya_estaban (no doble-envuelto, invariante I5)
 *
 * Uso: ... | ssh host 'nice -n 19 php -n'   (el programa entra por stdin)
 */
$src = '/var/www/lists/APE_LISTA_1794100720046.m3u8.gz';
$fh = gzopen($src, 'rb');
if (!$fh) { fwrite(STDERR, "no se pudo abrir " . $src . "\n"); exit(2); }

$extinf = 0; $urls = 0; $envueltos = 0; $yaEstaban = 0; $sinId = 0;
$base = 'https://iptv-ape.duckdns.org';
$dev = 'eyJ0IjoiZ2VuZXJpYyIsInMiOiJ1bmtub3duIiwiciI6MjA0OCwidyI6MTkyMCwiaCI6MTA4MCwiZiI6MzB9';

function extraer_id($u)
{
    if (preg_match('#/live/[^/]+/[^/]+/([0-9]+)\.m3u8#', $u, $m)) { return $m[1]; }
    if (preg_match('#/([0-9]+)\.m3u8#', $u, $m)) { return $m[1]; }
    if (preg_match('#/([0-9]+)\.(ts|mp4)#', $u, $m)) { return $m[1]; }
    return '';
}

while (!gzeof($fh)) {
    $line = gzgets($fh, 1 << 20);
    if ($line === false) { break; }
    $t = rtrim($line, "\r\n");
    if (strpos($t, '#EXTINF') === 0) { $extinf++; continue; }
    if ($t === '' || $t[0] === '#') { continue; }
    if (stripos($t, 'http') !== 0) { continue; }
    $urls++;
    $p = strpos($t, '|');
    $u = ($p === false) ? $t : substr($t, 0, $p);
    if (strpos($u, '/pulse/') !== false) { $yaEstaban++; continue; }
    $id = extraer_id($u);
    if ($id === '') { $sinId++; continue; }
    $env = $base . '/pulse/' . $id . '.m3u8?u=' . rawurlencode($u) . '&d=' . $dev;
    if (preg_match('#^https://iptv-ape\.duckdns\.org/pulse/[0-9]+\.m3u8\?u=https?%3A%2F%2F#', $env)) {
        $envueltos++;
    }
}
gzclose($fh);

echo json_encode(array(
    'fuente'      => $src,
    'extinf'      => $extinf,
    'lineas_url'  => $urls,
    'envueltos'   => $envueltos,
    'ya_estaban'  => $yaEstaban,
    'sin_id'      => $sinId,
    'salida'      => 'APE_LISTA_1794100720046_CABLEADA.m3u8',
)), "\n";
exit(0);
