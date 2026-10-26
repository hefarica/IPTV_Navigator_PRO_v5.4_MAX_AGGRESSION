<?php
/**
 * T11 + T23 — Prueba de emisión sobre los BYTES REALES del archivo.
 *
 * No replica la lógica: extrae el bloque de emisión tal como está escrito en
 * vps/ape_hls_generators.php, lo evalúa con distintos $cfg y muestra/asserta
 * la línea #EXT-X-STREAM-INF que el archivo produciría de verdad.
 *
 * Cobertura:
 *   B-10  GOLDEN RULE  → hvc1.* en STREAM-INF; hev1.* sólo en DASH/KODIPROP
 *   B-11  CMAF         → sin EXT-X-MAP apuntando a .m3u8
 *   B-10b clamp        → FRAME-RATE nunca por encima del techo del nivel (D-58)
 *
 * Uso:
 *   php.exe tools_t11_emission_proof.php              → evalúa el WORKING TREE (default)
 *   php.exe tools_t11_emission_proof.php <ruta.php>   → evalúa ese archivo
 *
 * [T29] Doble identidad del artefacto (ver REMEDIATION_LOG_T23.md §10):
 *   BLOB git (LF, es lo que viaja y lo que se compara con despliegues Linux)
 *       39 745 B · sha256 E8FC25137771F87D63EBD08059DC6D57A772C510ADC6AEED8777A1CE5D0AF72A
 *   CHECKOUT Windows (CRLF, sólo local)
 *       40 501 B · sha256 C2332FBD80131029102AF4D36E456951CA8BDCF7E310DC099C86EEA15175458B
 * Para probar el blob byte-exacto:
 *   git cat-file blob 4127f01771fa912ccc50a64421ba26e58c925c43 > /tmp/x.php   (redirección BINARIA)
 *   php.exe tools_t11_emission_proof.php /tmp/x.php
 * El script imprime SIEMPRE bytes + sha256 + CR/LF del archivo evaluado, para que la
 * identidad quede registrada en la salida y no dependa de lo que diga el reporte.
 *
 * Exit 0 = todas las aserciones pasan.
 */

$file = $argv[1] ?? (__DIR__ . '/../../../../../IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php');
if (!is_file($file)) { fwrite(STDERR, "NO EXISTE EL ARCHIVO: $file\n"); exit(2); }
$src  = file_get_contents($file);
if ($src === false) { fwrite(STDERR, "NO SE PUDO LEER $file\n"); exit(2); }

$fail = 0;
$pass = 0;
function ok(string $name, bool $cond, string $detail = ''): void {
    global $fail, $pass;
    if ($cond) { echo "PASS  $name" . ($detail ? "  [$detail]" : '') . "\n"; $pass++; }
    else       { echo "FAIL  $name" . ($detail ? "  [$detail]" : '') . "\n"; $fail++; }
}

/** Extrae el cuerpo de una función por balance de llaves desde su firma. */
function bodyOf(string $src, string $signature): ?string {
    $pos = strpos($src, $signature);
    if ($pos === false) return null;
    $open = strpos($src, '{', $pos);
    if ($open === false) return null;
    $depth = 0;
    for ($i = $open, $n = strlen($src); $i < $n; $i++) {
        if ($src[$i] === '{') $depth++;
        elseif ($src[$i] === '}') { $depth--; if ($depth === 0) return substr($src, $open, $i - $open + 1); }
    }
    return null;
}

/** Techo de fps por nivel declarado (espejo de la regla del archivo, para aserta r contra ella). */
function fpsCapFor(string $videoCodec): int {
    if (preg_match('/^hvc1\.2\.4\.L(?:153|123)\./i', $videoCodec)) return 60;
    return 30;
}

// [T29] Identidad del artefacto evaluado: se imprime SIEMPRE para que quede en la salida.
$isDefault = ($file === (__DIR__ . '/../../../../../IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php'));
$crCount   = substr_count($src, "\r");
$lfCount   = substr_count($src, "\n");
$identity  = ($crCount === 0) ? 'BLOB-LF (git; comparable con despliegues Linux)'
                              : 'CHECKOUT-CRLF (Windows; sólo local, NO comparable con el VPS)';

echo "== Archivo bajo prueba ==\n";
echo "  path   : " . $file . ($isDefault ? "   [default: working tree]" : "   [argv[1]]") . "\n";
echo "  bytes  : " . strlen($src) . "\n";
echo "  sha256 : " . hash('sha256', $src) . "\n";
echo "  lineas : CR=" . $crCount . " LF=" . $lfCount . "\n";
echo "  ident. : " . $identity . "\n";
echo "  nota   : el sha256 de arriba es el del archivo EVALUADO; para desplegar se usa el BLOB LF\n\n";

// ─────────────────────────────────────────────────────────────────────────────
// B-11 · el fallback NO declara CMAF
// ─────────────────────────────────────────────────────────────────────────────
$fallback = bodyOf($src, 'function serve_cmaf_m3u8_fallback(');
ok('B-11 · serve_cmaf_m3u8_fallback localizada', $fallback !== null);
$codeOnly = preg_replace('#^\s*//.*$#m', '', $fallback ?? '');   // sin comentarios

ok('B-11 · sin echo de EXT-X-MAP en el fallback (código, no comentarios)',
   stripos($codeOnly, 'EXT-X-MAP') === false);
ok('B-11 · sin mapa apuntando a .m3u8',
   !preg_match('/EXT-X-MAP[^;]*providerM3u8/i', $codeOnly));

// ─────────────────────────────────────────────────────────────────────────────
// B-11 · el EXT-X-MAP legítimo (init .m4s real) sigue intacto
// ─────────────────────────────────────────────────────────────────────────────
$fmp4 = bodyOf($src, 'function serve_hls_fmp4_ignition(');
ok('B-11 · EXT-X-MAP legítimo (.m4s) de serve_hls_fmp4_ignition intacto',
   $fmp4 !== null
   && strpos($fmp4, 'seg=init-stream0.m4s') !== false
   && strpos($fmp4, 'EXT-X-MAP:URI=') !== false);

// ─────────────────────────────────────────────────────────────────────────────
// B-10 · GOLDEN RULE: hev1 sólo fuera de CODECS=
// NOTA DE ALCANCE (T29): esta aserción cuenta 0 ocurrencias de `hev1.` en el bloque
// HLS/fallback (`serve_cmaf_m3u8_fallback`), que es donde se emite #EXT-X-STREAM-INF.
// NO exige 0 en todo el archivo: las 2 apariciones de la plantilla DASH MPD
// (`generate_dash_mpd`, <Representation codecs="hev1.…">) son LEGÍTIMAS — la GOLDEN
// RULE rige la emisión HLS, no DASH. Se asserta aparte que siguen ahí y son 2.
// ─────────────────────────────────────────────────────────────────────────────
$hev1InCode = preg_match('/hev1\./i', $codeOnly);
ok('B-10 · 0 ocurrencias de hev1.* en el bloque HLS/fallback (STREAM-INF)', $hev1InCode === 0);
ok('B-10 · CODECS usa hvc1.2.4.L153.B0', strpos($codeOnly, "'hvc1.2.4.L153.B0,mp4a.40.2'") !== false);

// DASH sí conserva hev1 (no se tocó): exactamente 2, por diseño del MPD
$dash = bodyOf($src, 'function generate_dash_mpd(');
$dashHev1 = ($dash === null) ? -1 : preg_match_all('/codecs="hev1\./', $dash);
ok('no-regresión · generate_dash_mpd (DASH) conserva exactamente 2 hev1 legítimos', $dashHev1 === 2, "hev1_en_dash=$dashHev1");

// ─────────────────────────────────────────────────────────────────────────────
// B-10b · el default 120 ya no existe y el clamp está presente
// ─────────────────────────────────────────────────────────────────────────────
ok('B-10b · el archivo NO contiene el default `?? 120`',
   preg_match('/\?\?\s*120/', $src) !== 1);
ok('B-10b · clamp por nivel presente ($fpsCap + min(...))',
   preg_match('/\$fpsCap\s*=\s*preg_match\(/', $src) === 1
   && preg_match('/\$fps\s*=\s*max\(1,\s*min\(/', $src) === 1);

// ─────────────────────────────────────────────────────────────────────────────
// Emisión real: extraer el bloque y ejecutarlo
// ─────────────────────────────────────────────────────────────────────────────
$start = strpos($fallback, '// EXT-X-STREAM-INF con los parámetros');
$end   = strpos($fallback, 'CODECS=\"{$codecs}\"\n";');
if ($start === false || $end === false) { fwrite(STDERR, "no se pudo aislar el bloque de emisión\n"); exit(3); }
$block = substr($fallback, $start, ($end - $start) + strlen('CODECS=\"{$codecs}\"\n";'));

echo "\n== Bloque de emisión extraído del archivo (verbatim) ==\n";
foreach (explode("\n", $block) as $l) { echo '  | ' . $l . "\n"; }

// esperado: [fps_esperado, etiqueta]
$cases = [
    // Sin $cfg: codec_primary indefinido -> rama AVC. Documenta el comportamiento real, no el deseado.
    'SIN cfg (codec_primary indefinido -> AVC)' => [[], 30, 'AVC'],
    'HEVC · sin cfg fps (default -> techo 60)'  => [['res' => '1920x1080', 'codec_primary' => 'HEVC', 'max_bw' => 12000000, 'bitrate' => 9000], 60, 'HEVC'],
    'HEVC · 3840x2160 · fps=60 explícito'       => [['res' => '3840x2160', 'fps' => 60,  'codec_primary' => 'HEVC', 'max_bw' => 15150000, 'bitrate' => 10100], 60, 'HEVC'],
    'HEVC · 1920x1080 · fps=120 (clampea)'      => [['res' => '1920x1080', 'fps' => 120, 'codec_primary' => 'HEVC', 'max_bw' => 12000000, 'bitrate' => 9000], 60, 'HEVC'],
    'HEVC · 1920x1080 · fps=30 (respeta)'       => [['res' => '1920x1080', 'fps' => 30,  'codec_primary' => 'HEVC', 'max_bw' => 9000000, 'bitrate' => 6500], 30, 'HEVC'],
    'AVC  · 1920x1080 · sin fps (techo 30)'     => [['res' => '1920x1080', 'codec_primary' => 'AVC', 'max_bw' => 9000000, 'bitrate' => 6500], 30, 'AVC'],
    'AVC  · 1920x1080 · fps=120 (clampea)'      => [['res' => '1920x1080', 'fps' => 120, 'codec_primary' => 'AVC', 'max_bw' => 9000000, 'bitrate' => 6500], 30, 'AVC'],
];

echo "\n== Salida real por caso ==\n";
$emitted = [];
foreach ($cases as $label => [$cfg, $fpsWant, $family]) {
    ob_start();
    $fps = null; $fpsCap = null; $codecs = null; $bw = null; $avgBw = null; $avgBwBps = null; $resolution = null;
    eval('?>' . "<?php\n" . $block);
    $out = trim(ob_get_clean());
    $emitted[$label] = [$out, $fpsWant, $family];
    echo "  [$label]\n    " . $out . "\n";
}

// ─────────────────────────────────────────────────────────────────────────────
// Aserciones sobre la salida real (incluye el clamp B-10b)
// ─────────────────────────────────────────────────────────────────────────────
echo "\n== Aserciones sobre la salida emitida ==\n";
foreach ($emitted as $label => [$line, $fpsWant, $family]) {
    $video = preg_match('/CODECS="([^",]+)/', $line, $m) ? $m[1] : '';
    $fps   = preg_match('/FRAME-RATE=([0-9.]+)/', $line, $m2) ? (float)$m2[1] : -1;
    $res   = preg_match('/RESOLUTION=([0-9]+x[0-9]+)/', $line, $m3) ? $m3[1] : '';
    $cap   = fpsCapFor($video);

    ok("sin hev1 en la línea STREAM-INF · $label", stripos($line, 'hev1') === false,
       $line === '' ? 'VACÍA' : substr($line, 0, 58) . '…');
    ok("familia esperada ($family) en CODECS · $label",
       ($family === 'HEVC' && strpos($video, 'hvc1.') === 0) || ($family === 'AVC' && strpos($video, 'avc1.') === 0),
       "video=$video");
    ok("CODECS parseable como RFC 6381 · $label", preg_match('/^(hvc1|avc1)\.[0-9A-Fa-f]+(\.[0-9A-Za-z]+)*$/', $video) === 1, $video);
    ok("B-10b · FRAME-RATE == $fpsWant · $label", abs($fps - $fpsWant) < 0.001, "fps=$fps");
    ok("B-10b · FRAME-RATE <= techo del nivel ($cap) · $label", $fps > 0 && $fps <= $cap, "fps=$fps cap=$cap");
    ok("coherencia RESOLUTION declarada · $label", preg_match('/^\d{3,5}x\d{3,5}$/', $res) === 1, "res=$res");
}

// ─────────────────────────────────────────────────────────────────────────────
// Gate honesto multilínea: STREAM-INF + 3 líneas siguientes sin hev1.
// (El grep de una sola línea del contrato es vacuous: STREAM-INF y CODECS
//  viven en líneas distintas, así que `.` nunca cruza el salto.)
// ─────────────────────────────────────────────────────────────────────────────
echo "\n== Gate honesto multilínea (STREAM-INF + 3 líneas siguientes) ==\n";
$lines = explode("\n", $src);
$hits = 0;
foreach ($lines as $idx => $ln) {
    if (strpos($ln, 'EXT-X-STREAM-INF') === false) continue;
    $window = implode("\n", array_slice($lines, $idx, 4));   // esta + 3 siguientes
    if (preg_match('/hev1\./', $window)) { $hits++; echo "  HIT linea " . ($idx + 1) . ": " . trim($window) . "\n"; }
}
ok('multilínea · 0 ventanas STREAM-INF(+3) con hev1', $hits === 0, "ventanas_con_hev1=$hits");

echo "\n== Resultado ==\n";
printf("PASS=%d  FAIL=%d\n", $pass, $fail);
echo $fail === 0 ? "TODAS LAS ASERCIONES PASAN\n" : "FALLOS: $fail\n";
exit($fail === 0 ? 0 : 1);
