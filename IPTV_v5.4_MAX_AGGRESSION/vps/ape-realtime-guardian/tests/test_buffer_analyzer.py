"""Tests for BufferStateAnalyzer — one test per state."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from ape_realtime_guardian.buffer_analyzer import BufferStateAnalyzer, BufferState


class TestBufferStateAnalyzer:
    """TDD tests for 6 buffer states."""

    def setup_method(self):
        self.analyzer = BufferStateAnalyzer()

    def test_stable_at_100_percent(self):
        result = self.analyzer.analyze(100.0)
        assert result.state == BufferState.STABLE
        assert result.factor == 1.0

    def test_stable_at_boundary(self):
        result = self.analyzer.analyze(80.0)
        assert result.state == BufferState.STABLE

    def test_preventive(self):
        result = self.analyzer.analyze(70.0)
        assert result.state == BufferState.PREVENTIVE
        assert result.factor == 1.1

    def test_recovery(self):
        result = self.analyzer.analyze(55.0)
        assert result.state == BufferState.RECOVERY
        assert result.factor == 1.3

    def test_aggressive(self):
        result = self.analyzer.analyze(35.0)
        assert result.state == BufferState.AGGRESSIVE
        assert result.factor == 1.6

    def test_critical(self):
        result = self.analyzer.analyze(15.0)
        assert result.state == BufferState.CRITICAL
        assert result.factor == 2.0

    def test_protection(self):
        result = self.analyzer.analyze(5.0)
        assert result.state == BufferState.PROTECTION
        assert result.factor == 0.5

    def test_protection_at_zero(self):
        result = self.analyzer.analyze(0.0)
        assert result.state == BufferState.PROTECTION

    def test_clamp_above_100(self):
        result = self.analyzer.analyze(150.0)
        assert result.state == BufferState.STABLE
        assert result.buffer_percent == 100.0

    def test_clamp_below_zero(self):
        result = self.analyzer.analyze(-10.0)
        assert result.state == BufferState.PROTECTION
        assert result.buffer_percent == 0.0


if __name__ == '__main__':
    import pytest
    pytest.main([__file__, '-v'])
