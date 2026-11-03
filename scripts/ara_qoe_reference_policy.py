#!/usr/bin/env python3
"""Turn a public HLS ABR master into an ARA single-CBR reference policy.

No provider list, no credentials, no writes to VPS/CDN. The output is a
fixture ARA can consume for manifest policy and QoE result correlation.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from hls_reference_probe import DEFAULT_URLS, fetch, parse_master  # noqa: E402


def choose(variants: list[dict], target_bps: int | None) -> tuple[dict | None, bool]:
    if not variants:
        return None, False
    if target_bps is None:
        return variants[-1], False
    exact = [v for v in variants if v["bandwidth"] == target_bps]
    if exact:
        return exact[-1], True
    eligible = [v for v in variants if v["bandwidth"] <= target_bps]
    return (max(eligible, key=lambda v: v["bandwidth"]) if eligible else variants[0]), False


def policy_for(url: str, target_bps: int | None) -> dict:
    doc = fetch(url, 15.0)
    parsed = parse_master(doc, url)
    selected, exact = choose(parsed["variants"], target_bps)
    if selected is None:
        return {"reference_url": url, "status": "no_variants"}
    actual = selected.get("bandwidth", 0)
    requested = target_bps if target_bps is not None else actual
    degraded = requested is not None and actual != requested
    return {
        "schema": "ara.qoe.reference_policy.v2",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "reference_url": url,
        "selection_mode": "DUAL_CBR_METADATA",
        "requested_cbr_bps": requested,
        "selected": {
            "bandwidth_bps": actual,
            "average_bandwidth_bps": selected.get("average_bandwidth", 0),
            "resolution": selected.get("RESOLUTION", ""),
            "codecs": selected.get("CODECS", ""),
            "frame_rate": selected.get("FRAME-RATE", ""),
            "uri": selected.get("uri", ""),
            "exact_requested_cbr": exact,
        },
        "source_layer": {
            "mode": "REAL_CBR" if exact else "DEGRADED_SOURCE",
            "actual_bps": actual,
            "authority": "measured_variant_declaration",
        },
        "metadata_layer": {
            "requested_bps": requested,
            "declared_bps": requested,
            "authority": "declared_only",
            "enabled": True,
            "warning": None if exact else "source_below_requested_cbr",
        },
        "degradation": {
            "degraded": degraded,
            "reason": None if not degraded else "source_has_no_exact_cbr",
            "fallback_order": [
                "source_exact_cbr",
                "source_highest_below_requested",
                "metadata_declared_only",
                "safe_lowest_variant",
            ],
            "policy": "If source is below requested, play the selected source; keep the 14 Mbps declaration only as declared_only, never as verified CBR.",
        },
        "manifest_policy": {
            "one_stream_inf_only": True,
            "declared_bandwidth_must_equal_real_cbr": exact,
            "metadata_declared_bps": requested,
            "target_duration_source": "measured",
            "buffer_floor_pct": 60,
            "buffer_ceiling_pct": None,
        },
        "telemetry_contract": {
            "fields": [
                "timestamp",
                "frame_gap_ms",
                "buffer_pct",
                "bitrate_bps",
                "media_sequence",
                "stall_ms",
            ],
            "result_schema": "ara.qoe.result.v1",
        },
        "source_variant_count": parsed["variant_count"],
        "source_media_count": parsed["media_count"],
        "source_iframe_count": parsed["iframe_count"],
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("urls", nargs="*")
    ap.add_argument("--target-bps", type=int)
    ap.add_argument("--out", type=Path, required=True)
    args = ap.parse_args()
    urls = args.urls or DEFAULT_URLS
    out = []
    for url in urls:
        try:
            p = policy_for(url, args.target_bps)
            p["status"] = "ok"
            out.append(p)
            print(f"OK {url} selected={p.get('selected', {}).get('bandwidth_bps')}")
        except Exception as exc:
            out.append({"reference_url": url, "status": "error", "error": type(exc).__name__})
            print(f"ERROR {url}: {type(exc).__name__}")
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(f"WROTE {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
