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


# ---------------------------------------------------------------------------
# CLASE PRINCIPAL: APEAtomicZapper
# ---------------------------------------------------------------------------
class APEAtomicZapper:
    """
    Motor de zapping atómico de complejidad O(1) para listas APE.

    Estrategia de índice:
      En el primer uso construye un índice binario compacto:
        - offset_bytes[i]  → posición en bytes del inicio del átomo i
        - line_num[i]      → número de línea del #EXTINF del canal i
      El índice se persiste en disco como un archivo .apeindex para
      evitar reconstrucciones en arranques posteriores.

    Zapping atómico:
      zap(canal_idx) → str  con  CABECERA_GLOBAL + ÁTOMO_CANAL
      Tiempo de ejecución: O(1) — solo dos seek() + dos read()
    """

    INDEX_MAGIC   = b'APEIDX\x01\x00'   # 8 bytes de firma
    INDEX_VERSION = 1

    def __init__(self, m3u8_path: str):
        self.path      = Path(m3u8_path)
        self.idx_path  = self.path.with_suffix('.apeindex')
        self._fh       = None          # file handle abierto en modo rb
        self._mm       = None          # mmap del archivo
        self._header_end_byte = 0      # offset donde termina la cabecera global
        self._header_bytes    = b''    # bytes de la cabecera global (cacheada)
        self._channel_offsets: List[int] = []   # offset de inicio de cada átomo
        self._channel_meta:   List[dict] = []   # metadatos rápidos por canal
        self._total_channels  = 0

        self._open_file()
        self._load_or_build_index()

    # ------------------------------------------------------------------
    # APERTURA Y MMAP
    # ------------------------------------------------------------------
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

    # ------------------------------------------------------------------
    # ÍNDICE BINARIO
    # ------------------------------------------------------------------
    def _build_index(self):
        """
        Recorre el archivo UNA SOLA VEZ para construir el índice.
        Identifica:
          - El offset de byte donde termina la cabecera global.
          - El offset de byte de inicio de cada átomo (#EXTINF).
          - Metadatos rápidos (nombre, grupo, perfil) de cada canal.
        """
        print(f"[APE-IDX] Construyendo índice atómico para {self.path.name}...")
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
            # Leer hasta el siguiente \n
            end = mm.find(b'\n', pos)
            if end == -1:
                end = file_size - 1
            line = mm[pos:end + 1]
            pos  = end + 1

            if pat_extinf.match(line):
                if header_end is None:
                    # La cabecera global termina justo antes de este #EXTINF
                    header_end = line_start
                offsets.append(line_start)

                # Extraer metadatos rápidos
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

        # Cachear cabecera global
        mm.seek(0)
        self._header_bytes = mm.read(header_end)

        elapsed = time.time() - t0
        print(f"[APE-IDX] Índice construido: {self._total_channels} canales en {elapsed:.2f}s")
        self._save_index()

    def _save_index(self):
        """Persiste el índice en disco en formato binario compacto."""
        n = self._total_channels
        with open(self.idx_path, 'wb') as f:
            # Cabecera del índice
            f.write(self.INDEX_MAGIC)
            f.write(struct.pack('<I', n))
            f.write(struct.pack('<Q', self._header_end_byte))
            # Offsets: n × uint64
            for off in self._channel_offsets:
                f.write(struct.pack('<Q', off))
            # Metadatos: JSON compacto por canal
            meta_bytes = json.dumps(self._channel_meta, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
            f.write(struct.pack('<I', len(meta_bytes)))
            f.write(meta_bytes)
        print(f"[APE-IDX] Índice guardado en {self.idx_path.name}")

    def _load_index(self) -> bool:
        """Carga el índice desde disco. Retorna True si tuvo éxito."""
        if not self.idx_path.exists():
            return False
        # Verificar que el índice no es más antiguo que el m3u8
        if self.idx_path.stat().st_mtime < self.path.stat().st_mtime:
            print("[APE-IDX] Índice desactualizado, reconstruyendo...")
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

            print(f"[APE-IDX] Índice cargado desde disco: {n} canales")
            return True
        except Exception as e:
            print(f"[APE-IDX] Error cargando índice: {e}")
            return False

    def _load_or_build_index(self):
        if not self._load_index():
            self._build_index()

    # ------------------------------------------------------------------
    # ZAPPING ATÓMICO  ← EL CORAZÓN DEL SISTEMA
    # ------------------------------------------------------------------
    def zap(self, channel_idx: int) -> bytes:
        """
        Retorna los bytes de:  CABECERA_GLOBAL + ÁTOMO_CANAL[channel_idx]

        Complejidad: O(1) — exactamente 2 operaciones seek() + 2 read()
        No se toca ninguna otra parte del archivo.

        Args:
            channel_idx: índice 0-based del canal destino.

        Returns:
            bytes: contenido M3U8 listo para ser servido al reproductor.
        """
        if not (0 <= channel_idx < self._total_channels):
            raise IndexError(
                f"Canal {channel_idx} fuera de rango [0, {self._total_channels - 1}]"
            )

        atom_start = self._channel_offsets[channel_idx]

        # Determinar el fin del átomo: inicio del siguiente átomo (o EOF)
        if channel_idx + 1 < self._total_channels:
            atom_end = self._channel_offsets[channel_idx + 1]
        else:
            atom_end = self._mm.size()

        # Seek directo al átomo — O(1)
        self._mm.seek(atom_start)
        atom_bytes = self._mm.read(atom_end - atom_start)

        # Concatenar cabecera global + átomo
        return self._header_bytes + atom_bytes

    def zap_str(self, channel_idx: int, encoding: str = 'utf-8') -> str:
        """Igual que zap() pero retorna str decodificado."""
        return self.zap(channel_idx).decode(encoding, errors='replace')

    # ------------------------------------------------------------------
    # BÚSQUEDA Y FILTRADO
    # ------------------------------------------------------------------
    def search(self, query: str, field: str = 'name') -> List[Tuple[int, dict]]:
        """
        Busca canales por nombre, grupo o perfil.
        Retorna lista de (índice, metadatos).
        """
        q = query.lower()
        results = []
        for i, meta in enumerate(self._channel_meta):
            if q in meta.get(field, '').lower():
                results.append((i, meta))
        return results

    def search_all(self, query: str) -> List[Tuple[int, dict]]:
        """Busca en nombre Y grupo simultáneamente."""
        q = query.lower()
        results = []
        for i, meta in enumerate(self._channel_meta):
            if q in meta.get('name', '').lower() or q in meta.get('group', '').lower():
                results.append((i, meta))
        return results

    def by_group(self, group: str) -> List[Tuple[int, dict]]:
        """Retorna todos los canales de un grupo específico."""
        g = group.lower()
        return [(i, m) for i, m in enumerate(self._channel_meta)
                if g in m.get('group', '').lower()]

    def by_profile(self, profile: str) -> List[Tuple[int, dict]]:
        """Retorna todos los canales de un perfil APE (P0, P1, P2, P3...)."""
        p = profile.upper()
        return [(i, m) for i, m in enumerate(self._channel_meta)
                if m.get('profile', '').upper() == p]

    # ------------------------------------------------------------------
    # PROPIEDADES
    # ------------------------------------------------------------------
    @property
    def total(self) -> int:
        return self._total_channels

    @property
    def groups(self) -> List[str]:
        """Lista de grupos únicos."""
        return sorted(set(m['group'] for m in self._channel_meta))

    @property
    def profiles(self) -> List[str]:
        """Lista de perfiles APE únicos."""
        return sorted(set(m['profile'] for m in self._channel_meta))

    def info(self, channel_idx: int) -> dict:
        """Retorna los metadatos rápidos de un canal."""
        return self._channel_meta[channel_idx]

    def atom_size_bytes(self, channel_idx: int) -> int:
        """Tamaño en bytes del átomo de un canal."""
        start = self._channel_offsets[channel_idx]
        end   = (self._channel_offsets[channel_idx + 1]
                 if channel_idx + 1 < self._total_channels
                 else self._mm.size())
        return end - start


# ---------------------------------------------------------------------------
# MINI SERVIDOR HTTP DE ZAPPING  (opcional, para reproductores de red)
# ---------------------------------------------------------------------------
def run_server(zapper: APEAtomicZapper, host: str = '0.0.0.0', port: int = 8765):
    """
    Servidor HTTP mínimo que expone el zapping vía URL:

      GET /channel/{idx}          → sirve el M3U8 atómico del canal idx
      GET /channel/{idx}/raw      → solo el átomo (sin cabecera global)
      GET /search?q=bein&f=name   → JSON con resultados de búsqueda
      GET /groups                 → JSON con lista de grupos
      GET /info/{idx}             → JSON con metadatos del canal
      GET /                       → JSON con estadísticas generales
    """
    from http.server import BaseHTTPRequestHandler, HTTPServer
    from urllib.parse import urlparse, parse_qs
    import json as _json

    class ZapHandler(BaseHTTPRequestHandler):

        def log_message(self, fmt, *args):
            # Silenciar logs de acceso para no saturar consola
            pass

        def send_json(self, data, code=200):
            body = _json.dumps(data, ensure_ascii=False, indent=2).encode('utf-8')
            self.send_response(code)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def send_m3u8(self, data: bytes):
            self.send_response(200)
            self.send_header('Content-Type', 'application/vnd.apple.mpegurl')
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'no-cache')
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            parsed = urlparse(self.path)
            path   = parsed.path.rstrip('/')
            qs     = parse_qs(parsed.query)

            try:
                # --- GET /channel/{idx} ---
                if path.startswith('/channel/'):
                    parts = path.split('/')
                    idx   = int(parts[2])
                    if len(parts) == 4 and parts[3] == 'raw':
                        # Solo el átomo
                        zapper._mm.seek(zapper._channel_offsets[idx])
                        end = (zapper._channel_offsets[idx + 1]
                               if idx + 1 < zapper.total
                               else zapper._mm.size())
                        data = zapper._mm.read(end - zapper._channel_offsets[idx])
                    else:
                        data = zapper.zap(idx)
                    self.send_m3u8(data)

                # --- GET /search?q=...&f=name|group ---
                elif path == '/search':
                    q = qs.get('q', [''])[0]
                    f = qs.get('f', ['name'])[0]
                    results = zapper.search(q, f) if f in ('name', 'group', 'profile') \
                              else zapper.search_all(q)
                    self.send_json([{'idx': i, **m} for i, m in results[:200]])

                # --- GET /groups ---
                elif path == '/groups':
                    self.send_json(zapper.groups)

                # --- GET /profiles ---
                elif path == '/profiles':
                    self.send_json(zapper.profiles)

                # --- GET /info/{idx} ---
                elif path.startswith('/info/'):
                    idx = int(path.split('/')[2])
                    meta = zapper.info(idx)
                    meta['atom_bytes'] = zapper.atom_size_bytes(idx)
                    self.send_json(meta)

                # --- GET / ---
                elif path == '':
                    self.send_json({
                        'engine':          'APE Atomic Zapper v1.0',
                        'file':            zapper.path.name,
                        'total_channels':  zapper.total,
                        'header_bytes':    len(zapper._header_bytes),
                        'groups_count':    len(zapper.groups),
                        'profiles':        zapper.profiles,
                        'endpoints': {
                            '/channel/{idx}':       'M3U8 atómico del canal',
                            '/channel/{idx}/raw':   'Solo el átomo del canal',
                            '/search?q=&f=':        'Búsqueda de canales',
                            '/groups':              'Lista de grupos',
                            '/profiles':            'Lista de perfiles APE',
                            '/info/{idx}':          'Metadatos de un canal',
                        }
                    })
                else:
                    self.send_json({'error': 'ruta no encontrada'}, 404)

            except IndexError as e:
                self.send_json({'error': str(e)}, 404)
            except Exception as e:
                self.send_json({'error': str(e)}, 500)

    server = HTTPServer((host, port), ZapHandler)
    print(f"\n[APE-ZAP] Servidor de zapping atómico escuchando en http://{host}:{port}")
    print(f"[APE-ZAP] Ejemplo: http://localhost:{port}/channel/0")
    print(f"[APE-ZAP] Búsqueda: http://localhost:{port}/search?q=bein&f=name")
    print(f"[APE-ZAP] Ctrl+C para detener\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[APE-ZAP] Servidor detenido.")


# ---------------------------------------------------------------------------
# CLI / DEMO
# ---------------------------------------------------------------------------
def demo(m3u8_path: str):
    print("=" * 65)
    print("  APE ATOMIC ZAPPER  —  Demo de uso")
    print("=" * 65)

    with APEAtomicZapper(m3u8_path) as z:
        print(f"\n  Total canales : {z.total}")
        print(f"  Grupos únicos : {len(z.groups)}")
        print(f"  Perfiles APE  : {z.profiles}")
        print(f"  Cabecera      : {len(z._header_bytes):,} bytes\n")

        # --- Benchmark de zapping ---
        import time
        N = 100
        t0 = time.perf_counter()
        for i in range(N):
            _ = z.zap(i % z.total)
        elapsed = time.perf_counter() - t0
        print(f"  Benchmark: {N} zaps en {elapsed*1000:.1f}ms "
              f"({elapsed/N*1000:.3f}ms/zap)\n")

        # --- Muestra de canales ---
        print("  Primeros 5 canales:")
        for i in range(min(5, z.total)):
            m = z.info(i)
            print(f"    [{i:4d}] {m['name'][:55]:<55} | {m['profile']} | {m['group'][:30]}")

        # --- Búsqueda demo ---
        print("\n  Búsqueda 'bein':")
        for idx, meta in z.search_all('bein')[:5]:
            print(f"    [{idx:4d}] {meta['name'][:55]}")

        # --- Zap canal 0 (primeras 3 líneas) ---
        print("\n  Primeras 3 líneas del zap(0):")
        snippet = z.zap_str(0).split('\n')[:3]
        for line in snippet:
            print(f"    {line[:100]}")

        print("\n  Uso programático:")
        print("    zapper = APEAtomicZapper('lista.m3u8')")
        print("    m3u8_bytes = zapper.zap(42)          # canal 42, O(1)")
        print("    resultados = zapper.search_all('bein')")
        print("    canales_4k = zapper.by_profile('P1')")
        print()


if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(
        description='APE Atomic Zapper — Zapping O(1) sin mover valores APE'
    )
    parser.add_argument('m3u8', help='Ruta al archivo .m3u8')
    parser.add_argument('--demo',   action='store_true', help='Ejecutar demo')
    parser.add_argument('--server', action='store_true', help='Iniciar servidor HTTP')
    parser.add_argument('--port',   type=int, default=8765, help='Puerto del servidor')
    parser.add_argument('--zap',    type=int, default=None, help='Hacer zap a canal N y mostrar resultado')
    args = parser.parse_args()

    if args.demo:
        demo(args.m3u8)
    elif args.server:
        with APEAtomicZapper(args.m3u8) as z:
            run_server(z, port=args.port)
    elif args.zap is not None:
        with APEAtomicZapper(args.m3u8) as z:
            print(z.zap_str(args.zap)[:500] + '\n...[truncado]')
    else:
        demo(args.m3u8)
