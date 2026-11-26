#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Verifica el paquete CMAF/fMP4 sin procesar y la escalera simulada."""
from __future__ import annotations

import json
import sys
from pathlib import Path


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else ".tmp/cmaf-remux").resolve()
    results = []
    errors = []
    for ch in sorted(root.glob("ch*")):
        receipt_path = ch / "receipt.json"
        master = ch / "master.m3u8"
        media = ch / "media/index.m3u8"
        init = ch / "media/init.bin"
        segment = ch / "media/seg_000.bin"
        record = {"channel": ch.name}
        try:
            r = read_json(receipt_path)
            src = r["source"]["probe"]
            out = r["output"]["probe"]
            record["result"] = r["result"]
            record["source"] = f"{src['video']['width']}x{src['video']['height']} {src['video']['codec']} {src['video']['fps']}"
            record["output"] = f"{out['video']['width']}x{out['video']['height']} {out['video']['codec']} {out['video']['fps']}"
            record["pixel_processing"] = r["applied"]["pixel_processing"]
            record["video_transcode"] = r["applied"]["video_transcode"]
            checks = {
                "result_pass": r["result"] == "PASS",
                "same_video": (src["video"]["width"], src["video"]["height"], src["video"]["codec"], src["video"]["fps"]) ==
                              (out["video"]["width"], out["video"]["height"], out["video"]["codec"], out["video"]["fps"]),
                "same_audio": (src["audio"] is None) == (out["audio"] is None) and
                              (src["audio"] is None or (src["audio"]["channels"], src["audio"]["sample_rate"]) ==
                               (out["audio"]["channels"], out["audio"]["sample_rate"])),
                "no_pixel_processing": r["applied"]["pixel_processing"] is False,
                "no_video_transcode": r["applied"]["video_transcode"] is False,
                "cicp_conversion_zero": r["cicp"]["conversion"] == 0,
                "cicp_source_preserved": r["cicp"]["applied"]["primaries"] == src["video"]["color_primaries"],
                "media_exists": media.is_file(), "init_exists": init.is_file(),
                "segment_exists": segment.is_file(),
                "map_real": '#EXT-X-MAP:URI="init.bin"' in media.read_text(encoding="utf-8"),
                "init_ftyp": init.read_bytes()[:4] == b"\x00\x00\x00\x1c" and init.read_bytes()[4:8] == b"ftyp",
            }
            master_text = master.read_text(encoding="utf-8")
            media_text = media.read_text(encoding="utf-8")
            checks.update({
                "master_cmaf": "#EXT-X-APE-CMAF:CONTAINER=FMP4" in master_text,
                "master_cicp": "#EXT-X-APE-CICP:" in master_text,
                "sim_360": "ID=360;RES=640x360;MODE=SIMULATED" in master_text,
                "sim_480": "ID=480;RES=854x480;MODE=SIMULATED" in master_text,
                "sim_720": "ID=720;RES=1280x720;MODE=SIMULATED" in master_text,
                "sim_4k": "TARGET=4K;MODE=SIMULATED" in master_text,
                "sim_6k": "TARGET=6K;MODE=SIMULATED" in master_text,
                "actual_1080": "RESOLUTION=1920x1080" in master_text,
                "no_fake_4k_resolution": "RESOLUTION=3840x2160" not in master_text,
                "no_fake_6k_resolution": "RESOLUTION=5760x3240" not in master_text,
                "no_pixel_tags_applied": "PIXELS=SOURCE" in master_text,
            })
            record["checks"] = checks
            failed = [k for k, v in checks.items() if not v]
            record["failed"] = failed
            if failed:
                errors.append(f"{ch.name}: {failed}")
        except Exception as exc:
            record["error"] = str(exc)
            errors.append(f"{ch.name}: {exc}")
        results.append(record)
    report = {"result": "PASS" if not errors else "FAIL", "root": str(root),
              "channels": results, "errors": errors}
    (root / "verification.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n",
                                           encoding="utf-8")
    lines = ["# Verificación CMAF/fMP4 sin procesar", "",
             f"Resultado: **{report['result']}**", ""]
    for r in results:
        lines.append(f"## {r['channel']}")
        if "error" in r:
            lines.append(f"- ERROR: {r['error']}")
        else:
            lines.append(f"- source: `{r['source']}`")
            lines.append(f"- output: `{r['output']}`")
            lines.append(f"- pixel_processing: `{r['pixel_processing']}`")
            lines.append(f"- video_transcode: `{r['video_transcode']}`")
            lines.append(f"- fallos: `{r['failed'] or 'ninguno'}`")
    (root / "verification.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
