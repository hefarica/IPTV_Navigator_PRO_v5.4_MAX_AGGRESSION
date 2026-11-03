set -u
echo "=== ¿Coincide la config EN DISCO con la que nginx tiene CARGADA? (nginx -T, read-only) ==="
echo "  nginx -T sha256 ahora: $(nginx -T 2>/dev/null | sha256sum | cut -d' ' -f1)"
echo "  referencia t30 09:33Z: 0c6c0ea0090e7dd7defb0845763e4eb050ed21dfc70953e987cfd9d9b3813d1c"
echo "  stat del conf:"
stat -c '  %n|%s|%y' /etc/nginx/conf.d/50-ape-meta-plane.conf
echo "=== ¿el bloque /_ape/uhd ya esta en la config? (lo que traeria el cambio t29/t32) ==="
grep -c '_ape/uhd' /etc/nginx/conf.d/50-ape-meta-plane.conf 2>/dev/null | sed 's/^/  ocurrencias_ape_uhd=/'
echo "=== reloads de nginx en el journal desde 09:00Z (read-only) ==="
journalctl -u nginx --since '2026-10-28 09:00:00' --no-pager 2>/dev/null | grep -iE 'reload|Reloading|signal' | tail -n 8 | sed 's/^/  /' || echo "  (journal no accesible)"
echo "NGX_END"