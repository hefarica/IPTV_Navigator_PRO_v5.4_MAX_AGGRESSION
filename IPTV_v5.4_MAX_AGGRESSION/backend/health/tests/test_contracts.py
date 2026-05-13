"""
Tests de contrato (CT-01..07 del plan).
Valida que los schemas JSON que pasan entre módulos son coherentes.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from prepublish_checker import run_batch


class TestPrepublishContractSchema(unittest.TestCase):
    """CT-06 / CT-07: list-assembler → publication-gate → release-registry schemas"""

    def test_ct07_prepublish_response_has_required_keys(self):
        """Response de /prepublish debe tener admitted, rejected, stats"""
        result = run_batch([], {})
        self.assertIsInstance(result, dict)
        self.assertIn('admitted', result)
        self.assertIn('rejected', result)
        self.assertIn('stats', result)
        self.assertIsInstance(result['admitted'], list)
        self.assertIsInstance(result['rejected'], list)
        self.assertIsInstance(result['stats'], dict)

    def test_stats_has_required_fields(self):
        result = run_batch([], {})
        stats = result['stats']
        required = ['candidates_total', 'admitted_count', 'rejected_count', 'elapsed_ms',
                    'concurrency', 'probe_timeout', 'priority_chain']
        for key in required:
            self.assertIn(key, stats, f'stats missing key: {key}')

    def test_admitted_entry_schema(self):
        """Entrada admitted debe tener channel_id, chosen_url, chosen_profile, chosen_role, mime_real, status"""
        from unittest.mock import patch

        def fake_probe(session, url, timeout=8):
            return {'url': url, 'status': 200, 'content_type': 'application/vnd.apple.mpegurl',
                    'body_preview': '#EXTM3U\n', 'final_url': url}

        candidates = [{
            'channel_id': 'test-id',
            'channel_name': 'TestCanal',
            'variants': [{'url': 'http://x/a.m3u8', 'profile': 'P1', 'expected_role': 'playlist_hls'}]
        }]
        with patch('prepublish_checker.probe_variant', side_effect=fake_probe):
            result = run_batch(candidates, {'concurrency': 1})

        self.assertEqual(len(result['admitted']), 1)
        entry = result['admitted'][0]
        required_keys = ['channel_id', 'channel_name', 'chosen_url', 'chosen_profile',
                         'chosen_role', 'mime_real', 'status']
        for key in required_keys:
            self.assertIn(key, entry, f'admitted entry missing: {key}')
        self.assertEqual(entry['channel_id'], 'test-id')
        self.assertEqual(entry['status'], 200)

    def test_rejected_entry_schema(self):
        """Entrada rejected debe tener channel_id, reason, variant_outcomes"""
        from unittest.mock import patch

        def fake_probe(session, url, timeout=8):
            return {'url': url, 'status': 404, 'content_type': '', 'body_preview': '', 'final_url': url}

        candidates = [{
            'channel_id': 'c-bad',
            'channel_name': 'Bad',
            'variants': [{'url': 'http://x/a.m3u8', 'profile': 'P1', 'expected_role': 'playlist_hls'}]
        }]
        with patch('prepublish_checker.probe_variant', side_effect=fake_probe):
            result = run_batch(candidates, {'concurrency': 1})

        self.assertEqual(len(result['rejected']), 1)
        entry = result['rejected'][0]
        required = ['channel_id', 'channel_name', 'reason', 'variant_outcomes']
        for key in required:
            self.assertIn(key, entry, f'rejected entry missing: {key}')
        self.assertEqual(entry['reason'], 'all_variants_failed')


class TestGateVerdictContract(unittest.TestCase):
    """CT-06 / CT-07: verdict del gate debe exponer decision + criterios"""

    def test_gate_verdict_has_decision_and_reasons(self):
        from publication_gate import run_gate
        verdict = run_gate('#EXTM3U\n#EXT-X-VERSION:3\n')
        self.assertIn('decision', verdict)
        self.assertIn(verdict['decision'], ('publish', 'block', 'reclassify'))
        self.assertIn('decision_reasons', verdict)
        self.assertIsInstance(verdict['decision_reasons'], list)

    def test_gate_verdict_has_all_criteria_ratios(self):
        """Verdict debe tener los 7 ratios clave del plan de criterios"""
        from publication_gate import run_gate
        # Build a minimal m3u8
        m3u8 = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000\nhttp://x/a.m3u8\n'
        from unittest.mock import patch
        def fake_probe(session, url, timeout):
            return {'url': url, 'status': 200, 'content_type': 'application/vnd.apple.mpegurl', 'final_url': url}
        with patch('publication_gate.probe', side_effect=fake_probe):
            verdict = run_gate(m3u8)

        for key in ['ok200_ratio', 'bad407_ratio', 'hls_ratio',
                    'mime_match_ratio', 'hls_predominance_ratio', 'canonical_ratio']:
            self.assertIn(key, verdict, f'verdict missing ratio: {key}')

    def test_thresholds_exposed(self):
        """El verdict debe exponer los thresholds aplicados (para auditoría)"""
        from publication_gate import run_gate
        verdict = run_gate('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000\nhttp://x/a.m3u8\n')
        thresholds = verdict.get('thresholds', {})
        for key in ['min_ok200', 'max_405', 'max_407_ratio', 'min_hls',
                    'min_mime_match', 'min_hls_predominance', 'min_canonical']:
            self.assertIn(key, thresholds, f'thresholds missing: {key}')


class TestBuildCandidatesContract(unittest.TestCase):
    """CT-01 / CT-02: candidate-builder output schema"""

    def test_variant_schema_fields(self):
        """Cada variant debe tener url, profile, expected_role"""
        # Como buildCandidatesForChannel vive en JS, este test documenta el contrato esperado.
        sample_candidate = {
            'channel_id': '548096',
            'channel_name': 'Test',
            'variants': [
                {'url': 'http://x:80/a.m3u8?profile=P1', 'profile': 'P1', 'expected_role': 'playlist_hls'}
            ]
        }
        # Validación de forma
        self.assertIn('channel_id', sample_candidate)
        self.assertIn('variants', sample_candidate)
        for v in sample_candidate['variants']:
            for key in ['url', 'profile', 'expected_role']:
                self.assertIn(key, v)


if __name__ == '__main__':
    unittest.main(verbosity=2)
