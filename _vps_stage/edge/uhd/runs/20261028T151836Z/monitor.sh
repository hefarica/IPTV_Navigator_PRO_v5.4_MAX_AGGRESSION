set -u
URL='https://iptv-ape.duckdns.org/prisma/api/ape-feedforward.php?device=test-device&ch=3&hdr=0&w=1920&h=1080&codec=avc1&ct=1&buf=30&risk=0'
CDN='https://iptv-ape.duckdns.org/cdn/line.tivi-ott.net/live/3JHFTC/U56BDP/3.m3u8'
echo "=== MONITORING 5 min (10 x 30 s) inicio $(date -u +%FT%TZ) ==="
BAD=0
i=1
while [ $i -le 10 ]; do
  f_code=$(curl -s -m 8 -o /tmp/m_f.json -w '%{http_code}' "$URL")
  f_vpp=$(php -r '$j=json_decode(@file_get_contents("/tmp/m_f.json"),true); echo (is_array($j)&&isset($j["ape_vpp"]))?"vpp":"novpp";' 2>/dev/null)
  l_code=$(curl -s -m 6 -o /tmp/m_l.json -w '%{http_code}' 'http://127.0.0.1:8088/_ape/luatest')
  l_ok=$(php -r '$j=json_decode(@file_get_contents("/tmp/m_l.json"),true); echo (is_array($j)&&($j["asserts_ok"]??false)===true)?"88ok":"luaBAD";' 2>/dev/null)
  c_code=$(curl -sk -m 10 -o /dev/null -w '%{http_code}' "$CDN")
  st=OK
  [ "$f_code" = "200" ] || st=DEGRADED
  [ "$f_vpp" = "vpp" ] || st=DEGRADED
  [ "$l_code" = "200" ] || st=DEGRADED
  [ "$l_ok" = "88ok" ] || st=DEGRADED
  [ "$c_code" = "200" ] || st=DEGRADED
  [ "$st" = "DEGRADED" ] && BAD=$((BAD+1))
  printf '  [%02d] %s feedforward=%s/%s luatest=%s/%s cdn=%s state=%s\n' "$i" "$(date -u +%H:%M:%SZ)" "$f_code" "$f_vpp" "$l_code" "$l_ok" "$c_code" "$st"
  i=$((i+1))
  [ $i -le 10 ] && sleep 30
done
echo "=== MONITORING fin $(date -u +%FT%TZ) degradados=$BAD/10 ==="
rm -f /tmp/m_f.json /tmp/m_l.json
echo "MONITOR_RESULT=$([ $BAD -eq 0 ] && echo OK || echo DEGRADED)"