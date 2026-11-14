#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# Test del consumidor de la cola (t62). SIN red, SIN php, SIN tocar el VPS.
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
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
W="$HERE/ape-cablear-queue-worker.sh"
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
# motor de mentira: escribe una m3u8 minima valida en la salida y cuenta llamadas
cat > "$T/engine.sh" <<'EOS'
#!/usr/bin/env bash
[ -n "${ENGINE_COUNT:-}" ] && echo run >> "$ENGINE_COUNT"
in="$1"; out="$2"
[ -s "$in" ] || exit 1
printf '#EXTM3U\n#EXTINF:-1,canal\nhttp://127.0.0.1:8088/pulse/1.m3u8\n' > "$out"
EOS
chmod +x "$T/engine.sh"

mk() { # <cola> <id8> <path> [publicar]
  printf '{"schema":"ape.lists.cablear.ticket.v1","ticket":"t-%s","clave":"k%s","estado":"queued","fase":"encolado","entrada":{"tipo":"lista","ref":"%s","path":"%s","bytes":40,"mtime_epoch":1},"salida":{},"publicar":%s,"forzar":0,"device":"","wiring_version":"ape-wire-1","intentos":0,"timestamps":{"encolado":1},"progreso":{},"error":null}\n' \
    "$2" "$2" "$3" "$3" "${4:-0}" > "$1/cola/t-$2.json"
}
run() { # <n> [env extra...]
  local n="$1"; shift
  env APE_CABLEAR_ROOT="$T/c$n" APE_LISTS_DIR="$T/c$n/lists" \
      APE_CABLER_PHP="$T/engine.sh" APE_ENGINE_CMD=bash \
      APE_CABLEAR_LOG="$T/log$n" ENGINE_COUNT="$T/count$n" \
      APE_MIN_FREE_MB="${MINFREE:-1}" APE_HEARTBEAT_S=5 "$@" bash "$W"
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
[ -f "$T/c1/staging/canal_CABLEADA.m3u8" ] && ok "1d publicar=0 escribe en staging/" || no "1d no hay salida en staging/"
[ -f "$T/c1/staging/canal_CABLEADA.m3u8.gz" ] && ok "1e se genero el .gz" || no "1e falta el .gz"
eq "1f la ORIGINAL no cambio" "$(sha256sum "$L/canal.m3u8" | cut -d' ' -f1)" "$SHA0"
eq "1g cola vacia" "$(ls "$T/c1/cola" 2>/dev/null | wc -l)" "0"

echo
echo "=========== 2. DOS WORKERS a la vez, mismo ticket ==========="
setup 2
printf '#EXTM3U\n#EXTINF:-1,dos\nhttp://proveedor/y.m3u8\n' > "$L/canal2.m3u8"
mk "$T/c2" 1794662001-bbbbbbbb "$L/canal2.m3u8" 0
run 2 & P1=$!
run 2 & P2=$!
wait $P1 $P2 2>/dev/null
N="$(wc -l < "$T/count2" 2>/dev/null || echo 0)"
eq "2a el motor corrio UNA sola vez con 2 workers" "$N" "1"
eq "2b un solo ticket terminal" "$(ls "$T/c2/hechos" "$T/c2/fallidos" 2>/dev/null | grep -c json)" "1"
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
eq "12a el de 0 intentos volvio a cola... y se proceso" "$(ls "$T/c12/hechos" 2>/dev/null | grep -c json)" "1"
F="$(ls "$T/c12/fallidos"/*.json 2>/dev/null | head -1)"
has "12b el de 1 intento murio con motivo" "$(jgetf "$F" error.codigo)" "E_WORKER_MUERTO"
eq "12c tomados vacio" "$(ls "$T/c12/tomados" 2>/dev/null | wc -l)" "0"

echo
echo "=========== RESUMEN ==========="
printf 'SUMMARY pass=%s fail=%s\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] && { echo "VERDICT: PASS"; exit 0; }
echo "VERDICT: FAIL"; exit 1
