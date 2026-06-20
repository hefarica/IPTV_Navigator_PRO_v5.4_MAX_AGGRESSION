#!/usr/bin/env python3
"""
ape_pixel_processor.py — Agente 3: Crystal Pixel Processor (ASYNC SUPERVISOR).

Owner override 2026-06-20 — DIRECTIVA TRANSCODE VPS PERMITIDO.

WHAT THIS IS:
  A systemd-style daemon that supervises ONE ffmpeg process per OPT-IN channel,
  transcoding the (verbatim provider) source -> HEVC 10-bit HDR -> HLS in /dev/shm.
  nginx then serves the transcoded variant for flagged channels.

WHAT THIS IS NOT (PROHIBITED, see CLAUDE.md):
  * NOT an nginx body_filter. Lua cannot decode video and a synchronous ffmpeg in
    body_filter blocks the worker -> instant freeze of every stream on it.
  * NOT a transcoder for the whole catalog. Opt-in flagship channels ONLY.

FREEZELESS-fallback: this service only PRODUCES HLS in /dev/shm. If it lags or a
channel's ffmpeg dies, it simply stops producing for that channel and nginx serves
the original passthrough (see nginx_transcode_serve.conf). It NEVER blocks playback.

Capacity: GPU (NVENC/VAAPI/Vulkan) -> a few 4K channels; CPU x265 -> 1-2 channels;
8K real-time is infeasible without a GPU even though it is permitted.
"""

from __future__ import annotations

import json
import os
import shutil
import signal
import subprocess
import sys
import time

try:
    from ape_hdr_color_science import HDRColorTransformer
except Exception:  # pragma: no cover - allow standalone syntax check without sibling
    HDRColorTransformer = None  # type: ignore

CONTROL_PATH = os.environ.get("CRYSTAL_CONTROL", "/etc/ape/crystal_transcode_control.json")
DEFAULT_OUT_ROOT = "/dev/shm/crystal"
RESTART_BACKOFF_S = 5
SUPERVISE_TICK_S = 2

# Corrected Level<->Resolution (Cardinal Law 1): 8K=6.1(L183), 4K@120=5.2, 4K@60=5.1.
PROFILES = {
    "CRYSTAL_8K":   {"w": 7680, "h": 4320, "fps": 60, "x265_level": "6.1", "crf": 16, "bitrate": "80M",  "scale": "lanczos"},
    "CRYSTAL_4K120": {"w": 3840, "h": 2160, "fps": 120, "x265_level": "5.2", "crf": 16, "bitrate": "45M", "scale": "lanczos"},
    "CRYSTAL_4K":   {"w": 3840, "h": 2160, "fps": 60, "x265_level": "5.1", "crf": 17, "bitrate": "30M",  "scale": "lanczos"},
    "CRYSTAL_1080": {"w": 1920, "h": 1080, "fps": 60, "x265_level": "4.1", "crf": 18, "bitrate": "14M",  "scale": "lanczos"},
}


def detect_hwaccel() -> str:
    """Return 'nvenc' | 'vaapi' | 'vulkan' | 'cpu' based on the local ffmpeg build."""
    if not shutil.which("ffmpeg"):
        return "cpu"
    try:
        enc = subprocess.run(["ffmpeg", "-hide_banner", "-encoders"],
                             capture_output=True, text=True, timeout=10).stdout
        accel = subprocess.run(["ffmpeg", "-hide_banner", "-hwaccels"],
                               capture_output=True, text=True, timeout=10).stdout
    except Exception:
        return "cpu"
    if "hevc_nvenc" in enc:
        return "nvenc"
    if "hevc_vaapi" in enc and "vaapi" in accel:
        return "vaapi"
    if "vulkan" in accel:
        return "vulkan"
    return "cpu"


def max_concurrent(hw: str, cfg: dict) -> int:
    if hw == "cpu":
        return int(cfg.get("max_concurrent_cpu", 1))
    return int(cfg.get("max_concurrent_gpu", 4))


def load_control() -> dict:
    try:
        with open(CONTROL_PATH, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except Exception as exc:
        log("control load failed (%s): %s -> nothing to transcode" % (CONTROL_PATH, exc))
        return {"global": {}, "channels": []}


def log(msg: str) -> None:
    sys.stderr.write("[crystal-transcode] %s\n" % msg)
    sys.stderr.flush()


def build_ffmpeg_cmd(channel: dict, hw: str, gcfg: dict) -> list[str] | None:
    prof_name = channel.get("profile", "CRYSTAL_4K")
    prof = PROFILES.get(prof_name, PROFILES["CRYSTAL_4K"])
    src = channel.get("source_url")
    chid = channel.get("channel_id", "ch")
    if not src:
        return None

    out_root = gcfg.get("out_root", DEFAULT_OUT_ROOT)
    out_dir = os.path.join(out_root, str(chid))
    os.makedirs(out_dir, exist_ok=True)
    out_m3u8 = os.path.join(out_dir, "index.m3u8")
    seg = os.path.join(out_dir, "seg_%05d.m4s")
    seg_secs = int(gcfg.get("segment_seconds", 4))
    list_size = int(gcfg.get("hls_list_size", 6))

    color = ""
    master_args: list[str] = []
    if HDRColorTransformer is not None:
        t = HDRColorTransformer()
        disp = t.DISPLAY_PROFILES.get("generic_hdr")
        color = t.build_color_filter(channel.get("hdr_mode", "SDR_TO_HDR_UPCONVERT"), disp)
        master_args = t.mastering_metadata_args(disp)

    # Scale (+ optional sharpen). minterpolate (motion interp) is OFF by default:
    # it is a BANNED directive (micro-cuts) and a CPU killer; only the explicit
    # per-channel opt-in flag turns it on, and the owner accepts the cost.
    vf_parts = ["scale=%d:%d:flags=%s" % (prof["w"], prof["h"], prof["scale"])]
    if channel.get("motion_interp") and gcfg.get("motion_interp_default") is not False:
        vf_parts.append("minterpolate=fps=%d:mi_mode=mci:mc_mode=aobmc" % prof["fps"])
        log("WARN ch=%s motion_interp ON (banned-by-default, CPU heavy)" % chid)
    vf_parts.append("unsharp=5:5:0.6:3:3:0.3")
    if color:
        vf_parts.append(color)
    vf = ",".join(vf_parts)

    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "warning",
           "-fflags", "+genpts+discardcorrupt", "-i", src]

    if hw == "nvenc":
        cmd += ["-c:v", "hevc_nvenc", "-preset", "p5", "-rc", "vbr", "-cq", str(prof["crf"])]
    elif hw == "vaapi":
        cmd += ["-c:v", "hevc_vaapi", "-qp", str(prof["crf"])]
    else:
        x265 = "level-idc=%s:%s" % (prof["x265_level"], ":".join(master_args)) if master_args \
               else "level-idc=%s" % prof["x265_level"]
        cmd += ["-c:v", "libx265", "-preset", "fast", "-crf", str(prof["crf"]),
                "-x265-params", x265]

    cmd += ["-vf", vf, "-pix_fmt", "yuv420p10le",
            "-color_primaries", "bt2020", "-color_trc", "smpte2084", "-colorspace", "bt2020nc",
            "-c:a", "copy",
            "-f", "hls", "-hls_time", str(seg_secs), "-hls_list_size", str(list_size),
            "-hls_flags", "delete_segments+independent_segments+temp_file",
            "-hls_segment_type", "fmp4", "-hls_segment_filename", seg, out_m3u8]
    return cmd


class TranscodeSupervisor:
    """Spawns + restarts one ffmpeg per enabled channel. Never blocks playback."""

    def __init__(self) -> None:
        self.procs: dict[str, subprocess.Popen] = {}
        self.next_start: dict[str, float] = {}
        self._stop = False

    def stop(self, *_args) -> None:
        self._stop = True

    def reconcile(self) -> None:
        cfg = load_control()
        gcfg = cfg.get("global", {})
        hw = detect_hwaccel()
        cap = max_concurrent(hw, gcfg)
        enabled = [c for c in cfg.get("channels", []) if c.get("enabled")][:cap]
        want = {str(c["channel_id"]): c for c in enabled if c.get("channel_id")}

        # Kill channels no longer wanted.
        for chid in list(self.procs):
            if chid not in want:
                self._kill(chid)

        # Start/restart wanted channels (with backoff).
        now = time.time()
        for chid, channel in want.items():
            proc = self.procs.get(chid)
            if proc and proc.poll() is None:
                continue  # healthy
            if now < self.next_start.get(chid, 0):
                continue  # backing off -> nginx serves passthrough meanwhile
            cmd = build_ffmpeg_cmd(channel, hw, gcfg)
            if not cmd:
                continue
            try:
                self.procs[chid] = subprocess.Popen(cmd)
                log("started ch=%s hw=%s profile=%s (cap=%d)" % (chid, hw, channel.get("profile"), cap))
            except Exception as exc:
                log("spawn failed ch=%s: %s" % (chid, exc))
                self.next_start[chid] = now + RESTART_BACKOFF_S

    def _kill(self, chid: str) -> None:
        proc = self.procs.pop(chid, None)
        if proc and proc.poll() is None:
            try:
                proc.terminate()
                proc.wait(timeout=5)
            except Exception:
                try:
                    proc.kill()
                except Exception:
                    pass
        log("stopped ch=%s" % chid)

    def run(self) -> None:
        signal.signal(signal.SIGTERM, self.stop)
        signal.signal(signal.SIGINT, self.stop)
        log("supervisor up (control=%s)" % CONTROL_PATH)
        while not self._stop:
            try:
                self.reconcile()
            except Exception as exc:
                log("reconcile error (non-fatal): %s" % exc)
            time.sleep(SUPERVISE_TICK_S)
        for chid in list(self.procs):
            self._kill(chid)
        log("supervisor down")


def main() -> int:
    TranscodeSupervisor().run()
    return 0


if __name__ == "__main__":
    sys.exit(main())
