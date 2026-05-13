"""Tests for adapters."""

import sys
import os
import asyncio
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from ape_realtime_guardian.adapters.simulated import SimulatedAdapter


class TestSimulatedAdapter:
    """Tests for the day-1 simulated adapter."""

    def test_apply_returns_true(self):
        adapter = SimulatedAdapter()
        result = asyncio.run(adapter.apply(
            demand_mbps=25.0,
            state={'buffer_state': 'stable'},
            metrics={'buffer_percent': 90.0},
        ))
        assert result is True

    def test_name(self):
        adapter = SimulatedAdapter()
        assert adapter.name == 'simulated'


if __name__ == '__main__':
    import pytest
    pytest.main([__file__, '-v'])
