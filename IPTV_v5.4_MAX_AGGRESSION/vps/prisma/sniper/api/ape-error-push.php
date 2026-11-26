<?php
/**
 * ape-error-push.php — the SNIPER error PUSH endpoint (player → sniper events spool).
 *
 * The player already fire-and-forget POSTs keepalive JSON to ape-cartridge-incident.php,
 * channel-pq-incident.php and conviva-event.php. This endpoint is the DEDICATED sniper
 * fan-in: it accepts the canonical error event and appends ONE line to the JSONL spool
 * ape-sniper-rs drains. It is also what those three existing endpoints can `include` to
 * mirror an error/VST line into the sniper spool (see ape_error_push_emit()).
 *
 * Doctrine (identical to ape-cartridge-incident.php):
 *   - fire-and-forget friendly (keepalive POST), Cache-Control: no-store
 *   - NEVER blocks, NEVER mid-stream, silent-fail (a down/full spool must not error the caller)
 *   - CRLF-safe (every field sanitized; the JSON line carries no raw newline)
 *   - the ONLY legal actions are decided by Rust later; this just records the symptom.
 *
 * POST JSON { channel_id, error_code, profile?, host?, vst_ms? }   (or matching ?query=)
 *   error_code ∈ {403,404,509,504,000,freeze,black,rebuffer,codec_unsupported,decode_error}
 *
 * Canonical line appended to /dev/shm/ape_sniper_events.jsonl (O_APPEND atomic):
 *   {"ts":<unix>,"channel_id":"<id>","error_code":"<code>","profile":"P..","host":"<host>","vst_ms":<int?>}
 */

header('Content-Type: application/json');
header('Cache-Control: no-store');
header('Access-Control-Allow-Origin: *');

const APE_SNIPER_EVENTS_SPOOL = '/dev/shm/ape_sniper_events.jsonl';

/**
 * Allowed error codes — anything else is dropped (we never write a junk event Rust would skip).
 * Mirrors rules.rs ErrorClass::parse.
 */
function ape_error_push_allowed_code($code) {
    static $ok = array(
        '403' => 1, '404' => 1, '509' => 1, '504' => 1, '000' => 1, '502' => 1,
        'freeze' => 1, 'black' => 1, 'blackscreen' => 1,
        'rebuffer' => 1, 'codec_unsupported' => 1, 'decode_error' => 1,
    );
    return isset($ok[$code]);
}

/**
 * Sanitize + append ONE canonical sniper event. Returns bool. Silent-fail, CRLF-safe.
 * Reusable: the existing incident endpoints can `require_once` this file and call this.
 */
function ape_error_push_emit($channel_id, $error_code, $profile = 'P3', $host = '', $vst_ms = null) {
    // CRLF-safe sanitization: strip anything that could break the single-line JSONL contract.
    $chId  = preg_replace('/[^0-9A-Za-z_.\-]/', '', (string)$channel_id);
    $code  = preg_replace('/[^0-9A-Za-z_]/', '', (string)$error_code);
    $prof  = preg_replace('/[^P0-9]/', '', (string)$profile);
    if ($prof === '') $prof = 'P3';
    // host: allow IPv4/host:port and dotted names only — no spaces, quotes, or control chars.
    $host  = preg_replace('/[^0-9A-Za-z_.\-:]/', '', (string)$host);

    if ($chId === '' || $code === '' || !ape_error_push_allowed_code($code)) {
        return false;
    }

    $event = array(
        'ts'         => time(),
        'channel_id' => $chId,
        'error_code' => $code,
        'profile'    => $prof,
        'host'       => $host,
    );
    if ($vst_ms !== null && $vst_ms !== '') {
        $event['vst_ms'] = (int)$vst_ms;
    }

    // JSON_UNESCAPED_SLASHES keeps host paths compact; no raw newline can survive the sanitizers.
    $line = json_encode($event, JSON_UNESCAPED_SLASHES);
    if ($line === false) return false;
    $line .= "\n";

    // O_APPEND atomic write for a sub-PIPE_BUF line on tmpfs; flock as belt-and-suspenders.
    $ok = false;
    $fh = @fopen(APE_SNIPER_EVENTS_SPOOL, 'a');
    if ($fh) {
        if (@flock($fh, LOCK_EX)) {
            $ok = (@fwrite($fh, $line) !== false);
            @flock($fh, LOCK_UN);
        } else {
            // couldn't lock — still attempt the append; a single short line is atomic on tmpfs.
            $ok = (@fwrite($fh, $line) !== false);
        }
        @fclose($fh);
    }
    return $ok;
}

// ── Only run the request handler when invoked directly (not when require_once'd) ──
if (
    isset($_SERVER['SCRIPT_FILENAME']) &&
    realpath($_SERVER['SCRIPT_FILENAME']) === realpath(__FILE__)
) {
    $raw = file_get_contents('php://input');
    $in  = json_decode($raw ?: '{}', true);
    if (!is_array($in)) $in = array();

    $channel_id = $in['channel_id'] ?? ($_GET['channel_id'] ?? '');
    $error_code = $in['error_code'] ?? ($_GET['error_code'] ?? '');
    $profile    = $in['profile']    ?? ($_GET['profile']    ?? 'P3');
    $host       = $in['host']       ?? ($_GET['host']       ?? '');
    $vst_ms     = $in['vst_ms']     ?? ($_GET['vst_ms']     ?? null);

    $ok = ape_error_push_emit($channel_id, $error_code, $profile, $host, $vst_ms);

    if (!$ok) {
        // Stay 200 for fire-and-forget callers UNLESS the input was structurally invalid.
        $valid_input = ($channel_id !== '' && $error_code !== '');
        if (!$valid_input) {
            http_response_code(400);
            echo json_encode(array('ok' => false, 'error' => 'channel_id_and_error_code_required'));
            exit;
        }
    }
    echo json_encode(array(
        'ok'         => (bool)$ok,
        'channel_id' => preg_replace('/[^0-9A-Za-z_.\-]/', '', (string)$channel_id),
        'error_code' => preg_replace('/[^0-9A-Za-z_]/', '', (string)$error_code),
    ));
}
