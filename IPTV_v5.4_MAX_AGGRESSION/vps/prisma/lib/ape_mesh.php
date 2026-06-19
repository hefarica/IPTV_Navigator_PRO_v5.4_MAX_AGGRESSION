<?php
/**
 * ape_mesh.php — F2 malla descentralizada (fan-out de motores DECISORES, sin transcode).
 * Reusable por ape-feedforward.php (one-shot) y ape-feedforward-stream.php (SSE).
 *
 * Devuelve presets = metadata player-blind (#EXT-X-APE-* / #EXTVLCOPT / #KODIPROP).
 * El render real lo hace el on-device; estos presets NUNCA van en STREAM-INF.
 */
if (!function_exists('ape_mesh_presets')) {

    function ape_mesh_presets($chId, array $streamInfo, array $health, $ct) {
        $MODULES = '/var/www/html/cmaf_engine/modules/';
        $engines = array();
        $presets = array();

        $call = function ($modFile, $class, callable $invoke) use ($MODULES, &$engines, &$presets) {
            try {
                if (@is_file($MODULES . $modFile)) {
                    require_once $MODULES . $modFile;
                    if (class_exists($class)) {
                        $d = $invoke();
                        if (is_array($d)) {
                            $engines[$class] = count($d);
                            foreach ($d as $l) { if (is_string($l) && $l !== '') $presets[] = $l; }
                        }
                    }
                }
            } catch (\Throwable $e) {
                @error_log('[ape_mesh] ' . $class . ': ' . $e->getMessage());
            }
        };

        // NeuroBuffer: API 2 pasos (calculateAggression → buildApeTags)
        $call('neuro_buffer_controller.php', 'NeuroBufferController', function () use ($chId, $streamInfo) {
            $bufferPct = (float)(isset($streamInfo['bufferPct']) ? $streamInfo['bufferPct'] : 50);
            $profile = NeuroBufferController::calculateAggression($chId, $bufferPct, array());
            $out = array();
            if (method_exists('NeuroBufferController', 'buildApeTags')) {
                foreach ((array)NeuroBufferController::buildApeTags($profile) as $t) { if (is_string($t) && $t !== '') $out[] = $t; }
            }
            return $out;
        });
        $call('lcevc_phase4_injector.php',    'LcevcPhase4Injector',    function () use ($streamInfo, $health, $ct) { return LcevcPhase4Injector::getDirectives($streamInfo, $health, $ct); });
        $call('hdr10plus_dynamic_engine.php', 'Hdr10PlusDynamicEngine', function () use ($streamInfo, $health, $ct) { return Hdr10PlusDynamicEngine::getDirectives($streamInfo, $health, $ct); });

        $presets = array_values(array_unique($presets));
        return array('engines' => $engines, 'presets' => $presets);
    }

    /**
     * device_settings = el subconjunto HONESTO que el daemon (aplicador puro) SÍ puede escribir
     * vía Android Settings a un player 3rd-party en curso. Los EXTVLCOPT/KODIPROP son list-level
     * (llegan por la lista, no por el daemon) y NO van aquí.
     * Formato: "<ns> <key> <val>" (lo valida la allowlist del SettingsApplier).
     */
    function ape_mesh_device_settings(array $streamInfo) {
        // Doctrina MAX IMAGE FIRST — INCONDICIONAL (2026-06-16): el SDR->HDR como enhancement de
        // display on-device se aplica SIEMPRE, no solo si la fuente probo HDR. hdr_conversion_mode=1
        // (HDR_CONVERSION_SYSTEM) deja que Android convierta SDR->HDR cuando beneficia y haga
        // passthrough del HDR real; degrada con gracia en displays no-HDR. FREEZELESS (Android lo gestiona).
        $ds = array(
            'global match_content_frame_rate 1', // anti-judder universal
            'global hdr_conversion_mode 1',      // SDR->HDR enhancement incondicional (display-side)
        );
        return $ds;
    }

    /** Estado por-device que el VPS correlaciona del tráfico que proxea (qué canal/decode juega). Vacío si aún no hay. */
    function ape_device_state($device) {
        $device = preg_replace('/[^0-9A-Za-z_.\-]/', '', (string)$device);
        if ($device === '') return array();
        $f = '/dev/shm/ape_device_state/' . $device . '.json';
        if (is_file($f)) { $j = json_decode(@file_get_contents($f), true); if (is_array($j)) return $j; }
        return array();
    }

    /** Estado por-IP escrito por el log_by_lua de /omega/open (A1/A2): /dev/shm/ape_devstate_<ip>.json.
     *  Misma sanitizacion que la lua: [^0-9A-Fa-f:.] -> '_'. Devuelve [] si no existe o esta stale. */
    function ape_device_state_by_ip($ip, $maxAgeSec = 300) {
        $ip = (string)$ip;
        if ($ip === '') return array();
        $safe = preg_replace('/[^0-9A-Fa-f:.]/', '_', $ip);
        $f = '/dev/shm/ape_devstate_' . $safe . '.json';
        if (!is_file($f)) return array();
        $j = json_decode(@file_get_contents($f), true);
        if (!is_array($j)) return array();
        if ($maxAgeSec > 0 && isset($j['ts']) && (time() - (int)$j['ts']) > $maxAgeSec) return array();
        return $j;
    }

    /** Mapea content_type libre (del /omega/open) al ct del mesh: sports|cinema|news|default. '' si vacio. */
    function ape_ct_from_content_type($ctRaw) {
        $c = strtolower((string)$ctRaw);
        if ($c === '') return '';
        if (strpos($c,'sport')!==false || strpos($c,'deporte')!==false) return 'sports';
        if (strpos($c,'cine')!==false || strpos($c,'movie')!==false || strpos($c,'cinema')!==false || strpos($c,'pelicula')!==false) return 'cinema';
        if (strpos($c,'news')!==false || strpos($c,'noticia')!==false) return 'news';
        return 'default';
    }

    /**
     * D6 — QoE persistida por canal (server-side PROXY del observer Lua del shield). Read-only,
     * silent-fail, cache estatica 5s para no castigar SQLite a 1Hz. HONESTO: es proxy-QoE de RED
     * (VST_proxy=manifest->1er-segmento, rebuffer=gap segmentos, err=4xx/5xx) reconstruido del
     * trafico que el VPS proxea — NO QoE perceptual del decoder. Devuelve [] si no hay QoE
     * (p.ej. cliente Xray-directo cuyos segmentos NO pasan por el shield -> sin proxy-QoE).
     */
    function ape_qoe_state_by_channel($chId) {
        static $snap = null; static $snapTs = 0;
        $chId = (string)$chId;
        if ($chId === '') return array();

        // 1) QoE REAL de conviva_events (PREFERIDA). Aqui aterrizan: el agente ADB-DIRECTO-POR-IP
        //    (PC lee `adb logcat -s ExoPlayer` del Firestick -> VST/rebuffer/bitrate/frame-drop REALES)
        //    y el browser (sendBeacon). conviva-event.php calcula qoe_score 0-100. Ventana 60s.
        try {
            if (@is_file('/var/www/html/prisma/lib/conviva_persistence.php')) {
                require_once '/var/www/html/prisma/lib/conviva_persistence.php';
                if (class_exists('ConvivaPersistence')) {
                    $db = new PDO('sqlite:' . ConvivaPersistence::DEFAULT_DB_PATH);
                    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_SILENT);
                    $st = $db->prepare("SELECT qoe_score, data_json FROM conviva_events WHERE channel_id = :c AND qoe_score IS NOT NULL AND inserted_at > :since ORDER BY timestamp_ms DESC LIMIT 1");
                    $st->execute(array(':c' => $chId, ':since' => time() - 60));
                    $ev = $st->fetch(PDO::FETCH_ASSOC);
                    if ($ev && isset($ev['qoe_score']) && $ev['qoe_score'] !== null) {
                        $d = json_decode(isset($ev['data_json']) ? (string)$ev['data_json'] : '{}', true);
                        if (!is_array($d)) $d = array();
                        return array(
                            'source'    => 'real',
                            'qoe_score' => (float)$ev['qoe_score'],
                            'vst'       => isset($d['vst_ms']) ? (float)$d['vst_ms'] : null,
                            'rebuffer'  => isset($d['rebuffer_duration_ms']) ? (float)$d['rebuffer_duration_ms'] : null,
                        );
                    }
                }
            }
        } catch (\Throwable $e) { /* silent -> cae al proxy server-side */ }

        // 2) Fallback PROXY-QoE del observer server-side (server_side_qoe_metrics). Cache estatica 5s.
        $now = time();
        if ($snap === null || ($now - $snapTs) > 5) {
            $snap = array();
            try {
                if (@is_file('/var/www/html/prisma/lib/conviva_persistence.php')) {
                    require_once '/var/www/html/prisma/lib/conviva_persistence.php';
                    if (class_exists('ConvivaPersistence')) {
                        $p = new ConvivaPersistence();
                        foreach ((array)$p->readServerSideQoESnapshot() as $row) {
                            if (is_array($row) && isset($row['channel_id'])) $snap[(string)$row['channel_id']] = $row;
                        }
                    }
                }
            } catch (\Throwable $e) { $snap = array(); }
            $snapTs = $now;
        }
        $r = isset($snap[$chId]) ? $snap[$chId] : null;
        if (!is_array($r)) return array();
        $pick = function ($keys) use ($r) {
            foreach ($keys as $k) { if (isset($r[$k]) && is_numeric($r[$k])) return (float)$r[$k]; }
            return null;
        };
        // Columnas reales de server_side_qoe_metrics: vst_proxy_avg/max, rebuffer_count,
        // request_count, error_count, bitrate_avg_bps (ver conviva_persistence::recordServerSideQoE).
        return array(
            'source'   => 'proxy',
            'vst'      => $pick(array('vst_proxy_avg', 'vst_proxy_max', 'vst_avg', 'vst', 'vst_proxy', 'vst_ms')),
            'rebuffer' => $pick(array('rebuffer_count', 'rebuffer', 'rebuffer_ratio', 'rebuffer_proxy')),
            'err'      => $pick(array('error_count', 'err', 'err4xx', 'err5xx')),
            'req'      => $pick(array('request_count', 'req', 'req_count', 'requests')),
        );
    }

    /**
     * D6 — Mapea QoE proxy -> riskScore 0..100 (umbrales tipo conviva-qoe-engine.js). VST_proxy alto,
     * rebuffer alto o error-rate alto => mas riesgo => los engines decisores (NeuroBuffer/LCEVC/HDR10+)
     * reducen agresion. Sin QoE (cliente no observado por el shield) => 0 = comportamiento actual (no degrada).
     */
    function ape_risk_from_qoe(array $qoe) {
        if (empty($qoe)) return 0.0;
        // QoE REAL (conviva_events): qoe_score 0-100 (100=perfecto) -> risk = 100 - qoe_score.
        if (isset($qoe['qoe_score'])) return max(0.0, min(100.0, 100.0 - (float)$qoe['qoe_score']));
        // PROXY (server-side): derivar de vst/rebuffer/error.
        $risk = 0.0;
        $vst = isset($qoe['vst']) ? $qoe['vst'] : null;
        if ($vst !== null) { if ($vst > 6000) $risk += 45; elseif ($vst > 3000) $risk += 25; elseif ($vst > 1500) $risk += 10; }
        $reb = isset($qoe['rebuffer']) ? $qoe['rebuffer'] : null;   // rebuffer_count (conteo por bucket)
        if ($reb !== null) { if ($reb > 10) $risk += 40; elseif ($reb > 3) $risk += 22; elseif ($reb > 0) $risk += 8; }
        $req = (isset($qoe['req']) && $qoe['req'] > 0) ? $qoe['req'] : null;
        $err = isset($qoe['err']) ? (float)$qoe['err'] : 0.0;       // error_count (4xx+5xx)
        if ($req !== null && $err > 0) { $rate = $err / $req; if ($rate > 0.1) $risk += 30; elseif ($rate > 0.03) $risk += 15; }
        return min(100.0, $risk);
    }

    // ── Phase G — ROLLBACK PQ->SDR per-canal (FREEZELESS) ───────────────────────
    // Si la QoE detecta pantallazo negro (VST_CRITICAL) en un canal con PQ activo, ese canal
    // queda blacklisted -> el SSE emite hdr_conversion=0 y el generador emite VIDEO-RANGE=SDR
    // para ESE canal. Mantiene PQ INCONDICIONAL por defecto; solo revierte lo que realmente rompe.
    // Espejo del patron HDCP-Adaptive (channel_hdcp_profile). Tabla en conviva.db. NO mid-stream.
    function ape_pq_db() {
        static $pdo = null; static $tried = false;
        if ($tried) return $pdo;
        $tried = true;
        try {
            $p = '/opt/netshield/data/conviva.db';
            if (@is_file('/var/www/html/prisma/lib/conviva_persistence.php')) {
                require_once '/var/www/html/prisma/lib/conviva_persistence.php';
                if (class_exists('ConvivaPersistence')) $p = ConvivaPersistence::DEFAULT_DB_PATH;
            }
            $pdo = new PDO('sqlite:' . $p);
            $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_SILENT);
            $pdo->exec("CREATE TABLE IF NOT EXISTS channel_pq_profile (
                channel_id TEXT PRIMARY KEY,
                pq_level TEXT NOT NULL DEFAULT 'SDR' CHECK(pq_level IN ('PQ','SDR')),
                vst_ms INTEGER DEFAULT 0,
                incident_count INTEGER DEFAULT 0,
                last_incident_at INTEGER,
                updated_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER)))");
        } catch (\Throwable $e) { $pdo = null; }
        return $pdo;
    }

    /** True si el canal esta blacklisted (PQ->SDR). Read-only, silent-fail. */
    function ape_pq_is_blacklisted($chId) {
        $chId = (string)$chId; if ($chId === '') return false;
        $db = ape_pq_db(); if (!$db) return false;
        try {
            $st = $db->prepare("SELECT pq_level FROM channel_pq_profile WHERE channel_id = :c LIMIT 1");
            $st->execute(array(':c' => $chId));
            $r = $st->fetch(PDO::FETCH_ASSOC);
            return ($r && isset($r['pq_level']) && $r['pq_level'] === 'SDR');
        } catch (\Throwable $e) { return false; }
    }

    /** Registra un incidente PQ (pantallazo negro) -> blacklist el canal. UPSERT idempotente. */
    function ape_pq_record_incident($chId, $vstMs = 0) {
        $chId = (string)$chId; if ($chId === '') return false;
        $db = ape_pq_db(); if (!$db) return false;
        try {
            $st = $db->prepare("INSERT INTO channel_pq_profile (channel_id, pq_level, vst_ms, incident_count, last_incident_at, updated_at)
                VALUES (:c,'SDR',:v,1,:t,:t)
                ON CONFLICT(channel_id) DO UPDATE SET pq_level='SDR', vst_ms=:v, incident_count=incident_count+1, last_incident_at=:t, updated_at=:t");
            $st->execute(array(':c' => $chId, ':v' => (int)$vstMs, ':t' => time()));
            return true;
        } catch (\Throwable $e) { return false; }
    }

    /** Mapa {channel_id: pq_level} de todos los blacklisted (para el bulk del generador). */
    function ape_pq_blacklist_map() {
        $db = ape_pq_db(); if (!$db) return array();
        try {
            $out = array();
            foreach ($db->query("SELECT channel_id, pq_level FROM channel_pq_profile WHERE pq_level='SDR'") as $r) {
                if (isset($r['channel_id'])) $out[(string)$r['channel_id']] = 'SDR';
            }
            return $out;
        } catch (\Throwable $e) { return array(); }
    }

    /** Construye streamInfo+health desde los params GET (URL-2). */
    function ape_mesh_inputs_from_get() {
        $streamInfo = array(
            'hdr_type'  => isset($_GET['hdr'])   ? preg_replace('/[^0-9A-Za-z+._-]/', '', $_GET['hdr'])   : '',
            'width'     => (int)(isset($_GET['w']) ? $_GET['w'] : 0),
            'height'    => (int)(isset($_GET['h']) ? $_GET['h'] : 0),
            'codec'     => isset($_GET['codec']) ? preg_replace('/[^0-9A-Za-z+._-]/', '', $_GET['codec']) : '',
            'bufferPct' => (float)(isset($_GET['buf']) ? $_GET['buf'] : 50),
        );
        $health = array('riskScore' => (float)(isset($_GET['risk']) ? $_GET['risk'] : 0));
        $ct = (isset($_GET['ct']) && in_array($_GET['ct'], array('sports','cinema','news','default'), true)) ? $_GET['ct'] : 'default';
        return array($streamInfo, $health, $ct);
    }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * OMEGA ARA URL-2 — policy-deltas bus (Council-safe cherry-pick, 2026-06-16).
 * APPEND-ONLY · additive (todo if(!function_exists)) · DB canónica = conviva.db
 * (NUNCA una ape_url2.db paralela). Players ciegos a #EXT-X-APE-*; el ARA aplica
 * SOLO device_settings allowlisted. No reemplaza nada del bloque de arriba.
 * ═══════════════════════════════════════════════════════════════════════════ */

if (!function_exists('ape_policy_db_path')) {
    function ape_policy_db_path() {
        if (class_exists('ConvivaPersistence') && defined('ConvivaPersistence::DEFAULT_DB_PATH')) {
            return ConvivaPersistence::DEFAULT_DB_PATH;
        }
        $env = getenv('CONVIVA_DB_PATH');
        if (is_string($env) && $env !== '') { return $env; }
        return '/opt/netshield/data/conviva.db';
    }
}

if (!function_exists('ape_policy_db')) {
    function ape_policy_db() {
        $path = ape_policy_db_path();
        $dir = dirname($path);
        if (!is_dir($dir)) { @mkdir($dir, 0775, true); }
        $pdo = new PDO('sqlite:' . $path, null, null, array(
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ));
        $pdo->exec('PRAGMA journal_mode=WAL');
        $pdo->exec('PRAGMA busy_timeout=3000');
        ape_policy_ensure_tables($pdo);
        return $pdo;
    }
}

if (!function_exists('ape_policy_ensure_tables')) {
    function ape_policy_ensure_tables(PDO $pdo) {
        $pdo->exec("CREATE TABLE IF NOT EXISTS policy_deltas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at INTEGER NOT NULL,
            expires_at INTEGER NULL,
            target_device_id TEXT NULL,
            channel_id TEXT NULL,
            delta_type TEXT NOT NULL,
            priority INTEGER NOT NULL DEFAULT 50,
            payload_json TEXT NOT NULL,
            applied_count INTEGER NOT NULL DEFAULT 0,
            source TEXT NOT NULL DEFAULT 'conviva-event'
        )");
        $pdo->exec("CREATE INDEX IF NOT EXISTS idx_policy_deltas_target
            ON policy_deltas(target_device_id, channel_id, id)");
        $pdo->exec("CREATE INDEX IF NOT EXISTS idx_policy_deltas_expires
            ON policy_deltas(expires_at)");
        $pdo->exec("CREATE TABLE IF NOT EXISTS ara_heartbeats (
            device_id TEXT PRIMARY KEY,
            last_seen INTEGER NOT NULL,
            channel_id TEXT NULL,
            player TEXT NULL,
            ara_version TEXT NULL,
            state TEXT NULL,
            caps_json TEXT NULL,
            last_error TEXT NULL
        )");
    }
}

if (!function_exists('ape_normalize_channel_id')) {
    function ape_normalize_channel_id($channel_id) {
        $s = strtolower(trim((string)$channel_id));
        $s = preg_replace('/\s+/', '_', $s);
        $s = preg_replace('/[^a-z0-9_.\-]/', '', $s);
        return $s !== '' ? $s : 'unknown';
    }
}

if (!function_exists('ape_insert_delta')) {
    function ape_insert_delta($device_id, $channel_id, $delta_type, array $payload, array $opts = array()) {
        $pdo = ape_policy_db();
        $now = time();
        $ttl = isset($opts['ttl_seconds']) ? (int)$opts['ttl_seconds'] : 900;
        $expires = $ttl > 0 ? $now + $ttl : null;
        $priority = isset($opts['priority']) ? (int)$opts['priority'] : 50;
        $source = isset($opts['source']) ? (string)$opts['source'] : 'conviva-event';
        $ch = $channel_id !== null ? ape_normalize_channel_id($channel_id) : null;
        $payload['_meta'] = array('created_at' => $now, 'source' => $source, 'schema' => 'ape.policy_delta.v1');
        $stmt = $pdo->prepare('INSERT INTO policy_deltas
            (created_at, expires_at, target_device_id, channel_id, delta_type, priority, payload_json, source)
            VALUES (:created_at, :expires_at, :device, :channel, :type, :priority, :payload, :source)');
        $stmt->execute(array(
            ':created_at' => $now,
            ':expires_at' => $expires,
            ':device' => $device_id ?: null,
            ':channel' => $ch,
            ':type' => $delta_type,
            ':priority' => $priority,
            ':payload' => json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
            ':source' => $source,
        ));
        return (int)$pdo->lastInsertId();
    }
}

if (!function_exists('ape_ara_heartbeat')) {
    function ape_ara_heartbeat($device_id, array $data = array()) {
        $pdo = ape_policy_db();
        $stmt = $pdo->prepare('INSERT INTO ara_heartbeats
            (device_id, last_seen, channel_id, player, ara_version, state, caps_json, last_error)
            VALUES (:device_id, :last_seen, :channel_id, :player, :version, :state, :caps, :err)
            ON CONFLICT(device_id) DO UPDATE SET
              last_seen=excluded.last_seen, channel_id=excluded.channel_id, player=excluded.player,
              ara_version=excluded.ara_version, state=excluded.state, caps_json=excluded.caps_json,
              last_error=excluded.last_error');
        $stmt->execute(array(
            ':device_id' => (string)$device_id,
            ':last_seen' => time(),
            ':channel_id' => isset($data['channel_id']) ? ape_normalize_channel_id($data['channel_id']) : null,
            ':player' => isset($data['player']) ? $data['player'] : null,
            ':version' => isset($data['ara_version']) ? $data['ara_version'] : null,
            ':state' => isset($data['state']) ? $data['state'] : null,
            ':caps' => isset($data['caps']) ? json_encode($data['caps'], JSON_UNESCAPED_SLASHES) : null,
            ':err' => isset($data['last_error']) ? $data['last_error'] : null,
        ));
    }
}

/* ── Anti-flap del rollback PQ->SDR del ARA (MUST-FIX del council) ──────────────
 * Reusa la tabla channel_pq_profile existente (incident_count/last_incident_at) SIN
 * tocar ape_pq_record_incident. Flag OFF por defecto = cero cambio de comportamiento. */
if (!function_exists('ape_ara_rollback_enabled')) {
    function ape_ara_rollback_enabled() { return getenv('APE_PQ_ROLLBACK_ENABLED') === '1'; }
}

if (!function_exists('ape_pq_incident_state')) {
    function ape_pq_incident_state($chId) {
        $out = array('count' => 0, 'last_at' => 0);
        if (!function_exists('ape_pq_db')) { return $out; }
        $db = ape_pq_db(); if (!$db) { return $out; }
        try {
            $st = $db->prepare("SELECT incident_count, last_incident_at FROM channel_pq_profile WHERE channel_id = :c LIMIT 1");
            $st->execute(array(':c' => (string)$chId));
            $r = $st->fetch(PDO::FETCH_ASSOC);
            if ($r) { $out['count'] = (int)$r['incident_count']; $out['last_at'] = (int)$r['last_incident_at']; }
        } catch (\Throwable $e) {}
        return $out;
    }
}

/* True SOLO si: flag ON + incidentes >= MIN(>=2) + cooldown desde el último delta phase_g del canal. */
if (!function_exists('ape_pq_should_emit_ara_rollback')) {
    function ape_pq_should_emit_ara_rollback($chId) {
        if (!ape_ara_rollback_enabled()) { return false; }
        $min = (int)(getenv('APE_PQ_ROLLBACK_INCIDENTS_MIN') ?: 2);
        $min = $min < 2 ? 2 : $min;
        $cooldown = (int)(getenv('APE_PQ_ROLLBACK_COOLDOWN_SECONDS') ?: 1800);
        $st = ape_pq_incident_state($chId);
        if ($st['count'] < $min) { return false; }
        try {
            $db = ape_policy_db();
            $q = $db->prepare("SELECT MAX(created_at) AS last FROM policy_deltas WHERE source='phase_g' AND channel_id = :c");
            $q->execute(array(':c' => ape_normalize_channel_id($chId)));
            $r = $q->fetch(PDO::FETCH_ASSOC);
            $last = ($r && $r['last']) ? (int)$r['last'] : 0;
            if ($last > 0 && (time() - $last) < $cooldown) { return false; }
        } catch (\Throwable $e) {}
        return true;
    }
}

/* ── Tuning AI-PQ por content-type (el VPS DECIDE el perfil; el ARA aplica los keys que su SoC expone) ──
 * El ARA reporta el contenido decodificado (res/fps/codec) por QoE; el VPS infiere el ct y empuja el
 * perfil PQ por device (serial), anti-spam (solo si cambio). Post-procesado real en el VPP del device. */
if (!function_exists('ape_pq_settings_for_ct')) {
    function ape_pq_settings_for_ct($ct) {
        $base = array(
            'pq_ai_sr_enable' => 1, 'ai_sr_level' => 3, 'ai_pq_mode' => 3, 'aipq_enable' => 1,
            'pq_sharpness_enable' => 1, 'pq_ai_dnr_enable' => 1, 'pq_dnr_enable' => 1, 'pq_nr_enable' => 1,
            'pq_ai_fbc_enable' => 1, 'pq_hdr_enable' => 1, 'pq_hdr_mode' => 1,
            'match_content_frame_rate' => 1, 'hdr_conversion_mode' => 1,
        );
        switch ($ct) {
            case 'sports': // movimiento (fps alto): denoise OFF (preserva textura/grano), SR+sharp ON
                $base['pq_ai_dnr_enable'] = 0; $base['pq_dnr_enable'] = 0; $base['pq_nr_enable'] = 0; break;
            case 'compressed': // baja-bitrate: MAX denoise, sharpness OFF (no amplificar bloques/ruido MPEG)
                $base['pq_sharpness_enable'] = 0; break;
            case 'lowres_boost': // SD/HD: AI-SR agresivo + sharp + denoise (upscale a experiencia UHD) -> all max
            case 'cinema': case 'news': case 'default': case 'max_image': default: break; // all max
        }
        return $base;
    }
}

if (!function_exists('ape_ct_from_qoe')) {
    function ape_ct_from_qoe($data) {
        // Content-adaptive: el VPS elige el perfil VPP que COMPENSA la ineficiencia especifica del contenido
        // que el ARA decodifica (fps/resolucion/bitrate). "Espejo" por contenido.
        $fps = 0.0;
        if (isset($data['framerate'])) $fps = (float)$data['framerate'];
        elseif (isset($data['fps'])) $fps = (float)$data['fps'];
        $h = 0;
        if (isset($data['resolution']) && preg_match('/[x\xc3\x97](\d{3,4})/', (string)$data['resolution'], $m)) $h = (int)$m[1];
        $bps = isset($data['bitrate_bps']) ? (int)$data['bitrate_bps'] : 0;
        if ($fps >= 48) return 'sports';                          // alta cadencia -> preserva movimiento
        if ($h > 0 && $h <= 720) return 'lowres_boost';           // SD/HD -> AI-SR agresivo (sube a UHD)
        if ($bps > 0 && $bps < 6000000) return 'compressed';      // baja-bitrate -> max denoise, sin sobre-sharpen
        return 'max_image';                                       // 4K/buen-bitrate -> todo al maximo
    }
}

if (!function_exists('ape_pq_push_for_device')) {
    function ape_pq_push_for_device($deviceId, $ct) {
        if (!$deviceId) return 0;
        $did = preg_replace('/[^0-9A-Za-z_.\-]/', '', (string)$deviceId);
        $f = '/dev/shm/ape_pq_ct_' . $did;                    // anti-spam: solo empuja si el ct cambio
        $prev = @file_get_contents($f);
        if ($prev !== false && trim($prev) === $ct) return 0;
        @file_put_contents($f, $ct);
        $s = ape_pq_settings_for_ct($ct);
        return ape_insert_delta($did, null, 'device-setting',
            array('settings' => $s, 'profile' => 'PQ_' . strtoupper($ct)),
            array('source' => 'mesh-pq-ct', 'ttl_seconds' => 1800, 'priority' => 80));
    }
}

/* ── PUENTE #1 policy_delta -> feedforward (Canonical 4K Manifest). Council wyj9fvcrf, GO_WITH_FIXES.
 * Lee el ULTIMO device-setting vigente del device y lo emite como "<ns> <key> <val>" para que el APK
 * FeedForwardClient aplique los 13 levers VPP (hoy solo 2 globals). Read-only, silent-fail, cache 5s.
 * NS=GLOBAL: PROBADO por dump 'settings list global' del MT8696 (backend/onn_settings_global_pq.txt)
 * que trae TODOS los pq_, ai_sr, aipq, ai_pic_mode=3 en GLOBAL. ai_pq_mode NO existe en el SoC -> el
 * real es ai_pic_mode (dump L2): se emiten AMBOS. NO transcode (settings put = post-proceso VPP). */
if (!function_exists('ape_ff_settings_ns_map')) {
    function ape_ff_settings_ns_map() {
        return array(
            'match_content_frame_rate' => 'global', 'hdr_conversion_mode' => 'global',
            'pq_ai_sr_enable' => 'global', 'ai_sr_level' => 'global', 'aisr_enable' => 'global',
            'aipq_enable' => 'global', 'pq_sharpness_enable' => 'global',
            'pq_ai_dnr_enable' => 'global', 'pq_dnr_enable' => 'global', 'pq_nr_enable' => 'global',
            'pq_ai_fbc_enable' => 'global', 'pq_hdr_enable' => 'global', 'pq_hdr_mode' => 'global',
            'ai_pq_mode' => 'global', 'ai_pic_mode' => 'global',
        );
    }
}
if (!function_exists('ape_ff_device_settings_from_delta')) {
    function ape_ff_device_settings_from_delta($device) {
        static $cache = array(); static $cacheTs = array();
        $device = preg_replace('/[^0-9A-Za-z_.\-]/', '', (string)$device);
        if ($device === '') return array();
        $now = time();
        if (isset($cache[$device]) && ($now - $cacheTs[$device]) <= 5) return $cache[$device];
        $out = array();
        try {
            $db = ape_policy_db();
            $st = $db->prepare("SELECT payload_json FROM policy_deltas
                WHERE delta_type='device-setting'
                  AND (expires_at IS NULL OR expires_at >= :now)
                  AND (target_device_id IS NULL OR target_device_id='' OR target_device_id='*' OR target_device_id=:dev)
                ORDER BY id DESC LIMIT 1");
            $st->execute(array(':now' => $now, ':dev' => $device));
            $row = $st->fetch(PDO::FETCH_ASSOC);
            if ($row && !empty($row['payload_json'])) {
                $p = json_decode((string)$row['payload_json'], true);
                $s = (is_array($p) && isset($p['settings']) && is_array($p['settings'])) ? $p['settings'] : array();
                $nsMap = ape_ff_settings_ns_map();
                foreach ($s as $k => $v) {
                    $k = (string)$k;
                    if (!isset($nsMap[$k])) continue;               // allowlist por key (espeja el APK)
                    if (!(is_int($v) || is_float($v) || (is_string($v) && preg_match('/^-?\d{1,4}$/', $v)))) continue;
                    $out[] = $nsMap[$k] . ' ' . $k . ' ' . (string)(int)$v;
                    if ($k === 'ai_pq_mode') $out[] = 'global ai_pic_mode ' . (string)(int)$v; // nombre real MT8696
                }
            }
        } catch (\Throwable $e) { $out = array(); }                 // silent-fail: caen los 2 globals
        $cache[$device] = $out; $cacheTs[$device] = $now;
        return $out;
    }
}
