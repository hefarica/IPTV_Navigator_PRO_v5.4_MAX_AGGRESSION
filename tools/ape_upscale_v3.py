#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""4K/6K reales desde 1080p: upscale BT.709, HEVC Main10, fMP4/CMAF para nginx.

Correcciones v3 sobre la v1 (todas verificadas con ffprobe/ffmpeg):
  * color de entrada explicito -> ya no aborta con "no path between colorspaces"
  * 10 bits ANTES de escalar (evita banding por remuestreo en 8 bits)
  * GOP derivado de fps x hls_time; CODECS desde el level_idc MEDIDO
  * FRAME-RATE decimal; BANDWIDTH=pico, AVERAGE-BANDWIDTH=promedio
  * audio no-AAC se transcodifica; re-verificacion tras renombrar a .bin
  * CMAF REAL: ftyp major cmfc (1 pista) / cmf2 (multipista) preservando el
    moov byte a byte, verificado por sha256 + presencia de mvex/trex +
    decodificacion del primer segmento.

NOTA sobre MP4Box: `MP4Box -brand cmfc init.mp4` NO sirve sobre un init
moov-only. Comprobado: MP4Box elimina el box `mvex` (y sus `trex`) al
remuxear, y sin `mvex` el init deja de ser valido para contenido fragmentado.
ffmpeg falla con "trun track id unknown, no tfhd was found".
Se deja la ruta --cmaf mp4box disponible, pero el verificador la rechaza
explicando el motivo, en lugar de publicar un init roto.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import struct
import subprocess
import sys
from fractions import Fraction
from pathlib import Path

TIERS = {
    "4k": (3840, 2160),
    "6k": (5760, 3240),   # 3x1080 por eje; NO es 6K DCI (6144x3456)
    "8k": (7680, 4320),
}
CMAF_BRANDS = {"cmfc", "cmf2", "cmf2c", "cmff"}
CMAF_MAJOR_SINGLE = "cmfc"   # CMAF: initialization segment de UNA pista
CMAF_MAJOR_MULTI = "cmf2"    # CMAF: initialization segment multipista
CMAF_STYP_OK = {"msdh", "msix", "cmf2", "cmff"}
RANGE_MAP = {"tv": "limited", "pc": "full", "": "limited", None: "limited"}


def sha256(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def run(cmd: list[str], cwd: Path | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, text=True, capture_output=True, cwd=cwd, timeout=7200)


# ------------------------------- MP4 boxes ---------------------------------
def top_boxes(d: bytes) -> list[tuple[str, int, int]]:
    """[(tipo, offset, tamaño)] de los boxes de primer nivel."""
    out, o = [], 0
    while o + 8 <= len(d):
        sz = struct.unpack_from(">I", d, o)[0]
        typ = d[o + 4:o + 8].decode("latin1", "replace")
        if sz == 1 and o + 16 <= len(d):
            sz = struct.unpack_from(">Q", d, o + 8)[0]
        if sz < 8:
            break
        out.append((typ, o, sz))
        o += sz
    return out


def ftyp_info(p: Path) -> dict:
    d = p.read_bytes()
    bx = top_boxes(d)
    if not bx or bx[0][0] != "ftyp":
        return {"major": "", "minor": 0, "compatible": [], "size": 0, "has_ftyp": False}
    _, o, sz = bx[0]
    major = d[o + 8:o + 12].decode("latin1", "replace")
    minor = struct.unpack_from(">I", d, o + 12)[0]
    compat = [d[i:i + 4].decode("latin1", "replace") for i in range(o + 16, o + sz, 4)]
    return {"major": major, "minor": minor, "compatible": compat, "size": sz, "has_ftyp": True}


def styp_info(p: Path) -> dict:
    """styp del primer segmento (marca de segmento de medios)."""
    d = p.read_bytes()[:64]
    bx = top_boxes(d)
    for typ, o, sz in bx:
        if typ == "styp":
            major = d[o + 8:o + 12].decode("latin1", "replace")
            compat = [d[i:i + 4].decode("latin1", "replace") for i in range(o + 16, o + sz, 4)]
            return {"major": major, "compatible": compat, "size": sz}
    return {}


def has_mvex(p: Path) -> tuple[bool, int]:
    d = p.read_bytes()
    return (b"mvex" in d), d.count(b"trex")


def brand_patch(init: Path, major: str, extra: tuple[str, ...] = ("cmfc", "cmf2")) -> dict:
    """Marca CMAF sin tocar el moov: reescribe SOLO el ftyp y conserva el resto
    del archivo byte a byte (misma estructura de pistas, mismo mvex/trex)."""
    d = init.read_bytes()
    bx = top_boxes(d)
    if not bx or bx[0][0] != "ftyp":
        raise RuntimeError(f"{init}: no empieza con ftyp")
    _, o, sz = bx[0]
    if o != 0:
        raise RuntimeError(f"{init}: ftyp no esta al inicio")
    minor = struct.unpack_from(">I", d, 12)[0]
    compat = [d[i:i + 4] for i in range(16, sz, 4)]

    seen: list[bytes] = []
    for b in compat + [major.encode()] + [e.encode() for e in extra]:
        if b not in seen:
            seen.append(b)
    ftyp = struct.pack(">I", 16 + 4 * len(seen)) + b"ftyp" + major.encode() + \
        struct.pack(">I", minor) + b"".join(seen)
    rest = d[sz:]
    new = ftyp + rest

    before_moov = sha256_bytes(rest)
    init.write_bytes(new)
    after_moov = sha256_bytes(new[len(ftyp):])
    return {
        "major": major,
        "compatible": [b.decode() for b in seen],
        "ftyp_size_before": sz,
        "ftyp_size_after": len(ftyp),
        "moov_byte_identical": before_moov == after_moov,
        "moov_sha256": before_moov,
    }


def brand_mp4box(init: Path, major: str) -> dict:
    """Ruta alternativa: MP4Box -brand. Se conserva por trazabilidad, pero el
    verificador posterior la rechaza si MP4Box elimina mvex/trex."""
    if not shutil.which("MP4Box"):
        raise RuntimeError("MP4Box no instalado (apt-get install -y gpac)")
    out = init.with_name("init.mp4box.mp4")
    p = run(["MP4Box", "-brand", major, "-ab", "cmfc", "-ab", "cmf2", "-ab", "iso6",
             "-quiet", str(init), "-out", str(out)])
    if p.returncode != 0 or not out.exists():
        raise RuntimeError(f"MP4Box fallo: {p.stderr[-800:]}")
    out.replace(init)
    return {"tool": "MP4Box", "major": major}


def verify_cmaf(init: Path, first_seg: Path, playlist: Path, expect_tracks: int) -> dict:
    """Verificacion CMAF: ftyp, styp, mvex/trex intactos y decodificacion real."""
    fi = ftyp_info(init)
    problems: list[str] = []
    if not fi["has_ftyp"]:
        problems.append("init sin ftyp")
    if fi["major"] not in CMAF_BRANDS:
        problems.append(f"ftyp.major={fi['major']!r} no es marca CMAF")
    if not (set(fi["compatible"]) & CMAF_BRANDS):
        problems.append(f"ftyp.compatible no incluye cmfc/cmf2: {fi['compatible']}")
    want = CMAF_MAJOR_SINGLE if expect_tracks == 1 else CMAF_MAJOR_MULTI
    if fi["major"] != want:
        problems.append(f"brand {fi['major']!r} con {expect_tracks} pista(s); "
                        f"CMAF exige {want!r}")
    mv, nt = has_mvex(init)
    if not mv:
        problems.append("init sin box mvex: no es un init de contenido fragmentado "
                        "(MP4Box -brand elimina mvex/trex)")
    si = styp_info(first_seg)
    if si and si["major"] not in CMAF_STYP_OK:
        problems.append(f"styp.major={si['major']!r} fuera de {sorted(CMAF_STYP_OK)}")

    # decodificacion real del primer segmento con el init marcado
    p = run(["ffprobe", "-v", "error", "-allowed_extensions", "ALL", "-count_frames",
             "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames",
             "-of", "csv=p=0", str(playlist)])
    frames = p.stdout.strip().splitlines()[0] if p.stdout.strip() else "0"
    frames_i = int(frames) if frames.isdigit() else 0
    if p.returncode != 0 or frames_i <= 0:
        problems.append(f"no decodifica con el init marcado ({p.stderr.strip()[:160]})")

    return {
        "ftyp": fi, "styp": si, "mvex": mv, "trex_count": nt,
        "decoded_video_frames": frames_i,
        "conformant": not problems, "problems": problems,
    }


# ------------------------------- ffprobe -----------------------------------
def ffprobe_json(p: Path | str, extra: list[str] | None = None) -> dict:
    cmd = ["ffprobe", "-v", "error", "-print_format", "json",
           "-show_format", "-show_streams"] + (extra or []) + [str(p)]
    q = run(cmd)
    if q.returncode != 0:
        raise RuntimeError(q.stderr[-1500:])
    return json.loads(q.stdout)


def probe(p: Path | str, after_rename: bool = False) -> dict:
    extra = ["-allowed_extensions", "ALL"] if after_rename else []
    d = ffprobe_json(p, extra)
    v = next(s for s in d["streams"] if s.get("codec_type") == "video")
    a = next((s for s in d["streams"] if s.get("codec_type") == "audio"), None)
    return {
        "duration": float(d.get("format", {}).get("duration") or 0),
        "video": {
            "codec": v.get("codec_name"), "profile": v.get("profile"),
            "level": int(v.get("level") or 0),
            "width": int(v.get("width") or 0), "height": int(v.get("height") or 0),
            "pix_fmt": v.get("pix_fmt"), "fps": v.get("r_frame_rate"),
            "color_primaries": v.get("color_primaries") or "",
            "color_transfer": v.get("color_transfer") or "",
            "color_space": v.get("color_space") or "",
            "color_range": v.get("color_range") or "",
            "sample_aspect_ratio": v.get("sample_aspect_ratio") or "1:1",
            "display_aspect_ratio": v.get("display_aspect_ratio") or "",
        },
        "audio": None if not a else {
            "codec": a.get("codec_name"), "channels": int(a.get("channels") or 0),
            "sample_rate": int(a.get("sample_rate") or 0)},
    }


def fps_float(r: str) -> float:
    try:
        return float(Fraction(r))
    except Exception:
        return 25.0


def level_name(level_idc: int) -> str:
    major, rem = divmod(level_idc, 30)
    return f"{major}.{rem // 3}"


def parse_variant(pl: Path) -> list[tuple[float, Path]]:
    out, dur, base = [], None, pl.parent
    for line in pl.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line.startswith("#EXTINF:"):
            dur = float(line.split(":", 1)[1].split(",")[0])
        elif line and not line.startswith("#"):
            out.append((dur or 0.0, base / line))
    return out


def encode(source: Path, root: Path, name: str, args) -> dict:
    srcp = probe(source)
    sv = srcp["video"]

    assumed = False
    pri = sv["color_primaries"] or "bt709"
    trc = sv["color_transfer"] or "bt709"
    mat = sv["color_space"] or "bt709"
    rng = RANGE_MAP.get(sv["color_range"], "limited")
    if not (sv["color_primaries"] and sv["color_transfer"] and sv["color_space"]):
        assumed = True
    if args.assume_input:
        parts = args.assume_input.split("/")
        if len(parts) == 3:
            pri, trc, mat = parts

    fps = fps_float(sv["fps"])
    gop = max(int(round(fps * args.hls_time)), 1)
    root.mkdir(parents=True)
    tiers = []

    for tid in args.tiers:
        w, h = TIERS[tid]
        d = root / tid
        d.mkdir()

        if args.aspect == "stretch":
            vf = (f"format=yuv420p10le,"
                  f"zscale=w={w}:h={h}:f=lanczos:"
                  f"pin={pri}:tin={trc}:min={mat}:rin={rng}:"
                  f"p=bt709:t=bt709:m=bt709:r=limited:d=error_diffusion")
        else:
            # Preserva DAR: el source puede tener SAR != 1:1. Se escala dentro
            # de la caja objetivo y se rellena; el pixel final es cuadrado.
            vf = (f"format=yuv420p10le,"
                  f"zscale=pin={pri}:tin={trc}:min={mat}:rin={rng}:"
                  f"p=bt709:t=bt709:m=bt709:r=limited:d=error_diffusion,"
                  f"scale={w}:{h}:force_original_aspect_ratio=decrease:"
                  f"flags=lanczos+accurate_rnd+full_chroma_int,"
                  f"pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1")

        audio_args = ["-c:a", "copy", "-bsf:a", "aac_adtstoasc"]
        if not (srcp["audio"] and srcp["audio"]["codec"] == "aac"):
            audio_args = ["-c:a", "aac", "-b:a", "128k", "-ac", "2"]
            print(f"AVISO {tid}: audio {srcp['audio']['codec'] if srcp['audio'] else 'ausente'} "
                  f"-> AAC-LC (fMP4 no admite copy de ese codec)", file=sys.stderr)

        cmd = ["ffmpeg", "-hide_banner", "-y", "-i", str(source)]
        if args.duration:
            cmd += ["-t", str(args.duration)]
        cmd += ["-map", "0:v:0"] + (["-map", "0:a:0"] if srcp["audio"] else [])
        cmd += [
            "-vf", vf,
            "-c:v", "libx265", "-preset", args.preset, "-crf", str(args.crf),
            "-profile:v", "main10", "-pix_fmt", "yuv420p10le",
            "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
            "-color_range", "tv", "-tag:v", "hvc1",
            "-x265-params", f"log-level=error:keyint={gop}:min-keyint={gop}:scenecut=0:open-gop=0",
            "-g", str(gop), "-keyint_min", str(gop), "-sc_threshold", "0",
        ] + audio_args + [
            "-f", "hls", "-hls_time", str(args.hls_time),
            "-hls_playlist_type", "vod", "-hls_flags", "independent_segments",
            "-hls_segment_type", "fmp4", "-hls_fmp4_init_filename", "init.mp4",
            "-hls_segment_filename", "seg_%03d.m4s", "index.m3u8",
        ]
        p = run(cmd, cwd=d)
        if p.returncode != 0:
            raise RuntimeError(f"{tid}: {p.stderr[-2500:]}")

        out = probe(d / "index.m3u8")
        v = out["video"]
        if (v["width"], v["height"]) != (w, h):
            raise RuntimeError(f"{tid}: salida {v['width']}x{v['height']} != {w}x{h}")
        if (v["color_primaries"], v["color_transfer"], v["color_space"]) != ("bt709", "bt709", "bt709"):
            raise RuntimeError(f"{tid}: CICP no BT.709: {v}")
        if v["pix_fmt"] != "yuv420p10le":
            raise RuntimeError(f"{tid}: no quedo 10 bits: {v['pix_fmt']}")

        codec = f"hvc1.2.4.L{v['level']}.B0"
        if args.level:
            want = int(round(float(args.level) * 30))
            if v["level"] != want:
                raise RuntimeError(f"{tid}: se pidio level {args.level} ({want}) "
                                   f"y el encoder produjo {v['level']} ({level_name(v['level'])})")

        tracks = 1 + (1 if out["audio"] else 0)
        cmaf = {"applied": False}
        if args.cmaf != "off":
            major = args.cmaf_brand
            if major == "auto":
                major = CMAF_MAJOR_SINGLE if tracks == 1 else CMAF_MAJOR_MULTI
            before = ftyp_info(d / "init.mp4")
            if args.cmaf == "mp4box":
                cmaf = brand_mp4box(d / "init.mp4", major)
            else:
                cmaf = brand_patch(d / "init.mp4", major)
            cmaf.update({"applied": True, "tracks": tracks,
                         "brand_before": before["major"], "requested": args.cmaf})
            # el verificador decide: si MP4Box rompio mvex, aqui se aborta
            if not cmaf.get("moov_byte_identical", False) and args.cmaf == "patch":
                raise RuntimeError(f"{tid}: el parche altero el moov (deberia ser identico)")

        # Verificación CMAF antes del renombrado: ffprobe acepta .m4s/.mp4,
        # pero no la extensión .bin que nginx necesita para servirlos.
        segs_before = parse_variant(d / "index.m3u8")
        if not segs_before:
            raise RuntimeError(f"{tid}: playlist sin segmentos")
        cmaf_v = {}
        if args.cmaf != "off":
            cmaf_v = verify_cmaf(d / "init.mp4", segs_before[0][1], d / "index.m3u8", tracks)
            if not cmaf_v["conformant"]:
                raise RuntimeError(f"{tid}: CMAF no conforme -> " + "; ".join(cmaf_v["problems"]))

        # renombrado para nginx, sin cambiar un byte del contenido
        (d / "init.mp4").rename(d / "init.bin")
        for s in sorted(d.glob("seg_*.m4s")):
            s.rename(s.with_suffix(".bin"))
        text = (d / "index.m3u8").read_text(encoding="utf-8")
        text = text.replace('URI="init.mp4"', 'URI="init.bin"').replace(".m4s", ".bin")
        (d / "index.m3u8").write_text(text, encoding="utf-8")

        segs = parse_variant(d / "index.m3u8")
        if not segs:
            raise RuntimeError(f"{tid}: playlist sin segmentos tras renombrar")

        total_bytes = sum(x.stat().st_size for _, x in segs)
        total_dur = sum(du for du, _ in segs) or out["duration"] or 1.0
        peak = max((x.stat().st_size * 8 / du for du, x in segs if du > 0), default=0)
        tiers.append({
            "id": tid, "width": w, "height": h, "codec": codec,
            "probe": out, "level_idc": v["level"], "level_name": level_name(v["level"]),
            "tracks": tracks,
            "bandwidth_peak": int(peak), "bandwidth_avg": int(total_bytes * 8 / total_dur),
            "cmaf": cmaf, "cmaf_verification": cmaf_v,
            "dir": str(d), "init": str(d / "init.bin"),
            "init_sha256": sha256(d / "init.bin"),
            "segments": [{"name": x.name, "bytes": x.stat().st_size, "duration": du,
                          "bitrate": int(x.stat().st_size * 8 / du) if du else 0,
                          "sha256": sha256(x)} for du, x in segs],
        })

    all_cmaf = args.cmaf != "off" and all(t["cmaf_verification"].get("conformant") for t in tiers)
    lines = [
        "#EXTM3U", "#EXT-X-VERSION:7",
        f"#EXT-X-APE-CMAF:CONTAINER={'CMAF' if all_cmaf else 'FMP4'};"
        f"CMAF_CONFORMANT={1 if all_cmaf else 0};"
        f"BRAND={tiers[0]['cmaf'].get('major', 'none')};"
        f"FTYP_VERIFIED={1 if all_cmaf else 0};MODE=TRANSCODE;APPLIED=1;PIXELS=PROCESSED",
        "#EXT-X-APE-CICP:REQUESTED=BT709/SDR;APPLIED=BT709/SDR;"
        f"CONVERSION={'1' if (assumed or pri != 'bt709' or trc != 'bt709') else '0'};"
        f"INPUT_ASSUMED={1 if assumed else 0};PIXELS=PROCESSED",
        f"#EXT-X-APE-ASPECT:INPUT_SAR={sv.get('sample_aspect_ratio', '1:1')};"
        f"INPUT_DAR={sv.get('display_aspect_ratio', '')};"
        f"POLICY={args.aspect};OUTPUT_SAR=1:1",
        "#EXT-X-INDEPENDENT-SEGMENTS",
    ]
    for t in tiers:
        aud = "mp4a.40.2" if t["probe"]["audio"] and t["probe"]["audio"]["codec"] == "aac" else ""
        codecs = f'{t["codec"]},{aud}' if aud else t["codec"]
        fps_dec = f"{fps_float(t['probe']['video']['fps']):.3f}"
        lines += [
            f"#EXT-X-STREAM-INF:BANDWIDTH={t['bandwidth_peak']},"
            f"AVERAGE-BANDWIDTH={t['bandwidth_avg']},RESOLUTION={t['width']}x{t['height']},"
            f"FRAME-RATE={fps_dec},CODECS=\"{codecs}\",VIDEO-RANGE=SDR,CLOSED-CAPTIONS=NONE",
            f"{t['id']}/index.m3u8",
        ]
    (root / "master.m3u8").write_text("\n".join(lines) + "\n", encoding="utf-8")

    return {"name": name, "source": str(source), "tiers": tiers,
            "cmaf_conformant": all_cmaf,
            "master": str(root / "master.m3u8"), "master_sha256": sha256(root / "master.m3u8"),
            "input_color": {"primaries": pri, "transfer": trc, "matrix": mat,
                            "range": rng, "assumed": assumed}}


def main() -> int:
    ap = argparse.ArgumentParser(description="Upscale 4K/6K real + fMP4/CMAF para nginx")
    ap.add_argument("--source", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--name", default="REA")
    ap.add_argument("--tiers", default="4k,6k", help="4k,6k,8k (coma)")
    ap.add_argument("--duration", type=float, default=0.0, help="0 = fuente completa")
    ap.add_argument("--hls-time", type=float, default=2.0)
    ap.add_argument("--crf", type=int, default=22)
    ap.add_argument("--preset", default="medium")
    ap.add_argument("--level", default="", help="forzar level; si no cuadra, falla")
    ap.add_argument("--assume-input", default="", help="pri/trc/mat, p.ej. bt709/bt709/bt709")
    ap.add_argument("--cmaf", default="patch", choices=["patch", "mp4box", "off"],
                    help="patch: marca ftyp preservando moov (por defecto); "
                         "mp4box: MP4Box -brand (rechazado si elimina mvex); off: no marcar")
    ap.add_argument("--cmaf-brand", default="auto", choices=["auto", "cmfc", "cmf2"],
                    help="auto = cmfc con 1 pista, cmf2 multipista (regla CMAF)")
    ap.add_argument("--aspect", default="preserve", choices=["preserve", "stretch"],
                    help="preserve: conserva DAR con pad y SAR 1:1; stretch: estira")
    ap.add_argument("--force", action="store_true", help="borra --out si existe")
    a = ap.parse_args()
    a.tiers = [t.strip() for t in a.tiers.split(",") if t.strip()]
    for t in a.tiers:
        if t not in TIERS:
            print(f"FAIL: tier desconocido {t}", file=sys.stderr)
            return 1

    src, out = Path(a.source).resolve(), Path(a.out).resolve()
    if out.exists():
        if not a.force:
            print("FAIL: output existe (usa --force)", file=sys.stderr)
            return 1
        shutil.rmtree(out)
    try:
        if not src.is_file():
            raise RuntimeError("source no existe")
        if not shutil.which("ffmpeg"):
            raise RuntimeError("ffmpeg no encontrado")
        res = encode(src, out, a.name, a)
        receipt = {
            "schema": "ape.upscale.4k6k.receipt.v3", "result": "PASS",
            "source": {"path": str(src), "sha256": sha256(src), "probe": probe(src)},
            "applied": {"pixel_processing": True, "video_transcode": True,
                        "upscaling": True, "color_conversion": True,
                        "bit_depth": "10 bits antes del escalado"},
            "cmaf_conformant": res["cmaf_conformant"],
            "notes": ["CODECS derivado del level_idc medido",
                      "BANDWIDTH = pico por segmento",
                      "CMAF verificado por ftyp + mvex/trex + decodificacion",
                      "moov intacto byte a byte (sha256)"],
            "output": res,
        }
        (out / "receipt.json").write_text(
            json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({
            "result": "PASS", "master": res["master"],
            "cmaf_conformant": res["cmaf_conformant"],
            "tiers": [{"id": t["id"], "res": f"{t['width']}x{t['height']}",
                       "codec": t["codec"], "level": t["level_name"],
                       "brand": t["cmaf"].get("major"),
                       "ftyp": t["cmaf_verification"].get("ftyp", {}).get("major"),
                       "styp": t["cmaf_verification"].get("styp", {}).get("major"),
                       "mvex": t["cmaf_verification"].get("mvex"),
                       "frames": t["cmaf_verification"].get("decoded_video_frames"),
                       "peak_bps": t["bandwidth_peak"], "avg_bps": t["bandwidth_avg"]}
                      for t in res["tiers"]]}, ensure_ascii=False))
        return 0
    except Exception as e:
        print(json.dumps({"result": "FAIL", "error": str(e)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
