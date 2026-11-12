#!/usr/bin/env bash
# dry-run.sh — DIFF EXACTO entre repo y VPS. CERO escrituras (solo sha256sum remoto + diff local).
#
# Modos (§12):
#   (sin flag)  = --audit : solo lectura, reporta el estado. Falla si no pudo leer.
#   --plan                : lo mismo MAS el manifiesto de riesgos y el comando de
#                           rollback. Sigue siendo solo lectura: el plan no aplica nada.
#
# 2026-11-12: el contrato decia "el diff ES el plan". El diff solo dice QUE
# cambia; un plan util tiene que decir ademas QUE RIESGO tiene cada cambio y
# COMO se revierte. Eso es lo que anade --plan.
MODO_PLAN=0
for a in "$@"; do [ "$a" = "--plan" ] && MODO_PLAN=1; done

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
if [ "$MODO_PLAN" -eq 1 ]; then
  c_hdr "PLAN · $VPS_HOST · $(date -u +%FT%TZ) · (no se escribe nada)"
else
  c_hdr "DRY-RUN · $VPS_HOST · $(date -u +%FT%TZ) · (no se escribe nada)"
fi

dests="$(manifest_rows | cut -f2 | tr '\n' ' ')"
# FAIL-CLOSED 2026-11-12. Antes NO se comprobaba el estado de rsh: si el VPS no
# respondia, `remote` quedaba vacio, el `-z` de mas abajo marcaba TODOS los
# ficheros como NUEVO y el script imprimia "DRY-RUN COMPLETO" con exit 0.
# Un --audit que finge haber leido no es de solo lectura: es lectura inventada,
# y es el item que el contrato del reconciliador listaba como no computado
# ("que 'audit' distinga VPS inalcanzable de VPS vacio").
if ! remote="$(rsh "for f in $dests; do if [ -f \"\$f\" ]; then printf '%s\t%s\t%s\t%s\t%s\n' \"\$(sha256sum \"\$f\" | cut -d' ' -f1)\" \"\$(stat -c %s \"\$f\")\" \"\$(stat -c %a \"\$f\")\" \"\$(stat -c %U:%G \"\$f\")\" \"\$f\"; else printf 'AUSENTE\t-\t-\t-\t%s\n' \"\$f\"; fi; done")"; then
  c_bad "   VPS INALCANZABLE: el diff no se puede calcular y no se imprime ninguno."
  printf '   exit 3 — no se confunde "no pude leer" con "todo es nuevo"\n'
  exit 3
fi
n_rows="$(manifest_rows | wc -l)"
if [ "${n_rows:-0}" -lt 1 ]; then
  c_bad "   manifiesto vacio o ilegible: no hay nada que comparar"
  exit 3
fi
if [ -z "$remote" ]; then
  c_bad "   el VPS respondio pero no devolvio ninguna fila para $n_rows destinos: lectura incompleta"
  exit 3
fi
printf '%s\n' "$remote" > "$SNAP_DIR/dryrun_remote_hashes_${STAMP}.txt"

printf '\n%-9s %-10s %-9s %-16s %s\n' "ESTADO" "TAMANO" "HASH" "MODO:DUEÑO" "DESTINO ← ORIGEN"
printf '%s\n' "----------------------------------------------------------------------------------------------------"
cambios=0
desconocidos=0
permisos=0
plan_rows=""
while IFS=$'\t' read -r src dst mode owner note; do
  lf="$REPO_ROOT/$src"
  # el remoto ahora trae sha, bytes, modo, dueno, ruta -> la ruta es el campo 5
  rh="$(printf '%s\n' "$remote" | awk -F"\t" -v d="$dst" '$5==d{print $1; exit}')"
  rm_mode="$(printf '%s\n' "$remote" | awk -F"\t" -v d="$dst" '$5==d{print $3; exit}')"
  rm_own="$(printf '%s\n' "$remote" | awk -F"\t" -v d="$dst" '$5==d{print $4; exit}')"
  rsz="$(printf '%s\n' "$remote" | awk -F"\t" -v d="$dst" '$5==d{print $2; exit}')"
  if [ ! -f "$lf" ]; then
    printf '%-9s %-10s %-9s %-16s %s ← %s  (%s)\n' "AUSENTE" "-" "-" "-" "$dst" "$src" "$note"
    continue
  fi
  lh="$(sha_local "$lf")"; ls="$(wc -c < "$lf")"
  # 2026-11-12: se compara tambien MODO y DUEÑO. Antes solo el sha256, asi que un
  # chmod o un chown en produccion pasaba como IGUAL y el audit no lo veia.
  perm="$rm_mode:$rm_own"
  perm_ok=1
  if [ -n "$rm_mode" ] && { [ "$rm_mode" != "$mode" ] || [ "$rm_own" != "$owner" ]; }; then
    perm_ok=0
  fi
  if [ "$rh" = "AUSENTE" ]; then
    st="NUEVO"; cambios=$((cambios+1))
  elif [ -z "$rh" ]; then
    # El remoto respondio pero no trajo fila para este destino: NO es "nuevo",
    # es "no lo se". Decirlo distinto evita inventar un cambio.
    st="DESCONOCIDO"; desconocidos=$((desconocidos+1))
  elif [ "$lh" = "$rh" ]; then
    if [ "$perm_ok" -eq 0 ]; then
      st="PERMISO"; permisos=$((permisos+1))
    else
      st="IGUAL"
    fi
  else
    st="CAMBIA"; cambios=$((cambios+1))
  fi
  printf '%-9s %-10s %-9s %-16s %s ← %s\n' "$st" "$ls" "${lh:0:12}…" "$perm" "$dst" "$src"
  [ "$st" != "IGUAL" ] && plan_rows="$plan_rows$st|$dst
"
  [ "$st" = "CAMBIA" ] && printf '          remoto: %s B  %s…  (manifiesto pide %s:%s)\n' "$rsz" "${rh:0:12}" "$mode" "$owner"
  [ "$st" = "PERMISO" ] && printf '          contenido identico; el manifiesto pide %s:%s y el VPS tiene %s:%s\n' "$mode" "$owner" "$rm_mode" "$rm_own"
done < <(manifest_rows)

# Ficheros remotos que el manifiesto NO cubre.
#
# 2026-11-12: antes solo se listaba el NOMBRE. Eso no permite decidir nada: con
# el nombre no se sabe QUE version corre, y el repo tiene hasta 4 versiones
# distintas de floor_lock_filter.lua (2169/9269/9601/17982 B). Ahora se lee
# tamano + sha256 + fecha, igual que para los destinos del manifiesto. Sigue
# siendo solo lectura: sha256sum y stat, cero escrituras.
printf '\n--- lua en /etc/nginx/lua: gestionadas por el manifiesto vs NO gestionadas ---\n'
printf '%-9s %-8s %-16s %-14s %s\n' "BYTES" "SHA256" "MODO:DUEÑO" "ESTADO" "FICHERO"
lua_fallo=0
if ! lua_remoto="$(rsh "for f in /etc/nginx/lua/*.lua; do [ -f \"\$f\" ] || continue; printf '%s\t%s\t%s\t%s\t%s\n' \"\$(stat -c %s \"\$f\")\" \"\$(sha256sum \"\$f\" | cut -d' ' -f1)\" \"\$(stat -c %a \"\$f\")\" \"\$(stat -c %U:%G \"\$f\")\" \"\$f\"; done")"; then
  printf '   (no se pudo leer: el VPS no respondio a esta lectura)\n'
  lua_fallo=1
elif [ -z "$lua_remoto" ]; then
  printf '   (el VPS no devolvio ninguna lua: no hay /etc/nginx/lua o no se pudo listar)\n'
  lua_fallo=1
else
  # 2026-11-12: antes esta seccion imprimia TODAS las lua del directorio bajo el
  # titulo "las que el manifiesto NO toca", y eran 18 cuando las no gestionadas
  # son 8. Un listado que dice "no gestionadas" y mete las gestionadas dentro es
  # una etiqueta falsa; ahora cada fila dice cual es cual, contrastando con los
  # destinos del manifiesto que ya se leyeron arriba. Y trae modo:dueno medido,
  # que es lo que permite fijar la fila del manifiesto con el valor real en vez
  # de heredarlo de una hermana.
  printf '%s\n' "$lua_remoto" | sort -k5 | while IFS=$'\t' read -r b h m o f; do
    case " $dests " in
      *" $f "*) estado="gestionada" ;;
      *)        estado="NO-GESTIONADA" ;;
    esac
    printf '%-9s %-8s %-16s %-14s %s\n' "$b" "${h:0:12}…" "$m:$o" "$estado" "$f"
  done
  printf '   total: %s lua · no gestionadas: %s\n' \
    "$(printf '%s\n' "$lua_remoto" | wc -l)" \
    "$(printf '%s\n' "$lua_remoto" | while IFS=$'\t' read -r b h m o f; do case " $dests " in *" $f "*) ;; *) echo x ;; esac; done | wc -l)"
fi

c_hdr "RESUMEN DRY-RUN"
printf '   VPS ALCANZABLE: %d filas del manifiesto leidas\n' "$n_rows"
printf '   ficheros que CAMBIARIAN: %d\n' "$cambios"
if [ "$desconocidos" -gt 0 ]; then
  printf '   destinos con estado DESCONOCIDO: %d\n' "$desconocidos"
fi
printf '   hashes remotos guardados: %s\n' "snapshots/dryrun_remote_hashes_${STAMP}.txt"
printf '   CAMBIOS REALES EN EL VPS: 0 (dry-run: solo lecturas)\n'
if [ "${permisos:-0}" -gt 0 ]; then
  printf '   AVISO · modo/dueño distinto del declarado: %d destino(s)\n' "$permisos"
  # 2026-11-12: esto NO hace fallar el audit, y la razon importa.
  #
  # medido en la corrida 43181944726: 15 destinos con contenido identico y
  # modo/dueno distinto. La causa no es el script: es que deploy.sh:80 aplica
  # `install -m -o -g` SOLO cuando instala, y cuando el hash coincide informa
  # "Sin cambios de ficheros" y no vuelve a instalar. O sea que el dueno se
  # aplico la primera vez y nada lo corrige despues: la idempotencia es por
  # contenido y la columna de dueno del manifiesto se queda obsoleta en silencio.
  #
  # Con modo 644 el contenido es legible por los workers igual, asi que no hay
  # impacto funcional medido. Poner exit 4 aqui convertiria un desfase de
  # metadata previo en un pipeline rojo permanente, que no informa: bloquea.
  # Corregir el desfase exige decidir si manda el manifiesto (y el deploy tiene
  # que reaplicar -o/-g) o si manda produccion. Eso es del operador.
fi
if [ "${lua_fallo:-0}" -eq 1 ]; then
  c_bad "   AUDITORIA INCOMPLETA: no se pudo leer el inventario de /etc/nginx/lua — esto NO es exit 0"
  exit 4
fi
if [ "$desconocidos" -gt 0 ]; then
  c_bad "   DRY-RUN INCOMPLETO: $desconocidos destino(s) sin estado — esto NO es exit 0"
  exit 4
fi
c_ok "   DRY-RUN COMPLETO"

# ─────────────────────────────────────────────────────────────────────────────
# MODO --plan (§12): el diff dice QUE cambia; el plan dice QUE RIESGO tiene y
# COMO se revierte. Sigue siendo solo lectura: no aplica nada.
# ─────────────────────────────────────────────────────────────────────────────
if [ "$MODO_PLAN" -eq 1 ]; then
  c_hdr "PLAN · MANIFIESTO DE CAMBIOS"
  if [ -z "$plan_rows" ]; then
    printf '   (nada que cambiar: los 33 destinos ya coinciden con el repo)\n'
  else
    printf '%s' "$plan_rows" | while IFS='|' read -r st dst; do
      [ -z "$dst" ] && continue
      case "$dst" in
        /opt/ape-jit/*)          riesgo="ALTO  · necesita systemctl restart ape-jit (deploy.sh NO lo hace; lo hace el job 4b)" ;;
        /etc/nginx/lua/*)        riesgo="MEDIO · necesita nginx -t + reload" ;;
        /etc/nginx/*)            riesgo="MEDIO · necesita nginx -t + reload" ;;
        /usr/local/bin/*)        riesgo="MEDIO · lo invoca el timer del canary; tomara el fichero en el proximo ciclo" ;;
        /etc/systemd/system/*)   riesgo="MEDIO · requiere daemon-reload para surtir efecto" ;;
        /var/www/*)              riesgo="BAJO  · php-fpm recarga solo (opcache lo puede retener)" ;;
        /etc/ara/*|/etc/ara-x/*) riesgo="BAJO  · datos de configuracion, sin reinicio" ;;
        *)                       riesgo="BAJO  · sin servicio asociado conocido" ;;
      esac
      printf '   %-9s %-46s %s\n' "$st" "$dst" "$riesgo"
    done
  fi

  c_hdr "PLAN · RIESGO GLOBAL"
  if [ "${permisos:-0}" -gt 0 ]; then
    printf '   · %d destino(s) con modo/dueno distinto del declarado (contenido identico)\n' "$permisos"
    printf '     aplicar los corrige; no aplicarlos los deja como estan. Sin impacto funcional medido.\n'
  fi
  if [ "${lua_fallo:-0}" -eq 1 ]; then
    printf '   · el inventario de /etc/nginx/lua NO se pudo leer: el plan esta incompleto\n'
  fi
  printf '   · el instalador es atomico: valida en staging, backup antes de instalar y\n'
  printf '     restaura si falla cualquier paso posterior al backup\n'

  c_hdr "PLAN · ROLLBACK"
  printf '   el plan NO crea backup (no aplica nada). Al aplicar se crea un stamp propio:\n\n'
  printf '     bash _vps_stage/deploy/rollback.sh <stamp> --yes\n\n'
  printf '   el stamp se imprime al inicio del deploy y queda en deploy-stamp.txt.\n'
  printf '   Si el deploy falla ANTES del backup, el rollback se niega a actuar a ciegas\n'
  printf '   y no modifica nada: eso es correcto, no un fallo.\n'
  c_ok "   PLAN COMPLETO (sin escribir nada)"
fi
