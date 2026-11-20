#!/usr/bin/env python3
"""Regresiones locales de entrada segura; sin credenciales ni red."""
import gzip
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import auditar_y_ampliar as core
import ejecutar_seguro as safe
from verificar_lista import restore_block


class SeguridadTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='ape-skill-tests-')
        self.root = Path(self.temp.name)
        self.source = self.root / 'entrada.m3u8'
        self.source.write_text('#EXTM3U\n#EXTINF:-1,Canal\nhttps://example.test/live\n')

    def tearDown(self):
        self.temp.cleanup()

    def test_rechazar_colision_con_original_y_destinos_duplicados(self):
        with self.assertRaises(ValueError):
            safe.check_paths(self.source, [self.source])
        with self.assertRaises(ValueError):
            safe.check_paths(self.source, [self.root / 'a.json', self.root / 'a.json'])

    def test_rechazar_destino_existente(self):
        dest = self.root / 'audit.json'
        dest.write_text('NO BORRAR')
        with self.assertRaises(ValueError):
            safe.check_paths(self.source, [dest])
        self.assertEqual(dest.read_text(), 'NO BORRAR')

    def test_detectar_hls_master(self):
        self.source.write_text('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000000\nchild.m3u8\n')
        self.assertEqual(safe.inspect_format(self.source)['kind'], 'hls_master')

    def test_detectar_hls_media_y_segmentos(self):
        for text in ['#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4,\nsegment.ts\n',
                     '#EXTM3U\n#EXTINF:2.5,\nsegment.ts\n']:
            self.source.write_text(text)
            self.assertEqual(safe.inspect_format(self.source)['kind'], 'hls_media_or_segment_playlist')

    def test_detectar_hibrido_iptv(self):
        self.source.write_text('#EXTM3U\n#EXTINF:-1 tvg-id="a",Canal\n#EXT-X-STREAM-INF:BANDWIDTH=1000000\nhttps://example.test/live\n')
        self.assertEqual(safe.inspect_format(self.source)['kind'], 'iptv_catalog_hybrid')

    def test_no_contar_ids_ausentes_como_duplicados(self):
        self.source.write_text('#EXTM3U\n#EXTINF:-1,Uno\nhttps://example.test/1\n#EXTINF:-1,Dos\nhttps://example.test/2\n')
        info = core.audit(self.source)
        self.assertEqual(info['channels'], 2)
        self.assertEqual(info['duplicate_channel_ids'], 0)

    def test_recuperar_crlf_y_sin_salto_final(self):
        text = '#EXTM3U\r\n#EXTINF:-1 tvg-id="a",Canal\r\n#EXT-X-APE-REA:{"targetResolution":null,"extra":"keep"}\r\n#EXT-X-STREAM-INF:BANDWIDTH=1000000\r\n#EXTVLCOPT:video-filter=scale=3840:2160\r\nhttps://example.test/live'
        self.source.write_bytes(text.encode())
        original = list(core.blocks(self.source))
        patched = [core.patch_block(block) for block in original]
        restored = ''.join(line for block in patched for line in restore_block(block))
        self.assertEqual(restored.encode(), self.source.read_bytes())
        self.assertEqual(patched, [core.patch_block(block) for block in patched])

    def test_entrada_comprimida_gzip(self):
        file = self.root / 'entrada.m3u8.gz'
        with gzip.open(file, 'wb') as f:
            f.write(self.source.read_bytes())
        self.assertEqual(safe.inspect_format(file)['kind'], 'iptv_catalog')
        self.assertEqual(core.audit(file)['channels'], 1)

    def test_cli_rechazar_parche_de_fuente_verificada(self):
        with self.source.open('a') as f:
            f.write('#EXT-X-APE-RESOLUTION-VERIFIED:true\n')
        dest = self.root / 'salida.m3u8'
        result = subprocess.run([sys.executable, str(Path(safe.__file__)), str(self.source),
                                 '--output', str(dest), '--audit-json', str(self.root / 'audit.json')],
                                capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Fuentes verificadas presentes', result.stderr)
        self.assertFalse(dest.exists())
        self.assertFalse((self.root / 'audit.json').exists())


if __name__ == '__main__':
    unittest.main()
