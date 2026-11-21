<?php
/* /var/www/html/prisma/api/qoe-controller.php
 * QOE CONTROLLER — heurístico por defecto + override del LLM validado.
 * Sin SQLite, sin shm, sin dependencias: lee métricas del query y el override
 * del fichero de estado. Rangos aplicados SIEMPRE aquí, no en el cliente. */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-APE-Qoe: controller');

$STATE = '/var/www/html/prisma/state';
$OVF   = $STATE . '/llm_overrides.json';

$ch   = isset($_GET['ch'])  ? preg_replace('/[^A-Za-z0-9_.-]/', '', (string)$_GET['ch']) : '';
if ($ch === '') { http_response_code(400); echo json_encode(['ok'=>false,'err'=>'falta_ch']); exit; }
$tgt  = isset($_GET['tgt']) ? preg_replace('/[^a-z]/','',(string)$_GET['tgt']) : 'ott';
$rtt  = isset($_GET['rtt'])    ? (float)$_GET['rtt']    : 18.0;
$jit  = isset($_GET['jitter']) ? (float)$_GET['jitter'] : 3.2;
$loss = isset($_GET['loss'])   ? (float)$_GET['loss']   : 0.0;
$fps  = isset($_GET['fps'])    ? (int)$_GET['fps']      : 50;
$w    = isset($_GET['w'])      ? (int)$_GET['w']        : 3840;
$h    = isset($_GET['h'])      ? (int)$_GET['h']        : 2160;
$seg  = isset($_GET['seg'])    ? (int)$_GET['seg']      : 4;
if ($fps < 1 || $fps > 240) $fps = 50;
if ($seg < 1 || $seg > 10)  $seg = 4;

$cl = function ($v, $a, $b) { return $v < $a ? $a : ($v > $b ? $b : $v); };

/* [2026-11-16 FIX Q-3 · HIGH] json_encode(INF) devuelve FALSE -> cuerpo VACIO
 * con HTTP 200. Medido por map-endpoint: ?rtt=1e999 -> 200 y cuerpo vacio.
 * Cualquier parametro numerico podia romper el JSON. Se sanean TODOS aqui. */
$__fin = function ($v, $d) { return (is_finite($v) ? $v : $d); };
$rtt  = $__fin($rtt, 18.0);
$jit  = $__fin($jit, 3.2);
$loss = $__fin($loss, 0.0);

/* [2026-11-16 FIX Q-2 · HIGH] 4 claves de filtro se devolvian SIN validar:
 * medido zscale="danger;rm -rf" salia tal cual hacia el consumidor. Ahora solo
 * pasa un charset estricto: sin espacios, comillas, ';', '$', '`', '|', '&'. */
$__STR_OK = '/^[0-9A-Za-z:=.,_+\-]{1,120}$/';
$__dropped = array();


/* ── heurístico (default) ─────────────────────────────────────────────── */
$gop    = $fps * $seg;                 // GOP alineado con el segmento
$degraded = ($jit > 8.0 || $loss > 0.5);
$depth  = $degraded ? 5 : 3;
$fm     = $degraded ? 1 : 2;           // fps de stutter tolerados (menor = estricto)
$pb     = $degraded ? 4 : 3;
$probe  = ($jit > 4.0) ? 100 : $gop;
$cad    = ['mode'=>'fixed','fps'=>$fps,'gop'=>$gop,'seg'=>$seg,'vsync'=>'cfr'];
$flt    = null;

$src = 'heuristic';

/* ── override del LLM: SÓLO campos del esquema, SÓLO en rango ─────────── */
if (is_file($OVF)) {
    $raw = @file_get_contents($OVF);
    $all = $raw ? json_decode($raw, true) : null;
    $o = null;
    if (is_array($all)) {
        if (isset($all['channels']) && is_array($all['channels']) && isset($all['channels'][$ch]) && is_array($all['channels'][$ch])) {
            $o = $all['channels'][$ch];
        } elseif (isset($all['ch']) && $all['ch'] === $ch) {
            $o = $all;
        }
    }
    if (is_array($o)) {
        $applied = [];
        if (isset($o['net']) && is_array($o['net'])) {
            $n = $o['net'];
            if (isset($n['depth']) && is_numeric($n['depth'])) { $depth = (int)$cl((int)$n['depth'], 2, 8); $applied[]='net.depth'; }
            if (isset($n['fm'])    && is_numeric($n['fm']))    { $fm    = (int)$cl((int)$n['fm'], 1, 5);    $applied[]='net.fm'; }
            if (isset($n['pb'])    && is_numeric($n['pb']))    { $pb    = (int)$cl((int)$n['pb'], 2, 6);    $applied[]='net.pb'; }
            if (isset($n['probe']) && is_numeric($n['probe'])) { $probe = (int)$cl((int)$n['probe'], 50, 200); $applied[]='net.probe'; }
        }
        if (isset($o['cad']) && is_array($o['cad'])) {
            foreach (['fps'=>[1,240],'gop'=>[1,4000],'seg'=>[1,10]] as $k=>$rg) {
                if (isset($o['cad'][$k]) && is_numeric($o['cad'][$k])) { $cad[$k] = (int)$cl((int)$o['cad'][$k], $rg[0], $rg[1]); $applied[]='cad.'.$k; }
            }
            if (isset($o['cad']['v']) && in_array($o['cad']['v'], ['cfr','vfr'], true)) { $cad['vsync'] = $o['cad']['v']; $applied[]='cad.v'; }
        }
        if (isset($o['flt']) && $o['flt'] !== null && $o['flt'] !== '') {
            /* sólo se aceptan claves conocidas; cualquier otro campo se descarta */
            $allow = ['nlmeans_s','nlmeans_p','nlmeans_r','unsharp','gradfun','zscale','eq','downscale'];
            $f = [];
            if (is_array($o['flt'])) {
                foreach ($allow as $k) { if (isset($o['flt'][$k])) $f[$k] = $o['flt'][$k]; }
            }
            if ($f) {
                if (isset($f['nlmeans_s']) && is_numeric($f['nlmeans_s'])) $f['nlmeans_s'] = round($cl((float)$f['nlmeans_s'], 0.05, 2.0), 2);
                if (isset($f['nlmeans_p']) && is_numeric($f['nlmeans_p'])) $f['nlmeans_p'] = (int)$cl((int)$f['nlmeans_p'], 1, 15);
                if (isset($f['nlmeans_r']) && is_numeric($f['nlmeans_r'])) $f['nlmeans_r'] = (int)$cl((int)$f['nlmeans_r'], 3, 30);
                if (isset($f['downscale']) && is_numeric($f['downscale'])) $f['downscale'] = (int)$cl((int)$f['downscale'], 0, 1);
                foreach (array('unsharp','gradfun','zscale','eq') as $__sk) {
                    if (!isset($f[$__sk])) continue;
                    $__sv = $f[$__sk];
                    if (!is_string($__sv) || !preg_match($__STR_OK, $__sv)) {
                        unset($f[$__sk]); $__dropped[] = $__sk; continue;
                    }
                    $f[$__sk] = $__sv;
                }
                if (!$f) { $flt = null; $__dropped[] = 'flt_all'; }
                else { $flt = $f; $applied[] = 'flt'; }
            }
        }
        if ($applied) { $src = 'override'; $o['_applied'] = $applied; $appliedOut = $applied; }
    }
}

/* ── [T15-RECIPE 2026-11-19] Receta de detalle del tier declarado ─────────
 * Si el canal no trae override de filtros, se sirve la receta del PERFIL:
 *   p = P0..P5 (parametro existente) · k=6k -> usa <p>.5 (6K SIMULATE)
 * Fuente: state/ape_flt_recipes.json, generado del LAB con
 * tools/gen-profiles-12k.js (lleva el sha256 del LAB dentro).
 * Se aplican EXACTAMENTE la misma allowlist y los mismos clamps que al
 * override: nada entra sin validar. El 6K es SIMULATE (no hay transcode en el
 * VPS); la receta la aplica el VPP del device / el pipeline del APK. */
$__tierOut = null;
if ($flt === null && is_file('/var/www/html/prisma/state/ape_flt_recipes.json')) {
    $__rj = json_decode((string) @file_get_contents('/var/www/html/prisma/state/ape_flt_recipes.json'), true);
    if (is_array($__rj) && isset($__rj['profiles']) && is_array($__rj['profiles'])) {
        $__pid = 'P3';
        if (isset($_GET['p'])) {
            $__pid = strtoupper((string) preg_replace('/[^A-Za-z0-9.]/', '', (string) $_GET['p']));
            if (!preg_match('/^P[0-5]$/', $__pid)) { $__pid = 'P3'; }
        }
        $__k6 = (isset($_GET['k']) && strtolower((string) $_GET['k']) === '6k');
        $__want = ($__k6 && isset($__rj['profiles'][$__pid . '.5'])) ? $__pid . '.5' : $__pid;
        if (isset($__rj['profiles'][$__want]) && is_array($__rj['profiles'][$__want])) {
            $__src2 = $__rj['profiles'][$__want];
            $__allow2 = ['nlmeans_s', 'nlmeans_p', 'nlmeans_r', 'unsharp', 'gradfun', 'zscale', 'eq', 'downscale'];
            $__f2 = [];
            foreach ($__allow2 as $__k2) { if (isset($__src2[$__k2])) { $__f2[$__k2] = $__src2[$__k2]; } }
            if (isset($__f2['nlmeans_s']) && is_numeric($__f2['nlmeans_s'])) { $__f2['nlmeans_s'] = round($cl((float) $__f2['nlmeans_s'], 0.05, 2.0), 2); }
            if (isset($__f2['nlmeans_p']) && is_numeric($__f2['nlmeans_p'])) { $__f2['nlmeans_p'] = (int) $cl((int) $__f2['nlmeans_p'], 1, 15); }
            if (isset($__f2['nlmeans_r']) && is_numeric($__f2['nlmeans_r'])) { $__f2['nlmeans_r'] = (int) $cl((int) $__f2['nlmeans_r'], 3, 30); }
            if (isset($__f2['downscale']) && is_numeric($__f2['downscale'])) { $__f2['downscale'] = (int) $cl((int) $__f2['downscale'], 0, 1); }
            foreach (array('unsharp', 'gradfun', 'zscale', 'eq') as $__sk2) {
                if (!isset($__f2[$__sk2])) { continue; }
                if (!is_string($__f2[$__sk2]) || !preg_match($__STR_OK, $__f2[$__sk2])) { unset($__f2[$__sk2]); $__dropped[] = $__sk2 . '.recipe'; continue; }
            }
            if ($__f2) {
                $flt = $__f2;
                $__tierOut = $__want;
                $src = 'recipe';
                $appliedOut[] = 'flt.recipe';
                $appliedOut[] = 'tier=' . $__want;
            }
        }
    }
}


$__out = [
    'ok'  => true,
    'ch'  => $ch,
    'tgt' => $tgt,
    'src' => $src,
    'net' => [
        'rtt'=>$rtt, 'jit'=>$jit, 'loss'=>$loss,
        'depth'=>$depth, 'fm'=>$fm, 'pb'=>$pb, 'probe'=>$probe,
        'degraded'=>$degraded, 'seg_max'=>$seg, 'strip'=>true, 'comp'=>false, 'hop'=>0
    ],
    'cad' => $cad,
    'flt' => $flt,
    'tier' => $__tierOut,
    'vid' => ['w'=>$w,'h'=>$h,'fps'=>$fps,'gop'=>$gop,'seg'=>$seg],
    'applied' => isset($appliedOut) ? $appliedOut : [],
    'ts'  => time(),
    'dropped' => isset($__dropped) ? array_values(array_unique($__dropped)) : []
];
$__json = json_encode($__out, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT | JSON_PARTIAL_OUTPUT_ON_ERROR);
if ($__json === false || $__json === '') {
    http_response_code(500);
    echo '{"ok":false,"err":"json_encode"}';
    exit;
}
echo $__json;
