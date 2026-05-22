<?php
// Consolidation 2026-05-21: apply user values + WIRE the missing features into
// the quality-manifest (QoE, AFR, VPN, daemon behaviors) so the widget shows them
// and the single daemon reads them. Safe: backup + dedupe + regenerate hash.
$f = '/var/www/html/prisma/quality-manifest.json';
if (!is_file($f)) { fwrite(STDERR, "manifest not found\n"); exit(1); }
copy($f, $f . '.bak_' . date('Ymd_His') . '_PRE_CONSOLIDATE');
$data = json_decode(file_get_contents($f), true);
$m = $data['manifest'] ?? null;
if (!is_array($m)) { fwrite(STDERR, "bad manifest\n"); exit(1); }

// 1) Apply user values
$want = ['peak_luminance'=>'8000','color_depth'=>'10','enable_dolby_atmos'=>'0'];
$changed = [];
foreach ($m as &$s) {
    if (isset($s['key'], $want[$s['key']]) && $s['value'] !== $want[$s['key']]) {
        $changed[] = $s['key'].': '.$s['value'].' -> '.$want[$s['key']];
        $s['value'] = $want[$s['key']];
    }
}
unset($s);

// 2) Wire the features that were NOT in the frontend yet
$existing = array_column($m, 'key');
$add = [
  // VPN / Xray (real ADB settings — daemon applies via settings put)
  ['ns'=>'secure','key'=>'always_on_vpn_app','value'=>'com.v2ray.ang','group'=>'vpn','label'=>'VPN App (Xray)','type'=>'readonly'],
  ['ns'=>'secure','key'=>'always_on_vpn_lockdown','value'=>'1','group'=>'vpn','label'=>'VPN Lockdown','type'=>'toggle'],
  // Network / system (real ADB settings)
  ['ns'=>'global','key'=>'tcp_default_init_rwnd','value'=>'60','group'=>'net','label'=>'TCP Init RWND','type'=>'number'],
  ['ns'=>'global','key'=>'private_dns_specifier','value'=>'dns.google','group'=>'net','label'=>'Private DNS','type'=>'text'],
  ['ns'=>'global','key'=>'stay_on_while_plugged_in','value'=>'3','group'=>'net','label'=>'Stay On (plugged)','type'=>'toggle'],
  // AFR anti-judder (daemon flag → runs cmd display clear-preferred-mode)
  ['ns'=>'daemon','key'=>'afr_anti_judder','value'=>'1','group'=>'afr','label'=>'AFR Anti-Judder','type'=>'toggle'],
  // QoE (daemon flags → report judder/rebuffer in heartbeat)
  ['ns'=>'daemon','key'=>'qoe_report','value'=>'1','group'=>'qoe','label'=>'QoE -> Heartbeat','type'=>'toggle'],
  ['ns'=>'daemon','key'=>'qoe_interval_s','value'=>'30','group'=>'qoe','label'=>'QoE Sample (s)','type'=>'number'],
  // Daemon behaviors (the anti-pixelation core)
  ['ns'=>'daemon','key'=>'kill_bandwidth_thieves','value'=>'1','group'=>'daemon','label'=>'Kill BW Thieves','type'=>'toggle'],
  ['ns'=>'daemon','key'=>'drop_caches','value'=>'1','group'=>'daemon','label'=>'Drop Caches (RAM)','type'=>'toggle'],
  ['ns'=>'daemon','key'=>'tcp_lowlatency_tuning','value'=>'1','group'=>'daemon','label'=>'TCP Low-Latency','type'=>'toggle'],
];
$added = [];
foreach ($add as $n) { if (!in_array($n['key'], $existing, true)) { $m[] = $n; $added[] = $n['group'].'/'.$n['key']; } }

$data['manifest'] = $m;
$data['saved_at'] = date('c');
$data['saved_by'] = 'consolidation_20260521';
file_put_contents($f, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
$hash = md5_file($f);
file_put_contents('/var/www/html/prisma/quality-manifest.hash', $hash);
@chmod('/var/www/html/prisma/quality-manifest.hash', 0644);
file_put_contents('/var/www/html/prisma/quality-manifest.pending', '1');

echo "changed_values:\n  ".(empty($changed)?'(none)':implode("\n  ",$changed))."\n";
echo "wired_new:\n  ".(empty($added)?'(all already present)':implode("\n  ",$added))."\n";
echo "total_settings: ".count($m)."\n";
echo "hash: $hash\n";
