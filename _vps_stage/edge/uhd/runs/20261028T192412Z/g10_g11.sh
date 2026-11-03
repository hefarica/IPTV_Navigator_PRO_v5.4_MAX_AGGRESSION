set -u
echo "=== G10/flags: flags vivos (GET read-only) ==="
curl -s -m 6 'http://127.0.0.1:8088/_ape/flags' 2>/dev/null | head -c 600; echo
echo "=== G10: TTFB delta (loopback TTFB - X-APE-Upstream-Ms), 9 muestras ==="
: > /tmp/ttfb.txt
i=1
while [ $i -le 9 ]; do
  t=$(curl -s -m 8 -o /dev/null -w '%{time_starttransfer}' -D /tmp/h.txt 'https://iptv-ape.duckdns.org/cdn/line.tivi-ott.net/live/3JHFTC/U56BDP/3.m3u8' 2>/dev/null)
  up=$(grep -i '^X-APE-Upstream-Ms:' /tmp/h.txt 2>/dev/null | tr -d '\r' | awk '{print $2}')
  [ -z "${up:-}" ] && up=0
  echo "$t $up" >> /tmp/ttfb.txt
  i=$((i+1)); sleep 0.3
done
php -r '
$rows=[]; foreach(file("/tmp/ttfb.txt",FILE_IGNORE_NEW_LINES|FILE_SKIP_EMPTY_LINES) as $l){ $p=preg_split("/\s+/",trim($l)); if(count($p)<2) continue; $rows[]=[(float)$p[0]*1000.0,(int)$p[1]]; }
if(!$rows){ echo "  sin muestras\n"; exit; }
$ttfb=array_column($rows,0); sort($ttfb); $d=[]; foreach($rows as $r){ $d[]=$r[0]-$r[1]; } sort($d);
$p50=function($a){ $n=count($a); return $n%2 ? $a[intdiv($n,2)] : ($a[$n/2-1]+$a[$n/2])/2; };
printf("  n=%d  TTFB_p50=%.1f ms  delta_p50=%.1f ms  delta_min=%.1f  delta_max=%.1f\n", count($rows), $p50($ttfb), $p50($d), min($d), max($d));
'
rm -f /tmp/ttfb.txt /tmp/h.txt
echo "=== G11: rto_min / metricas de red ==="
ip route show table all 2>/dev/null | grep -c 'rto_min' | sed 's/^/  rutas_con_rto_min=/'
ip route show table all 2>/dev/null | grep 'rto_min' | head -n 4 | sed 's/^/  /'
sysctl -n net.ipv4.tcp_congestion_control net.core.default_qdisc net.ipv4.tcp_fastopen net.ipv4.tcp_slow_start_after_idle 2>&1 | tr '\n' ' ' | sed 's/^/  sysctl: /'; echo
echo "=== /_ape/uhd contadores tras trafico /cdn/ (¿suben?) ==="
curl -s -m 6 'http://127.0.0.1:8088/_ape/uhd'; echo
echo "NET_END"