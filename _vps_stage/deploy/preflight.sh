#!/usr/bin/env bash
# preflight.sh — comprobaciones PREVIAS. READ-ONLY sobre el VPS. Sale !=0 si algo bloquea.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
fails=0; warns=0
c_hdr "PRE-FLIGHT · $VPS_HOST · $(date -u +%FT%TZ)"

c_hdr "1 · conectividad y identidad (read-only)"
if out="$(rsh 'hostname; nginx -v 2>&1; php -v 2>&1 | head -1')"; then
  printf '%s\n' "$out" | sed 's/^/   /'
else
  c_bad "   no se pudo conectar por SSH"; exit 2
fi

c_hdr "2 · manifiesto: origen local + destino remoto"
remote_hashes="$(rsh 'for f in /etc/nginx/lua/ape_header.lua /etc/nginx/lua/ape_uri_rebase.lua /etc/nginx/lua/ape_wake_on_manifest.lua /etc/nginx/lua/ape_gateway.lua /etc/nginx/lua/ape_obs.lua /etc/nginx/lua/ape_lab_api.lua /etc/nginx/lua/ape_luatest.lua /etc/nginx/conf.d/ape-meta-plane.conf /var/www/html/lists/APE_LISTA_PRODUCTION.m3u8; do if [ -f "$f" ]; then printf "%s  %s\n" "$(sha256sum "$f" | cut -d" " -f1)" "$f"; else printf "%s  %s\n" "AUSENTE" "$f"; fi; done' 2>/dev/null)"
n=0
while IFS=$'\t' read -r src dst mode owner note; do
  n=$((n+1))
  if [ ! -f "$REPO_ROOT/$src" ]; then
    c_warn "   [$n] AUSENTE-LOCAL  $src  →  $dst   ($note)"
    warns=$((warns+1))
  else
    printf '   [%d] OK-LOCAL       %s (%s B)  →  %s\n' "$n" "$src" "$(wc -c < "$REPO_ROOT/$src")" "$dst"
  fi
  rh="$(printf '%s\n' "$remote_hashes" | awk -v d="$dst" '$2==d{print $1}')"
  [ -z "$rh" ] && rh="(no listado)"
  printf '        destino-remoto: %s\n' "$rh"
done < <(manifest_rows)

c_hdr "3 · estado base del servidor (para el rollback)"
rsh 'echo "   nginx -t:"; nginx -t 2>&1 | sed "s/^/     /"; echo "   disco:"; df -h / | tail -1 | sed "s/^/     /"; echo "   cert:"; for c in $(nginx -T 2>/dev/null | grep -E "^ *ssl_certificate " | sed "s/^ *ssl_certificate *//;s/;.*//" | sort -u); do openssl x509 -in "$c" -noout -enddate 2>/dev/null | sed "s/^/     /"; done; echo "   backups previos:"; ls -1 /var/backups/ape-deploy 2>/dev/null | tail -5 | sed "s/^/     /" || echo "     (ninguno)"'

c_hdr "RESUMEN PRE-FLIGHT"
printf '   orígenes ausentes en local : %d (no se desplegarán)\n' "$warns"
printf '   bloqueos                   : %d\n' "$fails"
[ "$fails" -eq 0 ] && c_ok "   PRE-FLIGHT OK — nada se ha modificado en el VPS" || c_bad "   PRE-FLIGHT CON BLOQUEOS"
exit "$fails"
