<?php
/**
 * test_exthsimott_php.php — test del emisor PHP del payload `shimott`.
 *
 * Uso (host con PHP):
 *   php tools/pulse/test_exthsimott_php.php
 * Exit: 0 = PASS · 1 = FAIL.
 *
 * No necesita el VPS ni nginx: incluye el helper real y prueba la función pura.
 * Cubre: forma exacta del payload, dominio de cada campo, omisión de lo
 * desconocido (sin centinelas), sanitización del id, flag OFF y patrones del
 * contrato (id/tgt) + presupuesto de línea (4096).
 */
require_once __DIR__ . '/../../IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api/ape-shimott-emit.php';

$pass = 0;
$fail = 0;
function t($name, $cond, $detail = '') {
    global $pass, $fail;
    if ($cond) { $pass++; echo "  PASS  $name\n"; }
    else { $fail++; echo "  FAIL  $name" . ($detail !== '' ? ' :: ' . $detail : '') . "\n"; }
}
function j($v) { $s = json_encode($v, JSON_UNESCAPED_SLASHES); return $s === false ? '<json_error>' : $s; }

$base = array(
    'global match_content_frame_rate 1',
    'global hdr_conversion_mode 1',
    'global minimal_post_processing_allowed 0',
);

$p = ape_shimott_payload('1', $base);
t('payload base: forma exacta (sin campos extra, sin defaults)',
  $p === array('ver' => 1, 'id' => '1', 'dev' => array('hdr_c' => 1, 'mcr' => 1, 'mmp' => 0), 'tgt' => 'ott'),
  j($p));
t('payload base: JSON compacto canonico', j($p) === '{"ver":1,"id":"1","dev":{"hdr_c":1,"mcr":1,"mmp":0},"tgt":"ott"}', j($p));

$p2 = ape_shimott_payload('canal_9', array('global hdr_conversion_mode 0'));
t('rollback PQ: hdr_conversion_mode 0 -> hdr_c 0 (lo que el daemon aplica)',
  is_array($p2) && $p2['dev'] === array('hdr_c' => 0), j($p2));

t('sin canal -> null (no se inventa id)', ape_shimott_payload('', $base) === null);

$p4 = ape_shimott_payload('canal con espacios', $base);
t('id sanitizado a patron del contrato', is_array($p4) && $p4['id'] === 'canal_con_espacios', j($p4));

$p5 = ape_shimott_payload('1', array('system com.amazon.tv.picture_mode movie'));
t('claves no mapeadas -> dev omitido (no objeto vacio)', $p5 === array('ver' => 1, 'id' => '1', 'tgt' => 'ott'), j($p5));

$p6 = ape_shimott_payload('1', array('global match_content_frame_rate 9'));
t('valor fuera de dominio -> campo omitido (no se corrige)', $p6 === array('ver' => 1, 'id' => '1', 'tgt' => 'ott'), j($p6));

$p7 = ape_shimott_payload('1', array('global match_content_frame_rate 2', 'global match_content_frame_rate 0'));
t('clave duplicada: gana el primer valor real (2)', is_array($p7) && $p7['dev'] === array('mcr' => 2), j($p7));

$p8 = ape_shimott_payload('1', array('global user_preferred_resolution_width 3840', 'global user_preferred_resolution_height 2160'));
t('res_w/res_h en rango se emiten; el resto se omite',
  is_array($p8) && $p8['dev'] === array('res_w' => 3840, 'res_h' => 2160), j($p8));

$p9 = ape_shimott_payload('///', $base);
t('id sin ningun caracter utilizable -> null (no se inventa)', $p9 === null, j($p9));

$p10 = ape_shimott_payload('1', $base, array('tgt' => 'ott|vlc|kod'));
t('tgt override valido se respeta', is_array($p10) && $p10['tgt'] === 'ott|vlc|kod', j($p10));
$p11 = ape_shimott_payload('1', $base, array('tgt' => 'web|ott'));
t('tgt invalido cae a ott (contrato, sin inventar targets)', is_array($p11) && $p11['tgt'] === 'ott', j($p11));
$p12 = ape_shimott_payload('1', $base, array('tgt' => 'ott|vlc|vlc|ott'));
t('tgt sin duplicados (E_TGT_DUP del contrato)', is_array($p12) && $p12['tgt'] === 'ott|vlc', j($p12));

putenv('APE_SHIMOTT_EMIT=0');
t('flag APE_SHIMOTT_EMIT=0 -> null (no cambia la respuesta)', ape_shimott_payload('1', $base) === null);
putenv('APE_SHIMOTT_EMIT');
t('flag sin definir -> ON', ape_shimott_payload('1', $base) !== null);

$idOk = is_array($p) && preg_match('/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/', $p['id']) === 1;
$tgtOk = is_array($p) && preg_match('/^(ott|vlc|kod)(\|(ott|vlc|kod))*$/', $p['tgt']) === 1;
t('patrones id/tgt del contrato', $idOk && $tgtOk);
$line = '#EXTSHIMOTT:' . j($p);
t('linea completa <= 4096 chars (techo del contrato)', strlen($line) <= 4096, 'len=' . strlen($line));

echo "\n== RESULTADO: $pass PASS · $fail FAIL ==\n";
exit($fail ? 1 : 0);
