<?php
/**
 * list_header_store.php — per-channel / per-profile HTTP-header ARRAY store, indexed PER LIST.
 *
 * Owner: "esos headers deben ser servidos por canal o perfil y deben actualizarse como ARRAYS para
 * cada lista". This stores, for each registered list, the array of HTTP headers (the #EXTHTTP block
 * + per-channel directives) keyed by channel_id and profile, so the agent serves them by channel OR
 * by profile, and a list re-ingest refreshes the arrays for that list.
 *
 * SQLite (PDO, WAL) in the same ape_lists.db as list_registry. Mirrors conviva_persistence patterns.
 * Two grains:
 *   • per-channel : list_channel_headers(list_id, channel_id, profile, headers_json)
 *   • per-profile : list_profile_headers(list_id, profile, headers_json)   (the shared/default set)
 */
declare(strict_types=1);

if (!function_exists('lhs_db')) {
    function lhs_db(): PDO {
        static $db = null;
        if ($db !== null) return $db;
        $path = '/var/www/html/prisma/db/ape_lists.db';
        if (!is_dir(dirname($path))) { @mkdir(dirname($path), 0775, true); }
        $db = new PDO('sqlite:' . $path);
        $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $db->exec('PRAGMA journal_mode=WAL');
        $db->exec('PRAGMA busy_timeout=3000');
        $db->exec("CREATE TABLE IF NOT EXISTS list_channel_headers (
            list_id      TEXT NOT NULL,
            channel_id   TEXT NOT NULL,
            profile      TEXT,
            headers_json TEXT NOT NULL,
            updated_at   INTEGER,
            PRIMARY KEY (list_id, channel_id)
        )");
        $db->exec("CREATE INDEX IF NOT EXISTS idx_lch_profile ON list_channel_headers(list_id, profile)");
        $db->exec("CREATE TABLE IF NOT EXISTS list_profile_headers (
            list_id      TEXT NOT NULL,
            profile      TEXT NOT NULL,
            headers_json TEXT NOT NULL,
            updated_at   INTEGER,
            PRIMARY KEY (list_id, profile)
        )");
        return $db;
    }
}

/** Upsert the header ARRAY for one channel of a list. $headers = assoc array (header=>value). */
function lhs_put_channel(string $listId, string $channelId, ?string $profile, array $headers): bool {
    try {
        $st = lhs_db()->prepare("INSERT INTO list_channel_headers (list_id, channel_id, profile, headers_json, updated_at)
            VALUES (?,?,?,?,?)
            ON CONFLICT(list_id, channel_id) DO UPDATE SET profile=excluded.profile,
                headers_json=excluded.headers_json, updated_at=excluded.updated_at");
        return $st->execute(array($listId, $channelId, $profile,
            json_encode($headers, JSON_UNESCAPED_SLASHES), time()));
    } catch (Exception $e) { return false; }
}

/** Upsert the shared per-profile header ARRAY for a list (the default set for that profile). */
function lhs_put_profile(string $listId, string $profile, array $headers): bool {
    try {
        $st = lhs_db()->prepare("INSERT INTO list_profile_headers (list_id, profile, headers_json, updated_at)
            VALUES (?,?,?,?)
            ON CONFLICT(list_id, profile) DO UPDATE SET headers_json=excluded.headers_json, updated_at=excluded.updated_at");
        return $st->execute(array($listId, $profile, json_encode($headers, JSON_UNESCAPED_SLASHES), time()));
    } catch (Exception $e) { return false; }
}

/** Get the header array for one channel; falls back to the list's per-profile default if absent. */
function lhs_get_channel(string $listId, string $channelId, ?string $profile = null): array {
    try {
        $st = lhs_db()->prepare("SELECT headers_json FROM list_channel_headers WHERE list_id=? AND channel_id=? LIMIT 1");
        $st->execute(array($listId, $channelId));
        $row = $st->fetch(PDO::FETCH_ASSOC);
        if ($row && $row['headers_json']) { $h = json_decode($row['headers_json'], true); if (is_array($h)) return $h; }
        if ($profile !== null) return lhs_get_profile($listId, $profile);
    } catch (Exception $e) {}
    return array();
}

/** Get the shared per-profile header array for a list. */
function lhs_get_profile(string $listId, string $profile): array {
    try {
        $st = lhs_db()->prepare("SELECT headers_json FROM list_profile_headers WHERE list_id=? AND profile=? LIMIT 1");
        $st->execute(array($listId, $profile));
        $row = $st->fetch(PDO::FETCH_ASSOC);
        if ($row && $row['headers_json']) { $h = json_decode($row['headers_json'], true); if (is_array($h)) return $h; }
    } catch (Exception $e) {}
    return array();
}

/** Bulk: all channels' header arrays for a list (or just for a profile). For the generator pre-load. */
function lhs_bulk(string $listId, ?string $profile = null): array {
    $out = array();
    try {
        if ($profile !== null) {
            $st = lhs_db()->prepare("SELECT channel_id, headers_json FROM list_channel_headers WHERE list_id=? AND profile=?");
            $st->execute(array($listId, $profile));
        } else {
            $st = lhs_db()->prepare("SELECT channel_id, headers_json FROM list_channel_headers WHERE list_id=?");
            $st->execute(array($listId));
        }
        foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $h = json_decode($r['headers_json'], true);
            if (is_array($h)) $out[$r['channel_id']] = $h;
        }
    } catch (Exception $e) {}
    return $out;
}

/** Wipe + refresh a list's header arrays (call before re-ingesting a list). */
function lhs_clear_list(string $listId): bool {
    try {
        lhs_db()->prepare("DELETE FROM list_channel_headers WHERE list_id=?")->execute(array($listId));
        lhs_db()->prepare("DELETE FROM list_profile_headers WHERE list_id=?")->execute(array($listId));
        return true;
    } catch (Exception $e) { return false; }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * LIVE HEADER-VALUE OVERLAY (bridge from ape_header_value_publisher.lua)
 * ───────────────────────────────────────────────────────────────────────────
 * NAMES are owned by the store (lhs_get_channel/lhs_get_profile). VALUES of the
 * LIVE subset are overlaid from the 2s Lua spool /dev/shm/ape_header_values.json.
 * Freezeless: stale/missing/cold spool ⇒ STATIC values served unchanged. The
 * bridge NEVER invents a header name (except the 2 allowlisted provenance names),
 * NEVER adds a toxic header, and every value is CRLF-injection-stripped.
 *
 * Usage in the serve path (ape-cartridge-agent.php / list-headers-bulk.php):
 *   $listHeaders = lhs_get_channel($listId, $ch, $profile);   // STEP 1: names+static
 *   $merged      = lhs_get_channel_live($listId, $ch, $profile, $isSports); // overlay
 *   foreach ($merged as $hk => $hv) header($hk.': '.$hv, true);
 * ═══════════════════════════════════════════════════════════════════════════ */

if (!defined('LHS_SPOOL_PATH'))   define('LHS_SPOOL_PATH', '/dev/shm/ape_header_values.json');
if (!defined('LHS_SPOOL_MAX_AGE')) define('LHS_SPOOL_MAX_AGE', 6); // >2 ticks (2s) of slack

/** The exact set of header NAMES whose VALUES the live bridge is allowed to override. */
function lhs_live_header_set(): array {
    static $set = null;
    if ($set !== null) return $set;
    $set = array_flip(array(
        'X-APE-Bandwidth', 'X-APE-Avg-Bandwidth', 'X-APE-Framerate-Q', 'X-Framerate',
        'X-VMAF-Target', 'X-Expected-Bitrate', 'X-Average-Bitrate', 'X-Buffer-Target',
        'X-Buffer-MB', 'X-Buffer-Segments', 'X-QoS-Mode', 'X-QoE-Target-MOS',
        'X-Rebuffer-Tolerance', 'X-Zapping-Max', 'X-Startup-Max',
        'X-APE-Error-State', 'X-APE-Bw-State', 'User-Agent',
    ));
    return $set;
}

/** Names the bridge MAY add even if not already in $listHeaders (provenance only). */
function lhs_live_addable_set(): array {
    static $set = null;
    if ($set !== null) return $set;
    $set = array_flip(array('X-APE-Error-State', 'X-APE-Bw-State'));
    return $set;
}

/** Names that must NEVER be emitted as a header value (response-framing / hop). */
function lhs_toxic_header_set(): array {
    static $set = null;
    if ($set !== null) return $set;
    $set = array_flip(array(
        'Set-Cookie', 'Location', 'Content-Length', 'Transfer-Encoding',
        'Connection', 'Host', 'Content-Encoding',
    ));
    return $set;
}

/** CRLF-injection-safe value sanitizer (mirror of the Lua-side strip). */
function lhs_sanitize_value($v): string {
    return preg_replace('/[\x00-\x1f\x7f]/', '', (string)$v);
}

/**
 * Load the live spool and return ['fresh'=>bool, 'spool'=>array|null].
 * Silent-fail on every error (=> not fresh) so the serve path is freezeless.
 */
function lhs_load_spool(): array {
    try {
        $raw = @file_get_contents(LHS_SPOOL_PATH);
        if ($raw === false || $raw === '') return array('fresh' => false, 'spool' => null);
        $spool = json_decode($raw, true);
        if (!is_array($spool) || !isset($spool['tick_ts'])) {
            return array('fresh' => false, 'spool' => null);
        }
        $age   = time() - (int)$spool['tick_ts'];
        $fresh = ($age >= 0 && $age <= LHS_SPOOL_MAX_AGE);
        return array('fresh' => $fresh, 'spool' => $spool);
    } catch (Throwable $e) {
        return array('fresh' => false, 'spool' => null);
    }
}

/**
 * Merge the live spool over a static header array. Precedence (low→high):
 *   static  <  profiles[$profile]  <  profiles['sports_'.$profile] (if $isSports)
 *           <  global  <  channels[$channelId]   (most specific wins)
 * Only NAMES already in $listHeaders are overridden (live set gated); the 2
 * provenance names are added if absent; toxic names are dropped; all values
 * CRLF-stripped. If $spool is not fresh, returns $listHeaders unchanged (static).
 */
function lhs_merge_live(array $listHeaders, ?array $spool, bool $fresh,
                        ?string $profile, ?string $channelId, bool $isSports = false): array {
    if (!$fresh || !is_array($spool)) return $listHeaders; // freezeless: serve static

    // Build the live layer by precedence.
    $live = array();
    $apply = function($src) use (&$live) {
        if (is_array($src)) { foreach ($src as $k => $v) { $live[$k] = $v; } }
    };
    if ($profile !== null && isset($spool['profiles'][$profile])) {
        $apply($spool['profiles'][$profile]);
    }
    if ($isSports && $profile !== null && isset($spool['profiles']['sports_' . $profile])) {
        $apply($spool['profiles']['sports_' . $profile]);
    }
    if (isset($spool['global'])) $apply($spool['global']);
    if ($channelId !== null && isset($spool['channels'][$channelId])) {
        $apply($spool['channels'][$channelId]);
    }
    if (empty($live)) return $listHeaders;

    $liveSet    = lhs_live_header_set();
    $addable    = lhs_live_addable_set();
    $toxic      = lhs_toxic_header_set();
    $merged     = $listHeaders;

    foreach ($live as $name => $val) {
        if (isset($toxic[$name])) continue;                 // never emit framing headers
        if (!isset($liveSet[$name])) continue;              // only the live subset may move
        $exists = array_key_exists($name, $merged);
        if (!$exists && !isset($addable[$name])) continue;  // no name invention beyond provenance
        $merged[$name] = lhs_sanitize_value($val);
    }
    return $merged;
}

/**
 * Per-channel served headers with LIVE values overlaid (staleness-guarded).
 * STEP 1 names+static from the store; STEP 2-5 overlay the live subset.
 * Drop-in for the serve path; freezeless (static on any spool issue).
 */
function lhs_get_channel_live(string $listId, string $channelId, ?string $profile = null,
                              bool $isSports = false): array {
    $listHeaders = lhs_get_channel($listId, $channelId, $profile);
    if (empty($listHeaders)) return $listHeaders; // store owns names; nothing to serve
    $s = lhs_load_spool();
    return lhs_merge_live($listHeaders, $s['spool'], (bool)$s['fresh'], $profile, $channelId, $isSports);
}

/**
 * Per-profile served headers with LIVE values overlaid (no per-channel layer).
 * Use when serving the shared/default set for a profile.
 */
function lhs_get_profile_live(string $listId, string $profile, bool $isSports = false): array {
    $listHeaders = lhs_get_profile($listId, $profile);
    if (empty($listHeaders)) return $listHeaders;
    $s = lhs_load_spool();
    return lhs_merge_live($listHeaders, $s['spool'], (bool)$s['fresh'], $profile, null, $isSports);
}

/** Provenance: 'live' if the spool was fresh on the last merge, else 'static-stale'. */
function lhs_live_source_tag(): string {
    $s = lhs_load_spool();
    return (!empty($s['fresh'])) ? 'live' : 'static-stale';
}

/** How many channels indexed for a list (provenance). */
function lhs_count(string $listId): int {
    try {
        $st = lhs_db()->prepare("SELECT COUNT(*) c FROM list_channel_headers WHERE list_id=?");
        $st->execute(array($listId));
        $r = $st->fetch(PDO::FETCH_ASSOC);
        return $r ? (int)$r['c'] : 0;
    } catch (Exception $e) { return 0; }
}
