#!/usr/bin/env python3
"""
audit_lista_emitted.py — Auditor de M3U8 emitidas.

Aplica las 7+8 trampas (URL Constructor + EXTHTTP) y B1..B6 sobre
cualquier .m3u8 y produce scorecard JSON con conteos exactos.

Usage:
    python audit_lista_emitted.py <ruta.m3u8> [--out scorecard.json]
"""
import json
import re
import sys
from collections import Counter
from pathlib import Path


CHECKS = {
    "A1_omega_live_p0_hardcoded": r'^#EXT-X-DATERANGE:.*ID="omega-live-P0"',
    "A2_omega_build_p0_hardcoded": r'^#EXT-X-DEFINE:.*VALUE="P0_PERPROFILE_BULLETPROOF"',
    "A3_omega_build_orphan": r'^#EXT-X-DEFINE:NAME="OMEGA_BUILD"$',
    "A4_chrome_91_outdated": r'Chrome/9[0-9](?!\d)',
    "B3_adaptive_60000": r'adaptive-max(width|height)=60000',
    "B4_empty_http_iface": r'^#EXTVLCOPT:http-iface=$',
    "B4_empty_http_proxy": r'^#EXTVLCOPT:http-proxy=$',
    "B4_empty_http_proxy_pwd": r'^#EXTVLCOPT:http-proxy-pwd=$',
    "B5_empty_video_crop": r'^#EXTVLCOPT:video-crop=$',
    "B5_empty_audio_filter": r'^#EXTVLCOPT:audio-filter=$',
    "B5_empty_audio_visual": r'^#EXTVLCOPT:audio-visual=$',
    "B5_empty_sub_file": r'^#EXTVLCOPT:sub-file=$',
    "B5_empty_hls_aes_key": r'^#EXTVLCOPT:hls-aes-key=$',
    "B5_empty_ts_extra_pmt": r'^#EXTVLCOPT:ts-extra-pmt=$',
    "B6_empty_ape_codec_family": r'ape-codec-family=""',
    "C1_x_ua_label_count": r'"X-User-Agent-[A-Za-z]+":',
    "C2_ip_leak_xff_hetzner": r'"X-Forwarded-For":"(159\.69\.|46\.4\.|78\.46\.|88\.99\.|95\.216\.|136\.243\.)',
    "C2_ip_leak_real_ip_hetzner": r'"X-Real-IP":"(159\.69\.|46\.4\.|78\.46\.|88\.99\.|95\.216\.|136\.243\.)',
    "C2_ip_leak_client_ip_hetzner": r'"X-Client-IP":"(159\.69\.|46\.4\.|78\.46\.|88\.99\.|95\.216\.|136\.243\.)',
    "C2_ip_xff_any": r'"X-Forwarded-For":"',
    "C2_ip_real_ip_any": r'"X-Real-IP":"',
    "C2_ip_client_ip_any": r'"X-Client-IP":"',
    "C3_akamai_x_cache": r'"X-Cache":"',
    "C3_akamai_x_cache_lookup": r'"X-Cache-Lookup":"',
    "C3_akamai_x_cache_status": r'"X-Cache-Status":"',
    "C3_varnish_x_varnish": r'"X-Varnish":"',
    "C3_akamai_x_served_by": r'"X-Served-By":"',
    "C3_akamai_x_timer": r'"X-Timer":"',
    "C3_akamai_x_age": r'"X-Age":"',
    "C3_akamai_x_ttl": r'"X-TTL":"',
    "C3_akamai_x_grace": r'"X-Grace":"',
    "C3_akamai_x_hits": r'"X-Hits":"',
    "C3_akamai_x_fetch_error": r'"X-Fetch-Error":"',
    "C7_connection_keepalive_in_exthttp": r'"Connection":"keep-alive"',
    "C7_keepalive_param_in_exthttp": r'"Keep-Alive":"timeout',
}

# Cross-line / cross-field checks
def cross_line_b1(lines_in_channel: list) -> bool:
    """B1: video-hdr-mode=SDR + video-filter=zscale=transfer=st2084 coexisten."""
    has_sdr = any("video-hdr-mode=SDR" in l for l in lines_in_channel)
    has_st2084 = any("video-filter=zscale=transfer=st2084" in l for l in lines_in_channel)
    return has_sdr and has_st2084


def cross_field_c5(exthttp_line: str, profile: str) -> bool:
    """C5: X-Video-Range=SDR + X-HDR-Nits>200 (incoherente) o profile=P3 + X-Resolution=3840x2160."""
    has_sdr = '"X-Video-Range":"SDR"' in exthttp_line
    nits_match = re.search(r'"X-HDR-Nits":"(\d+)"', exthttp_line)
    if has_sdr and nits_match and int(nits_match.group(1)) > 200:
        return True
    if profile == "P3":
        if '"X-Resolution":"3840x2160"' in exthttp_line or '"X-Resolution":"7680x4320"' in exthttp_line:
            return True
    return False


def cross_field_c6(exthttp_line: str, ua_chosen: str) -> bool:
    """C6: Sec-CH-UA-Platform=Android + Sec-CH-UA-Mobile=?1 con UA SmartTV."""
    is_smarttv = bool(re.search(r"Web0S|Tizen|SMART-TV|SmartHub", ua_chosen, re.I))
    has_android_platform = '"Sec-CH-UA-Platform":"\\"Android\\""' in exthttp_line
    has_mobile_yes = '"Sec-CH-UA-Mobile":"?1"' in exthttp_line
    return is_smarttv and (has_android_platform or has_mobile_yes)


def audit(path: Path) -> dict:
    counts = Counter()
    channels = 0
    sdr_with_st2084 = 0
    c5_violations = 0
    c6_violations = 0
    current_channel_lines = []
    current_profile = None

    with path.open("r", encoding="utf-8", errors="replace") as fh:
        for line in fh:
            if line.startswith("#EXTINF:"):
                if current_channel_lines and cross_line_b1(current_channel_lines):
                    sdr_with_st2084 += 1
                channels += 1
                current_channel_lines = [line]
                m = re.search(r'ape-profile="(P[0-9])"', line)
                current_profile = m.group(1) if m else None
            elif line.startswith("http://") or line.startswith("https://"):
                current_channel_lines.append(line)
            else:
                current_channel_lines.append(line)
            for name, pattern in CHECKS.items():
                if re.search(pattern, line):
                    counts[name] += 1
            if line.startswith("#EXTHTTP:"):
                if current_profile and cross_field_c5(line, current_profile):
                    c5_violations += 1
                m_ua = re.search(r'"User-Agent":"([^"]+)"', line)
                if m_ua and cross_field_c6(line, m_ua.group(1)):
                    c6_violations += 1

        if current_channel_lines and cross_line_b1(current_channel_lines):
            sdr_with_st2084 += 1

    counts["B1_sdr_with_st2084"] = sdr_with_st2084
    counts["C5_body_contradictions"] = c5_violations
    counts["C6_secchua_smarttv_mismatch"] = c6_violations
    counts["TOTAL_CHANNELS"] = channels
    return dict(counts)


def main(argv):
    if len(argv) < 2:
        print("Usage: audit_lista_emitted.py <ruta.m3u8> [--out scorecard.json]")
        sys.exit(1)
    path = Path(argv[1])
    out = None
    if "--out" in argv:
        out = Path(argv[argv.index("--out") + 1])
    result = audit(path)
    text = json.dumps(result, indent=2)
    if out:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(text, encoding="utf-8")
    print(text)


if __name__ == "__main__":
    main(sys.argv)
