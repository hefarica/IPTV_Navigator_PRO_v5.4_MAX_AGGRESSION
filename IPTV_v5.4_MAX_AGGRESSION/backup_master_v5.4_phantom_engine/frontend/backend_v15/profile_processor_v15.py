#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════════════
APE v15.0 ULTIMATE - Profile Processor
Evaluates metrics and selects optimal profile
═══════════════════════════════════════════════════════════════════════════════

Profiles (highest to lowest quality):
- P0: 8K @ 60fps (100 Mbps)
- P1: 4K @ 60fps (60 Mbps)
- P2: 4K @ 30fps (40 Mbps) - Default
- P3: 1080p @ 30fps (12 Mbps)
- P4: 720p @ 30fps (6 Mbps)
- P5: SD 480p (3 Mbps) - Failsafe

Autor: APE Team
Versión: 15.0.0-ULTIMATE
Fecha: 2026-01-02
"""

import json
import os
import logging
from typing import Dict, List, Optional
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class ProfileRequirements:
    """Minimum requirements for a profile"""
    bandwidth_min_mbps: float
    latency_max_ms: int
    packet_loss_max_pct: float
    cpu_free_min_pct: int
    ram_free_min_mb: int


class ProfileProcessor:
    """
    Evaluates metrics and determines appropriate profile
    """
    
    # Profile order from lowest to highest quality
    PROFILE_ORDER = ["P5", "P4", "P3", "P2", "P1", "P0"]
    
    def __init__(self, profiles_path: str = None):
        """
        Initialize profile processor
        
        Args:
            profiles_path: Path to ape_profiles_v15.json
        """
        self.profiles: Dict = {}
        
        if profiles_path and os.path.exists(profiles_path):
            self._load_profiles(profiles_path)
        else:
            self._load_default_profiles()
    
    def _load_profiles(self, path: str):
        """Load profiles from JSON file"""
        try:
            with open(path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                self.profiles = data.get('profiles', {})
                logger.info(f"✅ Loaded {len(self.profiles)} profiles from {path}")
        except Exception as e:
            logger.error(f"Error loading profiles: {e}")
            self._load_default_profiles()
    
    def _load_default_profiles(self):
        """Load minimal default profiles"""
        self.profiles = {
            "P0": {
                "id": "P0",
                "name": "8K_ULTIMATE",
                "performance_requirements": {
                    "bandwidth_min_mbps": 100,
                    "latency_max_ms": 30,
                    "packet_loss_max_pct": 0.1,
                    "cpu_free_min_pct": 50,
                    "ram_free_min_mb": 3000
                },
                "bitrate_range_mbps": {"min": 60, "max": 100, "recommended": 80}
            },
            "P1": {
                "id": "P1",
                "name": "4K_HIGH_FPS",
                "performance_requirements": {
                    "bandwidth_min_mbps": 60,
                    "latency_max_ms": 50,
                    "packet_loss_max_pct": 0.5,
                    "cpu_free_min_pct": 40,
                    "ram_free_min_mb": 2000
                },
                "bitrate_range_mbps": {"min": 35, "max": 60, "recommended": 45}
            },
            "P2": {
                "id": "P2",
                "name": "4K_STANDARD",
                "performance_requirements": {
                    "bandwidth_min_mbps": 40,
                    "latency_max_ms": 70,
                    "packet_loss_max_pct": 1.0,
                    "cpu_free_min_pct": 35,
                    "ram_free_min_mb": 1500
                },
                "bitrate_range_mbps": {"min": 20, "max": 40, "recommended": 30}
            },
            "P3": {
                "id": "P3",
                "name": "FHD_BALANCED",
                "performance_requirements": {
                    "bandwidth_min_mbps": 12,
                    "latency_max_ms": 100,
                    "packet_loss_max_pct": 2.0,
                    "cpu_free_min_pct": 25,
                    "ram_free_min_mb": 800
                },
                "bitrate_range_mbps": {"min": 6, "max": 12, "recommended": 8}
            },
            "P4": {
                "id": "P4",
                "name": "HD_BASIC",
                "performance_requirements": {
                    "bandwidth_min_mbps": 6,
                    "latency_max_ms": 150,
                    "packet_loss_max_pct": 3.0,
                    "cpu_free_min_pct": 20,
                    "ram_free_min_mb": 500
                },
                "bitrate_range_mbps": {"min": 3, "max": 6, "recommended": 4.5}
            },
            "P5": {
                "id": "P5",
                "name": "SD_FAILSAFE",
                "performance_requirements": {
                    "bandwidth_min_mbps": 3,
                    "latency_max_ms": 250,
                    "packet_loss_max_pct": 5.0,
                    "cpu_free_min_pct": 10,
                    "ram_free_min_mb": 256
                },
                "bitrate_range_mbps": {"min": 0.5, "max": 3, "recommended": 1.5}
            }
        }
        logger.info("📋 Loaded default profiles")
    
    def evaluate(self, metrics: Dict) -> str:
        """
        Evaluate metrics and determine best supportable profile
        
        Args:
            metrics: Dict with bandwidth_mbps, latency_ms, packet_loss_pct,
                    cpu_free_pct, ram_free_mb
        
        Returns:
            Profile ID (P0-P5) that best matches current conditions
        """
        bandwidth = metrics.get('bandwidth_mbps', 0)
        latency = metrics.get('latency_ms', 999)
        packet_loss = metrics.get('packet_loss_pct', 100)
        cpu_free = metrics.get('cpu_free_pct', 0)
        ram_free = metrics.get('ram_free_mb', 0)
        
        # Find highest quality profile that meets all requirements
        for profile_id in reversed(self.PROFILE_ORDER):  # P0 to P5
            profile = self.profiles.get(profile_id)
            if not profile:
                continue
            
            reqs = profile.get('performance_requirements', {})
            
            if self._meets_requirements(
                bandwidth, latency, packet_loss, cpu_free, ram_free, reqs
            ):
                return profile_id
        
        # Default to P5 if nothing else matches
        return "P5"
    
    def _meets_requirements(
        self,
        bandwidth: float,
        latency: float,
        packet_loss: float,
        cpu_free: float,
        ram_free: float,
        reqs: Dict
    ) -> bool:
        """Check if metrics meet profile requirements"""
        if bandwidth < reqs.get('bandwidth_min_mbps', 0):
            return False
        if latency > reqs.get('latency_max_ms', 999):
            return False
        if packet_loss > reqs.get('packet_loss_max_pct', 100):
            return False
        if cpu_free < reqs.get('cpu_free_min_pct', 0):
            return False
        if ram_free < reqs.get('ram_free_min_mb', 0):
            return False
        return True
    
    def get_profile(self, profile_id: str) -> Optional[Dict]:
        """Get profile configuration by ID"""
        return self.profiles.get(profile_id)
    
    def get_profile_bitrate(self, profile_id: str) -> float:
        """Get recommended bitrate for a profile"""
        profile = self.profiles.get(profile_id, {})
        bitrate = profile.get('bitrate_range_mbps', {})
        return bitrate.get('recommended', 8.0)
    
    def get_profile_requirements(self, profile_id: str) -> Optional[Dict]:
        """Get performance requirements for a profile"""
        profile = self.profiles.get(profile_id)
        if profile:
            return profile.get('performance_requirements')
        return None
    
    def get_downgrade_target(self, current_profile: str) -> Optional[str]:
        """Get next lower quality profile"""
        try:
            idx = self.PROFILE_ORDER.index(current_profile)
            if idx > 0:
                return self.PROFILE_ORDER[idx - 1]
            return None  # Already at lowest
        except ValueError:
            return "P5"  # Default to failsafe
    
    def get_upgrade_target(self, current_profile: str) -> Optional[str]:
        """Get next higher quality profile"""
        try:
            idx = self.PROFILE_ORDER.index(current_profile)
            if idx < len(self.PROFILE_ORDER) - 1:
                return self.PROFILE_ORDER[idx + 1]
            return None  # Already at highest
        except ValueError:
            return "P3"  # Default to balanced
    
    def get_all_profiles(self) -> Dict:
        """Get all profiles"""
        return self.profiles
