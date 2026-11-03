#!/usr/bin/env bash
# [t115] Regresión: `ssh` SIN -n se come el stdin del loop
#          `while read ... done < <(manifest_rows)` y el deploy solo procesa la FILA 1.
#          Este test reproduce el bug y prueba el fix con descriptor 3.
#
# Uso: bash _vps_stage/deploy/tests/loop_stdin_regression.sh
# Sale 0 si el patrón fd3 recorre las 9 filas; 1 si no.
set -u

TMP="$(mktemp -d)" || { echo "FALLA: no se pudo crear tmp"; exit 1; }
trap 'rm -rf "$TMP"' EXIT

MF="$TMP/manifest.tsv"; : > "$MF"
i=0
while [ "$i" -lt 9 ]; do
  i=$((i + 1))
  printf 'src%s\tdst%s\t644\troot:root\tnota\n' "$i" "$i" >> "$MF"
done

manifest_rows() { cat "$MF"; }

# Stub que imita a `ssh host 'cmd'`: LEE STDIN (como ssh real sin -n) y responde.
rsh() { cat >/dev/null; printf 'AUSENTE'; }

n_old=0
while IFS=$'\t' read -r src dst mode owner note; do
  n_old=$((n_old + 1))
  rsh "comando-remoto"
done < <(manifest_rows)

n_new=0
while IFS=$'\t' read -r src dst mode owner note <&3; do
  n_new=$((n_new + 1))
  rsh "comando-remoto"
done 3< <(manifest_rows)

echo "manifiesto=9  iteraciones_patron_antiguo=$n_old  iteraciones_patron_fd3=$n_new"

if [ "$n_old" -ne 1 ]; then
  echo "AVISO: el patrón antiguo iteró $n_old (se esperaba 1 con el stub que consume stdin)"
fi
if [ "$n_new" -ne 9 ]; then
  echo "FALLA: el patrón con fd3 iteró $n_new (se esperaban 9)"
  exit 1
fi
echo "OK: fd3 recorre el manifiesto completo aunque el comando remoto consuma stdin"
exit 0
