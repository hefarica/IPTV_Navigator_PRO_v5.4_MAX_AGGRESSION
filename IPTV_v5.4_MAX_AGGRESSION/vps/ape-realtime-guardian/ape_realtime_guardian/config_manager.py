"""
ConfigManager — Loads YAML config with SIGHUP hot-reload support.

Usage:
    cm = ConfigManager('/etc/ape-realtime-guardian/config.yaml')
    cfg = cm.config  # GuardianConfig dataclass

SIGHUP handler (registered by main.py):
    signal.signal(signal.SIGHUP, lambda s, f: cm.reload())
"""

import logging
import signal
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional

import yaml

logger = logging.getLogger('ape-guardian.config')


@dataclass
class DeviceConfig:
    """A single ADB-accessible device."""
    name: str = 'firestick'
    adb_address: str = '10.200.0.3:5555'
    player: str = 'ott_navigator'  # ott_navigator | tivimate
    poll_every_n_cycles: int = 2   # ADB is slow (~150ms), skip cycles


@dataclass
class ProbeConfig:
    """Probe subsystem settings."""
    server_side_enabled: bool = True
    adb_enabled: bool = True
    adb_connect_timeout_s: float = 5.0
    adb_command_timeout_s: float = 3.0
    adb_reconnect_backoff_max_s: float = 60.0
    devices: List[DeviceConfig] = field(default_factory=lambda: [
        DeviceConfig(name='firestick_cali', adb_address='10.200.0.3:5555'),
        DeviceConfig(name='onn4k_buga', adb_address='10.200.0.4:5555'),
    ])
    # Regex patterns for ExoPlayer logcat parsing (configurable per player)
    exoplayer_patterns: Dict[str, str] = field(default_factory=lambda: {
        'buffered_duration_us': r'bufferedDurationUs=(\d+)',
        'current_position_us': r'currentPositionUs=(\d+)',
        'dropped_frames': r'droppedFrames.*?count=(\d+)',
        'current_bitrate_kbps': r'(\d+)\s*Kbps',
        'audio_underruns': r'audioUnderruns=(\d+)',
    })


@dataclass
class BufferThresholds:
    """Buffer state analyzer thresholds (percent)."""
    stable_min: float = 80.0       # >= 80% → STABLE
    preventive_min: float = 65.0   # >= 65% → PREVENTIVE
    recovery_min: float = 50.0     # >= 50% → RECOVERY
    aggressive_min: float = 30.0   # >= 30% → AGGRESSIVE
    critical_min: float = 10.0     # >= 10% → CRITICAL
    # below 10% → PROTECTION


@dataclass
class VPSLimits:
    """VPS protection engine thresholds."""
    max_cpu_percent: float = 75.0
    max_ram_percent: float = 85.0
    max_net_mbps: float = 120.0       # Hetzner CPX21 has ~200Mbps
    max_load_1m: float = 2.5          # 3 vCPU → safe at 2.5
    max_disk_io_percent: float = 80.0


@dataclass
class AdapterConfig:
    """Speed injection adapter settings."""
    mode: str = 'simulated'  # simulated | shm_write | quantum_signal | nginx_lua
    shm_output_path: str = '/dev/shm/ape_bitrate_demand.json'
    quantum_directives_path: str = '/dev/shm/quantum_directives.json'
    nginx_lua_endpoint: str = 'http://127.0.0.1/internal/ape-demand'


@dataclass
class ServiceConfig:
    """Top-level service settings."""
    dry_run: bool = True               # Day-1 default: OBSERVE ONLY
    interval_seconds: float = 1.0      # 1Hz cadence
    max_safe_demand_mbps: float = 80.0 # Hard clamp (½ of RQ_MAX_BW=160)
    min_demand_mbps: float = 5.0       # Floor
    target_bitrate_mbps: float = 25.0  # Default target for active streams
    deficit_accumulation_max_factor: float = 3.0  # Max accumulated deficit = 3× target
    predictive_window_seconds: int = 10  # Rolling window for slope/jitter
    state_persistence_path: str = '/var/lib/ape-realtime-guardian/state.json'
    log_dir: str = '/var/log/ape-realtime-guardian'
    audit_log_file: str = 'audit.jsonl'
    prometheus_enabled: bool = True
    prometheus_port: int = 8767


@dataclass
class GuardianConfig:
    """Root configuration container."""
    service: ServiceConfig = field(default_factory=ServiceConfig)
    probes: ProbeConfig = field(default_factory=ProbeConfig)
    buffer_thresholds: BufferThresholds = field(default_factory=BufferThresholds)
    vps_limits: VPSLimits = field(default_factory=VPSLimits)
    adapter: AdapterConfig = field(default_factory=AdapterConfig)


class ConfigManager:
    """
    Manages YAML config lifecycle with SIGHUP hot-reload.

    Raises FileNotFoundError on initial load if config missing.
    On SIGHUP reload, logs errors but keeps previous config.
    """

    def __init__(self, config_path: str):
        self._path = Path(config_path)
        self._config: GuardianConfig = GuardianConfig()
        self.load()

    @property
    def config(self) -> GuardianConfig:
        return self._config

    def load(self) -> GuardianConfig:
        """Load config from YAML file. Returns parsed GuardianConfig."""
        if not self._path.exists():
            logger.warning(f'Config file not found: {self._path} — using defaults')
            self._config = GuardianConfig()
            return self._config

        try:
            with open(self._path, 'r') as f:
                raw = yaml.safe_load(f) or {}

            self._config = self._parse(raw)
            logger.info(f'Config loaded from {self._path} '
                        f'(dry_run={self._config.service.dry_run}, '
                        f'adapter={self._config.adapter.mode})')
        except Exception as e:
            logger.error(f'Failed to parse config: {e} — keeping previous config')

        return self._config

    def reload(self) -> GuardianConfig:
        """Hot-reload config (called on SIGHUP)."""
        logger.info('SIGHUP received — reloading config...')
        return self.load()

    def _parse(self, raw: dict) -> GuardianConfig:
        """Parse raw YAML dict into typed GuardianConfig."""
        cfg = GuardianConfig()

        # Service
        svc = raw.get('service', {})
        cfg.service = ServiceConfig(
            dry_run=svc.get('dry_run', True),
            interval_seconds=float(svc.get('interval_seconds', 1.0)),
            max_safe_demand_mbps=float(svc.get('max_safe_demand_mbps', 80.0)),
            min_demand_mbps=float(svc.get('min_demand_mbps', 5.0)),
            target_bitrate_mbps=float(svc.get('target_bitrate_mbps', 25.0)),
            deficit_accumulation_max_factor=float(svc.get('deficit_accumulation_max_factor', 3.0)),
            predictive_window_seconds=int(svc.get('predictive_window_seconds', 10)),
            state_persistence_path=svc.get('state_persistence_path',
                                           '/var/lib/ape-realtime-guardian/state.json'),
            log_dir=svc.get('log_dir', '/var/log/ape-realtime-guardian'),
            audit_log_file=svc.get('audit_log_file', 'audit.jsonl'),
            prometheus_enabled=svc.get('prometheus_enabled', True),
            prometheus_port=int(svc.get('prometheus_port', 8767)),
        )

        # Probes
        prb = raw.get('probes', {})
        devices_raw = prb.get('devices', [])
        devices = [
            DeviceConfig(
                name=d.get('name', f'device_{i}'),
                adb_address=d.get('adb_address', '10.200.0.3:5555'),
                player=d.get('player', 'ott_navigator'),
                poll_every_n_cycles=int(d.get('poll_every_n_cycles', 2)),
            )
            for i, d in enumerate(devices_raw)
        ] if devices_raw else ProbeConfig().devices

        cfg.probes = ProbeConfig(
            server_side_enabled=prb.get('server_side_enabled', True),
            adb_enabled=prb.get('adb_enabled', True),
            adb_connect_timeout_s=float(prb.get('adb_connect_timeout_s', 5.0)),
            adb_command_timeout_s=float(prb.get('adb_command_timeout_s', 3.0)),
            adb_reconnect_backoff_max_s=float(prb.get('adb_reconnect_backoff_max_s', 60.0)),
            devices=devices,
            exoplayer_patterns=prb.get('exoplayer_patterns',
                                       ProbeConfig().exoplayer_patterns),
        )

        # Buffer thresholds
        bt = raw.get('buffer_thresholds', {})
        cfg.buffer_thresholds = BufferThresholds(
            stable_min=float(bt.get('stable_min', 80.0)),
            preventive_min=float(bt.get('preventive_min', 65.0)),
            recovery_min=float(bt.get('recovery_min', 50.0)),
            aggressive_min=float(bt.get('aggressive_min', 30.0)),
            critical_min=float(bt.get('critical_min', 10.0)),
        )

        # VPS limits
        vl = raw.get('vps_limits', {})
        cfg.vps_limits = VPSLimits(
            max_cpu_percent=float(vl.get('max_cpu_percent', 75.0)),
            max_ram_percent=float(vl.get('max_ram_percent', 85.0)),
            max_net_mbps=float(vl.get('max_net_mbps', 120.0)),
            max_load_1m=float(vl.get('max_load_1m', 2.5)),
            max_disk_io_percent=float(vl.get('max_disk_io_percent', 80.0)),
        )

        # Adapter
        ad = raw.get('adapter', {})
        cfg.adapter = AdapterConfig(
            mode=ad.get('mode', 'simulated'),
            shm_output_path=ad.get('shm_output_path', '/dev/shm/ape_bitrate_demand.json'),
            quantum_directives_path=ad.get('quantum_directives_path',
                                           '/dev/shm/quantum_directives.json'),
            nginx_lua_endpoint=ad.get('nginx_lua_endpoint',
                                      'http://127.0.0.1/internal/ape-demand'),
        )

        return cfg
