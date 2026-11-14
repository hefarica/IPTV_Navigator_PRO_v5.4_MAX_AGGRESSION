<?php
/**
 * ape-cablear-lista.php — cablea una lista M3U8 completa para que TODOS sus
 * canales pasen por /pulse/ del VPS.
 *
 * Version PHP del cableador bash (tools/ops/ape-cablear-lista.sh). El bash hacia
 * un `php -r rawurlencode` por CADA url; con 21.224 canales eso son 21.224
 * procesos. Esta version hace una sola pasada con gzopen/gzgets y rawurlencode
 * en proceso: minutos en vez de horas.
 *
 * MEDIDO ANTES DE ESCRIBIRLO:
 *   lista: 352.103.394 B gz -> 1.298.723.095 B -> 22.190.344 lineas
 *   URLs de canal: 21.224
 *   /pulse/ en la lista: 0     <-- el fallo que esto arregla
 *   zcat completo: 8.256 ms
 *
 * REGLAS (las mismas del bash, ya probadas contra el VPS):
 *   1. Lineas que empiezan por '#' o vacias -> VERBATIM. Incluye #EXTINF,
 *      #EXTVLCOPT, #KODIPROP, #EXTHTTP, #EXT-X-STREAM-INF (con VIDEO-RANGE=PQ),
 *      y toda la metadata APE. No se toca nada.
 *   2. Lineas http(s) -> se corta en el PRIMER '|' (los headers van pegados con
 *      pipe en las 80 de 80 URLs medidas) y se codifica SOLO la URL.
 *      Los headers no se pierden: cada canal ya lleva su #EXTHTTP.
 *   3. El id del canal se saca del patron /live/USER/PASS/<id>.m3u8 o /<id>.m3u8
 *   4. El parametro u= va URLENCODED (rawurlencode), NO base64.
 *      pulse.php:214 exige que u empiece literalmente por http(s); base64
 *      devuelve 400 "u no es http(s)". Probadas las cuatro variantes.
 *   5. Idempotente: si la URL ya contiene /pulse/ o ya empieza por el BASE, se
 *      deja tal cual. Cablear dos veces no doble-envuelve.
 *
 * NO publica nada. Escribe un fichero nuevo y su .gz. Sustituir /lists/ es
 * decision del operador.
 *
 * Uso:
 *   php ape-cablear-lista.php <in.gz|in.m3u8> <out.m3u8> [base] [device]
 */

$in  = $argv[1] ?? null;
$out = $argv[2] ?? null;
$base = $argv[3] ?? 'https://iptv-ape.duckdns.org';
$device = $argv[4] ?? 'eyJ0IjoiZ2VuZXJpYyIsInMiOiJ1bmtub3duIiwiciI6MjA0OCwidyI6MTkyMCwiaCI6MTA4MCwiZiI6MzB9';

if (!$in || !$out) { fwrite(STDERR, "uso: php ape-cablear-lista.php <in> <out> [base] [device]\n"); exit(2); }
if (!is_readable($in)) { fwrite(STDERR, "no puedo leer $in\n"); exit(2); }

$gz = (substr($in, -3) === '.gz');
$fh = $gz ? gzopen($in, 'rb') : fopen($in, 'rb');
if (!$fh) { fwrite(STDERR, "no puedo abrir $in\n"); exit(2); }
$fo = fopen($out, 'wb');
if (!$fo) { fwrite(STDERR, "no puedo escribir $out\n"); exit(2); }

$canales = 0; $envueltos = 0; $yaEstaban = 0; $sinId = 0; $lineas = 0; $t0 = microtime(true);
$reLive = '#/live/[^/]+/[^/]+/(\d+)\.(?:m3u8|ts|mp4)#';
$reAny  = '#/(\d+)\.(?:m3u8|ts|mp4)/?$#';
$reAnyPipe = '#/(\d+)\.(?:m3u8|ts|mp4)#';
$basePrefix = rtrim($base, '/');

while (true) {
    $line = $gz ? gzgets($fh, 1 << 20) : fgets($fh, 1 << 20);
    if ($line === false) break;
    $line = rtrim($line, "\r\n");
    $lineas++;

    // (1) metadata verbatim
    if ($line === '' || $line[0] === '#') { fwrite($fo, $line . "\n"); continue; }

    // (2) url de canal
    if (preg_match('#^https?://#i', $line)) {
        $canales++;
        $url = $line;
        $pipe = strpos($url, '|');
        if ($pipe !== false) $url = substr($url, 0, $pipe);

        // (5) idempotencia
        if (strpos($url, '/pulse/') !== false || strpos($url, $basePrefix) === 0) {
            $yaEstaban++; fwrite($fo, $line . "\n"); continue;
        }

        // (3) id
        $id = null;
        if (preg_match($reLive, $url, $m)) $id = $m[1];
        elseif (preg_match($reAny, $url, $m)) $id = $m[1];
        elseif (preg_match($reAnyPipe, $url, $m)) $id = $m[1];

        if ($id === null) { $sinId++; fwrite($fo, $line . "\n"); continue; }

        // (4) urlencoded
        $u = rawurlencode($url);
        fwrite($fo, $basePrefix . '/pulse/' . $id . '.m3u8?u=' . $u . '&d=' . $device . "\n");
        $envueltos++;
        continue;
    }

    // cualquier otra cosa: verbatim
    fwrite($fo, $line . "\n");
}

if ($gz) gzclose($fh); else fclose($fh);
fclose($fo);

$dt = microtime(true) - $t0;
$outBytes = filesize($out);

echo "CABLEADO\n";
echo "  entrada   : $in\n";
echo "  salida    : $out\n";
echo "  bytes     : $outBytes\n";
echo "  lineas    : $lineas\n";
echo "  canales   : $canales\n";
echo "  envueltos : $envueltos\n";
echo "  ya estaban: $yaEstaban\n";
echo "  sin id    : $sinId\n";
echo "  base      : $basePrefix\n";
printf("  tiempo    : %.1f s\n", $dt);
echo "  sha256    : " . hash_file('sha256', $out) . "\n";
