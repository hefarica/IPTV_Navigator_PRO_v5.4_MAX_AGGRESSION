#!/usr/bin/env python3
"""
Smoke test: M3U8 Honest-Rules invariants (R-1 + D-1 post-deploy assertions).

Validates that a generated .m3u8 file complies with the "Reglas Honestas"
declared in CLAUDE.md and enforced in commit 3fd36c3 (R-1 + D-1 fixes
to m3u8-typed-arrays-ultimate.js).

Three assertions:

  H-1 (D-1)  · NO `TYPE-1` substring anywhere in the file.
              Active emitters never emit HDCP-LEVEL=TYPE-1.
              The dead `build_stream_inf` would emit it only if rewired;
              the @deprecated guard says "do not rewire without re-audit".
              0 occurrences expected — even in `STABLE-VARIANT-ID`,
              `EXT-X-SESSION-DATA`, or comments-rendered-as-text.

  H-2 (R-1a) · NO `SUPPLEMENTAL-CODECS` substring.
              CLAUDE.md forbids: lcev.1.1.1 hardcoded fake LCEVC
              would be embedded here. Only probe-verified
              `SUPPLEMENTAL-CODECS="dvh1...|dvhe..."` allowed (truth
              resolver path). 0 occurrences if no Dolby-Vision verified.

  H-3 (R-1b) · For EVERY `VIDEO-RANGE="PQ"` (or `=PQ`) emission, the
              same channel block MUST include EITHER:
                · `EXT-X-APE-CODEC-REAL:` tag (verified codec from probe), OR
                · `EXT-X-APE-CODEC-VERIFIED:true`, OR
                · `EXT-X-APE-FALLBACK-TIER:F0_` or `F1_` (verified tiers), OR
                · `EXT-X-APE-PROBED-AT:` (any timestamp = probe ran).

              Channel block = the lines between two `#EXTINF:` markers.

Usage:
  python smoke_m3u8_honest_rules.py <path-to.m3u8>

Exit codes:
  0  · all 3 invariants PASS
  1  · any invariant FAILED
  2  · usage / file not found error

Output: structured JSON to stdout with verdict + counts + sample violations.
"""
import json
import os
import re
import sys
from typing import Dict, List


PQ_PATTERN     = re.compile(r'VIDEO-RANGE\s*=\s*"?PQ"?')
TYPE1_PATTERN  = re.compile(r'TYPE-1')
SUPCO_PATTERN  = re.compile(r'SUPPLEMENTAL-CODECS')
PROBE_EVIDENCE = (
    'EXT-X-APE-CODEC-REAL:',
    'EXT-X-APE-CODEC-VERIFIED:true',
    'EXT-X-APE-FALLBACK-TIER:F0_',
    'EXT-X-APE-FALLBACK-TIER:F1_',
    'EXT-X-APE-PROBED-AT:',
)


def split_into_channel_blocks(text: str) -> List[List[str]]:
    """Split playlist into channel blocks. Each block starts at #EXTINF: and
    ends at the next #EXTINF: or EOF. The first global header (before any
    #EXTINF:) is block index 0."""
    blocks: List[List[str]] = []
    current: List[str] = []
    for line in text.splitlines():
        if line.startswith('#EXTINF:'):
            if current:
                blocks.append(current)
            current = [line]
        else:
            current.append(line)
    if current:
        blocks.append(current)
    return blocks


def has_probe_evidence(block: List[str]) -> bool:
    """Return True if the channel block carries any evidence that VIDEO-RANGE
    came from a probed source (R-1 honest-rules gate)."""
    for line in block:
        for marker in PROBE_EVIDENCE:
            if marker in line:
                return True
    return False


def run_smoke(path: str) -> Dict:
    if not os.path.isfile(path):
        return {'ok': False, 'error': 'file_not_found', 'path': path}

    size = os.path.getsize(path)
    with open(path, 'r', encoding='utf-8', errors='replace') as f:
        text = f.read()

    blocks = split_into_channel_blocks(text)
    # Block 0 is global header; channel blocks start at index 1
    global_header = blocks[0] if blocks else []
    channel_blocks = blocks[1:] if len(blocks) > 1 else []

    # ─── H-1: TYPE-1 substring count ───────────────────────────────────────
    type1_matches = TYPE1_PATTERN.findall(text)
    h1_count = len(type1_matches)
    h1_pass = (h1_count == 0)

    # ─── H-2: SUPPLEMENTAL-CODECS substring count ──────────────────────────
    supco_matches = SUPCO_PATTERN.findall(text)
    h2_count = len(supco_matches)
    h2_pass = (h2_count == 0)

    # ─── H-3: VIDEO-RANGE="PQ" must coexist with probe evidence ────────────
    pq_total = 0
    pq_verified = 0
    pq_unverified_blocks: List[Dict] = []
    for idx, block in enumerate(channel_blocks):
        block_text = '\n'.join(block)
        pq_hits = len(PQ_PATTERN.findall(block_text))
        if pq_hits == 0:
            continue
        pq_total += pq_hits
        if has_probe_evidence(block):
            pq_verified += pq_hits
        else:
            extinf_line = block[0] if block else '(empty)'
            tvg_name = re.search(r'tvg-name="([^"]+)"', extinf_line)
            chan_name = tvg_name.group(1) if tvg_name else extinf_line[:80]
            if len(pq_unverified_blocks) < 10:
                pq_unverified_blocks.append({
                    'block_index': idx + 1,
                    'channel': chan_name,
                    'pq_count': pq_hits,
                })

    h3_unverified = pq_total - pq_verified
    h3_pass = (h3_unverified == 0)

    overall_pass = h1_pass and h2_pass and h3_pass

    return {
        'ok': overall_pass,
        'file': path,
        'size_bytes': size,
        'size_mb': round(size / 1048576, 2),
        'global_header_lines': len(global_header),
        'channel_blocks': len(channel_blocks),
        'invariants': {
            'H1_no_TYPE_1': {
                'pass': h1_pass,
                'count': h1_count,
                'rule': 'CLAUDE.md "HDCP-LEVEL TYPE-1 hardcodeado ELIMINADO" (D-1)',
            },
            'H2_no_SUPPLEMENTAL_CODECS': {
                'pass': h2_pass,
                'count': h2_count,
                'rule': 'CLAUDE.md "SUPPLEMENTAL-CODECS lcev.1.1.1 inventado ELIMINADO"',
            },
            'H3_PQ_requires_probe_evidence': {
                'pass': h3_pass,
                'pq_total': pq_total,
                'pq_verified': pq_verified,
                'pq_unverified': h3_unverified,
                'sample_unverified_blocks': pq_unverified_blocks,
                'rule': 'CLAUDE.md "VIDEO-RANGE solo si probe lo confirma" (R-1)',
            },
        },
        'verdict': 'PASS' if overall_pass else 'FAIL',
    }


def main() -> int:
    if len(sys.argv) != 2:
        print(f'Usage: {sys.argv[0]} <path-to.m3u8>', file=sys.stderr)
        return 2
    result = run_smoke(sys.argv[1])
    # ensure_ascii=True so Windows cp1252 stdout can render channel names
    # that contain emoji / Unicode (escapes as \uXXXX).
    try:
        print(json.dumps(result, indent=2, ensure_ascii=True))
    except UnicodeEncodeError:
        # Last-resort hard fallback: dump only the verdict + counts.
        slim = {
            'ok': result.get('ok'),
            'verdict': result.get('verdict'),
            'file': result.get('file'),
            'invariants_counts': {
                k: {kk: vv for kk, vv in v.items() if kk in ('pass', 'count',
                    'pq_total', 'pq_verified', 'pq_unverified')}
                for k, v in result.get('invariants', {}).items()
            },
        }
        print(json.dumps(slim, indent=2, ensure_ascii=True))
    return 0 if result.get('ok') else 1


if __name__ == '__main__':
    sys.exit(main())
