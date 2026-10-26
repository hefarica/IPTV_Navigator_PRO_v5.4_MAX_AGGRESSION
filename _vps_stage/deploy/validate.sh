#!/usr/bin/env bash
# validate.sh — VALIDACIÓN SINTÁCTICA sin escribir nada en el VPS.
#   · .lua  -> luac -p sobre /dev/stdin (el fichero viaja por stdin, no se sube)
#   · .php  -> php -l  sobre /dev/stdin
#   · .js   -> node -c local
#   · .conf -> se valida de verdad con `nginx -t` en deploy.sh (nginx no acepta stdin)
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
c_hdr "VALIDACIÓN · $(date -u +%FT%TZ)"
bad=0; okn=0; skip=0
while IFS=$'\t' read -r src dst mode owner note; do
  lf="$REPO_ROOT/$src"
  [ -f "$lf" ] || { printf '   SKIP     %s (no existe en local)\n' "$src"; skip=$((skip+1)); continue; }
  case "$src" in
    *.lua)
      if rsh 'luac -p /dev/stdin' < "$lf" 2>/dev/null; then printf '   OK-luac  %s\n' "$src"; okn=$((okn+1));
      else printf '   FALLA    %s (luac -p)\n' "$src"; bad=$((bad+1)); fi ;;
    *.php)
      if rsh 'php -l /dev/stdin' < "$lf" 2>/dev/null | grep -q 'No syntax errors'; then printf '   OK-php   %s\n' "$src"; okn=$((okn+1));
      else printf '   FALLA    %s (php -l)\n' "$src"; bad=$((bad+1)); fi ;;
    *.js)
      if node -c "$lf" 2>/dev/null; then printf '   OK-node  %s\n' "$src"; okn=$((okn+1));
      else printf '   FALLA    %s (node -c)\n' "$src"; bad=$((bad+1)); fi ;;
    *.conf)
      printf '   DIFERIDO %s (nginx -t se ejecuta en deploy.sh sobre la config montada)\n' "$src"; skip=$((skip+1)) ;;
    *)
      printf '   SKIP     %s (tipo no validable)\n' "$src"; skip=$((skip+1)) ;;
  esac
done < <(manifest_rows)
c_hdr "RESUMEN VALIDACIÓN"
printf '   OK=%d  FALLOS=%d  DIFERIDOS/SKIP=%d\n' "$okn" "$bad" "$skip"
printf '   ESCRITURAS EN EL VPS: 0\n'
[ "$bad" -eq 0 ] && c_ok "   VALIDACIÓN OK" || c_bad "   VALIDACIÓN CON FALLOS"
exit "$bad"
