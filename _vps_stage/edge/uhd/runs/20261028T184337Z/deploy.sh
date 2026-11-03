set -u
STAMP="$1"
M=/var/www/html/prisma/lib/ape_mesh.php
STG="/tmp/ape_mesh-$STAMP.php"
BK="/var/backups/ape-php/$STAMP"
FAIL=0
say(){ printf '%s\n' "$*"; }

say "===== 1. BACKUP (solo ape_mesh) $(date -u +%FT%TZ) ====="
mkdir -p "$BK" || exit 2
cp -a "$M" "$BK/ape_mesh.php" || exit 3
s=$(sha256sum "$M" | cut -d' ' -f1); b=$(sha256sum "$BK/ape_mesh.php" | cut -d' ' -f1)
own=$(stat -c '%U:%G' "$M"); mod=$(stat -c '%a' "$M")
printf '%s  %s  %s  %s\n' "$s" "$own" "$mod" "$M" > "$BK/BEFORE.sha256"
say "  BEFORE sha=$s owner=$own mode=$mod bytes=$(stat -c %s "$M")"
[ "$s" = "$b" ] && say "  OK copia byte-identica" || { say "  FAIL copia"; FAIL=1; }
case "$s" in cafe66e4508f*) say "  OK hash == cafe66e4… (declarado por el enunciado)";; *) say "  WARN hash != cafe66e4…";; esac

say "===== 2. ROLLBACK listo ANTES de instalar ====="
cat > "$BK/rollback.sh" <<'RB'
#!/bin/bash
set -u
BK="$1"; M=/var/www/html/prisma/lib/ape_mesh.php
[ -f "$BK/ape_mesh.php" ] || { echo "FATAL sin backup"; exit 2; }
read -r sha own mod src < "$BK/BEFORE.sha256"
install -m "${mod:-644}" -o "${own%%:*}" -g "${own##*:}" "$BK/ape_mesh.php" "$M" || { echo "FAIL install"; exit 3; }
n=$(sha256sum "$M" | cut -d' ' -f1)
[ "$n" = "$sha" ] && echo "ROLLED_BACK $M sha=$n ($own $mod)" || { echo "FAIL sha $n != $sha"; exit 4; }
echo "ROLLBACK_RESULT=OK"
RB
chmod 700 "$BK/rollback.sh"
say "  OK rollback.sh(700) en $BK (restaura owner real del backup: $own $mod)"

say "===== 3. GATE php -l sobre el STAGE ====="
out=$(php -l "$STG" 2>&1); rc=$?
say "  php -l exit=$rc :: $out"
[ $rc -ne 0 ] && { say "ABORT exit 10: php -l fallo. NO se instala."; exit 10; }
a=$(sha256sum "$STG" | cut -d' ' -f1)
say "  stage sha=$a bytes=$(stat -c %s "$STG")"
case "$a" in 37f043b8e833*) say "  OK sha stage == repo 37f043b8";; *) say "  ABORT exit 11: stage != 37f043b8"; exit 11;; esac

say "===== 4. INSTALL atomico ====="
install -o root -g root -m 644 "$STG" "$M" || { say "FATAL install"; exit 12; }
sleep 3
n=$(sha256sum "$M" | cut -d' ' -f1)
say "  instalado sha=$n owner=$(stat -c '%U:%G' "$M") mode=$(stat -c '%a' "$M") bytes=$(stat -c %s "$M")"
case "$n" in 37f043b8e833*) say "  OK desplegado == 37f043b8";; *) say "  FAIL sha post-install"; FAIL=1;; esac

say "===== 5. VERIFICACION POST ====="
say "--- 5a) device=test-device w=3840 h=2160 hvc1"
curl -s -m 10 -o /tmp/ff_after.json -w '  HTTP=%{http_code} bytes=%{size_download}\n' 'https://iptv-ape.duckdns.org/prisma/api/ape-feedforward.php?device=test-device&ch=3&hdr=0&w=3840&h=2160&codec=hvc1&ct=1&buf=30&risk=0'
cat > /tmp/chk45.php <<'PHP'
<?php
$j=json_decode(file_get_contents('/tmp/ff_after.json'),true);
if(!is_array($j)){echo "  NO_JSON\n";exit(1);}
echo "  ape_vpp=",(isset($j['ape_vpp'])?'PRESENTE':'AUSENTE'),"\n";
$v=$j['ape_vpp']??[]; echo "  ape_vpp.claves=",implode(',',array_keys($v)),"\n";
echo "  allowed=",var_export($v['allowed']??null,true)," reason=",($v['reason']??'?'),"\n";
echo "  device_settings=",(is_array($j['device_settings']??null)?count($j['device_settings']):'n/a'),"\n";
echo "  presets=",(is_array($j['presets']??null)?count($j['presets']):'n/a'),"\n";
$e=$v['emulation']??null;
if(!is_array($e)){ echo "  emulation=AUSENTE\n"; exit(2); }
$want=['supersample','ai_sr','ai_pq','sharpness','dnr','deband','chroma_upsample','contrast','saturation','memc','hdr_tone'];
$got=array_keys($e);
echo "  emulation.claves(",count($got),")=",implode(',',$got),"\n";
$missing=array_diff($want,$got); $extra=array_diff($got,$want);
echo "  faltan=",($missing?implode(',',$missing):'ninguno')," sobran=",($extra?implode(',',$extra):'ninguno'),"\n";
echo "  sub-bloques=",count($got),"/11 ",($missing?'FAIL':'OK'),"\n";
$em8=$v['emulate_8k']['enabled']??null; $ss=$e['supersample']['enabled']??null;
echo "  emulate_8k.enabled=",var_export($em8,true)," supersample.enabled=",var_export($ss,true)," iguales=",($em8===$ss?'SI':'NO'),"\n";
exit(($missing||($em8!==$ss))?3:0);
PHP
php /tmp/chk45.php; say "  chk5a_exit=$?"

say "--- 5b) file=x passthrough + cmp con BEFORE"
curl -s -m 10 -o /tmp/ff_file_after.json -w '  HTTP=%{http_code} bytes=%{size_download}\n' 'https://iptv-ape.duckdns.org/prisma/api/ape-feedforward.php?file=x'
cmp -s /tmp/ff_file_before.json /tmp/ff_file_after.json && say "  cmp BEFORE vs AFTER = IDENTICOS (OK)" || { say "  cmp DIFIEREN (FAIL)"; FAIL=1; }
php -r '$j=json_decode(file_get_contents("/tmp/ff_file_after.json"),true); echo "  ape_vpp=",(isset($j["ape_vpp"])?"PRESENTE(FAIL)":"AUSENTE(OK)")," activated=",var_export($j["activated"]??null,true),"\n";' || FAIL=1

say "--- 5c) funciones del modulo (script en /tmp)"
cat > /tmp/mod45.php <<'PHP'
<?php
require '/var/www/html/prisma/lib/ape_mesh.php';
$lv=ape_vpp_levers('max_image'); $n=count($lv);
echo "  levers(max_image)=",$n," ",($n===13?'OK':'FAIL'),"\n";
foreach([3840=>'P0',1920=>'P0',1280=>'P1'] as $w=>$exp){
  try{ $r=ape_vpp_profile_for($w); $got=is_array($r)?($r['profile']??json_encode($r)):$r;
    echo "  profile_for($w)=",$got," esperado=$exp ",(strpos((string)$got,$exp)===0?'OK':'FAIL'),"\n"; }
  catch(Throwable $e){ echo "  profile_for($w)=EXC ",$e->getMessage()," FAIL\n"; }
}
PHP
php /tmp/mod45.php; say "  mod_exit=$?"

say "--- 5d) push_pq_profile (no debe escribir)"
php /var/www/html/prisma/cli/push_pq_profile.php max_image test-device 3 2>&1 | sed 's/^/    /'
say "  push_pq_exit=${PIPESTATUS[0]:-?}"
php -r 'try{$p=new PDO("sqlite:/opt/netshield/data/conviva.db");$t=$p->query("SELECT name FROM sqlite_master WHERE type=\"table\"")->fetchAll(PDO::FETCH_COLUMN);echo "  policy_deltas=",(in_array("policy_deltas",$t,true)?$p->query("SELECT count(*) FROM policy_deltas")->fetchColumn():"sin tabla"),"\n";}catch(Throwable $e){echo "  policy_deltas=ERR ",$e->getMessage(),"\n";}'

say "--- 5e) borde y nginx intactos"
curl -s -m 6 -o /tmp/lua_af.json -w '  luatest HTTP=%{http_code}\n' 'http://127.0.0.1:8088/_ape/luatest'
php -r '$j=json_decode(@file_get_contents("/tmp/lua_af.json"),true); echo "  expected=",($j["expected"]??"?")," asserts_ok=",var_export($j["asserts_ok"]??null,true)," fail=",($j["fail"]??"?"),"\n";'
curl -sk -m 10 -o /dev/null -w '  cdn HTTP=%{http_code}\n' 'https://iptv-ape.duckdns.org/cdn/line.tivi-ott.net/live/3JHFTC/U56BDP/3.m3u8'
curl -s -m 6 -o /dev/null -w '  _ape/uhd HTTP=%{http_code}\n' 'http://127.0.0.1:8088/_ape/uhd'
nginx -t 2>&1 | sed 's/^/  /'
systemctl show nginx -p MainPID -p NRestarts | sed 's/^/  /'
rm -f /tmp/chk45.php /tmp/mod45.php
say "===== RESULT=$([ $FAIL -eq 0 ] && echo OK || echo FAIL) ====="
exit "$FAIL"