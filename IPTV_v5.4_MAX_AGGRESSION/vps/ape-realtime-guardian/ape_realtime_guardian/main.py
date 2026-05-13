"""
APE Real-Time Bitrate Guardian — Main Daemon Entry Point.

Asyncio event loop running at 1Hz cadence.
Signals: SIGHUP=reload config, SIGTERM=clean shutdown.

Usage:
    python -m ape_realtime_guardian.main --config /path/to/config.yaml
    python -m ape_realtime_guardian.main --config config.yaml --once  # single cycle
"""

import argparse
import asyncio
import json
import logging
import os
import signal
import sys
import time
from dataclasses import asdict
from typing import Optional

from . import __version__
from .config_manager import ConfigManager
from .state_persistence import StatePersistence
from .metrics_collector import MetricsCollector
from .probes.server_side import ServerSideProbe
from .probes.adb_player import ADBPlayerProbe
from .buffer_analyzer import BufferStateAnalyzer
from .moving_average_deficit import MovingAverageDeficitEngine
from .vps_protection import VPSProtectionEngine, VPSMetrics
from .decision_engine import DemandDecisionEngine
from .recommended_action import RecommendedActionEngine
from .audit_logger import AuditLogger
from .prometheus_exporter import PrometheusExporter
from .adapters.simulated import SimulatedAdapter
from .adapters.shm_write import SHMWriteAdapter
from .adapters.quantum_signal import QuantumSignalAdapter
from .adapters.nginx_lua import NginxLuaAdapter

logger = logging.getLogger('ape-guardian')

# Zap Burst Floors — aggressive demand during zap grace to fill buffer fast
# Maps resolution label (from ADB probe) → burst floor in Mbps
ZAP_BURST_FLOORS = {
    'SD':      20.0,   # 480p
    '480p':    20.0,
    'HD':      30.0,   # 720p
    '720p':    30.0,
    'FHD':     40.0,   # 1080p
    '1080p':   40.0,
    '4K':      60.0,   # 2160p
    '2160p':   60.0,
    'UHD':     60.0,
    '8K':      60.0,   # 4320p — same as 4K for now
    '4320p':   60.0,
    'unknown': 30.0,   # default: assume HD-level burst
}


# Absolute minimum bitrate floors per resolution (Mbps)
# The system MUST NEVER let demand fall below these, regardless of profile config.
# These are the CASCADE BASE values — cascade_factor applies on TOP of these.
RESOLUTION_MINIMUM_FLOORS = {
    'SD':      3.0,    # 480p — minimum 3 Mbps
    '480p':    3.0,
    'HD':      5.0,    # 720p — minimum 5 Mbps
    '720p':    5.0,
    'FHD':     8.0,    # 1080p — minimum 8 Mbps
    '1080p':   8.0,
    '4K':      13.0,   # 2160p — minimum 13 Mbps (NEVER below this)
    '2160p':   13.0,
    'UHD':     13.0,
    '8K':      13.0,   # 4320p — same as 4K
    '4320p':   13.0,
    'unknown': 5.0,    # default: assume HD-level minimum
}


# ── PRISMA Boost ─────────────────────────────────────────────────────────
# When PRISMA master_enabled=true in /dev/shm/prisma_state.json:
#   - All bitrate floors × 1.5 (50% boost)
#   - Zap burst floors × 1.5
#   - Zap grace period = 30s (vs normal 5s)
# This fills buffers aggressively to match post-processing quality demands.
PRISMA_STATE_PATH = '/dev/shm/prisma_state.json'
PRISMA_BOOST_MULT = 1.5       # +50% bitrate floor
PRISMA_ZAP_GRACE_S = 30.0     # 30s aggressive recovery post-zap
PRISMA_CHECK_INTERVAL = 5     # Re-read state every N cycles (not every 1Hz)


def _read_prisma_active() -> bool:
    """Read PRISMA master state from shared memory. Non-blocking, fail-safe."""
    try:
        if os.path.isfile(PRISMA_STATE_PATH):
            with open(PRISMA_STATE_PATH, 'r') as f:
                state = json.load(f)
            return bool(state.get('master_enabled', False))
    except Exception:
        pass
    return False


class GuardianDaemon:
    """Main daemon orchestrating the 1Hz control loop."""

    def __init__(self, config_path: str, run_once: bool = False):
        self._config_path = config_path
        self._run_once = run_once
        self._running = False
        self._cm: Optional[ConfigManager] = None
        self._prisma_active: bool = False
        self._prisma_check_counter: int = 0

    async def run(self) -> int:
        """Main entry point. Returns exit code."""
        # Load config
        self._cm = ConfigManager(self._config_path)
        cfg = self._cm.config

        # Setup logging
        self._setup_logging(cfg.service.log_dir)
        logger.info(f'APE Real-Time Bitrate Guardian v{__version__} starting...')
        logger.info(f'dry_run={cfg.service.dry_run}, adapter={cfg.adapter.mode}, '
                    f'interval={cfg.service.interval_seconds}s')

        # Initialize components
        state_mgr = StatePersistence(cfg.service.state_persistence_path)
        state_mgr.load()



        buffer_analyzer = BufferStateAnalyzer(
            stable_min=cfg.buffer_thresholds.stable_min,
            preventive_min=cfg.buffer_thresholds.preventive_min,
            recovery_min=cfg.buffer_thresholds.recovery_min,
            aggressive_min=cfg.buffer_thresholds.aggressive_min,
            critical_min=cfg.buffer_thresholds.critical_min,
        )

        # Phase B: MA-driven deficit engine (replaces DeficitCalc + Predictive)
        ma_engine = MovingAverageDeficitEngine(
            window_size=5,
            zap_grace=5,
        )

        vps_engine = VPSProtectionEngine(
            max_cpu_percent=cfg.vps_limits.max_cpu_percent,
            max_ram_percent=cfg.vps_limits.max_ram_percent,
            max_net_mbps=cfg.vps_limits.max_net_mbps,
            max_load_1m=cfg.vps_limits.max_load_1m,
            max_disk_io_percent=cfg.vps_limits.max_disk_io_percent,
        )

        decision_engine = DemandDecisionEngine(
            min_demand_mbps=cfg.service.min_demand_mbps,
            max_safe_demand_mbps=cfg.service.max_safe_demand_mbps,
        )

        # Phase A: Predictive floor-enforcement state machine (PDFs 1+2+3)
        rec_action_engine = RecommendedActionEngine()

        # Build probes
        probes = []
        if cfg.probes.server_side_enabled:
            probes.append(ServerSideProbe())
        if cfg.probes.adb_enabled:
            devices = [
                {'name': d.name, 'adb_address': d.adb_address, 'player': d.player}
                for d in cfg.probes.devices
            ]
            probes.append(ADBPlayerProbe(
                devices=devices,
                connect_timeout_s=cfg.probes.adb_connect_timeout_s,
                command_timeout_s=cfg.probes.adb_command_timeout_s,
                reconnect_backoff_max_s=cfg.probes.adb_reconnect_backoff_max_s,
                patterns=cfg.probes.exoplayer_patterns,
            ))

        collector = MetricsCollector(probes)

        # Build adapter
        adapter = self._build_adapter(cfg)

        # Audit + Prometheus
        audit = AuditLogger(cfg.service.log_dir, cfg.service.audit_log_file)
        audit.open()

        prometheus = PrometheusExporter(
            port=cfg.service.prometheus_port,
            enabled=cfg.service.prometheus_enabled,
        )
        prometheus.start()

        # Signal handlers (platform-safe: Windows doesn't support add_signal_handler)
        self._running = True
        loop = asyncio.get_event_loop()

        try:
            if hasattr(signal, 'SIGHUP'):
                loop.add_signal_handler(signal.SIGHUP, lambda: self._cm.reload())
            if hasattr(signal, 'SIGTERM'):
                loop.add_signal_handler(signal.SIGTERM, self._shutdown)
            if hasattr(signal, 'SIGINT'):
                loop.add_signal_handler(signal.SIGINT, self._shutdown)
        except NotImplementedError:
            # Windows: signals handled via KeyboardInterrupt instead
            logger.info('Signal handlers not available (Windows) — using KeyboardInterrupt')

        # Main loop
        cycle = state_mgr.state.cycle_count
        last_buffer_state = state_mgr.state.last_buffer_state

        try:
            while self._running:
                cycle_start = time.monotonic()
                cycle += 1

                try:
                    # 1. Collect metrics
                    metrics = await collector.collect()

                    # 1.5 PRISMA boost check (every N cycles)
                    self._prisma_check_counter += 1
                    if self._prisma_check_counter >= PRISMA_CHECK_INTERVAL:
                        self._prisma_check_counter = 0
                        was_active = self._prisma_active
                        self._prisma_active = _read_prisma_active()
                        if self._prisma_active != was_active:
                            logger.info(f'PRISMA boost: {"ACTIVE (+50% floors, 30s grace)" if self._prisma_active else "OFF (normal floors)"}')

                    # 2. MA engine (consumes actual_mbps + floor_kbps + zap_detected)
                    profile_floor_mbps = float(getattr(metrics, 'bitrate_floor_kbps', 0)) / 1000.0
                    res_label = getattr(metrics, 'resolution', 'unknown')
                    # Enforce absolute minimum floor per resolution
                    resolution_min = RESOLUTION_MINIMUM_FLOORS.get(
                        res_label, RESOLUTION_MINIMUM_FLOORS['unknown'])
                    floor_mbps = max(profile_floor_mbps, resolution_min)
                    burst_floor = ZAP_BURST_FLOORS.get(res_label, ZAP_BURST_FLOORS['unknown'])

                    # ── PRISMA Boost: +50% floors + 30s zap grace ──
                    if self._prisma_active:
                        floor_mbps *= PRISMA_BOOST_MULT
                        burst_floor *= PRISMA_BOOST_MULT
                        ma_engine._zap_grace_max = int(PRISMA_ZAP_GRACE_S)
                    else:
                        ma_engine._zap_grace_max = 5  # Default

                    ma_result = ma_engine.compute(
                        actual_mbps=metrics.actual_bitrate_mbps,
                        floor_mbps=floor_mbps,
                        zap_detected=metrics.zap_detected,
                        zap_burst_floor_mbps=burst_floor,
                    )

                    # 3. Buffer analysis (telemetry only — not in demand formula)
                    buffer = buffer_analyzer.analyze(metrics.buffer_percent)

                    # 4. VPS protection
                    vps_metrics = VPSMetrics(
                        cpu_percent=metrics.cpu_percent,
                        ram_percent=metrics.ram_percent,
                        net_throughput_mbps=metrics.net_throughput_mbps,
                        load_1m=metrics.load_1m,
                        disk_io_percent=metrics.disk_io_percent,
                    )
                    vps_protection = vps_engine.evaluate(vps_metrics)

                    # 5. Final demand (MA + vps_factor + clamp)
                    decision = decision_engine.compute(
                        ma_result=ma_result,
                        vps_protection=vps_protection,
                    )

                    # 6. RecommendedAction (Phase A) — slope now from MA engine
                    rec_result = rec_action_engine.evaluate(
                        actual_mbps=metrics.actual_bitrate_mbps,
                        floor_kbps=getattr(metrics, 'bitrate_floor_kbps', 0),
                        slope_mbps_per_s=ma_result.slope_mbps_s,
                        dt_s=cfg.service.interval_seconds,
                    )

                    # 7. Apply via adapter (if not dry_run)
                    adapter_ok = True
                    if not cfg.service.dry_run:
                        adapter_ok = await adapter.apply(
                            decision.final_demand_mbps,
                            state={
                                'zap_active': decision.zap_active,
                                'vps_protection_factor': decision.vps_protection_factor,
                                'ma_5s': decision.ma_5s,
                            },
                            metrics={
                                'buffer_percent': metrics.buffer_percent,
                                'cpu_percent': metrics.cpu_percent,
                                'net_throughput_mbps': metrics.net_throughput_mbps,
                            },
                        )
                    else:
                        await SimulatedAdapter().apply(
                            decision.final_demand_mbps,
                            state={'zap_active': decision.zap_active},
                            metrics={'buffer_percent': metrics.buffer_percent},
                        )

                    # 8. Audit log
                    cycle_time = (time.monotonic() - cycle_start) * 1000
                    audit_entry = {
                        'cycle': cycle,
                        'demand_mbps': round(decision.final_demand_mbps, 2),
                        'demand_raw_mbps': round(decision.demand_raw_mbps, 2),
                        'actual_mbps': round(metrics.actual_bitrate_mbps, 2),
                        # MA engine telemetry
                        'ma_5s': round(decision.ma_5s, 2),
                        'ma_def': round(decision.ma_def, 2),
                        'floor_def': round(decision.floor_def, 2),
                        'slope_mbps_s': round(decision.slope_mbps_s, 3),
                        'zap_active': decision.zap_active,
                        'zap_grace_remaining': decision.zap_grace_remaining,
                        'zap_burst_floor': round(decision.zap_burst_floor_mbps, 1),
                        # Cascade burst
                        'cascade_mult': decision.cascade_multiplier,
                        'cascade_floor': round(decision.cascade_floor_mbps, 1),
                        'cascade_on': decision.cascade_active,
                        # PRISMA boost
                        'prisma_active': self._prisma_active,
                        'prisma_boost_mult': PRISMA_BOOST_MULT if self._prisma_active else 1.0,
                        'prisma_zap_grace': PRISMA_ZAP_GRACE_S if self._prisma_active else 5.0,
                        # Zap detection (from probe)
                        'zap_detected': metrics.zap_detected,
                        'zap_reason': metrics.zap_reason,
                        # Resolution / floor
                        'res': getattr(metrics, 'resolution', 'unknown'),
                        'codec': getattr(metrics, 'codec', 'unknown'),
                        'hw': getattr(metrics, 'decoder_type', 'unknown'),
                        'floor_kbps': getattr(metrics, 'bitrate_floor_kbps', 0),
                        'floor_mbps': round(floor_mbps, 1),  # effective floor (max of profile + resolution min)
                        'floor_viol': getattr(metrics, 'bitrate_floor_violation', False),
                        # RecommendedAction (Phase A)
                        'rec_action': rec_result.action.value,
                        'rec_reason': rec_result.reason,
                        'slope_pct_min': round(rec_result.slope_pct_per_min, 2),
                        # VPS
                        'vps_factor': decision.vps_protection_factor,
                        'cpu': round(metrics.cpu_percent, 1),
                        'ram': round(metrics.ram_percent, 1),
                        'net': round(metrics.net_throughput_mbps, 1),
                        # Misc
                        'clamped': 'high' if decision.was_clamped_high else
                                   ('low' if decision.was_clamped_low else 'no'),
                        'adapter': adapter.name,
                        'adapter_ok': adapter_ok,
                        'dry_run': cfg.service.dry_run,
                        'buffer_src': metrics.buffer_source,
                        'buffer_pct': round(metrics.buffer_percent, 1),
                        'cycle_ms': round(cycle_time, 1),
                        'probe_ms': round(metrics.total_latency_ms, 1),
                    }
                    audit.log(audit_entry)

                    # 9. Prometheus
                    prometheus.update(
                        decision=asdict(decision) if hasattr(decision, '__dataclass_fields__') else {},
                        metrics={
                            'buffer_percent': metrics.buffer_percent,
                            'cpu_percent': metrics.cpu_percent,
                            'ram_percent': metrics.ram_percent,
                            'net_throughput_mbps': metrics.net_throughput_mbps,
                        },
                    )
                    prometheus.cycle_latency_ms.set(cycle_time) if hasattr(prometheus, 'cycle_latency_ms') else None
                    prometheus.probe_latency_ms.set(metrics.total_latency_ms) if hasattr(prometheus, 'probe_latency_ms') else None

                    # 10. Track state transitions (buffer state — telemetry only)
                    if buffer.state.value != last_buffer_state:
                        logger.info(f'Buffer state: {last_buffer_state} -> {buffer.state.value}')
                        if hasattr(prometheus, 'state_transitions'):
                            prometheus.state_transitions.labels(
                                from_state=last_buffer_state,
                                to_state=buffer.state.value,
                            ).inc()
                        last_buffer_state = buffer.state.value

                    # 11. Persist state
                    state_mgr.update(
                        last_buffer_percent=metrics.buffer_percent,
                        last_demand_mbps=decision.final_demand_mbps,
                        last_buffer_state=buffer.state.value,
                        cycle_count=cycle,
                        buffer_source=metrics.buffer_source,
                    )

                    if cycle % 60 == 0:  # Save to disk every 60 cycles
                        state_mgr.save()

                except Exception as e:
                    logger.error(f'Cycle {cycle} error: {e}', exc_info=True)

                if self._run_once:
                    break

                # Drift-corrected sleep — adaptive interval
                # Emergency mode: 0.5s when bitrate collapses (< 3 Mbps)
                # Normal mode: configured interval (default 1s)
                EMERGENCY_INTERVAL = 0.5
                EMERGENCY_BITRATE_THRESHOLD = 3.0  # Mbps
                base_interval = cfg.service.interval_seconds
                # Emergency 0.5s: bitrate collapsed OR cascade active (dropping)
                if (metrics.actual_bitrate_mbps < EMERGENCY_BITRATE_THRESHOLD
                        or decision.cascade_active):
                    base_interval = EMERGENCY_INTERVAL
                elapsed = time.monotonic() - cycle_start
                sleep_time = max(0.05, base_interval - elapsed)
                await asyncio.sleep(sleep_time)

        finally:
            logger.info('Shutting down...')
            state_mgr.save()
            audit.close()
            await collector.close()
            await adapter.close()
            logger.info(f'Guardian stopped after {cycle} cycles.')

        return 0

    def _shutdown(self) -> None:
        """Handle SIGTERM/SIGINT."""
        logger.info('Received shutdown signal')
        self._running = False

    def _build_adapter(self, cfg):
        """Build the appropriate adapter based on config."""
        mode = cfg.adapter.mode
        if mode == 'shm_write':
            return SHMWriteAdapter(cfg.adapter.shm_output_path)
        elif mode == 'quantum_signal':
            return QuantumSignalAdapter(cfg.adapter.quantum_directives_path)
        elif mode == 'nginx_lua':
            return NginxLuaAdapter(cfg.adapter.nginx_lua_endpoint)
        else:
            return SimulatedAdapter()

    def _setup_logging(self, log_dir: str) -> None:
        """Configure logging to both file and stdout."""
        import os
        os.makedirs(log_dir, exist_ok=True)

        root = logging.getLogger('ape-guardian')
        root.setLevel(logging.DEBUG)

        # Console handler
        ch = logging.StreamHandler(sys.stdout)
        ch.setLevel(logging.INFO)
        ch.setFormatter(logging.Formatter(
            '%(asctime)s [%(levelname)s] %(name)s: %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        ))
        root.addHandler(ch)

        # File handler
        fh = logging.FileHandler(
            os.path.join(log_dir, 'guardian.log'),
            encoding='utf-8',
        )
        fh.setLevel(logging.DEBUG)
        fh.setFormatter(logging.Formatter(
            '%(asctime)s [%(levelname)s] %(name)s: %(message)s',
            datefmt='%Y-%m-%dT%H:%M:%S'
        ))
        root.addHandler(fh)


def main():
    parser = argparse.ArgumentParser(
        description='APE Real-Time Bitrate Guardian — 1Hz demand controller'
    )
    parser.add_argument('--config', '-c', required=True,
                        help='Path to config.yaml')
    parser.add_argument('--once', action='store_true',
                        help='Run single cycle and exit (for testing)')
    args = parser.parse_args()

    daemon = GuardianDaemon(args.config, run_once=args.once)
    exit_code = asyncio.run(daemon.run())
    sys.exit(exit_code)


if __name__ == '__main__':
    main()
