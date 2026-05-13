"""Tests for VPSProtectionEngine — threshold and factor tests."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from ape_realtime_guardian.vps_protection import VPSProtectionEngine, VPSMetrics


class TestVPSProtectionEngine:
    """TDD tests for VPS resource protection."""

    def setup_method(self):
        self.engine = VPSProtectionEngine(
            max_cpu_percent=75.0,
            max_ram_percent=85.0,
            max_net_mbps=120.0,
            max_load_1m=2.5,
            max_disk_io_percent=80.0,
        )

    def test_healthy_vps_factor_1(self):
        """All resources below 80% of limits → factor = 1.0."""
        metrics = VPSMetrics(cpu_percent=30.0, ram_percent=40.0,
                             net_throughput_mbps=50.0, load_1m=1.0,
                             disk_io_percent=20.0)
        result = self.engine.evaluate(metrics)
        assert result.factor == 1.0
        assert result.is_stressed is False

    def test_cpu_at_80pct_limit(self):
        """CPU at 80% of limit (60/75) → factor = 0.7."""
        metrics = VPSMetrics(cpu_percent=60.0, ram_percent=40.0,
                             net_throughput_mbps=50.0, load_1m=1.0,
                             disk_io_percent=20.0)
        result = self.engine.evaluate(metrics)
        assert result.factor == 0.7
        assert result.worst_resource == 'cpu'

    def test_cpu_at_90pct_limit(self):
        """CPU at 90% of limit (67.5/75) → factor = 0.5."""
        metrics = VPSMetrics(cpu_percent=67.5, ram_percent=40.0,
                             net_throughput_mbps=50.0, load_1m=1.0,
                             disk_io_percent=20.0)
        result = self.engine.evaluate(metrics)
        assert result.factor == 0.5

    def test_cpu_above_limit(self):
        """CPU above limit → factor = 0.2 (emergency)."""
        metrics = VPSMetrics(cpu_percent=80.0, ram_percent=40.0,
                             net_throughput_mbps=50.0, load_1m=1.0,
                             disk_io_percent=20.0)
        result = self.engine.evaluate(metrics)
        assert result.factor == 0.2
        assert result.is_stressed is True

    def test_worst_resource_wins(self):
        """Multiple stressed resources → worst one determines factor."""
        metrics = VPSMetrics(cpu_percent=60.0,  # 80% of 75 → 0.7
                             ram_percent=80.0,  # 94% of 85 → 0.5
                             net_throughput_mbps=50.0, load_1m=1.0,
                             disk_io_percent=20.0)
        result = self.engine.evaluate(metrics)
        assert result.factor == 0.5
        assert result.worst_resource == 'ram'

    def test_net_stressed(self):
        """Network above limit."""
        metrics = VPSMetrics(cpu_percent=30.0, ram_percent=40.0,
                             net_throughput_mbps=130.0, load_1m=1.0,
                             disk_io_percent=20.0)
        result = self.engine.evaluate(metrics)
        assert result.factor == 0.2
        assert result.worst_resource == 'net'

    def test_load_stressed(self):
        """Load average above limit."""
        metrics = VPSMetrics(cpu_percent=30.0, ram_percent=40.0,
                             net_throughput_mbps=50.0, load_1m=3.0,
                             disk_io_percent=20.0)
        result = self.engine.evaluate(metrics)
        assert result.factor == 0.2
        assert result.worst_resource == 'load'

    def test_all_zero_metrics(self):
        """All zeros → healthy."""
        metrics = VPSMetrics()
        result = self.engine.evaluate(metrics)
        assert result.factor == 1.0


if __name__ == '__main__':
    import pytest
    pytest.main([__file__, '-v'])
