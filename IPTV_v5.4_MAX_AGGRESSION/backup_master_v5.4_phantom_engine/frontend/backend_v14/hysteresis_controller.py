"""
═══════════════════════════════════════════════════════════════
🔄 APE v15 HYSTERESIS CONTROLLER
IPTV Navigator PRO - Intelligent Failback with 60s Stability
═══════════════════════════════════════════════════════════════

PURPOSE:
Prevents "flapping" between profiles by requiring 60 seconds of
stable network conditions before upgrading (failback) to a
higher quality profile.

LOGIC:
- FAILOVER (downgrade): Immediate (<100ms)
- FAILBACK (upgrade): Requires 60s of stable metrics meeting
  target profile requirements

═══════════════════════════════════════════════════════════════
"""

import time
import logging
from typing import Tuple, Optional

logger = logging.getLogger(__name__)


class HysteresisController:
    """
    Controls profile transitions with stability requirements.
    Prevents oscillation between quality levels.
    """
    
    PROFILE_ORDER = ["P5", "P4", "P3", "P2", "P1", "P0"]  # Worst to best
    
    def __init__(self, stability_threshold_seconds: int = 60):
        """
        Initialize hysteresis controller.
        
        Args:
            stability_threshold_seconds: Time metrics must remain stable
                                         before allowing upgrade
        """
        self.stability_threshold = stability_threshold_seconds
        self.improvement_start_time: Optional[float] = None
        self.target_profile_candidate: Optional[str] = None
    
    def get_profile_index(self, profile: str) -> int:
        """Get numeric index for profile comparison."""
        try:
            return self.PROFILE_ORDER.index(profile)
        except ValueError:
            return 2  # Default to P3 position
    
    def is_upgrade(self, current_profile: str, target_profile: str) -> bool:
        """Check if target is an upgrade from current."""
        return self.get_profile_index(target_profile) > self.get_profile_index(current_profile)
    
    def check_failback_eligibility(
        self,
        current_profile: str,
        target_profile: str,
        metrics_meet_requirements: bool
    ) -> Tuple[bool, str, float]:
        """
        Check if failback (upgrade) is allowed after hysteresis period.
        
        Args:
            current_profile: Current active profile (e.g., "P4")
            target_profile: Desired upgrade profile (e.g., "P2")
            metrics_meet_requirements: Whether current metrics meet target requirements
            
        Returns:
            Tuple of (eligible: bool, reason: str, progress: float 0-100)
        """
        # Already at maximum quality
        if current_profile == "P0":
            return False, "Already at maximum profile P0", 100.0
        
        # Target must be an upgrade
        if not self.is_upgrade(current_profile, target_profile):
            return False, f"Target {target_profile} is not an upgrade from {current_profile}", 0.0
        
        # Metrics must meet target profile requirements
        if not metrics_meet_requirements:
            # Reset counter - conditions degraded
            self.improvement_start_time = None
            self.target_profile_candidate = None
            return False, "Metrics below target profile requirements", 0.0
        
        # Start or continue stability counter
        current_time = time.time()
        
        # If target changed, restart counter
        if self.target_profile_candidate != target_profile:
            self.improvement_start_time = current_time
            self.target_profile_candidate = target_profile
            return False, f"Hysteresis started for {target_profile}: 0/{self.stability_threshold}s", 0.0
        
        # Calculate elapsed time
        if self.improvement_start_time is None:
            self.improvement_start_time = current_time
            return False, f"Hysteresis started for {target_profile}: 0/{self.stability_threshold}s", 0.0
        
        elapsed = current_time - self.improvement_start_time
        progress = min(100.0, (elapsed / self.stability_threshold) * 100)
        
        if elapsed >= self.stability_threshold:
            # Hysteresis satisfied - allow upgrade
            self.improvement_start_time = None
            self.target_profile_candidate = None
            logger.info(f"✅ Hysteresis satisfied: {current_profile} → {target_profile} after {int(elapsed)}s")
            return True, f"Hysteresis complete: {int(elapsed)}s stable", 100.0
        else:
            # Still waiting
            return False, f"Hysteresis: {int(elapsed)}/{self.stability_threshold}s ({progress:.0f}%)", progress
    
    def should_failover(
        self,
        current_profile: str,
        target_profile: str
    ) -> Tuple[bool, str]:
        """
        Check if immediate failover (downgrade) should occur.
        Failovers are always immediate - no hysteresis needed.
        
        Args:
            current_profile: Current active profile
            target_profile: Profile suggested by telemetry
            
        Returns:
            Tuple of (should_failover: bool, reason: str)
        """
        # Failover = downgrade (going to lower quality)
        if not self.is_upgrade(current_profile, target_profile):
            # This is a downgrade - allow immediately
            self.improvement_start_time = None  # Reset any failback progress
            self.target_profile_candidate = None
            return True, f"Immediate failover: {current_profile} → {target_profile}"
        
        return False, "Not a failover (upgrade detected)"
    
    def reset(self):
        """Reset hysteresis state."""
        self.improvement_start_time = None
        self.target_profile_candidate = None
        logger.debug("Hysteresis controller reset")
    
    def get_state(self) -> dict:
        """Get current hysteresis state for monitoring."""
        elapsed = 0
        if self.improvement_start_time:
            elapsed = time.time() - self.improvement_start_time
        
        return {
            "target_candidate": self.target_profile_candidate,
            "elapsed_seconds": round(elapsed, 1),
            "threshold_seconds": self.stability_threshold,
            "progress_pct": min(100, round((elapsed / self.stability_threshold) * 100, 1)) if elapsed > 0 else 0,
            "active": self.improvement_start_time is not None
        }


# Singleton for use in main server
_hysteresis_instance: Optional[HysteresisController] = None


def get_hysteresis_controller(threshold: int = 60) -> HysteresisController:
    """Get singleton hysteresis controller instance."""
    global _hysteresis_instance
    if _hysteresis_instance is None:
        _hysteresis_instance = HysteresisController(threshold)
    return _hysteresis_instance


if __name__ == "__main__":
    # Test the controller
    logging.basicConfig(level=logging.DEBUG)
    
    controller = HysteresisController(stability_threshold_seconds=5)
    
    print("Testing hysteresis controller...")
    print()
    
    # Test immediate failover
    print("1. Testing FAILOVER (immediate):")
    should, reason = controller.should_failover("P2", "P4")
    print(f"   P2 → P4: {should} - {reason}")
    
    # Test failback with hysteresis
    print("\n2. Testing FAILBACK (requires hysteresis):")
    
    for i in range(7):
        eligible, reason, progress = controller.check_failback_eligibility(
            "P4", "P2", metrics_meet_requirements=True
        )
        print(f"   Tick {i}: eligible={eligible}, progress={progress:.0f}% - {reason}")
        time.sleep(1)
    
    print("\nDone!")
