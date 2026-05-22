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
            // ── HDCP-Adaptive Engine (added 2026-05-19) ──
            // Per-channel HDCP-LEVEL decision store. Default TYPE-1 (aggressive,
            // forces hardware decoder path). Adaptive fallback to NONE if Conviva
            // detects VST > 3000ms in TYPE-1 attempt. Lua/PHP NEVER intervenes
            // mid-stream — only consulted pre-zap by generator.
            $this->pdo->exec("
                CREATE TABLE IF NOT EXISTS channel_hdcp_profile (
                    channel_id            TEXT PRIMARY KEY,
                    channel_name          TEXT NOT NULL,
                    hdcp_level            TEXT NOT NULL DEFAULT 'TYPE-1' CHECK(hdcp_level IN ('TYPE-1','NONE')),
                    vst_avg_ms            INTEGER DEFAULT 0,
                    vst_p95_ms            INTEGER DEFAULT 0,
                    incident_count        INTEGER DEFAULT 0,
                    successful_play_count INTEGER DEFAULT 0,
                    last_incident_at      INTEGER,
                    last_success_at       INTEGER,
                    decision_locked       INTEGER DEFAULT 0,
                    updated_at            INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER))
                )
            ");
            $this->pdo->exec("CREATE INDEX IF NOT EXISTS idx_hdcp_updated ON channel_hdcp_profile(updated_at)");
            // ── Server-Side QoE Observer (added 2026-05-19) ──
            // Conviva-equivalent metrics derived from nginx access patterns for
            // native players (TiviMate, VLC, Kodi, ExoPlayer) that cannot run JS.
            // Populated by qoe_server_side_observer.lua via /prisma/api/qoe-flush.php.
            $this->pdo->exec("
                CREATE TABLE IF NOT EXISTS server_side_qoe_metrics (
                    id              INTEGER PRIMARY KEY AUTOINCREMENT,
                    channel_id      TEXT    NOT NULL,
                    bucket_5min     INTEGER NOT NULL,
                    vst_proxy_avg   INTEGER DEFAULT 0,
                    vst_proxy_max   INTEGER DEFAULT 0,
                    rebuffer_count  INTEGER DEFAULT 0,
                    request_count   INTEGER DEFAULT 0,
                    error_count     INTEGER DEFAULT 0,
                    bitrate_avg_bps INTEGER DEFAULT 0,
                    flushed_at      INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER))
                )
            ");
            $this->pdo->exec("CREATE INDEX IF NOT EXISTS idx_ssqoe_channel ON server_side_qoe_metrics(channel_id, bucket_5min)");
            $this->pdo->exec("CREATE INDEX IF NOT EXISTS idx_ssqoe_flushed ON server_side_qoe_metrics(flushed_at)");

            // Per-profile QoE aggregates (Feature 1 — Conviva→LAB feedback loop, 2026-05-20).
            // History of per-profile (P0-P5) QoE + suggested target_factor for LAB recalibration.
            // OBSERVE-ONLY: target_factor is a suggestion; NOT auto-applied to decision_engine.
            $this->pdo->exec("
                CREATE TABLE IF NOT EXISTS qoe_profile_aggregates (
                    id              INTEGER PRIMARY KEY AUTOINCREMENT,
                    profile         TEXT    NOT NULL,
                    bucket_5min     INTEGER NOT NULL,
                    avg_vst_ms      INTEGER DEFAULT 0,
                    rebuffer_ratio  REAL    DEFAULT 0,
                    error_ratio     REAL    DEFAULT 0,
                    samples         INTEGER DEFAULT 0,
                    target_factor   REAL    DEFAULT 1.0,
                    observed_at     INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER))
                )
            ");
            $this->pdo->exec("CREATE INDEX IF NOT EXISTS idx_qpa_profile ON qoe_profile_aggregates(profile, bucket_5min)");
            $this->pdo->exec("CREATE INDEX IF NOT EXISTS idx_qpa_observed ON qoe_profile_aggregates(observed_at)");

            // ── [MAX_QUALITY 2026-05-22] Tabla de canales consumidos con MAX QUALITY OVERRIDE ──
            //
            // Registra qué canales se están reproduciendo con la cascada dual hvc1+hev1 /
            // Dolby Vision activa (toggle "MAX QUALITY OVERRIDE" en la UI del generador).
            //
            // Flujo de escritura:
            //   m3u8-typed-arrays-ultimate.js (EXTHTTP X-APE-Max-Quality:1)
            //   → qoe_server_side_observer.lua (captura, dict["mq:<chId>"])
            //   → qoe_flush_worker.lua (60s timer, incluye en JSON payload)
            //   → qoe-flush.php (llama recordMaxQualityChannel() por cada entrada)
            //   → ESTA TABLA
            //
            // Flujo de lectura:
            //   → Dashboard APE: SELECT * FROM max_quality_channels ORDER BY recorded_at DESC
            //   → ape-uhdx-sentinel.sh: consulta vía prisma-adb-quality.php?action=mq_channels
            //     para saber qué canales requieren ADB settings HEVC/DV adicionales
            //
            // AUDITORÍA: bucket_5min permite correlacionar con server_side_qoe_metrics
            // y channel_hdcp_profile para análisis cruzado de calidad.
            //
            // Campos:
            //   channel_id   — ID numérico del canal (mismo que en las demás tablas)
            //   cascade_type — "dual-hvc1-hev1" (o futuras variantes: "hvc1-only", "dv-p8")
            //   profile      — Perfil APE activo ("P0".."P5")
            //   bucket_5min  — Ventana temporal de 5 min (floor(unix_ts / 300))
            //   recorded_at  — Unix timestamp de la persistencia
            $this->pdo->exec("
                CREATE TABLE IF NOT EXISTS max_quality_channels (
                    id           INTEGER PRIMARY KEY AUTOINCREMENT,
                    channel_id   TEXT    NOT NULL,
                    cascade_type TEXT    NOT NULL DEFAULT 'dual-hvc1-hev1',
                    profile      TEXT    NOT NULL DEFAULT 'unknown',
                    bucket_5min  INTEGER NOT NULL,
                    recorded_at  INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER))
                )
            ");
            $this->pdo->exec("CREATE INDEX IF NOT EXISTS idx_mq_channel ON max_quality_channels(channel_id, bucket_5min)");
            $this->pdo->exec("CREATE INDEX IF NOT EXISTS idx_mq_recorded ON max_quality_channels(recorded_at)");
            // ── [FIN MAX_QUALITY tabla] ────────────────────────────────────────────────────────

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

    // ═════════════════════════════════════════════════════════════════════════
    // HDCP-Adaptive Engine (2026-05-19)
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * Records a HDCP failure incident for a channel and flips its profile to NONE
     * (idempotent — UPSERT pattern). Called when Conviva detects VST > 3000ms in
     * a TYPE-1 attempt. Silent fail-safe.
     *
     * @param string $channelId      Stable channel identifier (Xtream stream_id or hash)
     * @param string $channelName    Human-readable channel name (for analytics)
     * @param int    $vstMs          Measured VST in milliseconds for this incident
     * @return bool                  true on success, false on any error
     */
    public function recordHdcpIncident(string $channelId, string $channelName, int $vstMs): bool
    {
        if ($this->pdo === null && !$this->init()) {
            return false;
        }
        try {
            // UPSERT: insert with hdcp_level='NONE' or update existing row, increment counter
            $stmt = $this->pdo->prepare("
                INSERT INTO channel_hdcp_profile
                  (channel_id, channel_name, hdcp_level, vst_avg_ms, vst_p95_ms,
                   incident_count, last_incident_at, updated_at)
                VALUES
                  (:channel_id, :channel_name, 'NONE', :vst_ms, :vst_ms,
                   1, :now, :now)
                ON CONFLICT(channel_id) DO UPDATE SET
                  hdcp_level       = 'NONE',
                  channel_name     = excluded.channel_name,
                  vst_avg_ms       = (channel_hdcp_profile.vst_avg_ms * channel_hdcp_profile.incident_count + :vst_ms)
                                     / (channel_hdcp_profile.incident_count + 1),
                  vst_p95_ms       = MAX(channel_hdcp_profile.vst_p95_ms, :vst_ms),
                  incident_count   = channel_hdcp_profile.incident_count + 1,
                  last_incident_at = :now,
                  updated_at       = :now
                WHERE channel_hdcp_profile.decision_locked = 0
            ");
            $now = time();
            $stmt->execute([
                ':channel_id'   => $channelId,
                ':channel_name' => $channelName,
                ':vst_ms'       => $vstMs,
                ':now'          => $now,
            ]);
            return true;
        } catch (Throwable $e) {
            error_log('[conviva-persistence] recordHdcpIncident failed: ' . $e->getMessage());
            return false;
        }
    }

    /**
     * Records a successful play (VST ≤ threshold) — increments successful_play_count
     * but does NOT flip back to TYPE-1 automatically (decision_locked=0 = soft state).
     * Used for analytics/observability only. Silent fail-safe.
     *
     * @param string $channelId
     * @param int    $vstMs
     * @return bool
     */
    public function recordHdcpSuccess(string $channelId, int $vstMs): bool
    {
        if ($this->pdo === null && !$this->init()) {
            return false;
        }
        try {
            $stmt = $this->pdo->prepare("
                UPDATE channel_hdcp_profile SET
                  successful_play_count = successful_play_count + 1,
                  vst_avg_ms = (vst_avg_ms * successful_play_count + :vst_ms) / (successful_play_count + 1),
                  last_success_at = :now,
                  updated_at = :now
                WHERE channel_id = :channel_id
            ");
            $stmt->execute([
                ':channel_id' => $channelId,
                ':vst_ms'     => $vstMs,
                ':now'        => time(),
            ]);
            return true;
        } catch (Throwable $e) {
            error_log('[conviva-persistence] recordHdcpSuccess failed: ' . $e->getMessage());
            return false;
        }
    }

    /**
     * Returns the entire HDCP profile map as a hash {channel_id => hdcp_level}.
     * Used by generator at list-build time to pre-load HDCP decisions.
     * Channels NOT in this map use the default TYPE-1 (aggressive).
     * Silent fail-safe: returns empty array on error.
     *
     * @return array<string,string>  e.g. ['1312008' => 'NONE', '999' => 'TYPE-1']
     */
    public function getHdcpProfileBulk(): array
    {
        if ($this->pdo === null && !$this->init()) {
            return [];
        }
        try {
            $stmt = $this->pdo->query("SELECT channel_id, hdcp_level FROM channel_hdcp_profile");
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
            $out = [];
            foreach ($rows as $r) {
                $out[$r['channel_id']] = $r['hdcp_level'];
            }
            return $out;
        } catch (Throwable $e) {
            error_log('[conviva-persistence] getHdcpProfileBulk failed: ' . $e->getMessage());
            return [];
        }
    }

    /**
     * Returns HDCP-LEVEL for a single channel, or null if no decision stored
     * (caller should use default 'TYPE-1' aggressive in that case).
     *
     * @param string $channelId
     * @return ?string  'TYPE-1' | 'NONE' | null
     */
    public function getHdcpForChannel(string $channelId): ?string
    {
        if ($this->pdo === null && !$this->init()) {
            return null;
        }
        try {
            $stmt = $this->pdo->prepare("SELECT hdcp_level FROM channel_hdcp_profile WHERE channel_id = :cid");
            $stmt->execute([':cid' => $channelId]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            return $row ? (string)$row['hdcp_level'] : null;
        } catch (Throwable $e) {
            error_log('[conviva-persistence] getHdcpForChannel failed: ' . $e->getMessage());
            return null;
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Server-Side QoE Observer (2026-05-19)
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * Records a flush of server-side QoE metrics for a single channel/bucket.
     * Called by qoe-flush.php which receives data from qoe_server_side_observer.lua.
     * Silent fail-safe.
     */
    public function recordServerSideQoE(
        string $channelId,
        int $bucket5min,
        int $vstProxyAvgMs,
        int $vstProxyMaxMs,
        int $rebufferCount,
        int $requestCount,
        int $errorCount,
        int $bitrateAvgBps
    ): bool {
        if ($this->pdo === null && !$this->init()) {
            return false;
        }
        try {
            $stmt = $this->pdo->prepare("
                INSERT INTO server_side_qoe_metrics
                  (channel_id, bucket_5min, vst_proxy_avg, vst_proxy_max,
                   rebuffer_count, request_count, error_count, bitrate_avg_bps, flushed_at)
                VALUES
                  (:cid, :bkt, :vavg, :vmax, :rbf, :req, :err, :bps, :now)
            ");
            $stmt->execute([
                ':cid'  => $channelId,
                ':bkt'  => $bucket5min,
                ':vavg' => $vstProxyAvgMs,
                ':vmax' => $vstProxyMaxMs,
                ':rbf'  => $rebufferCount,
                ':req'  => $requestCount,
                ':err'  => $errorCount,
                ':bps'  => $bitrateAvgBps,
                ':now'  => time(),
            ]);
            return true;
        } catch (Throwable $e) {
            error_log('[conviva-persistence] recordServerSideQoE failed: ' . $e->getMessage());
            return false;
        }
    }

    /**
     * Records a per-profile QoE aggregate row (Feature 1 — Conviva→LAB loop).
     * Called by LabTierQoeAggregator. target_factor is a SUGGESTION (observe-only).
     */
    public function recordProfileQoE(
        string $profile,
        int $bucket5min,
        int $avgVstMs,
        float $rebufferRatio,
        float $errorRatio,
        int $samples,
        float $targetFactor
    ): bool {
        if ($this->pdo === null && !$this->init()) {
            return false;
        }
        try {
            $stmt = $this->pdo->prepare("
                INSERT INTO qoe_profile_aggregates
                  (profile, bucket_5min, avg_vst_ms, rebuffer_ratio, error_ratio, samples, target_factor, observed_at)
                VALUES
                  (:prof, :bkt, :vst, :rbf, :err, :smp, :tf, :now)
            ");
            $stmt->execute([
                ':prof' => $profile,
                ':bkt'  => $bucket5min,
                ':vst'  => $avgVstMs,
                ':rbf'  => $rebufferRatio,
                ':err'  => $errorRatio,
                ':smp'  => $samples,
                ':tf'   => $targetFactor,
                ':now'  => time(),
            ]);
            return true;
        } catch (Throwable $e) {
            error_log('[conviva-persistence] recordProfileQoE failed: ' . $e->getMessage());
            return false;
        }
    }

    /**
     * Returns latest server-side QoE rows per channel (one row per channel,
     * the freshest bucket). For dashboard.
     * @return array<int,array>
     */
    public function readServerSideQoESnapshot(): array
    {
        if ($this->pdo === null && !$this->init()) {
            return [];
        }
        try {
            $stmt = $this->pdo->query("
                SELECT q.* FROM server_side_qoe_metrics q
                INNER JOIN (
                    SELECT channel_id, MAX(bucket_5min) AS latest
                    FROM server_side_qoe_metrics
                    GROUP BY channel_id
                ) m ON q.channel_id = m.channel_id AND q.bucket_5min = m.latest
                ORDER BY q.channel_id
            ");
            return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
        } catch (Throwable $e) {
            error_log('[conviva-persistence] readServerSideQoESnapshot failed: ' . $e->getMessage());
            return [];
        }
    }

    /**
     * Returns full HDCP profile rows for dashboard/analytics. Includes stats.
     * @return array<int,array>
     */
    public function readHdcpProfilesAll(): array
    {
        if ($this->pdo === null && !$this->init()) {
            return [];
        }
        try {
            $stmt = $this->pdo->query("SELECT * FROM channel_hdcp_profile ORDER BY updated_at DESC");
            return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
        } catch (Throwable $e) {
            error_log('[conviva-persistence] readHdcpProfilesAll failed: ' . $e->getMessage());
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

    // ═══════════════════════════════════════════════════════════════════════════════════════
    // ║  MAX_QUALITY OVERRIDE — Persistence methods (2026-05-22)                           ║
    // ═══════════════════════════════════════════════════════════════════════════════════════
    //
    // Bloque de persistencia para la funcionalidad MAX_QUALITY OVERRIDE implementada en
    // m3u8-typed-arrays-ultimate.js (toggle UI → cascada dual hvc1+hev1 / Dolby Vision).
    //
    // FLUJO COMPLETO (E2E de extremo a extremo):
    //
    //   [FRONTEND / GENERADOR]
    //   UI toggle "MAX QUALITY OVERRIDE" → options.maxQualityMode = true
    //   → m3u8-typed-arrays-ultimate.js emite en EXTHTTP del manifest:
    //       X-APE-Max-Quality: 1
    //       X-APE-Codec-Cascade: dual-hvc1-hev1
    //   → Lista generada con cascada 18 codecs (dvh1.08.06...avc1.640028)
    //
    //   [VPS NGINX / LUA — CAPA OBSERVABILIDAD]
    //   Player carga el manifest → VPS recibe X-APE-Max-Quality:1
    //   → qoe_server_side_observer.lua (log_by_lua): captura header
    //       dict["mq:<channel_id>"]    = 1      (TTL 1h)
    //       dict["mqcasc:<channel_id>"] = "dual-hvc1-hev1" (TTL 1h)
    //   → qoe_flush_worker.lua (timer 60s): agrega al payload JSON:
    //       max_quality_channels: [{channel_id, cascade_type, profile}]
    //   → qoe-flush.php: procesa el array y llama recordMaxQualityChannel()
    //
    //   [ESTA CLASE — PERSISTENCIA SQLite]
    //   recordMaxQualityChannel() → INSERT INTO max_quality_channels
    //
    //   [DAEMON ONN / SENTINEL]
    //   ape-uhdx-sentinel.sh descarga manifest del VPS con codec_cascade_per_profile.
    //   La función apply_max_quality_codec_settings() lee ape-codec-cascade.json
    //   y, si detecta "dvh1" en el cascade, aplica ADB settings HEVC/DV adicionales
    //   en el Fire TV (ExoPlayer HEVC hardware decoder preference, color depth 10-bit).
    //
    // AUDITORÍA:
    //   SELECT channel_id, cascade_type, profile, datetime(recorded_at,'unixepoch') as ts
    //   FROM max_quality_channels ORDER BY recorded_at DESC LIMIT 50;

    /**
     * Registra un canal que está siendo consumido con MAX_QUALITY OVERRIDE activo.
     *
     * Llamado por qoe-flush.php desde el payload periódico del flush worker Lua.
     * Un mismo canal puede tener múltiples rows (una por bucket_5min) — permite
     * analizar cuánto tiempo se reprodujo en MAX_QUALITY durante el día.
     *
     * @param  string  $channelId   ID numérico del canal (e.g. "1312008")
     * @param  string  $cascadeType Tipo de cascada dual (e.g. "dual-hvc1-hev1")
     * @param  string  $profile     Perfil APE activo (e.g. "P1")
     * @param  int     $bucket5min  Ventana temporal floor(unix_ts / 300)
     * @return bool    true si se persistió correctamente, false en error silencioso
     */
    public function recordMaxQualityChannel(
        string $channelId,
        string $cascadeType,
        string $profile,
        int    $bucket5min
    ): bool {
        if ($this->pdo === null && !$this->init()) {
            return false;
        }
        try {
            // INSERT OR IGNORE: si el mismo canal ya tiene un row en este bucket_5min
            // (múltiples flush cycles en la misma ventana), no duplicamos.
            // Esto mantiene la tabla limpia sin necesidad de DELETE previo.
            $stmt = $this->pdo->prepare("
                INSERT OR IGNORE INTO max_quality_channels
                    (channel_id, cascade_type, profile, bucket_5min, recorded_at)
                VALUES
                    (:cid, :casc, :prof, :bkt, :now)
            ");
            $stmt->execute([
                ':cid'  => $channelId,
                ':casc' => $cascadeType ?: 'dual-hvc1-hev1',
                ':prof' => $profile ?: 'unknown',
                ':bkt'  => $bucket5min,
                ':now'  => time(),
            ]);
            return true;
        } catch (Throwable $e) {
            error_log('[conviva-persistence] recordMaxQualityChannel failed: ' . $e->getMessage());
            return false;
        }
    }

    /**
     * Retorna los canales con MAX_QUALITY activo en las últimas N horas.
     * Usado por prisma-adb-quality.php?action=mq_channels para el daemon sentinel.
     *
     * @param  int   $hours Ventana histórica (default 1h)
     * @return array<int,array{channel_id:string,cascade_type:string,profile:string,recorded_at:int}>
     */
    public function readMaxQualityChannels(int $hours = 1): array
    {
        if ($this->pdo === null && !$this->init()) {
            return [];
        }
        try {
            $since = time() - ($hours * 3600);
            $stmt  = $this->pdo->prepare("
                SELECT channel_id, cascade_type, profile, MAX(recorded_at) AS recorded_at
                FROM   max_quality_channels
                WHERE  recorded_at >= :since
                GROUP  BY channel_id
                ORDER  BY recorded_at DESC
                LIMIT  500
            ");
            $stmt->execute([':since' => $since]);
            return $stmt->fetchAll(\PDO::FETCH_ASSOC) ?: [];
        } catch (Throwable $e) {
            error_log('[conviva-persistence] readMaxQualityChannels failed: ' . $e->getMessage());
            return [];
        }
    }
    // ═══════════════════════════════════════════════════════════════════════════════════════
    // ║  FIN MAX_QUALITY OVERRIDE methods                                                  ║
    // ═══════════════════════════════════════════════════════════════════════════════════════
}
