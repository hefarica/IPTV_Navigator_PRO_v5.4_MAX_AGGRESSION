set -u
echo "=== BEFORE captura completa $(date -u +%FT%TZ) ==="
echo "--- A) device=test-device (JSON completo)"
curl -s -m 8 -o /tmp/bf_a.json -w 'HTTP=%{http_code} bytes=%{size_download}\n' 'https://iptv-ape.duckdns.org/prisma/api/ape-feedforward.php?device=test-device&ch=3&hdr=0&w=1920&h=1080&codec=avc1&ct=1&buf=30&risk=0'
php -r '$j=json_decode(file_get_contents("/tmp/bf_a.json"),true); echo "keys=",implode(",",array_keys($j)),"\n"; echo "ape_vpp_presente=",(isset($j["ape_vpp"])?"SI":"NO"),"\n"; echo "device_settings_count=",(isset($j["device_settings"])&&is_array($j["device_settings"])?count($j["device_settings"]):"n/a"),"\n"; echo "presets_count=",(isset($j["presets"])&&is_array($j["presets"])?count($j["presets"]):"n/a"),"\n"; echo "activated=",var_export($j["activated"]??null,true),"\n";'
echo "--- B) SIN device, file=x (passthrough)"
curl -s -m 8 -o /tmp/bf_b.json -w 'HTTP=%{http_code} bytes=%{size_download}\n' 'https://iptv-ape.duckdns.org/prisma/api/ape-feedforward.php?file=x'
php -r '$j=json_decode(file_get_contents("/tmp/bf_b.json"),true); if($j===null){echo "NO_JSON raw=",substr(file_get_contents("/tmp/bf_b.json"),0,200),"\n";exit;} echo "keys=",implode(",",array_keys($j)),"\n"; echo "ape_vpp_presente=",(isset($j["ape_vpp"])?"SI":"NO"),"\n"; echo "activated=",var_export($j["activated"]??null,true),"\n";'
echo "--- C) tablas de la DB (read-only) para policy_deltas"
for db in /var/www/html/prisma/db/ape_lists.db /var/www/html/prisma/db/ape_devices.db; do
  echo "  DB=$db"
  php -r '$pdo=new PDO("sqlite:".$argv[1],[],null);$pdo->setAttribute(PDO::ATTR_ERRMODE,PDO::ERRMODE_EXCEPTION);foreach($pdo->query("SELECT name FROM sqlite_master WHERE type=\"table\"") as $r){echo "    ",$r["name"],"\n";}' "$db" 2>&1
done
echo "--- D) policy_deltas count BEFORE"
for db in /var/www/html/prisma/db/ape_lists.db /var/www/html/prisma/db/ape_devices.db; do
php -r '$db=$argv[1];try{$pdo=new PDO("sqlite:".$db);$n=$pdo->query("SELECT count(*) FROM policy_deltas")->fetchColumn();echo "    $db policy_deltas=$n\n";}catch(Throwable $e){echo "    $db sin tabla policy_deltas\n";}' "$db" 2>&1
done
echo "BEFORE_END"