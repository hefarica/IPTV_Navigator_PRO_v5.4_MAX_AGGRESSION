#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════════════
APE v15.0 ULTIMATE - Hysteresis Controller
Innovation: 60-second stability check before profile upgrade (failback)
═══════════════════════════════════════════════════════════════════════════════

FAILOVER vs FAILBACK:
- FAILOVER (downgrade): Immediate, no hysteresis, to prevent freezes
- FAILBACK (upgrade): 60s stability required to prevent "flapping"

Flapping = rapidly switching between profiles when network is unstable at
boundary conditions. Hysteresis prevents this by requiring sustained improvement.

Autor: APE Team
Versión: 15.0.0-ULTIMATE
Fecha: 2026-01-02
"""

import time
import logging
from typing import Dict, Tuple, Optional

logger = logging.getLogger(__name__)


class HysteresisController:
    """
    Controls failback (upgrade) transitions with 60-second stability requirement.
    
    Key behaviors:
    - Tracks when improvement was first detected
    - Resets counter if metrics degrade during waiting period
    - Only allows upgrade after 60s of sustained good metrics
    """
    
    # Profile order from lowest to highest quality
    PROFILE_ORDER = ["P5", "P4", "P3", "P2", "P1", "P0"]
    
    def __init__(self, stability_threshold_seconds: int = 60):
        """
        Initialize hysteresis controller
        
        Args:
            stability_threshold_seconds: Time required with good metrics before upgrade (default 60s)
        """
        self.stability_threshold = stability_threshold_seconds
        
        # Tracks improvement start time per session
        # {session_id: {'start_time': float, 'target_profile': str}}
        self._improvement_trackers: Dict[str, Dict] = {}
    
    def check_failback_eligibility(
        self,
        session_id: str,
        current_profile: str,
        target_profile: str,
        current_metrics: Dict
    ) -> Tuple[bool, str]:
        """
        Check if failback (upgrade) to target_profile is allowed
        
        Args:
            session_id: Session identifier
            current_profile: Currently active profile (e.g., "P4")
            target_profile: Desired upgrade profile (e.g., "P2")
            current_metrics: Current telemetry metrics dict
        
        Returns:
            Tuple of (eligible: bool, reason: str)
        """
        # Validate profile upgrade direction
        if not self._is_upgrade(current_profile, target_profile):
            return False, f"Not an upgrade: {current_profile} → {target_profile}"
        
        # Check if already at maximum quality
        if current_profile == "P0":
            return False, "Already at maximum profile P0"
        
        tracker = self._improvement_trackers.get(session_id)
        
        # First time detecting potential upgrade
        if tracker is None or tracker.get('target_profile') != target_profile:
            self._improvement_trackers[session_id] = {
                'start_time': time.time(),
                'target_profile': target_profile
            }
            elapsed = 0
            logger.info(f"[{session_id}] 📈 Hysteresis started for {current_profile}→{target_profile}")
            return False, f"Hysteresis started: 0/{self.stability_threshold}s"
        
        # Calculate elapsed time since improvement detected
        elapsed = time.time() - tracker['start_time']
        
        # Check if threshold met
        if elapsed >= self.stability_threshold:
            # Clear tracker and allow upgrade
            del self._improvement_trackers[session_id]
            logger.info(f"[{session_id}] ✅ Hysteresis satisfied after {int(elapsed)}s")
            return True, f"Hysteresis satisfied: {int(elapsed)}s"
        else:
            return False, f"Hysteresis in progress: {int(elapsed)}/{self.stability_threshold}s"
    
    def reset_hysteresis(self, session_id: str, reason: str = "metrics degraded"):
        """
        Reset hysteresis counter for a session (called when metrics degrade)
        
        Args:
            session_id: Session identifier
            reason: Why hysteresis was reset
        """
        if session_id in self._improvement_trackers:
            del self._improvement_trackers[session_id]
            logger.info(f"[{session_id}] 🔄 Hysteresis reset: {reason}")
    
    def get_hysteresis_status(self, session_id: str) -> Optional[Dict]:
        """
        Get current hysteresis status for a session
        
        Returns:
            Dict with 'elapsed_seconds', 'target_profile', 'remaining_seconds'
            or None if no hysteresis in progress
        """
        tracker = self._improvement_trackers.get(session_id)
        if not tracker:
            return None
        
        elapsed = time.time() - tracker['start_time']
        return {
            'elapsed_seconds': int(elapsed),
            'target_profile': tracker['target_profile'],
            'remaining_seconds': max(0, self.stability_threshold - int(elapsed)),
            'threshold_seconds': self.stability_threshold
        }
    
    def _is_upgrade(self, from_profile: str, to_profile: str) -> bool:
        """
        Check if transition is an upgrade (to higher quality)
        
        P5 (SD) < P4 (720p) < P3 (1080p) < P2 (4K@30) < P1 (4K@60) < P0 (8K)
        """
        try:
            from_idx = self.PROFILE_ORDER.index(from_profile)
            to_idx = self.PROFILE_ORDER.index(to_profile)
            return to_idx > from_idx  # Higher index = better quality
        except ValueError:
            return False
    
    def _is_downgrade(self, from_profile: str, to_profile: str) -> bool:
        """Check if transition is a downgrade (to lower quality)"""
        return self._is_upgrade(to_profile, from_profile)
    
    def get_profile_priority(self, profile: str) -> int:
        """
        Get numerical priority of profile (higher = better quality)
        
        Returns:
            Priority 0-5 (0=worst, 5=best)
        """
        try:
            return self.PROFILE_ORDER.index(profile)
        except ValueError:
            return 2  # Default to P3 level
    
    def cleanup_stale_sessions(self, max_age_seconds: int = 3600):
        """
        Remove hysteresis trackers for sessions that haven't been updated
        
        Args:
            max_age_seconds: Maximum age before cleanup (default 1 hour)
        """
        current_time = time.time()
        stale_sessions = [
            sid for sid, tracker in self._improvement_trackers.items()
            if current_time - tracker['start_time'] > max_age_seconds
        ]
        
        for session_id in stale_sessions:
            del self._improvement_trackers[session_id]
            logger.debug(f"[{session_id}] 🧹 Cleaned up stale hysteresis tracker")
