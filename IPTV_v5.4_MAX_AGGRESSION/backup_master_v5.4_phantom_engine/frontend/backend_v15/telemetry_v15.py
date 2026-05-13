#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════════════
APE v15.0 ULTIMATE - Dual-Level Telemetry Core
Innovation: 100ms rolling window + 10s snapshot aggregation
═══════════════════════════════════════════════════════════════════════════════

LEVEL 1 - Rolling Window (100ms):
    - Buffer circular de últimas 10 muestras (1 segundo de historia)
    - Detección de micro-degradaciones antes de congelamiento visible
    - Predicción de fallos 2-3 segundos antes

LEVEL 2 - Snapshot (10s):
    - Métricas agregadas cada 10 segundos
    - Promedios, percentiles (p50, p90, p99) y desviación estándar
    - Tendencias para predicción de fallos

Autor: APE Team
Versión: 15.0.0-ULTIMATE
Fecha: 2026-01-02
"""

import time
import statistics
from collections import deque
from dataclasses import dataclass, asdict
from typing import Optional, Dict, List
import logging

logger = logging.getLogger(__name__)


@dataclass
class TelemetryMetrics:
    """Single telemetry sample"""
    timestamp: float
    latency_ms: float
    bandwidth_mbps: float
    packet_loss_pct: float
    buffer_health_pct: float
    cpu_pct: float = 0.0
    ram_available_mb: float = 0.0


@dataclass
class RollingStats:
    """Statistics from rolling window (100ms level)"""
    samples_count: int
    latency_current: float
    latency_avg: float
    latency_max: float
    bandwidth_current: float
    bandwidth_min: float
    bandwidth_avg: float
    packet_loss_current: float
    buffer_health_current: float
    trend: str  # "stable", "degrading", "improving"


@dataclass
class SnapshotStats:
    """Aggregated statistics (10s level)"""
    timestamp: float
    latency_avg: float
    latency_p50: float
    latency_p90: float
    latency_p99: float
    bandwidth_avg: float
    bandwidth_min: float
    packet_loss_avg: float
    freeze_count: int
    current_profile: str


class TelemetryV15:
    """
    Dual-Level Telemetry Engine for APE v15.0 ULTIMATE
    
    Provides predictive degradation detection through:
    - Rolling Window: 10 samples @ 100ms = 1 second of real-time data
    - Snapshot: Aggregated stats every 10 seconds for trends
    """
    
    def __init__(
        self,
        rolling_window_size: int = 10,  # 10 samples @ 100ms = 1s
        snapshot_interval_seconds: int = 10
    ):
        # Rolling Window (100ms level)
        self.rolling_window: deque = deque(maxlen=rolling_window_size)
        
        # Snapshot history (10s level)
        self.snapshot_history: List[SnapshotStats] = []
        self.last_snapshot_time: float = time.time()
        self.snapshot_interval = snapshot_interval_seconds
        
        # Failover detection thresholds
        self.thresholds = {
            'latency_critical_ms': 500,      # >500ms = critical
            'latency_warning_ms': 200,       # >200ms = warning
            'bandwidth_critical_mbps': 2.0,  # <2 Mbps = critical
            'bandwidth_warning_mbps': 5.0,   # <5 Mbps = warning
            'packet_loss_critical_pct': 5.0, # >5% = critical
            'packet_loss_warning_pct': 2.0,  # >2% = warning
            'buffer_critical_pct': 20,       # <20% = critical
            'buffer_warning_pct': 40,        # <40% = warning
        }
        
        # State tracking
        self.freeze_count: int = 0
        self.current_profile: str = "P2"
    
    def record_metrics(
        self,
        latency_ms: float,
        bandwidth_mbps: float,
        packet_loss_pct: float = 0.0,
        buffer_health_pct: float = 100.0,
        cpu_pct: float = 0.0,
        ram_available_mb: float = 0.0
    ):
        """
        Record a new telemetry sample (called every 100ms)
        
        Args:
            latency_ms: Current latency to CDN in milliseconds
            bandwidth_mbps: Current throughput in Mbps
            packet_loss_pct: Packet loss percentage
            buffer_health_pct: Buffer fill percentage (0-100)
            cpu_pct: CPU usage percentage
            ram_available_mb: Available RAM in MB
        """
        sample = TelemetryMetrics(
            timestamp=time.time(),
            latency_ms=latency_ms,
            bandwidth_mbps=bandwidth_mbps,
            packet_loss_pct=packet_loss_pct,
            buffer_health_pct=buffer_health_pct,
            cpu_pct=cpu_pct,
            ram_available_mb=ram_available_mb
        )
        
        self.rolling_window.append(sample)
        
        # Check if freeze detected (buffer < 10%)
        if buffer_health_pct < 10:
            self.freeze_count += 1
            logger.warning(f"🥶 Freeze detected! Count: {self.freeze_count}")
        
        # Check if snapshot needed (every 10s)
        if time.time() - self.last_snapshot_time >= self.snapshot_interval:
            self._create_snapshot()
    
    def get_rolling_stats(self) -> Optional[RollingStats]:
        """
        Get statistics from rolling window (100ms level)
        
        Returns:
            RollingStats or None if insufficient data
        """
        if len(self.rolling_window) < 3:
            return None
        
        samples = list(self.rolling_window)
        
        latencies = [s.latency_ms for s in samples]
        bandwidths = [s.bandwidth_mbps for s in samples]
        
        # Determine trend based on last 3 samples
        trend = self._calculate_trend(bandwidths[-3:])
        
        return RollingStats(
            samples_count=len(samples),
            latency_current=samples[-1].latency_ms,
            latency_avg=statistics.mean(latencies),
            latency_max=max(latencies),
            bandwidth_current=samples[-1].bandwidth_mbps,
            bandwidth_min=min(bandwidths),
            bandwidth_avg=statistics.mean(bandwidths),
            packet_loss_current=samples[-1].packet_loss_pct,
            buffer_health_current=samples[-1].buffer_health_pct,
            trend=trend
        )
    
    def get_snapshot_stats(self) -> Optional[SnapshotStats]:
        """Get most recent snapshot (10s level)"""
        if not self.snapshot_history:
            return None
        return self.snapshot_history[-1]
    
    def should_failover(self, target_bitrate_mbps: float) -> tuple[bool, str]:
        """
        Determines if failover should be triggered based on telemetry
        
        This is the core decision logic for IMMEDIATE degradation.
        Failover is always immediate (no hysteresis) to prevent freezes.
        
        Args:
            target_bitrate_mbps: Required bitrate for current profile
        
        Returns:
            Tuple of (should_failover: bool, reason: str)
        """
        stats = self.get_rolling_stats()
        
        if not stats or stats.samples_count < 5:
            return False, "Insufficient telemetry data"
        
        # Check 1: Critical latency (>500ms)
        if stats.latency_current > self.thresholds['latency_critical_ms']:
            return True, f"Critical latency: {stats.latency_current:.0f}ms > {self.thresholds['latency_critical_ms']}ms"
        
        # Check 2: Bandwidth below 60% of target
        if stats.bandwidth_current < (target_bitrate_mbps * 0.6):
            return True, f"Bandwidth critical: {stats.bandwidth_current:.1f} Mbps < {target_bitrate_mbps * 0.6:.1f} Mbps (60% of target)"
        
        # Check 3: Sustained bandwidth below target (avg of window)
        if stats.bandwidth_avg < target_bitrate_mbps:
            return True, f"Avg bandwidth insufficient: {stats.bandwidth_avg:.1f} Mbps < {target_bitrate_mbps:.1f} Mbps"
        
        # Check 4: Critical packet loss (>5%)
        if stats.packet_loss_current > self.thresholds['packet_loss_critical_pct']:
            return True, f"Critical packet loss: {stats.packet_loss_current:.1f}% > {self.thresholds['packet_loss_critical_pct']:.1f}%"
        
        # Check 5: Buffer running low (<20%)
        if stats.buffer_health_current < self.thresholds['buffer_critical_pct']:
            return True, f"Buffer critical: {stats.buffer_health_current:.0f}% < {self.thresholds['buffer_critical_pct']}%"
        
        # Check 6: Degrading trend detected
        if stats.trend == "degrading" and stats.bandwidth_min < target_bitrate_mbps:
            return True, f"Degrading trend + low bandwidth: {stats.bandwidth_min:.1f} Mbps"
        
        return False, "Metrics within acceptable range"
    
    def can_upgrade(self, target_profile_requirements: Dict) -> tuple[bool, str]:
        """
        Checks if metrics support upgrading to a higher profile
        
        NOTE: This only checks if metrics are sufficient.
        Hysteresis (60s stability) is handled by HysteresisController.
        
        Args:
            target_profile_requirements: Dict with bandwidth_min_mbps, latency_max_ms, etc.
        
        Returns:
            Tuple of (can_upgrade: bool, reason: str)
        """
        stats = self.get_rolling_stats()
        
        if not stats or stats.samples_count < 10:
            return False, "Insufficient telemetry data for upgrade decision"
        
        bw_required = target_profile_requirements.get('bandwidth_min_mbps', 0)
        latency_max = target_profile_requirements.get('latency_max_ms', 200)
        loss_max = target_profile_requirements.get('packet_loss_max_pct', 1.0)
        
        # All checks must pass
        if stats.bandwidth_min < bw_required:
            return False, f"Bandwidth insufficient: {stats.bandwidth_min:.1f} < {bw_required} Mbps"
        
        if stats.latency_max > latency_max:
            return False, f"Latency too high: {stats.latency_max:.0f} > {latency_max} ms"
        
        if stats.packet_loss_current > loss_max:
            return False, f"Packet loss too high: {stats.packet_loss_current:.1f}% > {loss_max}%"
        
        if stats.trend == "degrading":
            return False, "Network trend is degrading"
        
        return True, "Metrics meet upgrade requirements"
    
    def _create_snapshot(self):
        """Create a 10s snapshot from rolling data"""
        if len(self.rolling_window) < 5:
            return
        
        samples = list(self.rolling_window)
        latencies = [s.latency_ms for s in samples]
        bandwidths = [s.bandwidth_mbps for s in samples]
        losses = [s.packet_loss_pct for s in samples]
        
        # Calculate percentiles
        sorted_latencies = sorted(latencies)
        n = len(sorted_latencies)
        
        snapshot = SnapshotStats(
            timestamp=time.time(),
            latency_avg=statistics.mean(latencies),
            latency_p50=sorted_latencies[int(n * 0.5)],
            latency_p90=sorted_latencies[int(n * 0.9)] if n >= 10 else sorted_latencies[-1],
            latency_p99=sorted_latencies[int(n * 0.99)] if n >= 100 else sorted_latencies[-1],
            bandwidth_avg=statistics.mean(bandwidths),
            bandwidth_min=min(bandwidths),
            packet_loss_avg=statistics.mean(losses),
            freeze_count=self.freeze_count,
            current_profile=self.current_profile
        )
        
        self.snapshot_history.append(snapshot)
        
        # Keep last 100 snapshots (~16 minutes of history)
        if len(self.snapshot_history) > 100:
            self.snapshot_history.pop(0)
        
        self.last_snapshot_time = time.time()
        
        logger.debug(f"📊 Snapshot created: BW={snapshot.bandwidth_avg:.1f} Mbps, Lat={snapshot.latency_avg:.0f} ms")
    
    def _calculate_trend(self, values: List[float]) -> str:
        """Calculate trend from recent values (improving/stable/degrading)"""
        if len(values) < 3:
            return "stable"
        
        # Simple linear trend: compare first and last
        delta = values[-1] - values[0]
        threshold = values[0] * 0.1  # 10% change threshold
        
        if delta < -threshold:
            return "degrading"  # For bandwidth, lower is worse
        elif delta > threshold:
            return "improving"
        else:
            return "stable"
    
    def to_dict(self) -> Dict:
        """Export telemetry state as dictionary"""
        rolling = self.get_rolling_stats()
        snapshot = self.get_snapshot_stats()
        
        return {
            "rolling": asdict(rolling) if rolling else None,
            "snapshot": asdict(snapshot) if snapshot else None,
            "freeze_count": self.freeze_count,
            "current_profile": self.current_profile,
            "samples_in_window": len(self.rolling_window),
            "snapshots_count": len(self.snapshot_history)
        }
