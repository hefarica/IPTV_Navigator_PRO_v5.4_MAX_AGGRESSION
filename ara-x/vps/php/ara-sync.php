<?php
declare(strict_types=1);

/**
 * ARA-X `/sync` — endpoint STAGED (D3, protocol v2). **NO DESPLEGADO.**
 *
 * Deploy target (solo con ventana + autorización del owner):
 *   /var/www/html/prisma/api/ara-sync.php   (644 root:root)
 *
 * Contrato: ara-x/spec/ARA_X_SYNC_PROTOCOL.md §13 + ara-x/vps/schema/*.json.
 * Seguridad: R6-D3-AUTH/REPLAY/SSRF/RATE/NET/DATA/SCHEMA (ara-x/reports/R6_security.md §4).
 *
 * Invariantes que este archivo implementa:
 *  - Auth por dispositivo: X-ARA-Key-Id + HMAC-SHA256 sobre el body CRUDO; sin Bearer,
 *    sin token global, sin query string. 401 uniforme. Store vacío => 503.
 *  - Body <= 16.384 B, Content-Type application/json o 415, JSON inválido o campo
 *    desconocido => 400, método != POST => 405.
 *  - Replay: nonce single-use por device (600 s), seq monotónico, idempotencia exacta
 *    (mismo seq + mismo body_hash) => 200 con el mismo body y firma; resto => 409.
 *  - Anti-SSRF: cero funciones de red. Todo el estado es SQLite local.
 *  - Identidad del catálogo: ref.artifact_sha256 + generation_id (R1). Nunca ETag ni Range.
 *  - Sin CORS, no-store, nosniff. Logs sin body, sin nonce, sin firma, sin IP.
 *  - Rate limit: nginx `limit_req` 3r/m burst 6 solo en /sync (este archivo no limita).
 *
 * Dependencias staged (deben existir antes de habilitar; si faltan => 503):
 *  - ARA_SYNC_KEYS_FILE   (0600 root:root, fuera del webroot) claves por dispositivo
 *  - ARA_SYNC_ARTIFACT_FILE (0600) identidad del catálogo servido
 *  - ARA_SYNC_DB_PATH     (0600, fuera del webroot) estado replay/nonce/seq
 *  - ARA_SYNC_CONTENT_FILE (opcional, 0600) content.* desde el LAB SSOT
 */

// ────────────────────────────────────────────────────────────── constantes ──

const ARA_SYNC_VERSION = 2;
const ARA_REQ_PREFIX = 'ARA-X-SYNC-V1';
const ARA_RESP_PREFIX = 'ARA-X-SYNC-RESP-V1';
const ARA_MAX_BODY = 16384;
const ARA_TS_SKEW = 300;
const ARA_POLICY_TTL = 120;
const ARA_NONCE_TTL = 600;
const ARA_IDEMPOTENCY_TTL = 120;
const ARA_MAX_REPLAY_ROWS = 256;
const ARA_MAX_EVENTS = 8;
const ARA_MAX_AGE_MS = 300000;
const ARA_MAX_CONTENT_AGE_MS = 604800000;
const ARA_UNKNOWN_SHA256 = '0000000000000000000000000000000000000000000000000000000000000000';

function ara_sync_socs(): array
{
    return ['mt8696', 'amlogic', 's905x4', 's905x3'];
}

function ara_sync_unmapped(): string
{
    return 'unknown';
}

/** D4-F10: el request admite el token canónico o 'unknown' + soc_raw. */
function ara_sync_request_socs(): array
{
    return array_merge(ara_sync_socs(), [ara_sync_unmapped()]);
}

function ara_sync_no_wire_8k(): array
{
    return ['s905x4', 's905x3', 'mt8696'];
}

function ara_sync_levers(): array
{
    return [
        'pq_ai_sr_enable', 'ai_sr_level', 'ai_pq_mode', 'aipq_enable',
        'pq_sharpness_enable', 'pq_ai_dnr_enable', 'pq_dnr_enable', 'pq_nr_enable',
        'pq_ai_fbc_enable', 'pq_hdr_enable', 'pq_hdr_mode',
        'match_content_frame_rate', 'minimal_post_processing_allowed',
    ];
}

function ara_sync_prov(): array
{
    return ['measured_device', 'measured_server', 'derived', 'modeled', 'unavailable'];
}

function ara_sync_feature_spec(): array
{
    // [tipo, min, max] o ['enum', valores]; adb_only se marca aparte.
    return [
        'vst_ms' => ['integer', 0, 60000],
        'startup_outcome' => ['enum', ['ok', 'timeout', 'error', 'unknown']],
        'rebuffer_events' => ['integer', 0, 99],
        'rebuffer_ms' => ['integer', 0, 600000],
        'rebuffer_ratio' => ['number', 0, 1],
        'play_ms' => ['integer', 0, 600000],
        'frame_drop_count' => ['integer', 0, 1000000],
        'frame_drop_ratio' => ['number', 0, 1],
        'fps_declared' => ['number', 1, 240],
        'fps_effective' => ['number', 1, 240],
        'frame_time_ms' => ['number', 0, 1000],
        'frame_time_var_ms2' => ['number', 0, 1000000],
        'buffer_ms' => ['integer', 0, 600000],
        'buffer_pct' => ['number', 0, 100],
        'bitrate_bps' => ['integer', 0, 200000000],
        'throughput_bps' => ['integer', 0, 1000000000],
        'ttfb_ms' => ['integer', 0, 60000],
        'rtt_ms' => ['number', 0, 60000],
        'jitter_ms' => ['number', 0, 60000],
        'err_rate_4xx' => ['number', 0, 1],
        'err_rate_5xx' => ['number', 0, 1],
        'redirect_rate' => ['number', 0, 1],
        'cpu_temp_c' => ['number', -10, 125],
        'gpu_temp_c' => ['number', -10, 125],
        'pm_thermal_status' => ['enum', [0, 1, 2, 3, 4, 5, 6, 'unknown']],
        'gpu_load_pct' => ['number', 0, 100],
        'vpu_load_pct' => ['number', 0, 100],
        'ram_available_pct' => ['number', 0, 100],
        'stutter_probability' => ['number', 0, 1],
    ];
}

function ara_sync_adb_only(): array
{
    return ['cpu_temp_c', 'gpu_temp_c', 'gpu_load_pct', 'vpu_load_pct'];
}

function ara_sync_event_types(): array
{
    return ['decoder_error', 'device_capabilities', 'startup_error', 'playback_stall', 'thermal_event'];
}

function ara_sync_event_codes(): array
{
    return ['MediaCodec', 'ExoPlaybackException', 'surface', 'unknown'];
}

// ─────────────────────────────────────────────────────────────── utilería ──

function ara_sync_headers(): void
{
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('Pragma: no-cache');
    header('X-Content-Type-Options: nosniff');
    header_remove('X-Powered-By');
}

function ara_sync_reply(int $status, array $body, array $headers = []): void
{
    http_response_code($status);
    foreach ($headers as $name => $value) {
        header($name . ': ' . $value);
    }
    echo json_encode($body, JSON_UNESCAPED_SLASHES);
    exit;
}

function ara_sync_fail(int $status, string $error): void
{
    ara_sync_reply($status, ['ok' => false, 'error' => $error]);
}

function ara_sync_unauthorized(): void
{
    // R6-D3-AUTH-07: same body/time for unknown key and bad signature.
    ara_sync_fail(401, 'unauthorized');
}

function ara_sync_raw_body(int $limit): ?string
{
    $fh = fopen('php://input', 'rb');
    if ($fh === false) {
        return null;
    }
    $raw = stream_get_contents($fh, $limit + 1);
    fclose($fh);
    return $raw === false ? null : $raw;
}

function ara_sync_read_json(string $path): ?array
{
    if (!is_file($path)) {
        return null;
    }
    $fh = fopen($path, 'rb');
    if ($fh === false) {
        return null;
    }
    $raw = stream_get_contents($fh);
    fclose($fh);
    if ($raw === false) {
        return null;
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : null;
}

function ara_sync_is_token(string $value, int $max = 64): bool
{
    return (bool) preg_match('/^[A-Za-z0-9._:+-]{1,' . $max . '}$/', $value);
}

function ara_sync_sha_ok($value): bool
{
    return is_string($value) && (bool) preg_match('/^[a-f0-9]{64}$/', $value);
}

function ara_sync_url_like(string $key): bool
{
    $k = strtolower($key);
    return in_array($k, ['url', 'uri', 'segment', 'segment_url', 'source_url', 'fetch_url', 'manifest_url', 'callback', 'webhook'], true);
}

function ara_sync_scan_urls($value, int $depth = 0): bool
{
    if ($depth > 12) {
        return false;
    }
    if (is_array($value)) {
        foreach ($value as $key => $item) {
            if (is_string($key) && ara_sync_url_like($key)) {
                return false;
            }
            if (!ara_sync_scan_urls($item, $depth + 1)) {
                return false;
            }
        }
    }
    return true;
}

function ara_sync_unknown_keys(array $value, array $allowed): ?string
{
    foreach (array_keys($value) as $key) {
        if (!in_array((string) $key, $allowed, true)) {
            return (string) $key;
        }
    }
    return null;
}

// ───────────────────────────────────────────────── request validation ──

function ara_sync_validate_apply($apply): bool
{
    if (!is_array($apply)) {
        return false;
    }
    $allowed = ['st', 'rs', 'etag', 'soc', 'th', 'cad', 'ap', 'un', 'sk', 'cl', 'df', 'hl', 'ap_trunc'];
    if (ara_sync_unknown_keys($apply, $allowed) !== null) {
        return false;
    }
    if (!in_array($apply['st'] ?? null, ['denied', 'partial', 'deferred', 'applied', 'noop'], true)) {
        return false;
    }
    $reasons = array_merge(
        ['soc_unmapped', 'soc_mismatch', 'device_not_allowed', 'wire_8k_forbidden', 'eight_k_native_forbidden', 'policy_expired', 'policy_invalid'],
        ['soc_alias_used', 'wire_above_panel', 'thermal_unavailable', 'thermal_status_disagreement', 'cadence_unknown', 'degrade_resolution_not_actuable'],
        ['lever_not_reachable', 'value_out_of_domain', 'forbidden_by_contract', 'key_absent_on_soc']
    );
    if (isset($apply['rs']) && $apply['rs'] !== null && !in_array($apply['rs'], $reasons, true)) {
        return false;
    }
    if (isset($apply['etag']) && (!is_string($apply['etag']) || !preg_match('/^sha256:[a-f0-9]{64}$/', $apply['etag']))) {
        return false;
    }
    if (isset($apply['soc'])) {
        $soc = $apply['soc'];
        if (!is_array($soc) || ara_sync_unknown_keys($soc, ['m', 'src', 'c', 'g', 'alias']) !== null) {
            return false;
        }
        foreach (['m', 'src', 'c', 'g'] as $key) {
            if (!isset($soc[$key]) || !is_string($soc[$key])) {
                return false;
            }
        }
        if (!in_array($soc['m'], ara_sync_request_socs(), true) || !in_array($soc['c'], ara_sync_request_socs(), true)) {
            return false;
        }
        if (!in_array($soc['src'], ['Build.HARDWARE', 'Build.SOC_MODEL', 'unknown'], true)) {
            return false;
        }
        if (!in_array($soc['g'], ['allowlisted', 'not_allowlisted', 'no_caps'], true)) {
            return false;
        }
        if (isset($soc['alias']) && (!is_string($soc['alias']) || !ara_sync_is_token($soc['alias']))) {
            return false;
        }
    }
    if (isset($apply['th'])) {
        $th = $apply['th'];
        if (!is_array($th) || ara_sync_unknown_keys($th, ['prov', 'st', 'steps', 'tier']) !== null) {
            return false;
        }
        foreach (['prov', 'st', 'steps', 'tier'] as $key) {
            if (!array_key_exists($key, $th)) {
                return false;
            }
        }
        if (!in_array($th['prov'], ['measured', 'modeled', 'unavailable'], true)) {
            return false;
        }
        if ($th['st'] !== null && !in_array($th['st'], [0, 1, 2, 3, 4, 5, 6, 'unknown'], true)) {
            return false;
        }
        if (!is_int($th['steps']) || $th['steps'] < 0 || $th['steps'] > 6) {
            return false;
        }
        if (!in_array($th['tier'], ['minimal', 'balanced', 'quality', 'max_image'], true)) {
            return false;
        }
    }
    if (isset($apply['cad']) && (!is_int($apply['cad']) || $apply['cad'] < 10 || $apply['cad'] > 120)) {
        return false;
    }
    if (isset($apply['ap'])) {
        if (!is_array($apply['ap']) || count($apply['ap']) > 16) {
            return false;
        }
        foreach ($apply['ap'] as $line) {
            if (!is_string($line) || strlen($line) > 64 || !preg_match('/^[a-z_]+ [a-z0-9_]+ -?[0-9]{1,4}$/', $line)) {
                return false;
            }
        }
    }
    if (isset($apply['un']) && (!is_int($apply['un']) || $apply['un'] < 0 || $apply['un'] > 1000)) {
        return false;
    }
    foreach (['sk', 'cl', 'df'] as $listKey) {
        if (!isset($apply[$listKey])) {
            continue;
        }
        if (!is_array($apply[$listKey]) || count($apply[$listKey]) > 16) {
            return false;
        }
        foreach ($apply[$listKey] as $item) {
            if (!is_array($item)) {
                return false;
            }
            if ($listKey === 'cl') {
                if (ara_sync_unknown_keys($item, ['k', 'from', 'to']) !== null) {
                    return false;
                }
                if (!is_int($item['from'] ?? null) || !is_int($item['to'] ?? null)) {
                    return false;
                }
            } else {
                if (ara_sync_unknown_keys($item, ['k', 'r']) !== null) {
                    return false;
                }
                if (!is_string($item['r'] ?? null)) {
                    return false;
                }
            }
            if (!is_string($item['k'] ?? null) || strlen($item['k']) > 64 || !preg_match('/^[a-z0-9_]+$/', $item['k'])) {
                return false;
            }
        }
    }
    if (isset($apply['df'])) {
        foreach ($apply['df'] as $item) {
            if (!in_array($item['r'] ?? null, ['player_active', 'lifecycle_pending', 'not_applicable'], true)) {
                return false;
            }
        }
    }
    if (isset($apply['hl'])) {
        if (!is_array($apply['hl']) || count($apply['hl']) > 16) {
            return false;
        }
        foreach ($apply['hl'] as $key) {
            if (!is_string($key) || strlen($key) > 64 || !preg_match('/^[a-z0-9_]+$/', $key)) {
                return false;
            }
        }
    }
    if (isset($apply['ap_trunc']) && !is_bool($apply['ap_trunc'])) {
        return false;
    }
    return ara_sync_scan_urls($apply);
}

function ara_sync_validate_ref($ref, bool $response): bool{
    if (!is_array($ref)) {
        return false;
    }
    $allowed = $response
        ? ['artifact_sha256', 'generation_id', 'list_version', 'lab_exported_at']
        : ['artifact_sha256', 'generation_id', 'list_version'];
    if (ara_sync_unknown_keys($ref, $allowed) !== null) {
        return false;
    }
    foreach ($allowed as $key) {
        if (!isset($ref[$key]) || !is_string($ref[$key])) {
            return false;
        }
    }
    if (!ara_sync_sha_ok($ref['artifact_sha256'])) {
        return false;
    }
    if (!ara_sync_is_token($ref['generation_id']) || !ara_sync_is_token($ref['list_version'])) {
        return false;
    }
    if ($response && !ara_sync_is_token($ref['lab_exported_at'])) {
        return false;
    }
    return true;
}

function ara_sync_validate_feature(string $name, $entry): bool
{
    $spec = ara_sync_feature_spec();
    if (!isset($spec[$name]) || !is_array($entry)) {
        return false;
    }
    if (ara_sync_unknown_keys($entry, ['value', 'prov', 'age_ms', 'conf']) !== null) {
        return false;
    }
    foreach (['value', 'prov', 'age_ms', 'conf'] as $key) {
        if (!array_key_exists($key, $entry)) {
            return false;
        }
    }
    $value = $entry['value'];
    $prov = $entry['prov'];
    if (!is_string($prov) || !in_array($prov, ara_sync_prov(), true)) {
        return false;
    }
    if ($value === null) {
        if ($prov !== 'unavailable') {
            return false;
        }
    } else {
        if ($prov === 'unavailable') {
            return false;
        }
        if ($spec[$name][0] === 'enum') {
            if (!in_array($value, $spec[$name][1], true)) {
                return false;
            }
        } else {
            $isNumber = is_int($value) || is_float($value);
            if (!$isNumber) {
                return false;
            }
            if ($spec[$name][0] === 'integer' && !is_int($value)) {
                return false;
            }
            if ($value < $spec[$name][1] || $value > $spec[$name][2]) {
                return false;
            }
        }
        if (in_array($name, ara_sync_adb_only(), true) && $prov !== 'measured_device') {
            return false;
        }
    }
    if ($entry['age_ms'] !== null) {
        if (!is_int($entry['age_ms']) || $entry['age_ms'] < 0 || $entry['age_ms'] > ARA_MAX_AGE_MS) {
            return false;
        }
    }
    if ($entry['conf'] !== null) {
        if (!is_int($entry['conf']) && !is_float($entry['conf'])) {
            return false;
        }
        if ($entry['conf'] < 0 || $entry['conf'] > 1) {
            return false;
        }
    }
    return true;
}

function ara_sync_validate_request(array $p): ?string
{
    if (ara_sync_unknown_keys($p, ['v', 'type', 'device_id', 'seq', 'ts', 'nonce', 'client', 'ref', 'session', 'metrics', 'events', 'capabilities', 'state']) !== null) {
        return 'unknown_field';
    }
    if (($p['v'] ?? null) !== ARA_SYNC_VERSION || ($p['type'] ?? null) !== 'ara_x_sync') {
        return 'bad_envelope';
    }
    if (!is_string($p['device_id'] ?? null) || !preg_match('/^[A-Za-z0-9._-]{3,128}$/', $p['device_id'])) {
        return 'bad_device';
    }
    if (!is_int($p['seq'] ?? null) || $p['seq'] < 1) {
        return 'bad_seq';
    }
    if (!is_int($p['ts'] ?? null) || $p['ts'] < 1) {
        return 'bad_ts';
    }
    if (!is_string($p['nonce'] ?? null) || !preg_match('/^[a-f0-9]{16,64}$/', $p['nonce'])) {
        return 'bad_nonce';
    }
    if (!ara_sync_validate_ref($p['ref'] ?? null, false)) {
        return 'bad_ref';
    }

    $client = $p['client'] ?? null;
    if (!is_array($client)) {
        return 'bad_client';
    }
    if (ara_sync_unknown_keys($client, ['app', 'version', 'soc', 'soc_raw', 'android', 'player', 'player_version']) !== null) {
        return 'bad_client_field';
    }
    if (!is_string($client['app'] ?? null) || !preg_match('/^[A-Za-z0-9._-]{1,64}$/', $client['app'])) {
        return 'bad_client_app';
    }
    if (!is_string($client['version'] ?? null) || !ara_sync_is_token($client['version'], 32)) {
        return 'bad_client_version';
    }
    if (!in_array($client['soc'] ?? null, ara_sync_request_socs(), true)) {
        return 'bad_soc';
    }
    if (($client['soc'] ?? null) === ara_sync_unmapped()) {
        if (!is_string($client['soc_raw'] ?? null) || !preg_match('/^[A-Za-z0-9._-]{1,64}$/', $client['soc_raw'])) {
            return 'soc_raw_required';
        }
    }
    if (isset($client['soc_raw']) && (!is_string($client['soc_raw']) || !preg_match('/^[A-Za-z0-9._-]{1,64}$/', $client['soc_raw']))) {
        return 'bad_soc_raw';
    }
    if (!is_int($client['android'] ?? null) || $client['android'] < 7 || $client['android'] > 99) {
        return 'bad_android';
    }
    if (!in_array($client['player'] ?? null, ['exoplayer', 'vlc', 'kodi', 'tivimate', 'ott', 'hlsjs', 'other'], true)) {
        return 'bad_player';
    }

    if (isset($p['session'])) {
        if (!is_array($p['session']) || ara_sync_unknown_keys($p['session'], ['playback_state', 'list_version', 'started_at']) !== null) {
            return 'bad_session';
        }
        if (isset($p['session']['playback_state']) && !in_array($p['session']['playback_state'], ['playing', 'paused', 'buffering', 'idle', 'unknown'], true)) {
            return 'bad_playback_state';
        }
        if (isset($p['session']['list_version']) && (!is_string($p['session']['list_version']) || !ara_sync_is_token($p['session']['list_version']))) {
            return 'bad_list_version';
        }
        if (isset($p['session']['started_at']) && (!is_int($p['session']['started_at']) || $p['session']['started_at'] < 0)) {
            return 'bad_started_at';
        }
    }

    $metrics = $p['metrics'] ?? null;
    if (!is_array($metrics)) {
        return 'bad_metrics';
    }
    if (ara_sync_unknown_keys($metrics, ['window_s', 'conf', 'features', 'source']) !== null) {
        return 'bad_metrics_field';
    }
    if (!is_int($metrics['window_s'] ?? null) || $metrics['window_s'] < 10 || $metrics['window_s'] > 60) {
        return 'bad_window';
    }
    if (!array_key_exists('conf', $metrics)) {
        return 'bad_conf';
    }
    if ($metrics['conf'] !== null) {
        if (!is_int($metrics['conf']) && !is_float($metrics['conf'])) {
            return 'bad_conf';
        }
        if ($metrics['conf'] < 0 || $metrics['conf'] > 1) {
            return 'bad_conf';
        }
    }
    $features = $metrics['features'] ?? null;
    if (!is_array($features) || count($features) < 1 || count($features) > 40) {
        return 'bad_features';
    }
    foreach ($features as $name => $entry) {
        if (!ara_sync_validate_feature((string) $name, $entry)) {
            return 'bad_feature';
        }
    }
    $source = $metrics['source'] ?? null;
    if (!is_array($source) || ara_sync_unknown_keys($source, ['resolution', 'codec', 'fps', 'hdr', 'prov', 'age_ms']) !== null) {
        return 'bad_source';
    }
    foreach (['resolution', 'codec', 'fps', 'hdr', 'prov', 'age_ms'] as $key) {
        if (!array_key_exists($key, $source)) {
            return 'bad_source';
        }
    }
    if (!is_string($source['resolution'] ?? null) || !preg_match('/^[0-9]{3,5}x[0-9]{3,5}$/', $source['resolution'])) {
        return 'bad_source_resolution';
    }
    if (!is_string($source['codec'] ?? null) || !preg_match('/^[A-Za-z0-9._-]{3,128}$/', $source['codec'])) {
        return 'bad_source_codec';
    }
    if (!is_int($source['fps'] ?? null) && !is_float($source['fps'] ?? null)) {
        return 'bad_source_fps';
    }
    if ($source['fps'] < 1 || $source['fps'] > 240) {
        return 'bad_source_fps';
    }
    if (!in_array($source['hdr'] ?? null, ['SDR', 'PQ', 'HLG', 'DV'], true)) {
        return 'bad_source_hdr';
    }
    if (!in_array($source['prov'] ?? null, ['measured_device', 'measured_server', 'derived', 'unavailable'], true)) {
        return 'bad_source_prov';
    }
    if (($source['age_ms'] ?? null) !== null) {
        if (!is_int($source['age_ms']) || $source['age_ms'] < 0 || $source['age_ms'] > ARA_MAX_AGE_MS) {
            return 'bad_source_age';
        }
    }

    if (isset($p['events'])) {
        if (!is_array($p['events']) || count($p['events']) > ARA_MAX_EVENTS) {
            return 'bad_events';
        }
        foreach ($p['events'] as $event) {
            if (!is_array($event) || ara_sync_unknown_keys($event, ['type', 'code', 'prov', 'age_ms', 'message_hash']) !== null) {
                return 'bad_event';
            }
            if (!in_array($event['type'] ?? null, ara_sync_event_types(), true)) {
                return 'bad_event_type';
            }
            if (!in_array($event['prov'] ?? null, ara_sync_prov(), true)) {
                return 'bad_event_prov';
            }
            if (($event['age_ms'] ?? null) !== null && (!is_int($event['age_ms']) || $event['age_ms'] < 0 || $event['age_ms'] > ARA_MAX_AGE_MS)) {
                return 'bad_event_age';
            }
            if (isset($event['code']) && !in_array($event['code'], ara_sync_event_codes(), true)) {
                return 'bad_event_code';
            }
            if (isset($event['message_hash']) && !ara_sync_sha_ok($event['message_hash'])) {
                return 'bad_event_hash';
            }
        }
    }

    if (isset($p['capabilities'])) {
        $caps = $p['capabilities'];
        if (!is_array($caps) || ara_sync_unknown_keys($caps, ['super_resolution', 'frame_interp', 'glsl', 'media_enhance_api', 'soc_8k', 'prov']) !== null) {
            return 'bad_caps';
        }
        foreach (['super_resolution', 'frame_interp', 'glsl', 'media_enhance_api'] as $key) {
            if (!is_bool($caps[$key] ?? null)) {
                return 'bad_caps';
            }
        }
        if (isset($caps['soc_8k']) && (!is_string($caps['soc_8k']) || strlen($caps['soc_8k']) > 16)) {
            return 'bad_caps';
        }
        if (!in_array($caps['prov'] ?? null, ara_sync_prov(), true)) {
            return 'bad_caps_prov';
        }
    }

    $state = $p['state'] ?? null;
    if (!is_array($state)) {
        return 'bad_state';
    }
    if (ara_sync_unknown_keys($state, ['active_profile', 'profile_blend', 'policy_etag', 'apply', 'levers']) !== null) {
        return 'bad_state_field';
    }
    if (!in_array($state['active_profile'] ?? null, ['P0', 'P1', 'P2', 'P3', 'P4', 'P5'], true)) {
        return 'bad_profile';
    }
    $blend = $state['profile_blend'] ?? null;
    if (!is_array($blend) || count($blend) < 1 || count($blend) > 6) {
        return 'bad_blend';
    }
    $sum = 0.0;
    foreach ($blend as $key => $weight) {
        if (!in_array($key, ['P0', 'P1', 'P2', 'P3', 'P4', 'P5'], true)) {
            return 'bad_blend_key';
        }
        if (!is_int($weight) && !is_float($weight)) {
            return 'bad_blend_weight';
        }
        if ($weight < 0 || $weight > 1) {
            return 'bad_blend_weight';
        }
        $sum += (float) $weight;
    }
    if (abs($sum - 1.0) > 1e-6) {
        return 'bad_blend_sum';
    }
    if (isset($state['policy_etag']) && (!is_string($state['policy_etag']) || !preg_match('/^sha256:[a-f0-9]{64}$/', $state['policy_etag']))) {
        return 'bad_state_etag';
    }
    if (isset($state['apply']) && !ara_sync_validate_apply($state['apply'])) {
        return 'bad_apply';
    }
    if (isset($state['levers'])) {
        if (!is_array($state['levers'])) {
            return 'bad_state_levers';
        }
        foreach ($state['levers'] as $lever => $value) {
            if (!in_array((string) $lever, ara_sync_levers(), true)) {
                return 'lever_not_allowlisted';
            }
            if (!is_int($value) || $value < -1000 || $value > 1000) {
                return 'bad_lever_value';
            }
        }
    }

    if (!ara_sync_scan_urls($p)) {
        return 'url_like_key';
    }
    return null;
}

// ─────────────────────────────────────────────────────────── policy build ──

function ara_sync_feature_value(array $payload, string $name)
{
    $features = $payload['metrics']['features'] ?? [];
    if (!isset($features[$name])) {
        return null;
    }
    $entry = $features[$name];
    if (!is_array($entry) || ($entry['value'] ?? null) === null) {
        return null;
    }
    return $entry['value'];
}

function ara_sync_policy_etag(array $parts): string
{
    return 'sha256:' . hash('sha256', json_encode($parts, JSON_UNESCAPED_SLASHES));
}

function ara_sync_unmapped_policy(array $payload, array $artifact, int $now): array
{
    $soc = ara_sync_unmapped();
    return [
        'v' => ARA_SYNC_VERSION,
        'type' => 'ara_x_policy',
        'device_id' => $payload['device_id'],
        'seq' => $payload['seq'],
        'ts' => $now,
        'valid_until' => $now + 30,
        'policy_etag' => ara_sync_policy_etag(['soc_unmapped', $soc, $now]),
        'profile' => ['active' => 'P2', 'blend' => ['P2' => 1], 'reason' => 'offline_safe_default'],
        'player' => [
            'buffer_s' => 45,
            'abr_bw_factor' => 0.78,
            'reconnect_attempts' => 156,
            'live_delay_s' => 10,
            'max_bitrate_bps' => 25000000,
            'min_bitrate_bps' => 6000000,
        ],
        'device' => ['allowed' => false, 'soc' => $soc, 'thermal_target_c' => 70, 'levers' => []],
        'display' => [
            'mode' => 'native',
            'wire_resolution' => '1920x1080',
            'min_resolution' => '1920x1080',
            'never_downscale' => true,
            'eight_k' => 'disabled',
            'hdr_hint' => 'SDR',
        ],
        'fps' => ['target' => 30, 'current' => null, 'min' => 24],
        'thermal' => [
            'status' => 'unknown',
            'limits' => ['light_c' => 60, 'moderate_c' => 66, 'severe_c' => 72, 'critical_c' => 78],
        ],
        'processing' => ['tier' => 'minimal'],
        'degrade' => ['order' => ['fps', 'processing']],
        'controls' => ['sync_next_s' => 30, 'flags' => ['soc_unmapped'], 'degrade_mask' => 0],
        'ref' => [
            'artifact_sha256' => $artifact['artifact_sha256'],
            'generation_id' => $artifact['generation_id'],
            'list_version' => $artifact['list_version'],
            'lab_exported_at' => $artifact['lab_exported_at'],
        ],
    ];
}

function ara_sync_build_policy(array $payload, array $artifact, ?array $content, int $now): array
{
    $soc = (string) $payload['client']['soc'];
    if ($soc === ara_sync_unmapped()) {
        // D4-F10: SoC no identificado => fail-closed, sin 400 silencioso y sin heurísticas de 4K.
        return ara_sync_unmapped_policy($payload, $artifact, $now);
    }
    $thermalStatus = ara_sync_feature_value($payload, 'pm_thermal_status');
    $cpuTemp = ara_sync_feature_value($payload, 'cpu_temp_c');
    $rebufferRatio = ara_sync_feature_value($payload, 'rebuffer_ratio');
    $bufferPct = ara_sync_feature_value($payload, 'buffer_pct');
    $fpsDeclared = ara_sync_feature_value($payload, 'fps_declared');
    $fpsEffective = ara_sync_feature_value($payload, 'fps_effective');

    $thermalGuard = (is_int($thermalStatus) && $thermalStatus >= 3)
        || ((is_int($cpuTemp) || is_float($cpuTemp)) && $cpuTemp >= 75);
    $stabilityGuard = ((is_int($rebufferRatio) || is_float($rebufferRatio)) && $rebufferRatio > 0.15)
        || ((is_int($bufferPct) || is_float($bufferPct)) && $bufferPct < 20)
        || ((is_int($fpsDeclared) || is_float($fpsDeclared)) && (is_int($fpsEffective) || is_float($fpsEffective)) && $fpsEffective < $fpsDeclared * 0.9);

    if ($thermalGuard) {
        $active = 'P3';
        $blend = ['P2' => 0.4, 'P3' => 0.6];
        $reason = 'thermal_guard';
        $levers = ['pq_ai_sr_enable' => 0, 'ai_sr_level' => 1, 'pq_hdr_enable' => 1];
    } elseif ($stabilityGuard) {
        $active = 'P2';
        $blend = ['P2' => 1];
        $reason = 'stability_guard';
        $levers = ['pq_ai_sr_enable' => 1, 'ai_sr_level' => 3, 'pq_hdr_enable' => 1];
    } else {
        $active = 'P2';
        $blend = ['P2' => 1];
        $reason = 'nominal';
        $levers = ['pq_ai_sr_enable' => 1, 'ai_sr_level' => 3, 'pq_hdr_enable' => 1];
    }

    $declared = $fpsDeclared !== null ? (float) $fpsDeclared : (float) $payload['metrics']['source']['fps'];
    if ($declared >= 50) {
        $target = 60;
    } elseif ($declared >= 25) {
        $target = 30;
    } else {
        $target = 24;
    }
    $current = $fpsEffective !== null ? (float) $fpsEffective : $declared;
    if ($current < 1) {
        $current = 1.0;
    }
    if ($current > 240) {
        $current = 240.0;
    }

    $hdr = (string) $payload['metrics']['source']['hdr'];
    $hdrHint = in_array($hdr, ['PQ', 'HLG'], true) ? $hdr : 'SDR';
    $fourK = in_array($soc, ['s905x4', 's905x3', 'mt8696', 'amlogic'], true);
    $minRes = $fourK ? '3840x2160' : '1920x1080';

    $flags = [];
    if ($thermalGuard) {
        $flags[] = 'thermal_guard';
    } elseif ($stabilityGuard) {
        $flags[] = 'stability_guard';
    } else {
        $flags[] = 'nominal';
    }
    if ($payload['ref']['artifact_sha256'] !== $artifact['artifact_sha256']
        || $payload['ref']['generation_id'] !== $artifact['generation_id']) {
        $flags[] = 'artifact_mismatch';
    }

    $profile = ['active' => $active, 'blend' => $blend, 'reason' => $reason];
    $player = [
        'buffer_s' => ($thermalGuard || $stabilityGuard) ? 60 : 45,
        'abr_bw_factor' => $stabilityGuard ? 0.7 : 0.78,
        'reconnect_attempts' => 156,
        'live_delay_s' => 10,
        'max_bitrate_bps' => 25000000,
        'min_bitrate_bps' => 6000000,
    ];
    $display = [
        'mode' => $fourK ? '4k' : 'native',
        'wire_resolution' => $minRes,
        'min_resolution' => $minRes,
        'never_downscale' => true,
        'eight_k' => 'presentation_only',
        'hdr_hint' => $hdrHint,
    ];
    $fps = ['target' => $target, 'current' => round($current, 3), 'min' => 24];
    $thermal = [
        'status' => $thermalStatus !== null ? $thermalStatus : 'unknown',
        'limits' => ['light_c' => 60, 'moderate_c' => 66, 'severe_c' => 72, 'critical_c' => 78],
    ];
    $processing = ['tier' => $thermalGuard ? 'minimal' : ($stabilityGuard ? 'balanced' : 'quality')];
    $degrade = ['order' => in_array($soc, ara_sync_no_wire_8k(), true) ? ['fps', 'processing'] : ['fps', 'processing', 'resolution']];
    $controls = ['sync_next_s' => 30, 'flags' => $flags, 'degrade_mask' => 0];
    $ref = [
        'artifact_sha256' => $artifact['artifact_sha256'],
        'generation_id' => $artifact['generation_id'],
        'list_version' => $artifact['list_version'],
        'lab_exported_at' => $artifact['lab_exported_at'],
    ];

    $policy = [
        'v' => ARA_SYNC_VERSION,
        'type' => 'ara_x_policy',
        'device_id' => $payload['device_id'],
        'seq' => $payload['seq'],
        'ts' => $now,
        'valid_until' => $now + 30,
        'policy_etag' => ara_sync_policy_etag([$active, $blend, $reason, $soc, $now, $target, $flags]),
        'profile' => $profile,
        'player' => $player,
        'device' => ['allowed' => true, 'soc' => $soc, 'thermal_target_c' => $thermalGuard ? 65 : 70, 'levers' => $levers],
        'display' => $display,
        'fps' => $fps,
        'thermal' => $thermal,
        'processing' => $processing,
        'degrade' => $degrade,
        'controls' => $controls,
        'ref' => $ref,
    ];

    if (is_array($content)) {
        $policy['content'] = [
            'motion_score' => $content['motion_score'],
            'film_grain' => $content['film_grain'],
            'scene_complexity' => $content['scene_complexity'],
            'dark_ratio' => $content['dark_ratio'],
            'prov' => 'lab_ssot',
            'age_ms' => $content['age_ms'] ?? null,
            'conf' => $content['conf'] ?? null,
        ];
    }
    return $policy;
}

function ara_sync_validate_policy(array $policy): bool
{
    if (($policy['v'] ?? null) !== ARA_SYNC_VERSION || ($policy['type'] ?? null) !== 'ara_x_policy') {
        return false;
    }
    if (!ara_sync_validate_ref($policy['ref'] ?? null, true)) {
        return false;
    }
    $soc = $policy['device']['soc'] ?? null;
    if (!in_array($soc, ara_sync_request_socs(), true)) {
        return false;
    }
    $display = $policy['display'] ?? null;
    if (!is_array($display)) {
        return false;
    }
    if (!in_array($display['wire_resolution'] ?? null, ['1280x720', '1920x1080', '2560x1440', '3840x2160'], true)) {
        return false;
    }
    if (!in_array($display['min_resolution'] ?? null, ['1280x720', '1920x1080', '2560x1440', '3840x2160'], true)) {
        return false;
    }
    if (($display['never_downscale'] ?? null) !== true && in_array($soc, ara_sync_no_wire_8k(), true)) {
        return false;
    }
    if (in_array($soc, ['s905x4', 's905x3', 'mt8696'], true) && ($display['min_resolution'] ?? null) !== '3840x2160') {
        return false;
    }
    if (!in_array($display['eight_k'] ?? null, ['presentation_only', 'disabled'], true)) {
        return false;
    }    $fps = $policy['fps'] ?? null;
    if (!is_array($fps) || !in_array($fps['target'] ?? null, [24, 30, 60], true) || ($fps['min'] ?? null) !== 24) {
        return false;
    }
    $thermal = $policy['thermal'] ?? null;
    if (!is_array($thermal) || !array_key_exists((string) ($thermal['status'] ?? ''), array_flip(array_map('strval', [0, 1, 2, 3, 4, 5, 6, 'unknown'])))) {
        return false;
    }
    $limits = $thermal['limits'] ?? null;
    if (!is_array($limits)) {
        return false;
    }
    $previous = 54;
    foreach (['light_c', 'moderate_c', 'severe_c', 'critical_c'] as $key) {
        $value = $limits[$key] ?? null;
        if (!is_int($value) || $value < 55 || $value > 85 || $value <= $previous) {
            return false;
        }
        $previous = $value;
    }
    if (!in_array($policy['processing']['tier'] ?? null, ['minimal', 'balanced', 'quality', 'max_image'], true)) {
        return false;
    }
    $order = $policy['degrade']['order'] ?? null;
    if (!is_array($order) || count($order) < 1 || count($order) > 3) {
        return false;
    }
    foreach ($order as $key) {
        if (!in_array($key, ['fps', 'processing', 'resolution'], true)) {
            return false;
        }
        if ($key === 'resolution' && in_array($soc, ara_sync_no_wire_8k(), true)) {
            return false;
        }
    }
    if (isset($policy['content'])) {
        $content = $policy['content'];
        if (!is_array($content) || ($content['prov'] ?? null) !== 'lab_ssot') {
            return false;
        }
        if (($content['age_ms'] ?? null) !== null && (!is_int($content['age_ms']) || $content['age_ms'] < 0 || $content['age_ms'] > ARA_MAX_CONTENT_AGE_MS)) {
            return false;
        }
    }
    foreach (($policy['device']['levers'] ?? []) as $lever => $value) {
        if (!in_array((string) $lever, ara_sync_levers(), true) || !is_int($value)) {
            return false;
        }
    }
    if ($policy['valid_until'] <= $policy['ts'] || $policy['valid_until'] - $policy['ts'] > ARA_POLICY_TTL) {
        return false;
    }
    if (!ara_sync_scan_urls($policy)) {
        return false;
    }
    return true;
}

// ─────────────────────────────────────────────────────────────── estado ──

function ara_sync_db(): PDO
{
    $path = getenv('ARA_SYNC_DB_PATH');
    if (!is_string($path) || $path === '') {
        $path = '/var/lib/ara-x/sync.db';
    }
    $dir = dirname($path);
    if (!is_dir($dir)) {
        @mkdir($dir, 0700, true);
    }
    $pdo = new PDO('sqlite:' . $path, null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $pdo->exec('PRAGMA busy_timeout=3000');
    $pdo->exec('PRAGMA journal_mode=WAL');
    @chmod($path, 0600);
    $pdo->exec('CREATE TABLE IF NOT EXISTS ara_sync_state (
        device_id TEXT PRIMARY KEY,
        last_seq INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
    )');
    $pdo->exec('CREATE TABLE IF NOT EXISTS ara_sync_nonce (
        device_id TEXT NOT NULL,
        nonce_hash TEXT NOT NULL,
        seq INTEGER NOT NULL,
        body_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (device_id, nonce_hash)
    )');
    $pdo->exec('CREATE TABLE IF NOT EXISTS ara_sync_replay (
        device_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        body_hash TEXT NOT NULL,
        resp_raw TEXT NOT NULL,
        resp_sig TEXT NOT NULL,
        resp_etag TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (device_id, seq)
    )');
    return $pdo;
}

function ara_sync_purge(PDO $pdo, int $now): void
{
    $pdo->prepare('DELETE FROM ara_sync_nonce WHERE created_at < :cut')->execute([':cut' => $now - ARA_NONCE_TTL]);
    $pdo->prepare('DELETE FROM ara_sync_replay WHERE created_at < :cut')->execute([':cut' => $now - ARA_IDEMPOTENCY_TTL]);
}

// ──────────────────────────────────────────────────────────────── main ──

ara_sync_headers();

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    ara_sync_fail(405, 'method_not_allowed');
}

$contentType = strtolower((string) ($_SERVER['CONTENT_TYPE'] ?? $_SERVER['HTTP_CONTENT_TYPE'] ?? ''));
$contentType = trim(explode(';', $contentType)[0]);
if ($contentType !== 'application/json') {
    ara_sync_fail(415, 'unsupported_media_type');
}

$raw = ara_sync_raw_body(ARA_MAX_BODY);
if ($raw === null) {
    ara_sync_fail(400, 'bad_request');
}
if (strlen($raw) > ARA_MAX_BODY) {
    ara_sync_fail(413, 'payload_too_large');
}

try {
    $payload = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
} catch (Throwable $e) {
    ara_sync_fail(400, 'invalid_json');
}
if (!is_array($payload)) {
    ara_sync_fail(400, 'invalid_json');
}

$problem = ara_sync_validate_request($payload);
if ($problem !== null) {
    ara_sync_fail(400, 'invalid_payload');
}

// Auth: store de claves por dispositivo (R6-D3-AUTH-01/05/08). Sin store => 503.
$keysPath = getenv('ARA_SYNC_KEYS_FILE');
if (!is_string($keysPath) || $keysPath === '') {
    $keysPath = '/etc/ara-x/sync-keys.json';
}
// V3-F-08: el store debe ser privado (0600) y existir; si no, fail-closed.
$keyStoreMode = @fileperms($keysPath);
if ($keyStoreMode === false || ($keyStoreMode & 0077) !== 0) {
    ara_sync_fail(503, 'sync_disabled');
}
$keyStore = ara_sync_read_json($keysPath);
$keys = (is_array($keyStore) && isset($keyStore['keys']) && is_array($keyStore['keys'])) ? $keyStore['keys'] : [];
if (count($keys) < 1) {
    ara_sync_fail(503, 'sync_disabled');
}

$keyId = (string) ($_SERVER['HTTP_X_ARA_KEY_ID'] ?? '');
$entry = (is_string($keyId) && isset($keys[$keyId]) && is_array($keys[$keyId])) ? $keys[$keyId] : null;
if ($entry === null) {
    ara_sync_unauthorized();
}
$secret = $entry['secret'] ?? null;
if (!is_string($secret) || strlen($secret) < 32) {
    ara_sync_unauthorized();
}
$deviceIds = $entry['device_ids'] ?? null;
// V3-F-08: `device_ids:null`/vacío NO es comodín: el key debe estar ligado a >=1
// dispositivo y el device_id debe estar en la lista (fail-closed, 401 uniforme).
if (!is_array($deviceIds) || count($deviceIds) < 1) {
    ara_sync_unauthorized();
}
$deviceBound = false;
foreach ($deviceIds as $boundId) {
    if (!is_string($boundId) || $boundId === '') {
        ara_sync_unauthorized();
    }
    if ($boundId === $payload['device_id']) {
        $deviceBound = true;
    }
}
if (!$deviceBound) {
    ara_sync_unauthorized();
}
$retiresAt = $entry['retires_at'] ?? null;
if (is_int($retiresAt) && time() > $retiresAt) {
    ara_sync_unauthorized();
}

$bodyHash = hash('sha256', $raw);
$canonical = implode("\n", [
    ARA_REQ_PREFIX,
    (string) $payload['device_id'],
    (string) $payload['seq'],
    (string) $payload['ts'],
    (string) $payload['nonce'],
    $bodyHash,
]);
$expected = hash_hmac('sha256', $canonical, $secret);
$presented = strtolower((string) ($_SERVER['HTTP_X_ARA_SIG'] ?? ''));
if (!(bool) preg_match('/^[a-f0-9]{64}$/', $presented) || !hash_equals($expected, $presented)) {
    ara_sync_unauthorized();
}

$now = time();
if (!is_int($payload['ts']) || abs($now - $payload['ts']) > ARA_TS_SKEW) {
    ara_sync_unauthorized();
}

// Identidad del artefacto servido (R1): sha256 + generation_id, nunca ETag/Range.
$artifactPath = getenv('ARA_SYNC_ARTIFACT_FILE');
if (!is_string($artifactPath) || $artifactPath === '') {
    $artifactPath = '/var/lib/ara-x/artifact.json';
}
$artifact = ara_sync_read_json($artifactPath);
if (!is_array($artifact) || !ara_sync_validate_ref([
    'artifact_sha256' => $artifact['artifact_sha256'] ?? null,
    'generation_id' => $artifact['generation_id'] ?? null,
    'list_version' => $artifact['list_version'] ?? null,
    'lab_exported_at' => $artifact['lab_exported_at'] ?? null,
], true)) {
    ara_sync_fail(503, 'artifact_identity_unavailable');
}

$contentPath = getenv('ARA_SYNC_CONTENT_FILE');
if (!is_string($contentPath) || $contentPath === '') {
    $contentPath = '/var/lib/ara-x/content.json';
}
$content = ara_sync_read_json($contentPath);
if (is_array($content)) {
    foreach (['motion_score', 'film_grain', 'scene_complexity', 'dark_ratio'] as $key) {
        if (!isset($content[$key]) || (!is_int($content[$key]) && !is_float($content[$key]))) {
            $content = null;
            break;
        }
    }
}

$shadow = strtolower((string) ($_SERVER['HTTP_X_ARA_SYNC_MODE'] ?? '')) === 'shadow';

$policy = ara_sync_build_policy($payload, $artifact, $content, $now);
if (!ara_sync_validate_policy($policy)) {
    ara_sync_fail(500, 'policy_generation_failed');
}

if ($shadow) {
    // Canary: calcula y registra, pero NO sirve política ni toca el estado de replay.
    error_log(sprintf('ara-sync shadow device=%s seq=%d etag=%s', $payload['device_id'], $payload['seq'], $policy['policy_etag']));
    $shadowBody = '';
    $shadowSig = hash_hmac('sha256', implode("\n", [
        ARA_RESP_PREFIX,
        (string) $payload['device_id'],
        (string) $payload['seq'],
        (string) $policy['ts'],
        hash('sha256', $shadowBody),
    ]), $secret);
    http_response_code(204);
    header('X-ARA-Sync-Mode: shadow');
    header('X-ARA-Sig: ' . $shadowSig);
    exit;
}

$pdo = ara_sync_db();
$pdo->exec('BEGIN IMMEDIATE');

$replay = null;
$stmt = $pdo->prepare('SELECT body_hash, resp_raw, resp_sig, resp_etag, created_at FROM ara_sync_replay WHERE device_id = :d AND seq = :s');
$stmt->execute([':d' => $payload['device_id'], ':s' => $payload['seq']]);
$replay = $stmt->fetch();
if (is_array($replay) && hash_equals((string) $replay['body_hash'], $bodyHash) && $now - (int) $replay['created_at'] <= ARA_IDEMPOTENCY_TTL) {
    $pdo->exec('COMMIT');
    http_response_code(200);
    header('X-ARA-Sig: ' . $replay['resp_sig']);
    header('X-ARA-Policy-Etag: ' . $replay['resp_etag']);
    header('X-ARA-Idempotent: 1');
    echo $replay['resp_raw'];
    exit;
}

$nonceHash = hash('sha256', (string) $payload['nonce']);
$stmt = $pdo->prepare('SELECT created_at FROM ara_sync_nonce WHERE device_id = :d AND nonce_hash = :n');
$stmt->execute([':d' => $payload['device_id'], ':n' => $nonceHash]);
$nonceRow = $stmt->fetch();
if (is_array($nonceRow) && $now - (int) $nonceRow['created_at'] <= ARA_NONCE_TTL) {
    $pdo->exec('ROLLBACK');
    ara_sync_fail(409, 'replay');
}

$stmt = $pdo->prepare('SELECT last_seq FROM ara_sync_state WHERE device_id = :d');
$stmt->execute([':d' => $payload['device_id']]);
$stateRow = $stmt->fetch();
$lastSeq = is_array($stateRow) ? (int) $stateRow['last_seq'] : 0;
if ((int) $payload['seq'] <= $lastSeq) {
    $pdo->exec('ROLLBACK');
    ara_sync_fail(409, 'replay');
}

$rawResponse = json_encode($policy, JSON_UNESCAPED_SLASHES);
$respSig = hash_hmac('sha256', implode("\n", [
    ARA_RESP_PREFIX,
    (string) $payload['device_id'],
    (string) $payload['seq'],
    (string) $policy['ts'],
    hash('sha256', $rawResponse),
]), $secret);

ara_sync_purge($pdo, $now);
$pdo->prepare('INSERT OR REPLACE INTO ara_sync_nonce (device_id, nonce_hash, seq, body_hash, created_at)
    VALUES (:d, :n, :s, :b, :t)')->execute([
    ':d' => $payload['device_id'], ':n' => $nonceHash, ':s' => $payload['seq'],
    ':b' => $bodyHash, ':t' => $now,
]);
$pdo->prepare('INSERT OR REPLACE INTO ara_sync_replay (device_id, seq, body_hash, resp_raw, resp_sig, resp_etag, created_at)
    VALUES (:d, :s, :b, :r, :g, :e, :t)')->execute([
    ':d' => $payload['device_id'], ':s' => $payload['seq'], ':b' => $bodyHash,
    ':r' => $rawResponse, ':g' => $respSig, ':e' => $policy['policy_etag'], ':t' => $now,
]);
$pdo->prepare('INSERT INTO ara_sync_state (device_id, last_seq, updated_at) VALUES (:d, :s, :t)
    ON CONFLICT(device_id) DO UPDATE SET last_seq = excluded.last_seq, updated_at = excluded.updated_at')->execute([
    ':d' => $payload['device_id'], ':s' => $payload['seq'], ':t' => $now,
]);
$pdo->prepare('DELETE FROM ara_sync_replay WHERE device_id = :d AND seq NOT IN (
    SELECT seq FROM ara_sync_replay WHERE device_id = :d2 ORDER BY seq DESC LIMIT ' . ARA_MAX_REPLAY_ROWS . '
)')->execute([':d' => $payload['device_id'], ':d2' => $payload['device_id']]);
$pdo->exec('COMMIT');

error_log(sprintf('ara-sync ok device=%s seq=%d etag=%s flags=%s', $payload['device_id'], $payload['seq'], $policy['policy_etag'], implode(',', $policy['controls']['flags'])));

http_response_code(200);
header('X-ARA-Sig: ' . $respSig);
header('X-ARA-Policy-Etag: ' . $policy['policy_etag']);
echo $rawResponse;
