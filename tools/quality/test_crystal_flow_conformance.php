#!/usr/bin/env php
<?php
declare(strict_types=1);

/**
 * Conformidad APE CRYSTAL FLOW — estación 2 (CABLEADO) contra las estaciones
 * 1, 3, 4, 5 y el LAB calibrado.
 *
 * No crea motores ni duplica suites: ejecuta el motor PHP REAL sobre una
 * fixture sintética, inspecciona el constructor CMAF existente y lee los
 * contratos/artefactos ya versionados. No usa red, VPS, APK instalada ni
 * listas privadas.
 *
 * La comprobación de cabeceras no transportables es deliberada: el contrato
 * histórico dice «100 % /pulse/», pero una URI con pipes o metadata HTTP de
 * canal no puede viajar por pulse sin perder headers. El cableado la deja
 * directa y la declara en sin_id; esta suite exige esa verdad, no un 100 %
 * decorativo.
 */

const FLOW_BASE = 'https://flow.example.test';
const FLOW_DEVICE = 'firetv-test';

$root = dirname(__DIR__, 2);
$passes = 0;
$fails = 0;
$skips = 0;

function t(string $name, bool $condition, string $detail = ''): void
{
    global $passes, $fails;
    if ($condition) {
        $passes++;
        echo "PASS  $name" . ($detail !== '' ? "  ($detail)" : '') . "\n";
        return;
    }
    $fails++;
    echo "FAIL  $name" . ($detail !== '' ? "  ($detail)" : '') . "\n";
}

function skip(string $name, string $reason): void
{
    global $skips;
    $skips++;
    echo "SKIP  $name  ($reason)\n";
}

/** Lee un archivo versionado aunque el sparse-checkout no lo materialice. */
function flowRead(string $root, string $relative): ?string
{
    $path = $root . '/' . $relative;
    if (is_file($path)) {
        $data = @file_get_contents($path);
        return $data === false ? null : $data;
    }
    $cmd = 'git -C ' . escapeshellarg($root) . ' show ' . escapeshellarg('HEAD:' . $relative) . ' 2>/dev/null';
    $data = shell_exec($cmd);
    return is_string($data) && $data !== '' ? $data : null;
}

function flowTracked(string $root, string $relative): bool
{
    $cmd = 'git -C ' . escapeshellarg($root) . ' ls-files --error-unmatch '
        . escapeshellarg($relative) . ' >/dev/null 2>&1';
    exec($cmd, $unused, $rc);
    return $rc === 0;
}

function runEngine(string $engine, string $input, string $output): array
{
    $args = [PHP_BINARY, $engine, $input, $output, FLOW_BASE, FLOW_DEVICE];
    $cmd = implode(' ', array_map('escapeshellarg', $args));
    $spec = [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
    $proc = proc_open($cmd, $spec, $pipes);
    if (!is_resource($proc)) {
        throw new RuntimeException('no se pudo iniciar el motor');
    }
    fclose($pipes[0]);
    $stdout = (string)stream_get_contents($pipes[1]);
    $stderr = (string)stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    $rc = proc_close($proc);

    $receipt = null;
    foreach (preg_split('/\R/', $stdout) ?: [] as $line) {
        if (str_starts_with($line, 'APE_CABLEAR_RESULT=')) {
            $decoded = json_decode(substr($line, strlen('APE_CABLEAR_RESULT=')), true);
            if (is_array($decoded)) {
                $receipt = $decoded;
            }
        }
    }
    return ['rc' => $rc, 'stdout' => $stdout, 'stderr' => $stderr, 'receipt' => $receipt];
}

$tmp = sys_get_temp_dir() . '/ape-flow-' . getmypid() . '-' . bin2hex(random_bytes(4));
if (!@mkdir($tmp, 0700, true)) {
    fwrite(STDERR, "No se pudo crear el directorio temporal\n");
    exit(1);
}
register_shutdown_function(static function () use ($tmp): void {
    foreach (glob($tmp . '/*') ?: [] as $file) {
        @unlink($file);
    }
    @rmdir($tmp);
});

$fixture = <<<'M3U'
#EXTM3U
#EXT-X-APE-CHANNELS:3
#EXT-X-VERSION:9
#EXTINF:-1 tvg-id="canal-avc" tvg-name="AVC",Canal AVC
https://provider.example/live/avc/index.m3u8
#EXTINF:-1 tvg-id="canal-hevc" tvg-name="HEVC",Canal HEVC Crystal
#EXT-X-APE-CODEC-REAL:hvc1.2.4.L186.B0
#EXT-X-APE-CRYSTAL-UHD:REQUESTED
https://provider.example/live/hevc/index.m3u8
#EXTINF:-1,Canal con headers de canal
#EXTVLCOPT:http-user-agent=PlayerX
https://provider.example/live/headers/index.m3u8|User-Agent=PlayerX&Referer=https://provider.example/
M3U;

/* Forma real de una lista ya cableada: el u= codificado supera 2000
 * caracteres. Debe reconocerse como ALREADY, no como sin_id. */
$longSource = 'https://provider.example/live/long/index.m3u8?token=' . str_repeat('A', 2100);
$alreadyWrapped = FLOW_BASE . '/pulse/987654321.m3u8?u=' . rawurlencode($longSource) . '&d=' . FLOW_DEVICE;
$fixture .= "#EXTINF:-1,Canal ya cableado\n" . $alreadyWrapped . "\n";

$input = $tmp . '/entrada.m3u8';
$output = $tmp . '/salida.m3u8';
$second = $tmp . '/segunda.m3u8';
file_put_contents($input, $fixture);
$before = hash_file('sha256', $input);

$engine = $root . '/tools/ops/ape-cablear-lista.php';
$first = runEngine($engine, $input, $output);

t('el motor real termina con rc=0', $first['rc'] === 0, 'rc=' . $first['rc']);
t('el recibo es JSON único y parseable', is_array($first['receipt']));
$receipt = $first['receipt'] ?? [];

t('clasifica el catálogo como catalog_m3u8', ($receipt['tipo_lista'] ?? '') === 'catalog_m3u8');
t('conserva los 4 canales', (int)($receipt['canales'] ?? -1) === 4, 'canales=' . ($receipt['canales'] ?? 'N/D'));
t('envuelve sólo las 2 URI elegibles', (int)($receipt['envueltos'] ?? -1) === 2, 'envueltos=' . ($receipt['envueltos'] ?? 'N/D'));
t('reconoce la URI ya cableada como ya_estaban', (int)($receipt['ya_estaban'] ?? -1) === 1, 'ya_estaban=' . ($receipt['ya_estaban'] ?? 'N/D'));
t('declara la URI con headers como sin_id', (int)($receipt['sin_id'] ?? -1) === 1, 'sin_id=' . ($receipt['sin_id'] ?? 'N/D'));
t(
    'el balance canales = envueltos + ya_estaban + sin_id',
    (int)($receipt['canales'] ?? -2) === (int)($receipt['envueltos'] ?? 0)
        + (int)($receipt['ya_estaban'] ?? 0) + (int)($receipt['sin_id'] ?? 0)
);

$outBytes = is_file($output) ? (string)file_get_contents($output) : '';
$outLines = array_values(array_filter(preg_split('/\R/', $outBytes) ?: [], static fn(string $l): bool => $l !== ''));
$urlLines = array_values(array_filter($outLines, static fn(string $l): bool => str_starts_with($l, 'http')));
$inputMetadata = count(array_filter(
    preg_split('/\R/', $fixture) ?: [],
    static fn(string $l): bool => $l !== '' && !str_starts_with($l, 'http')
));

t('la salida conserva exactamente 4 líneas URL', count($urlLines) === 4, 'urls=' . count($urlLines));
$wrapped = array_values(array_filter(
    $urlLines,
    static fn(string $l): bool => preg_match('#^' . preg_quote(FLOW_BASE, '#') . '/pulse/\d+\.m3u8\?u=.*&id=#', $l) === 1
));
t('las 2 URI elegibles usan /pulse/<id>.m3u8?u=', count($wrapped) === 2, 'wrapped=' . count($wrapped));
t(
    'cada URL envuelta lleva d= e id= sin perder u=',
    count($wrapped) === 2 && count(array_filter(
        $wrapped,
        static fn(string $l): bool => str_contains($l, '&d=') && str_contains($l, '&id=') && str_contains($l, '?u=')
    )) === 2
);
$direct = array_values(array_filter(
    $urlLines,
    static fn(string $l): bool => str_contains($l, 'provider.example/live/headers/index.m3u8')
));
t('la URI no transportable queda directa y conserva sus headers', count($direct) === 1
    && str_contains($direct[0] ?? '', '|User-Agent=PlayerX&Referer=https://provider.example/'));
t('la URL propia larga se conserva verbatim', str_contains($outBytes, $alreadyWrapped . "\n"));
t(
    'no se inventan segmentos ni líneas de canal',
    count($outLines) - count($urlLines) === $inputMetadata,
    'metadata=' . (count($outLines) - count($urlLines)) . '/' . $inputMetadata
);
t('preserva el string HEVC Main 10 solicitado', str_contains($outBytes, '#EXT-X-APE-CODEC-REAL:hvc1.2.4.L186.B0'));
t('preserva la solicitud Crystal UHD', str_contains($outBytes, '#EXT-X-APE-CRYSTAL-UHD:REQUESTED'));
t('no modifica la fuente original', hash_file('sha256', $input) === $before);

$again = runEngine($engine, $output, $second);
$r2 = $again['receipt'] ?? [];
t('la segunda pasada termina con rc=0', $again['rc'] === 0, 'rc=' . $again['rc']);
t('la segunda pasada no reenvuelve', (int)($r2['envueltos'] ?? -1) === 0, 'envueltos=' . ($r2['envueltos'] ?? 'N/D'));
t('mantiene la URI directa como sin_id', (int)($r2['sin_id'] ?? -1) === 1);
t('es idempotente byte a byte', is_file($second) && hash_file('sha256', $second) === hash_file('sha256', $output));

// ── Estación 2 → constructor CMAF (copia, sin recodificar) ──────────────────
define('CMAF_WORKER_LIBRARY_ONLY', true);
require_once $root . '/IPTV_v5.4_MAX_AGGRESSION/vps/cmaf_worker.php';

foreach ([2, 4, 6] as $duration) {
    $args = cmafWorkerCommandArgs([
        'manifest_path' => $tmp . '/manifest-' . $duration . '.mpd',
        'codec_tag' => 'hvc1',
        'seg_dur' => $duration,
    ]);
    $joined = implode(' ', $args);
    $segIndex = array_search('-seg_duration', $args, true);
    $segValue = $segIndex !== false ? ($args[$segIndex + 1] ?? '') : '';
    t("CMAF $duration s usa -seg_duration $duration", $segValue === (string)$duration, 'valor=' . $segValue);
    t("CMAF $duration s copia vídeo y audio", str_contains($joined, '-c:v copy') && str_contains($joined, '-c:a copy'));
    t("CMAF $duration s declara +cmaf", str_contains($joined, 'movflags=+cmaf'));
    t(
        "CMAF $duration s no recodifica ni filtra",
        !preg_match('/libx264|libx265|-vf |-filter:v|-b:v|-maxrate|-bufsize/', $joined)
    );
}

// ── Contrato APE CRYSTAL FLOW ───────────────────────────────────────────────
$contractRaw = flowRead($root, 'contracts/ape_crystal_flow_operativa.json');
if ($contractRaw === null) {
    skip('contrato APE CRYSTAL FLOW', 'no materializado ni disponible en Git');
} else {
    $contract = json_decode($contractRaw, true);
    t('el contrato APE CRYSTAL FLOW es JSON válido', is_array($contract));
    $stations = is_array($contract['estaciones'] ?? null) ? $contract['estaciones'] : [];
    t('el contrato declara 5 estaciones', count($stations) === 5, 'estaciones=' . count($stations));
    $names = array_map(static fn(array $s): string => (string)($s['nombre'] ?? ''), $stations);
    $names = array_map(static fn(string $n): string => $n === 'MEDICION' ? 'MEDICIÓN' : $n, $names);
    t(
        'incluye GENERADOR, CABLEADO, AGENTE, SHIM y MEDICIÓN',
        $names === ['GENERADOR', 'CABLEADO', 'AGENTE', 'SHIM', 'MEDICIÓN'],
        implode(' → ', $names)
    );
    $cableado = $stations[1] ?? [];
    $invariants = implode(' | ', is_array($cableado['invariantes'] ?? null) ? $cableado['invariantes'] : []);
    t('la estación CABLEADO exige /pulse/', str_contains($invariants, '/pulse/'));
    t('la estación CABLEADO exige un solo slot', stripos($invariants, 'un solo slot') !== false);
    t(
        'el contrato conserva la ley anti-degradación',
        str_contains(json_encode($contract['reglas_globales'] ?? [], JSON_UNESCAPED_UNICODE), 'Anti-Degradation')
    );
    t('el contrato declara sus límites', !empty($contract['lo_que_este_contrato_no_puede_garantizar']));
}

// ── LAB calibrado ───────────────────────────────────────────────────────────
$labRaw = flowRead($root, 'IPTV_v5.4_MAX_AGGRESSION/tools/labs/LAB_CALIBRATED_BULLETPROOF_22.6.0-CRYSTAL-4K-UHD.json');
if ($labRaw === null) {
    skip('LAB calibrado', 'no materializado ni disponible en Git');
} else {
    $lab = json_decode($labRaw, true);
    t('el LAB calibrado es JSON válido', is_array($lab));
    $profiles = is_array($lab['profiles_calibrated'] ?? null) ? $lab['profiles_calibrated'] : [];
    t('el LAB declara perfiles calibrados', count($profiles) >= 1, 'perfiles=' . count($profiles));
    $durations = [];
    foreach ($profiles as $profile) {
        $value = $profile['settings']['segment_duration_s'] ?? null;
        if (is_numeric($value)) {
            $durations[] = (int)$value;
        }
    }
    t(
        'el LAB declara segmentos de 2, 4 o 6 s',
        count(array_intersect($durations, [2, 4, 6])) > 0,
        'duraciones=' . implode(',', array_values(array_unique($durations)))
    );
    t('el LAB se identifica como bulletproof', array_key_exists('bulletproof', $lab) || array_key_exists('lab_version', $lab));
}

// ── APK y SHIM: presencia y límites declarados ──────────────────────────────
$shimManifestPath = 'IPTV_v5.4_MAX_AGGRESSION/android/ape-crystal-agent/shim/src/main/AndroidManifest.xml';
$appManifestPath = 'IPTV_v5.4_MAX_AGGRESSION/android/ape-crystal-agent/app/src/main/AndroidManifest.xml';
t('existe el manifiesto del SHIM', flowTracked($root, $shimManifestPath));
t('existe el manifiesto de la APK', flowTracked($root, $appManifestPath));

$shimManifest = flowRead($root, $shimManifestPath) ?? '';
$shimXml = preg_replace('/<!--.*?-->/s', '', $shimManifest) ?? $shimManifest;
t('el SHIM no declara Activity ni launcher', !str_contains($shimXml, '<activity') && !str_contains($shimXml, 'LAUNCHER'));
t('el SHIM declara sus services', str_contains($shimManifest, '<service'));

$appManifest = flowRead($root, $appManifestPath) ?? '';
t('la APK declara permiso INTERNET', str_contains($appManifest, 'android.permission.INTERNET'));

// ── Enmienda documentada: 100 % elegible, no 100 % decorativo ───────────────
$docPath = 'docs/architecture/APE_CRYSTAL_FLOW_CABLEADO_INTEGRACION.md';
$doc = flowRead($root, $docPath);
if ($doc === null) {
    skip('documento de integración del cableado', 'no presente en este árbol');
} else {
    t('la integración documenta sin_id para headers no transportables', str_contains($doc, 'sin_id'));
    t('la integración no promete despliegue en APK/VPS', str_contains($doc, 'no desplegado') || str_contains($doc, 'No desplegado'));
    t('la integración declara la ausencia de recompresión', stripos($doc, 'recompresión') !== false);
}

echo "\nRESUMEN  PASS=$passes FAIL=$fails SKIP=$skips\n";
exit($fails === 0 ? 0 : 1);
t('la segunda pasada reconoce las 3 URI ya cableadas', (int)($r2['ya_estaban'] ?? -1) === 3, 'ya_estaban=' . ($r2['ya_estaban'] ?? 'N/D'));
