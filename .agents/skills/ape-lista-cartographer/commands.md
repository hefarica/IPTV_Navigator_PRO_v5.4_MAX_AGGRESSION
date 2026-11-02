# commands.md — ape-lista-cartographer

Todos los comandos son de **solo lectura** sobre la lista. `--out` es el único destino de escritura
(junto con `--fixture-out`).

## 1. Cartografía

```bash
# Censo completo (una pasada; estructura + capas pesadas de TODOS los canales)
node .agents/skills/ape-lista-cartographer/scripts/map_list.js <lista> --out <dir>

# Muestra: estructura CENSAL + detalle de N canales (dos pasadas)
node .agents/skills/ape-lista-cartographer/scripts/map_list.js <lista> --out <dir> --sample 250

# Assertion de canal: falla (exit 2) si el conteo no coincide con lo esperado
node .agents/skills/ape-lista-cartographer/scripts/map_list.js <lista> --out <dir> --expect-channels 10573

# Fixture anonimizado de un canal concreto (1-based) para usarlo como caso de prueba
node .agents/skills/ape-lista-cartographer/scripts/map_list.js <lista> --out <dir> \
     --fixture 5739 --fixture-out .agents/skills/ape-lista-cartographer/fixtures/canal_5739_P4_corto.txt

# Sin ffmpeg (la validación de sintaxis queda NO_COMPUTADO con la razón)
node .agents/skills/ape-lista-cartographer/scripts/map_list.js <lista> --out <dir> --no-ffmpeg

# Declarar la versión de VLC (el binario de Windows bloquea la consola al pedirle --version)
node .agents/skills/ape-lista-cartographer/scripts/map_list.js <lista> --out <dir> --vlc-version 3.0.24
```

## 2. Validación de cadenas de filtros

```bash
# Una cadena, desde archivo (una línea)
node .agents/skills/ape-lista-cartographer/scripts/validate_filter_chain.js --chain-file <cadena.txt>

# Una cadena + cada etapa por separado (revela TODOS los defectos, no sólo el primero)
node .agents/skills/ape-lista-cartographer/scripts/validate_filter_chain.js \
     --chain-file <cadena.txt> --per-stage

# Todas las cadenas distintas de una lista (con su número de canales)
node .agents/skills/ape-lista-cartographer/scripts/validate_filter_chain.js --from-list <lista> --json

# Forzar tamaño de la fuente sintética (por defecto 640x360) y nº de frames
node .agents/skills/ape-lista-cartographer/scripts/validate_filter_chain.js \
     --chain-file <cadena.txt> --size 1280x720 --frames 60
```

Salidas: `exit 0` PASS · `exit 1` FAIL · `exit 2` uso · `exit 3` NO_COMPUTADO (sin ffmpeg).

## 3. Contraste independiente (segunda implementación)

```bash
rg -c '^#EXTINF' <lista>                 # canales
rg -c '^#EXTHTTP:' <lista>               # objetos EXTHTTP
rg -c '^#EXT-X-APE-' <lista>             # familia APE
rg -c -i -F 'bt1886' <lista>             # absolutos que suelen estar mal buscados
ffmpeg -hide_banner -h filter=<nombre>   # rangos y enums REALES del binario instalado
```

## 4. Control del propio artefacto

```bash
node -e "JSON.parse(require('fs').readFileSync('<map.json>','utf8'));console.log('JSON OK')"
node --check .agents/skills/ape-lista-cartographer/scripts/map_list.js
node --check .agents/skills/ape-lista-cartographer/scripts/validate_filter_chain.js
```

## 5. Prohibidos

- Escribir sobre la lista (nunca).
- `git` desde la skill.
- Red contra el proveedor para "completar" métricas.
- Ejecutar VLC/Kodi/ExoPlayer para "ver si aplica" (otra fase, otro arnés).
- Invocar `vlc.exe --version` desde el mapper: es una app GUI y bloquea la consola (>120 s medidos).
