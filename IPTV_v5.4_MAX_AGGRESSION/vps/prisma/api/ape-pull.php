<?php
// ══════════════════════════════════════════════════════════════════════════
// APE — Outbound Command Pull endpoint (NAT-friendly · NO WG · NO inbound ADB)
// El device (Fire Stick tras NAT) hace poll OUTBOUND por TLS:443.
//   GET /prisma/api/ape-pull.php?device=<id>[&wait=0..5]
//   Header:  Authorization: Bearer <token>     (NO en query → no se loguea)
// Devuelve los comandos encolados para ESE device (JSON) o 204.
//
// SEGURIDAD (review adversarial 2026-06-09, 3 lentes):
//   • Token por HEADER (no query) → NO queda en nginx access.log. (HIGH#1 fix)
//   • token comparado constant-time (hash_equals) contra sha256 guardado; nunca en claro.
//   • 403 UNIFICADO "forbidden" (sin oráculo unknown-device vs bad-token). (MEDIUM fix)
//   • re-valida el ENUM 'type' server-side (defense-in-depth aunque el agente ya filtra). (MEDIUM)
//   • wait CAP a 5s + set_time_limit + guard de tamaño JSONL → anti FPM-exhaustion. (HIGH#3)
//   • DEBE ir detrás de `limit_req` nginx → snippets/prisma-ape-pull-location.conf (HIGH#3 cableado).
// Fire-safe: no bloquea reproducción.
// ══════════════════════════════════════════════════════════════════════════
@set_time_limit(10);
header('Cache-Control: no-store');
header('Content-Type: application/json');

$BASE   = '/var/www/html/prisma';
$TOKDIR = $BASE . '/db/ape_agent_tokens';   // <device_id> => sha256(token) hex
$CMDDIR = '/dev/shm/ape_cmd';               // <device_id>.jsonl (deliver-once)
$ALLOW  = ['wake', 'refresh', 'apply_profile', 'noop'];   // ENUM permitido (server-side)
$MAXQ   = 65536;                            // guard memoria FPM

function ape_clean_id($v) { return preg_replace('/[^A-Za-z0-9_.\-]/', '', (string)$v); }
function ape_forbidden()  { http_response_code(403); echo '{"error":"forbidden"}'; exit; }  // unificado

// ── Token: PREFERIR header (no se loguea); query ?token= queda como fallback deprecado ──
$tok  = '';
$auth = $_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['HTTP_X_APE_TOKEN'] ?? '');
if (preg_match('/Bearer\s+([A-Za-z0-9]+)/', $auth, $m))        { $tok = $m[1]; }
elseif ($auth !== '' && preg_match('/^[A-Za-z0-9]+$/', $auth)) { $tok = $auth; }   // X-APE-Token directo
elseif (isset($_GET['token']))                                { $tok = (string)$_GET['token']; }  // fallback (exige access_log off)

$dev  = ape_clean_id($_GET['device'] ?? '');
$wait = (int)($_GET['wait'] ?? 0);
if ($wait < 0) { $wait = 0; }
if ($wait > 5) { $wait = 5; }               // CAP duro (HIGH#3: no retener FPM 25s)

if ($dev === '' || $tok === '') { http_response_code(400); echo '{"error":"missing device/token"}'; exit; }

$tokfile = "$TOKDIR/$dev";
if (!is_file($tokfile)) { ape_forbidden(); }              // mismo 403 que bad-token (no oracle)
$stored    = trim((string)@file_get_contents($tokfile));  // sha256 hex
$presented = hash('sha256', $tok);
if ($stored === '' || !hash_equals($stored, $presented)) { ape_forbidden(); }

$cmdfile  = "$CMDDIR/$dev.jsonl";
$deadline = time() + $wait;
do {
    if (is_file($cmdfile)) {
        $sz = (int)@filesize($cmdfile);
        if ($sz > $MAXQ) {                              // cola anómala → drena y corta (anti memory-spike)
            $fh = @fopen($cmdfile, 'c+');
            if ($fh && flock($fh, LOCK_EX)) { ftruncate($fh, 0); fflush($fh); flock($fh, LOCK_UN); }
            if ($fh) { fclose($fh); }
        } elseif ($sz > 0) {
            $fh = @fopen($cmdfile, 'c+');
            if ($fh && flock($fh, LOCK_EX)) {
                $body = stream_get_contents($fh);
                ftruncate($fh, 0); fflush($fh); flock($fh, LOCK_UN); fclose($fh);
                $cmds = [];
                foreach (explode("\n", trim((string)$body)) as $line) {
                    if ($line === '') { continue; }
                    $j = json_decode($line, true);
                    if (is_array($j) && isset($j['type']) && in_array($j['type'], $ALLOW, true)) {  // re-valida ENUM
                        $cmds[] = ['type' => $j['type'], 'ts' => (int)($j['ts'] ?? 0)];
                    }
                }
                echo json_encode(['device' => $dev, 'commands' => $cmds, 'ts' => time()]);
                exit;
            }
            if ($fh) { fclose($fh); }
        }
    }
    if ($wait > 0) { usleep(500000); }
} while ($wait > 0 && time() < $deadline);

http_response_code(204);
