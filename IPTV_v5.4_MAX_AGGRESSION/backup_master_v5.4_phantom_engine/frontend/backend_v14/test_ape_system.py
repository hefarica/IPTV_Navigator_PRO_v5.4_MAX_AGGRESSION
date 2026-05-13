import json
import unittest
from hls_rewriter import HLSRewriter
from buffer_optimizer import BufferOptimizer
from telemetry_core import TelemetryCore

class TestAPESystem(unittest.TestCase):
    """
    Suite de Pruebas Unitarias para APE v14 SUPREME.
    Valida los componentes de reescritura, caching y telemetría.
    """
    
    def setUp(self):
        self.proxy_url = "http://localhost:8080"
        self.rewriter = HLSRewriter(self.proxy_url)
        self.optimizer = BufferOptimizer()
        self.telemetry = TelemetryCore(window_size_samples=10)

    def test_manifest_rewriting(self):
        """Valida que el reescritor convierta URLs y añada tags APE"""
        original_m3u8 = "#EXTM3U\n#EXT-X-TARGETDURATION:6\nsegment1.ts\n#EXTINF:6.0,\nsegment2.ts"
        origin_url = "http://origin.com/stream.m3u8"
        profile_config = {"level": "L3", "buffer_live": 2500, "buffer_vod": 12000}
        
        rewritten = self.rewriter.rewrite_manifest(
            original_m3u8, origin_url, "101", "P3", profile_config
        )
        
        self.assertIn("#EXT-X-APE-PROFILE:P3", rewritten)
        self.assertIn("#EXT-X-APE-BUFFER-LIVE:2500", rewritten)
        self.assertIn(f"{self.proxy_url}/segment?ch=101&profile=P3&uri=http://origin.com/segment1.ts", rewritten)
        self.assertIn("http://origin.com/segment2.ts", rewritten) # Caso simplificado

    def test_buffer_optimizer_detection(self):
        """Valida la detección de tipo de contenido LIVE/VOD"""
        live_m3u = "#EXTM3U\n#EXTINF:6,\nseg.ts"
        vod_m3u = "#EXTM3U\n#EXTINF:6,\nseg.ts\n#EXT-X-ENDLIST"
        
        self.assertEqual(self.optimizer.detect_content_type(live_m3u), 'LIVE')
        self.assertEqual(self.optimizer.detect_content_type(vod_m3u), 'VOD')

    def test_proactive_failover_trigger(self):
        """Valida que el failover se dispare ante condiciones degradadas"""
        # Caso 1: Todo normal
        self.telemetry.record_metrics(ttfb_ms=100, throughput_mbps=15)
        self.assertFalse(self.telemetry.should_failover(target_bitrate_mbps=8))
        
        # Caso 2: TTFB muy alto (> 800ms)
        for _ in range(10):
            self.telemetry.record_metrics(ttfb_ms=950, throughput_mbps=15)
        self.assertTrue(self.telemetry.should_failover(target_bitrate_mbps=8))

if __name__ == '__main__':
    unittest.main()
