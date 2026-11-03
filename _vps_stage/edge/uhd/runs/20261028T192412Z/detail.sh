set -u
echo "=== detalle /_ape/health (JSON completo) ==="
curl -s -m 6 'http://127.0.0.1:8088/_ape/health' | php -r '$j=json_decode(stream_get_contents(STDIN),true); echo json_encode($j,JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES),"\n";'
echo "=== nginx -T (config CARGADA) sha256 vs disco ==="
echo "  cargada=$(nginx -T 2>/dev/null | sha256sum | cut -d' ' -f1)"
echo "  disco_conf=$(sha256sum /etc/nginx/conf.d/50-ape-meta-plane.conf | cut -d' ' -f1)"
echo "  ocurrencias_location_ape_uhd_en_disco=$(grep -c '_ape/uhd' /etc/nginx/conf.d/50-ape-meta-plane.conf)"
echo "  ocurrencias_en_config_cargada=$(nginx -T 2>/dev/null | grep -c '_ape/uhd')"
echo "=== conf desplegado: cabecera y tamaño ==="
stat -c '  %n|%s|%a|%U:%G|%y' /etc/nginx/conf.d/50-ape-meta-plane.conf
echo "  primeras 6 lineas:"; head -n 6 /etc/nginx/conf.d/50-ape-meta-plane.conf | sed 's/^/    /'
echo "=== G11 rto_min / ip route ==="
ip route show | head -n 6 | sed 's/^/  /'
echo "=== backup del deploy (stamp 20261028T093843Z): contenido ==="
find /var/backups/ape-deploy/20261028T093843Z -type f -printf '  %s %p\n' 2>/dev/null | sort -k2
echo "DETAIL_END"