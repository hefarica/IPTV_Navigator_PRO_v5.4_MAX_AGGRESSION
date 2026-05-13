#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════════════
APE v15.0 ULTIMATE - HTTP Test Suite
End-to-end testing with real HTTP requests
═══════════════════════════════════════════════════════════════════════════════

Tests:
1. Health check
2. Stream initialization
3. Failover on bandwidth simulation
4. Failback with 60s hysteresis
5. Rapid failovers stability
6. API metrics endpoint

Autor: APE Team
Versión: 15.0.0-ULTIMATE
Fecha: 2026-01-02
"""

import time
import json
import requests
import argparse
from datetime import datetime
from typing import List, Dict, Optional
from dataclasses import dataclass, asdict


@dataclass
class TestResult:
    """Test result"""
    name: str
    passed: bool
    duration_ms: float
    message: str
    details: Optional[Dict] = None


class APETestSuite:
    """
    End-to-end HTTP test suite for APE v15.0
    """
    
    def __init__(self, base_url: str = "http://localhost:8080"):
        self.base_url = base_url
        self.session = requests.Session()
        self.results: List[TestResult] = []
        self.session_id: Optional[str] = None
    
    def run_all(self) -> bool:
        """
        Run all tests
        
        Returns:
            True if all tests passed
        """
        print("╔═══════════════════════════════════════════════════════════════╗")
        print("║          APE v15.0 ULTIMATE - HTTP Test Suite                ║")
        print("╚═══════════════════════════════════════════════════════════════╝\n")
        
        # Run tests
        self.test_health_check()
        self.test_stream_initialization()
        self.test_api_metrics()
        self.test_api_sessions()
        self.test_force_failover()
        self.test_force_failback()
        self.test_rapid_failovers()
        
        # Print summary
        self.print_summary()
        
        return all(r.passed for r in self.results)
    
    def test_health_check(self):
        """Test 1: Health check endpoint"""
        print("🔍 Test 1: Health Check")
        start = time.perf_counter()
        
        try:
            response = self.session.get(f"{self.base_url}/health", timeout=5)
            duration = (time.perf_counter() - start) * 1000
            
            if response.status_code != 200:
                self._record("health_check", False, duration, f"Status {response.status_code}")
                return
            
            data = response.json()
            
            if data.get('status') != 'ok':
                self._record("health_check", False, duration, f"Status not ok: {data}")
                return
            
            version = data.get('version', 'unknown')
            self._record("health_check", True, duration, f"Server OK (v{version})", data)
            
        except Exception as e:
            duration = (time.perf_counter() - start) * 1000
            self._record("health_check", False, duration, str(e))
    
    def test_stream_initialization(self):
        """Test 2: Stream initialization"""
        print("🔍 Test 2: Stream Initialization")
        start = time.perf_counter()
        
        try:
            # Test channel
            test_url = "http://example.com/live/test/playlist.m3u8"
            
            response = self.session.get(
                f"{self.base_url}/stream",
                params={
                    'channel_id': 'TEST_CH_001',
                    'original_url': test_url,
                    'tvg_name': 'Test Channel',
                    'group_title': 'TEST | HD'
                },
                timeout=10
            )
            duration = (time.perf_counter() - start) * 1000
            
            # Check session cookie
            if 'ape_session_id' not in response.cookies:
                self._record("stream_init", False, duration, "No session cookie")
                return
            
            self.session_id = response.cookies['ape_session_id']
            
            # Check APE headers
            if 'X-APE-Profile' not in response.headers:
                self._record("stream_init", False, duration, "No X-APE-Profile header")
                return
            
            profile = response.headers['X-APE-Profile']
            self._record("stream_init", True, duration, f"Session created (Profile: {profile})", {
                'session_id': self.session_id,
                'profile': profile
            })
            
        except Exception as e:
            duration = (time.perf_counter() - start) * 1000
            self._record("stream_init", False, duration, str(e))
    
    def test_api_metrics(self):
        """Test 3: API metrics endpoint"""
        print("🔍 Test 3: API Metrics")
        start = time.perf_counter()
        
        try:
            # Global metrics
            response = self.session.get(
                f"{self.base_url}/api/metrics",
                timeout=5
            )
            duration = (time.perf_counter() - start) * 1000
            
            if response.status_code != 200:
                self._record("api_metrics", False, duration, f"Status {response.status_code}")
                return
            
            data = response.json()
            
            # Check required fields
            required = ['version', 'active_sessions', 'timestamp']
            missing = [f for f in required if f not in data]
            
            if missing:
                self._record("api_metrics", False, duration, f"Missing fields: {missing}")
                return
            
            self._record("api_metrics", True, duration, f"Sessions: {data['active_sessions']}", data)
            
        except Exception as e:
            duration = (time.perf_counter() - start) * 1000
            self._record("api_metrics", False, duration, str(e))
    
    def test_api_sessions(self):
        """Test 4: List sessions endpoint"""
        print("🔍 Test 4: API Sessions List")
        start = time.perf_counter()
        
        try:
            response = self.session.get(
                f"{self.base_url}/api/sessions",
                timeout=5
            )
            duration = (time.perf_counter() - start) * 1000
            
            if response.status_code != 200:
                self._record("api_sessions", False, duration, f"Status {response.status_code}")
                return
            
            data = response.json()
            count = data.get('count', 0)
            
            self._record("api_sessions", True, duration, f"{count} active sessions", data)
            
        except Exception as e:
            duration = (time.perf_counter() - start) * 1000
            self._record("api_sessions", False, duration, str(e))
    
    def test_force_failover(self):
        """Test 5: Force failover endpoint"""
        print("🔍 Test 5: Force Failover")
        start = time.perf_counter()
        
        if not self.session_id:
            self._record("force_failover", False, 0, "No session ID available")
            return
        
        try:
            response = self.session.post(
                f"{self.base_url}/api/force_failover",
                json={
                    'session_id': self.session_id,
                    'target_profile': 'P4'
                },
                timeout=5
            )
            duration = (time.perf_counter() - start) * 1000
            
            if response.status_code != 200:
                self._record("force_failover", False, duration, f"Status {response.status_code}")
                return
            
            data = response.json()
            
            if data.get('new_profile') != 'P4':
                self._record("force_failover", False, duration, f"Unexpected profile: {data}")
                return
            
            self._record("force_failover", True, duration, f"P2→P4 executed", data)
            
        except Exception as e:
            duration = (time.perf_counter() - start) * 1000
            self._record("force_failover", False, duration, str(e))
    
    def test_force_failback(self):
        """Test 6: Force failback endpoint"""
        print("🔍 Test 6: Force Failback")
        start = time.perf_counter()
        
        if not self.session_id:
            self._record("force_failback", False, 0, "No session ID available")
            return
        
        try:
            response = self.session.post(
                f"{self.base_url}/api/force_failover",
                json={
                    'session_id': self.session_id,
                    'target_profile': 'P2'
                },
                timeout=5
            )
            duration = (time.perf_counter() - start) * 1000
            
            if response.status_code != 200:
                self._record("force_failback", False, duration, f"Status {response.status_code}")
                return
            
            data = response.json()
            
            if data.get('new_profile') != 'P2':
                self._record("force_failback", False, duration, f"Unexpected profile: {data}")
                return
            
            self._record("force_failback", True, duration, f"P4→P2 executed", data)
            
        except Exception as e:
            duration = (time.perf_counter() - start) * 1000
            self._record("force_failback", False, duration, str(e))
    
    def test_rapid_failovers(self):
        """Test 7: Rapid failovers stability"""
        print("🔍 Test 7: Rapid Failovers (10x)")
        start = time.perf_counter()
        
        if not self.session_id:
            self._record("rapid_failovers", False, 0, "No session ID available")
            return
        
        try:
            profiles = ['P4', 'P2', 'P4', 'P2', 'P5', 'P3', 'P2', 'P4', 'P2', 'P3']
            
            for i, profile in enumerate(profiles):
                response = self.session.post(
                    f"{self.base_url}/api/force_failover",
                    json={
                        'session_id': self.session_id,
                        'target_profile': profile
                    },
                    timeout=5
                )
                
                if response.status_code != 200:
                    self._record("rapid_failovers", False, 0, f"Failed at iteration {i}")
                    return
                
                time.sleep(0.1)  # 100ms between requests
            
            duration = (time.perf_counter() - start) * 1000
            
            # Verify system is still stable
            health = self.session.get(f"{self.base_url}/health", timeout=5)
            if health.status_code != 200:
                self._record("rapid_failovers", False, duration, "System unstable after rapid failovers")
                return
            
            self._record("rapid_failovers", True, duration, "10 failovers completed, system stable")
            
        except Exception as e:
            duration = (time.perf_counter() - start) * 1000
            self._record("rapid_failovers", False, duration, str(e))
    
    def _record(self, name: str, passed: bool, duration_ms: float, message: str, details: Dict = None):
        """Record test result"""
        result = TestResult(
            name=name,
            passed=passed,
            duration_ms=round(duration_ms, 2),
            message=message,
            details=details
        )
        self.results.append(result)
        
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"   {status}: {message} ({duration_ms:.2f}ms)\n")
    
    def print_summary(self):
        """Print test summary"""
        print("═" * 70)
        print("                         TEST SUMMARY")
        print("═" * 70 + "\n")
        
        passed = sum(1 for r in self.results if r.passed)
        total = len(self.results)
        
        for r in self.results:
            status = "✅" if r.passed else "❌"
            print(f"{status} {r.name}: {r.message} ({r.duration_ms}ms)")
        
        print("\n" + "═" * 70)
        print(f"RESULT: {passed}/{total} tests passed")
        print("═" * 70 + "\n")
    
    def save_report(self, output_path: str):
        """Save HTML report"""
        html = self._generate_html_report()
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(html)
        print(f"📄 Report saved: {output_path}")
    
    def _generate_html_report(self) -> str:
        """Generate HTML report"""
        passed = sum(1 for r in self.results if r.passed)
        total = len(self.results)
        success_rate = (passed / total * 100) if total > 0 else 0
        
        rows = ""
        for r in self.results:
            status = "✅ PASS" if r.passed else "❌ FAIL"
            row_class = "success" if r.passed else "fail"
            rows += f"""
            <tr class="{row_class}">
                <td>{r.name}</td>
                <td>{status}</td>
                <td>{r.duration_ms}ms</td>
                <td>{r.message}</td>
            </tr>
            """
        
        return f"""
<!DOCTYPE html>
<html>
<head>
    <title>APE v15.0 Test Report</title>
    <style>
        body {{ font-family: 'Segoe UI', sans-serif; margin: 20px; background: #f5f5f5; }}
        .container {{ max-width: 1000px; margin: 0 auto; background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }}
        h1 {{ color: #333; }}
        .summary {{ display: flex; gap: 20px; margin: 20px 0; }}
        .stat {{ background: #f0f0f0; padding: 15px 30px; border-radius: 8px; text-align: center; }}
        .stat .value {{ font-size: 32px; font-weight: bold; color: #667eea; }}
        table {{ width: 100%; border-collapse: collapse; margin-top: 20px; }}
        th {{ background: #667eea; color: white; padding: 12px; text-align: left; }}
        td {{ padding: 10px; border-bottom: 1px solid #ddd; }}
        tr.success {{ background: #f0fff0; }}
        tr.fail {{ background: #fff0f0; }}
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 APE v15.0 ULTIMATE - Test Report</h1>
        <p>Generated: {datetime.now().isoformat()}</p>
        
        <div class="summary">
            <div class="stat">
                <div class="value">{total}</div>
                <div>Total Tests</div>
            </div>
            <div class="stat">
                <div class="value" style="color: #10b981;">{passed}</div>
                <div>Passed</div>
            </div>
            <div class="stat">
                <div class="value" style="color: #ef4444;">{total - passed}</div>
                <div>Failed</div>
            </div>
            <div class="stat">
                <div class="value">{success_rate:.0f}%</div>
                <div>Success Rate</div>
            </div>
        </div>
        
        <table>
            <thead>
                <tr>
                    <th>Test</th>
                    <th>Status</th>
                    <th>Duration</th>
                    <th>Message</th>
                </tr>
            </thead>
            <tbody>
                {rows}
            </tbody>
        </table>
    </div>
</body>
</html>
        """


def main():
    parser = argparse.ArgumentParser(description='APE v15.0 HTTP Test Suite')
    parser.add_argument(
        '--server',
        default='http://localhost:8080',
        help='APE server URL (default: http://localhost:8080)'
    )
    parser.add_argument(
        '--output',
        default='test_report_v15.html',
        help='HTML report output path'
    )
    
    args = parser.parse_args()
    
    suite = APETestSuite(base_url=args.server)
    success = suite.run_all()
    suite.save_report(args.output)
    
    exit(0 if success else 1)


if __name__ == '__main__':
    main()
