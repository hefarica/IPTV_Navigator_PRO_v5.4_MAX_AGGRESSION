<?php
/**
 * ATOMIC PROBE PROXY v1.0 — server-side single-call resolution detector
 * =====================================================================
 * Solves CORS: browser can't fetch cross-origin IPTV streams directly.
 * This endpoint does the Range fetch server-side (no CORS) and returns
 * either the raw bytes (base64 for binary TS) or parsed HLS master.
 *
 * Usage:
 *   POST /atomic_probe.php
 *   body: { "urls": ["http://server/live/u/p/123.m3u8", ...] }
 *   response: [
 *     { "url": "...", "contentType": "...", "status": 200,
 *       "kind": "hls" | "ts" | "unknown",
 *       "text": "#EXTM3U..." (if hls),
 *       "b64":  "..."        (if ts, max 128KB),
 *       "error": null | "message"
 *     }, ...
 *   ]
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

$RANGE_BYTES       = 131072;   // 128 KB
$CONNECT_TIMEOUT_S = 3;
$TOTAL_TIMEOUT_S   = 6;
$MAX_URLS_PER_CALL = 64;       // batch cap
$MAX_CONCURRENT    = 16;

$raw  = file_get_contents('php://input');
$data = json_decode($raw, true);
if (!is_array($data) || empty($data['urls']) || !is_array($data['urls'])) {
    http_response_code(400);
    echo json_encode(['error' => 'expected {"urls":[...]}']);
    exit;
}

$urls = array_slice(array_values(array_filter($data['urls'], 'is_string')), 0, $MAX_URLS_PER_CALL);
if (!$urls) { echo json_encode([]); exit; }

$mh = curl_multi_init();
$handles = [];
foreach ($urls as $i => $url) {
    // Basic URL sanity
    if (!preg_match('#^https?://#i', $url)) {
        $handles[$i] = ['skip' => ['url'=>$url,'error'=>'bad-scheme','kind'=>'unknown']];
        continue;
    }
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL              => $url,
        CURLOPT_RETURNTRANSFER   => true,
        CURLOPT_HEADER           => true,
        CURLOPT_NOBODY           => false,
        CURLOPT_FOLLOWLOCATION   => true,
        CURLOPT_MAXREDIRS        => 3,
        CURLOPT_SSL_VERIFYPEER   => false,
        CURLOPT_SSL_VERIFYHOST   => 0,
        CURLOPT_CONNECTTIMEOUT   => $CONNECT_TIMEOUT_S,
        CURLOPT_TIMEOUT          => $TOTAL_TIMEOUT_S,
        CURLOPT_RANGE            => '0-' . ($RANGE_BYTES - 1),
        CURLOPT_HTTPHEADER       => [
            'Accept: application/vnd.apple.mpegurl,application/x-mpegURL,video/mp2t,*/*;q=0.5',
            'User-Agent: Mozilla/5.0 (APE-AtomicProbe/1.0) AppleWebKit/537.36 Chrome/125.0',
            'Accept-Encoding: identity',
            'Connection: close',
        ],
        CURLOPT_ACCEPT_ENCODING  => '',
    ]);
    $handles[$i] = ['ch' => $ch, 'url' => $url];
    curl_multi_add_handle($mh, $ch);
}

// Execute multi with concurrency cap
$active = null;
do {
    $status = curl_multi_exec($mh, $active);
    if ($active) curl_multi_select($mh, 0.5);
} while ($active && $status == CURLM_OK);

$results = [];
foreach ($handles as $i => $h) {
    if (isset($h['skip'])) { $results[] = $h['skip']; continue; }
    $ch  = $h['ch'];
    $url = $h['url'];
    $err = curl_error($ch);
    $info = curl_getinfo($ch);
    $status = (int)$info['http_code'];
    $ct = strtolower($info['content_type'] ?? '');
    $headerSize = (int)$info['header_size'];
    $raw = curl_multi_getcontent($ch);
    $body = $raw ? substr($raw, $headerSize) : '';

    $row = [
        'url'         => $url,
        'status'      => $status,
        'contentType' => $ct,
        'bytes'       => strlen($body),
        'error'       => $err ?: null,
        'kind'        => 'unknown',
    ];

    if ($body !== '' && $status > 0) {
        // HLS detection
        if (strpos($ct, 'mpegurl') !== false || strpos($ct, 'm3u8') !== false
            || strncmp($body, '#EXTM3U', 7) === 0) {
            $row['kind']  = 'hls';
            // Return full text up to 32KB (playlists are small)
            $row['text'] = substr($body, 0, 32768);
        }
        // MPEG-TS detection (first byte 0x47 sync)
        else if (strpos($ct, 'mp2t') !== false || strpos($ct, 'mpegts') !== false
                 || strpos($ct, 'octet') !== false || ord($body[0]) === 0x47) {
            $row['kind']  = 'ts';
            $row['b64'] = base64_encode(substr($body, 0, $RANGE_BYTES));
        } else {
            // Try sniff: octet-stream, video/*, etc.
            $row['kind'] = 'unknown';
            $row['snippet'] = substr($body, 0, 256);
        }
    }

    curl_multi_remove_handle($mh, $ch);
    curl_close($ch);
    $results[] = $row;
}
curl_multi_close($mh);

echo json_encode($results, JSON_UNESCAPED_SLASHES);
