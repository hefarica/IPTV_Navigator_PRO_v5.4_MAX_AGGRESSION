"""
═══════════════════════════════════════════════════════════════
📊 APE v15 TELEMETRY CORE - DUAL LEVEL
IPTV Navigator PRO - Predictive Streaming Analytics
═══════════════════════════════════════════════════════════════

DUAL-LEVEL TELEMETRY:
- Level 1: Rolling Window (100ms sampling, 10 samples = 1s history)
- Level 2: Snapshot (10s aggregated with percentiles)

FEATURES:
- Micro-degradation detection before visible freeze
- Predictive failover 2-3 seconds ahead
- P50/P90/P99 percentile calculations

═══════════════════════════════════════════════════════════════
"""

import time
import statistics
import logging
from collections import deque
from typing import Optional, Dict, Any, List

logger = logging.getLogger(__name__)


class TelemetryCore:
    """
    APE v15 Dual-Level Telemetry Engine.
    
    Level 1: Rolling window with 100ms samples (1 second history)
    Level 2: 10-second snapshots with statistical aggregation
    """
    
    def __init__(self, rolling_samples: int = 10, snapshot_interval_s: int = 10):
        """
        Initialize telemetry engine.
        
        Args:
            rolling_samples: Number of samples in rolling window (10 @ 100ms = 1s)
            snapshot_interval_s: Interval between snapshot calculations
        """
        # Level 1: Rolling Window (100ms)
        self.rolling_window = deque(maxlen=rolling_samples)
        
        # Level 2: Snapshot History (10s intervals)
        self.snapshot_history = deque(maxlen=100)  # Keep last ~16 minutes
        self.last_snapshot_time = time.time()
        self.snapshot_interval = snapshot_interval_s
        
        # Accumulated metrics for current snapshot
        self._snapshot_buffer: List[Dict] = []
        
        # Failover triggers (configurable)
        self.failover_triggers = {
            'ttfb_limit_ms': 500,           # TTFB > 500ms triggers
            'throughput_dip_pct': 0.5,      # 50% drop triggers
            'loss_limit_pct': 3.0,          # 3% packet loss triggers
            'consecutive_triggers': 3       # Need 3 consecutive bad samples
        }
        
        # State tracking
        self.consecutive_bad_samples = 0
        self.current_profile = "P2"
        self.event_log = deque(maxlen=50)  # Last 50 events
    
    def record_metrics(
        self,
        ttfb_ms: float,
        throughput_mbps: float,
        loss_pct: float = 0.0,
        cpu_pct: float = 0.0,
        ram_mb: float = 0.0
    ):
        """
        Record a new telemetry sample.
        Called every 100ms during active streaming.
        """
        timestamp = time.time()
        
        sample = {
            'ts': timestamp,
            'ttfb': ttfb_ms,
            'throughput': throughput_mbps,
            'loss': loss_pct,
            'cpu': cpu_pct,
            'ram': ram_mb
        }
        
        # Level 1: Add to rolling window
        self.rolling_window.append(sample)
        
        # Level 2: Buffer for snapshot
        self._snapshot_buffer.append(sample)
        
        # Check if we should create a new snapshot
        if timestamp - self.last_snapshot_time >= self.snapshot_interval:
            self._create_snapshot()
    
    def _create_snapshot(self):
        """Create a 10-second aggregated snapshot."""
        if not self._snapshot_buffer:
            return
        
        timestamp = time.time()
        
        # Extract metrics arrays
        ttfbs = [s['ttfb'] for s in self._snapshot_buffer]
        throughputs = [s['throughput'] for s in self._snapshot_buffer]
        losses = [s['loss'] for s in self._snapshot_buffer]
        
        # Calculate percentiles
        def percentile(data: List[float], pct: int) -> float:
            if not data:
                return 0.0
            sorted_data = sorted(data)
            idx = int(len(sorted_data) * pct / 100)
            return sorted_data[min(idx, len(sorted_data) - 1)]
        
        snapshot = {
            'ts': timestamp,
            'samples': len(self._snapshot_buffer),
            'latency': {
                'avg': statistics.mean(ttfbs) if ttfbs else 0,
                'min': min(ttfbs) if ttfbs else 0,
                'max': max(ttfbs) if ttfbs else 0,
                'p50': percentile(ttfbs, 50),
                'p90': percentile(ttfbs, 90),
                'p99': percentile(ttfbs, 99),
                'stddev': statistics.stdev(ttfbs) if len(ttfbs) > 1 else 0
            },
            'bandwidth': {
                'avg': statistics.mean(throughputs) if throughputs else 0,
                'min': min(throughputs) if throughputs else 0,
                'max': max(throughputs) if throughputs else 0,
                'p50': percentile(throughputs, 50),
                'p90': percentile(throughputs, 90),
                'p99': percentile(throughputs, 99)
            },
            'packet_loss': {
                'avg': statistics.mean(losses) if losses else 0,
                'max': max(losses) if losses else 0
            },
            'current_profile': self.current_profile
        }
        
        self.snapshot_history.append(snapshot)
        self.last_snapshot_time = timestamp
        self._snapshot_buffer = []
        
        logger.debug(f"📊 Snapshot: lat_avg={snapshot['latency']['avg']:.0f}ms, bw_avg={snapshot['bandwidth']['avg']:.1f}Mbps")
    
    def get_rolling_stats(self) -> Optional[Dict[str, Any]]:
        """
        Get Level 1 rolling window statistics.
        Returns real-time metrics from last ~1 second.
        """
        if not self.rolling_window:
            return None
        
        samples = list(self.rolling_window)
        throughputs = [s['throughput'] for s in samples]
        ttfbs = [s['ttfb'] for s in samples]
        losses = [s['loss'] for s in samples]
        
        return {
            'level': 'rolling_100ms',
            'samples': len(samples),
            'throughput': {
                'current': throughputs[-1] if throughputs else 0,
                'avg': statistics.mean(throughputs) if throughputs else 0,
                'min': min(throughputs) if throughputs else 0
            },
            'latency': {
                'current': ttfbs[-1] if ttfbs else 0,
                'avg': statistics.mean(ttfbs) if ttfbs else 0,
                'max': max(ttfbs) if ttfbs else 0
            },
            'loss': {
                'current': losses[-1] if losses else 0,
                'avg': statistics.mean(losses) if losses else 0
            },
            'timestamp': time.time()
        }
    
    def get_snapshot_stats(self) -> Optional[Dict[str, Any]]:
        """
        Get Level 2 snapshot statistics.
        Returns aggregated metrics from last 10-second snapshot.
        """
        if not self.snapshot_history:
            return None
        
        latest = self.snapshot_history[-1]
        
        # Calculate trend from last 3 snapshots
        trend = "stable"
        if len(self.snapshot_history) >= 3:
            recent_bw = [s['bandwidth']['avg'] for s in list(self.snapshot_history)[-3:]]
            if recent_bw[-1] < recent_bw[0] * 0.8:
                trend = "degrading"
            elif recent_bw[-1] > recent_bw[0] * 1.2:
                trend = "improving"
        
        return {
            'level': 'snapshot_10s',
            'snapshot': latest,
            'trend': trend,
            'history_count': len(self.snapshot_history),
            'timestamp': time.time()
        }
    
    def should_failover(self, target_bitrate_mbps: float) -> bool:
        """
        Determine if failover (downgrade) should be triggered.
        Uses predictive logic based on rolling window trends.
        
        Returns True if network conditions are degrading.
        """
        stats = self.get_rolling_stats()
        if not stats or stats['samples'] < 5:
            return False
        
        # Check multiple conditions
        triggers = []
        
        # 1. TTFB trigger
        if stats['latency']['current'] > self.failover_triggers['ttfb_limit_ms']:
            triggers.append('HIGH_LATENCY')
        
        # 2. Throughput drop trigger
        if stats['throughput']['min'] < (target_bitrate_mbps * self.failover_triggers['throughput_dip_pct']):
            triggers.append('LOW_THROUGHPUT')
        
        # 3. Packet loss trigger
        if stats['loss']['current'] > self.failover_triggers['loss_limit_pct']:
            triggers.append('PACKET_LOSS')
        
        # Update consecutive counter
        if triggers:
            self.consecutive_bad_samples += 1
        else:
            self.consecutive_bad_samples = 0
        
        # Need consecutive bad samples to trigger
        if self.consecutive_bad_samples >= self.failover_triggers['consecutive_triggers']:
            reason = ', '.join(triggers)
            self._log_event('FAILOVER_TRIGGER', f"Triggered by: {reason}")
            return True
        
        return False
    
    def check_upgrade_conditions(self, target_profile_reqs: Dict) -> bool:
        """
        Check if current conditions meet requirements for a higher profile.
        Used with hysteresis controller for failback decisions.
        """
        stats = self.get_rolling_stats()
        if not stats or stats['samples'] < 5:
            return False
        
        # Check all requirements
        bw_ok = stats['throughput']['avg'] >= target_profile_reqs.get('bandwidth_min_mbps', 0)
        latency_ok = stats['latency']['avg'] <= target_profile_reqs.get('latency_max_ms', 999)
        loss_ok = stats['loss']['avg'] <= target_profile_reqs.get('packet_loss_max_pct', 100)
        
        return bw_ok and latency_ok and loss_ok
    
    def set_current_profile(self, profile: str):
        """Update current profile for tracking."""
        if profile != self.current_profile:
            self._log_event('PROFILE_CHANGE', f"{self.current_profile} → {profile}")
            self.current_profile = profile
    
    def _log_event(self, event_type: str, message: str):
        """Log a telemetry event."""
        event = {
            'ts': time.time(),
            'type': event_type,
            'message': message,
            'profile': self.current_profile
        }
        self.event_log.append(event)
        logger.info(f"📡 {event_type}: {message}")
    
    def get_full_report(self) -> Dict[str, Any]:
        """Get comprehensive telemetry report for API/UI."""
        return {
            'rolling': self.get_rolling_stats(),
            'snapshot': self.get_snapshot_stats(),
            'current_profile': self.current_profile,
            'consecutive_bad': self.consecutive_bad_samples,
            'events': list(self.event_log)[-10:],  # Last 10 events
            'timestamp': time.time()
        }
    
    def reset(self):
        """Reset all telemetry state."""
        self.rolling_window.clear()
        self.snapshot_history.clear()
        self._snapshot_buffer = []
        self.consecutive_bad_samples = 0
        self.event_log.clear()
        logger.info("Telemetry core reset")
