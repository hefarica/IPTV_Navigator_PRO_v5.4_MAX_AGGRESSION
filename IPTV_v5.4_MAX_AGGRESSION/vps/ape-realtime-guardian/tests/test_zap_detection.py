"""Tests for zap detection inside ADBPlayerProbe — pid/codec/resolution change + heuristic."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from ape_realtime_guardian.probes.adb_player import detect_zap


class TestZapDetection:
    """TDD tests for zap detection logic."""

    def test_first_observation_no_zap(self):
        """No prior state -> no zap."""
        zap, reason = detect_zap(
            current={'pid': '5526', 'codec': 'hevc', 'resolution': '4K', 'bitrate_kbps': 6000},
            last={},
            bitrate_history=[],
        )
        assert zap is False
        assert reason == ''

    def test_pid_change_emits_zap(self):
        """Different PID = new decoder spawned = new channel."""
        zap, reason = detect_zap(
            current={'pid': '5527', 'codec': 'hevc', 'resolution': '4K', 'bitrate_kbps': 6000},
            last={'pid': '5526', 'codec': 'hevc', 'resolution': '4K', 'bitrate_kbps': 7000},
            bitrate_history=[7.0, 7.0, 7.0],
        )
        assert zap is True
        assert reason == 'pid_change'

    def test_codec_change_emits_zap(self):
        """avc -> hevc = different stream profile."""
        zap, reason = detect_zap(
            current={'pid': '5526', 'codec': 'avc', 'resolution': '4K', 'bitrate_kbps': 5000},
            last={'pid': '5526', 'codec': 'hevc', 'resolution': '4K', 'bitrate_kbps': 6000},
            bitrate_history=[6.0, 6.0, 6.0],
        )
        assert zap is True
        assert reason == 'codec_change'

    def test_resolution_change_emits_zap(self):
        """4K -> FHD = different channel quality."""
        zap, reason = detect_zap(
            current={'pid': '5526', 'codec': 'hevc', 'resolution': 'FHD', 'bitrate_kbps': 4000},
            last={'pid': '5526', 'codec': 'hevc', 'resolution': '4K', 'bitrate_kbps': 6000},
            bitrate_history=[6.0, 6.0, 6.0],
        )
        assert zap is True
        assert reason == 'resolution_change'

    def test_no_change_no_zap(self):
        """Identical pid/codec/resolution -> no zap, just normal cycle."""
        zap, reason = detect_zap(
            current={'pid': '5526', 'codec': 'hevc', 'resolution': '4K', 'bitrate_kbps': 6500},
            last={'pid': '5526', 'codec': 'hevc', 'resolution': '4K', 'bitrate_kbps': 6000},
            bitrate_history=[6.0, 6.0, 6.5],
        )
        assert zap is False
        assert reason == ''

    def test_bitrate_collapse_heuristic_emits_zap(self):
        """Bitrate >1.0 then <0.1 sustained 2s (2 cycles at 1Hz) -> heuristic zap."""
        zap, reason = detect_zap(
            current={'pid': '5526', 'codec': 'hevc', 'resolution': '4K', 'bitrate_kbps': 50},  # 0.05 Mbps
            last={'pid': '5526', 'codec': 'hevc', 'resolution': '4K', 'bitrate_kbps': 80},  # 0.08 Mbps
            bitrate_history=[8.0, 0.05, 0.05],  # was 8 Mbps, now collapsed for 2 cycles
        )
        assert zap is True
        assert reason == 'bitrate_collapse'

    def test_bitrate_dip_below_2s_no_zap(self):
        """Single cycle at <0.1 Mbps (not sustained 2s) -> no heuristic trigger."""
        zap, reason = detect_zap(
            current={'pid': '5526', 'codec': 'hevc', 'resolution': '4K', 'bitrate_kbps': 50},
            last={'pid': '5526', 'codec': 'hevc', 'resolution': '4K', 'bitrate_kbps': 8000},
            bitrate_history=[8.0, 0.05],  # only 1 collapsed sample
        )
        assert zap is False
        assert reason == ''
