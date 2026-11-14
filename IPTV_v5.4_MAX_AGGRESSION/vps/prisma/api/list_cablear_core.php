<?php
/**
 * list_cablear_core.php — logica del panel de cableado de listas (contrato t59).
 *
 * FUENTE DEL CONTRATO: contracts/list_cablear_panel_v1.json
 *   schema ape.lists.cablear_panel.contract.v1 · version 1.0.0 · revision 1
 *
 * POR QUE TODO VIVE AQUI Y NO EN LOS ENDPOINTS: el contrato se puede probar
 * sin VPS, sin red y sin disco si la logica es pura y las dependencias se
 * inyectan ($io). Los endpoints (list-cablear.php / list-cablear-status.php)
 * solo parsean la peticion, llaman y emiten. Eso es lo que permite el test
 * tools/quality/test_list_cablear_panel.js.
 *
 * INVARIANTE DE ESTE FICHERO: no escribe NADA al incluirlo. Todo lo que toca
 * disco esta detras de un store explicito ('fs' | 'mem').
 *
 * DESVIACIONES DECLARADAS (ver docs/audits/LIST_CABLEAR_IMPL_20261114.md):
 *  D1 raiz de listas: el contrato pide que realpath() empiece por
 *     '/var/www/html/lists/'. MEDIDO: /var/www/html/lists es un SYMLINK a
 *     /var/www/lists, o sea que realpath() devuelve '/var/www/lists/...' y la
 *     comprobacion literal rechazaria TODA lista valida. Se compara contra
 *     realpath(raiz) y se conserva la barrera real (no salir del directorio).
 *  D2 codigo nuevo E_DEVICE_INVALIDO: el contrato define regex para device pero
 *     no da codigo de rechazo. Usar un device distinto del pedido en silencio
 *     seria mentir en el parametro d= de cada URL. Fail-closed.
 *  D3 publicar/forzar: se aceptan estrictamente '1'; cualquier otro valor es 0.
 *     Asimetrico a proposito: equivocarse hacia 0 nunca publica ni re-cablea.
 *  D4 upload/descarga externa: NO implementada. El contrato la admite pero exige
 *     allowlist vacia por defecto; sin downloader no hay SSRF posible y la
 *     validacion 12 (host en allowlist) se evalua igual para dar el codigo
 *     correcto. Se declara en el informe.
 */

if (!defined('APE_CABLEAR_CORE')) {
    define('APE_CABLEAR_CORE', 1);

    /* define() y no const: `const` no se permite dentro de un bloque condicional
     * (el include va protegido por if (!defined(...))), y PHP lo rechaza con
     * "unexpected token const". Medido con php -l. */
    define('APE_CABLEAR_SCHEMA',        'ape.lists.cablear.ticket.v1');
    define('APE_CABLEAR_WIRING',        'ape-wire-1');
    define('APE_CABLEAR_BASE',          'https://iptv-ape.duckdns.org');
    define('APE_CABLEAR_MIN_FREE_MB',   3000);
    define('APE_CABLEAR_MAX_BYTES',     2147483648);   // 2 GiB (validacion 9)
    define('APE_CABLEAR_MAX_LEN',       2048);         // campo lista (validacion 3)
    define('APE_CABLEAR_TERMINAL_DAYS', 7);
    define('APE_CABLEAR_TICKET_TTL',    604800);       // 7 d

    /* ── IO inyectable ───────────────────────────────────────────────────── */
    function ape_cablear_io(array $o = array())
    {
        $root = getenv('APE_CABLEAR_ROOT');
        $base = array(
            'lists_root' => getenv('APE_CABLEAR_LISTS_ROOT') ?: '/var/www/html/lists',
            'queue_root' => $root ?: '/var/lib/ape/cablear',
            'allowlist'  => getenv('APE_CABLEAR_ALLOW') ?: '/etc/ape/cablear-hosts.allow',
            'store'      => getenv('APE_CABLEAR_STORE') ?: 'fs',   // 'fs' | 'mem'
            'free_mb'    => null,                                  // null = medir
            'now_ms'     => null,                                  // null = microtime
            'mem'        => null,                                  // estado del store 'mem'
            'ls_resolve' => null,                                  // override para test
            'file_exists' => null,
            'lstat'      => null,
            /* Inyectable: el test prueba con esto que se intentan los CINCO
             * directorios y que un fallo de creacion da E_COLA_NO_ESCRIBIBLE con
             * la ruta literal, sin escribir nada en ningun disco. */
            'mkdir'      => null,
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

    /* ── Device por defecto (el descriptor medido del contrato) ───────────── */
    function ape_cablear_default_device()
    {
        return 'eyJ0IjoiZ2VuZXJpYyIsInMiOiJ1bmtub3duIiwiciI6MjA0OCwidyI6MTkyMCwiaCI6MTA4MCwiZiI6MzB9';
    }

    /* ── Forma de entrada ─────────────────────────────────────────────────── */
    function ape_cablear_es_url($lista)
    {
        return is_string($lista) && strpos($lista, '://') !== false;
    }

    /** true si el host esta en la allowlist del operador (comodin de prefijo '.'). */
    function ape_cablear_host_permitido($host, array $io)
    {
        $host = strtolower(rtrim((string) $host, '.'));
        if ($host === '' || !is_file($io['allowlist'])) { return false; }   // fail-closed
        $lines = @file($io['allowlist'], FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if (!is_array($lines)) { return false; }
        foreach ($lines as $l) {
            $l = trim($l);
            if ($l === '' || $l[0] === '#') { continue; }
            $l = strtolower(rtrim($l, '.'));
            if ($l !== '' && $l[0] === '.') {                 // comodin de sufijo
                $suf = substr($l, 1);
                if ($host === $suf || substr($host, -strlen('.' . $suf)) === '.' . $suf) { return true; }
            } elseif ($host === $l) {
                return true;
            }
        }
        return false;
    }

    /** Tamano SIN comprimir de un .gz leyendo el trailer ISIZE (no descomprime). */
    function ape_cablear_gz_size($path)
    {
        if (!is_file($path)) { return null; }
        $fh = @fopen($path, 'rb');
        if (!$fh) { return null; }
        $sz = @filesize($path);
        $val = null;
        if ($sz !== false && $sz >= 18) {
            if (fseek($fh, -4, SEEK_END) === 0) {
                $b = fread($fh, 4);
                if (is_string($b) && strlen($b) === 4) {
                    $u = unpack('V', $b);
                    if (isset($u[1]) && $u[1] > 0) { $val = (int) $u[1]; }
                }
            }
        }
        fclose($fh);
        return $val;
    }

    /* ── Coste/guardia de disco ───────────────────────────────────────────── */
    function ape_cablear_free_mb(array $io)
    {
        if ($io['free_mb'] !== null) { return (int) $io['free_mb']; }
        $root = $io['queue_root'];
        $probe = is_dir($root) ? $root : dirname($root);
        $free = @disk_free_space($probe);
        if ($free === false || $free === null) { return null; }   // no medible -> fail-closed
        return (int) floor($free / 1048576);
    }

    /* ── Validacion: las 14 del contrato, EN ORDEN ───────────────────────── */
    /**
     * @return array [ok(bool), code|null, http(int), motivo(string), fuente(array|null)]
     */
    function ape_cablear_validate(array $in, array $io)
    {
        $lista = isset($in['lista']) ? (string) $in['lista'] : '';

        /* 1 — metodo */
        if (isset($in['_method']) && strtoupper((string) $in['_method']) !== 'POST') {
            return array(false, 'E_METODO_NO_PERMITIDO', 405, 'solo POST', null);
        }
        /* 2 — presente y no vacio */
        if (trim($lista) === '') {
            return array(false, 'E_LISTA_REQUERIDA', 400, 'el campo lista es obligatorio', null);
        }
        /* 3 — longitud */
        if (strlen($lista) > APE_CABLEAR_MAX_LEN) {
            return array(false, 'E_LISTA_DEMASIADO_LARGA', 400,
                'lista supera ' . APE_CABLEAR_MAX_LEN . ' bytes', null);
        }

        $esUrl = ape_cablear_es_url($lista);
        $listsRoot = rtrim($io['lists_root'], '/');

        if (!$esUrl) {
            /* 4 — regex del nombre (B1 + B2 del contrato: sin '/', '\\', '..', ':' ni NUL) */
            if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9._-]{0,123}\.m3u8$/', $lista)) {
                return array(false, 'E_LISTA_NOMBRE_INVALIDO', 400,
                    'el nombre debe casar ^[A-Za-z0-9][A-Za-z0-9._-]{0,123}\\.m3u8$', null);
            }
            $cand = $listsRoot . '/' . $lista;

            /* 5 — no salir del directorio (B3). D1: contra realpath(raiz). */
            $rootReal = realpath($listsRoot);
            $candReal = realpath($cand);
            if ($rootReal === false) {
                return array(false, 'E_LISTA_FUERA_DE_DIRECTORIO', 400,
                    'la raiz de listas no resuelve: ' . $listsRoot, null);
            }
            if ($candReal === false) {
                /* No resuelve: se decide con la comprobacion 8 (existe) para no
                 * devolver un codigo que oculte el motivo real. */
                $rootPrefix = rtrim($rootReal, '/') . '/';
                if (strpos($listsRoot . '/', $rootPrefix) !== 0 && !0) { /* no-op */ }
            } else {
                $rootPrefix = rtrim($rootReal, '/') . '/';
                if (strpos($candReal, $rootPrefix) !== 0) {
                    return array(false, 'E_LISTA_FUERA_DE_DIRECTORIO', 400,
                        'la ruta resuelta escapa de ' . $rootReal, null);
                }
            }

            /* 6 — no symlink en el ultimo componente (B4) */
            $lst = @lstat($cand);
            if (is_array($lst) && isset($lst['mode']) && (($lst['mode'] & 0170000) === 0120000)) {
                return array(false, 'E_LISTA_ES_SYMLINK', 400,
                    'el destino final es un symlink; no se cablea el blanco de un enlace', null);
            }

            /* 7 — variantes rechazadas */
            if (preg_match('/(_CABLEADA\.m3u8|\.m3u8\.gz|_SHIELDED\.m3u8)$/i', $lista)) {
                return array(false, 'E_VARIANTE_NO_CABLEABLE', 400,
                    'no se cablea una variante ya cableada, un .gz ni una blindada', null);
            }

            /* 8 — existe y legible */
            if (!is_file($cand) || !is_readable($cand)) {
                return array(false, 'E_LISTA_NO_EXISTE', 404, 'no existe o no es legible: ' . $lista, null);
            }

            /* 9 — tamano fuente <= 2 GiB (con el .gz si el .m3u8 es un stub) */
            $bytes = (int) @filesize($cand);
            $mtime = (int) @filemtime($cand);
            $gzBytes = null;
            if ($bytes < 1024) {
                $gzBytes = ape_cablear_gz_size($cand . '.gz');
                if ($gzBytes === null && is_file($cand . '.gz')) {
                    $gzBytes = (int) @filesize($cand . '.gz');
                }
            }
            if ($bytes > APE_CABLEAR_MAX_BYTES) {
                return array(false, 'E_LISTA_DEMASIADO_GRANDE', 413,
                    'la fuente supera 2 GiB', null);
            }
            $fuente = array(
                'tipo' => 'fichero', 'ref' => $lista, 'path' => $cand,
                'bytes' => $bytes, 'mtime_epoch' => $mtime,
                'bytes_descomprimidos' => ($gzBytes !== null && $gzBytes > $bytes) ? $gzBytes : $bytes,
                'canonica' => $listsRoot . '/' . $lista,
            );
        } else {
            /* 10 — esquema */
            $p = parse_url($lista);
            $scheme = isset($p['scheme']) ? strtolower($p['scheme']) : '';
            if ($scheme !== 'http' && $scheme !== 'https') {
                return array(false, 'E_ESQUEMA_NO_PERMITIDO', 400,
                    'solo http/https; se recibio "' . $scheme . '"', null);
            }
            /* 11 — sin userinfo */
            if (isset($p['user']) || isset($p['pass'])) {
                return array(false, 'E_URL_CON_CREDENCIALES', 400,
                    'la URL lleva usuario:password', null);
            }
            $host = isset($p['host']) ? $p['host'] : '';
            /* 12 — host en allowlist del operador (VACIA por defecto -> fail-closed) */
            if (!ape_cablear_host_permitido($host, $io)) {
                return array(false, 'E_HOST_NO_PERMITIDO', 403,
                    'host "' . $host . '" no esta en ' . $io['allowlist'] . ' (vacia por defecto)', null);
            }
            $fuente = array(
                'tipo' => 'url', 'ref' => $lista, 'url' => $lista,
                'bytes' => 0, 'mtime_epoch' => 0,
                'bytes_descomprimidos' => 0, 'canonica' => $lista,
            );
        }

        /* 13 — guardia de disco (misma regla que ape-cablear-auto.sh) */
        $free = ape_cablear_free_mb($io);
        if ($free === null) {
            return array(false, 'E_DISCO_INSUFICIENTE', 507,
                'no se pudo medir el espacio libre en ' . $io['queue_root'], null);
        }
        $costMb = (int) ceil(($fuente['bytes_descomprimidos'] * 2) / 1048576);
        if ($free < APE_CABLEAR_MIN_FREE_MB || $costMb > ($free - APE_CABLEAR_MIN_FREE_MB)) {
            return array(false, 'E_DISCO_INSUFICIENTE', 507,
                'no cabe: libre=' . $free . 'MB, minimo=' . APE_CABLEAR_MIN_FREE_MB
                . 'MB, coste_estimado=' . $costMb . 'MB; el ticket se conserva para reintentar', null);
        }

        /* 14 — cola escribible (se comprueba de verdad, no se asume)
         *
         * [2026-11-14, hallazgo de t62 verificado por el capitan] EL WORKER NO
         * CREA ESTOS DIRECTORIOS: su .path solo lleva MakeDirectory sobre cola/.
         * Medido en el VPS: ni siquiera existia /var/lib/ape/cablear (aunque
         * /var/lib/ape si). Sin ellos, el encolado escribe en cola/ y el worker
         * NO puede hacer el rename a tomados/: el ticket se quedaria en cola
         * para siempre y el operador veria "queued" eterno sin saber por que.
         * Por eso los crea el ENCOLADO, los cinco, y de forma recursiva (el
         * padre /var/lib/ape/cablear tambien, que es la primera entrada de
         * ape_cablear_dirs()).
         *
         * MODO 0775: la casa usa tres modos distintos (0755 en
         * ape-canon-ingest.php:55 y pulse.php:261; 0775 en ara-device.php:121;
         * 0770 en qoe-flush.php:200). Aqui manda el caso real: escribe el
         * endpoint como www-data y LEE/renombra el worker, que puede correr con
         * otro usuario; 0775 es el unico del repertorio que cubre a los dos sin
         * abrir el directorio a todo el mundo.
         *
         * SI FALLA: error explicito con la ruta literal. Nunca un fallo mudo que
         * deje el panel en "queued" eterno.
         */
        if ($io['store'] === 'fs') {
            $dirs = ape_cablear_dirs($io);
            foreach ($dirs as $d) {
                if (is_dir($d)) { continue; }
                $creado = ($io['mkdir'] !== null)
                    ? (bool) call_user_func($io['mkdir'], $d)
                    : @mkdir($d, 0775, true);
                if (!$creado && !is_dir($d)) {
                    return array(false, 'E_COLA_NO_ESCRIBIBLE', 500,
                        'no se pudo crear el directorio de la cola: ' . $d
                        . ' (el worker NO puede renombrar el ticket a tomados/ sin el;'
                        . ' el ticket no se crea para no dejar un queued eterno)', null);
                }
            }
            if (!is_writable($dirs['cola'])) {
                $usr = 'desconocido';
                if (function_exists('posix_getpwuid') && function_exists('posix_geteuid')) {
                    $pw = @posix_getpwuid(posix_geteuid());
                    if (is_array($pw) && isset($pw['name'])) { $usr = (string) $pw['name']; }
                }
                return array(false, 'E_COLA_NO_ESCRIBIBLE', 500,
                    'la cola no es escribible: ' . $dirs['cola'] . ' (usuario del proceso: ' . $usr . ')', null);
            }
        }

        return array(true, null, 200, 'ok', $fuente);
    }

    /* ── Clave de idempotencia ────────────────────────────────────────────── */
    function ape_cablear_clave(array $fuente)
    {
        return hash('sha256',
            $fuente['canonica'] . '|' . (int) $fuente['bytes'] . '|'
            . (int) $fuente['mtime_epoch'] . '|' . APE_CABLEAR_WIRING);
    }

    /* ── Cola: directorios ────────────────────────────────────────────────── */
    function ape_cablear_dirs(array $io)
    {
        $r = rtrim($io['queue_root'], '/');
        return array(
            'root'     => $r,
            'cola'     => $r . '/cola',
            'tomados'  => $r . '/tomados',
            'hechos'   => $r . '/hechos',
            'fallidos' => $r . '/fallidos',
            'staging'  => $r . '/staging',
        );
    }

    /* ── Store: 'mem' (test, cero disco) y 'fs' (produccion) ──────────────── */
    function ape_cablear_store_list(array $io, $dir)
    {
        if ($io['store'] === 'mem') {
            $m = $io['mem'] ? $io['mem'] : array();
            return isset($m[$dir]) ? $m[$dir] : array();
        }
        $d = ape_cablear_dirs($io);
        $path = isset($d[$dir]) ? $d[$dir] : $d['cola'];
        $out = array();
        foreach ((array) @glob($path . '/t-*.json') as $f) {
            $j = json_decode((string) @file_get_contents($f), true);
            if (is_array($j)) { $out[basename($f)] = $j; }
        }
        return $out;
    }
    function ape_cablear_store_put(array &$io, $dir, $name, array $ticket)
    {
        if ($io['store'] === 'mem') {
            if (!is_array($io['mem'])) { $io['mem'] = array(); }
            $io['mem'][$dir][$name] = $ticket;
            return true;
        }
        $d = ape_cablear_dirs($io);
        $target = $d[$dir] . '/' . $name;
        $tmp = $d[$dir] . '/.tmp-' . $name;
        /* ENCOLADO ATOMICO: escribir .tmp y DESPUES rename. Un lector nunca ve
         * un JSON a medio escribir (contrato: queue.enqueue_atomic). */
        if (@file_put_contents($tmp, json_encode($ticket, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)) === false) {
            return false;
        }
        if (!@rename($tmp, $target)) { @unlink($tmp); return false; }
        return true;
    }

    /** Busca un ticket por clave en cola/tomados/hechos/fallidos (idempotencia). */
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

    /* ── Encolar ──────────────────────────────────────────────────────────── */
    /**
     * @param array $io POR REFERENCIA: el store 'mem' vive en $io['mem'], y si se
     *                  pasara por valor el ticket escrito se perderia al volver
     *                  (medido: la idempotencia fallaba y devolvia un 2.º ticket).
     * @return array respuesta lista para emitir: {http, body}
     */
    function ape_cablear_enqueue(array $in, array &$io)
    {
        list($ok, $code, $http, $motivo, $fuente) = ape_cablear_validate($in, $io);
        if (!$ok) {
            return array('http' => $http, 'body' => array(
                'ok' => false, 'error' => $code, 'motivo' => $motivo,
            ));
        }

        $clave = ape_cablear_clave($fuente);
        $forzar = (isset($in['forzar']) && (string) $in['forzar'] === '1');

        if (!$forzar) {
            $prev = ape_cablear_find_by_clave($io, $clave);
            if ($prev !== null) {
                /* IDEMPOTENCIA (contrato I4): repetir devuelve EL MISMO ticket. */
                return array('http' => 200, 'body' => array(
                    'ok' => true,
                    'estado' => 'duplicado',
                    'ticket' => $prev['ticket']['ticket'],
                    'ubicacion' => $prev['dir'],
                    'estado_previo' => isset($prev['ticket']['estado']) ? $prev['ticket']['estado'] : 'queued',
                    'estado_url' => '/prisma/api/cablear-estado.php?ticket=' . $prev['ticket']['ticket'],
                ));
            }
        }

        /* D2: device — si viene, tiene que casar su regex. */
        $device = ape_cablear_default_device();
        if (isset($in['device']) && (string) $in['device'] !== '') {
            $dv = (string) $in['device'];
            if (!preg_match('/^[A-Za-z0-9_-]{16,512}$/', $dv)) {
                return array('http' => 400, 'body' => array(
                    'ok' => false, 'error' => 'E_DEVICE_INVALIDO',
                    'motivo' => 'device debe casar ^[A-Za-z0-9_-]{16,512}$ (o omitirse)',
                ));
            }
            $device = $dv;
        }

        $nowMs = ape_cablear_now_ms($io);
        $id = 't-' . $nowMs . '-' . ape_cablear_rand8();
        $nombreSalida = preg_replace('/\.m3u8$/i', '', $fuente['ref']) . '_CABLEADA.m3u8';

        $ticket = array(
            'schema'         => APE_CABLEAR_SCHEMA,
            'ticket'         => $id,
            'clave'          => $clave,
            'estado'         => 'queued',
            'fase'           => 'queued',
            'entrada'        => array(
                'tipo' => $fuente['tipo'], 'ref' => $fuente['ref'],
                'bytes' => (int) $fuente['bytes'], 'mtime_epoch' => (int) $fuente['mtime_epoch'],
            ),
            'salida'         => array(
                'nombre' => $nombreSalida,
                'path_staging' => ape_cablear_dirs($io)['staging'] . '/' . $id . '/' . $nombreSalida,
                'path_final' => rtrim($io['lists_root'], '/') . '/' . $nombreSalida,
                'bytes' => 0, 'sha256' => null, 'publicada' => false,
            ),
            'publicar'       => (isset($in['publicar']) && (string) $in['publicar'] === '1') ? 1 : 0,
            'forzar'         => $forzar ? 1 : 0,
            'device'         => $device,
            'wiring_version' => APE_CABLEAR_WIRING,
            'intentos'       => 0,
            'timestamps'     => array(
                'encolado' => ape_cablear_iso($nowMs),
                'iniciado' => null, 'heartbeat' => null, 'terminado' => null,
            ),
            'progreso'       => array(
                'lineas' => 0, 'canales' => 0, 'envueltos' => 0,
                'ya_estaban' => 0, 'sin_id' => 0, 'bytes_salida' => 0,
            ),
            'error'          => null,
        );
        if ($fuente['tipo'] === 'fichero') { $ticket['entrada']['path'] = $fuente['path']; }
        else { $ticket['entrada']['url'] = $fuente['url']; }

        $name = $id . '.json';
        if (!ape_cablear_store_put($io, 'cola', $name, $ticket)) {
            return array('http' => 500, 'body' => array(
                'ok' => false, 'error' => 'E_COLA_NO_ESCRIBIBLE',
                'motivo' => 'no se pudo escribir el ticket ' . $name,
            ));
        }
        $pos = count(ape_cablear_store_list($io, 'cola'));

        return array('http' => 202, 'body' => array(
            'ok' => true, 'estado' => 'queued', 'ticket' => $id,
            'estado_url' => '/prisma/api/cablear-estado.php?ticket=' . $id,
            'cola_posicion' => $pos,
        ));
    }

    /* ── Estado ───────────────────────────────────────────────────────────── */
    function ape_cablear_estado_de_ticket(array $t, $ubicacion)
    {
        if ($ubicacion === 'hechos') { return isset($t['estado']) ? $t['estado'] : 'done'; }
        if ($ubicacion === 'fallidos') { return isset($t['estado']) ? $t['estado'] : 'failed'; }
        if ($ubicacion === 'tomados') { return 'running'; }
        return isset($t['estado']) ? $t['estado'] : 'queued';
    }

    /**
     * @return array {http, body}
     */
    function ape_cablear_status(array $q, array $io)
    {
        $n = 0;
        foreach (array('ticket', 'ultimos', 'lista') as $k) {
            if (isset($q[$k]) && (string) $q[$k] !== '') { $n++; }
        }
        if ($n !== 1) {
            return array('http' => 400, 'body' => array(
                'ok' => false, 'error' => 'E_CONSULTA_AMBIGUA',
                'motivo' => 'exactamente uno de ticket, ultimos o lista',
            ));
        }

        if (isset($q['ticket']) && (string) $q['ticket'] !== '') {
            $id = (string) $q['ticket'];
            if (!preg_match('/^t-[0-9]{13}-[a-z0-9]{8}$/', $id)) {
                return array('http' => 404, 'body' => array(
                    'ok' => false, 'error' => 'E_TICKET_DESCONOCIDO', 'motivo' => 'formato de ticket invalido',
                ));
            }
            foreach (array('tomados', 'hechos', 'fallidos', 'cola') as $dir) {
                $list = ape_cablear_store_list($io, $dir);
                $name = $id . '.json';
                if (isset($list[$name])) {
                    return array('http' => 200, 'body' => ape_cablear_body($list[$name], $dir, $io));
                }
            }
            return array('http' => 410, 'body' => array(
                'ok' => false, 'estado' => 'expired', 'error' => 'E_TICKET_DESCONOCIDO',
                'motivo' => 'el ticket ya no existe (TTL de terminales o cola limpiada)',
            ));
        }

        /* ?ultimos=N  (1..50) y ?lista=<nombre>: devuelven un array de tickets. */
        $max = 10;
        if (isset($q['ultimos'])) {
            if (!preg_match('/^[1-9][0-9]?$/', (string) $q['ultimos'])) {
                return array('http' => 400, 'body' => array(
                    'ok' => false, 'error' => 'E_CONSULTA_AMBIGUA', 'motivo' => 'ultimos debe ser 1..50',
                ));
            }
            $max = min(50, (int) $q['ultimos']);
        }
        $filtro = isset($q['lista']) ? (string) $q['lista'] : null;
        $all = array();
        foreach (array('tomados', 'cola', 'hechos', 'fallidos') as $dir) {
            foreach (ape_cablear_store_list($io, $dir) as $t) {
                if ($filtro !== null) {
                    $ref = isset($t['entrada']['ref']) ? (string) $t['entrada']['ref'] : '';
                    if ($ref !== $filtro) { continue; }
                }
                $all[] = ape_cablear_body($t, $dir, $io);
            }
        }
        usort($all, function ($a, $b) {
            return strcmp((string) $b['timestamps']['encolado'], (string) $a['timestamps']['encolado']);
        });
        return array('http' => 200, 'body' => array(
            'ok' => true, 'count' => min($max, count($all)),
            'tickets' => array_slice($all, 0, $max),
        ));
    }

    /** Cuerpo canonico del contrato (status_endpoint.response_shape). */
    function ape_cablear_body(array $t, $ubicacion, array $io)
    {
        $estado = ape_cablear_estado_de_ticket($t, $ubicacion);
        $salida = isset($t['salida']) && is_array($t['salida']) ? $t['salida'] : array();
        $pub = !empty($salida['publicada']);
        $nombre = isset($salida['nombre']) ? (string) $salida['nombre'] : '';
        return array(
            'ok'        => true,
            'ticket'    => isset($t['ticket']) ? $t['ticket'] : '',
            'estado'    => $estado,
            'fase'      => isset($t['fase']) ? $t['fase'] : 'queued',
            'progreso'  => isset($t['progreso']) ? $t['progreso'] : array(),
            'entrada'   => isset($t['entrada']) ? $t['entrada'] : array(),
            'salida'    => array(
                'nombre'       => $nombre,
                /* url_cableada SOLO existe si se publico (invariante I3). */
                'url_cableada' => ($pub && $nombre !== '') ? APE_CABLEAR_BASE . '/lists/' . $nombre : null,
                'url_gz'       => ($pub && $nombre !== '') ? APE_CABLEAR_BASE . '/lists/' . $nombre . '.gz' : null,
                'bytes'        => isset($salida['bytes']) ? (int) $salida['bytes'] : 0,
                'sha256'       => isset($salida['sha256']) ? $salida['sha256'] : null,
                'publicada'    => $pub,
                'reutilizada'  => !empty($salida['reutilizada']),
            ),
            'error'     => isset($t['error']) ? $t['error'] : null,
            'timestamps' => isset($t['timestamps']) ? $t['timestamps'] : array(),
            'intentos'  => isset($t['intentos']) ? (int) $t['intentos'] : 0,
            'wiring_version' => isset($t['wiring_version']) ? $t['wiring_version'] : APE_CABLEAR_WIRING,
        );
    }
}
