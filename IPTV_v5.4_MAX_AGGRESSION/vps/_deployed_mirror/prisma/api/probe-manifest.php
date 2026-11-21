<?php
/**
 * probe-manifest.php — PROBE SERVER-SIDE DE UN CANAL (sustituye al probe del navegador)
 *
 * POR QUE EXISTE
 *   Medido 2026-11-15: el proveedor no manda Access-Control-Allow-Origin y el
 *   navegador no puede poner User-Agent en fetch(). El probe de
 *   ape-quality-prober.js (mode:'cors') falla en el 100% de los canales: cero
 *   canales verificados de 21.224, y el clasificador cae siempre en heuristicas.
 *
 *   Un endpoint que acepte una URL arbitraria seria SSRF. Este acepta un CHANNEL ID
 *   y resuelve la URL contra /var/lib/ape/ch-url-index.json, un indice construido
 *   SOLO con las URLs de nuestras listas (ape-build-ch-index.sh). Si el id no esta
 *   en el indice, no se hace ninguna peticion.
 *
 * USO
 *   GET  ?ch=31664                     un canal
 *   GET  ?ch=31664,1256710,3           varios (maximo 40)
 *   GET  ?health=1                     estado del indice
 *
 * RESPUESTA (un objeto, o {ok, results:[...]} si son varios)
 *   {
 *     ok: true,
 *     channelId: "31664",
 *     kind: "master" | "media",
 *     resolution: {width, height} | null,
 *     frameRate: 60 | null,
 *     codecsFull: "hvc1.2.4.L153.B0,mp4a.40.2" | null,
 *     videoCodec: "hvc1" | "avc1" | ... | null,
 *     audioCodec: "mp4a.40.2" | null,
 *     videoRange: "PQ"|"HLG"|"SDR"|null,
 *     bandwidth: 25000000 | null,
 *     avgBandwidth: 20000000 | null,
 *     supplementalCodecs: null,
 *     colorPrimaries / transferCharacteristics / matrixCoefficients: int|null,
 *     hdcpLevel: "TYPE-1"|null,
 *     observedFields: [...],
 *     provenance: { schema:"ape.probe-provenance/1", scope:"channel_url_server",
 *                   channelId, upstreamHost, requestedUrl, responseUrl,
 *                   observedFields, measuredServerSide:true, measuredAt },
 *     verified: true|false,          // true solo si se leyo un master y se obtuvo RESOLUTION
 *     verifiedReason: "...",
 *     httpStatus: 200|302, elapsedMs, error: null|"..."
 *   }
 *
 * GARANTIAS
 *   - Sin SSRF: la URL sale del indice, nunca del cliente.
 *   - UA de player (el proveedor bloquea sin el).
 *   - No se devuelven las URLs del proveedor por defecto (se ocultan las query
 *     sensibles); solo el host.
 *   - Si el manifest es una lista de medios (sin variantes), se dice: kind=media,
 *     y verified=false con la razon, porque de ahi no se puede sacar RESOLUTION.
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-APE-Endpoint: probe-manifest-v1');

const INDEX_PATH = '/var/lib/ape/ch-url-index.json';
const MAX_IDS = 40;
const TIMEOUT_S = 8;
const CONNECT_TIMEOUT_S = 4;
const PLAYER_UA = 'OTT Navigator/1.7.3.3';

function fail(int $code, string $msg): void {
    http_response_code($code);
    echo json_encode(['ok' => false, 'error' => $msg, 'measured' => false], JSON_UNESCAPED_SLASHES);
    exit;
}

function loadIndex(): array {
    if (!is_readable(INDEX_PATH)) fail(503, 'indice no disponible: ' . INDEX_PATH . ' (correr ape-build-ch-index.sh)');
    $raw = @file_get_contents(INDEX_PATH);
    if ($raw === false || $raw === '') fail(503, 'indice vacio o ilegible');
    $j = json_decode($raw, true);
    if (!is_array($j) || !isset($j['urls']) || !is_array($j['urls'])) fail(503, 'indice con formato invalido');
    return $j;
}

function safeHost(string $url): string {
    $h = parse_url($url, PHP_URL_HOST);
    return is_string($h) ? $h : 'unknown';
}

/** Saca los atributos de un master playlist. Devuelve la variante de mayor BANDWIDTH. */
function parseMaster(string $text): ?array {
    $best = null;
    $lines = preg_split("/\r\n|\n|\r/", $text);
    foreach ($lines as $ln) {
        if (stripos($ln, '#EXT-X-STREAM-INF:') !== 0) continue;
        $attrs = substr($ln, strlen('#EXT-X-STREAM-INF:'));
        $bw = preg_match('/\bBANDWIDTH=(\d+)/', $attrs, $m) ? (int)$m[1] : 0;
        if ($best !== null && $bw <= $best['_bw']) continue;
        $best = [
            '_bw' => $bw,
            'bandwidth' => $bw ?: null,
            'avgBandwidth' => preg_match('/\bAVERAGE-BANDWIDTH=(\d+)/', $attrs, $m) ? (int)$m[1] : null,
            'codecsFull' => preg_match('/\bCODECS="([^"]+)"/', $attrs, $m) ? $m[1] : null,
            'videoRange' => preg_match('/\bVIDEO-RANGE=([A-Za-z0-9-]+)/', $attrs, $m) ? $m[1] : null,
            'hdcpLevel' => preg_match('/\bHDCP-LEVEL=([A-Za-z0-9-]+)/', $attrs, $m) ? $m[1] : null,
            'supplementalCodecs' => preg_match('/\bSUPPLEMENTAL-CODECS="([^"]+)"/', $attrs, $m) ? $m[1] : null,
            'colorPrimaries' => preg_match('/\bCOLOR-PRIMARIES="?(\d+)"?/', $attrs, $m) ? (int)$m[1] : null,
            'transferCharacteristics' => preg_match('/\bTRANSFER-CHARACTERISTICS="?(\d+)"?/', $attrs, $m) ? (int)$m[1] : null,
            'matrixCoefficients' => preg_match('/\bMATRIX-COEFFICIENTS="?(\d+)"?/', $attrs, $m) ? (int)$m[1] : null,
            'frameRate' => preg_match('/\bFRAME-RATE=([\d.]+)/', $attrs, $m) ? (float)$m[1] : null,
            'resolution' => null,
        ];
        if (preg_match('/\bRESOLUTION=(\d+)x(\d+)/', $attrs, $m)) {
            $best['resolution'] = ['width' => (int)$m[1], 'height' => (int)$m[2]];
        }
    }
    if ($best === null) return null;
    unset($best['_bw']);
    return $best;
}

/** Deriva el codec de video del primer elemento de CODECS. */
function videoCodecFrom(?string $codecs): ?string {
    if (!$codecs) return null;
    foreach (explode(',', $codecs) as $c) {
        $c = trim($c);
        if ($c === '') continue;
        if (preg_match('/^(hvc1|hev1|avc1|av01|vp09|dvh1|dvhe|vvc1)/i', $c, $m)) return strtolower($m[1]);
    }
    return null;
}

function audioCodecFrom(?string $codecs): ?string {
    if (!$codecs) return null;
    foreach (explode(',', $codecs) as $c) {
        $c = trim($c);
        if (preg_match('/^(mp4a|ac-3|ec-3|opus|flac|dtsc)/i', $c)) return strtolower($c);
    }
    return null;
}

function observedFields(array $r): array {
    $keys = ['bandwidth','avgBandwidth','videoCodec','audioCodec','codecsFull','resolution',
             'frameRate','videoRange','hdcpLevel','supplementalCodecs','colorPrimaries',
             'transferCharacteristics','matrixCoefficients'];
    $out = [];
    foreach ($keys as $k) {
        $v = $r[$k] ?? null;
        if ($v !== null && $v !== '' && $v !== 0) $out[] = $k;
    }
    return $out;
}

function probeOne(string $id, string $url): array {
    $t0 = microtime(true);
    $doc = [
        'ok' => true,
        'channelId' => $id,
        'kind' => null,
        'resolution' => null,
        'frameRate' => null,
        'codecsFull' => null,
        'videoCodec' => null,
        'audioCodec' => null,
        'videoRange' => null,
        'bandwidth' => null,
        'avgBandwidth' => null,
        'supplementalCodecs' => null,
        'colorPrimaries' => null,
        'transferCharacteristics' => null,
        'matrixCoefficients' => null,
        'hdcpLevel' => null,
        'verified' => false,
        'verifiedReason' => null,
        'httpStatus' => null,
        'elapsedMs' => null,
        'error' => null,
    ];

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 5,
        CURLOPT_TIMEOUT => TIMEOUT_S,
        CURLOPT_CONNECTTIMEOUT => CONNECT_TIMEOUT_S,
        CURLOPT_USERAGENT => PLAYER_UA,
        CURLOPT_HTTPHEADER => ['Accept: */*', 'Accept-Encoding: identity'],
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_ENCODING => '',
    ]);
    $body = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $finalUrl = (string)curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
    $err = curl_error($ch);
    curl_close($ch);

    $doc['httpStatus'] = $status ?: null;

    if ($body === false || $err !== '') {
        $doc['ok'] = false;
        $doc['error'] = 'FETCH_FAILED: ' . substr($err, 0, 120);
        $doc['verifiedReason'] = 'no se pudo leer el manifest';
        $doc['elapsedMs'] = (int)round((microtime(true) - $t0) * 1000);
        $doc['provenance'] = buildProvenance($id, $url, $finalUrl ?: $url, [], false);
        return $doc;
    }
    if ($status < 200 || $status >= 400) {
        $doc['ok'] = false;
        $doc['error'] = 'HTTP ' . $status;
        $doc['verifiedReason'] = 'el proveedor no entrego el manifest';
        $doc['elapsedMs'] = (int)round((microtime(true) - $t0) * 1000);
        $doc['provenance'] = buildProvenance($id, $url, $finalUrl ?: $url, [], false);
        return $doc;
    }
    $text = (string)$body;
    if (stripos($text, '#EXTM3U') === false) {
        $doc['ok'] = false;
        $doc['error'] = 'NOT_HLS';
        $doc['verifiedReason'] = 'la respuesta no es un manifest HLS';
        $doc['elapsedMs'] = (int)round((microtime(true) - $t0) * 1000);
        $doc['provenance'] = buildProvenance($id, $url, $finalUrl ?: $url, [], false);
        return $doc;
    }

    $isMaster = stripos($text, '#EXT-X-STREAM-INF:') !== false;
    $doc['kind'] = $isMaster ? 'master' : 'media';

    if ($isMaster) {
        $v = parseMaster($text);
        if ($v !== null) {
            foreach ($v as $k => $val) $doc[$k] = $val;
            $doc['videoCodec'] = videoCodecFrom($doc['codecsFull']);
            $doc['audioCodec'] = audioCodecFrom($doc['codecsFull']);
            if ($doc['resolution'] !== null && isset($doc['resolution']['height'])) {
                $doc['verified'] = true;
                $doc['verifiedReason'] = 'master leido: RESOLUTION=' . $doc['resolution']['width'] . 'x' . $doc['resolution']['height'];
            } else {
                $doc['verifiedReason'] = 'master sin RESOLUTION en ninguna variante';
            }
        } else {
            $doc['verifiedReason'] = 'master sin EXT-X-STREAM-INF parseable';
        }
    } else {
        $doc['verifiedReason'] = 'lista de medios: no declara RESOLUTION (haría falta ffprobe sobre un segmento)';
    }

    $doc['elapsedMs'] = (int)round((microtime(true) - $t0) * 1000);
    $doc['provenance'] = buildProvenance($id, $url, $finalUrl ?: $url, observedFields($doc), $doc['verified']);
    return $doc;
}

function buildProvenance(string $id, string $url, string $finalUrl, array $fields, bool $verified): array {
    return [
        'schema' => 'ape.probe-provenance/1',
        'scope' => 'channel_url_server',
        'channelId' => $id,
        'upstreamHost' => safeHost($url),
        // La URL NO se expone con query: solo esquema+host+ruta, sin credenciales.
        'requestedUrl' => preg_replace('/\?.*$/', '', $url),
        'responseUrl' => preg_replace('/\?.*$/', '', $finalUrl),
        'observedFields' => $fields,
        'measuredServerSide' => true,
        'verified' => $verified,
        'measuredAt' => gmdate('Y-m-d\TH:i:s\Z'),
    ];
}

// ── entrada ──────────────────────────────────────────────────────────────────
if (isset($_GET['health'])) {
    $idx = loadIndex();
    echo json_encode([
        'ok' => true,
        'index' => ['path' => INDEX_PATH, 'count' => $idx['count'] ?? null,
                    'built' => $idx['built'] ?? null, 'source' => $idx['source'] ?? null],
        'limits' => ['maxIds' => MAX_IDS, 'timeoutS' => TIMEOUT_S, 'ua' => PLAYER_UA],
    ], JSON_UNESCAPED_SLASHES);
    exit;
}

$raw = isset($_GET['ch']) ? trim((string)$_GET['ch']) : '';
if ($raw === '') fail(400, 'falta ?ch=<channel_id> (o ?health=1)');

$ids = array_values(array_filter(array_map('trim', explode(',', $raw)), fn($s) => $s !== ''));
if (count($ids) === 0) fail(400, 'sin ids validos');
if (count($ids) > MAX_IDS) fail(400, 'demasiados ids: maximo ' . MAX_IDS);

$idx = loadIndex();
$urls = $idx['urls'];

$results = [];
foreach ($ids as $id) {
    if (!preg_match('/^[A-Za-z0-9_.-]{1,80}$/', $id)) {
        $results[] = ['ok' => false, 'channelId' => $id, 'error' => 'id invalido',
                      'verified' => false, 'verifiedReason' => 'formato de id no permitido'];
        continue;
    }
    if (!isset($urls[$id]) || !is_string($urls[$id]) || $urls[$id] === '') {
        $results[] = ['ok' => false, 'channelId' => $id, 'error' => 'ID_NOT_IN_INDEX',
                      'verified' => false,
                      'verifiedReason' => 'el canal no esta en el indice: no se hace ninguna peticion (SSRF guard)'];
        continue;
    }
    $results[] = probeOne($id, $urls[$id]);
}

if (count($results) === 1) {
    echo json_encode($results[0], JSON_UNESCAPED_SLASHES);
} else {
    $ok = 0; $ver = 0;
    foreach ($results as $r) { if (!empty($r['ok'])) $ok++; if (!empty($r['verified'])) $ver++; }
    echo json_encode([
        'ok' => true,
        'requested' => count($results),
        'fetched' => $ok,
        'verified' => $ver,
        'results' => $results,
    ], JSON_UNESCAPED_SLASHES);
}
