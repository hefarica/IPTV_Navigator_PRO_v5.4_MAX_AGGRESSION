<?php
/**
 * ape-cartridge-bulk.php — GET link of the URL-2 cartridge bus.
 *
 * Returns the live 9-mission matrix per profile (computed by ape_cartridge_orchestrator.lua and
 * cached in ngx.shared.ape_cartridge, mirrored to a spool the PHP side reads). Any engine / the
 * device daemon / the generator PULLs this to learn the current calc (HEVC/bitrate/judder/DNR/
 * deblock/color/upscale/fps/variant-hunt) so EVERY consumer is orchestrated off the same source.
 *
 * Mirror of channel-pq-bulk.php: read-only, silent-fail, no-store. If the orchestrator hasn't
 * written yet, returns the static per-profile defaults (never empties → the generator always has
 * a coherent cartridge). Edge-first: the hot path reads ngx.shared directly in Lua; this PHP is the
 * cross-edge / device-sync surface.
 *
 * GET [?profile=P0..P5] [?sports=1]  →  {profile:{missions...}} or {P0:{...},...,P5:{...}}
 */
header('Content-Type: application/json');
header('Cache-Control: no-store');
header('Access-Control-Allow-Origin: *');

$SPOOL = '/dev/shm/ape_cartridge_missions.json';   // orchestrator/qm_apply_worker mirrors shm here

// HEVC-first per-profile static defaults (always coherent; Cardinal-Law-correct).
$DEFAULTS = array(
  'P0' => array('hevc_forced'=>1,'bitrate_bps'=>80000000,'memc_level'=>3,'mpeg_dnr'=>64,'mpeg2_dnr'=>58,'temporal_dnr'=>48,'deblock'=>60,'contrast'=>62,'saturation'=>64,'vibrance'=>20,'ai_sr'=>4,'ai_fi_fps'=>120,'variant_hunt'=>1,'codec'=>'hvc1.2.4.L183.B0'),
  'P1' => array('hevc_forced'=>1,'bitrate_bps'=>28000000,'memc_level'=>3,'mpeg_dnr'=>56,'mpeg2_dnr'=>51,'temporal_dnr'=>42,'deblock'=>53,'contrast'=>61,'saturation'=>62,'vibrance'=>18,'ai_sr'=>4,'ai_fi_fps'=>120,'variant_hunt'=>1,'codec'=>'hvc1.2.4.L153.B0'),
  'P2' => array('hevc_forced'=>1,'bitrate_bps'=>16000000,'memc_level'=>2,'mpeg_dnr'=>46,'mpeg2_dnr'=>42,'temporal_dnr'=>35,'deblock'=>43,'contrast'=>59,'saturation'=>60,'vibrance'=>14,'ai_sr'=>3,'ai_fi_fps'=>60,'variant_hunt'=>1,'codec'=>'hvc1.2.4.L150.B0'),
  'P3' => array('hevc_forced'=>1,'bitrate_bps'=>12000000,'memc_level'=>1,'mpeg_dnr'=>37,'mpeg2_dnr'=>34,'temporal_dnr'=>28,'deblock'=>35,'contrast'=>57,'saturation'=>58,'vibrance'=>12,'ai_sr'=>2,'ai_fi_fps'=>60,'variant_hunt'=>1,'codec'=>'hvc1.2.4.L123.B0'),
  'P4' => array('hevc_forced'=>1,'bitrate_bps'=>5500000,'memc_level'=>1,'mpeg_dnr'=>26,'mpeg2_dnr'=>23,'temporal_dnr'=>19,'deblock'=>24,'contrast'=>55,'saturation'=>56,'vibrance'=>8,'ai_sr'=>2,'ai_fi_fps'=>60,'variant_hunt'=>1,'codec'=>'hvc1.2.4.L93.B0'),
  'P5' => array('hevc_forced'=>1,'bitrate_bps'=>2500000,'memc_level'=>0,'mpeg_dnr'=>16,'mpeg2_dnr'=>14,'temporal_dnr'=>12,'deblock'=>15,'contrast'=>53,'saturation'=>54,'vibrance'=>5,'ai_sr'=>1,'ai_fi_fps'=>30,'variant_hunt'=>1,'codec'=>'hvc1.2.4.L90.B0'),
);

$live = array();
if (is_readable($SPOOL)) {
    $j = json_decode(@file_get_contents($SPOOL), true);
    if (is_array($j)) $live = $j;   // orchestrator-fresh values override defaults
}

$out = array();
foreach ($DEFAULTS as $p => $d) {
    $out[$p] = isset($live[$p]) && is_array($live[$p]) ? array_merge($d, $live[$p]) : $d;
}

$prof = isset($_GET['profile']) ? preg_replace('/[^P0-5]/', '', $_GET['profile']) : '';
if ($prof !== '' && isset($out[$prof])) {
    echo json_encode($out[$prof]);
} else {
    echo json_encode($out);
}
