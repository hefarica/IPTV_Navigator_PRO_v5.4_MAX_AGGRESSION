<?php
/**
 * ape-parity-tags.php — Paridad VPS → navegador (2026-11-04, mandato operador)
 *
 * QUÉ HACE
 *   Lee el resolver de producción (resolve_quality_unified.php) y devuelve, en JSON, todos
 *   los tags `#EXT-X-APE-*` que ese resolver emite. El generador del navegador consume este
 *   endpoint al arrancar y al guardar, de modo que la lista generada en la UI declare
 *   exactamente lo mismo que la lista servida por el VPS.
 *
 * POR QUÉ EXISTE
 *   Antes, el navegador emitía 145 tags EXT-X-APE menos que el resolver. Generar desde la UI
 *   producía una lista más pobre que pedirla al VPS. El bloque de paridad se congeló a mano
 *   una vez; este endpoint lo mantiene vivo sin intervención.
 *
 * QUÉ NO HACE
 *   No modifica el resolver. No escribe nada. No ejecuta código del resolver: lo lee como
 *   texto y aplica una expresión regular sobre las líneas `$d[] = '...';`.
 *   Sin autenticación de escritura porque no hay escritura; sólo lectura de un fichero local.
 *
 * CONTRATO DE SALIDA
 *   {
 *     "ok": true,
 *     "count": 138,
 *     "tags": { "#EXT-X-APE-X": "VALOR", ... },
 *     "source": "resolve_quality_unified.php",
 *     "source_sha256": "...",
 *     "generated_at": "2026-11-04T12:00:00Z"
 *   }
 *   En error: { "ok": false, "error": "...", "detail": "..." } con HTTP 500.
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, max-age=0');
header('X-Content-Type-Options: nosniff');

// El resolver vive junto al backend. Se prueban las rutas conocidas en orden.
const RESOLVER_CANDIDATES = [
    __DIR__ . '/../../../backend/resolve_quality_unified.php',
    __DIR__ . '/../../backend/resolve_quality_unified.php',
    '/var/www/html/backend/resolve_quality_unified.php',
    '/var/www/iptv-ape/backend/resolve_quality_unified.php',
];

function fail(string $error, string $detail = '', int $code = 500): void
{
    http_response_code($code);
    echo json_encode([
        'ok'     => false,
        'error'  => $error,
        'detail' => $detail,
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

$path = null;
foreach (RESOLVER_CANDIDATES as $candidate) {
    $real = realpath($candidate);
    if ($real !== false && is_file($real) && is_readable($real)) {
        $path = $real;
        break;
    }
}

if ($path === null) {
    fail('resolver_not_found', 'Ninguna ruta candidata contiene resolve_quality_unified.php');
}

$raw = @file_get_contents($path);
if ($raw === false) {
    fail('resolver_unreadable', 'file_get_contents devolvio false para ' . $path);
}

// Extrae `$d[] = '#EXT-X-APE-TAG: VALOR';` y también la variante con comillas dobles.
// Sin evaluar el PHP: lectura literal de líneas.
$tags = [];
$total = 0;
$skipped = 0;

foreach (preg_split("/\r\n|\n|\r/", $raw) as $line) {
    if (stripos($line, '#EXT-X-APE-') === false) {
        continue;
    }
    if (!preg_match('/\$d\[\]\s*=\s*[\'"](#EXT-X-APE-[A-Z0-9-]+):\s*([^\'"]*)[\'"]\s*;/', $line, $m)) {
        continue;
    }
    $total++;
    $tag = $m[1];
    $val = trim($m[2]);
    // Si el valor interpola una variable PHP, no se puede congelar: se cuenta y se omite.
    if (preg_match('/\$[A-Za-z_]|\{\$/', $val)) {
        $skipped++;
        continue;
    }
    if (!isset($tags[$tag])) {
        $tags[$tag] = $val;
    }
}

if ($total === 0) {
    fail('no_tags_found', 'El resolver no expuso ninguna linea $d[] = \'#EXT-X-APE-...\'');
}

ksort($tags);

$sha = @hash_file('sha256', $path);

echo json_encode([
    'ok'             => true,
    'count'          => count($tags),
    'tags'           => $tags,
    'total_lines'    => $total,
    'skipped_dynamic'=> $skipped,
    'source'         => basename($path),
    'source_sha256'  => $sha === false ? null : $sha,
    'generated_at'   => gmdate('c'),
], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
