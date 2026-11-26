#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# Test del consumidor de la cola (t62). SIN red ni VPS; PHP REAL local.
#
#   bash ape-cablear-queue-worker.test.sh      -> exit 0 si todo pasa
#
# Lo que prueba, y por que cada caso existe:
#   1  ticket valido con fichero pequeno real        -> done + salida escrita
#   2  dos workers a la vez sobre el mismo ticket    -> el motor corre UNA vez
#   3  nombre con traversal                          -> rechazo con motivo
#   4  lista inexistente                             -> rechazo con motivo
#   5  guardia de disco                              -> skipped_disk, no failed
#   6  fuente que ya es _CABLEADA                    -> rechazo (no doble-envuelto)
#   7  ticket con nombre no conforme                 -> se deja en cola, no se borra
#   8  ticket con JSON ilegible                      -> se deja en cola, no se borra
#   9  la lista ORIGINAL no se toca                  -> sha256 igual antes/despues
#  10  publicar=1 escribe en /lists; publicar=0 en staging
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
W="$HERE/ape-cablear-queue-worker.sh"
REAL_CABLER="$(cd "$HERE/../../.." && pwd)/tools/ops/ape-cablear-lista.php"
command -v php >/dev/null || { echo 'FALTA PHP local; no se usa SSH'; exit 2; }
T="$(mktemp -d "${TMPDIR:-/tmp}/cablearq.XXXXXX")" || exit 9
trap 'rm -rf "$T"' EXIT

PASS=0; FAIL=0
ok() { PASS=$((PASS+1)); printf 'PASS  %s\n' "$*"; }
no() { FAIL=$((FAIL+1)); printf 'FAIL  %s\n' "$*"; }
eq() { if [ "$2" = "$3" ]; then ok "$1 [$2]"; else no "$1 (esperado [$3], obtenido [$2])"; fi; }
has() { case "$2" in *"$3"*) ok "$1";; *) no "$1 (no contiene [$3] en [$2])";; esac; }

setup() {
  R="$T/c$1"; L="$R/lists"
  mkdir -p "$R/cola" "$R/tomados" "$R/hechos" "$R/fallidos" "$R/staging" "$L"
  : > "$T/log$1"; : > "$T/count$1"
}
# Instrumentación sobre el motor real; fallos inyectados sólo para regresión.
cat > "$T/engine.sh" <<'EOS'
#!/usr/bin/env bash
[ -n "${ENGINE_COUNT:-}" ] && echo run >> "$ENGINE_COUNT"
in="$1"; out="$2"
[ -s "$in" ] || exit 1
case "${ENGINE_BEHAVIOR:-}" in
  slow) sleep 2 ;;
  no_receipt) php "$REAL_CABLER" "$@" | sed '/^APE_CABLEAR_RESULT=/d'; exit "${PIPESTATUS[0]}" ;;
  mutate) php "$REAL_CABLER" "$@"; rc=$?; printf '#CAMBIO durante trabajo\n' >> "$in"; exit "$rc" ;;
  bad_receipt)
    php "$REAL_CABLER" "$@" | node -e '
      let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{console.log(s.replace(/^APE_CABLEAR_RESULT=(.*)$/m,(_,j)=>{const r=JSON.parse(j),k=process.env.RECEIPT_FIELD;r[k]=k.startsWith("sha256")?"0".repeat(64):k==="tipo_lista"?"inventado":-1;return "APE_CABLEAR_RESULT="+JSON.stringify(r)}));});'
    exit "${PIPESTATUS[0]}" ;;
esac
exec php "$REAL_CABLER" "$@"
EOS
chmod +x "$T/engine.sh"

mk() { # <cola> <id8> <path> [publicar]
  printf '{"schema":"ape.lists.cablear.ticket.v1","ticket":"t-%s","clave":"k%s","estado":"queued","fase":"encolado","entrada":{"tipo":"lista","ref":"%s","path":"%s","bytes":40,"mtime_epoch":1},"salida":{},"publicar":%s,"forzar":0,"device":"","wiring_version":"ape-wire-1","intentos":0,"timestamps":{"encolado":1},"progreso":{},"error":null}\n' \
    "$2" "$2" "$3" "$3" "${4:-0}" > "$1/cola/t-$2.json"
}
run() { # <n> [env extra...]
  local n="$1" rc=0; shift
  env APE_CABLEAR_ROOT="$T/c$n" APE_LISTS_DIR="$T/c$n/lists" \
      APE_CABLER_PHP="$T/engine.sh" APE_ENGINE_CMD=bash \
      APE_CABLEAR_LOG="$T/log$n" ENGINE_COUNT="$T/count$n" \
      REAL_CABLER="$REAL_CABLER" APE_CABLEAR_ENGINE_BASE=https://ape.example.test \
      APE_MIN_FREE_MB="${MINFREE:-1}" APE_CABLEAR_HEARTBEAT_S=1 "$@" bash "$W" || rc=$?
  if [ "$rc" -ne "${EXPECTED_RC:-0}" ]; then no "worker $n rc=$rc esperado ${EXPECTED_RC:-0}"; return 1; fi
}
jgetf() { node -e 'const o=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const p=process.argv[2].split(".");let v=o;for(const k of p){v=(v==null?undefined:v[k])}process.stdout.write(v==null?"":String(v))' "$1" "$2"; }

echo "=========== 1. ticket valido -> done ==========="
setup 1
printf '#EXTM3U\n#EXTINF:-1,uno\nhttp://proveedor/x.m3u8\n' > "$L/canal.m3u8"
SHA0="$(sha256sum "$L/canal.m3u8" | cut -d' ' -f1)"
mk "$T/c1" 1794662000-aaaaaaaa "$L/canal.m3u8" 0
run 1
F="$(ls "$T/c1/hechos"/*.json 2>/dev/null | head -1)"
[ -n "$F" ] && ok "1a el ticket acabo en hechos/" || no "1a no hay ticket en hechos/"
eq "1b estado" "$(jgetf "$F" estado)" "done"
eq "1c nombre de salida" "$(jgetf "$F" salida.nombre)" "canal_CABLEADA.m3u8"
[ -f "$T/c1/staging/t-1794662000-aaaaaaaa/canal_CABLEADA.m3u8" ] && ok "1d staging por ticket" || no "1d no hay salida por ticket"
[ -f "$T/c1/staging/t-1794662000-aaaaaaaa/canal_CABLEADA.m3u8.gz" ] && ok "1e se genero el .gz" || no "1e falta el .gz"
eq "1f la ORIGINAL no cambio" "$(sha256sum "$L/canal.m3u8" | cut -d' ' -f1)" "$SHA0"
eq "1g cola vacia" "$(ls "$T/c1/cola" 2>/dev/null | wc -l)" "0"

echo
echo "=========== 2. DOS WORKERS a la vez, mismo ticket ==========="
setup 2
printf '#EXTM3U\n#EXTINF:-1,dos\nhttp://proveedor/y.m3u8\n' > "$L/canal2.m3u8"
mk "$T/c2" 1794662001-bbbbbbbb "$L/canal2.m3u8" 0
run 2 & P1=$!
run 2 & P2=$!
wait "$P1" || { no "worker concurrente 1 falló"; exit 1; }
wait "$P2" || { no "worker concurrente 2 falló"; exit 1; }
N="$(wc -l < "$T/count2" 2>/dev/null || echo 0)"
eq "2a el motor corrio UNA sola vez con 2 workers" "$N" "1"
eq "2b un solo ticket terminal" "$(find "$T/c2/hechos" "$T/c2/fallidos" -maxdepth 1 -name '*.json' | wc -l)" "1"
eq "2c nada quedo en tomados/" "$(ls "$T/c2/tomados" 2>/dev/null | wc -l)" "0"

echo
echo "=========== 3. traversal en el nombre ==========="
setup 3
mk "$T/c3" 1794662002-cccccccc "$L/../../etc/passwd" 0
run 3
F="$(ls "$T/c3/fallidos"/*.json 2>/dev/null | head -1)"
eq "3a estado" "$(jgetf "$F" estado)" "failed"
has "3b codigo literal" "$(jgetf "$F" error.codigo)" "E_LISTA_TRAVERSAL"
mk "$T/c3" 1794662009-cccccccd "$L/sub/../x.m3u8" 0
run 3
eq "3c tambien se rechaza sub/../" "$(ls "$T/c3/fallidos"/*.json | wc -l)" "2"

echo
echo "=========== 4. lista inexistente ==========="
setup 4
mk "$T/c4" 1794662003-dddddddd "$L/no-existe.m3u8" 0
run 4
F="$(ls "$T/c4/fallidos"/*.json 2>/dev/null | head -1)"
has "4a codigo literal" "$(jgetf "$F" error.codigo)" "E_LISTA_NO_EXISTE"

echo
echo "=========== 5. guardia de disco -> skipped_disk ==========="
setup 5
printf '#EXTM3U\n#EXTINF:-1,cinco\nhttp://proveedor/z.m3u8\n' > "$L/canal5.m3u8"
mk "$T/c5" 1794662004-eeeeeeee "$L/canal5.m3u8" 0
MINFREE=99999999 run 5
F="$(ls "$T/c5/fallidos"/*.json 2>/dev/null | head -1)"
eq "5a estado skipped_disk (NO failed)" "$(jgetf "$F" estado)" "skipped_disk"
has "5b codigo literal" "$(jgetf "$F" error.codigo)" "E_DISCO_INSUFICIENTE"
[ ! -f "$T/c5/staging/canal5_CABLEADA.m3u8" ] && ok "5c no se cableo nada" || no "5c cableo pese al disco"
eq "5d el motor no corrio" "$(wc -l < "$T/count5" 2>/dev/null || echo 0)" "0"

echo
echo "=========== 6. fuente que ya es _CABLEADA ==========="
setup 6
printf '#EXTM3U\n#EXTINF:-1,seis\nhttp://proveedor/w.m3u8\n' > "$L/canal6_CABLEADA.m3u8"
mk "$T/c6" 1794662005-ffffffff "$L/canal6_CABLEADA.m3u8" 0
run 6
F="$(ls "$T/c6/fallidos"/*.json 2>/dev/null | head -1)"
has "6a no se doble-envuelve" "$(jgetf "$F" error.codigo)" "E_LISTA_NOMBRE_INVALIDO"

echo
echo "=========== 7. ticket con nombre no conforme ==========="
setup 7
printf '{"estado":"queued"}\n' > "$T/c7/cola/malo.json"
run 7
eq "7a sigue en cola (no se destruye)" "$([ -f "$T/c7/cola/malo.json" ] && echo si || echo no)" "si"

echo
echo "=========== 8. ticket con JSON ilegible ==========="
setup 8
printf '{esto no es json' > "$T/c8/cola/t-1794662006-99999999.json"
run 8
eq "8a sigue en cola (no se destruye)" "$([ -f "$T/c8/cola/t-1794662006-99999999.json" ] && echo si || echo no)" "si"
has "8b se registro E_TICKET_ILEGIBLE" "$(cat "$T/log8")" "E_TICKET_ILEGIBLE"

echo
echo "=========== 9/10. publicar=1 escribe en /lists ==========="
setup 10
printf '#EXTM3U\n#EXTINF:-1,diez\nhttp://proveedor/v.m3u8\n' > "$L/canal10.m3u8"
SHA1="$(sha256sum "$L/canal10.m3u8" | cut -d' ' -f1)"
mk "$T/c10" 1794662007-77777777 "$L/canal10.m3u8" 1
run 10
[ -f "$L/canal10_CABLEADA.m3u8" ] && ok "10a publicada en /lists" || no "10a no se publico en /lists"
eq "10b la original intacta" "$(sha256sum "$L/canal10.m3u8" | cut -d' ' -f1)" "$SHA1"
F="$(ls "$T/c10/hechos"/*.json 2>/dev/null | head -1)"
eq "10c publicada=true" "$(jgetf "$F" salida.publicada)" "true"

echo
echo "=========== 11. caducidad en cola: 24 h sin ejecutor ==========="
setup 11
printf '#EXTM3U\n#EXTINF:-1,once\nhttp://proveedor/p.m3u8\n' > "$L/canal11.m3u8"
mk "$T/c11" 1794662008-12121212 "$L/canal11.m3u8" 0
touch -d "@$(( $(date +%s) - 90000 ))" "$T/c11/cola/t-1794662008-12121212.json"
run 11
F="$(ls "$T/c11/fallidos"/*.json 2>/dev/null | head -1)"
has "11a caducado con motivo" "$(jgetf "$F" error.codigo)" "E_SIN_EJECUTOR"
eq "11b la cola quedo drenada" "$(ls "$T/c11/cola" 2>/dev/null | wc -l)" "0"
eq "11c no se cableo nada" "$(wc -l < "$T/count11" 2>/dev/null || echo 0)" "0"

echo
echo "=========== 12. reaper: worker muerto en tomados/ ==========="
setup 12
printf '#EXTM3U\n#EXTINF:-1,doce\nhttp://proveedor/q.m3u8\n' > "$L/canal12.m3u8"
# ticket colgado: en tomados, heartbeat viejo, 0 intentos -> vuelve a cola
printf '{"schema":"ape.lists.cablear.ticket.v1","ticket":"t-1794662010-aaaaaaaa","estado":"running","fase":"cableando","entrada":{"tipo":"lista","path":"%s"},"publicar":0,"intentos":0,"timestamps":{"iniciado":%s,"heartbeat":%s},"error":null}\n' \
  "$L/canal12.m3u8" "$(( $(date +%s) - 900 ))" "$(( $(date +%s) - 900 ))" > "$T/c12/tomados/t-1794662010-aaaaaaaa.json"
# ticket colgado con 1 intento ya gastado -> a fallidos
printf '{"schema":"ape.lists.cablear.ticket.v1","ticket":"t-1794662011-bbbbbbbb","estado":"running","fase":"cableando","entrada":{"tipo":"lista","path":"%s"},"publicar":0,"intentos":1,"timestamps":{"iniciado":%s,"heartbeat":%s},"error":null}\n' \
  "$L/canal12.m3u8" "$(( $(date +%s) - 900 ))" "$(( $(date +%s) - 900 ))" > "$T/c12/tomados/t-1794662011-bbbbbbbb.json"
run 12
eq "12a el de 0 intentos volvio a cola... y se proceso" "$(find "$T/c12/hechos" -maxdepth 1 -name '*.json' | wc -l)" "1"
F="$(ls "$T/c12/fallidos"/*.json 2>/dev/null | head -1)"
has "12b el de 1 intento murio con motivo" "$(jgetf "$F" error.codigo)" "E_WORKER_MUERTO"
eq "12c tomados vacio" "$(ls "$T/c12/tomados" 2>/dev/null | wc -l)" "0"

echo
echo "=========== 13. dos tickets misma lista: staging independiente ==========="
setup 13
printf '#EXTM3U\n#EXTINF:-1,trece\nhttps://source.example.test/live/a/b/13.m3u8\n' > "$L/trece.m3u8"
mk "$R" 1794662012-aaaaaaaa "$L/trece.m3u8" 0
mk "$R" 1794662013-bbbbbbbb "$L/trece.m3u8" 0
run 13
eq "13a dos salidas aisladas" "$(find "$R/staging" -name trece_CABLEADA.m3u8 | wc -l)" 2
eq "13b ambos done" "$(find "$R/hechos" -name '*.json' | wc -l)" 2
F="$(find "$R/hechos" -name '*.json' | head -1)"
eq "13c contador envueltos real" "$(jgetf "$F" progreso.envueltos)" 1
eq "13d gzip validado" "$(jgetf "$F" salida.gzip_validado)" true

echo "=========== 14. gzip falla: conservar publicación previa ==========="
setup 14
printf '#EXTM3U\n#EXTINF:-1,catorce\nhttps://source.example.test/14.m3u8\n' > "$L/catorce.m3u8"
printf '#EXTM3U\n#PUBLICACION ANTERIOR\n' > "$L/catorce_CABLEADA.m3u8"
gzip -n -c "$L/catorce_CABLEADA.m3u8" > "$L/catorce_CABLEADA.m3u8.gz"
SHA_OLD="$(sha256sum "$L/catorce_CABLEADA.m3u8" | cut -d' ' -f1)"
SHA_GZ_OLD="$(sha256sum "$L/catorce_CABLEADA.m3u8.gz" | cut -d' ' -f1)"
mkdir "$T/failgzip"
printf '#!/usr/bin/env bash\nexit 74\n' > "$T/failgzip/gzip"; chmod +x "$T/failgzip/gzip"
mk "$R" 1794662014-cccccccc "$L/catorce.m3u8" 1
run 14 PATH="$T/failgzip:$PATH"
F="$(find "$R/fallidos" -name '*.json' | head -1)"
eq "14a fallo gzip no es done" "$(jgetf "$F" error.codigo)" E_GZIP_FALLO
eq "14b plain anterior intacto" "$(sha256sum "$L/catorce_CABLEADA.m3u8" | cut -d' ' -f1)" "$SHA_OLD"
eq "14c gzip anterior intacto" "$(sha256sum "$L/catorce_CABLEADA.m3u8.gz" | cut -d' ' -f1)" "$SHA_GZ_OLD"
eq "14d temporales limpiados" "$(find "$L" -name '*.partial.*' | wc -l)" 0

echo "=========== 15. gzip corrupto y expansión acotada ==========="
setup 15
printf '#EXTM3U\n' > "$L/corrupta.m3u8"
printf '\037\213not-a-gzip' > "$L/corrupta.m3u8.gz"
mk "$R" 1794662015-dddddddd "$L/corrupta.m3u8" 0
run 15
F="$(find "$R/fallidos" -name '*.json' | head -1)"
eq "15a corrupción rechazada" "$(jgetf "$F" error.codigo)" E_GZIP_INVALIDO
printf '#EXTM3U\n' > "$L/grande.m3u8"
{ printf '#EXTM3U\n'; head -c 65536 /dev/zero | tr '\0' x; } | gzip -n -c > "$L/grande.m3u8.gz"
mk "$R" 1794662016-eeeeeeee "$L/grande.m3u8" 0
run 15 APE_CABLEAR_MAX_BYTES=1024
eq "15b límite sobre bytes expandidos" "$(jgetf "$R/fallidos/t-1794662016-eeeeeeee.json" error.codigo)" E_LISTA_DEMASIADO_GRANDE
eq "15c motor no corrió" "$(wc -l < "$T/count15")" 0

echo "=========== 16. dry-run realmente sin escrituras ==========="
setup 16
printf '#EXTM3U\nhttps://source.example.test/16.m3u8\n' > "$L/dry.m3u8"
mk "$R" 1794662017-ffffffff "$L/dry.m3u8" 0
touch -d '@1000' "$R/cola/t-1794662017-ffffffff.json"
DRY_BEFORE="$(find "$R" -printf '%p:%s:%T@\n' | sort | sha256sum | cut -d' ' -f1)"
env APE_CABLEAR_ROOT="$R" APE_LISTS_DIR="$L" APE_CABLER_PHP="$REAL_CABLER" APE_CABLEAR_LOG="$T/log16" bash "$W" --dry-run >/dev/null
eq "16a archivos y mtime intactos" "$(find "$R" -printf '%p:%s:%T@\n' | sort | sha256sum | cut -d' ' -f1)" "$DRY_BEFORE"
eq "16b log no escrito" "$(stat -c%s "$T/log16")" 0

echo "=========== 17. sin recibo o fuente mutable: no publicar ==========="
setup 17
printf '#EXTM3U\n#EXTINF:-1,diecisiete\nhttps://source.example.test/17.m3u8\n' > "$L/recibo.m3u8"
mk "$R" 1794662018-aaaaaaaa "$L/recibo.m3u8" 1
run 17 ENGINE_BEHAVIOR=no_receipt
eq "17a sin recibo no es done" "$(jgetf "$R/fallidos/t-1794662018-aaaaaaaa.json" error.codigo)" E_RECIBO_INVALIDO
eq "17b nada publicado" "$([ -e "$L/recibo_CABLEADA.m3u8" ] && echo si || echo no)" no
mk "$R" 1794662019-bbbbbbbb "$L/recibo.m3u8" 1
run 17 ENGINE_BEHAVIOR=mutate
eq "17c fuente que cambia rechazada" "$(jgetf "$R/fallidos/t-1794662019-bbbbbbbb.json" error.codigo)" E_FUENTE_CAMBIO

echo "=========== 18. heartbeat, m3u y symlink de salida ==========="
setup 18
printf '#EXTM3U\n#EXTINF:-1,dieciocho\nhttps://source.example.test/18.m3u8\n' > "$L/entrada.m3u"
mk "$R" 1794662020-cccccccc "$L/entrada.m3u" 0
run 18 ENGINE_BEHAVIOR=slow
F="$R/hechos/t-1794662020-cccccccc.json"
eq "18a .m3u con motor real" "$(jgetf "$F" estado)" "done"
eq "18b heartbeat no borra progreso" "$(jgetf "$F" progreso.envueltos)" 1
ln -s "$L/entrada.m3u" "$L/entrada_CABLEADA.m3u8"
mk "$R" 1794662021-dddddddd "$L/entrada.m3u" 1
run 18
eq "18c symlink salida rechazado" "$(jgetf "$R/fallidos/t-1794662021-dddddddd.json" error.codigo)" E_SALIDA_ES_SYMLINK

echo "=========== 19. fallo rename plain: rollback gzip ==========="
setup 19
printf '#EXTM3U\n#EXTINF:-1,diecinueve\nhttps://source.example.test/19.m3u8\n' > "$L/rollback.m3u8"
printf '#EXTM3U\n#VERSION ANTERIOR\n' > "$L/rollback_CABLEADA.m3u8"
gzip -n -c "$L/rollback_CABLEADA.m3u8" > "$L/rollback_CABLEADA.m3u8.gz"
ROLL_OLD="$(sha256sum "$L/rollback_CABLEADA.m3u8.gz" | cut -d' ' -f1)"
mkdir "$T/failmv"
cat > "$T/failmv/mv" <<'EOS'
#!/usr/bin/env bash
[ "${@: -1}" != "${FAIL_MV_TARGET:-}" ] || exit 72
exec /usr/bin/mv "$@"
EOS
chmod +x "$T/failmv/mv"
mk "$R" 1794662022-eeeeeeee "$L/rollback.m3u8" 1
run 19 PATH="$T/failmv:$PATH" FAIL_MV_TARGET="$L/rollback_CABLEADA.m3u8"
eq "19a fallo publicación literal" "$(jgetf "$R/fallidos/t-1794662022-eeeeeeee.json" error.codigo)" E_NO_PUDE_PUBLICAR
eq "19b gzip anterior restaurado" "$(sha256sum "$L/rollback_CABLEADA.m3u8.gz" | cut -d' ' -f1)" "$ROLL_OLD"

echo
echo "=========== 20. API real -> worker real, identidad y permisos ==========="
setup 20
CORE="$HERE/../prisma/api/list_cablear_core.php"
enqueue_real() {
  env APE_CABLEAR_ROOT="$R" APE_CABLEAR_LISTS_ROOT="$L" APE_CABLEAR_STORE=fs \
    CORE="$CORE" APE_TEST_SOURCE="$1" php -r '
      require getenv("CORE");$io=ape_cablear_io(array("free_mb"=>999999));
      $r=ape_cablear_enqueue(array("lista"=>getenv("APE_TEST_SOURCE"),"publicar"=>"0","forzar"=>"1","_method"=>"POST"),$io);
      if($r["http"]!==202){fwrite(STDERR,json_encode($r));exit(2);}echo $r["body"]["ticket"];
    '
}
printf '#EXTM3U\n#EXTINF:-1,técnica\nhttps://source.example.test/20.m3u8\n' > "$L/integracion.m3u8"
TK="$(enqueue_real integracion.m3u8)"
UID0="$(stat -c%u "$R/cola/$TK.json")"; MODE0="$(stat -c%a "$R/cola/$TK.json")"
run 20
F="$R/hechos/$TK.json"
eq "20a encolado API llega a done" "$(jgetf "$F" estado)" "done"
eq "20b identidad no borrada" "$(jgetf "$F" entrada.identidad.source_kind)" plain
eq "20c permisos ticket preservados" "$(stat -c%a "$F")" "$MODE0"
eq "20d propietario preservado" "$(stat -c%u "$F")" "$UID0"
eq "20e hash fuente real registrado" "$(jgetf "$F" salida.rawsourcehash)" "$(sha256sum "$L/integracion.m3u8" | cut -d' ' -f1)"
TK="$(enqueue_real integracion.m3u8)"
printf '#CAMBIO posterior al encolado\n' >> "$L/integracion.m3u8"
run 20
eq "20f source cambiado antes de ejecutar rechazado" "$(jgetf "$R/fallidos/$TK.json" error.codigo)" E_FUENTE_CAMBIO
eq "20g segundo motor no corre" "$(wc -l < "$T/count20")" 1

echo "=========== 21. HLS media 2/4/6 no envuelve segmentos ==========="
setup 21
printf '#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-PART-INF:PART-TARGET=0.5\n#EXTINF:2,\nparte0.ts\n#EXTINF:4,\nhttps://source.example.test/parte1.ts\n#EXTINF:6,\nparte2.ts\n#EXT-X-ENDLIST\n' > "$L/hls.m3u8"
HLS_SHA="$(sha256sum "$L/hls.m3u8" | cut -d' ' -f1)"
TK="$(enqueue_real hls.m3u8)"
run 21
F="$R/hechos/$TK.json"
eq "21a HLS termina honestamente" "$(jgetf "$F" estado)" "done"
eq "21b tipo HLS registrado" "$(jgetf "$F" salida.tipo_lista)" hls_media
eq "21c segmentos y LL metadata verbatim" "$(jgetf "$F" salida.sha256)" "$HLS_SHA"
eq "21d no envuelve segmentos" "$(jgetf "$F" progreso.envueltos)" 0

echo "=========== 22. SIGTERM entre renames: rollback por journal ==========="
setup 22
printf '#EXTM3U\n#EXTINF:-1,nueva\nhttps://source.example.test/22.m3u8\n' > "$L/signal.m3u8"
printf '#EXTM3U\n#ANTERIOR\n' > "$L/signal_CABLEADA.m3u8"
gzip -n -c "$L/signal_CABLEADA.m3u8" > "$L/signal_CABLEADA.m3u8.gz"
OLD_P="$(sha256sum "$L/signal_CABLEADA.m3u8" | cut -d' ' -f1)"
OLD_G="$(sha256sum "$L/signal_CABLEADA.m3u8.gz" | cut -d' ' -f1)"
mkdir "$T/signalmv"
cat > "$T/signalmv/mv" <<'EOS'
#!/usr/bin/env bash
/usr/bin/mv "$@" || exit
if [ "${@: -1}" = "$SIGNAL_TARGET" ]; then kill -TERM "$PPID"; fi
EOS
chmod +x "$T/signalmv/mv"
mk "$R" 1794662023-ffffffff "$L/signal.m3u8" 1
EXPECTED_RC=143 run 22 PATH="$T/signalmv:$PATH" SIGNAL_TARGET="$L/signal_CABLEADA.m3u8.gz"
eq "22a plain anterior restaurado" "$(sha256sum "$L/signal_CABLEADA.m3u8" | cut -d' ' -f1)" "$OLD_P"
eq "22b gzip anterior restaurado" "$(sha256sum "$L/signal_CABLEADA.m3u8.gz" | cut -d' ' -f1)" "$OLD_G"
eq "22c ticket interrumpido terminal" "$(jgetf "$R/fallidos/t-1794662023-ffffffff.json" error.codigo)" E_WORKER_INTERRUMPIDO
eq "22d journal limpiado" "$(find "$R/tomados" -name '.publish-*.json' | wc -l)" 0

echo "=========== 23. destinos directorio y sidecar divergente ==========="
setup 23
printf '#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXTINF:2,\nseg.ts\n#EXT-X-ENDLIST\n' > "$L/corta.m3u8"
printf '#EXTM3U\n#OTRA LISTA\n' | gzip -n -c > "$L/corta.m3u8.gz"
SHORT_SHA="$(sha256sum "$L/corta.m3u8" | cut -d' ' -f1)"
mk "$R" 1794662024-aaaaaaaa "$L/corta.m3u8" 1
run 23
eq "23a plain HLS corto autoritativo" "$(jgetf "$R/hechos/t-1794662024-aaaaaaaa.json" entrada.sha256)" "$SHORT_SHA"
eq "23b HLS publicado coincide plain" "$(sha256sum "$L/corta_CABLEADA.m3u8" | cut -d' ' -f1)" "$SHORT_SHA"
rm "$L/corta_CABLEADA.m3u8"
mkdir "$L/corta_CABLEADA.m3u8"
mk "$R" 1794662025-bbbbbbbb "$L/corta.m3u8" 1
run 23
eq "23c directorio no es done" "$(jgetf "$R/fallidos/t-1794662025-bbbbbbbb.json" error.codigo)" E_SALIDA_NO_REGULAR
eq "23d no se depositó temporal en directorio" "$(find "$L/corta_CABLEADA.m3u8" -type f | wc -l)" 0

echo "=========== 24. cierre terminal pendiente y reaper sin persistencia ==========="
setup 24
printf '#EXTM3U\nhttps://source.example.test/24.m3u8\n' > "$L/terminal.m3u8"
mk "$R" 1794662026-cccccccc "$L/terminal.m3u8" 0
node -e 'const fs=require("fs"),f=process.argv[1],j=JSON.parse(fs.readFileSync(f));j.estado="done";fs.writeFileSync(f,JSON.stringify(j));' "$R/cola/t-1794662026-cccccccc.json"
mv "$R/cola/t-1794662026-cccccccc.json" "$R/tomados/"
run 24
eq "24a terminal movido sin reproceso" "$(jgetf "$R/hechos/t-1794662026-cccccccc.json" estado)" "done"
eq "24b motor no ejecutado para terminal" "$(wc -l < "$T/count24")" 0
mk "$R" 1794662027-dddddddd "$L/terminal.m3u8" 0
node -e 'const fs=require("fs"),f=process.argv[1],j=JSON.parse(fs.readFileSync(f));j.estado="running";j.timestamps.heartbeat=1;fs.writeFileSync(f,JSON.stringify(j));' "$R/cola/t-1794662027-dddddddd.json"
mv "$R/cola/t-1794662027-dddddddd.json" "$R/tomados/"
ln -s /dev/null "$R/tomados/t-1794662027-dddddddd.json.lock"
run 24
eq "24c persistencia fallida conserva running" "$(jgetf "$R/tomados/t-1794662027-dddddddd.json" estado)" running
eq "24d no devuelve ticket corruptamente a cola" "$(find "$R/cola" -name '*.json' | wc -l)" 0

echo "=========== 25. base legacy y override device contradictorio ==========="
setup 25
printf '#EXTM3U\nhttps://source.example.test/25.m3u8\n' > "$L/base.m3u8"
mk "$R" 1794662028-eeeeeeee "$L/base.m3u8" 1
run 25 APE_CABLEAR_ENGINE_BASE= APE_PUBLIC_BASE= APE_CABLEAR_BASE_URL=https://legacy.example.test/ape/lists
eq "25a URL publicada base legacy" "$(jgetf "$R/hechos/t-1794662028-eeeeeeee.json" salida.url)" https://legacy.example.test/ape/lists/base_CABLEADA.m3u8
has "25b pulse base legacy coherente" "$(cat "$L/base_CABLEADA.m3u8")" https://legacy.example.test/ape/pulse/
mk "$R" 1794662029-ffffffff "$L/base.m3u8" 0
run 25 APE_CABLEAR_ENGINE_DEVICE=otro
eq "25c override no cambia silenciosamente device" "$(jgetf "$R/fallidos/t-1794662029-ffffffff.json" error.codigo)" E_DEVICE_INCOMPATIBLE

echo "=========== 26. gzip multi-member y recibos incoherentes ==========="
setup 26
printf '#EXTM3U\n' > "$L/multi.m3u8"
printf '#EXTINF:-1,multi\nhttps://source.example.test/26.m3u8\n' > "$T/member2"
{ gzip -n -c "$L/multi.m3u8"; gzip -n -c "$T/member2"; } > "$L/multi.m3u8.gz"
MULTI_SHA="$(cat "$L/multi.m3u8" "$T/member2" | sha256sum | cut -d' ' -f1)"
MULTI_BYTES="$(cat "$L/multi.m3u8" "$T/member2" | wc -c)"
mk "$R" 1794662030-aaaaaaaa "$L/multi.m3u8" 0
run 26
F="$R/hechos/t-1794662030-aaaaaaaa.json"
eq "26a hash de todos los miembros gzip" "$(jgetf "$F" entrada.sha256)" "$MULTI_SHA"
eq "26b bytes de todos los miembros gzip" "$(jgetf "$F" entrada.bytes_descomprimidos)" "$MULTI_BYTES"
mk "$R" 1794662031-bbbbbbbb "$L/multi.m3u8" 0
run 26 APE_CABLEAR_MAX_BYTES=10
eq "26c límite sobre suma multi-member" "$(jgetf "$R/fallidos/t-1794662031-bbbbbbbb.json" error.codigo)" E_LISTA_DEMASIADO_GRANDE
printf '#EXTM3U\nhttps://source.example.test/recibo.m3u8\n' > "$L/bad.m3u8"
i=40
for field in sha256_entrada sha256_salida sha256_metadata_salida bytes_entrada bytes_salida canales tipo_lista; do
  id="17946620$i-cccccccc"; i=$((i+1)); mk "$R" "$id" "$L/bad.m3u8" 1
  run 26 ENGINE_BEHAVIOR=bad_receipt RECEIPT_FIELD="$field"
  eq "26d recibo incoherente $field rechazado" "$(jgetf "$R/fallidos/t-$id.json" error.codigo)" E_RECIBO_INVALIDO
done
eq "26e nada publicado por recibos inválidos" "$([ -e "$L/bad_CABLEADA.m3u8" ] && echo si || echo no)" no

echo "=========== 27. SIGKILL: recuperación al siguiente arranque ==========="
setup 27
printf '#EXTM3U\nhttps://source.example.test/27.m3u8\n' > "$L/crash.m3u8"
printf '#EXTM3U\n#ANTES DEL CRASH\n' > "$L/crash_CABLEADA.m3u8"
gzip -n -c "$L/crash_CABLEADA.m3u8" > "$L/crash_CABLEADA.m3u8.gz"
CRASH_P="$(sha256sum "$L/crash_CABLEADA.m3u8" | cut -d' ' -f1)"
CRASH_G="$(sha256sum "$L/crash_CABLEADA.m3u8.gz" | cut -d' ' -f1)"
mkdir "$T/killmv"
cat > "$T/killmv/mv" <<'EOS'
#!/usr/bin/env bash
/usr/bin/mv "$@" || exit
if [ "${@: -1}" = "$SIGNAL_TARGET" ]; then kill -KILL "$PPID"; fi
EOS
chmod +x "$T/killmv/mv"
mk "$R" 1794662050-dddddddd "$L/crash.m3u8" 1
EXPECTED_RC=137 run 27 PATH="$T/killmv:$PATH" SIGNAL_TARGET="$L/crash_CABLEADA.m3u8.gz"
eq "27a journal sobrevive SIGKILL" "$(find "$R/tomados" -name '.publish-*.json' | wc -l)" 1
sleep 2
run 27 APE_CABLEAR_STALE_S=0 ENGINE_BEHAVIOR=no_receipt
eq "27b plain restaurado tras reinicio" "$(sha256sum "$L/crash_CABLEADA.m3u8" | cut -d' ' -f1)" "$CRASH_P"
eq "27c gzip restaurado tras reinicio" "$(sha256sum "$L/crash_CABLEADA.m3u8.gz" | cut -d' ' -f1)" "$CRASH_G"
eq "27d journal recuperado y eliminado" "$(find "$R/tomados" -name '.publish-*.json' | wc -l)" 0
eq "27e motor reintentado y recibo faltante rechazado" "$(jgetf "$R/fallidos/t-1794662050-dddddddd.json" error.codigo)" E_RECIBO_INVALIDO

echo
echo "=========== RESUMEN ==========="
printf 'SUMMARY pass=%s fail=%s\n' "$PASS" "$FAIL"
[ "$PASS" -ge 90 ] || { echo 'VERDICT: FAIL (suite incompleta)'; exit 1; }
[ "$FAIL" -eq 0 ] && { echo "VERDICT: PASS"; exit 0; }
echo "VERDICT: FAIL"; exit 1
