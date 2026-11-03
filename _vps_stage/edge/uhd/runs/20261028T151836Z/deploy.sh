set -u
STAMP="$1"
BK="/var/backups/ape-php/$STAMP"
STG="/tmp/ape-php-$STAMP"
DB=/opt/netshield/data/conviva.db
L=/var/www/html/prisma/lib/ape_mesh.php
F=/var/www/html/prisma/api/ape-feedforward.php
P=/var/www/html/prisma/cli/push_pq_profile.php
FAIL=0
say(){ printf '%s\n' "$*"; }

say "===== 1. BACKUP $(date -u +%FT%TZ) ====="
mkdir -p "$BK" || { say "FATAL mkdir $BK"; exit 2; }
: > "$BK/BEFORE.sha256"
for pair in "$L:ape_mesh.php" "$F:ape-feedforward.php" "$P:push_pq_profile.php"; do
  src="${pair%%:*}"; base="${pair##*:}"
  [ -f "$src" ] || { say "FATAL ausente $src"; exit 3; }
  cp -a "$src" "$BK/$base.before" || { say "FATAL cp $src"; exit 3; }
  cp -a "$src" "$BK/$base.meta" 2>/dev/null || true
  s=$(sha256sum "$src" | cut -d' ' -f1)
  b=$(sha256sum "$BK/$base.before" | cut -d' ' -f1)
  own=$(stat -c '%U:%G' "$src"); mod=$(stat -c '%a' "$src")
  printf '%s  %s  %s  %s\n' "$s" "$own" "$mod" "$src" >> "$BK/BEFORE.sha256"
  [ "$s" = "$b" ] && say "  OK backup $base sha=$s own=$own mode=$mod" || { say "  FAIL backup $base"; FAIL=1; }
done
say "--- BEFORE.sha256:"; sed 's/^/    /' "$BK/BEFORE.sha256"
# esperados declarados por la tarea
for e in b9bc9a697d4665b782cad573275778bb6dc77741698fc07a90cbd60fe3e7c6ed 4c0668ad1539c99ca2dfb3ee71ccea19eaf23b35051ef0694decb689f8a27278 5d1ef6e9f34960bcf312fe4ca75dc6608623f44cd2eeca9223812bbba7756f8d; do
  grep -q "^$e" "$BK/BEFORE.sha256" && say "  OK hash declarado presente ${e:0:12}" || { say "  WARN hash declarado ausente ${e:0:12}"; }
done

say "===== 2. ROLLBACK listo ANTES de instalar ====="
cat > "$BK/rollback.sh" <<'RB'
#!/bin/bash
set -u
BK="$1"
[ -d "$BK" ] || { echo "FATAL no existe $BK"; exit 2; }
fail=0
while read -r sha own mod src; do
  base=$(basename "$src")
  [ -f "$BK/$base.before" ] || { echo "FAIL falta $BK/$base.before"; fail=1; continue; }
  install -m "$mod" -o "${own%%:*}" -g "${own##*:}" "$BK/$base.before" "$src" || { echo "FAIL install $src"; fail=1; continue; }
  n=$(sha256sum "$src" | cut -d' ' -f1)
  [ "$n" = "$sha" ] && echo "ROLLED_BACK $src sha=$n ($own $mod)" || { echo "FAIL sha $src"; fail=1; }
done < "$BK/BEFORE.sha256"
echo "ROLLBACK_RESULT=$([ $fail -eq 0 ] && echo OK || echo FAIL)"
exit $fail
RB
chmod 700 "$BK/rollback.sh"
say "  OK rollback escrito en $BK/rollback.sh (sin ejecutar)"

say "===== 3. GATE php -l sobre el STAGE ====="
bad=0
for f in "$STG/ape_mesh.php" "$STG/ape-feedforward.php" "$STG/push_pq_profile.php"; do
  out=$(php -l "$f" 2>&1); rc=$?
  say "  php -l $(basename "$f") exit=$rc :: $out"
  [ $rc -ne 0 ] && bad=$((bad+1))
done
[ $bad -eq 0 ] || { say "ABORT: php -l fallo ($bad). NO se instala nada."; exit 10; }
say "  GATE_OK php -l 3/3 exit 0"

say "===== 4. CAPTURAS BEFORE ====="
cat > /tmp/cnt42.php <<'PHP'
<?php $db=$argv[1]; try{ $p=new PDO('sqlite:'.$db); $t=$p->query("SELECT name FROM sqlite_master WHERE type='table'")->fetchAll(PDO::FETCH_COLUMN); echo in_array('policy_deltas',$t,true) ? "policy_deltas=".$p->query("SELECT count(*) FROM policy_deltas")->fetchColumn() : "policy_deltas=0(sin tabla)"; }catch(Throwable $e){ echo "policy_deltas=ERR ".$e->getMessage(); } echo "\n";
PHP
say "  DB=$DB $(php /tmp/cnt42.php "$DB")"
curl -s -m 8 -o /tmp/bf_dev.json -w '  feedforward_dev HTTP=%{http_code} bytes=%{size_download}\n' 'https://iptv-ape.duckdns.org/prisma/api/ape-feedforward.php?device=test-device&ch=3&hdr=0&w=1920&h=1080&codec=avc1&ct=1&buf=30&risk=0'
curl -s -m 8 -o /tmp/bf_file.json -w '  feedforward_file HTTP=%{http_code} bytes=%{size_download}\n' 'https://iptv-ape.duckdns.org/prisma/api/ape-feedforward.php?file=x'
curl -s -m 8 -o /tmp/bf_lua.json -w '  luatest HTTP=%{http_code}\n' 'http://127.0.0.1:8088/_ape/luatest'
curl -sk -m 10 -o /dev/null -w '  cdn HTTP=%{http_code}\n' 'https://iptv-ape.duckdns.org/cdn/line.tivi-ott.net/live/3JHFTC/U56BDP/3.m3u8'

say "===== 5. INSTALL atomico (3 ficheros) ====="
for pair in "$STG/ape_mesh.php:$L" "$STG/ape-feedforward.php:$F" "$STG/push_pq_profile.php:$P"; do
  src="${pair%%:*}"; dst="${pair##*:}"
  install -o www-data -g www-data -m 644 "$src" "$dst" || { say "FATAL install $dst"; echo "RESULT=FAIL"; exit 11; }
  a=$(sha256sum "$src" | cut -d' ' -f1); b=$(sha256sum "$dst" | cut -d' ' -f1)
  [ "$a" = "$b" ] && say "  OK instalado $(basename "$dst") sha=$b own=$(stat -c '%U:%G' "$dst") mode=$(stat -c '%a' "$dst")" || { say "  FAIL sha post-install $dst"; FAIL=1; }
done
say "  esperando 3 s para opcache (validate_timestamps=1 revalidate_freq=2)"
sleep 3

say "===== 6. CAPTURAS AFTER ====="
say "  DB=$(php /tmp/cnt42.php "$DB")"
curl -s -m 8 -o /tmp/af_dev.json -w '  feedforward_dev HTTP=%{http_code} bytes=%{size_download}\n' 'https://iptv-ape.duckdns.org/prisma/api/ape-feedforward.php?device=test-device&ch=3&hdr=0&w=1920&h=1080&codec=avc1&ct=1&buf=30&risk=0'
curl -s -m 8 -o /tmp/af_file.json -w '  feedforward_file HTTP=%{http_code} bytes=%{size_download}\n' 'https://iptv-ape.duckdns.org/prisma/api/ape-feedforward.php?file=x'
curl -s -m 8 -o /tmp/af_lua.json -w '  luatest HTTP=%{http_code}\n' 'http://127.0.0.1:8088/_ape/luatest'
curl -sk -m 10 -o /dev/null -w '  cdn HTTP=%{http_code}\n' 'https://iptv-ape.duckdns.org/cdn/line.tivi-ott.net/live/3JHFTC/U56BDP/3.m3u8'
say "  --- levers:"
say "  ape_vpp_levers(max_image)=$(php -r 'require "/var/www/html/prisma/lib/ape_mesh.php"; echo count(ape_vpp_levers("max_image"));' 2>&1) (exit=$?)"
say "  --- push_pq_profile max_image test-device 3:"
php /var/www/html/prisma/cli/push_pq_profile.php max_image test-device 3 2>&1 | sed 's/^/    /'
say "  push_pq_exit=${PIPESTATUS[0]:-?}"
say "  --- policy_deltas tras push_pq: $(php /tmp/cnt42.php "$DB")"
rm -f /tmp/cnt42.php
say "===== RESULT=$([ $FAIL -eq 0 ] && echo OK || echo FAIL) ====="
exit "$FAIL"