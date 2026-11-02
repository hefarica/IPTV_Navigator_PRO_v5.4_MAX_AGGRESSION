#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# TELEMETRÍA DE FLUJO — SOLO LECTURA
# ----------------------------------------------------------------------------
# Responde una sola pregunta: ¿fluye la información? Por lista y por código.
#
# Entrada: los access.log de nginx que YA existen en el servidor.
# Salida:  agregados por (lista, código HTTP): peticiones, bytes, primera y
#          última marca de tiempo vista.
#
# NO ESCRIBE NADA. No crea ficheros. No reinicia nada. No rota logs.
# Se ejecuta por stdin:  ssh host 'bash -s' < flow_telemetry.sh
#
# Límite: procesa como máximo las últimas $LINEAS líneas por fichero para no
# bloquear el servidor en logs de gigabytes. El límite SE IMPRIME, porque un
# recorte no es el total y no debe leerse como tal.
# ════════════════════════════════════════════════════════════════════════════
set -u
export LC_ALL=C

LINEAS="${APE_FLOW_LINES:-400000}"
LOGS="/var/log/nginx/access.log"

echo "===== TELEMETRÍA DE FLUJO (read-only) ====="
echo "log_lines_budget_per_file: $LINEAS"
echo

if [ ! -r "$LOGS" ] && [ ! -r "${LOGS}.1" ]; then
  echo "SIN_DATOS: no hay access.log legible para el usuario actual"
  echo "nota: si el usuario no es root, el log puede existir y no ser legible."
  echo "esto es 'no medido', no 'sin tráfico'."
  exit 0
fi

# Ficheros a considerar: el actual y rotados comprimidos o no.
FICHEROS=""
for f in "$LOGS" "${LOGS}.1" "${LOGS}.2.gz"; do
  [ -r "$f" ] && FICHEROS="$FICHEROS $f"
done

echo "--- ficheros leídos:"
for f in $FICHEROS; do
  printf '    %s  (%s)\n' "$f" "$(stat -c '%s bytes, mtime %y' "$f" 2>/dev/null | cut -c1-40)"
done
echo

# Extrae las peticiones a /lists/ y agrega por (ruta, estado).
# Formato combined:  IP - - [fecha] "GET /ruta HTTP/1.1" ESTADO BYTES "ref" "ua"
# Se parte por comillas para no depender de la posición de los campos, así
# funciona aunque cambie el log_format mientras conserve la petición citada.
procesar() {
  case "$1" in
    *.gz) gzip -dc -- "$1" 2>/dev/null ;;
    *)    cat -- "$1" 2>/dev/null ;;
  esac | tail -n "$LINEAS"
}

for f in $FICHEROS; do
  procesar "$f"
done | awk -F'"' '
  $2 ~ /\/lists\// {
    req = $2
    # ruta sin query
    n = split(req, p, " ")
    ruta = p[2]
    sub(/\?.*$/, "", ruta)

    split($3, s, " ")
    estado = s[1]
    bytes  = s[2] + 0

    key = ruta SUBSEP estado
    if (!(key in cnt)) {
      orden[++nkeys] = key
      rutas[ruta] = 1
    }
    cnt[key]++
    sum[key] += bytes
  }
  END {
    printf "%-46s %-6s %10s %14s\n", "LISTA", "COD", "PETICIONES", "BYTES"
    printf "%-46s %-6s %10s %14s\n", "-----", "---", "----------", "-----"
    for (i = 1; i <= nkeys; i++) {
      k = orden[i]
      split(k, a, SUBSEP)
      printf "%-46s %-6s %10d %14d\n", a[1], a[2], cnt[k], sum[k]
    }
  }
'

echo
echo "--- resumen por código (todas las listas):"
for f in $FICHEROS; do procesar "$f"; done | awk -F'"' '
  $2 ~ /\/lists\// {
    split($3, s, " ")
    c[s[1]]++
  }
  END {
    for (k in c) printf "    %s  %d\n", k, c[k]
    if (length(c) == 0) print "    (sin peticiones a /lists/ en la ventana leída)"
  }
'
echo
echo "===== FIN TELEMETRÍA ====="
