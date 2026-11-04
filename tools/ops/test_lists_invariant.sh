#!/bin/sh
# Fixtures del invariante: un caso por estado de la máquina.
# Uso: bash tools/ops/test_lists_invariant.sh
set -u

DIR=${1:-scratch/invtest}
rm -rf "$DIR" && mkdir -p "$DIR"

# genera N bytes de relleno sin depender de seq
relleno() {
    n=$1
    i=0
    while [ "$i" -lt "$n" ]; do printf 'x'; i=$((i + 1)); done
}

# A · placeholder CORRECTO: m3u8 de 8 B, gz válido y MÁS NUEVO  -> OK_PLACEHOLDER
printf '#EXTM3U\n' > "$DIR/A.m3u8"
head -c 40000 /dev/urandom | gzip -1 > "$DIR/A.m3u8.gz"
touch -d '2030-01-01' "$DIR/A.m3u8.gz"

# B · placeholder SIN gz                                        -> ROTO placeholder_sin_gz
printf '#EXTM3U\n' > "$DIR/B.m3u8"

# C · placeholder con gz MÁS VIEJO (gzip_static lo ignoraría)    -> ROTO gz_mas_antiguo
printf '#EXTM3U\n' > "$DIR/C.m3u8"
head -c 40000 /dev/urandom | gzip -1 > "$DIR/C.m3u8.gz"
touch -d '2020-01-01' "$DIR/C.m3u8.gz"

# D · lista NORMAL sana (7297 bytes)                            -> normal
printf '#EXTM3U\n' > "$DIR/D.m3u8"
relleno 7290 >> "$DIR/D.m3u8"

# E · placeholder con gz que no es gzip (magic incorrecto)       -> ROTO gz_sin_magic
printf '#EXTM3U\n' > "$DIR/E.m3u8"
head -c 40000 /dev/urandom > "$DIR/E.m3u8.gz"
touch -d '2030-01-01' "$DIR/E.m3u8.gz"

# F · placeholder corrupto (8 bytes pero no la cabecera)         -> ROTO placeholder_corrupto
printf 'XXXXXXX\n' > "$DIR/F.m3u8"
head -c 40000 /dev/urandom | gzip -1 > "$DIR/F.m3u8.gz"

echo "=== fixtures en $DIR ==="
ls -la "$DIR"
echo
echo "=== salida del invariante ==="
sh tools/ops/check_lists_invariant.sh "$DIR"
echo "exit=$?"
