set -u
echo "=== 5c-bis: frontera real de ape_vpp_profile_for (código desplegado) ==="
cat > /tmp/prof45.php <<'PHP'
<?php
require '/var/www/html/prisma/lib/ape_mesh.php';
foreach([3840,1920,1280,1279,1024,854] as $w){
  $r=ape_vpp_profile_for($w);
  printf("  w=%-5d profile=%s sr_needed=%s\n",$w,$r['profile'],var_export($r['sr_needed'],true));
}
PHP
php /tmp/prof45.php; echo "  prof_exit=$?"
rm -f /tmp/prof45.php
echo
echo "=== MONITORING 5 min (10 x 30 s) inicio $(date -u +%FT%TZ) ==="
URL='https://iptv-ape.duckdns.org/prisma/api/ape-feedforward.php?device=test-device&ch=3&hdr=0&w=3840&h=2160&codec=hvc1&ct=1&buf=30&risk=0'
CDN='https://iptv-ape.duckdns.org/cdn/line.tivi-ott.net/live/3JHFTC/U56BDP/3.m3u8'
BAD=0; i=1
while [ $i -le 10 ]; do
  f=$(curl -s -m 8 -o /tmp/mf.json -w '%{http_code}' "$URL")
  e=$(php -r '$j=json_decode(@file_get_contents("/tmp/mf.json"),true); $n=0; if(is_array($j)&&isset($j["ape_vpp"]["emulation"])&&is_array($j["ape_vpp"]["emulation"])) $n=count($j["ape_vpp"]["emulation"]); echo $n;' 2>/dev/null)
  l=$(curl -s -m 6 -o /tmp/ml.json -w '%{http_code}' 'http://127.0.0.1:8088/_ape/luatest')
  lo=$(php -r '$j=json_decode(@file_get_contents("/tmp/ml.json"),true); echo (is_array($j)&&($j["asserts_ok"]??false)===true)?"88ok":"luaBAD";' 2>/dev/null)
  c=$(curl -sk -m 10 -o /dev/null -w '%{http_code}' "$CDN")
  st=OK
  [ "$f" = "200" ] || st=DEGRADED
  [ "$e" = "11" ] || st=DEGRADED
  [ "$l" = "200" ] || st=DEGRADED
  [ "$lo" = "88ok" ] || st=DEGRADED
  [ "$c" = "200" ] || st=DEGRADED
  [ "$st" = "DEGRADED" ] && BAD=$((BAD+1))
  printf '  [%02d] %s feedforward=%s emulation_subbocks=%s luatest=%s/%s cdn=%s state=%s\n' "$i" "$(date -u +%H:%M:%SZ)" "$f" "$e" "$l" "$lo" "$c" "$st"
  i=$((i+1)); [ $i -le 10 ] && sleep 30
done
echo "=== MONITORING fin $(date -u +%FT%TZ) degradados=$BAD/10 ==="
rm -f /tmp/mf.json /tmp/ml.json
echo "MONITOR_RESULT=$([ $BAD -eq 0 ] && echo OK || echo DEGRADED)"