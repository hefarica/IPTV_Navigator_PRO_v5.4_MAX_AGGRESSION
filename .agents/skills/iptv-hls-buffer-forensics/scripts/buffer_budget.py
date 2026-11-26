#!/usr/bin/env python3
"""Compute a buffer budget for HLS live playback.

The output separates three different things that are often confused:

  * X-Buffer-Target: manifest/player target in milliseconds.
  * ExoPlayer minBufferMs / maxBufferMs: LoadControl working floor and ceiling.
  * bufferForPlaybackAfterRebufferMs: wait before resuming after a stall.

The default target follows a policy curve by bitrate. It is not a claim that a
larger buffer creates throughput: if sustained throughput is below the bitrate,
no buffer size prevents depletion.
"""

from __future__ import annotations

import argparse
import json
import sys


def positive_float(value: str) -> float:
    try:
        number = float(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"not a number: {value}") from exc
    if number <= 0:
        raise argparse.ArgumentTypeError("must be > 0")
    return number


def policy_target_s(bitrate_mbps: float) -> int:
    """Policy curve: keep RAM bounded without starving 2/4/6 s segments."""
    if bitrate_mbps <= 25:
        return 30
    if bitrate_mbps <= 80:
        return 24
    if bitrate_mbps <= 150:
        return 20
    return 12


def build_result(
    bitrate_mbps: float,
    segment_s: float,
    target_s: int | None,
    budget_mb: float,
) -> dict:
    target_source = "explicit"
    if target_s is None:
        target_s = policy_target_s(bitrate_mbps)
        target_source = "policy"
    target_s = max(1, int(round(target_s)))

    x_buffer_min_s = int(round(target_s * 0.625))
    x_buffer_max_s = target_s * 2
    exo_min_ms = max(15000, int(round(target_s * 1.25)) * 1000)
    exo_max_ms = max(45000, int(round(target_s * 3.75)) * 1000)
    memory_at_target_mb = target_s * bitrate_mbps / 8.0
    memory_at_max_mb = x_buffer_max_s * bitrate_mbps / 8.0

    warnings: list[str] = []
    if memory_at_target_mb > budget_mb:
        warnings.append(
            f"target uses {memory_at_target_mb:.1f} MB, above the {budget_mb:g} MB budget"
        )
    if target_s / segment_s < 4:
        warnings.append(
            f"target holds only {target_s / segment_s:.1f} segments of {segment_s:g} s; "
            "one slow segment plus a retry can drain it"
        )
    if target_s < 12:
        warnings.append("target below 12 s is not a safe live buffer")
    if target_s > 30:
        warnings.append("target above 30 s increases zapping latency and RAM")

    return {
        "bitrate_mbps": bitrate_mbps,
        "segment_s": segment_s,
        "budget_mb": budget_mb,
        "target_source": target_source,
        "target_s": target_s,
        "target_ms": target_s * 1000,
        "segments_in_target": round(target_s / segment_s, 2),
        "x_buffer_target_ms": target_s * 1000,
        "x_buffer_min_ms": x_buffer_min_s * 1000,
        "x_buffer_max_ms": x_buffer_max_s * 1000,
        "exo_min_buffer_ms": exo_min_ms,
        "exo_max_buffer_ms": exo_max_ms,
        "buffer_for_playback_ms": 500,
        "buffer_for_playback_after_rebuffer_ms": 3000,
        "memory_at_target_mb": round(memory_at_target_mb, 1),
        "memory_at_max_mb": round(memory_at_max_mb, 1),
        "warnings": warnings,
    }


def print_human(result: dict) -> None:
    print("Buffer budget")
    print(f"  bitrate: {result['bitrate_mbps']:g} Mbps")
    print(f"  segment: {result['segment_s']:g} s")
    print(f"  budget:  {result['budget_mb']:g} MB")
    print()
    print(f"  target:  {result['target_s']} s  "
          f"({result['segments_in_target']:.1f} segments, source {result['target_source']})")
    print(f"  X-Buffer-Target: {result['x_buffer_target_ms']} ms")
    print(f"  X-Buffer-Min:    {result['x_buffer_min_ms']} ms")
    print(f"  X-Buffer-Max:    {result['x_buffer_max_ms']} ms")
    print(f"  ExoPlayer minBufferMs: {result['exo_min_buffer_ms']} ms")
    print(f"  ExoPlayer maxBufferMs: {result['exo_max_buffer_ms']} ms")
    print(f"  after rebuffer:  {result['buffer_for_playback_after_rebuffer_ms']} ms")
    print()
    print(f"  RAM at target: {result['memory_at_target_mb']:.1f} MB")
    print(f"  RAM at max:    {result['memory_at_max_mb']:.1f} MB")
    if result["warnings"]:
        print()
        for warning in result["warnings"]:
            print(f"  WARNING: {warning}")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Compute HLS buffer target, ExoPlayer LoadControl and RAM budget."
    )
    parser.add_argument("--bitrate-mbps", type=positive_float, required=True)
    parser.add_argument("--segment-s", type=positive_float, default=2.0)
    parser.add_argument(
        "--target-s", type=positive_float, default=None,
        help="override the policy target in seconds",
    )
    parser.add_argument("--budget-mb", type=positive_float, default=384.0)
    parser.add_argument("--json", action="store_true", help="emit JSON instead of text")
    args = parser.parse_args()

    result = build_result(
        bitrate_mbps=args.bitrate_mbps,
        segment_s=args.segment_s,
        target_s=args.target_s,
        budget_mb=args.budget_mb,
    )
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print_human(result)
    return 0


if __name__ == "__main__":
    sys.exit(main())
