<?php
declare(strict_types=1);

/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  ConvivaPersistence v1.0 — Phase 2 storage (SQLite + circular buffer)   ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Persistence layer for ConvivaQoEServer events. Two channels:
 *
 *   1. SQLite historical store:  /opt/netshield/data/conviva.db
 *      - Permanent record per event
 *      - Indexed by session_id + timestamp_ms
 *      - For analytics / dashboard historical queries
 *
 *   2. Circular buffer /dev/shm/conviva-events.log
 *      - Hot path · last N events for live dashboard tail
 *      - Max size 8 MiB (default) · rotated by line count + truncate
 *      - For WebSocket bridge (Phase 3) to subscribe
 *
 * GATE 1 CABLEADO:
 *   - ConvivaPersistence::persist() called by ConvivaQoEServer::dispatch() (Phase 2 wire)
 *   - SQLite created lazily on first write (init() ensures schema)
 *
 * GATE 3 SANDBOX:
 *   - All paths overridable via constructor params (test injection)
 *   - SQLite file location injectable for unit tests (default /opt/netshield/data/ on VPS)
 *   - Circular buffer path injectable
 *   - Silent fail-safe: persistence errors logged but DO NOT abort dispatch
 *   - No external HTTP calls · no shell exec
 *
 * @see ARTIFACT_CONVIVA_ADB_PUSH_DESIGN.md §6 (server-side architecture)
 * @see vps/prisma/lib/conviva_qoe_server.php (caller graph)
 */

class ConvivaPersistence
{
    public const VERSION = '1.0.0-phase2';

    public const DEFAULT_DB_PATH      = '/opt/netshield/data/conviva.db';
    public const DEFAULT_BUFFER_PATH  = '/dev/shm/conviva-events.log';
    public const DEFAULT_BUFFER_MAX_LINES = 4096;
    public const DEFAULT_BUFFER_MAX_BYTES = 8388608; // 8 MiB

    private string $dbPath;
    private string $bufferPath;
    private int    $bufferMaxLines;
    private int    $bufferMaxBytes;
    private ?PDO   $pdo = null;

    public function __construct(
        ?string $dbPath = null,
        ?string $bufferPath = null,
        ?int $bufferMaxLines = null,
        ?int $bufferMaxBytes = null
    ) {
        $this->dbPath         = $dbPath         ?? self::DEFAULT_DB_PATH;
        $this->bufferPath     = $bufferPath     ?? self::DEFAULT_BUFFER_PATH;
        $this->bufferMaxLines = $bufferMaxLines ?? self::DEFAULT_BUFFER_MAX_LINES;
        $this->bufferMaxBytes = $bufferMaxBytes ?? self::DEFAULT_BUFFER_MAX_BYTES;
    }

    /**
     * Initializes SQLite schema (idempotent).
     * Creates /opt/netshield/data/ dir if missing (mode 0750).
     * Returns true on success, false on any error (silent fail-safe).
     */
    public function init(): bool
    {
        try {
            $dir = dirname($this->dbPath);
            if (!is_dir($dir)) {
                // Best-effort mkdir · ignore failure
                @mkdir($dir, 0750, true);
            }
            $this->pdo = new PDO('sqlite:' . $this->dbPath);
            $this->pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            $this->pdo->exec("PRAGMA journal_mode=WAL");
            $this->pdo->exec("PRAGMA synchronous=NORMAL");
            $this->pdo->exec("PRAGMA temp_store=MEMORY");
            $this->pdo->exec("
                CREATE TABLE IF NOT EXISTS conviva_events (
                    id              INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id      TEXT    NOT NULL,
                    device_id       TEXT    NOT NULL,
                    player          TEXT    NOT NULL,
                    channel_id      TEXT    NOT NULL,
                    channel_name    TEXT,
                    channel_profile TEXT,
                    event_type      TEXT    NOT NULL,
                    timestamp_ms    INTEGER NOT NULL,
                    qoe_score       INTEGER,
                    decision        TEXT,
                    data_json       TEXT,
                    inserted_at     INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER))
                )
            ");
            $this->pdo->exec("CREATE INDEX IF NOT EXISTS idx_session ON conviva_events(session_id, timestamp_ms)");
            $this->pdo->exec("CREATE INDEX IF NOT EXISTS idx_device  ON conviva_events(device_id, timestamp_ms)");
            $this->pdo->exec("CREATE INDEX IF NOT EXISTS idx_channel ON conviva_events(channel_id, timestamp_ms)");
            $this->pdo->exec("CREATE INDEX IF NOT EXISTS idx_decision ON conviva_events(decision) WHERE decision != 'NO_ACTION'");
            return true;
        } catch (Throwable $e) {
            error_log('[conviva-persistence] init failed: ' . $e->getMessage());
            $this->pdo = null;
            return false;
        }
    }

    /**
     * Persists a single event to BOTH the SQLite db and the circular buffer.
     * Silent fail-safe: errors logged but never throw.
     *
     * @param array $event    Original validated event payload
     * @param array $result   ConvivaQoEServer::dispatch() result
     * @return array          ['sqlite_ok' => bool, 'buffer_ok' => bool]
     */
    public function persist(array $event, array $result): array
    {
        $sqliteOk = $this->writeSqlite($event, $result);
        $bufferOk = $this->writeBuffer($event, $result);
        return ['sqlite_ok' => $sqliteOk, 'buffer_ok' => $bufferOk];
    }

    /**
     * Writes one row to SQLite. Returns true on success.
     */
    private function writeSqlite(array $event, array $result): bool
    {
        if ($this->pdo === null && !$this->init()) {
            return false;
        }
        try {
            $stmt = $this->pdo->prepare("
                INSERT INTO conviva_events
                  (session_id, device_id, player, channel_id, channel_name, channel_profile,
                   event_type, timestamp_ms, qoe_score, decision, data_json)
                VALUES
                  (:session_id, :device_id, :player, :channel_id, :channel_name, :channel_profile,
                   :event_type, :timestamp_ms, :qoe_score, :decision, :data_json)
            ");
            $stmt->execute([
                ':session_id'      => $event['session_id'],
                ':device_id'       => $event['device_id'],
                ':player'          => $event['player'],
                ':channel_id'      => $event['channel']['id'] ?? '',
                ':channel_name'    => $event['channel']['name'] ?? null,
                ':channel_profile' => $event['channel']['profile'] ?? null,
                ':event_type'      => $event['event_type'],
                ':timestamp_ms'    => $event['timestamp_ms'],
                ':qoe_score'       => $result['qoe_score'] ?? null,
                ':decision'        => $result['decision'] ?? null,
                ':data_json'       => json_encode($event['data'] ?? new stdClass()),
            ]);
            return true;
        } catch (Throwable $e) {
            error_log('[conviva-persistence] sqlite write failed: ' . $e->getMessage());
            return false;
        }
    }

    /**
     * Appends event to circular buffer · trims oldest lines if max-lines or max-bytes exceeded.
     * Uses LOCK_EX to avoid concurrent writer corruption (multiple PHP-FPM workers).
     */
    private function writeBuffer(array $event, array $result): bool
    {
        try {
            $line = json_encode([
                't'  => $event['timestamp_ms'],
                's'  => $event['session_id'],
                'd'  => $event['device_id'],
                'p'  => $event['player'],
                'c'  => $event['channel']['id'] ?? '',
                'e'  => $event['event_type'],
                'q'  => $result['qoe_score'] ?? null,
                'dec'=> $result['decision'] ?? null,
            ]) . "\n";

            // Ensure directory exists (best-effort)
            $dir = dirname($this->bufferPath);
            if (!is_dir($dir)) {
                @mkdir($dir, 0755, true);
            }

            // Append with exclusive lock
            $fh = @fopen($this->bufferPath, 'c+');
            if (!$fh) return false;
            try {
                if (!flock($fh, LOCK_EX)) {
                    fclose($fh);
                    return false;
                }
                fseek($fh, 0, SEEK_END);
                fwrite($fh, $line);
                fflush($fh);

                // Check if rotation needed
                $size = ftell($fh);
                if ($size > $this->bufferMaxBytes) {
                    $this->rotateBufferLocked($fh);
                }
                flock($fh, LOCK_UN);
            } finally {
                fclose($fh);
            }

            // Permission fix per feedback_dev_shm_permissions_nginx_worker
            // (NGINX worker www-data needs read access if root wrote)
            @chmod($this->bufferPath, 0644);
            return true;
        } catch (Throwable $e) {
            error_log('[conviva-persistence] buffer write failed: ' . $e->getMessage());
            return false;
        }
    }

    /**
     * Trims the buffer to last bufferMaxLines while keeping the lock acquired.
     * Called from writeBuffer() when size exceeded.
     */
    private function rotateBufferLocked($fh): void
    {
        try {
            rewind($fh);
            $allLines = [];
            while (($l = fgets($fh)) !== false) {
                $allLines[] = $l;
            }
            $keep = array_slice($allLines, -$this->bufferMaxLines);
            // Truncate + rewrite
            ftruncate($fh, 0);
            rewind($fh);
            foreach ($keep as $kl) {
                fwrite($fh, $kl);
            }
            fflush($fh);
        } catch (Throwable $e) {
            error_log('[conviva-persistence] rotate failed: ' . $e->getMessage());
        }
    }

    /**
     * Read last N events from SQLite (for /prisma/api/conviva-history Phase 3).
     * @param int $limit Max events to return
     * @param ?string $sessionFilter Optional session_id filter
     * @return array<int,array>
     */
    public function readRecent(int $limit = 100, ?string $sessionFilter = null): array
    {
        if ($this->pdo === null && !$this->init()) {
            return [];
        }
        try {
            if ($sessionFilter !== null) {
                $stmt = $this->pdo->prepare(
                    "SELECT * FROM conviva_events WHERE session_id = :sid ORDER BY timestamp_ms DESC LIMIT :lim"
                );
                $stmt->bindValue(':sid', $sessionFilter);
                $stmt->bindValue(':lim', $limit, PDO::PARAM_INT);
            } else {
                $stmt = $this->pdo->prepare(
                    "SELECT * FROM conviva_events ORDER BY timestamp_ms DESC LIMIT :lim"
                );
                $stmt->bindValue(':lim', $limit, PDO::PARAM_INT);
            }
            $stmt->execute();
            return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
        } catch (Throwable $e) {
            error_log('[conviva-persistence] readRecent failed: ' . $e->getMessage());
            return [];
        }
    }

    /**
     * Read tail of circular buffer (for /prisma/api/conviva-stream Phase 3).
     * @param int $maxLines Max lines to return from end of buffer
     * @return array<int,string> Raw JSON lines (newest first reversed)
     */
    public function readBufferTail(int $maxLines = 100): array
    {
        try {
            if (!is_file($this->bufferPath)) return [];
            $fh = @fopen($this->bufferPath, 'r');
            if (!$fh) return [];
            try {
                if (!flock($fh, LOCK_SH)) {
                    fclose($fh);
                    return [];
                }
                $all = [];
                while (($l = fgets($fh)) !== false) {
                    $all[] = rtrim($l);
                }
                flock($fh, LOCK_UN);
                return array_slice($all, -$maxLines);
            } finally {
                fclose($fh);
            }
        } catch (Throwable $e) {
            error_log('[conviva-persistence] readBufferTail failed: ' . $e->getMessage());
            return [];
        }
    }
}
