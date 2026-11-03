#!/usr/bin/env python3
"""Build a single-variant CBR master from a PUBLIC HLS master.

Read-only against public test CDNs. No provider list, no credentials.
The generated master has exactly one EXT-X-STREAM-INF; the declared
BANDWIDTH is the selected variant's measured declaration, never invented.
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path
from urllib.parse import urljoin

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from hls_reference_probe import DEFAULT_URLS, fetch, parse_master  # noqa: E402

URI_ATTR = re.compile(r'(URI=")([^"]+)(")')


def pick(variants: list[dict], target: int | None) -> tuple[dict | None, bool]:
    if not variants:
        return None, False
    if target is None:
        return variants[-1], False
    exact = [v for v in variants if v["bandwidth"] == target]
    if exact:
        return exact[-1], True
    below = [v for v in variants if v["bandwidth"] <= target]
    return (max(below, key=lambda v: v["bandwidth"]) if below else variants[0]), False


def absolutize(line: str, base: str) -> str:
    if not line.startswith("#"):
        return urljoin(base, line)
    return URI_ATTR.sub(lambda m: m.group(1) + urljoin(base, m.group(2)) + m.group(3), line)


def build(doc: str, url: str, target: int | None) -> tuple[str, dict]:
    parsed = parse_master(doc, url)
    selected, exact = pick(parsed["variants"], target)
    if selected is None:
        raise ValueError("no variants")
    lines = [
        "#EXTM3U",
        "#EXT-X-VERSION:6",
        "# ARA-CBR: single variant, declared bandwidth equals selected source bandwidth",
    ]
    # Preserve audio/subtitle groups, but absolutize their URIs.
    for raw in doc.splitlines():
        if raw.startswith("#EXT-X-MEDIA:"):
            lines.append(absolutize(raw, url))
    attrs = []
    for key in ("BANDWIDTH", "AVERAGE-BANDWIDTH", "RESOLUTION", "FRAME-RATE",
                "CODECS", "AUDIO", "SUBTITLES", "CLOSED-CAPTIONS", "STABLE-VARIANT-ID"):
        val = selected.get(key)
        if val:
            attrs.append(f'{key}="{val}"' if key in ("CODECS", "AUDIO", "SUBTITLES", "CLOSED-CAPTIONS", "STABLE-VARIANT-ID") else f"{key}={val}")
    lines.append("#EXT-X-STREAM-INF:" + ",".join(attrs))
    lines.append(selected["uri"])
    return "\n".join(lines) + "\n", {
        "selected_bps": selected["bandwidth"],
        "exact_requested_cbr": exact,
        "requested": target,
        "variant_count": parsed["variant_count"],
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default=DEFAULT_URLS[1])
    ap.add_argument("--target-bps", type=int, default=14_000_000)
    ap.add_argument("--out", type=Path, default=Path("fixtures/hls/public_cbr_master.m3u8"))
    args = ap.parse_args()
    doc = fetch(args.url, 15.0)
    out, meta = build(doc, args.url, args.target_bps)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(out, encoding="utf-8")
    print(f"WROTE {args.out}")
    print(f"source_variants={meta['variant_count']} selected_bps={meta['selected_bps']} exact={meta['exact_requested_cbr']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
