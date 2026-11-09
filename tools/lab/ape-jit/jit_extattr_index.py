#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Genera APE_JIT_LIST_EXTATTR.m3u8: el mismo catalogo del JIT pero con
#EXTATTRFROMURL antes de cada canal.

Que hace la directiva (documentada por OTT Navigator):
  Al INICIAR un canal, OTT consulta esa URL y espera una entrada M3U con UNA
  URL multimedia. Asi el perfil y la preparacion del JIT se deciden en el ZAP,
  no al generar el catalogo: el catalogo queda estable y manda el servidor.

Seguridad:
  - NO toca APE_JIT_LIST.m3u8 (el catalogo de produccion). Escribe otro fichero.
  - Conserva cada linea tal cual: solo INSERTA una linea antes de cada URL.
  - Si un canal no tiene tvg-id, no se le pone directiva (no se inventa el id).
  - La URL directa se queda detras: un cliente que ignore la directiva sigue
    teniendo canal.

Uso:  python3 jit_extattr_index.py [--check]
"""
import io
import json
import os
import re
import sys

BASE_DIR = "/opt/ape-jit/current"
SRC = os.path.join(BASE_DIR, "APE_JIT_LIST.m3u8")
DST = os.path.join(BASE_DIR, "APE_JIT_LIST_EXTATTR.m3u8")
META = os.path.join(BASE_DIR, "APE_JIT_LIST_EXTATTR.json")
PUBLIC = "https://iptv-ape.duckdns.org/jit/resolve?channel="

RE_TVGID = re.compile(r'tvg-id="([^"]+)"')


def main():
    check = "--check" in sys.argv
    if not os.path.isfile(SRC):
        print("  ERROR: no existe %s" % SRC)
        return 2

    with io.open(SRC, encoding="utf-8", errors="replace") as fh:
        lines = fh.read().split("\n")

    out = []
    canales = 0
    con_directiva = 0
    sin_id = 0
    ultimo_id = None

    for line in lines:
        if line.startswith("#EXTINF"):
            m = RE_TVGID.search(line)
            ultimo_id = m.group(1) if m else None
            out.append(line)
            continue
        if line.startswith("#") or not line.strip():
            out.append(line)
            continue
        # es una URL de canal
        canales += 1
        if ultimo_id:
            out.append("#EXTATTRFROMURL:" + PUBLIC + ultimo_id)
            con_directiva += 1
            # El FALLBACK tambien va al resolver, NO a master.m3u8: master hace
            # abortar a OTT/TiviMate/ExoPlayer (medido 2026-11-05). El resolver
            # decide master (VLC/Kodi) o media (el resto) leyendo el UA.
            out.append(PUBLIC + ultimo_id)
        else:
            sin_id += 1
            out.append(line)
        ultimo_id = None

    texto = "\n".join(out)
    if check:
        print("  SRC  : %s (%d B)" % (SRC, os.path.getsize(SRC)))
        print("  canales           : %d" % canales)
        print("  con #EXTATTRFROMURL: %d" % con_directiva)
        print("  sin tvg-id (sin directiva): %d" % sin_id)
        print("  tamano resultante : %d B (limite OTT 150 MB = %s)" % (
            len(texto.encode("utf-8")),
            "OK" if len(texto.encode("utf-8")) < 150 * 1024 * 1024 else "EXCEDE"))
        return 0

    with io.open(DST, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(texto)
    meta = {
        "source": SRC,
        "output": DST,
        "channels": canales,
        "with_extattrfromurl": con_directiva,
        "without_tvgid": sin_id,
        "bytes": len(texto.encode("utf-8")),
        "resolver": PUBLIC,
    }
    with io.open(META, "w", encoding="utf-8") as fh:
        json.dump(meta, fh, indent=2)
    print("  escrito %s" % DST)
    print("  canales=%d con_directiva=%d sin_id=%d bytes=%d" % (
        canales, con_directiva, sin_id, meta["bytes"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
