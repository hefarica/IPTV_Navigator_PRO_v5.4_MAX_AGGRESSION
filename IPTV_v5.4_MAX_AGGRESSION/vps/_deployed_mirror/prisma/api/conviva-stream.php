<?php
declare(strict_types=1);

/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  /prisma/api/conviva-stream — Phase 3.1 LIVE (SSE bridge)               ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Server-Sent Events endpoint that pushes Conviva QoE events to a browser
 * dashboard widget in near real time. Consumes /dev/shm/conviva-events.log
 * (produced by ConvivaPersistence in Phase 2) and emits one SSE frame per line.
 *
 * GATE 1 CABLEADO:
 *   - Producer: vps/prisma/lib/conviva_persistence.php (Phase 2, DEPLOYED)
 *   - Routing : /etc/nginx/snippets/prisma-conviva-stream.conf (Phase 3.1, DEPLOYED)
 *   - Consumer: frontend/js/conviva-stream-widget.js (Phase 3.2)
 *
 * GATE 3 SANDBOX SAFETY:
 *   - Read-only: never writes the buffer file.
 *   - Bounded execution: hard cap 290 s (under nginx 300 s read timeout).
 *   - Bounded backlog: tail capped at 500 lines.
 *   - Shared lock (LOCK_SH) for reads → never blocks the producer.
 *   - Silent fail-safe: emits SSE 'error' event on transient issues, never throws to nginx.
 *
 * AUTOPISTA COMPLIANT:
 *   - No upstream traffic, no body mutation, no shield interference.
 *   - limit_conn 4/IP at nginx layer prevents DoS without spurious 503s.
 *
 * Contract (browser):
 *   GET /prisma/api/conviva-stream
 *     ?session_id=<filter>   (optional)
 *     &device_id=<filter>    (optional)
 *     &tail=<int 0..500>     (default 50)
 *   Accept: text/event-stream
 *
 * Frame shape:
 *   id: <int>\n
 *   event: conviva\n
 *   data: <json>\n\n
 *
 * Keepalive every 25 s as ":keepalive\n\n" comment line.
 *
 * @see .agents/artifacts/ARTIFACT_CONVIVA_PHASE3_STREAM_DESIGN.md
 * @see vps/prisma/lib/conviva_persistence.php (producer)
 */

// ─── Constants ────────────────────────────────────────────────────────────
const BUFFER_PATH        = '/dev/shm/conviva-events.log';
const MAX_TAIL           = 500;
const DEFAULT_TAIL       = 50;
const KEEPALIVE_INTERVAL = 25;       // seconds
const POLL_INTERVAL_USEC = 100000;   // 100ms
const MAX_STREAM_SECONDS = 290;      // < nginx fastcgi_read_timeout 300

// ─── Method guard ─────────────────────────────────────────────────────────
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    header('Allow: GET');
    header('Content-Type: application/json; charset=utf-8');
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'method_not_allowed', 'expected' => 'GET']);
    exit;
}

// ─── SSE response headers ─────────────────────────────────────────────────
header('Content-Type: text/event-stream; charset=utf-8');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Connection: keep-alive');
header('X-Accel-Buffering: no');            // disable nginx buffering for SSE
header('X-Conviva-Endpoint: stream-v1.0');

// PHP output buffering — disable so writes flush immediately
@ini_set('zlib.output_compression', '0');
@ini_set('output_buffering', '0');
@ini_set('implicit_flush', '1');
while (ob_get_level() > 0) { ob_end_flush(); }
ob_implicit_flush(true);

// ─── Buffer file existence ────────────────────────────────────────────────
if (!is_file(BUFFER_PATH)) {
    sse_emit(0, 'error', ['code' => 'buffer_unavailable', 'path' => BUFFER_PATH]);
    sse_close('producer not yet initialized');
    exit;
}

// ─── Query params ─────────────────────────────────────────────────────────
$sessionFilter = isset($_GET['session_id']) ? trim((string)$_GET['session_id']) : '';
$deviceFilter  = isset($_GET['device_id'])  ? trim((string)$_GET['device_id'])  : '';
$tail          = isset($_GET['tail'])       ? (int)$_GET['tail']                : DEFAULT_TAIL;
$tail          = max(0, min(MAX_TAIL, $tail));

// Last-Event-ID (auto-reconnect from EventSource)
$lastEventId = 0;
if (!empty($_SERVER['HTTP_LAST_EVENT_ID'])) {
    $lastEventId = max(0, (int)$_SERVER['HTTP_LAST_EVENT_ID']);
}

// ─── Open buffer for reading (shared lock — never blocks producer) ────────
$fh = @fopen(BUFFER_PATH, 'r');
if (!$fh) {
    sse_emit(0, 'error', ['code' => 'buffer_open_failed', 'path' => BUFFER_PATH]);
    sse_close('cannot open buffer');
    exit;
}

// ─── Initial backlog (tail) ───────────────────────────────────────────────
// Counter is monotonic across both filtered and emitted lines so EventSource
// can resume cleanly via Last-Event-ID.
$eventId = $lastEventId;
$backlogLines = read_tail_lines($fh, $tail);
foreach ($backlogLines as $rawLine) {
    $eventId++;
    emit_event_if_match($eventId, $rawLine, $sessionFilter, $deviceFilter);
}

// Position file pointer at EOF for the live tail loop
fseek($fh, 0, SEEK_END);
$lastSize = ftell($fh);

// ─── Initial sync flush ───────────────────────────────────────────────────
echo "\n";
@flush();

// ─── Live tail loop ───────────────────────────────────────────────────────
$startTime         = time();
$lastKeepalive     = time();
$lastBufferModTime = @filemtime(BUFFER_PATH) ?: 0;

while (true) {
    // Client disconnected?
    if (connection_aborted()) { break; }

    // Hard execution cap (forces clean reconnect via EventSource)
    if ((time() - $startTime) >= MAX_STREAM_SECONDS) {
        sse_emit(++$eventId, 'reconnect', ['reason' => 'max_stream_seconds_reached']);
        break;
    }

    // CRITICAL: PHP caches stat() results per-request. Without clearstatcache()
    // the producer's writes are invisible to filesize()/filemtime() in this loop.
    clearstatcache(true, BUFFER_PATH);

    // Detect external truncate/rotate (producer rotates buffer on overflow)
    $curMtime = @filemtime(BUFFER_PATH) ?: 0;
    $curSize  = @filesize(BUFFER_PATH);
    if ($curSize !== false && $curSize < $lastSize) {
        // Buffer was rotated/truncated → reopen and resync at EOF
        @fclose($fh);
        $fh = @fopen(BUFFER_PATH, 'r');
        if (!$fh) {
            sse_emit(++$eventId, 'error', ['code' => 'buffer_reopen_failed']);
            break;
        }
        fseek($fh, 0, SEEK_END);
        $lastSize = ftell($fh);
        $lastBufferModTime = $curMtime;
        usleep(POLL_INTERVAL_USEC);
        continue;
    }

    // New data?
    if ($curSize !== false && $curSize > $lastSize) {
        // Try shared lock briefly; if contention, retry next tick
        if (@flock($fh, LOCK_SH | LOCK_NB)) {
            // Re-seek to lastSize (the producer may have written past EOF
            // since we set the pointer; fseek then reads forward).
            fseek($fh, $lastSize);
            while (($line = fgets($fh)) !== false) {
                $line = rtrim($line, "\n");
                if ($line === '') { continue; }
                $eventId++;
                emit_event_if_match($eventId, $line, $sessionFilter, $deviceFilter);
            }
            $lastSize = ftell($fh);
            @flock($fh, LOCK_UN);
        }
    }

    // Keepalive comment line every N seconds
    if ((time() - $lastKeepalive) >= KEEPALIVE_INTERVAL) {
        echo ": keepalive ", time(), "\n\n";
        @flush();
        $lastKeepalive = time();
    }

    usleep(POLL_INTERVAL_USEC);
}

// ─── Cleanup ──────────────────────────────────────────────────────────────
if (is_resource($fh)) { @fclose($fh); }
exit;

// ══════════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════════

/**
 * Emit a single SSE frame.
 *
 * @param int    $id    Monotonic event id
 * @param string $event Event type (consumed by addEventListener)
 * @param mixed  $data  Payload (will be JSON-encoded if not a string)
 */
function sse_emit(int $id, string $event, $data): void {
    if (!is_string($data)) {
        $data = json_encode($data, JSON_UNESCAPED_SLASHES);
        if ($data === false) { $data = '{}'; }
    }
    echo "id: ", $id, "\n";
    echo "event: ", $event, "\n";
    echo "data: ", $data, "\n\n";
    @flush();
}

/**
 * Close the stream with a final 'close' event (best-effort).
 */
function sse_close(string $reason): void {
    echo "event: close\n";
    echo "data: ", json_encode(['reason' => $reason]), "\n\n";
    @flush();
}

/**
 * Emit an event ONLY if the raw buffer line matches the session/device filter.
 * Returns true if a frame was emitted, false if filtered out or invalid JSON.
 */
function emit_event_if_match(int &$eventId, string $rawLine, string $sessionFilter, string $deviceFilter): bool {
    $obj = json_decode($rawLine, true);
    if (!is_array($obj)) { return false; }

    if ($sessionFilter !== '' && (($obj['s'] ?? '') !== $sessionFilter)) { return false; }
    if ($deviceFilter  !== '' && (($obj['d'] ?? '') !== $deviceFilter))  { return false; }

    sse_emit($eventId, 'conviva', $rawLine);   // pass the original JSON verbatim
    return true;
}

/**
 * Read the last $tail lines from a file handle (memory-bounded).
 * Returns oldest-first array (chronological) so frames stream in order.
 */
function read_tail_lines($fh, int $tail): array {
    if ($tail <= 0) { return []; }

    fseek($fh, 0, SEEK_END);
    $size = ftell($fh);
    if ($size === 0) { return []; }

    $chunk    = 4096;
    $pos      = $size;
    $lines    = [];
    $partial  = '';

    while ($pos > 0 && count($lines) <= $tail) {
        $readSize = (int)min($chunk, $pos);
        $pos -= $readSize;
        fseek($fh, $pos);
        $data = fread($fh, $readSize);
        if ($data === false) { break; }

        $data .= $partial;
        $parts = explode("\n", $data);
        if ($pos > 0) {
            $partial = array_shift($parts);   // incomplete first line for next iter
        } else {
            $partial = '';
        }
        // Append parts in reverse for proper ordering after we reverse the whole thing
        for ($i = count($parts) - 1; $i >= 0; $i--) {
            if ($parts[$i] === '') { continue; }
            $lines[] = $parts[$i];
            if (count($lines) > $tail) { break; }
        }
    }

    $lines = array_slice($lines, 0, $tail);
    return array_reverse($lines);            // chronological order
}
