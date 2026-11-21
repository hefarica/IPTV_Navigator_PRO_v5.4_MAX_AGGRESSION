<?php
/**
 * NET SHIELD Sentinel — API endpoint
 * GET  /api/netshield-sentinel.php                → snapshot JSON
 * POST /api/netshield-sentinel.php?approve=<id>   → aprueba y aplica proposal
 * POST /api/netshield-sentinel.php?reject=<id>    → rechaza proposal
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

$jsonFile       = '/dev/shm/netshield_sentinel.json';
$proposalsDir   = '/opt/netshield/state/proposals';
$applyBin       = '/opt/netshield/bin/sentinel-apply-approved.py';
$reportBin      = '/opt/netshield/bin/sentinel-report.py';

function bail(int $code, array $payload): void {
    http_response_code($code);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

// ── POST approve / reject ───────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $approveId = $_GET['approve'] ?? null;
    $rejectId  = $_GET['reject']  ?? null;
    $id = $approveId ?? $rejectId;
    if (!$id || !preg_match('/^[a-f0-9]{8}$/', $id)) {
        bail(400, ['ok' => false, 'error' => 'invalid proposal id']);
    }
    $pFile = "{$proposalsDir}/{$id}.json";
    if (!file_exists($pFile)) bail(404, ['ok' => false, 'error' => 'proposal not found']);

    $prop = json_decode((string)file_get_contents($pFile), true);
    if (!is_array($prop)) bail(500, ['ok' => false, 'error' => 'proposal corrupted']);

    if (($prop['status'] ?? '') !== 'pending') {
        bail(409, ['ok' => false, 'error' => 'proposal not pending', 'current_status' => $prop['status'] ?? null]);
    }

    if ($rejectId) {
        $prop['status']      = 'rejected';
        $prop['rejected_at'] = gmdate('c');
        file_put_contents($pFile, json_encode($prop, JSON_PRETTY_PRINT));
        exec(escapeshellcmd($reportBin) . ' 2>&1', $out, $rc);
        bail(200, ['ok' => true, 'id' => $id, 'action' => 'rejected']);
    }

    // approve
    $prop['status']      = 'user_approved';
    $prop['approved_at'] = gmdate('c');
    file_put_contents($pFile, json_encode($prop, JSON_PRETTY_PRINT));

    // dispara apply-approved en background
    $cmd = sprintf(
        '%s %s 2>&1',
        "sudo " . escapeshellcmd($applyBin),
        escapeshellarg($id)
    );
    exec($cmd, $out, $rc);
    exec(escapeshellcmd($reportBin) . ' 2>&1', $_, $_);

    bail(200, [
        'ok'            => ($rc === 0),
        'id'            => $id,
        'action'        => 'approved_and_applied',
        'exec_rc'       => $rc,
        'exec_output'   => array_slice($out, -20),
    ]);
}

// ── GET snapshot ────────────────────────────────────────────────────────
// [2026-11-13] El 503 aqui era mentira y ademas hacia dano. "first cycle
// pending" implica que el ciclo va a llegar; medido: el productor del snapshot
// NO EXISTE ni en el VPS ni en el repo. Solo hay consumidores (este endpoint y
// net-shield/metrics/checkpoint.sh:25). El widget de la UI hace polling cada
// 30 s y hacia throw en !r.ok, asi que se acumularon 672 respuestas 503 en el
// log del VPS -- el 92 % de todos los 5xx del dia, y ruido en cada recarga.
// Se responde 200 con la forma EXACTA que el widget espera y el estado dicho:
// cero inventado, pero declarado.
if (!file_exists($jsonFile)) {
    bail(200, [
        'ok'                      => false,
        'state'                   => 'NO_PRODUCER',
        'reason'                  => 'ningun proceso escribe /dev/shm/netshield_sentinel.json',
        'last_cycle_at'           => null,
        'pending_approvals'       => [],
        'recent_auto_applied'     => [],
        'top_signatures_lifetime' => [],
        'stats'                   => [
            'events_last_cycle'               => 0,
            'proposals_auto_applied_all_time' => 0,
            'proposals_pending'               => 0,
            'kb_unique_signatures'            => 0,
        ],
    ]);
}
readfile($jsonFile);
