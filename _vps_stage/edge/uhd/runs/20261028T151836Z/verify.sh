set -u
echo "=== VERIFICACION POST detallada $(date -u +%FT%TZ) ==="
cat > /tmp/chk42.php <<'PHP'
<?php
$f=$argv[1]; $j=json_decode(file_get_contents($f),true);
if($j===null){echo "  NO_JSON\n";exit;}
echo "  claves=",implode(",",array_keys($j)),"\n";
echo "  activated=",var_export($j["activated"]??null,true),"\n";
echo "  ape_vpp=",(isset($j["ape_vpp"])?"PRESENTE":"AUSENTE"),"\n";
if(isset($j["ape_vpp"])){
  $v=$j["ape_vpp"];
  echo "  ape_vpp.claves=",implode(",",array_keys($v)),"\n";
  echo "  ape_vpp.allowed=",var_export($v["allowed"]??null,true),"\n";
  if(isset($v["levers"])) echo "  ape_vpp.levers_count=",is_array($v["levers"])?count($v["levers"]):"n/a","\n";
  if(isset($v["reason"])) echo "  ape_vpp.reason=",$v["reason"],"\n";
}
echo "  device_settings_count=",(isset($j["device_settings"])&&is_array($j["device_settings"])?count($j["device_settings"]):"n/a"),"\n";
echo "  presets_count=",(isset($j["presets"])&&is_array($j["presets"])?count($j["presets"]):"n/a"),"\n";
echo "  preset_count_field=",var_export($j["preset_count"]??null,true),"\n";
PHP
echo "--- BEFORE dev:"; php /tmp/chk42.php /tmp/bf_dev.json
echo "--- AFTER  dev:"; php /tmp/chk42.php /tmp/af_dev.json
echo "--- BEFORE file:"; php /tmp/chk42.php /tmp/bf_file.json
echo "--- AFTER  file:"; php /tmp/chk42.php /tmp/af_file.json
echo "--- diff BEFORE vs AFTER (file=x debe ser identico):"
cmp -s /tmp/bf_file.json /tmp/af_file.json && echo "  IDENTICOS (cmp OK)" || { echo "  DIFIEREN"; diff <(cat /tmp/bf_file.json) <(cat /tmp/af_file.json) | head -5; }
echo "--- DB mesh: existe? tamano? mtime?"
ls -la /opt/netshield/data/conviva.db 2>&1
ls -la /opt/netshield/data/ 2>&1 | head -n 8
echo "--- luatest detalle"
curl -s -m 6 http://127.0.0.1:8088/_ape/luatest -o /tmp/lua.json
php -r '$j=json_decode(file_get_contents("/tmp/lua.json"),true); echo "  expected=",($j["expected"]??"?")," asserts_ok=",var_export($j["asserts_ok"]??null,true)," fail=",($j["fail"]??"?"),"\n";'
echo "--- hashes instalados finales"
sha256sum /var/www/html/prisma/lib/ape_mesh.php /var/www/html/prisma/api/ape-feedforward.php /var/www/html/prisma/cli/push_pq_profile.php
rm -f /tmp/chk42.php
echo "VERIFY_END"