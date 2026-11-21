<?php
/**
 * list_registry.php — Per-list "matrícula" registry (F1.0)
 *
 * Propósito: cuando una lista .m3u8 se sube al VPS (carpeta /var/www/lists),
 * su nombre/token queda registrado en una tabla SQLite. Cuando un player pide
 * esa lista por URL, el VPS la reconoce ("es nuestra") y ACTIVA el pipeline.
 *
 * Doctrina: ADITIVO. No toca nginx, ni URL-1 (verbatim), ni configs. SSOT no-delete.
 * Sin sqlite3 CLI en el VPS → se usa PDO sqlite (pdo_sqlite presente).
 */

if (!function_exists('lr_db_path')) {
    function lr_db_path()   { return '/var/www/html/prisma/db/ape_lists.db'; }
    function lr_lists_dir() { return '/var/www/lists'; }

    function lr_db() {
        static $db = null;
        if ($db !== null) return $db;
        $path = lr_db_path();
        if (!is_dir(dirname($path))) { @mkdir(dirname($path), 0775, true); }
        $db = new PDO('sqlite:' . $path);
        $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $db->exec('PRAGMA journal_mode=WAL');
        $db->exec('PRAGMA busy_timeout=3000');
        $db->exec("CREATE TABLE IF NOT EXISTS registered_lists (
            filename        TEXT PRIMARY KEY,
            list_id         TEXT,
            variant         TEXT,
            path            TEXT,
            bytes           INTEGER,
            channel_count   INTEGER,
            uploaded_at     INTEGER,
            canon_ingested  INTEGER DEFAULT 0,
            status          TEXT DEFAULT 'active',
            last_seen       INTEGER,
            activation_count INTEGER DEFAULT 0,
            registered_at   INTEGER
        )");
        $db->exec("CREATE INDEX IF NOT EXISTS idx_rl_list_id ON registered_lists(list_id)");
        return $db;
    }

    /** APE_LISTA_<ts>_<variant...>.m3u8[.gz] → [list_id, variant] */
    function lr_parse_name($filename) {
        $base = preg_replace('/\.m3u8(\.gz)?$/i', '', $filename);
        $list_id = $base; $variant = 'base';
        if (preg_match('/APE_LISTA_(\d+)(.*)$/i', $base, $m)) {
            $list_id = $m[1];
            $rest = trim($m[2], '_');
            if ($rest !== '') $variant = $rest;
        }
        return array($list_id, $variant);
    }

    /** Cuenta canales (#EXTINF), soporta .gz, streaming (no carga el archivo en RAM) */
    function lr_count_channels($path) {
        $n = 0;
        if (preg_match('/\.gz$/i', $path)) {
            $h = @gzopen($path, 'rb');
            if ($h) { while (($l = gzgets($h)) !== false) { if (strncmp($l, '#EXTINF', 7) === 0) $n++; } gzclose($h); }
        } else {
            $h = @fopen($path, 'rb');
            if ($h) { while (($l = fgets($h)) !== false) { if (strncmp($l, '#EXTINF', 7) === 0) $n++; } fclose($h); }
        }
        return $n;
    }

    /** Registra/actualiza UNA lista (idempotente por filename). Devuelve resumen o null. */
    function lr_register_file($path) {
        $filename = basename($path);
        if (!preg_match('/\.m3u8(\.gz)?$/i', $filename)) return null;
        list($list_id, $variant) = lr_parse_name($filename);
        $bytes = @filesize($path); if ($bytes === false) $bytes = 0;
        $mtime = @filemtime($path); if ($mtime === false) $mtime = time();
        $ch    = lr_count_channels($path);
        // Self-heal: el .m3u8 servido es un placeholder de 8 bytes (REGLA 84 del upload);
        // el contenido real vive en el .gz hermano. Si este es un placeholder, contar del .gz.
        if ($ch === 0 && preg_match('/\.m3u8$/i', $path) && $bytes < 64 && is_file($path . '.gz')) {
            $ch = lr_count_channels($path . '.gz');
        }
        $now   = time();
        $db = lr_db();
        $st = $db->prepare("INSERT INTO registered_lists
            (filename,list_id,variant,path,bytes,channel_count,uploaded_at,status,registered_at)
            VALUES (:f,:id,:v,:p,:b,:c,:u,'active',:r)
            ON CONFLICT(filename) DO UPDATE SET
              list_id=:id, variant=:v, path=:p, bytes=:b, channel_count=:c, uploaded_at=:u");
        $st->execute(array(':f'=>$filename, ':id'=>$list_id, ':v'=>$variant, ':p'=>$path,
            ':b'=>$bytes, ':c'=>$ch, ':u'=>$mtime, ':r'=>$now));
        return array('filename'=>$filename, 'list_id'=>$list_id, 'variant'=>$variant,
                     'channel_count'=>$ch, 'bytes'=>$bytes);
    }

    /** Escanea toda la carpeta de listas y registra cada .m3u8/.m3u8.gz */
    function lr_scan_all() {
        $dir = lr_lists_dir();
        $out = array();
        foreach (array_merge((array)glob($dir.'/*.m3u8'), (array)glob($dir.'/*.m3u8.gz')) as $p) {
            $r = lr_register_file($p);
            if ($r) $out[] = $r;
        }
        return $out;
    }

    function lr_is_registered($filename) {
        $db = lr_db();
        $st = $db->prepare("SELECT * FROM registered_lists WHERE filename=:f AND status='active' LIMIT 1");
        $st->execute(array(':f'=>$filename));
        $r = $st->fetch(PDO::FETCH_ASSOC);
        return $r ? $r : null;
    }

    function lr_lookup_by_token($list_id) {
        $db = lr_db();
        $st = $db->prepare("SELECT * FROM registered_lists WHERE list_id=:id AND status='active' ORDER BY uploaded_at DESC LIMIT 1");
        $st->execute(array(':id'=>$list_id));
        $r = $st->fetch(PDO::FETCH_ASSOC);
        return $r ? $r : null;
    }

    /** Marca activación (la lista nuestra está siendo reproducida). Idempotente. */
    function lr_mark_activation($filename) {
        $db = lr_db();
        $st = $db->prepare("UPDATE registered_lists SET last_seen=:t, activation_count=activation_count+1 WHERE filename=:f");
        $st->execute(array(':t'=>time(), ':f'=>$filename));
        return $st->rowCount() > 0;
    }
}
