#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════════════
APE v15.0 ULTIMATE - Device Metrics Collector
Collects system metrics (CPU, RAM, bandwidth, latency) using psutil
═══════════════════════════════════════════════════════════════════════════════

Autor: APE Team
Versión: 15.0.0-ULTIMATE
Fecha: 2026-01-02
"""

import time
import logging
import requests
from typing import Dict, Optional
from dataclasses import dataclass, asdict

try:
    import psutil
    PSUTIL_AVAILABLE = True
except ImportError:
    PSUTIL_AVAILABLE = False

logger = logging.getLogger(__name__)


@dataclass
class SystemMetrics:
    """System resource metrics"""
    cpu_usage_pct: float
    ram_available_mb: float
    ram_usage_pct: float
    disk_free_gb: float


@dataclass
class NetworkMetrics:
    """Network performance metrics"""
    latency_ms: float
    bandwidth_mbps: float
    packet_loss_pct: float


class DeviceMetrics:
    """
    Collects system and network metrics for APE decision engine
    """
    
    def __init__(self, cdn_test_url: str = "http://speedtest.tele2.net/1KB.zip"):
        """
        Initialize metrics collector
        
        Args:
            cdn_test_url: URL to use for bandwidth/latency testing
        """
        self.cdn_test_url = cdn_test_url
        self._last_bandwidth_test: float = 0
        self._cached_bandwidth: float = 0.0
        self._bandwidth_test_interval: float = 30.0  # Test every 30s
    
    def collect_system_metrics(self) -> SystemMetrics:
        """
        Collect CPU, RAM, and disk metrics
        
        Returns:
            SystemMetrics dataclass
        """
        if not PSUTIL_AVAILABLE:
            logger.warning("psutil not available, returning default metrics")
            return SystemMetrics(
                cpu_usage_pct=50.0,
                ram_available_mb=2048.0,
                ram_usage_pct=50.0,
                disk_free_gb=50.0
            )
        
        try:
            cpu_pct = psutil.cpu_percent(interval=None)
            memory = psutil.virtual_memory()
            disk = psutil.disk_usage('/')
            
            return SystemMetrics(
                cpu_usage_pct=cpu_pct,
                ram_available_mb=memory.available / (1024 * 1024),
                ram_usage_pct=memory.percent,
                disk_free_gb=disk.free / (1024 * 1024 * 1024)
            )
        except Exception as e:
            logger.error(f"Error collecting system metrics: {e}")
            return SystemMetrics(
                cpu_usage_pct=50.0,
                ram_available_mb=2048.0,
                ram_usage_pct=50.0,
                disk_free_gb=50.0
            )
    
    def measure_latency(self, url: str = None) -> float:
        """
        Measure latency to a URL using HTTP HEAD request
        
        Args:
            url: URL to test (defaults to cdn_test_url)
        
        Returns:
            Latency in milliseconds
        """
        test_url = url or self.cdn_test_url
        
        try:
            start = time.perf_counter()
            response = requests.head(test_url, timeout=5)
            elapsed = (time.perf_counter() - start) * 1000  # Convert to ms
            return round(elapsed, 1)
        except requests.RequestException as e:
            logger.warning(f"Latency test failed: {e}")
            return 999.0  # High latency on failure
    
    def measure_bandwidth(self, force: bool = False) -> float:
        """
        Measure bandwidth by downloading a test file
        
        Args:
            force: Force new test even if cache is fresh
        
        Returns:
            Bandwidth in Mbps
        """
        # Use cached value if recent
        if not force and time.time() - self._last_bandwidth_test < self._bandwidth_test_interval:
            return self._cached_bandwidth
        
        try:
            # Download 1KB file and measure throughput
            start = time.perf_counter()
            response = requests.get(self.cdn_test_url, timeout=10)
            elapsed = time.perf_counter() - start
            
            if elapsed > 0:
                size_bits = len(response.content) * 8
                bandwidth_mbps = (size_bits / elapsed) / (1024 * 1024)
                
                # Cache the result
                self._cached_bandwidth = round(bandwidth_mbps, 2)
                self._last_bandwidth_test = time.time()
                
                return self._cached_bandwidth
            
            return 0.0
        except requests.RequestException as e:
            logger.warning(f"Bandwidth test failed: {e}")
            return 1.0  # Low bandwidth on failure
    
    def collect_network_metrics(self) -> NetworkMetrics:
        """
        Collect network performance metrics
        
        Returns:
            NetworkMetrics dataclass
        """
        latency = self.measure_latency()
        bandwidth = self.measure_bandwidth()
        
        # Estimate packet loss based on latency variance
        # In production, this would use actual packet loss tracking
        packet_loss = 0.0
        if latency > 500:
            packet_loss = 5.0
        elif latency > 200:
            packet_loss = 1.0
        
        return NetworkMetrics(
            latency_ms=latency,
            bandwidth_mbps=bandwidth,
            packet_loss_pct=packet_loss
        )
    
    def collect_all(self) -> Dict:
        """
        Collect all metrics (system + network)
        
        Returns:
            Combined metrics dictionary
        """
        system = self.collect_system_metrics()
        network = self.collect_network_metrics()
        
        return {
            "system": asdict(system),
            "network": asdict(network),
            "timestamp": time.time()
        }
    
    @staticmethod
    def record_segment_metrics(
        segment_size_bytes: int,
        download_duration_seconds: float
    ) -> Dict:
        """
        Calculate metrics from an actual segment download
        
        Args:
            segment_size_bytes: Size of downloaded segment
            download_duration_seconds: Time taken to download
        
        Returns:
            Dict with throughput_mbps and ttfb_ms
        """
        if download_duration_seconds <= 0:
            return {"throughput_mbps": 0.0, "ttfb_ms": 0.0}
        
        size_bits = segment_size_bytes * 8
        throughput_mbps = (size_bits / download_duration_seconds) / (1024 * 1024)
        
        return {
            "throughput_mbps": round(throughput_mbps, 2),
            "ttfb_ms": round(download_duration_seconds * 1000, 1)
        }
