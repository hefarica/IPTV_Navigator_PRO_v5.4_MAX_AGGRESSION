<?php
// exthttp_metadata_parser.php — Agente 1 component.
// Parses #EXTHTTP:{...json...} tags from M3U manifests and applies SAFE response headers.
// Truth-guard: NEVER emits a toxic header (Range/If-Range/If-None-Match/If-Modified-Since/
// TE/Priority/Upgrade-Insecure-Requests). Deploy: /var/www/html/  (php -l on the VPS).

const APE_TOXIC_HEADERS = [
    'range', 'if-range', 'if-none-match', 'if-modified-since',
    'te', 'priority', 'upgrade-insecure-requests',
];

function parseExtHttpTags(string $m3u8): array {
    $directives = [];
    foreach (explode("\n", $m3u8) as $line) {
        $line = trim($line);
        if (strncmp($line, '#EXTHTTP:', 9) === 0) {
            $data = json_decode(substr($line, 9), true);
            if (is_array($data)) {
                $directives[] = $data;
            }
        }
    }
    return $directives;
}

function applyExtHttpDirectives(array $directives): void {
    foreach ($directives as $d) {
        if (!is_array($d)) {
            continue;
        }
        foreach ($d as $k => $v) {
            if (in_array(strtolower((string) $k), APE_TOXIC_HEADERS, true)) {
                continue; // FREEZELESS: never emit a toxic header
            }
            if (is_bool($v)) {
                $v = $v ? '1' : '0';
            }
            if (is_scalar($v)) {
                header(sprintf('%s: %s', $k, $v));
            }
        }
    }
}
