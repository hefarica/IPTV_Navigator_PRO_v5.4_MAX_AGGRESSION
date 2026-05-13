"""
Test suite para publication_gate.py (Etapa 4 del plan).
Cubre: criterios de aceptación (UT-09, CT-06, CT-07), decision logic, RES-01,05,06,07.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from publication_gate import (
    run_gate,
    role_from_url,
    mime_matches_url_role,
    is_canonical_url,
    MIME_ROLE_TABLE,
    normalize_ct,
)


# ── Helpers estructurales ──
class TestRoleFromURL(unittest.TestCase):
    def test_m3u8(self):
        self.assertEqual(role_from_url('http://x/y.m3u8'), 'playlist_hls')
        self.assertEqual(role_from_url('http://x/y.m3u8?a=1&b=2'), 'playlist_hls')

    def test_ts(self):
        self.assertEqual(role_from_url('http://x/y.ts'), 'segment_ts')

    def test_mpd(self):
        self.assertEqual(role_from_url('http://x/y.mpd'), 'playlist_dash')

    def test_mp4(self):
        self.assertEqual(role_from_url('http://x/y.mp4'), 'segment_cmaf')
        self.assertEqual(role_from_url('http://x/y.m4s'), 'segment_cmaf')

    def test_unknown(self):
        self.assertEqual(role_from_url('http://x/y.bin'), 'unknown')
        self.assertEqual(role_from_url(''), 'unknown')


class TestMimeMatchesURLRole(unittest.TestCase):
    def test_match(self):
        self.assertTrue(mime_matches_url_role('application/vnd.apple.mpegurl', 'http://x/a.m3u8'))
        self.assertTrue(mime_matches_url_role('video/mp2t', 'http://x/a.ts'))

    def test_mismatch(self):
        """UT-08 equivalente: MIME no corresponde a extensión"""
        self.assertFalse(mime_matches_url_role('text/html', 'http://x/a.m3u8'))
        self.assertFalse(mime_matches_url_role('application/json', 'http://x/a.m3u8'))

    def test_strip_charset(self):
        self.assertTrue(mime_matches_url_role('application/vnd.apple.mpegurl; charset=utf-8', 'http://x/a.m3u8'))


class TestIsCanonicalURL(unittest.TestCase):
    def test_ut01_canonical_stable(self):
        """UT-01: URL con query ordenada alfabéticamente → canónica"""
        self.assertTrue(is_canonical_url('http://x/y?a=1&b=2&c=3'))

    def test_ut01_canonical_false_when_unsorted(self):
        """UT-01 negativo: query desordenada → no canónica"""
        self.assertFalse(is_canonical_url('http://x/y?b=2&a=1'))
        self.assertFalse(is_canonical_url('http://x/y?z=9&a=1'))

    def test_no_query_is_canonical(self):
        self.assertTrue(is_canonical_url('http://x/y'))
        self.assertTrue(is_canonical_url('http://x/y?'))


# ── Decision logic (core del gate extendido) ──
class TestGateDecisionLogic(unittest.TestCase):
    # m3u8 texto mínimo con N URLs tras STREAM-INF
    def _make_m3u8(self, urls):
        lines = ['#EXTM3U']
        for u in urls:
            lines.append('#EXT-X-STREAM-INF:BANDWIDTH=1000')
            lines.append(u)
        return '\n'.join(lines) + '\n'

    def _mock_probe(self, mapping):
        """Devuelve función que mapea url → {status, content_type, final_url}"""
        def fake(session, url, timeout):
            data = mapping.get(url, {'status': 404, 'content_type': ''})
            return {'url': url, 'status': data['status'], 'content_type': data['content_type'], 'final_url': url}
        return fake

    def test_publish_all_thresholds_met(self):
        """Todas las URLs: 200 + MIME HLS + canonical → decision=publish"""
        urls = [
            'http://x/a.m3u8?a=1&b=2',
            'http://x/b.m3u8?a=1&b=2',
            'http://x/c.m3u8?a=1&b=2',
        ]
        mapping = {u: {'status': 200, 'content_type': 'application/vnd.apple.mpegurl'} for u in urls}
        m3u8 = self._make_m3u8(urls)
        with patch('publication_gate.probe', side_effect=self._mock_probe(mapping)):
            verdict = run_gate(m3u8, sample_size=10)
        self.assertEqual(verdict['decision'], 'publish')
        self.assertTrue(verdict['published'])
        self.assertEqual(verdict['mime_match_ratio'], 1.0)
        self.assertEqual(verdict['canonical_ratio'], 1.0)
        self.assertEqual(verdict['bad405_count'], 0)

    def test_res04_405_blocks_immediately(self):
        """RES-04 gate: cualquier 405 → decision=block"""
        urls = ['http://x/a.m3u8?a=1', 'http://x/b.m3u8?a=1']
        mapping = {
            urls[0]: {'status': 200, 'content_type': 'application/vnd.apple.mpegurl'},
            urls[1]: {'status': 405, 'content_type': ''},
        }
        with patch('publication_gate.probe', side_effect=self._mock_probe(mapping)):
            verdict = run_gate(self._make_m3u8(urls), sample_size=10)
        self.assertEqual(verdict['decision'], 'block')
        self.assertIn('bad405_count', ' '.join(verdict['decision_reasons']))

    def test_mime_mismatch_blocks(self):
        """MIME incoherente con extensión → decision=block (umbral 100%)"""
        urls = ['http://x/a.m3u8?a=1']
        mapping = {urls[0]: {'status': 200, 'content_type': 'text/html'}}
        with patch('publication_gate.probe', side_effect=self._mock_probe(mapping)):
            verdict = run_gate(self._make_m3u8(urls), sample_size=10)
        self.assertEqual(verdict['decision'], 'block')
        self.assertLess(verdict['mime_match_ratio'], 1.0)

    def test_canonical_violation_blocks(self):
        """URL no canónica en la lista → decision=block (umbral 100%)"""
        urls = ['http://x/a.m3u8?b=2&a=1']  # b antes de a = NO canonical
        mapping = {urls[0]: {'status': 200, 'content_type': 'application/vnd.apple.mpegurl'}}
        with patch('publication_gate.probe', side_effect=self._mock_probe(mapping)):
            verdict = run_gate(self._make_m3u8(urls), sample_size=10)
        self.assertEqual(verdict['decision'], 'block')
        self.assertLess(verdict['canonical_ratio'], 1.0)
        self.assertGreater(len(verdict['canonical_violations']), 0)

    def test_soft_failure_reclassify(self):
        """ok200 ok pero hls_ratio bajo → decision=reclassify (no bloquea, pide recalibrar)"""
        # 3 URLs, 2 devuelven algo no-HLS (pero MIME correcto contra su extensión si la URL fuera .ts o .mpd)
        # Para mantenernos simples: todas m3u8, todas 200, pero content-type no-HLS con extensión m3u8 → block por MIME.
        # Un soft failure real: todas m3u8 200 HLS, pero decision también necesita hls_ratio < min_hls.
        # Aquí uso un escenario más directo: min_hls_predominance alto custom.
        urls = ['http://x/a.m3u8?a=1', 'http://x/b.m3u8?a=1']
        mapping = {u: {'status': 200, 'content_type': 'application/vnd.apple.mpegurl'} for u in urls}
        with patch('publication_gate.probe', side_effect=self._mock_probe(mapping)):
            # Subir min_hls_predominance a 1.01 para forzar soft fail
            verdict = run_gate(self._make_m3u8(urls), sample_size=10, min_hls_predominance=1.01)
        self.assertIn(verdict['decision'], ('reclassify',))
        self.assertIn('hls_predominance_ratio', ' '.join(verdict['decision_reasons']))

    def test_res01_no_urls_blocked(self):
        """RES equivalente: m3u8 sin STREAM-INF → decision=block"""
        verdict = run_gate('#EXTM3U\n#EXT-X-VERSION:3\n', sample_size=10)
        self.assertEqual(verdict['decision'], 'block')
        self.assertIn('no_stream_inf_urls', verdict['decision_reasons'])


class TestMimeRoleTable(unittest.TestCase):
    def test_10_entries(self):
        """Tabla MIME_ROLE alineada con mime-policy.js (10 roles activos)"""
        self.assertEqual(len(MIME_ROLE_TABLE), 10)

    def test_hls_roles(self):
        self.assertEqual(MIME_ROLE_TABLE['application/vnd.apple.mpegurl'], 'playlist_hls')
        self.assertEqual(MIME_ROLE_TABLE['application/x-mpegurl'], 'playlist_hls')


if __name__ == '__main__':
    unittest.main(verbosity=2)
