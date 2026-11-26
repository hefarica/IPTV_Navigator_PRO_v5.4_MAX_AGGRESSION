<?php
/**
 * list_cablear_core.php — logica del panel de cableado de listas.
 *
 * La entrada local es siempre el fichero plain. Solo el marcador bare
 * #EXTM3U (BOM/EOL opcionales) con un gzip regular, confinado y no-symlink
 * puede usar ese gzip como fuente efectiva. Un plain con contenido siempre
 * manda, aunque sea corto y tenga un sidecar divergente.
 *
 * El fichero no escribe nada al incluirlo. Todas las escrituras pasan por
 * ape_cablear_enqueue() y por el store fs/mem inyectable.
 */

if (!defined('APE_CABLEAR_CORE')) {
    define('APE_CABLEAR_CORE', 1);
    define('APE_CABLEAR_SCHEMA',        'ape.lists.cablear.ticket.v1');
    define('APE_CABLEAR_WIRING',        'ape-wire-1');
    define('APE_CABLEAR_BASE',          'https://iptv-ape.duckdns.org');
    define('APE_CABLEAR_MIN_FREE_MB',   3000);
    define('APE_CABLEAR_MAX_BYTES',     2147483648); // default; el env puede cambiarlo
    define('APE_CABLEAR_MAX_LEN',       2048);
    define('APE_CABLEAR_TERMINAL_DAYS', 7);
    define('APE_CABLEAR_TICKET_TTL',    604800);

    /* ── IO inyectable ───────────────────────────────────────────────────── */
    function ape_cablear_io(array $o = array())
    {
        $root = getenv('APE_CABLEAR_ROOT');
        $base = array(
            'lists_root' => getenv('APE_CABLEAR_LISTS_ROOT') ?: '/var/www/html/lists',
            'queue_root' => $root ?: '/var/lib/ape/cablear',
            'allowlist'  => getenv('APE_CABLEAR_ALLOW') ?: '/etc/ape/cablear-hosts.allow',
            'store'      => getenv('APE_CABLEAR_STORE') ?: 'fs',
            'free_mb'    => null,
            'now_ms'     => null,
            'mem'        => null,
            'ls_resolve' => null,
            'file_exists' => null,
            'lstat'      => null,
            'mkdir'      => null,
            'is_dir'     => null,
            'is_writable' => null,
        );
        return array_merge($base, $o);
    }

    function ape_cablear_now_ms(array $io)
    {
        if ($io['now_ms'] !== null) { return (int) $io['now_ms']; }
        return (int) floor(microtime(true) * 1000);
    }

    function ape_cablear_iso(int $ms)
    {
        return gmdate('Y-m-d\TH:i:s\Z', (int) floor($ms / 1000));
    }

    function ape_cablear_rand8()
    {
        $a = 'abcdefghijklmnopqrstuvwxyz0123456789';
        $s = '';
        for ($i = 0; $i < 8; $i++) { $s .= $a[random_int(0, 35)]; }
        return $s;
    }

    function ape_cablear_default_device()
    {
        return 'eyJ0IjoiZ2VuZXJpYyIsInMiOiJ1bmtub3duIiwiciI6MjA0OCwidyI6MTkyMCwiaCI6MTA4MCwiZiI6MzB9';
    }

    /** El valor normalizado del limite: 0 desactiva solo esta guardia. */
    function ape_cablear_max_bytes()
    {
        $v = getenv('APE_CABLEAR_MAX_BYTES');
        if ($v === false || $v === '') { return (int) APE_CABLEAR_MAX_BYTES; }
        $v = trim((string) $v);
        if (!preg_match('/^(0|[1-9][0-9]*)$/', $v)) { return (int) APE_CABLEAR_MAX_BYTES; }
        $n = (int) $v;
        return ($n >= 0) ? $n : (int) APE_CABLEAR_MAX_BYTES;
    }

    /**
     * Normaliza una base publica sin aceptar ambigüedad de URL. El valor
     * legacy es el unico que puede traer el sufijo historico /lists, que se
     * retira antes de validar el contrato canonico.
     */
    function ape_cablear_normalize_public_base($value, $legacy = false)
    {
        if (!is_string($value) || $value === '' || preg_match('/[\x00-\x20\x7f]/', $value) || strpos($value, chr(92)) !== false) {
            return null;
        }
        if (substr($value, -1) === '/') { $value = substr($value, 0, -1); }
        if ($legacy && substr($value, -6) === '/lists') {
            $value = substr($value, 0, -6);
        }
        if ($value === '' || substr($value, -1) === '/') { return null; }
        $p = @parse_url($value);
        if (!is_array($p)) { return null; }
        $scheme = isset($p['scheme']) ? strtolower((string) $p['scheme']) : '';
        $host = isset($p['host']) ? (string) $p['host'] : '';
        if (($scheme !== 'http' && $scheme !== 'https') || $host === '') { return null; }
        if (isset($p['user']) || isset($p['pass']) || isset($p['query']) || isset($p['fragment'])) {
            return null;
        }
        if (strpos($host, "\0") !== false || preg_match('/[\x00-\x20\x7f]/', $host)) { return null; }
        /* parse_url deja pasar algunos valores sin host real; exige un host
         * DNS/IP valido sin inventar una politica de allowlist de proveedores. */
        if (!preg_match('/^(?:[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?|\[[0-9A-Fa-f:.]+\])$/', $host)
            && filter_var($host, FILTER_VALIDATE_IP) === false) {
            return null;
        }
        return $value;
    }

    /** Devuelve [ok, base canonica, motivo] con precedencia comun panel/worker. */
    function ape_cablear_public_base_info()
    {
        $vars = array(
            array('APE_CABLEAR_ENGINE_BASE', false),
            array('APE_PUBLIC_BASE', false),
            array('APE_CABLEAR_BASE_URL', true),
        );
        foreach ($vars as $item) {
            $raw = getenv($item[0]);
            if ($raw === false || $raw === '') { continue; }
            $base = ape_cablear_normalize_public_base((string) $raw, $item[1]);
            if ($base === null) {
                return array(false, null, 'E_BASE_PUBLICA_INVALIDA');
            }
            return array(true, $base, null);
        }
        $default = ape_cablear_normalize_public_base(APE_CABLEAR_BASE, false);
        return $default === null
            ? array(false, null, 'E_BASE_PUBLICA_INVALIDA')
            : array(true, $default, null);
    }

    /** Base historica para tickets viejos; una base invalida no se publica. */
    function ape_cablear_public_base()
    {
        list($ok, $base) = ape_cablear_public_base_info();
        return $ok ? $base : null;
    }

    /** Solo acepta el stub historico bare #EXTM3U, no cualquier plain corto. */
    function ape_cablear_is_explicit_gzip_stub($path)
    {
        clearstatcache(true, (string) $path);
        $size = @filesize($path);
        if (!is_int($size) || $size < 7 || $size > 12) { return false; }
        $fh = @fopen($path, 'rb');
        if ($fh === false) { return false; }
        $body = @fread($fh, $size);
        @fclose($fh);
        return is_string($body) && preg_match('/^(?:\xEF\xBB\xBF)?#EXTM3U(?:\r\n|\n)?$/D', $body) === 1;
    }

    function ape_cablear_es_url($lista)
    {
        return is_string($lista) && strpos($lista, '://') !== false;
    }

    /** true si el host esta en la allowlist del operador (comodin de prefijo '.'). */
    function ape_cablear_host_permitido($host, array $io)
    {
        $host = strtolower(rtrim((string) $host, '.'));
        if ($host === '' || !is_file($io['allowlist'])) { return false; }
        $lines = @file($io['allowlist'], FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if (!is_array($lines)) { return false; }
        foreach ($lines as $l) {
            $l = trim($l);
            if ($l === '' || $l[0] === '#') { continue; }
            $l = strtolower(rtrim($l, '.'));
            if ($l !== '' && $l[0] === '.') {
                $suf = substr($l, 1);
                if ($host === $suf || substr($host, -strlen('.' . $suf)) === '.' . $suf) { return true; }
            } elseif ($host === $l) {
                return true;
            }
        }
        return false;
    }

    function ape_cablear_lstat($path, array $io)
    {
        if ($io['lstat'] !== null) { return call_user_func($io['lstat'], $path); }
        return @lstat($path);
    }

    function ape_cablear_regular_stat($path)
    {
        clearstatcache(true, (string) $path);
        $s = @lstat($path);
        if (!is_array($s) || !isset($s['mode']) || (($s['mode'] & 0170000) !== 0100000)) {
            return null;
        }
        $real = realpath($path);
        if ($real === false) { return null; }
        $st = @stat($real);
        if (!is_array($st)) { return null; }
        return array(
            'path' => $real,
            'bytes' => isset($st['size']) ? (int) $st['size'] : null,
            'mtime_epoch' => isset($st['mtime']) ? (int) $st['mtime'] : null,
            'ctime_epoch' => isset($st['ctime']) ? (int) $st['ctime'] : null,
            'inode' => isset($st['ino']) ? (int) $st['ino'] : null,
            'dev' => isset($st['dev']) ? (int) $st['dev'] : null,
        );
    }

    function ape_cablear_path_confinado($path, $root)
    {
        $rr = realpath($root);
        $rp = realpath($path);
        if ($rr === false || $rp === false) { return false; }
        $prefix = rtrim($rr, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR;
        return $rp === rtrim($rr, DIRECTORY_SEPARATOR) || strpos($rp, $prefix) === 0;
    }

    /** Tamano expandido sugerido por ISIZE. Es estimacion, no prueba de CRC. */
    function ape_cablear_gz_size($path)
    {
        clearstatcache(true, (string) $path);
        if (!is_file($path)) { return null; }
        $fh = @fopen($path, 'rb');
        if (!$fh) { return null; }
        $sz = @filesize($path);
        $val = null;
        if ($sz !== false && $sz >= 18 && fseek($fh, -4, SEEK_END) === 0) {
            $b = fread($fh, 4);
            if (is_string($b) && strlen($b) === 4) {
                $u = unpack('V', $b);
                if (isset($u[1])) { $val = (int) $u[1]; }
            }
        }
        fclose($fh);
        return $val;
    }

    /**
     * Devuelve identidad del gzip solo si es regular, confinado y gzip valido
     * en cabecera. No descomprime y no valida CRC ni miembros adicionales.
     */
    function ape_cablear_gz_identity($path, $root)
    {
        $s = @lstat($path);
        if (!is_array($s)) { return array(false, 'E_GZIP_NO_VALIDO', null); }
        if (($s['mode'] & 0170000) === 0120000) {
            return array(false, 'E_GZIP_ES_SYMLINK', null);
        }
        if (($s['mode'] & 0170000) !== 0100000 || !ape_cablear_path_confinado($path, $root)) {
            return array(false, 'E_GZIP_NO_VALIDO', null);
        }
        $st = ape_cablear_regular_stat($path);
        if ($st === null || !is_readable($st['path']) || (int) $st['bytes'] < 18) {
            return array(false, 'E_GZIP_NO_VALIDO', null);
        }
        $fh = @fopen($st['path'], 'rb');
        $head = $fh ? @fread($fh, 3) : false;
        if ($fh) { @fclose($fh); }
        if (!is_string($head) || strlen($head) !== 3 || $head !== "\x1f\x8b\x08") {
            return array(false, 'E_GZIP_NO_VALIDO', null);
        }
        $isize = ape_cablear_gz_size($st['path']);
        if ($isize === null) { return array(false, 'E_GZIP_TAMANIO_NO_DISPONIBLE', null); }
        $st['isize_estimate'] = (int) $isize;
        $st['isize_exact'] = false;
        $st['integrity_validated'] = false;
        return array(true, null, $st);
    }

    /** Construye la identidad doble; sólo el marcador explícito activa sidecar. */
    function ape_cablear_source_identity($plainPath, $listsRoot, $plainStat)
    {
        clearstatcache(true, (string) $plainPath);
        clearstatcache(true, (string) $plainPath . '.gz');
        $freshPlain = ape_cablear_regular_stat($plainPath);
        if ($freshPlain !== null) { $plainStat = $freshPlain; }
        $identity = array(
            'source_kind' => 'plain',
            'path' => $plainStat['path'],
            'bytes' => (int) $plainStat['bytes'],
            'mtime_epoch' => (int) $plainStat['mtime_epoch'],
            'ctime_epoch' => (int) $plainStat['ctime_epoch'],
            'inode' => (int) $plainStat['inode'],
            'dev' => (int) $plainStat['dev'],
            'gz' => null,
            'expanded_bytes_estimate' => (int) $plainStat['bytes'],
            'expanded_bytes_is_estimate' => false,
            'expanded_bytes_hint' => 'plain_bytes',
        );
        $out = array(
            'effective_path' => $plainStat['path'],
            'effective_bytes' => (int) $plainStat['bytes'],
            'effective_mtime_epoch' => (int) $plainStat['mtime_epoch'],
            'effective_ctime_epoch' => (int) $plainStat['ctime_epoch'],
            'effective_inode' => (int) $plainStat['inode'],
            'effective_dev' => (int) $plainStat['dev'],
            'bytes_descomprimidos' => (int) $plainStat['bytes'],
            'bytes_descomprimidos_estimacion' => false,
            'bytes_descomprimidos_motivo' => 'plain_bytes',
            'sourceidentity' => $identity,
        );

        if (!ape_cablear_is_explicit_gzip_stub($plainPath)) { return array(true, null, $out); }
        $gzPath = $plainPath . '.gz';
        $gzLstat = @lstat($gzPath);
        if ($gzLstat === false) { return array(true, null, $out); }
        if (($gzLstat['mode'] & 0170000) === 0120000) {
            return array(false, 'E_GZIP_ES_SYMLINK', null);
        }
        list($ok, $err, $gzStat) = ape_cablear_gz_identity($gzPath, $listsRoot);
        if (!$ok) { return array(false, $err, null); }

        $identity['source_kind'] = 'gzip_stub';
        $identity['gz'] = array(
            'path' => $gzStat['path'],
            'bytes' => (int) $gzStat['bytes'],
            'mtime_epoch' => (int) $gzStat['mtime_epoch'],
            'ctime_epoch' => (int) $gzStat['ctime_epoch'],
            'inode' => (int) $gzStat['inode'],
            'dev' => (int) $gzStat['dev'],
            'isize_estimate' => (int) $gzStat['isize_estimate'],
            'isize_exact' => false,
            'integrity_validated' => false,
        );
        $identity['expanded_bytes_estimate'] = (int) $gzStat['isize_estimate'];
        $identity['expanded_bytes_is_estimate'] = true;
        $identity['expanded_bytes_hint'] = 'gzip_trailer_isize_estimate';
        $out['effective_path'] = $gzStat['path'];
        $out['effective_bytes'] = (int) $gzStat['bytes'];
        $out['effective_mtime_epoch'] = (int) $gzStat['mtime_epoch'];
        $out['effective_ctime_epoch'] = (int) $gzStat['ctime_epoch'];
        $out['effective_inode'] = (int) $gzStat['inode'];
        $out['effective_dev'] = (int) $gzStat['dev'];
        $out['bytes_descomprimidos'] = (int) $gzStat['isize_estimate'];
        $out['bytes_descomprimidos_estimacion'] = true;
        $out['bytes_descomprimidos_motivo'] = 'gzip_trailer_isize_estimacion_sin_prueba_integridad';
        $out['sourceidentity'] = $identity;
        return array(true, null, $out);
    }

    /* ── Coste/guardia de disco ───────────────────────────────────────────── */
    function ape_cablear_free_mb(array $io)
    {
        if ($io['free_mb'] !== null) { return (int) $io['free_mb']; }
        $root = $io['queue_root'];
        $probe = is_dir($root) ? $root : dirname($root);
        $free = @disk_free_space($probe);
        if ($free === false || $free === null) { return null; }
        return (int) floor($free / 1048576);
    }

    /* ── Validacion de entrada ────────────────────────────────────────────── */
    function ape_cablear_validate(array $in, array $io)
    {
        $lista = isset($in['lista']) ? (string) $in['lista'] : '';
        if (isset($in['_method']) && strtoupper((string) $in['_method']) !== 'POST') {
            return array(false, 'E_METODO_NO_PERMITIDO', 405, 'solo POST', null);
        }
        if (trim($lista) === '') {
            return array(false, 'E_LISTA_REQUERIDA', 400, 'el campo lista es obligatorio', null);
        }
        if (strlen($lista) > APE_CABLEAR_MAX_LEN) {
            return array(false, 'E_LISTA_DEMASIADO_LARGA', 400,
                'lista supera ' . APE_CABLEAR_MAX_LEN . ' bytes', null);
        }

        list($baseOk, $publicBase, $baseError) = ape_cablear_public_base_info();
        if (!$baseOk) {
            return array(false, $baseError ?: 'E_BASE_PUBLICA_INVALIDA', 500,
                'la base publica no cumple el contrato HTTP(S)', null);
        }

        $esUrl = ape_cablear_es_url($lista);
        $listsRoot = rtrim($io['lists_root'], '/');
        if (!$esUrl) {
            /* .m3u y .m3u8; la extension se normaliza solo en la salida. */
            if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9._-]{0,123}\.[mM]3[uU]8?$/', $lista)) {
                return array(false, 'E_LISTA_NOMBRE_INVALIDO', 400,
                    'el nombre debe casar ^[A-Za-z0-9][A-Za-z0-9._-]{0,123}\\.m3u8?$', null);
            }
            if (preg_match('/_(?:CABLEADA|SHIELDED)\.m3u8?$/i', $lista)) {
                return array(false, 'E_VARIANTE_NO_CABLEABLE', 400,
                    'no se cablea una variante ya cableada ni una blindada', null);
            }
            $cand = $listsRoot . '/' . $lista;
            $rootReal = realpath($listsRoot);
            if ($rootReal === false) {
                return array(false, 'E_LISTA_FUERA_DE_DIRECTORIO', 400,
                    'la raiz de listas no resuelve', null);
            }
            $candReal = realpath($cand);
            if ($candReal !== false) {
                $rootPrefix = rtrim($rootReal, '/') . '/';
                if (strpos($candReal, $rootPrefix) !== 0) {
                    return array(false, 'E_LISTA_FUERA_DE_DIRECTORIO', 400,
                        'la ruta resuelta escapa de la raiz de listas', null);
                }
            }
            $lst = ape_cablear_lstat($cand, $io);
            if (is_array($lst) && isset($lst['mode']) && (($lst['mode'] & 0170000) === 0120000)) {
                return array(false, 'E_LISTA_ES_SYMLINK', 400,
                    'el destino final es un symlink; no se cablea el blanco de un enlace', null);
            }
            if (!is_file($cand) || !is_readable($cand)) {
                return array(false, 'E_LISTA_NO_EXISTE', 404, 'no existe o no es legible', null);
            }
            $plainStat = ape_cablear_regular_stat($cand);
            if ($plainStat === null || !ape_cablear_path_confinado($cand, $listsRoot)) {
                return array(false, 'E_LISTA_FUERA_DE_DIRECTORIO', 400,
                    'la fuente no es un fichero regular confinado', null);
            }
            list($sourceOk, $sourceErr, $source) = ape_cablear_source_identity($cand, $listsRoot, $plainStat);
            if (!$sourceOk) {
                return array(false, $sourceErr, 400,
                    $sourceErr === 'E_GZIP_ES_SYMLINK'
                        ? 'el gzip del stub es un symlink y no se usa como fuente'
                        : 'el gzip del stub no es regular, confinado y legible', null);
            }
            $identity = $source['sourceidentity'];
            $expandedHint = (int) $source['bytes_descomprimidos'];
            $max = ape_cablear_max_bytes();
            if ($max > 0 && $expandedHint > $max) {
                return array(false, 'E_LISTA_DEMASIADO_GRANDE', 413,
                    'la pista de expansion supera ' . $max . ' bytes; el worker verificara la expansion real', null);
            }
            $fuente = array(
                'tipo' => 'fichero', 'ref' => $lista, 'path' => $cand,
                'path_efectivo' => $source['effective_path'],
                'bytes' => (int) $plainStat['bytes'],
                'bytes_gz' => ($identity['source_kind'] === 'gzip_stub') ? (int) $identity['gz']['bytes'] : null,
                'mtime_epoch' => (int) $source['effective_mtime_epoch'],
                'ctime_epoch' => (int) $source['effective_ctime_epoch'],
                'bytes_descomprimidos' => $expandedHint,
                'bytes_descomprimidos_estimacion' => (bool) $source['bytes_descomprimidos_estimacion'],
                'bytes_descomprimidos_motivo' => $source['bytes_descomprimidos_motivo'],
                'identidad' => $identity,
                'sourceidentity' => $identity,
                'source_identity' => $identity,
                'canonica' => $candReal !== false ? $candReal : ($listsRoot . '/' . $lista),
            );
        } else {
            /* Externas siguen permitidas solo por allowlist; no se descarga aqui. */
            $p = parse_url($lista);
            $scheme = isset($p['scheme']) ? strtolower($p['scheme']) : '';
            if ($scheme !== 'http' && $scheme !== 'https') {
                return array(false, 'E_ESQUEMA_NO_PERMITIDO', 400,
                    'solo http/https; se recibio "' . $scheme . '"', null);
            }
            if (isset($p['user']) || isset($p['pass'])) {
                return array(false, 'E_URL_CON_CREDENCIALES', 400,
                    'la URL lleva usuario:password', null);
            }
            $host = isset($p['host']) ? $p['host'] : '';
            if (!ape_cablear_host_permitido($host, $io)) {
                return array(false, 'E_HOST_NO_PERMITIDO', 403,
                    'host "' . $host . '" no esta en ' . $io['allowlist'] . ' (vacia por defecto)', null);
            }
            $urlIdentity = array(
                'source_kind' => 'url', 'path' => $lista, 'bytes' => 0,
                'mtime_epoch' => 0, 'ctime_epoch' => 0, 'inode' => 0, 'dev' => 0,
                'gz' => null, 'expanded_bytes_estimate' => 0,
                'expanded_bytes_is_estimate' => true, 'expanded_bytes_hint' => 'external_not_downloaded',
            );
            $fuente = array(
                'tipo' => 'url', 'ref' => $lista, 'url' => $lista,
                'bytes' => 0, 'mtime_epoch' => 0, 'ctime_epoch' => 0,
                'bytes_descomprimidos' => 0, 'bytes_descomprimidos_estimacion' => true,
                'bytes_descomprimidos_motivo' => 'external_not_downloaded',
                'identidad' => $urlIdentity, 'sourceidentity' => $urlIdentity,
                'source_identity' => $urlIdentity, 'canonica' => $lista,
            );
        }

        $free = ape_cablear_free_mb($io);
        if ($free === null) {
                return array(false, 'E_DISCO_INSUFICIENTE', 507,
                'no se pudo medir el espacio libre de la cola', null);
        }
        $costMb = (int) ceil(($fuente['bytes_descomprimidos'] * 2) / 1048576);
        if ($free < APE_CABLEAR_MIN_FREE_MB || $costMb > ($free - APE_CABLEAR_MIN_FREE_MB)) {
            return array(false, 'E_DISCO_INSUFICIENTE', 507,
                'no cabe: libre=' . $free . 'MB, minimo=' . APE_CABLEAR_MIN_FREE_MB
                . 'MB, coste_estimado=' . $costMb . 'MB; el ticket se conserva para reintentar', null);
        }

        /* La preparacion de dirs solo ocurre al encolar en fs, nunca al include. */
        if ($io['store'] === 'fs') {
            $dirs = ape_cablear_dirs($io);
            /* La API/web debe ser propietaria del grupo operativo de la cola;
             * todos los directorios quedan 0750 y nunca se sigue un symlink. */
            if (!ape_cablear_prepare_dirs($io)) {
                return array(false, 'E_COLA_NO_ESCRIBIBLE', 500,
                    'no se pudo preparar el directorio de la cola', null);
            }
            $writable = ($io['is_writable'] !== null)
                ? (bool) call_user_func($io['is_writable'], $dirs['cola'])
                : is_writable($dirs['cola']);
            /* Los callbacks de mkdir/is_dir son solo pruebas y no deben obligar a
             * tocar el filesystem real; la prueba puede declarar el veredicto. */
            if (!$writable && $io['is_writable'] === null && $io['mkdir'] !== null) { $writable = true; }
            if (!$writable) {
                return array(false, 'E_COLA_NO_ESCRIBIBLE', 500,
                    'la cola no es escribible', null);
            }
        }
        $fuente['public_base'] = $publicBase;
        return array(true, null, 200, 'ok', $fuente);
    }

    /* ── Clave de idempotencia ────────────────────────────────────────────── */
    function ape_cablear_clave(array $fuente, $device = null, $publicar = 0)
    {
        $identity = isset($fuente['sourceidentity']) ? $fuente['sourceidentity'] : array();
        $identityJson = json_encode($identity, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if (!is_string($identityJson)) { $identityJson = serialize($identity); }
        $base = isset($fuente['public_base']) ? (string) $fuente['public_base'] : (string) ape_cablear_public_base();
        return hash('sha256',
            (string) $fuente['canonica'] . '|' . $identityJson . '|device=' . (string) $device
            . '|publicar=' . ((int) $publicar) . '|base=' . $base
            . '|wiring=' . APE_CABLEAR_WIRING);
    }

    function ape_cablear_dirs(array $io)
    {
        $r = rtrim($io['queue_root'], '/');
        return array(
            'root' => $r, 'cola' => $r . '/cola', 'tomados' => $r . '/tomados',
            'hechos' => $r . '/hechos', 'fallidos' => $r . '/fallidos', 'staging' => $r . '/staging',
        );
    }

    function ape_cablear_fs_dir_ok($path)
    {
        $s = @lstat($path);
        return is_array($s) && (($s['mode'] & 0170000) === 0040000);
    }

    function ape_cablear_prepare_dirs(array $io)
    {
        $dirs = ape_cablear_dirs($io);
        foreach ($dirs as $d) {
            if ($io['is_dir'] !== null) {
                $esDir = (bool) call_user_func($io['is_dir'], $d);
                if ($esDir) { continue; }
                $creado = ($io['mkdir'] !== null) ? (bool) call_user_func($io['mkdir'], $d) : false;
                $esDirAhora = (bool) call_user_func($io['is_dir'], $d);
                if (!$creado && !$esDirAhora) { return false; }
                continue;
            }
            $s = @lstat($d);
            if (is_array($s)) {
                if (($s['mode'] & 0170000) !== 0040000) { return false; }
            } elseif (!@mkdir($d, 0750, true)) {
                $s = @lstat($d);
                if (!is_array($s) || (($s['mode'] & 0170000) !== 0040000)) { return false; }
            }
            if (!ape_cablear_fs_dir_ok($d) || !@chmod($d, 0750)) { return false; }
        }
        return true;
    }

    function ape_cablear_ticket_name($name)
    {
        return is_string($name) && preg_match('/^t-[0-9]{10,13}-[a-z0-9]{8}\.json$/', $name) === 1;
    }

    /* ── Store fs/mem ─────────────────────────────────────────────────────── */
    function ape_cablear_store_list(array $io, $dir)
    {
        if ($io['store'] === 'mem') {
            $m = $io['mem'] ? $io['mem'] : array();
            return isset($m[$dir]) ? $m[$dir] : array();
        }
        $d = ape_cablear_dirs($io);
        $path = isset($d[$dir]) ? $d[$dir] : null;
        if ($path === null || !ape_cablear_fs_dir_ok($path)) { return array(); }
        $out = array();
        foreach ((array) @scandir($path) as $name) {
            if (!ape_cablear_ticket_name($name)) { continue; }
            $f = $path . '/' . $name;
            $s = @lstat($f);
            if (!is_array($s) || (($s['mode'] & 0170000) !== 0100000)) { continue; }
            $j = json_decode((string) @file_get_contents($f), true);
            if (is_array($j)) { $out[$name] = $j; }
        }
        return $out;
    }

    function ape_cablear_store_get(array $io, $dir, $name)
    {
        if (!ape_cablear_ticket_name($name)) { return null; }
        if ($io['store'] === 'mem') {
            $m = $io['mem'] ? $io['mem'] : array();
            return isset($m[$dir][$name]) && is_array($m[$dir][$name]) ? $m[$dir][$name] : null;
        }
        $d = ape_cablear_dirs($io);
        if (!isset($d[$dir]) || !ape_cablear_fs_dir_ok($d[$dir])) { return null; }
        $path = $d[$dir] . '/' . $name;
        $s = @lstat($path);
        if (!is_array($s) || (($s['mode'] & 0170000) !== 0100000)) { return null; }
        $j = json_decode((string) @file_get_contents($path), true);
        return is_array($j) ? $j : null;
    }

    function ape_cablear_store_put(array &$io, $dir, $name, array $ticket)
    {
        if ($io['store'] === 'mem') {
            if (!is_array($io['mem'])) { $io['mem'] = array(); }
            if (!isset($io['mem'][$dir]) || !is_array($io['mem'][$dir])) { $io['mem'][$dir] = array(); }
            $io['mem'][$dir][$name] = $ticket;
            return true;
        }
        $d = ape_cablear_dirs($io);
        if (!ape_cablear_ticket_name($name) || !isset($d[$dir]) || !ape_cablear_fs_dir_ok($d[$dir])) { return false; }
        $target = $d[$dir] . '/' . $name;
        $old = @lstat($target);
        if (is_array($old) && (($old['mode'] & 0170000) !== 0100000)) { return false; }
        $json = json_encode($ticket, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if (!is_string($json)) { return false; }
        $data = $json . "\n";
        $fh = false; $tmp = null;
        for ($i = 0; $i < 8 && $fh === false; $i++) {
            $tmp = $d[$dir] . '/.tmp-' . $name . '-' . ape_cablear_rand8();
            $fh = @fopen($tmp, 'x+b');
        }
        if ($fh === false || $tmp === null) { return false; }
        $written = 0; $length = strlen($data);
        while ($written < $length) {
            $n = @fwrite($fh, substr($data, $written));
            if ($n === false || $n === 0) { @fclose($fh); @unlink($tmp); return false; }
            $written += $n;
        }
        @fflush($fh);
        if (function_exists('fsync')) { @fsync($fh); }
        @chmod($tmp, 0600);
        @fclose($fh);
        $tmpStat = @lstat($tmp);
        if (!is_array($tmpStat) || (($tmpStat['mode'] & 0170000) !== 0100000) || !@rename($tmp, $target)) {
            @unlink($tmp); return false;
        }
        @chmod($target, 0600);
        return true;
    }

    function ape_cablear_find_by_clave(array $io, $clave)
    {
        foreach (array('cola', 'tomados', 'hechos', 'fallidos') as $dir) {
            foreach (ape_cablear_store_list($io, $dir) as $name => $t) {
                if (isset($t['clave']) && hash_equals((string) $t['clave'], (string) $clave)) {
                    return array('dir' => $dir, 'name' => $name, 'ticket' => $t);
                }
            }
        }
        return null;
    }

    function ape_cablear_device(array $in)
    {
        $device = ape_cablear_default_device();
        if (isset($in['device']) && (string) $in['device'] !== '') {
            $device = (string) $in['device'];
            if (!preg_match('/^[A-Za-z0-9_-]{16,512}$/', $device)) {
                return array(false, null, array('http' => 400, 'body' => array(
                    'ok' => false, 'error' => 'E_DEVICE_INVALIDO',
                    'motivo' => 'device debe casar ^[A-Za-z0-9_-]{16,512}$ (o omitirse)',
                )));
            }
        }
        return array(true, $device, null);
    }

    function ape_cablear_enqueue_locked(array $in, array $fuente, $clave, $device, $publicar, $forzar, array &$io)
    {
        if (!$forzar) {
            $prev = ape_cablear_find_by_clave($io, $clave);
            if ($prev !== null) {
                return array('http' => 200, 'body' => array(
                    'ok' => true, 'estado' => 'duplicado', 'ticket' => $prev['ticket']['ticket'],
                    'ubicacion' => $prev['dir'],
                    'estado_previo' => isset($prev['ticket']['estado']) ? $prev['ticket']['estado'] : 'queued',
                    'estado_url' => '/prisma/api/cablear-estado.php?ticket=' . $prev['ticket']['ticket'],
                    'device_present' => true, 'publicar' => $publicar,
                ));
            }
        }

        $nowMs = ape_cablear_now_ms($io);
        $id = 't-' . $nowMs . '-' . ape_cablear_rand8();
        $nombreSalida = preg_replace('/\.m3u8?$/i', '', $fuente['ref']) . '_CABLEADA.m3u8';
        $identity = isset($fuente['sourceidentity']) ? $fuente['sourceidentity'] : array();
        $ticket = array(
            'schema' => APE_CABLEAR_SCHEMA, 'ticket' => $id, 'clave' => $clave,
            'public_base' => $fuente['public_base'],
            'estado' => 'queued', 'fase' => 'queued',
            'entrada' => array(
                'tipo' => $fuente['tipo'], 'ref' => $fuente['ref'],
                'bytes' => (int) $fuente['bytes'], 'mtime_epoch' => (int) $fuente['mtime_epoch'],
                'ctime_epoch' => isset($fuente['ctime_epoch']) ? (int) $fuente['ctime_epoch'] : 0,
                'bytes_descomprimidos' => (int) $fuente['bytes_descomprimidos'],
                'bytes_descomprimidos_estimacion' => !empty($fuente['bytes_descomprimidos_estimacion']),
                'bytes_descomprimidos_motivo' => $fuente['bytes_descomprimidos_motivo'],
                'identidad' => $identity,
            ),
            'salida' => array(
                'nombre' => $nombreSalida,
                'path_staging' => ape_cablear_dirs($io)['staging'] . '/' . $id . '/' . $nombreSalida,
                'path_final' => rtrim($io['lists_root'], '/') . '/' . $nombreSalida,
                'bytes' => 0, 'sha256' => null, 'publicada' => false,
                'gzip_validado' => false, 'rawsourcehash' => null,
            ),
            'publicar' => $publicar, 'forzar' => $forzar ? 1 : 0, 'device' => $device,
            'wiring_version' => APE_CABLEAR_WIRING,
            'intentos' => 0,
            'timestamps' => array('encolado' => ape_cablear_iso($nowMs), 'iniciado' => null, 'heartbeat' => null, 'terminado' => null),
            'progreso' => array('lineas' => 0, 'canales' => 0, 'envueltos' => 0, 'ya_estaban' => 0, 'sin_id' => 0, 'bytes_salida' => 0),
            'error' => null,
        );
        if ($fuente['tipo'] === 'fichero') {
            $ticket['entrada']['path'] = $fuente['path'];
            $ticket['entrada']['path_efectivo'] = $fuente['path_efectivo'];
            $ticket['entrada']['bytes_gz'] = $fuente['bytes_gz'];
        } else {
            $ticket['entrada']['url'] = $fuente['url'];
        }

        $name = $id . '.json';
        if (!ape_cablear_store_put($io, 'cola', $name, $ticket)) {
            return array('http' => 500, 'body' => array(
                'ok' => false, 'error' => 'E_COLA_NO_ESCRIBIBLE', 'motivo' => 'no se pudo escribir el ticket',
            ));
        }
        return array('http' => 202, 'body' => array(
            'ok' => true, 'estado' => 'queued', 'ticket' => $id,
            'estado_url' => '/prisma/api/cablear-estado.php?ticket=' . $id,
            'cola_posicion' => count(ape_cablear_store_list($io, 'cola')),
            'device_present' => true, 'publicar' => $publicar,
        ));
    }

    /** En fs, la lectura de duplicados y la escritura atomica comparten flock. */
    function ape_cablear_enqueue_with_lock(array $in, array $fuente, $clave, $device, $publicar, $forzar, array &$io)
    {
        if ($io['store'] === 'mem') {
            return ape_cablear_enqueue_locked($in, $fuente, $clave, $device, $publicar, $forzar, $io);
        }
        $lockPath = ape_cablear_dirs($io)['root'] . '/enqueue.lock';
        $lockStat = @lstat($lockPath);
        if (is_array($lockStat) && (($lockStat['mode'] & 0170000) !== 0100000)) {
            return array('http' => 503, 'body' => array(
                'ok' => false, 'error' => 'E_COLA_BLOQUEADA', 'motivo' => 'el lock de encolado no es un fichero regular',
            ));
        }
        if (!is_array($lockStat)) {
            $seed = @fopen($lockPath, 'x+b');
            if (is_resource($seed)) { @chmod($lockPath, 0600); @fclose($seed); }
        }
        $fh = @fopen($lockPath, 'c+b');
        if (is_resource($fh)) { @chmod($lockPath, 0600); }
        if ($fh === false || !function_exists('flock') || !@flock($fh, LOCK_EX)) {
            if (is_resource($fh)) { @fclose($fh); }
            return array('http' => 503, 'body' => array(
                'ok' => false, 'error' => 'E_COLA_BLOQUEADA', 'motivo' => 'no se pudo tomar el lock de encolado',
            ));
        }
        try {
            $result = ape_cablear_enqueue_locked($in, $fuente, $clave, $device, $publicar, $forzar, $io);
        } finally {
            @flock($fh, LOCK_UN);
            @fclose($fh);
        }
        return $result;
    }

    function ape_cablear_enqueue(array $in, array &$io)
    {
        list($ok, $code, $http, $motivo, $fuente) = ape_cablear_validate($in, $io);
        if (!$ok) {
            return array('http' => $http, 'body' => array('ok' => false, 'error' => $code, 'motivo' => $motivo));
        }
        /* Este chequeo va antes de buscar duplicados: un device invalido nunca
         * puede recibir respuesta duplicada ni ocultar un error de contrato. */
        list($deviceOk, $device, $deviceError) = ape_cablear_device($in);
        if (!$deviceOk) { return $deviceError; }
        $publicar = (isset($in['publicar']) && (string) $in['publicar'] === '1') ? 1 : 0;
        $forzar = (isset($in['forzar']) && (string) $in['forzar'] === '1');
        $clave = ape_cablear_clave($fuente, $device, $publicar);
        return ape_cablear_enqueue_with_lock($in, $fuente, $clave, $device, $publicar, $forzar, $io);
    }

    /* ── Estado ───────────────────────────────────────────────────────────── */
    function ape_cablear_estado_de_ticket(array $t, $ubicacion)
    {
        if ($ubicacion === 'hechos') { return isset($t['estado']) ? $t['estado'] : 'done'; }
        if ($ubicacion === 'fallidos') { return isset($t['estado']) ? $t['estado'] : 'failed'; }
        if ($ubicacion === 'tomados') { return 'running'; }
        return isset($t['estado']) ? $t['estado'] : 'queued';
    }

    function ape_cablear_status(array $q, array $io)
    {
        $n = 0;
        foreach (array('ticket', 'ultimos', 'lista') as $k) { if (isset($q[$k]) && (string) $q[$k] !== '') { $n++; } }
        if ($n !== 1) {
            return array('http' => 400, 'body' => array('ok' => false, 'error' => 'E_CONSULTA_AMBIGUA', 'motivo' => 'exactamente uno de ticket, ultimos o lista'));
        }
        if (isset($q['ticket']) && (string) $q['ticket'] !== '') {
            $id = (string) $q['ticket'];
            if (!preg_match('/^t-[0-9]{10,13}-[a-z0-9]{8}$/', $id)) {
                return array('http' => 404, 'body' => array('ok' => false, 'error' => 'E_TICKET_DESCONOCIDO', 'motivo' => 'formato de ticket invalido'));
            }
            foreach (array('tomados', 'hechos', 'fallidos', 'cola') as $dir) {
                $name = $id . '.json';
                $ticket = ape_cablear_store_get($io, $dir, $name);
                if (is_array($ticket)) { return array('http' => 200, 'body' => ape_cablear_body($ticket, $dir, $io)); }
            }
            return array('http' => 410, 'body' => array('ok' => false, 'estado' => 'expired', 'error' => 'E_TICKET_DESCONOCIDO', 'motivo' => 'el ticket ya no existe (TTL de terminales o cola limpiada)'));
        }
        $max = 10;
        if (isset($q['ultimos'])) {
            if (!preg_match('/^[1-9][0-9]?$/', (string) $q['ultimos'])) {
                return array('http' => 400, 'body' => array('ok' => false, 'error' => 'E_CONSULTA_AMBIGUA', 'motivo' => 'ultimos debe ser 1..50'));
            }
            $max = min(50, (int) $q['ultimos']);
        }
        $filtro = isset($q['lista']) ? (string) $q['lista'] : null;
        $all = array();
        foreach (array('tomados', 'cola', 'hechos', 'fallidos') as $dir) {
            foreach (ape_cablear_store_list($io, $dir) as $t) {
                if ($filtro !== null && ((string) ($t['entrada']['ref'] ?? '') !== $filtro)) { continue; }
                $all[] = ape_cablear_body($t, $dir, $io);
            }
        }
        usort($all, function ($a, $b) { return strcmp((string) $b['timestamps']['encolado'], (string) $a['timestamps']['encolado']); });
        return array('http' => 200, 'body' => array('ok' => true, 'count' => min($max, count($all)), 'tickets' => array_slice($all, 0, $max)));
    }

    function ape_cablear_public_url($value)
    {
        if (!is_string($value) || $value === '') { return null; }
        $p = @parse_url($value);
        if (!is_array($p) || !isset($p['scheme'], $p['host']) || isset($p['user']) || isset($p['pass'])
            || isset($p['query']) || isset($p['fragment'])) { return null; }
        $base = ape_cablear_normalize_public_base(
            strtolower((string) $p['scheme']) . '://' . (string) $p['host']
            . (isset($p['port']) ? ':' . (int) $p['port'] : ''), false
        );
        if ($base === null) { return null; }
        $path = isset($p['path']) ? (string) $p['path'] : '';
        return $base . $path;
    }

    function ape_cablear_public_ref($value)
    {
        if (!is_string($value) || $value === '') { return null; }
        if (strpos($value, '://') === false) {
            return preg_match('/^[A-Za-z0-9][A-Za-z0-9._-]{0,123}\.[mM]3[uU]8?$/', $value)
                ? $value : null;
        }
        $p = @parse_url($value);
        if (!is_array($p) || !isset($p['scheme'], $p['host'])) { return null; }
        $scheme = strtolower((string) $p['scheme']);
        if ($scheme !== 'http' && $scheme !== 'https') { return null; }
        $host = (string) $p['host'];
        if (isset($p['user']) || isset($p['pass']) || preg_match('/[\x00-\x20\x7f]/', $host)) { return null; }
        $port = isset($p['port']) ? ':' . (int) $p['port'] : '';
        $path = isset($p['path']) ? (string) $p['path'] : '';
        return $scheme . '://' . $host . $port . $path;
    }

    function ape_cablear_public_name($value)
    {
        if (!is_string($value) || $value === '') { return ''; }
        return preg_match('/^[A-Za-z0-9][A-Za-z0-9._-]{0,123}\.[mM]3[uU]8?$/', $value) ? $value : '';
    }

    function ape_cablear_public_text($value)
    {
        if (!is_string($value)) { return $value; }
        $value = preg_replace_callback('/https?:\/\/[^\s"<>]+/i', function ($m) {
            $safe = ape_cablear_public_url($m[0]);
            return $safe === null ? '[url oculta]' : $safe;
        }, $value);
        return preg_replace('/(?:^|[\s(])\/(?:[^\s"<>]+\/)+[^\s"<>]*/', '$1[path oculta]', $value);
    }

    function ape_cablear_public_error($value)
    {
        if (is_array($value)) {
            $out = array();
            foreach ($value as $k => $v) {
                if (preg_match('/(?:^|_)(?:path|staging|final|identity|identidad|device|url)$/i', (string) $k)) { continue; }
                $out[$k] = ape_cablear_public_error($v);
            }
            return $out;
        }
        return is_string($value) ? ape_cablear_public_text($value) : $value;
    }

    function ape_cablear_public_entrada(array $t, array $salida)
    {
        $e = isset($t['entrada']) && is_array($t['entrada']) ? $t['entrada'] : array();
        $p = isset($t['progreso']) && is_array($t['progreso']) ? $t['progreso'] : array();
        $stats = array();
        foreach (array('lineas', 'canales', 'envueltos', 'ya_estaban', 'sin_id', 'bytes_salida') as $k) {
            if (isset($p[$k]) && is_numeric($p[$k])) { $stats[$k] = (int) $p[$k]; }
        }
        $hash = isset($salida['rawsourcehash']) && preg_match('/^[a-f0-9]{64}$/i', (string) $salida['rawsourcehash'])
            ? strtolower((string) $salida['rawsourcehash']) : null;
        $tipo = isset($e['tipo']) ? (string) $e['tipo'] : 'desconocido';
        $ref = isset($e['ref']) ? ape_cablear_public_ref($e['ref']) : null;
        $name = isset($salida['nombre']) ? ape_cablear_public_name($salida['nombre']) : '';
        if ($name === '' && $ref !== null && strpos($ref, '://') === false) { $name = $ref; }
        return array(
            'tipo' => $tipo, 'tipo_lista' => isset($salida['tipo_lista']) ? (string) $salida['tipo_lista'] : null,
            'ref' => $ref, 'nombre' => $name,
            'bytes' => isset($e['bytes']) ? (int) $e['bytes'] : 0,
            'bytes_gz' => isset($e['bytes_gz']) ? (int) $e['bytes_gz'] : null,
            'bytes_descomprimidos' => isset($e['bytes_descomprimidos']) ? (int) $e['bytes_descomprimidos'] : 0,
            'bytes_descomprimidos_estimacion' => !empty($e['bytes_descomprimidos_estimacion']),
            'hash' => $hash, 'estadisticas' => $stats,
        );
    }

    function ape_cablear_body(array $t, $ubicacion, array $io)
    {
        $estado = ape_cablear_estado_de_ticket($t, $ubicacion);
        $salida = isset($t['salida']) && is_array($t['salida']) ? $t['salida'] : array();
        $pub = !empty($salida['publicada']);
        $nombre = isset($salida['nombre']) ? (string) $salida['nombre'] : '';
        $gzipValidado = !empty($salida['gzip_validado'])
            || (isset($t['receipt']) && is_array($t['receipt']) && !empty($t['receipt']['gzip_validado']))
            || (isset($salida['receipt']) && is_array($salida['receipt']) && !empty($salida['receipt']['gzip_validado']));
        $storedBase = isset($t['public_base']) ? ape_cablear_normalize_public_base((string) $t['public_base'], false) : null;
        $base = $storedBase !== null ? $storedBase : ape_cablear_public_base();
        $storedUrl = isset($salida['url']) ? ape_cablear_public_url($salida['url']) : null;
        $urlCableada = ($pub && $nombre !== '') ? ($storedUrl ?: ($base !== null ? $base . '/lists/' . $nombre : null)) : null;
        $storedGzUrl = isset($salida['url_gz']) ? ape_cablear_public_url($salida['url_gz']) : null;
        $urlGz = ($pub && $nombre !== '' && $gzipValidado)
            ? ($storedGzUrl ?: ($base !== null ? $base . '/lists/' . $nombre . '.gz' : null)) : null;
        $salidaPublica = array(
            'nombre' => $nombre, 'url' => $storedUrl, 'url_cableada' => $urlCableada, 'url_gz' => $urlGz,
            'bytes' => isset($salida['bytes']) ? (int) $salida['bytes'] : 0,
            'sha256' => isset($salida['sha256']) && preg_match('/^[a-f0-9]{64}$/i', (string) $salida['sha256']) ? strtolower((string) $salida['sha256']) : null,
            'publicada' => $pub, 'reutilizada' => !empty($salida['reutilizada']),
            'gzip_validado' => $gzipValidado,
            'rawsourcehash' => isset($salida['rawsourcehash']) && preg_match('/^[a-f0-9]{64}$/i', (string) $salida['rawsourcehash']) ? strtolower((string) $salida['rawsourcehash']) : null,
            'tipo_lista' => isset($salida['tipo_lista']) ? (string) $salida['tipo_lista'] : null,
            'passthrough' => isset($salida['passthrough']) && is_numeric($salida['passthrough']) ? (int) $salida['passthrough'] : null,
        );
        $receipt = array(
            'prefix' => 'APE_CABLEAR_RESULT', 'gzip_validado' => $gzipValidado,
            'rawsourcehash' => $salidaPublica['rawsourcehash'],
        );
        return array(
            'ok' => true,
            'ticket' => isset($t['ticket']) ? $t['ticket'] : '',
            'estado' => $estado,
            'fase' => isset($t['fase']) ? $t['fase'] : 'queued',
            'progreso' => isset($t['progreso']) ? ape_cablear_public_error($t['progreso']) : array(),
            'entrada' => ape_cablear_public_entrada($t, $salida),
            'device_present' => array_key_exists('device', $t),
            'publicar' => isset($t['publicar']) ? (int) $t['publicar'] : 0,
            'public_base' => $base,
            'salida' => $salidaPublica,
            'receipt' => $receipt,
            'error' => isset($t['error']) ? ape_cablear_public_error($t['error']) : null,
            'timestamps' => isset($t['timestamps']) ? $t['timestamps'] : array(),
            'intentos' => isset($t['intentos']) ? (int) $t['intentos'] : 0,
            'wiring_version' => isset($t['wiring_version']) ? $t['wiring_version'] : APE_CABLEAR_WIRING,
        );
    }
}
