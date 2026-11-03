#!/usr/bin/env bash
# dry-run.sh — DIFF EXACTO entre repo y VPS. CERO escrituras (solo sha256sum remoto + diff local).
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
c_hdr "DRY-RUN · $VPS_HOST · $(date -u +%FT%TZ) · (no se escribe nada)"

dests="$(manifest_rows | cut -f2 | tr '\n' ' ')"
remote="$(rsh "for f in $dests; do if [ -f \"\$f\" ]; then printf '%s\t%s\t%s\t%s\n' \"\$(sha256sum \"\$f\" | cut -d' ' -f1)\" \"\$(stat -c %s \"\$f\")\" \"\$(stat -c %y \"\$f\" | tr ' ' '_')\" \"\$f\"; else printf 'AUSENTE\t-\t-\t%s\n' \"\$f\"; fi; done")"
printf '%s\n' "$remote" > "$SNAP_DIR/dryrun_remote_hashes_${STAMP}.txt"

printf '\n%-9s %-10s %-9s %s\n' "ESTADO" "TAMANO" "HASH" "DESTINO ← ORIGEN"
printf '%s\n' "--------------------------------------------------------------------------------"
cambios=0
while IFS=$'\t' read -r src dst mode owner note; do
  lf="$REPO_ROOT/$src"
  rh="$(printf '%s\n' "$remote" | awk -F"\t" -v d="$dst" '$4==d{print $1; exit}')"
  rsz="$(printf '%s\n' "$remote" | awk -F"\t" -v d="$dst" '$4==d{print $2" "$3; exit}')"
  if [ ! -f "$lf" ]; then
    printf '%-9s %-10s %-9s %s ← %s  (%s)\n' "AUSENTE" "-" "-" "$dst" "$src" "$note"
    continue
  fi
  lh="$(sha_local "$lf")"; ls="$(wc -c < "$lf")"
  if [ "$rh" = "AUSENTE" ] || [ -z "$rh" ]; then
    st="NUEVO"; cambios=$((cambios+1))
  elif [ "$lh" = "$rh" ]; then
    st="IGUAL"
  else
    st="CAMBIA"; cambios=$((cambios+1))
  fi
  printf '%-9s %-10s %-9s %s ← %s\n' "$st" "$ls" "${lh:0:12}…" "$dst" "$src"
  [ "$st" = "CAMBIA" ] && printf '          remoto: %s B  %s…  (%s)\n' "${rsz%% *}" "${rh:0:12}" "${rsz#* }"
done < <(manifest_rows)

# Ficheros remotos que el manifiesto NO cubre: se listan para que nada se pierda de vista.
printf '\n--- lua presentes en el VPS que el manifiesto NO toca (se quedan como están) ---\n'
rsh "ls -1 /etc/nginx/lua/*.lua 2>/dev/null | sed 's|^|   |'" | sort

c_hdr "RESUMEN DRY-RUN"
printf '   ficheros que CAMBIARIAN: %d\n' "$cambios"
printf '   hashes remotos guardados: %s\n' "snapshots/dryrun_remote_hashes_${STAMP}.txt"
printf '   CAMBIOS REALES EN EL VPS: 0 (dry-run: solo lecturas)\n'
c_ok "   DRY-RUN COMPLETO"
