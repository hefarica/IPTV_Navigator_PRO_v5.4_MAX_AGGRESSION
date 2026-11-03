#!/usr/bin/env python3
"""Read a public HLS master and emit an ABR reference report.

Read-only. It never calls the private provider list and never sends credentials.
The report is the shape ARA can consume for variant policy and QoE decisions.
"""
from __future__ import annotations

import argparse
import json
import re
import urllib.request
from pathlib import Path
from urllib.parse import urljoin

DEFAULT_URLS = [
    "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    "https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_ts/master.m3u8",
]
ATTR = re.compile(r'([A-Z0-9-]+)=("[^"]*"|[^,]*)')


def attrs(line: str) -> dict[str, str]:
    out = {}
    for key, value in ATTR.findall(line):
        out[key] = value.strip('"')
    return out


def parse_master(text: str, base_url: str) -> dict:
    variants, media, iframes = [], [], []
    pending = None
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if line.startswith("#EXT-X-STREAM-INF:"):
            pending = attrs(line.split(":", 1)[1])
            continue
        if line.startswith("#EXT-X-MEDIA:"):
            media.append(attrs(line.split(":", 1)[1]))
            continue
        if line.startswith("#EXT-X-I-FRAME-STREAM-INF:"):
            iframes.append(attrs(line.split(":", 1)[1]))
            continue
        if line.startswith("#"):
            continue
        if pending is not None:
            v = dict(pending)
            v["uri"] = urljoin(base_url, line)
            v["bandwidth"] = int(v.get("BANDWIDTH", "0") or 0)
            v["average_bandwidth"] = int(v.get("AVERAGE-BANDWIDTH", "0") or 0)
            variants.append(v)
            pending = None
    variants.sort(key=lambda v: v["bandwidth"])
    return {
        "base_url": base_url,
        "variant_count": len(variants),
        "media_count": len(media),
        "iframe_count": len(iframes),
        "variants": variants,
        "media": media,
        "iframes": iframes,
    }


def fetch(url: str, timeout: float) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "ARA-QoE-Reference/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("urls", nargs="*", help="public HLS master URL(s)")
    ap.add_argument("--timeout", type=float, default=15.0)
    ap.add_argument("--json-out", type=Path)
    args = ap.parse_args()
    urls = args.urls or DEFAULT_URLS
    report = []
    for url in urls:
        try:
            doc = fetch(url, args.timeout)
            parsed = parse_master(doc, url)
            parsed["status"] = "ok"
            parsed["selected_high"] = parsed["variants"][-1] if parsed["variants"] else None
            parsed["selected_low"] = parsed["variants"][0] if parsed["variants"] else None
            report.append(parsed)
            print(f"OK {url} variants={parsed['variant_count']} media={parsed['media_count']} iframe={parsed['iframe_count']}")
        except Exception as exc:
            report.append({"base_url": url, "status": "error", "error": type(exc).__name__, "message": str(exc)})
            print(f"ERROR {url}: {type(exc).__name__}")
    if args.json_out:
        args.json_out.write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(f"WROTE {args.json_out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
