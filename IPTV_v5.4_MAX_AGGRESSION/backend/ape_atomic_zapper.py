#!/usr/bin/env python3
# =============================================================================
# APE ATOMIC ZAPPER  ·  v1.0
# Motor de zapping atómico para listas APE TYPED ARRAYS ULTIMATE
#
# PRINCIPIO FUNDAMENTAL:
#   - El archivo M3U8 original NUNCA se toca, mueve ni altera.
#   - Cada canal es un "átomo" de 745 líneas exactas.
#   - El zapping consiste en calcular el offset de byte del átomo destino
#     y servir SOLO ese bloque, precedido de la cabecera global.
#   - Zero-copy: usa seek() directo al byte exacto, sin leer el resto.
# =============================================================================

import os
import re
import mmap
import struct
import sys
import json
import time
from pathlib import Path
from typing import Optional, List, Tuple

# ---------------------------------------------------------------------------
# CONSTANTES ESTRUCTURALES (medidas empíricamente del archivo)
# ---------------------------------------------------------------------------
HEADER_LINES   = 47          # Líneas de cabecera global (antes del primer #EXTINF)
LINES_PER_ATOM = 746         # Líneas por átomo de canal (#EXTINF ... URL \n vacía)
# Nota: el átomo incluye la línea vacía de separación final

def dprint(*args, **kwargs):
    kwargs['file'] = sys.stderr
    print(*args, **kwargs)

# ---------------------------------------------------------------------------
# CLASE PRINCIPAL: APEAtomicZapper
# ---------------------------------------------------------------------------
class APEAtomicZapper:
    INDEX_MAGIC   = b'APEIDX\x01\x00'
    INDEX_VERSION = 1

    def __init__(self, m3u8_path: str):
        self.path      = Path(m3u8_path)
        self.idx_path  = self.path.with_suffix('.apeindex')
        self._fh       = None
        self._mm       = None
        self._header_end_byte = 0
        self._header_bytes    = b''
        self._channel_offsets: List[int] = []
        self._channel_meta:   List[dict] = []
        self._total_channels  = 0

        self._open_file()
        self._load_or_build_index()

    def _open_file(self):
        self._fh = open(self.path, 'rb')
        self._mm = mmap.mmap(self._fh.fileno(), 0, access=mmap.ACCESS_READ)

    def close(self):
        if self._mm:
            self._mm.close()
        if self._fh:
            self._fh.close()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()

    def _build_index(self):
        dprint(f"[APE-IDX] Construyendo índice atómico para {self.path.name}...")
        t0 = time.time()

        offsets   = []
        meta_list = []
        header_end = None

        pat_extinf = re.compile(rb'^#EXTINF')
        pat_name   = re.compile(rb',(.+)$')
        pat_group  = re.compile(rb'group-title="([^"]*)"')
        pat_profile= re.compile(rb'ape-profile="([^"]*)"')
        pat_tvgname= re.compile(rb'tvg-name="([^"]*)"')

        mm = self._mm
        mm.seek(0)
        pos = 0
        file_size = mm.size()

        while pos < file_size:
            line_start = pos
            end = mm.find(b'\n', pos)
            if end == -1:
                end = file_size - 1
            line = mm[pos:end + 1]
            pos  = end + 1

            if pat_extinf.match(line):
                if header_end is None:
                    header_end = line_start
                offsets.append(line_start)

                m_name    = pat_tvgname.search(line)
                m_group   = pat_group.search(line)
                m_profile = pat_profile.search(line)
                meta_list.append({
                    'name':    m_name.group(1).decode('utf-8', 'replace')    if m_name    else '',
                    'group':   m_group.group(1).decode('utf-8', 'replace')   if m_group   else '',
                    'profile': m_profile.group(1).decode('utf-8', 'replace') if m_profile else '',
                    'offset':  line_start,
                })

        if header_end is None:
            raise ValueError("No se encontró ningún #EXTINF en el archivo.")

        self._header_end_byte  = header_end
        self._channel_offsets  = offsets
        self._channel_meta     = meta_list
        self._total_channels   = len(offsets)

        mm.seek(0)
        self._header_bytes = mm.read(header_end)

        elapsed = time.time() - t0
        dprint(f"[APE-IDX] Índice construido: {self._total_channels} canales en {elapsed:.2f}s")
        self._save_index()

    def _save_index(self):
        n = self._total_channels
        with open(self.idx_path, 'wb') as f:
            f.write(self.INDEX_MAGIC)
            f.write(struct.pack('<I', n))
            f.write(struct.pack('<Q', self._header_end_byte))
            for off in self._channel_offsets:
                f.write(struct.pack('<Q', off))
            meta_bytes = json.dumps(self._channel_meta, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
            f.write(struct.pack('<I', len(meta_bytes)))
            f.write(meta_bytes)
        dprint(f"[APE-IDX] Índice guardado en {self.idx_path.name}")

    def _load_index(self) -> bool:
        if not self.idx_path.exists():
            return False
        if self.idx_path.stat().st_mtime < self.path.stat().st_mtime:
            dprint("[APE-IDX] Índice desactualizado, reconstruyendo...")
            return False
        try:
            with open(self.idx_path, 'rb') as f:
                magic = f.read(8)
                if magic != self.INDEX_MAGIC:
                    return False
                n,              = struct.unpack('<I', f.read(4))
                header_end,     = struct.unpack('<Q', f.read(8))
                offsets = [struct.unpack('<Q', f.read(8))[0] for _ in range(n)]
                meta_len,       = struct.unpack('<I', f.read(4))
                meta_bytes      = f.read(meta_len)
                meta_list       = json.loads(meta_bytes.decode('utf-8'))

            self._header_end_byte = header_end
            self._channel_offsets = offsets
            self._channel_meta    = meta_list
            self._total_channels  = n

            self._mm.seek(0)
            self._header_bytes = self._mm.read(header_end)

            dprint(f"[APE-IDX] Índice cargado desde disco: {n} canales")
            return True
        except Exception as e:
            dprint(f"[APE-IDX] Error cargando índice: {e}")
            return False

    def _load_or_build_index(self):
        if not self._load_index():
            self._build_index()

    def zap(self, channel_idx: int) -> bytes:
        if not (0 <= channel_idx < self._total_channels):
            raise IndexError(f"Canal {channel_idx} fuera de rango [0, {self._total_channels - 1}]")

        atom_start = self._channel_offsets[channel_idx]
        if channel_idx + 1 < self._total_channels:
            atom_end = self._channel_offsets[channel_idx + 1]
        else:
            atom_end = self._mm.size()

        self._mm.seek(atom_start)
        atom_bytes = self._mm.read(atom_end - atom_start)
        return self._header_bytes + atom_bytes

    def zap_str(self, channel_idx: int, encoding: str = 'utf-8') -> str:
        return self.zap(channel_idx).decode(encoding, errors='replace')


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='APE Atomic Zapper')
    parser.add_argument('m3u8', help='Ruta al archivo .m3u8')
    parser.add_argument('--zap', type=int, default=None, help='Hacer zap a canal N')
    args = parser.parse_args()

    if args.zap is not None:
        with APEAtomicZapper(args.m3u8) as z:
            sys.stdout.buffer.write(z.zap(args.zap))
