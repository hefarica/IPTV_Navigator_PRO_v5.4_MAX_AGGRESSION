"""
Prometheus Exporter — Exposes guardian metrics on :8767/metrics.
"""

import logging
from typing import Optional

logger = logging.getLogger('ape-guardian.prometheus')

try:
    from prometheus_client import Gauge, Counter, start_http_server, REGISTRY
    HAS_PROMETHEUS = True
except ImportError:
    HAS_PROMETHEUS = False
    logger.warning('prometheus_client not available — metrics endpoint disabled')


class PrometheusExporter:
    """Exposes guardian metrics via Prometheus HTTP endpoint."""

    def __init__(self, port: int = 8767, enabled: bool = True):
        self._port = port
        self._enabled = enabled and HAS_PROMETHEUS
        self._started = False

        if self._enabled:
            # Gauges
            self.demand_mbps = Gauge('ape_guardian_demand_mbps',
                                     'Current computed demand in Mbps')
            self.target_mbps = Gauge('ape_guardian_target_mbps',
                                     'Target bitrate in Mbps')
            self.buffer_percent = Gauge('ape_guardian_buffer_percent',
                                        'Player buffer level in percent')
            self.accumulated_deficit = Gauge('ape_guardian_accumulated_deficit_mbps',
                                             'Accumulated bitrate deficit')
            self.vps_protection_factor = Gauge('ape_guardian_vps_protection_factor',
                                               'VPS protection multiplier 0-1')
            self.cpu_percent = Gauge('ape_guardian_vps_cpu_percent',
                                     'VPS CPU utilization')
            self.ram_percent = Gauge('ape_guardian_vps_ram_percent',
                                     'VPS RAM utilization')
            self.net_mbps = Gauge('ape_guardian_vps_net_mbps',
                                  'VPS network throughput')
            self.cycle_latency_ms = Gauge('ape_guardian_cycle_latency_ms',
                                          'Time for one complete cycle')
            self.probe_latency_ms = Gauge('ape_guardian_probe_latency_ms',
                                          'Total probe collection time')

            # Counters
            self.cycles_total = Counter('ape_guardian_cycles_total',
                                        'Total decision cycles executed')
            self.state_transitions = Counter('ape_guardian_state_transitions_total',
                                             'Buffer state transitions',
                                             ['from_state', 'to_state'])
            self.clamp_events = Counter('ape_guardian_clamp_events_total',
                                        'Demand clamping events',
                                        ['direction'])

    def start(self) -> None:
        """Start the HTTP metrics server."""
        if not self._enabled or self._started:
            return

        try:
            start_http_server(self._port)
            self._started = True
            logger.info(f'Prometheus metrics server started on :{self._port}')
        except Exception as e:
            logger.error(f'Failed to start Prometheus server: {e}')

    def update(self, decision: dict, metrics: dict) -> None:
        """Update all gauges from a decision cycle."""
        if not self._enabled:
            return

        self.demand_mbps.set(decision.get('final_demand_mbps', 0))
        self.target_mbps.set(decision.get('target_mbps', 0))
        self.buffer_percent.set(metrics.get('buffer_percent', 0))
        self.accumulated_deficit.set(decision.get('accumulated_deficit_mbps', 0))
        self.vps_protection_factor.set(decision.get('vps_protection_factor', 1.0))
        self.cpu_percent.set(metrics.get('cpu_percent', 0))
        self.ram_percent.set(metrics.get('ram_percent', 0))
        self.net_mbps.set(metrics.get('net_throughput_mbps', 0))

        self.cycles_total.inc()

        if decision.get('was_clamped_high'):
            self.clamp_events.labels(direction='high').inc()
        if decision.get('was_clamped_low'):
            self.clamp_events.labels(direction='low').inc()
