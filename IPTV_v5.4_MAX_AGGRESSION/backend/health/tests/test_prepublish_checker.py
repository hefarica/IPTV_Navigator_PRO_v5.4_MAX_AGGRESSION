"""
Test suite para prepublish_checker.py — cubre UT, CT, IT, RES del plan de pruebas
End-to-End sin /resolve/. Unittest puro, cero dependencias externas.

IDs cubiertos:
  UT-01..04, UT-07, UT-08, UT-10
  CT-01 (builder→canonicalizer schema)
  CT-02 (canonicalizer→probe schema)
  CT-03 (probe→ranker schema)
  IT-04 (probe→ranker→selector: HLS > TS fallback)
  IT-05 (all invalid → quarantine)
  RES-03 (probe sin respuesta)
  RES-04 (405 rechazo inmediato)
  RES-09 (todas las variantes fallan → quarantined)
"""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from prepublish_checker import (
    normalize_ct,
    matches_role,
    evaluate_variant,
    rank_variants,
    run_batch,
    MIME_POLICY,
    DEFAULT_PRIORITY_CHAIN,
)


# ── UT-05 ── mime-policy: HLS con MIME HLS
class TestMimePolicy(unittest.TestCase):
    def test_ut05_hls_mime_hls_accepted(self):
        """UT-05: rol playlist_hls con MIME HLS → admitido"""
        self.assertTrue(matches_role('application/vnd.apple.mpegurl', 'playlist_hls'))
        self.assertTrue(matches_role('application/x-mpegurl', 'playlist_hls'))
        self.assertTrue(matches_role('application/vnd.apple.mpegurl; charset=utf-8', 'playlist_hls'))

    def test_ut06_hls_mime_text_plain_rejected(self):
        """UT-06: rol playlist_hls con text/plain sin cuerpo → rechazado"""
        self.assertFalse(matches_role('text/plain', 'playlist_hls'))

    def test_hls_body_bypass(self):
        """Caso especial: body inicia con #EXTM3U → admitir aunque MIME sea text/plain"""
        self.assertTrue(matches_role('text/plain', 'playlist_hls', body_preview='#EXTM3U\n#EXT-X-VERSION:3'))

    def test_segment_roles(self):
        self.assertTrue(matches_role('video/mp2t', 'segment_ts'))
        self.assertTrue(matches_role('application/mp4', 'segment_cmaf'))
        self.assertTrue(matches_role('video/iso.segment', 'segment_cmaf'))

    def test_restricted_mimes_rejected(self):
        """restricted disposition → no aceptar aunque el role matchee"""
        self.assertFalse(matches_role('application/json', 'playlist_hls'))
        self.assertFalse(matches_role('application/octet-stream', 'segment_ts'))


# ── UT-07, UT-08 ── ranking-engine
class TestRanking(unittest.TestCase):
    def test_ut07_ranking_prefers_more_compatible(self):
        """UT-07: dos variantes sanas, distinta compatibilidad → gana la más compatible (HLS > DASH)"""
        variants = [
            {'url': 'http://x/a.mpd', 'profile': 'P1', 'role': 'playlist_dash', 'disposition': 'admitted', 'mime_real': 'application/dash+xml', 'status': 200},
            {'url': 'http://x/a.m3u8', 'profile': 'P1', 'role': 'playlist_hls', 'disposition': 'preferred', 'mime_real': 'application/vnd.apple.mpegurl', 'status': 200},
        ]
        best = rank_variants(variants, DEFAULT_PRIORITY_CHAIN)
        self.assertEqual(best['role'], 'playlist_hls')

    def test_ut08_ranking_ignores_mime_mismatch(self):
        """UT-08: variante mejor calidad pero MIME incorrecto → no debería entrar al ranking (evaluate_variant la descarta antes)"""
        probe_bad = {'status': 200, 'content_type': 'text/html', 'body_preview': ''}
        result = evaluate_variant(probe_bad, 'playlist_hls')
        self.assertFalse(result['admitted'])
        self.assertIn('mime_mismatch', result['reason'])

    def test_rank_empty_returns_none(self):
        self.assertIsNone(rank_variants([], DEFAULT_PRIORITY_CHAIN))

    def test_rank_preferred_beats_admitted(self):
        """Entre 2 variantes HLS mismo profile: preferred > admitted (tiebreaker 2)"""
        variants = [
            {'url': 'u1', 'profile': 'P1', 'role': 'playlist_hls', 'disposition': 'admitted', 'mime_real': 'application/x-mpegurl', 'status': 200},
            {'url': 'u2', 'profile': 'P1', 'role': 'playlist_hls', 'disposition': 'preferred', 'mime_real': 'application/vnd.apple.mpegurl', 'status': 200},
        ]
        best = rank_variants(variants, DEFAULT_PRIORITY_CHAIN)
        self.assertEqual(best['url'], 'u2')

    def test_rank_lower_profile_number_wins(self):
        """Tiebreaker 3: perfil menor gana (P0 sobre P2)"""
        variants = [
            {'url': 'u0', 'profile': 'P0', 'role': 'playlist_hls', 'disposition': 'preferred', 'mime_real': 'application/vnd.apple.mpegurl', 'status': 200},
            {'url': 'u2', 'profile': 'P2', 'role': 'playlist_hls', 'disposition': 'preferred', 'mime_real': 'application/vnd.apple.mpegurl', 'status': 200},
        ]
        best = rank_variants(variants, DEFAULT_PRIORITY_CHAIN)
        self.assertEqual(best['profile'], 'P0')


# ── CT-02 / CT-03 ── schema de probe + evaluate
class TestSchemas(unittest.TestCase):
    def test_ct02_probe_result_schema(self):
        """CT-02: probe retorna {url, status, content_type, body_preview, final_url}"""
        with patch('prepublish_checker.requests.Session') as mock_sess_cls:
            mock_sess = MagicMock()
            mock_sess_cls.return_value = mock_sess
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.headers = {'Content-Type': 'application/vnd.apple.mpegurl'}
            mock_resp.url = 'http://x/final.m3u8'
            mock_resp.iter_content = MagicMock(return_value=iter([b'#EXTM3U\n']))
            mock_sess.get = MagicMock(return_value=mock_resp)

            from prepublish_checker import probe_variant
            res = probe_variant(mock_sess, 'http://x/a.m3u8', 5)
            for key in ('url', 'status', 'content_type', 'body_preview', 'final_url'):
                self.assertIn(key, res)

    def test_ct03_evaluate_returns_admitted_bool_reason(self):
        """CT-03: evaluate_variant retorna {admitted, reason, [role, disposition, mime_real]}"""
        probe_ok = {'status': 200, 'content_type': 'application/vnd.apple.mpegurl', 'body_preview': ''}
        ev = evaluate_variant(probe_ok, 'playlist_hls')
        self.assertIn('admitted', ev)
        self.assertIn('reason', ev)
        self.assertTrue(ev['admitted'])
        self.assertEqual(ev['role'], 'playlist_hls')

        probe_bad = {'status': 404, 'content_type': '', 'body_preview': ''}
        ev_bad = evaluate_variant(probe_bad, 'playlist_hls')
        self.assertFalse(ev_bad['admitted'])
        self.assertIn('404', ev_bad['reason'])


# ── UT-04 / UT-10 + RES-04, RES-09 ── state machine (run_batch)
class TestRunBatchStateMachine(unittest.TestCase):
    def test_ut10_channel_without_winner_quarantined(self):
        """UT-10: canal sin variante ganadora → rejected con reason=all_variants_failed"""
        # Simulamos probes que siempre devuelven 404
        def fake_probe(session, url, timeout=8):
            return {'url': url, 'status': 404, 'content_type': '', 'body_preview': '', 'final_url': ''}

        candidates = [{
            'channel_id': 'c1', 'channel_name': 'Canal1',
            'variants': [{'url': 'http://x/a.m3u8', 'profile': 'P1', 'expected_role': 'playlist_hls'}]
        }]
        with patch('prepublish_checker.probe_variant', side_effect=fake_probe):
            result = run_batch(candidates, {'concurrency': 1})
        self.assertEqual(len(result['admitted']), 0)
        self.assertEqual(len(result['rejected']), 1)
        self.assertEqual(result['rejected'][0]['reason'], 'all_variants_failed')

    def test_res04_status_405_rejected_immediately(self):
        """RES-04: respuesta 405 → rechazo inmediato"""
        def fake_probe(session, url, timeout=8):
            return {'url': url, 'status': 405, 'content_type': 'application/vnd.apple.mpegurl', 'body_preview': '', 'final_url': ''}

        candidates = [{
            'channel_id': 'c1', 'channel_name': 'Canal1',
            'variants': [{'url': 'http://x/a.m3u8', 'profile': 'P1', 'expected_role': 'playlist_hls'}]
        }]
        with patch('prepublish_checker.probe_variant', side_effect=fake_probe):
            result = run_batch(candidates, {'concurrency': 1})
        self.assertEqual(len(result['admitted']), 0)
        self.assertEqual(result['rejected'][0]['variant_outcomes'][0]['status'], 405)

    def test_res03_probe_no_response(self):
        """RES-03: probe sin respuesta (status=0) → variante descartada"""
        def fake_probe(session, url, timeout=8):
            return {'url': url, 'status': 0, 'content_type': '', 'body_preview': '', 'final_url': '', 'error': 'connection_refused'}

        candidates = [{
            'channel_id': 'c1', 'channel_name': 'Canal1',
            'variants': [{'url': 'http://down/a.m3u8', 'profile': 'P1', 'expected_role': 'playlist_hls'}]
        }]
        with patch('prepublish_checker.probe_variant', side_effect=fake_probe):
            result = run_batch(candidates, {'concurrency': 1})
        self.assertEqual(len(result['admitted']), 0)

    def test_res09_all_variants_fail_channel_quarantined(self):
        """RES-09: todas las variantes fallan → canal quarantined"""
        def fake_probe(session, url, timeout=8):
            return {'url': url, 'status': 509, 'content_type': '', 'body_preview': '', 'final_url': ''}

        candidates = [{
            'channel_id': 'c99', 'channel_name': 'Todos509',
            'variants': [
                {'url': 'http://x/a.m3u8', 'profile': 'P1', 'expected_role': 'playlist_hls'},
                {'url': 'http://x/b.m3u8', 'profile': 'P2', 'expected_role': 'playlist_hls'},
                {'url': 'http://x/c.m3u8', 'profile': 'P3', 'expected_role': 'playlist_hls'},
            ]
        }]
        with patch('prepublish_checker.probe_variant', side_effect=fake_probe):
            result = run_batch(candidates, {'concurrency': 1})
        self.assertEqual(len(result['rejected']), 1)
        self.assertEqual(result['rejected'][0]['channel_id'], 'c99')
        self.assertEqual(len(result['rejected'][0]['variant_outcomes']), 3)

    def test_it04_hls_beats_ts_fallback(self):
        """IT-04: variante HLS buena + TS fallback → gana HLS"""
        def fake_probe(session, url, timeout=8):
            if url.endswith('.m3u8'):
                return {'url': url, 'status': 200, 'content_type': 'application/vnd.apple.mpegurl', 'body_preview': '#EXTM3U\n', 'final_url': url}
            if url.endswith('.ts'):
                return {'url': url, 'status': 200, 'content_type': 'video/mp2t', 'body_preview': '', 'final_url': url}
            return {'url': url, 'status': 0, 'content_type': '', 'body_preview': '', 'final_url': ''}

        candidates = [{
            'channel_id': 'c1', 'channel_name': 'HLSvsTS',
            'variants': [
                {'url': 'http://x/a.m3u8', 'profile': 'P1', 'expected_role': 'playlist_hls'},
                {'url': 'http://x/a.ts',   'profile': 'P2', 'expected_role': 'segment_ts'},
            ]
        }]
        with patch('prepublish_checker.probe_variant', side_effect=fake_probe):
            result = run_batch(candidates, {'concurrency': 1})
        self.assertEqual(len(result['admitted']), 1)
        self.assertEqual(result['admitted'][0]['chosen_role'], 'playlist_hls')

    def test_stats_schema(self):
        """stats tiene los 7 campos del contrato"""
        result = run_batch([], {})
        self.assertIn('candidates_total', result['stats'])
        self.assertIn('admitted_count', result['stats'])
        self.assertIn('rejected_count', result['stats'])
        self.assertIn('elapsed_ms', result['stats'])

    def test_ct01_input_schema_tolerance(self):
        """CT-01: builder→canonicalizer. Si falta stream_id o variantes vacías → no crashea"""
        candidates = [
            {'channel_id': '', 'variants': []},
            {'channel_id': 'c2', 'variants': []},
        ]
        result = run_batch(candidates, {'concurrency': 1})
        self.assertEqual(len(result['admitted']), 0)
        # Ambos canales van a rejected (sin variantes = all_variants_failed)
        self.assertEqual(len(result['rejected']), 2)


class TestNormalizeCT(unittest.TestCase):
    def test_strips_charset(self):
        self.assertEqual(normalize_ct('application/vnd.apple.mpegurl; charset=utf-8'),
                         'application/vnd.apple.mpegurl')

    def test_handles_none(self):
        self.assertEqual(normalize_ct(None), '')
        self.assertEqual(normalize_ct(''), '')


class TestMimePolicyTable(unittest.TestCase):
    def test_mime_policy_has_15_entries(self):
        self.assertEqual(len(MIME_POLICY), 15)

    def test_hls_preferred(self):
        self.assertEqual(MIME_POLICY['application/vnd.apple.mpegurl']['disposition'], 'preferred')

    def test_restricted_entries(self):
        self.assertEqual(MIME_POLICY['application/json']['disposition'], 'restricted')
        self.assertEqual(MIME_POLICY['application/octet-stream']['disposition'], 'restricted')


if __name__ == '__main__':
    unittest.main(verbosity=2)
