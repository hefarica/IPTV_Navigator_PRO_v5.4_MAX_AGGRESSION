"""Regresión de la guarda de formato (fase 2, 2026-11-20).

Origen del test: la guarda de entrada rechazaba la lista del propietario porque
confundía dos líneas de boilerplate (`#EXT-X-TARGETDURATION:2`,
`#EXT-X-PART-INF:PART-TARGET=1.0`) con una media playlist. Al corregirlo se
introdujo una heurística `entries >= 100` que rechazaba catálogos legítimos
pequeños. Este fichero fija el contrato correcto:

  · catálogo = TODAS las líneas `#EXTINF:` son de canal (atributos M3U Plus) y
    ninguna es una duración de segmento positiva sin atributos.
  · media playlist real = duración de segmento positiva, o una etiqueta que solo
    existe en media playlists (`#EXT-X-MEDIA-SEQUENCE:`, `#EXT-X-MAP:`,
    `#EXT-X-BYTERANGE:`, `#EXT-X-PART:` con URI, `#EXT-X-PRELOAD-HINT:`,
    `#EXT-X-I-FRAMES-ONLY`).
  · ambiguo ⇒ se RECHAZA (fail-closed), nunca se adivina.
"""
import gzip
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import ejecutar_seguro as E  # noqa: E402

HEADER = ('#EXTM3U x-tvg-url="" refresh="1800"\n'
          '#EXT-X-VERSION:9\n'
          '#EXT-X-INDEPENDENT-SEGMENTS\n'
          '#EXT-X-APE-CHANNELS:%d\n'
          '#EXT-X-TARGETDURATION:2\n'
          '#EXT-X-PART-INF:PART-TARGET=1.0\n')


def canal(i):
    return ('#EXTINF:-1 tvg-id="c%d" tvg-name="Canal %d" tvg-logo="l.png" '
            'group-title="G",Canal %d\n'
            'https://iptv-ape.duckdns.org/pulse/%d.m3u8?u=%s&d=abc\n'
            % (i, i, i, i, 'https%3A%2F%2Fp%2F1'))


def catalogo(n, con_cabecera=True):
    partes = []
    if con_cabecera:
        partes.append(HEADER % n)
    for i in range(1, n + 1):
        partes.append(canal(i))
    return ''.join(partes)


def media_playlist(n=4):
    out = ['#EXTM3U\n', '#EXT-X-VERSION:3\n', '#EXT-X-TARGETDURATION:6\n',
           '#EXT-X-MEDIA-SEQUENCE:100\n']
    for i in range(n):
        out.append('#EXTINF:6.000,\n')
        out.append('https://cdn.example/seg%d.ts\n' % i)
    return ''.join(out)


class GuardaFormatoTests(unittest.TestCase):
    def _escribe(self, texto, sufijo='.m3u8', comprimir=False):
        fd, path = tempfile.mkstemp(suffix=sufijo)
        os.close(fd)
        datos = texto.encode('utf-8')
        if comprimir:
            with gzip.open(path, 'wb') as f:
                f.write(datos)
        else:
            with open(path, 'wb') as f:
                f.write(datos)
        self.addCleanup(os.unlink, path)
        return path

    # ── catálogos legítimos, sin importar el tamaño ─────────────────────────
    def test_catalogo_de_1_canal_con_boilerplate(self):
        info = E.inspect_format(self._escribe(catalogo(1)))
        self.assertEqual(info['kind'], 'iptv_catalog', info)
        self.assertEqual(info['entries'], 1)
        self.assertEqual(info['media_override'], 'catalog_signature')

    def test_catalogo_de_62_canales_con_boilerplate(self):
        info = E.inspect_format(self._escribe(catalogo(62)))
        self.assertEqual(info['kind'], 'iptv_catalog', info)
        self.assertEqual(info['entries'], 62)

    def test_catalogo_de_99_canales(self):
        info = E.inspect_format(self._escribe(catalogo(99)))
        self.assertEqual(info['kind'], 'iptv_catalog', info)

    def test_catalogo_de_100_canales(self):
        info = E.inspect_format(self._escribe(catalogo(100)))
        self.assertEqual(info['kind'], 'iptv_catalog', info)

    def test_muestra_truncada_sin_cabecera_sigue_siendo_catalogo(self):
        info = E.inspect_format(self._escribe(canal(1) + canal(2)))
        self.assertEqual(info['kind'], 'iptv_catalog', info)
        self.assertIsNone(info['media_override'])   # sin boilerplate: no hace falta override

    def test_catalogo_comprimido(self):
        info = E.inspect_format(self._escribe(catalogo(3), sufijo='.m3u8.gz',
                                               comprimir=True))
        self.assertEqual(info['kind'], 'iptv_catalog', info)

    # ── lo que DEBE seguir rechazándose ────────────────────────────────────
    def test_media_playlist_real_se_rechaza(self):
        info = E.inspect_format(self._escribe(media_playlist()))
        self.assertEqual(info['kind'], 'hls_media_or_segment_playlist', info)

    def test_media_playlist_con_solo_media_sequence_se_rechaza(self):
        texto = ('#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXT-X-MEDIA-SEQUENCE:9\n'
                 '#EXTINF:6.0,\nhttps://c/s.ts\n')
        info = E.inspect_format(self._escribe(texto))
        self.assertEqual(info['kind'], 'hls_media_or_segment_playlist', info)

    def test_ll_hls_con_partes_se_rechaza(self):
        texto = ('#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXT-X-PART-INF:PART-TARGET=1.0\n'
                 '#EXT-X-PART:DURATION=1.0,URI="p1.mp4",INDEPENDENT=YES\n'
                 '#EXTINF:4.0,\ns1.mp4\n')
        info = E.inspect_format(self._escribe(texto))
        self.assertEqual(info['kind'], 'hls_media_or_segment_playlist', info)

    def test_mezcla_ambigua_se_rechaza(self):
        """Canal con atributos + duración de segmento positiva ⇒ NO se adivina."""
        texto = (HEADER % 1) + canal(1) + '#EXTINF:6.000,\nhttps://c/seg.ts\n'
        info = E.inspect_format(self._escribe(texto))
        self.assertEqual(info['kind'], 'hls_media_or_segment_playlist', info)

    def test_master_hls_sin_extinf(self):
        texto = ('#EXTM3U\n'
                 '#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=1280x720\n'
                 'v0/index.m3u8\n'
                 '#EXT-X-STREAM-INF:BANDWIDTH=2400000,RESOLUTION=1920x1080\n'
                 'v1/index.m3u8\n')
        info = E.inspect_format(self._escribe(texto))
        self.assertEqual(info['kind'], 'hls_master', info)

    def test_fichero_sin_extinf_ni_variantes(self):
        info = E.inspect_format(self._escribe('#EXTM3U\n'))
        self.assertEqual(info['kind'], 'unsupported_no_extinf_entries', info)

    # ── contraste declarado frente a entradas contadas ─────────────────────
    def test_el_total_declarado_no_es_el_censo(self):
        """`#EXT-X-APE-CHANNELS:11222` no infla `entries`: se cuentan líneas."""
        info = E.inspect_format(self._escribe(catalogo(3)))
        self.assertEqual(info['entries'], 3, info)
        self.assertEqual(info['attr_entries'], 3, info)


if __name__ == '__main__':
    unittest.main()
