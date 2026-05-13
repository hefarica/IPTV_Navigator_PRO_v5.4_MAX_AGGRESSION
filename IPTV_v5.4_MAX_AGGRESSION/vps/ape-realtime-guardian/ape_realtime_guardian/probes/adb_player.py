"""
ADBPlayerProbe — Collects ExoPlayer buffer/bitrate via ADB over WireGuard.

Connects to Fire Stick / ONN 4K devices via:
  adb -s 10.200.0.X:5555 shell logcat -d -t 50 -s ExoPlayer:D

Extracts: bufferedDurationUs, droppedFrames, currentBitrate, audioUnderruns.
Caches results across cycles (ADB is slow ~150ms, poll every 2nd cycle).
"""

import asyncio
import logging
import re
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from .base import Probe, ProbeResult

logger = logging.getLogger('ape-guardian.probe.adb')


# ─── Zap Detection (standalone, testable) ────────────────────────────
COLLAPSE_BITRATE_THRESHOLD_KBPS = 100   # 0.1 Mbps
COLLAPSE_PRIOR_THRESHOLD_KBPS = 1000    # 1.0 Mbps
COLLAPSE_DURATION_CYCLES = 2            # sustained 2s at 1Hz


def detect_zap(
    current: dict,
    last: dict,
    bitrate_history: list,
) -> tuple:
    """
    Detect a zap event from ADB-derived state.

    Args:
        current: dict with keys {'pid', 'codec', 'resolution', 'bitrate_kbps'}.
                 Empty dict if probe failed this cycle.
        last:    same shape, last successful probe. Empty dict if first call.
        bitrate_history: list of recent bitrate Mbps values, oldest->newest.

    Returns:
        (zap_detected: bool, reason: str)
        reason in {'', 'pid_change', 'codec_change', 'resolution_change', 'bitrate_collapse'}
    """
    if not current or not last:
        return False, ''

    # Priority 1: PID change (new decoder spawned)
    if current.get('pid') and last.get('pid') and current['pid'] != last['pid']:
        return True, 'pid_change'

    # Priority 2: Codec change (different encoding profile)
    if current.get('codec') and last.get('codec') and current['codec'] != last['codec']:
        return True, 'codec_change'

    # Priority 3: Resolution change (e.g. user zapped 4K -> FHD)
    if current.get('resolution') and last.get('resolution') and current['resolution'] != last['resolution']:
        return True, 'resolution_change'

    # Priority 4: Heuristic — bitrate collapse sustained 2s after being healthy
    if len(bitrate_history) >= 3:
        recent = bitrate_history[-COLLAPSE_DURATION_CYCLES:]
        prior = bitrate_history[-(COLLAPSE_DURATION_CYCLES + 1)]
        all_collapsed = all(b < (COLLAPSE_BITRATE_THRESHOLD_KBPS / 1000.0) for b in recent)
        prior_healthy = prior > (COLLAPSE_PRIOR_THRESHOLD_KBPS / 1000.0)
        if all_collapsed and prior_healthy:
            return True, 'bitrate_collapse'

    return False, ''


@dataclass
class ADBDeviceState:
    """State for a single ADB device."""
    name: str
    address: str
    player: str
    connected: bool = False
    last_buffer_us: float = 0.0
    last_bitrate_kbps: float = 0.0
    last_dropped_frames: int = 0
    last_audio_underruns: int = 0
    last_success_time: float = 0.0
    consecutive_failures: int = 0
    backoff_until: float = 0.0


class ADBPlayerProbe(Probe):
    """
    Collects ExoPlayer telemetry from Android devices via ADB-over-WireGuard.

    Features:
    - Configurable poll frequency (skip cycles to avoid ADB lag)
    - Reconnect with exponential backoff on failure
    - Graceful fallback: marks buffer_source=stale after timeout
    - Multiple regex patterns configurable per player type
    """

    def __init__(
        self,
        devices: List[Dict[str, Any]] = None,
        connect_timeout_s: float = 5.0,
        command_timeout_s: float = 3.0,
        reconnect_backoff_max_s: float = 60.0,
        patterns: Dict[str, str] = None,
    ):
        self._connect_timeout = connect_timeout_s
        self._command_timeout = command_timeout_s
        self._backoff_max = reconnect_backoff_max_s
        self._cycle_count = 0

        # Default patterns — calibrated for OTT Navigator / ExoPlayer
        # OTT Navigator emits: MediaCodecLogger: PID.4K.HW.omx.video.avc.bitrateInKbps = 7058
        self._patterns = patterns or {
            'buffered_duration_us': r'bufferedDurationUs=(\d+)',
            'current_position_us': r'currentPositionUs=(\d+)',
            'dropped_frames': r'droppedFrames.*?count=(\d+)',
            'current_bitrate_kbps': r'bitrateInKbps\s*=\s*(\d+)',
            'current_bitrate_kbps_alt': r'(\d+)\s*Kbps',
            'audio_underruns': r'audioUnderruns=(\d+)',
        }

        # Initialize device states
        self._devices: List[ADBDeviceState] = []
        for d in (devices or []):
            self._devices.append(ADBDeviceState(
                name=d.get('name', 'unknown'),
                address=d.get('adb_address', '10.200.0.3:5555'),
                player=d.get('player', 'ott_navigator'),
            ))

        self._poll_every_n = 2  # Default: poll every 2nd cycle
        self._poll_emergency_n = 1  # Emergency: poll EVERY cycle

        # Zap detection state (persists across cycles)
        self._last_observation: Dict[str, Any] = {}
        self._bitrate_history_mbps: list = []
        self._bitrate_history_max = 5  # keep last 5 cycles for heuristic

    # Emergency polling threshold — below this, poll every cycle
    EMERGENCY_BITRATE_MBPS = 3.0

    @property
    def name(self) -> str:
        return 'adb_player'

    async def collect(self) -> ProbeResult:
        """Collect from all configured devices."""
        self._cycle_count += 1
        start = time.monotonic()

        # Adaptive polling: emergency mode polls every cycle
        effective_poll = self._poll_every_n
        last_kbps = 0
        if self._devices:
            last_kbps = self._devices[0].last_bitrate_kbps
        if last_kbps > 0 and (last_kbps / 1000.0) < self.EMERGENCY_BITRATE_MBPS:
            effective_poll = self._poll_emergency_n  # poll every cycle

        # Skip cycles for performance (unless emergency)
        if self._cycle_count % effective_poll != 0:
            # Return cached data
            data = self._get_cached_data()
            data['skipped'] = True
            data['buffer_source'] = 'cached'
            data['zap_detected'] = False
            data['zap_reason'] = ''
            latency = (time.monotonic() - start) * 1000
            return ProbeResult(source=self.name, success=True, data=data,
                               latency_ms=latency)

        all_data: Dict[str, Any] = {'devices': {}, 'skipped': False}
        any_success = False

        for device in self._devices:
            now = time.monotonic()

            # Check backoff
            if now < device.backoff_until:
                all_data['devices'][device.name] = {
                    'status': 'backoff',
                    'buffer_source': 'stale',
                    'buffer_us': device.last_buffer_us,
                    'bitrate_kbps': device.last_bitrate_kbps,
                }
                continue

            try:
                device_data = await self._query_device(device)
                device.connected = True
                device.consecutive_failures = 0
                device.last_success_time = now
                any_success = True
                all_data['devices'][device.name] = device_data
                all_data['devices'][device.name]['buffer_source'] = 'adb'
            except Exception as e:
                device.connected = False
                device.consecutive_failures += 1
                backoff = min(
                    2 ** device.consecutive_failures,
                    self._backoff_max
                )
                device.backoff_until = now + backoff
                logger.warning(f'ADB {device.name} failed ({device.consecutive_failures}x): '
                               f'{e} — backoff {backoff:.0f}s')
                all_data['devices'][device.name] = {
                    'status': 'error',
                    'error': str(e),
                    'buffer_source': 'stale',
                    'buffer_us': device.last_buffer_us,
                    'bitrate_kbps': device.last_bitrate_kbps,
                }

        # Aggregate best device data
        best = self._aggregate_best(all_data['devices'])
        all_data.update(best)
        all_data['buffer_source'] = 'adb' if any_success else 'stale'

        # ─── Zap detection ────────────────────────────────────────────
        current_obs = {
            'pid': best.get('pid'),
            'codec': best.get('codec'),
            'resolution': best.get('resolution'),
            'bitrate_kbps': best.get('bitrate_kbps', 0),
        }
        # Update bitrate history
        self._bitrate_history_mbps.append(best.get('bitrate_kbps', 0) / 1000.0)
        if len(self._bitrate_history_mbps) > self._bitrate_history_max:
            self._bitrate_history_mbps.pop(0)

        zap_detected, zap_reason = detect_zap(
            current=current_obs,
            last=self._last_observation,
            bitrate_history=self._bitrate_history_mbps,
        )

        # Update last observation (only when current is valid)
        if current_obs.get('pid') or current_obs.get('codec'):
            self._last_observation = current_obs

        all_data['zap_detected'] = zap_detected
        all_data['zap_reason'] = zap_reason

        if zap_detected:
            logger.info(f'ZAP DETECTED: {zap_reason} — '
                        f'last={self._last_observation} current={current_obs}')

        latency = (time.monotonic() - start) * 1000
        return ProbeResult(source=self.name, success=any_success,
                           data=all_data, latency_ms=latency)

    async def _query_device(self, device: ADBDeviceState) -> Dict[str, Any]:
        """Query a single device via ADB."""
        # Ensure connected
        await self._adb_exec_args(
            ['adb', 'connect', device.address],
            timeout=self._connect_timeout
        )

        # Get logcat — include MediaCodecLogger for OTT Navigator bitrate stats
        # Must use exec (not shell) to correctly pass '*:S' as a literal arg.
        # Use -t 500 to ensure we capture video bitrate entries (emitted every ~5s)
        logcat_args = [
            'adb', '-s', device.address, 'shell',
            'logcat', '-d', '-t', '500',
            'MediaCodecLogger:I', 'ExoPlayer:D', 'ExoPlayerImpl:D',
            'VideoRenderer:D', 'AudioRenderer:D', '*:S',
        ]
        output = await self._adb_exec_args(logcat_args, timeout=self._command_timeout)

        # Parse output
        result = self._parse_logcat(output)

        # Update cached state
        if result.get('buffer_us', 0) > 0:
            device.last_buffer_us = result['buffer_us']
        if result.get('bitrate_kbps', 0) > 0:
            device.last_bitrate_kbps = result['bitrate_kbps']
        device.last_dropped_frames = result.get('dropped_frames', 0)
        device.last_audio_underruns = result.get('audio_underruns', 0)

        return result

    async def _adb_exec_args(self, args: list, timeout: float) -> str:
        """Execute ADB command with argument list (no shell interpretation)."""
        try:
            proc = await asyncio.create_subprocess_exec(
                *args,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(), timeout=timeout
            )
            return stdout.decode('utf-8', errors='replace')
        except asyncio.TimeoutError:
            raise TimeoutError(f'ADB command timed out after {timeout}s: {args}')
        except Exception as e:
            raise RuntimeError(f'ADB exec failed: {e}')

    async def _adb_exec(self, cmd: str, timeout: float) -> str:
        """Execute ADB command with timeout (shell mode, legacy)."""
        try:
            proc = await asyncio.create_subprocess_shell(
                cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(), timeout=timeout
            )
            return stdout.decode('utf-8', errors='replace')
        except asyncio.TimeoutError:
            raise TimeoutError(f'ADB command timed out after {timeout}s: {cmd}')
        except Exception as e:
            raise RuntimeError(f'ADB exec failed: {e}')

    # ═══════════════════════════════════════════════════════════════════════
    # BITRATE FLOOR TABLE — Per Resolution (Kbps)
    # These are ABSOLUTE MINIMUMS. If the stream drops below these values,
    # the Guardian flags a floor violation and escalates demand.
    # ═══════════════════════════════════════════════════════════════════════
    BITRATE_FLOOR_KBPS = {
        '4K':   14000,   # 14 Mbps — HEVC/AVC 4K sports minimum
        'UHD':  14000,   # Alias for 4K
        'FHD':  5000,    # 5 Mbps — 1080p standard
        '1080': 5000,    # Alias
        'HD':   2000,    # 2 Mbps — 720p
        '720':  2000,    # Alias
        'SD':   1000,    # 1 Mbps — 480p and below
        '480':  1000,    # Alias
    }

    def _parse_logcat(self, output: str) -> Dict[str, Any]:
        """Parse ExoPlayer/OTT Navigator logcat output.
        
        OTT Navigator emits MediaCodecLogger lines like:
          PID.4K.HW.omx.video.avc.bitrateInKbps = 7058   (VIDEO 4K)
          PID.FHD.HW.omx.video.avc.bitrateInKbps = 4500  (VIDEO 1080p)
          PID.HD.SW.c2.video.avc.bitrateInKbps = 2100     (VIDEO 720p)
          PID.SW.c2.audio.mp4a.bitrateInKbps = 189        (AUDIO)
        
        Extracts:
          - Video bitrate (filtering out audio lines)
          - Resolution label (4K/FHD/HD/SD) from the tag
          - Codec info (avc/hevc)
          - Decoder type (HW/SW)
          - Bitrate floor violation flag
        """
        result: Dict[str, Any] = {
            'buffer_us': 0, 'buffer_ms': 0, 'buffer_percent': 0,
            'position_us': 0, 'bitrate_kbps': 0, 'audio_bitrate_kbps': 0,
            'dropped_frames': 0, 'audio_underruns': 0,
            # New: resolution-aware fields
            'resolution': 'unknown',
            'codec': 'unknown',
            'decoder_type': 'unknown',  # HW or SW
            'bitrate_floor_kbps': 0,
            'bitrate_floor_violation': False,
            'bitrate_deficit_kbps': 0,
        }

        if not output:
            return result

        # ── Extract VIDEO bitrate + resolution from MediaCodecLogger ──────
        # Pattern: PID.{RESOLUTION}.{HW|SW}.{decoder}.video.{codec}.bitrateInKbps = {value}
        # Examples:
        #   5526.4K.HW.omx.video.avc.bitrateInKbps = 7058
        #   5526.FHD.SW.c2.video.hevc.bitrateInKbps = 4500
        video_pattern = re.compile(
            r'(\d+)\.(\w+)\.(HW|SW)\.[\w.]+\.video\.(\w+)\.bitrateInKbps\s*=\s*(\d+)',
            re.IGNORECASE
        )

        video_bitrates = []
        audio_bitrates = []
        last_resolution = 'unknown'
        last_codec = 'unknown'
        last_decoder = 'unknown'

        for line in output.splitlines():
            # Try the structured video pattern first
            vm = video_pattern.search(line)
            if vm:
                res_label = vm.group(2).upper()   # 4K, FHD, HD, SD
                decoder = vm.group(3).upper()     # HW or SW
                codec = vm.group(4).lower()       # avc, hevc, h265
                bitrate = int(vm.group(5))
                video_bitrates.append(bitrate)
                last_resolution = res_label
                last_codec = codec
                last_decoder = decoder
                continue

            # Fallback: generic bitrateInKbps match
            m = re.search(r'bitrateInKbps\s*=\s*(\d+)', line)
            if m:
                val = int(m.group(1))
                if 'video' in line.lower():
                    video_bitrates.append(val)
                elif 'audio' in line.lower():
                    audio_bitrates.append(val)
                else:
                    if val > 500:
                        video_bitrates.append(val)
                    else:
                        audio_bitrates.append(val)

        # Set video bitrate (most recent)
        if video_bitrates:
            result['bitrate_kbps'] = video_bitrates[-1]
        if audio_bitrates:
            result['audio_bitrate_kbps'] = audio_bitrates[-1]

        # Set resolution metadata
        result['resolution'] = last_resolution
        result['codec'] = last_codec
        result['decoder_type'] = last_decoder

        # ── BITRATE FLOOR ENFORCEMENT ─────────────────────────────────────
        # Look up the floor for this resolution
        floor = self.BITRATE_FLOOR_KBPS.get(last_resolution, 0)
        result['bitrate_floor_kbps'] = floor

        if floor > 0 and result['bitrate_kbps'] > 0:
            if result['bitrate_kbps'] < floor:
                result['bitrate_floor_violation'] = True
                result['bitrate_deficit_kbps'] = floor - result['bitrate_kbps']
                logger.warning(
                    f'⚠️ BITRATE FLOOR VIOLATION: {last_resolution} stream at '
                    f'{result["bitrate_kbps"]} Kbps < floor {floor} Kbps '
                    f'(deficit: {result["bitrate_deficit_kbps"]} Kbps)'
                )

        # ── Extract other ExoPlayer patterns ─────────────────────────────
        for key in ('buffered_duration_us', 'current_position_us', 'dropped_frames', 'audio_underruns'):
            pattern = self._patterns.get(key)
            if not pattern:
                continue
            matches = re.findall(pattern, output)
            if matches:
                val = int(matches[-1])
                if key == 'buffered_duration_us':
                    result['buffer_us'] = val
                    result['buffer_ms'] = val / 1000
                    result['buffer_percent'] = min(100.0, (val / 60_000_000) * 100)
                elif key == 'current_position_us':
                    result['position_us'] = val
                elif key == 'dropped_frames':
                    result['dropped_frames'] = val
                elif key == 'audio_underruns':
                    result['audio_underruns'] = val
                    result['audio_underruns'] = val

        return result

    def _get_cached_data(self) -> Dict[str, Any]:
        """Return cached data from all devices."""
        best_buffer = 0.0
        best_bitrate = 0.0
        for d in self._devices:
            if d.last_buffer_us > best_buffer:
                best_buffer = d.last_buffer_us
            if d.last_bitrate_kbps > best_bitrate:
                best_bitrate = d.last_bitrate_kbps
        return {
            'buffer_us': best_buffer,
            'buffer_ms': best_buffer / 1000,
            'buffer_percent': min(100.0, (best_buffer / 60_000_000) * 100),
            'bitrate_kbps': best_bitrate,
        }

    def _aggregate_best(self, devices: Dict[str, Dict]) -> Dict[str, Any]:
        """Pick best device metrics for decision engine."""
        best_buffer = 0.0
        best_bitrate = 0.0
        best_device_data = {}
        for name, data in devices.items():
            buf = data.get('buffer_us', 0)
            br = data.get('bitrate_kbps', 0)
            if buf > best_buffer:
                best_buffer = buf
            if br > best_bitrate:
                best_bitrate = br
                best_device_data = data
        return {
            'buffer_us': best_buffer,
            'buffer_ms': best_buffer / 1000,
            'buffer_percent': min(100.0, (best_buffer / 60_000_000) * 100),
            'bitrate_kbps': best_bitrate,
            'resolution': best_device_data.get('resolution', 'unknown'),
            'codec': best_device_data.get('codec', 'unknown'),
            'decoder_type': best_device_data.get('decoder_type', 'unknown'),
            'bitrate_floor_kbps': best_device_data.get('bitrate_floor_kbps', 0),
            'bitrate_floor_violation': best_device_data.get('bitrate_floor_violation', False),
            'bitrate_deficit_kbps': best_device_data.get('bitrate_deficit_kbps', 0),
        }
