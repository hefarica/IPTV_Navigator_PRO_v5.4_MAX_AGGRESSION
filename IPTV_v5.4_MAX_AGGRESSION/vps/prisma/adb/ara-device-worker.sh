#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════
# APE — ARA Device Worker  v1.0
#
# Drena la cola /dev/shm/ape_device_jobs/ y ejecuta adb contra el dispositivo.
# Corre como ROOT (systemd): la clave RSA ya autorizada por los dispositivos es
# /root/.android/adbkey. www-data tiene OTRA clave y el "allow debugging" del
# dispositivo no la cubriria — por eso el endpoint PHP solo ENCOLA y este
# worker ejecuta (desacoplamiento de privilegios, idioma de ara-enroll.php).
#
# GENERICO POR DISEÑO — sirve para ONN 4K (arm64-v8a, AndroidTV), Fire TV
# Stick 4K (armeabi-v7a, Fire OS) y cualquier otro Android:
#   · El APK publicado es UNIVERSAL (arm64-v8a / armeabi-v7a / x86 / x86_64).
#   · La deteccion usa solo getprop estandar, nunca marca ni SoC hardcodeado.
#   · La resolucion de transporte es polimorfica (registry, peers WG, serial
#     USB ya listado, o APE_KNOWN_DEVICES).
#
# FAIL-HONEST: sin dispositivo alcanzable escribe failed con el motivo MEDIDO.
# Jamas reporta exito sin verificar el versionCode realmente instalado.
#
# NO TOCA: nginx, iptables, URLs de proveedor, ni la config de WireGuard.
# ══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

JOBS_DIR="/dev/shm/ape_device_jobs"
BEAT_FILE="${JOBS_DIR}/.worker_heartbeat"
LOG="/var/log/ara-device-worker.log"
LOCK="/var/lock/ara-device-worker.lock"
DEVICES_DB="/var/www/html/prisma/db/ape_devices.db"
VERSION_FILE="/var/www/html/ara/version.json"
APK_FILE="/var/www/html/ara/agent.apk"
CAST_INTERVAL="${APE_CAST_INTERVAL:-60}"   # s entre refrescos de estado sin trabajo
ADB_CONNECT_TIMEOUT=6
PKG_DEFAULT="com.ape.crystalagent"
LOG_MAX_BYTES=5242880                       # truncar a 5 MB

# El worker corre como root: si creara el directorio primero quedaria root:root y
# www-data (php-fpm) NO podria encolar. Se cede la propiedad a www-data siempre.
# Los ficheros individuales quedan 0644 (root escribe, www-data lee y viceversa).
mkdir -p "$JOBS_DIR" 2>/dev/null || true
chown www-data:www-data "$JOBS_DIR" 2>/dev/null || true
chmod 0775 "$JOBS_DIR" 2>/dev/null || true

log() {
    local line
    line="$(date -u +%Y-%m-%dT%H:%M:%SZ) $*"
    echo "$line"
    if [ -f "$LOG" ] && [ "$(stat -c %s "$LOG" 2>/dev/null || echo 0)" -gt "$LOG_MAX_BYTES" ]; then
        tail -c 1048576 "$LOG" > "${LOG}.tmp" 2>/dev/null && mv "${LOG}.tmp" "$LOG" 2>/dev/null || true
    fi
    echo "$line" >> "$LOG" 2>/dev/null || true
}

# ── Instancia unica ──────────────────────────────────────────────────────────
if command -v flock >/dev/null 2>&1; then
    exec 9>"$LOCK" 2>/dev/null || exec 9>/tmp/ara-device-worker.lock
    if ! flock -n 9; then
        log "otra instancia en curso (lock $LOCK) — salgo"
        exit 0
    fi
fi

# ── Utilidades JSON (php esta garantizado; jq NO) ────────────────────────────
json_get() { # <fichero> <clave>
    php -r '$f=@file_get_contents($argv[1]); if($f===false){exit(1);} $j=json_decode($f,true); if(!is_array($j)){exit(1);} $v=$j[$argv[2]]??null; if(is_array($v)){echo json_encode($v);} elseif(is_bool($v)){echo $v?"1":"0";} else {echo (string)$v;}'
}

json_write() { # <fichero> <json>
    local tmp="${1}.tmp.$$"
    printf '%s\n' "$2" > "$tmp" 2>/dev/null || return 1
    mv "$tmp" "$1" 2>/dev/null
}

# Emite un JSON con los campos dados (pares clave=valor), escapando con php.
json_build() { # <pares clave=valor...>
    php -r '
        $out=[];
        foreach (array_slice($argv,1) as $kv) {
            $p=strpos($kv,"="); if($p===false){continue;}
            $k=substr($kv,0,$p); $v=substr($kv,$p+1);
            if ($v==="__NULL__") { $out[$k]=null; }
            elseif ($v==="__TRUE__") { $out[$k]=true; }
            elseif ($v==="__FALSE__") { $out[$k]=false; }
            elseif ($v==="__INT__0") { $out[$k]=0; }
            elseif (preg_match("/^-?[0-9]+$/",$v)) { $out[$k]=(int)$v; }
            else { $out[$k]=$v; }
        }
        echo json_encode($out, JSON_UNESCAPED_SLASHES);
    ' "$@"
}

# ── Version objetivo (publicada) ─────────────────────────────────────────────
target_version_code() {
    [ -f "$VERSION_FILE" ] || { echo ""; return; }
    json_get "$VERSION_FILE" versionCode
}
target_version_name() {
    [ -f "$VERSION_FILE" ] || { echo ""; return; }
    json_get "$VERSION_FILE" versionName
}
target_sha() {
    [ -f "$VERSION_FILE" ] || { echo ""; return; }
    json_get "$VERSION_FILE" sha256
}

# ── Resolucion de transporte: GENERICA y polimorfica ─────────────────────────
candidate_transports() {
    {
        # 1) Seriales ya conectados por USB/red segun el servidor adb
        adb devices 2>/dev/null | awk 'NR>1 && $2=="device" {print $1}'

        # 2) Peers WireGuard presentes (allowed ips de wg show)
        if command -v wg >/dev/null 2>&1; then
            wg show 2>/dev/null | awk '
                /allowed ips:/ {
                    for (i=3;i<=NF;i++) {
                        gsub(/,/,"",$i);
                        if ($i ~ /^10\.200\.0\./) { sub(/\/32$/,"",$i); print $i":5555" }
                    }
                }'
        fi

        # 3) IPs del registro (via PHP: el VPS no tiene el CLI sqlite3)
        if [ -f "$DEVICES_DB" ]; then
            php -r '
                if (!is_file($argv[1])) exit;
                try {
                    $d=new SQLite3($argv[1], SQLITE3_OPEN_READONLY);
                    $d->busyTimeout(800);
                    $r=$d->query("SELECT device_ip FROM ape_devices WHERE device_ip<>\"\"");
                    while ($r && ($x=$r->fetchArray(SQLITE3_ASSOC))!==false) {
                        $ip=$x["device_ip"];
                        if (strpos($ip,":")===false) $ip.=":5555";
                        echo $ip,"\n";
                    }
                    $d->close();
                } catch (Throwable $e) {}
            ' "$DEVICES_DB" 2>/dev/null
        fi

        # 4) Override explicito del operador
        printf '%s\n' ${APE_KNOWN_DEVICES:-}
    } | grep -E '.' | awk '!seen[$0]++'
}

# Resuelve un device_id (serial, IP o ip:puerto) a un serial adb vivo.
# Devuelve "serial|transport" o vacio, y deja el motivo en RESOLVE_REASON.
RESOLVE_REASON=""
resolve_device() { # <device_id>
    local want="$1" t serial rc
    RESOLVE_REASON=""

    # a) Si el device_id ya es un serial adb vivo, usarlo tal cual.
    if adb devices 2>/dev/null | awk 'NR>1 && $2=="device"{print $1}' | grep -Fxq "$want"; then
        echo "$want|adb-serial"
        return 0
    fi

    # b) Si parece IP, probar <ip>:5555 antes de recorrer todo.
    case "$want" in
        *[0-9].[0-9]*)
            local cand="$want"
            case "$cand" in *:*) ;; *) cand="${cand}:5555" ;; esac
            if adb connect "$cand" >/dev/null 2>&1; then
                if [ "$(adb -s "$cand" get-state 2>/dev/null)" = "device" ]; then
                    echo "$cand|wg-or-lan"
                    return 0
                fi
            fi
            ;;
    esac

    # c) Recorrer candidatos y emparejar por serial real del dispositivo.
    while IFS= read -r t; do
        [ -z "$t" ] && continue
        if [ "$(adb -s "$t" get-state 2>/dev/null)" != "device" ]; then
            timeout "$ADB_CONNECT_TIMEOUT" adb connect "$t" >/dev/null 2>&1 || true
            sleep 1
        fi
        [ "$(adb -s "$t" get-state 2>/dev/null)" = "device" ] || continue
        serial="$(adb -s "$t" shell getprop ro.serialno 2>/dev/null | tr -d '\r\n')"
        if [ -n "$serial" ] && { [ "$serial" = "$want" ] || [ "$t" = "$want" ]; }; then
            echo "$t|matched"
            return 0
        fi
    done <<< "$(candidate_transports)"

    # d) Ultimo recurso: si hay UN solo dispositivo vivo y no se pudo emparejar,
    #    usarlo (el operador ve el serial en la UI). Se declara en el motivo.
    local live
    live="$(adb devices 2>/dev/null | awk 'NR>1 && $2=="device"{print $1}')"
    if [ -n "$live" ] && [ "$(printf '%s\n' "$live" | wc -l)" -eq 1 ]; then
        RESOLVE_REASON="emparejado por unico dispositivo vivo (serial solicitado: $want)"
        echo "$(printf '%s\n' "$live" | head -1)|single-live"
        return 0
    fi

    RESOLVE_REASON="sin dispositivo alcanzable: ningun transporte respondio (candidatos: $(candidate_transports | tr '\n' ' '))"
    return 1
}

# ── Lectura de estado del dispositivo ────────────────────────────────────────
adb_getprop() { # <serial> <prop>
    adb -s "$1" shell getprop "$2" 2>/dev/null | tr -d '\r\n'
}

pkg_version_code() { # <serial> <pkg>
    adb -s "$1" shell dumpsys package "$2" 2>/dev/null \
        | tr -d '\r' \
        | awk -F= '/versionCode=/ {gsub(/ /,"",$2); print $2; exit}'
}

pkg_version_name() { # <serial> <pkg>
    adb -s "$1" shell dumpsys package "$2" 2>/dev/null \
        | tr -d '\r' \
        | awk -F= '/versionName=/ {print $2; exit}' \
        | awk '{print $1}'
}

pkg_installed() { # <serial> <pkg>  -> imprime "code|name" o vacio
    local serial="$1" pkg="$2" code name
    code="$(pkg_version_code "$serial" "$pkg")"
    if [ -z "$code" ]; then
        return 0
    fi
    name="$(pkg_version_name "$serial" "$pkg")"
    echo "${code}|${name}"
}

# Escribe el estado por dispositivo que consume el endpoint (?action=devices).
cast_state() { # <serial> <device_id> <online:0|1> <transport> <reason>
    local serial="$1" did="$2" online="$3" transport="$4" reason="$5"
    local slug model manuf release sdk abi soc chars platform inst code name instjson

    slug="$(php -r 'echo substr(sha1($argv[1]),0,16);' "$did")"

    if [ "$online" = "1" ]; then
        model="$(adb_getprop "$serial" ro.product.model)"
        manuf="$(adb_getprop "$serial" ro.product.manufacturer)"
        release="$(adb_getprop "$serial" ro.build.version.release)"
        sdk="$(adb_getprop "$serial" ro.build.version.sdk)"
        abi="$(adb_getprop "$serial" ro.product.cpu.abi)"
        soc="$(adb_getprop "$serial" ro.board.platform)"
        chars="$(adb_getprop "$serial" ro.build.characteristics)"

        platform="android"
        case "$manuf" in *[Aa]mazon*|*AMAZON*) platform="fireos" ;; esac
        case "$chars" in *tv*) [ "$platform" = "android" ] && platform="androidtv" ;; esac
        case "$release" in *Fire*) platform="fireos" ;; esac

        local pkgv
        pkgv="$(pkg_installed "$serial" "$PKG_DEFAULT")"
        if [ -n "$pkgv" ]; then
            code="${pkgv%%|*}"
            name="${pkgv##*|}"
            instjson="$(json_build present=__TRUE__ versionCode="$code" versionName="$name")"
        else
            instjson="$(json_build present=__FALSE__ versionCode=__NULL__ versionName=__NULL__)"
        fi

        json_write "${JOBS_DIR}/state-${slug}.json" \
            "$(json_build \
                device_id="$did" slug="$slug" online=__TRUE__ transport="$transport" \
                reason="$reason" serial="$serial" model="$model" manufacturer="$manuf" \
                android_release="$release" sdk="$sdk" abi="$abi" soc="$soc" \
                characteristics="$chars" platform="$platform" \
                installed="$instjson" observed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)")"
    else
        # Offline: se conserva la ultima identidad conocida si existe.
        local prev="${JOBS_DIR}/state-${slug}.json"
        if [ -f "$prev" ]; then
            json_write "$prev" \
                "$(php -r '
                    $j=json_decode(@file_get_contents($argv[1]),true); if(!is_array($j)){$j=[];}
                    $j["online"]=false; $j["reason"]=$argv[2];
                    $j["observed_at"]=gmdate("Y-m-d\TH:i:s\Z");
                    echo json_encode($j, JSON_UNESCAPED_SLASHES);
                ' "$prev" "$reason")"
        else
            json_write "${JOBS_DIR}/state-${slug}.json" \
                "$(json_build device_id="$did" slug="$slug" online=__FALSE__ \
                    reason="$reason" observed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)")"
        fi
    fi
}

# ── Ejecucion de un trabajo ──────────────────────────────────────────────────
step() { # <jobstate_file> <step> <ok:0|1> <detail>  (append atomico al s- file)
    local f="$1" s="$2" ok="$3" d="$4"
    php -r '
        $f=$argv[1]; $j=json_decode(@file_get_contents($f),true);
        if(!is_array($j)){$j=["state"=>"running","steps"=>[],"started_at"=>gmdate("Y-m-d\TH:i:s\Z")];}
        $j["steps"][]=["ts"=>gmdate("Y-m-d\TH:i:s\Z"),"step"=>$argv[2],
                       "ok"=>($argv[3]==="1"),"detail"=>$argv[4]];
        $t=$f.".tmp.".getmypid();
        file_put_contents($t, json_encode($j, JSON_UNESCAPED_SLASHES));
        rename($t,$f);
    ' "$f" "$s" "$ok" "$d"
}

finish_job() { # <job_id> <sku> <state> <ok:0|1> <message> [installed_before] [installed_after]
    local id="$1" sfile="$2" state="$3" ok="$4" msg="$5" before="${6:-}" after="${7:-}"
    local rfile="${JOBS_DIR}/r-${id}.json"
    php -r '
        $s=json_decode(@file_get_contents($argv[1]),true);
        $steps=is_array($s["steps"]??null)?$s["steps"]:[];
        $out=[
          "state"=>$argv[3],
          "ok"=>($argv[4]==="1"),
          "message"=>$argv[5],
          "steps"=>$steps,
          "finished_at"=>gmdate("Y-m-d\TH:i:s\Z"),
        ];
        if ($argv[6]!=="") { $out["installed_before"]=json_decode($argv[6],true); }
        if ($argv[7]!=="") { $out["installed_after"]=json_decode($argv[7],true); }
        $t=$argv[2].".tmp.".getmypid();
        file_put_contents($t, json_encode($out, JSON_UNESCAPED_SLASHES));
        rename($t,$argv[2]);
    ' "$sfile" "$rfile" "$state" "$ok" "$msg" "$before" "$after"
}

process_job() { # <q-file>
    local qfile="$1" id did action pkg sfile serial transport target_code target_name
    local sha_expect sha_real before after code

    id="$(json_get "$qfile" id)"
    did="$(json_get "$qfile" device_id)"
    action="$(json_get "$qfile" action)"
    pkg="$(json_get "$qfile" package)"
    [ -z "$pkg" ] && pkg="$PKG_DEFAULT"
    sfile="${JOBS_DIR}/s-${id}.json"

    log "job $id action=$action device=$did pkg=$pkg"

    # s- inicial: marcamos running
    json_write "$sfile" "$(php -r 'echo json_encode(["state"=>"running","steps"=>[],"started_at"=>gmdate("Y-m-d\TH:i:s\Z")],JSON_UNESCAPED_SLASHES);')"

    if ! resolve_device "$did" > /tmp/.ara_resolve.$$ 2>/dev/null; then
        step "$sfile" "resolve" 0 "${RESOLVE_REASON:-sin dispositivo alcanzable}"
        cast_state "" "$did" 0 "" "${RESOLVE_REASON:-sin dispositivo alcanzable}"
        finish_job "$id" "$sfile" "failed" 0 "${RESOLVE_REASON:-sin dispositivo alcanzable}"
        rm -f /tmp/.ara_resolve.$$
        return 0
    fi
    IFS='|' read -r serial transport < /tmp/.ara_resolve.$$
    rm -f /tmp/.ara_resolve.$$
    step "$sfile" "resolve" 1 "serial=$serial transport=$transport ${RESOLVE_REASON:-}"
    cast_state "$serial" "$did" 1 "$transport" "alcanzable por $transport"

    # Identidad real (generica)
    local model manuf release sdk abi soc
    model="$(adb_getprop "$serial" ro.product.model)"
    manuf="$(adb_getprop "$serial" ro.product.manufacturer)"
    release="$(adb_getprop "$serial" ro.build.version.release)"
    sdk="$(adb_getprop "$serial" ro.build.version.sdk)"
    abi="$(adb_getprop "$serial" ro.product.cpu.abi)"
    soc="$(adb_getprop "$serial" ro.board.platform)"
    step "$sfile" "identity" 1 \
        "model=$model manufacturer=$manuf android=$release sdk=$sdk abi=$abi soc=$soc"

    before="$(pkg_installed "$serial" "$pkg")"

    # ── probe: solo lectura ──────────────────────────────────────────────────
    if [ "$action" = "probe" ]; then
        if [ -n "$before" ]; then
            step "$sfile" "installed" 1 "versionCode=${before%%|*} versionName=${before##*|}"
        else
            step "$sfile" "installed" 1 "no instalado (paquete $pkg ausente)"
        fi
        finish_job "$id" "$sfile" "done" 1 "sonda completada: $model / Android $release / $abi"
        return 0
    fi

    # ── uninstall ────────────────────────────────────────────────────────────
    if [ "$action" = "uninstall" ]; then
        if [ -z "$before" ]; then
            step "$sfile" "uninstall" 1 "no estaba instalado; nada que desinstalar"
            finish_job "$id" "$sfile" "done" 1 "el paquete no estaba instalado"
            return 0
        fi
        local out
        out="$(adb -s "$serial" uninstall "$pkg" 2>&1 | tr -d '\r')"
        after="$(pkg_installed "$serial" "$pkg")"
        if [ -z "$after" ]; then
            step "$sfile" "uninstall" 1 "$out"
            finish_job "$id" "$sfile" "done" 1 "desinstalado correctamente"
        else
            step "$sfile" "uninstall" 0 "$out"
            finish_job "$id" "$sfile" "failed" 0 "uninstall no elimino el paquete: $out"
        fi
        return 0
    fi

    # ── install / update / reinstall: verificar APK ANTES de tocar el device ─
    target_code="$(target_version_code)"
    target_name="$(target_version_name)"
    sha_expect="$(target_sha)"

    if [ ! -f "$APK_FILE" ]; then
        step "$sfile" "verify-apk" 0 "APK ausente en $APK_FILE"
        finish_job "$id" "$sfile" "failed" 0 "APK no encontrado en el servidor ($APK_FILE). No se instalo nada."
        return 0
    fi
    sha_real="$(sha256sum "$APK_FILE" | awk '{print $1}')"
    if [ -n "$sha_expect" ] && [ "$sha_expect" != "$sha_real" ]; then
        step "$sfile" "verify-apk" 0 "sha256 no coincide: esperado=$sha_expect real=$sha_real"
        finish_job "$id" "$sfile" "failed" 0 "APK corrupto o manifiesto desincronizado (sha256). No se instalo nada."
        return 0
    fi
    step "$sfile" "verify-apk" 1 "sha256=$sha_real size=$(stat -c %s "$APK_FILE")"

    local flags="-r"
    case "$action" in
        install)   flags="-r" ;;      # limpio: desinstala primero, luego instala
        update)    flags="-r" ;;
        reinstall) flags="-r -d" ;;
    esac

    if [ "$action" = "install" ] && [ -n "$before" ]; then
        local uout
        uout="$(adb -s "$serial" uninstall "$pkg" 2>&1 | tr -d '\r')"
        step "$sfile" "uninstall-prev" 1 "$uout"
    fi

    local iout irc
    # shellcheck disable=SC2086
    iout="$(adb -s "$serial" install $flags "$APK_FILE" 2>&1 | tr -d '\r')"
    irc=$?
    step "$sfile" "install" "$([ $irc -eq 0 ] && echo 1 || echo 0)" "$iout"

    # Reintento con -t si el APK es test-only (honesto y documentado)
    if [ $irc -ne 0 ] && printf '%s' "$iout" | grep -qi "test.*only\|INSTALL_FAILED_TEST_ONLY"; then
        # shellcheck disable=SC2086
        iout="$(adb -s "$serial" install $flags -t "$APK_FILE" 2>&1 | tr -d '\r')"
        irc=$?
        step "$sfile" "install-retry-testonly" "$([ $irc -eq 0 ] && echo 1 || echo 0)" "$iout"
    fi

    after="$(pkg_installed "$serial" "$pkg")"
    code="${after%%|*}"

    local before_json after_json
    if [ -n "$before" ]; then
        before_json="$(json_build present=__TRUE__ versionCode="${before%%|*}" versionName="${before##*|}")"
    else
        before_json='{"present":false}'
    fi
    if [ -n "$after" ]; then
        after_json="$(json_build present=__TRUE__ versionCode="$code" versionName="${after##*|}")"
    else
        after_json='{"present":false}'
    fi

    cast_state "$serial" "$did" 1 "$transport" "alcanzable por $transport"

    # ── Veredicto: exito SOLO si el versionCode instalado == objetivo ────────
    if [ -z "$after" ]; then
        finish_job "$id" "$sfile" "failed" 0 \
            "adb install no dejo el paquete instalado: $iout" "$before_json" "$after_json"
        return 0
    fi
    if [ -n "$target_code" ] && [ "$code" != "$target_code" ]; then
        finish_job "$id" "$sfile" "failed" 0 \
            "instalado versionCode=$code pero el objetivo es $target_code (verifica el APK publicado)" \
            "$before_json" "$after_json"
        return 0
    fi

    step "$sfile" "verify-installed" 1 \
        "versionCode=$code versionName=${after##*|} (objetivo $target_code / $target_name)"
    finish_job "$id" "$sfile" "done" 1 \
        "$action OK — ${after##*|} (versionCode $code) instalado en $model" \
        "$before_json" "$after_json"
    return 0
}

# ── Refresco periodico: mantener state-*.json al dia aunque no haya trabajos ─
refresh_known_devices() {
    local did t serial
    # Dispositivos del registro
    if [ -f "$DEVICES_DB" ]; then
        while IFS= read -r did; do
            [ -z "$did" ] && continue
            if resolve_device "$did" > /tmp/.ara_cast.$$ 2>/dev/null; then
                IFS='|' read -r serial t < /tmp/.ara_cast.$$
                cast_state "$serial" "$did" 1 "$t" "alcanzable por $t"
            else
                cast_state "" "$did" 0 "" "${RESOLVE_REASON:-sin dispositivo alcanzable}"
            fi
            rm -f /tmp/.ara_cast.$$
        done <<< "$(php -r '
            if (!is_file($argv[1])) exit;
            try {
                $d=new SQLite3($argv[1], SQLITE3_OPEN_READONLY);
                $d->busyTimeout(800);
                $r=$d->query("SELECT device_id FROM ape_devices");
                while ($r && ($x=$r->fetchArray(SQLITE3_ASSOC))!==false) echo $x["device_id"],"\n";
                $d->close();
            } catch (Throwable $e) {}
        ' "$DEVICES_DB" 2>/dev/null)"
    fi
}

# ── Loop principal ───────────────────────────────────────────────────────────
log "worker arrancado (pid $$) dir=$JOBS_DIR apk=$APK_FILE"
adb start-server >/dev/null 2>&1 || true

LAST_CAST=0
while true; do
    touch "$BEAT_FILE" 2>/dev/null || true

    processed=0
    # Orden FIFO por mtime
    while IFS= read -r q; do
        [ -z "$q" ] && continue
        [ -f "$q" ] || continue
        id="$(json_get "$q" id)"
        [ -z "$id" ] && { rm -f "$q"; continue; }
        [ -f "${JOBS_DIR}/r-${id}.json" ] && { rm -f "$q"; continue; }
        process_job "$q" || log "ERROR procesando $q"
        processed=$((processed+1))
        touch "$BEAT_FILE" 2>/dev/null || true
    done <<< "$(ls -1tr "${JOBS_DIR}"/q-*.json 2>/dev/null)"

    now=$(date +%s)
    if [ $((now - LAST_CAST)) -ge "$CAST_INTERVAL" ]; then
        refresh_known_devices || true
        LAST_CAST=$now
        touch "$BEAT_FILE" 2>/dev/null || true
    fi

    sleep 2
done
