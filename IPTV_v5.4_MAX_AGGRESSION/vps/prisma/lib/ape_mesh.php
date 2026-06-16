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
