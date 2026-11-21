<?php
// ══════════════════════════════════════════════════════════════════════════
// APE — CANON INGEST endpoint (productor → /dev/shm · cierra Motor 3 E2E)
//
// Recibe el JSONL canónico que emite el generador (ape-canon-emitter.js, Motor 1)
// y lo DESEMPACA a /dev/shm/ape_canon/<key>.json — una entrada por canal, keyed
// por _key. ape-session-resolve.php (Motor 3) las lee por-player en tiempo real.
//
// IDEMPOTENTE: misma entrada → mismos archivos (escritura atómica tmp+rename); si
//   el _key+_schemaFingerprint no cambió, no reescribe (skip). Si la lista cambió,
//   refleja lo nuevo (no sirve stale).
// AUTOPISTA: NO está en el path de reproducción; corre al SUBIR la lista (raro),
//   no por zap. set_time_limit + guard de tamaño anti-FPM.
// SEGURIDAD: Bearer header + hash_equals (patrón ape-match.php). 403 unificado.
// LÍMITE RAM: /dev/shm es de 4GB compartido — cap de nº de entradas + tamaño/record.
// ══════════════════════════════════════════════════════════════════════════
declare(strict_types=1);
@set_time_limit(20);
header('Cache-Control: no-store');
header('Content-Type: application/json');

$BASE     = '/var/www/html/prisma';
// SEGURIDAD (council S10): la ESCRITURA del catálogo COMPARTIDO usa un namespace de token
// PUBLISHER separado del per-device de los players (que solo LEEN vía resolve). Un token de
// player NUNCA puede escribir el canon. Provisionar el publisher token para el generador/upload.
$TOKDIR   = $BASE . '/db/ape_publisher_tokens';
$CANONDIR = '/dev/shm/ape_canon';
$MAXIN    = 64 * 1024 * 1024;          // 64MB cap del JSONL (lista masiva); ajustar a la RAM
$MAX_REC  = 200000;                    // cap de canales (anti-overflow /dev/shm)
$MAX_REC_BYTES = 65536;                // cap por record
$MAX_TOTAL_BYTES = 512 * 1024 * 1024;  // presupuesto TOTAL en /dev/shm (council S10: tmpfs 4GB compartido con cache)
$MIN_SHM_FREE = 256 * 1024 * 1024;     // si /dev/shm baja de esto, parar (anti-exhaustion→freeze indirecto)

function ci_clean($v) { return preg_replace('/[^A-Za-z0-9_.\-]/', '', (string)$v); }
function ci_forbidden() { http_response_code(403); echo '{"error":"forbidden"}'; exit; }
function ci_bad($m) { http_response_code(400); echo json_encode(['error' => $m]); exit; }

// ── AUTH (patrón ape-match.php) ───────────────────────────────────────────────
$auth = $_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['HTTP_X_APE_TOKEN'] ?? '');
$tok  = '';
if (preg_match('/Bearer\s+([A-Za-z0-9]+)/', $auth, $m))        { $tok = $m[1]; }
elseif ($auth !== '' && preg_match('/^[A-Za-z0-9]+$/', $auth)) { $tok = $auth; }
$dev = ci_clean($_GET['device'] ?? '');
if ($dev === '' || $tok === '') { ci_bad('missing device/token'); }
$tokfile = "$TOKDIR/$dev";
if (!is_file($tokfile)) { ci_forbidden(); }
$stored = trim((string)@file_get_contents($tokfile));
if ($stored === '' || !hash_equals($stored, hash('sha256', $tok))) { ci_forbidden(); }

// ── leer JSONL (stream, no cargar 64MB de golpe en memoria si se puede) ───────
$raw = file_get_contents('php://input', false, null, 0, $MAXIN + 1);
if ($raw === false) { ci_bad('no body'); }
if (strlen($raw) > $MAXIN) { ci_bad('payload too large'); }

if (!is_dir($CANONDIR)) { @mkdir($CANONDIR, 0755, true); }
if (!is_dir($CANONDIR)) { http_response_code(500); echo '{"error":"shm dir"}'; exit; }

$lines = preg_split('/\r?\n/', $raw);
$written = 0; $skipped = 0; $bad = 0; $seen = []; $total_bytes = 0; $halted = false;
foreach ($lines as $ln) {
    if ($written + $skipped >= $MAX_REC) break;
    // Guard anti-exhaustion de /dev/shm (council S10): presupuesto total + espacio libre real.
    if ($total_bytes >= $MAX_TOTAL_BYTES) { $halted = true; break; }
    $free = @disk_free_space($CANONDIR);
    if ($free !== false && $free < $MIN_SHM_FREE) { $halted = true; break; }
    $ln = trim($ln);
    if ($ln === '') continue;
    if (strlen($ln) > $MAX_REC_BYTES) { $bad++; continue; }
    $total_bytes += strlen($ln);
    $rec = json_decode($ln, true);
    if (!is_array($rec) || empty($rec['_key'])) { $bad++; continue; }
    $key = preg_replace('/[^a-f0-9]/', '', strtolower((string)$rec['_key']));
    if ($key === '' || isset($seen[$key])) { continue; }
    $seen[$key] = 1;

    $path = $CANONDIR . '/' . $key . '.json';
    // idempotencia: si existe y mismo fingerprint, skip (no reescribir)
    if (is_file($path)) {
        $cur = json_decode((string)@file_get_contents($path), true);
        if (is_array($cur) && ($cur['_schemaFingerprint'] ?? null) === ($rec['_schemaFingerprint'] ?? '')
            && ($cur['_provider_url'] ?? null) === ($rec['_provider_url'] ?? '')) { $skipped++; continue; }
    }
    // escritura ATÓMICA (tmp + rename) — nunca un .json a medias
    $tmp = $path . '.tmp_' . getmypid();
    if (@file_put_contents($tmp, $ln, LOCK_EX) !== false && @rename($tmp, $path)) { $written++; }
    else { @unlink($tmp); $bad++; }
}

echo json_encode([
    'status'  => $halted ? 'partial_shm_budget' : 'ok',
    'written' => $written,
    'skipped_idempotent' => $skipped,
    'bad'     => $bad,
    'total_keys' => count($seen),
    'total_bytes' => $total_bytes,
    'halted_on_budget' => $halted,
    'shm_dir' => $CANONDIR
], JSON_UNESCAPED_SLASHES);
