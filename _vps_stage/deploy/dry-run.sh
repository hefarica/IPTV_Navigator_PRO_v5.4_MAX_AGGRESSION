#!/usr/bin/env bash
# dry-run.sh — DIFF EXACTO entre repo y VPS. CERO escrituras (solo sha256sum remoto + diff local).
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
c_hdr "DRY-RUN · $VPS_HOST · $(date -u +%FT%TZ) · (no se escribe nada)"

dests="$(manifest_rows | cut -f2 | tr '\n' ' ')"
# FAIL-CLOSED 2026-11-12. Antes NO se comprobaba el estado de rsh: si el VPS no
# respondia, `remote` quedaba vacio, el `-z` de mas abajo marcaba TODOS los
# ficheros como NUEVO y el script imprimia "DRY-RUN COMPLETO" con exit 0.
# Un --audit que finge haber leido no es de solo lectura: es lectura inventada,
# y es el item que el contrato del reconciliador listaba como no computado
# ("que 'audit' distinga VPS inalcanzable de VPS vacio").
if ! remote="$(rsh "for f in $dests; do if [ -f \"\$f\" ]; then printf '%s\t%s\t%s\t%s\n' \"\$(sha256sum \"\$f\" | cut -d' ' -f1)\" \"\$(stat -c %s \"\$f\")\" \"\$(stat -c %y \"\$f\" | tr ' ' '_')\" \"\$f\"; else printf 'AUSENTE\t-\t-\t%s\n' \"\$f\"; fi; done")"; then
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

printf '\n%-9s %-10s %-9s %s\n' "ESTADO" "TAMANO" "HASH" "DESTINO ← ORIGEN"
printf '%s\n' "--------------------------------------------------------------------------------"
cambios=0
desconocidos=0
while IFS=$'\t' read -r src dst mode owner note; do
  lf="$REPO_ROOT/$src"
  rh="$(printf '%s\n' "$remote" | awk -F"\t" -v d="$dst" '$4==d{print $1; exit}')"
  rsz="$(printf '%s\n' "$remote" | awk -F"\t" -v d="$dst" '$4==d{print $2" "$3; exit}')"
  if [ ! -f "$lf" ]; then
    printf '%-9s %-10s %-9s %s ← %s  (%s)\n' "AUSENTE" "-" "-" "$dst" "$src" "$note"
    continue
  fi
  lh="$(sha_local "$lf")"; ls="$(wc -c < "$lf")"
  if [ "$rh" = "AUSENTE" ]; then
    st="NUEVO"; cambios=$((cambios+1))
  elif [ -z "$rh" ]; then
    # El remoto respondio pero no trajo fila para este destino: NO es "nuevo",
    # es "no lo se". Decirlo distinto evita inventar un cambio.
    st="DESCONOCIDO"; desconocidos=$((desconocidos+1))
  elif [ "$lh" = "$rh" ]; then
    st="IGUAL"
  else
    st="CAMBIA"; cambios=$((cambios+1))
  fi
  printf '%-9s %-10s %-9s %s ← %s\n' "$st" "$ls" "${lh:0:12}…" "$dst" "$src"
  [ "$st" = "CAMBIA" ] && printf '          remoto: %s B  %s…  (%s)\n' "${rsz%% *}" "${rh:0:12}" "${rsz#* }"
done < <(manifest_rows)

# Ficheros remotos que el manifiesto NO cubre.
#
# 2026-11-12: antes solo se listaba el NOMBRE. Eso no permite decidir nada: con
# el nombre no se sabe QUE version corre, y el repo tiene hasta 4 versiones
# distintas de floor_lock_filter.lua (2169/9269/9601/17982 B). Ahora se lee
# tamano + sha256 + fecha, igual que para los destinos del manifiesto. Sigue
# siendo solo lectura: sha256sum y stat, cero escrituras.
printf '\n--- lua en /etc/nginx/lua: gestionadas por el manifiesto vs NO gestionadas ---\n'
printf '%-9s %-8s %-14s %s\n' "BYTES" "SHA256" "ESTADO" "FICHERO"
lua_fallo=0
if ! lua_remoto="$(rsh "for f in /etc/nginx/lua/*.lua; do [ -f \"\$f\" ] || continue; printf '%s\t%s\t%s\n' \"\$(stat -c %s \"\$f\")\" \"\$(sha256sum \"\$f\" | cut -d' ' -f1)\" \"\$f\"; done")"; then
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
  # destinos del manifiesto que ya se leyeron arriba.
  printf '%s\n' "$lua_remoto" | sort -k3 | while IFS=$'\t' read -r b h f; do
    case " $dests " in
      *" $f "*) estado="gestionada" ;;
      *)        estado="NO-GESTIONADA" ;;
    esac
    printf '%-9s %-8s %-14s %s\n' "$b" "${h:0:12}…" "$estado" "$f"
  done
  printf '   total: %s lua · no gestionadas: %s\n' \
    "$(printf '%s\n' "$lua_remoto" | wc -l)" \
    "$(printf '%s\n' "$lua_remoto" | while IFS=$'\t' read -r b h f; do case " $dests " in *" $f "*) ;; *) echo x ;; esac; done | wc -l)"
fi

c_hdr "RESUMEN DRY-RUN"
printf '   VPS ALCANZABLE: %d filas del manifiesto leidas\n' "$n_rows"
printf '   ficheros que CAMBIARIAN: %d\n' "$cambios"
if [ "$desconocidos" -gt 0 ]; then
  printf '   destinos con estado DESCONOCIDO: %d\n' "$desconocidos"
fi
printf '   hashes remotos guardados: %s\n' "snapshots/dryrun_remote_hashes_${STAMP}.txt"
printf '   CAMBIOS REALES EN EL VPS: 0 (dry-run: solo lecturas)\n'
if [ "${lua_fallo:-0}" -eq 1 ]; then
  c_bad "   AUDITORIA INCOMPLETA: no se pudo leer el inventario de /etc/nginx/lua — esto NO es exit 0"
  exit 4
fi
if [ "$desconocidos" -gt 0 ]; then
  c_bad "   DRY-RUN INCOMPLETO: $desconocidos destino(s) sin estado — esto NO es exit 0"
  exit 4
fi
c_ok "   DRY-RUN COMPLETO"
