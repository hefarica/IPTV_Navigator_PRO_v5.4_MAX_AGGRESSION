#!/usr/bin/env python3
"""Heuristic audit of HLS buffer and segment-duration declarations.

This is a source scan, not an HLS validator. It finds the defects that are easy
to miss in a large generator:

  * #EXT-X-TARGETDURATION hardcoded to a value smaller than a segment declared
    in the same file.
  * A static TARGETDURATION with no dynamic resolver in the same file.
  * bufferForPlaybackAfterRebufferMs too low (resume in a near-empty buffer).
  * X-Buffer-Target below 12 s.
  * ExoPlayer min/max buffer sized far beyond the chosen target.

Findings are file-scoped: a literal 2 in a test fixture is not compared with a
6 s segment in another file. Test files are skipped by default; use
--include-tests to scan them.

Exit 0 by default. With --fail-on-findings, exit 2 when any finding is present.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

SKIP_DIRS = {
    ".git", "node_modules", "vendor", "dist", "build", "coverage",
    "__pycache__", ".venv", "venv", ".idea", ".vscode",
}
EXTS = {".js", ".mjs", ".cjs", ".php", ".m3u8", ".json", ".kt", ".java", ".py", ".sh"}

PATTERNS = {
    "targetduration_literal": re.compile(r"#EXT-X-TARGETDURATION:(\d+)"),
    "targetduration_dynamic": re.compile(r"#EXT-X-TARGETDURATION:\$\{([^}]+)\}"),
    "segment_duration": re.compile(
        r"segment_duration(?:_s)?[\"']?\s*[:=]\s*[\"']?(\d+(?:\.\d+)?)"
    ),
    "min_buffer_ms": re.compile(r"\\*[\"']?minBufferMs\\*[\"']?\s*[:=]\s*\\*[\"']?(\d+)"),
    "max_buffer_ms": re.compile(r"\\*[\"']?maxBufferMs\\*[\"']?\s*[:=]\s*\\*[\"']?(\d+)"),
    "after_rebuffer_ms": re.compile(
        r"\\*[\"']?bufferForPlaybackAfterRebufferMs\\*[\"']?\s*[:=]\s*\\*[\"']?(\d+)"
    ),
    "x_buffer_target": re.compile(r"\\*[\"']?X-Buffer-Target\\*[\"']?\s*[:=]\s*\\*[\"']?(\d+)"),
    "x_buffer_min": re.compile(r"\\*[\"']?X-Buffer-Min\\*[\"']?\s*[:=]\s*\\*[\"']?(\d+)"),
    "x_buffer_max": re.compile(r"\\*[\"']?X-Buffer-Max\\*[\"']?\s*[:=]\s*\\*[\"']?(\d+)"),
    "dynamic_resolver": re.compile(r"__apeResolveTargetDuration|resolveTargetDuration"),
    "static_segment_header": re.compile(r"X-Segment-Duration[\"']?\s*[:=]\s*[\"']2[\"']"),
}

BUFFER_PATTERN_KEYS = {
    "minBufferMs": "min_buffer_ms",
    "maxBufferMs": "max_buffer_ms",
    "bufferForPlaybackAfterRebufferMs": "after_rebuffer_ms",
    "X-Buffer-Target": "x_buffer_target",
    "X-Buffer-Min": "x_buffer_min",
    "X-Buffer-Max": "x_buffer_max",
}


def is_test_file(path: Path) -> bool:
    name = path.name.lower()
    parts = {part.lower() for part in path.parts}
    return (
        name.startswith("test_")
        or ".test." in name
        or name.endswith("_test.py")
        or "tests" in parts
        or "__tests__" in parts
    )


def iter_files(root: Path, include_tests: bool):
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for name in filenames:
            path = Path(dirpath) / name
            if path.suffix.lower() not in EXTS:
                continue
            if name.endswith(".min.js"):
                continue
            if not include_tests and is_test_file(path):
                continue
            yield path


def add_match(store: list[dict], path: Path, line_no: int, value: str, line: str) -> None:
    store.append({
        "file": str(path),
        "line": line_no,
        "value": value,
        "text": line.strip()[:240],
    })


def scan_file(path: Path) -> dict:
    data = {
        "file": str(path),
        "segment_durations": [],
        "targetduration_literals": [],
        "targetduration_dynamic": [],
        "buffer_values": {
            "minBufferMs": [],
            "maxBufferMs": [],
            "bufferForPlaybackAfterRebufferMs": [],
            "X-Buffer-Target": [],
            "X-Buffer-Min": [],
            "X-Buffer-Max": [],
        },
        "has_dynamic_resolver": False,
        "static_segment_headers": [],
    }
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return data

    for line_no, line in enumerate(text.splitlines(), 1):
        m = PATTERNS["targetduration_literal"].search(line)
        if m:
            add_match(data["targetduration_literals"], path, line_no, m.group(1), line)
        m = PATTERNS["targetduration_dynamic"].search(line)
        if m:
            add_match(data["targetduration_dynamic"], path, line_no, m.group(1), line)
        m = PATTERNS["segment_duration"].search(line)
        if m:
            value = float(m.group(1))
            if value not in data["segment_durations"]:
                data["segment_durations"].append(value)
        for label, pattern_key in BUFFER_PATTERN_KEYS.items():
            m = PATTERNS[pattern_key].search(line)
            if m:
                add_match(data["buffer_values"][label], path, line_no, m.group(1), line)
        if PATTERNS["dynamic_resolver"].search(line):
            data["has_dynamic_resolver"] = True
        m = PATTERNS["static_segment_header"].search(line)
        if m:
            add_match(data["static_segment_headers"], path, line_no, "2", line)

    data["segment_durations"].sort()
    return data


def scan(root: Path, include_tests: bool) -> dict:
    files = [scan_file(path) for path in iter_files(root, include_tests)]
    segment_durations = sorted({
        value for item in files for value in item["segment_durations"]
    })
    buffer_values = {
        label: [match for item in files for match in item["buffer_values"][label]]
        for label in BUFFER_PATTERN_KEYS
    }
    return {
        "root": str(root),
        "files_scanned": len(files),
        "include_tests": include_tests,
        "segment_durations": segment_durations,
        "targetduration_literals": [
            match for item in files for match in item["targetduration_literals"]
        ],
        "targetduration_dynamic": [
            match for item in files for match in item["targetduration_dynamic"]
        ],
        "buffer_values": buffer_values,
        "has_dynamic_resolver": any(item["has_dynamic_resolver"] for item in files),
        "static_segment_headers": [
            match for item in files for match in item["static_segment_headers"]
        ],
        "files": files,
    }


def findings_for(result: dict) -> list[dict]:
    findings: list[dict] = []

    for item in result["files"]:
        path = item["file"]

        if item["targetduration_literals"]:
            values = sorted({int(match["value"]) for match in item["targetduration_literals"]})
            findings.append({
                "code": "HARDCODED_TARGETDURATION",
                "severity": "high",
                "file": path,
                "message": f"TARGETDURATION is a numeric literal ({values}); it cannot follow segment changes.",
                "evidence": item["targetduration_literals"][:6],
            })
            max_segment = max(item["segment_durations"], default=0)
            stale = [value for value in values if max_segment and value < max_segment]
            if stale:
                findings.append({
                    "code": "TARGETDURATION_STALE",
                    "severity": "high",
                    "file": path,
                    "message": (
                        f"TARGETDURATION {stale} is smaller than the maximum segment "
                        f"declared in this file ({max_segment:g} s)."
                    ),
                    "evidence": item["targetduration_literals"][:6],
                })
            if not item["has_dynamic_resolver"]:
                findings.append({
                    "code": "STATIC_TARGETDURATION",
                    "severity": "medium",
                    "file": path,
                    "message": "No dynamic TARGETDURATION resolver was found in this file.",
                    "evidence": item["targetduration_literals"][:3],
                })

        after = item["buffer_values"]["bufferForPlaybackAfterRebufferMs"]
        fast = [match for match in after if int(match["value"]) <= 1000]
        if fast:
            findings.append({
                "code": "REBUFFER_RESUME_TOO_FAST",
                "severity": "high",
                "file": path,
                "message": (
                    "bufferForPlaybackAfterRebufferMs <= 1000 ms resumes with almost no buffer; "
                    "this produces stall/resume oscillation."
                ),
                "evidence": fast[:6],
            })

        targets = item["buffer_values"]["X-Buffer-Target"]
        low = [match for match in targets if int(match["value"]) < 12000]
        if low:
            findings.append({
                "code": "BUFFER_TARGET_BELOW_12S",
                "severity": "medium",
                "file": path,
                "message": "X-Buffer-Target below 12 s leaves fewer than 6 segments of 2 s.",
                "evidence": low[:6],
            })

        mins = [int(match["value"]) for match in item["buffer_values"]["minBufferMs"]]
        maxs = [int(match["value"]) for match in item["buffer_values"]["maxBufferMs"]]
        if mins and maxs and max(mins) >= 60000 and max(maxs) >= 180000:
            findings.append({
                "code": "BUFFER_OVERSIZED",
                "severity": "low",
                "file": path,
                "message": (
                    "minBufferMs >= 60 s and maxBufferMs >= 180 s can cost hundreds of MB "
                    "at 4K bitrates and slow zapping."
                ),
                "evidence": item["buffer_values"]["minBufferMs"][:3] +
                            item["buffer_values"]["maxBufferMs"][:3],
            })

        if item["static_segment_headers"] and max(item["segment_durations"], default=0) > 2:
            findings.append({
                "code": "STATIC_SEGMENT_HEADER",
                "severity": "medium",
                "file": path,
                "message": "X-Segment-Duration is fixed at 2 while this file declares longer segments.",
                "evidence": item["static_segment_headers"][:6],
            })

    return findings


def print_human(result: dict, findings: list[dict]) -> None:
    print(f"HLS buffer audit: {result['root']}")
    print(f"  files scanned: {result['files_scanned']}"
          + ("" if result["include_tests"] else " (tests excluded)"))
    print(f"  segment durations: {result['segment_durations'] or '(none found)'}")
    print(f"  dynamic resolver: {'yes' if result['has_dynamic_resolver'] else 'no'}")
    print(f"  TARGETDURATION literals: {len(result['targetduration_literals'])}")
    print(f"  TARGETDURATION dynamic:  {len(result['targetduration_dynamic'])}")
    for key, items in result["buffer_values"].items():
        if items:
            values = sorted({item["value"] for item in items}, key=lambda value: int(value))
            print(f"  {key}: {values}")
    print()
    if not findings:
        print("FINDINGS: none")
        return
    print(f"FINDINGS: {len(findings)}")
    for finding in findings:
        print(f"  [{finding['severity'].upper()}] {finding['code']} in {finding['file']}")
        print(f"      {finding['message']}")
        for item in finding["evidence"][:3]:
            print(f"      {item['file']}:{item['line']}  {item['text']}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Heuristic HLS buffer/TARGETDURATION audit.")
    parser.add_argument("root", help="repository or directory to scan")
    parser.add_argument("--json", action="store_true", help="emit JSON")
    parser.add_argument("--include-tests", action="store_true", help="scan test files too")
    parser.add_argument("--fail-on-findings", action="store_true", help="exit 2 on findings")
    args = parser.parse_args()

    root = Path(args.root).expanduser().resolve()
    if not root.is_dir():
        parser.error(f"not a directory: {root}")

    result = scan(root, args.include_tests)
    findings = findings_for(result)
    payload = {"summary": {key: value for key, value in result.items() if key != "files"},
               "findings": findings}

    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        print_human(result, findings)

    if args.fail_on_findings and findings:
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
