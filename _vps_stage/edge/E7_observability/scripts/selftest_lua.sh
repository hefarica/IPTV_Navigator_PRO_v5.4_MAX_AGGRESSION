#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# E7 · SELFTEST de ape_obs_metrics.lua (sin escribir NADA en el VPS)
# ═══════════════════════════════════════════════════════════════════════════
# Monta un único chunk Lua (stub_ngx + librería en package.preload + asserts) y
# lo ejecuta por STDIN. No copia ficheros al VPS: `lua -` lee el script de stdin.
#
# El intérprete del VPS es Lua 5.1.5 — la MISMA versión de lenguaje que LuaJIT
# (el que usa lua-nginx-module), así que esto valida sintaxis y semántica 5.1
# de verdad, no una aproximación.
#
# Uso:
#   bash scripts/selftest_lua.sh                 # contra root@178.156.147.234
#   bash scripts/selftest_lua.sh root@otro-host  # otro destino SSH
#   LOCAL=1 bash scripts/selftest_lua.sh         # si hay `lua` en local
# ═══════════════════════════════════════════════════════════════════════════
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-root@178.156.147.234}"

bundle() {
  cat "$HERE/tests/stub_ngx.lua"
  echo 'package.preload["ape_obs_metrics"] = function()'
  cat "$HERE/lua/ape_obs_metrics.lua"
  echo 'end'
  cat "$HERE/tests/selftest_obs.lua"
}

if [ "${LOCAL:-0}" = "1" ]; then
  bundle | lua -
  exit $?
fi

bundle | ssh -o BatchMode=yes -o ConnectTimeout=15 "$TARGET" 'lua -'
exit $?
