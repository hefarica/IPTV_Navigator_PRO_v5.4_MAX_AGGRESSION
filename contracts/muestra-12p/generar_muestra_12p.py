#!/usr/bin/env python3
"""Genera una muestra 12P con capas separadas.

Salidas:
  MASTERLIST_12P.m3u8        Master HLS valida (12 variantes).
  masters/<perfil>.m3u8      Master de una variante por perfil.
  playlists/<perfil>.m3u8    Media playlist live de 6 segmentos de 4 s.
  METADATA_12P.json          Metadata rica, headers y valores normalizados.
  CATALOGO_12P.m3u           Catalogo M3U extendido con 12 entradas.
  CATALOGO_12P.m3u8          Igual, extension m3u8, no es master HLS.
  APE_BLOCKS_12P.m3u8        Sidecar APE con 12 bloques de >=1000 lineas.
  PROFILE_MATRIX_12P.csv     Matriz legible de los 12 perfiles.
  VALIDACION_12P.json        Evidencia estructural de la muestra.
  README_MUESTRA_12P.md      Explicacion y limites.

No usa URLs reales: todo apunta a demo.example.invalid.
No promete cero freeze ni 4K/6K real: la muestra es estructural.

La salida de los doce perfiles se declara como upscale simulado ejecutado por
video filters (DOCTRINA_EJECUCION_12P.md y _meta.doctrine). Si este script se
vuelve a correr, ejecutar despues aplicar_doctrina_12p.py sobre la salida.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
from collections import OrderedDict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

PROFILE_ORDER = ["P0", "P1", "P2", "P3", "P4", "P5", "P0.5", "P1.5", "P2.5", "P3.5", "P4.5", "P5.5"]
SEGMENT_DURATION_S = 4
SEGMENT_COUNT = 6
STARTUP_BUFFER_MS = 1500
RESUME_BUFFER_MS = 3000
PARALLEL_DOWNLOADS = 4
PLACEHOLDER_HOST = "https://demo.example.invalid"
URL_RE = re.compile(r"https?://[^\s,;|\"']+")

CHANNEL = {
    "id": "demo.12p",
    "name": "DEMO 12P",
    "group": "DEMO 12P",
    "tvg_id": "demo.12p",
    "tvg_name": "DEMO 12P",
}


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def as_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def as_int(value: Any, default: int = 0) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def sanitize_text(value: Any) -> str:
    s = str(value)
    s = URL_RE.sub(PLACEHOLDER_HOST, s)
    s = s.replace("{config.referer}", PLACEHOLDER_HOST + "/")
    s = s.replace("{config.user_agent}", "APE-DEMO-12P/1.0")
    s = s.replace("{config.origin}", PLACEHOLDER_HOST)
    s = s.replace("{config.locale}", "es-419")
    s = s.replace("{config.kodi_headers_urlencoded}", "X-Demo=1")
    s = re.sub(r"\{config\.[^}]+\}", "DEMO", s)
    return s


def sanitize_obj(value: Any) -> Any:
    if isinstance(value, dict):
        return {sanitize_text(k): sanitize_obj(v) for k, v in value.items()}
    if isinstance(value, list):
        return [sanitize_obj(v) for v in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return sanitize_text(value) if isinstance(value, str) else value
    return sanitize_text(value)


def policy_cap_seconds(bitrate_mbps: float) -> int:
    """Techo de buffer por bitrate, segun la politica de buffer del proyecto."""
    if bitrate_mbps <= 25:
        return 30
    if bitrate_mbps <= 80:
        return 24
    if bitrate_mbps <= 150:
        return 20
    return 15


def codec_family(value: str) -> str:
    s = str(value).upper()
    for token in ("DVH1", "DOLBY"):
        if token in s:
            return "DVH1"
    for token in ("HVC1", "HEVC", "H265"):
        if token in s:
            return "HVC1"
    for token in ("AV01", "AV1"):
        if token in s:
            return "AV01"
    for token in ("AVC1", "H264"):
        if token in s:
            return "AVC1"
    return s


def profile_model(pid: str, raw: dict[str, Any]) -> OrderedDict[str, Any]:
    settings = raw.get("settings", {}) or {}
    resolution = str(settings.get("resolution", "unknown"))
    bitrate_mbps = as_float(settings.get("bitrate"), 0.0)
    max_kbps = as_float(settings.get("maxBitrateKbps"), bitrate_mbps * 1000.0)
    avg_kbps = as_float(settings.get("avgBitrateKbps"), bitrate_mbps * 800.0)
    fps = as_float(settings.get("fps"), 30.0)
    codec_string = str(settings.get("codec_string", "unknown"))
    video_range = str(settings.get("video_range", "SDR"))
    hdr_mode = str(settings.get("hdr_mode", "SDR"))
    audio_codec = str(settings.get("audio_codec", "unknown"))
    declared_codec = str(settings.get("codec", "unknown"))
    declared_target_s = as_int(settings.get("bufferTargetSec"), as_int(settings.get("bufferSeconds"), 24))
    cap_s = policy_cap_seconds(bitrate_mbps)
    target_s = min(declared_target_s, cap_s) if declared_target_s > 0 else cap_s
    target_s = max(1, target_s)
    min_ms = int(round(target_s * 0.625)) * 1000
    max_ms = target_s * 2 * 1000
    exo_min_ms = int(round(target_s * 1.25)) * 1000
    exo_max_ms = int(round(target_s * 3.75)) * 1000
    prefetch_segments = min(6, max(2, int(round(target_s / SEGMENT_DURATION_S))))
    stream_inf = OrderedDict(
        [
            ("BANDWIDTH", int(round(max_kbps * 1000))),
            ("AVERAGE-BANDWIDTH", int(round(avg_kbps * 1000))),
            ("CODECS", codec_string),
            ("RESOLUTION", resolution),
            ("FRAME-RATE", f"{fps:.3f}"),
            ("VIDEO-RANGE", video_range),
        ]
    )
    contradictions: list[str] = []
    if codec_family(declared_codec) != codec_family(codec_string):
        contradictions.append(f"settings.codec={declared_codec} no coincide con codec_string={codec_string}")
    if audio_codec and audio_codec.lower() not in codec_string.lower():
        contradictions.append(f"settings.audio_codec={audio_codec} no coincide con codec_string={codec_string}")
    if video_range.upper() == "SDR" and "HDR" in hdr_mode.upper():
        contradictions.append(f"video_range=SDR contradice hdr_mode={hdr_mode}")
    player_buffer_ms = as_int(settings.get("playerBuffer"), 0)
    if player_buffer_ms and declared_target_s * 1000 > player_buffer_ms:
        contradictions.append("bufferTargetSec excede playerBuffer declarado")
    if declared_target_s > cap_s:
        contradictions.append(f"bufferTargetSec={declared_target_s}s excede el techo de politica={cap_s}s; se normaliza")
    return OrderedDict(
        [
            ("id", pid),
            ("name", str(raw.get("name", pid))),
            ("role", str(raw.get("role", pid))),
            ("level", raw.get("level")),
            ("quality", str(raw.get("quality", ""))),
            ("resolution", resolution),
            ("is_emulated", bool(raw.get("is_emulated", False))),
            ("base_profile", raw.get("base_profile")),
            ("declared", OrderedDict(
                [
                    ("bitrate_mbps", bitrate_mbps),
                    ("max_kbps", max_kbps),
                    ("avg_kbps", avg_kbps),
                    ("fps", fps),
                    ("codec", declared_codec),
                    ("codec_string", codec_string),
                    ("audio_codec", audio_codec),
                    ("video_range", video_range),
                    ("hdr_mode", hdr_mode),
                    ("buffer_target_s", declared_target_s),
                    ("buffer_ms", as_int(settings.get("buffer"), 0)),
                    ("player_buffer_ms", as_int(settings.get("playerBuffer"), 0)),
                    ("segment_duration_s", as_int(settings.get("segment_duration_s"), SEGMENT_DURATION_S)),
                ]
            )),
            ("effective", OrderedDict(
                [
                    ("target_s", target_s),
                    ("target_ms", target_s * 1000),
                    ("min_ms", min_ms),
                    ("max_ms", max_ms),
                    ("startup_ms", STARTUP_BUFFER_MS),
                    ("resume_ms", RESUME_BUFFER_MS),
                    ("exo_min_ms", exo_min_ms),
                    ("exo_max_ms", exo_max_ms),
                    ("prefetch_segments", prefetch_segments),
                    ("parallel_downloads", PARALLEL_DOWNLOADS),
                    ("low_latency_mode", False),
                    ("policy_cap_s", cap_s),
                ]
            )),
            ("stream_inf", stream_inf),
            ("source_truth", "unknown"),
            ("execution", "SIMULATED_EXECUTED"),
            ("contradictions", contradictions),
        ]
    )


def stream_inf_line(model: OrderedDict[str, Any]) -> str:
    si = model["stream_inf"]
    return (
        f'#EXT-X-STREAM-INF:BANDWIDTH={si["BANDWIDTH"]},'
        f'AVERAGE-BANDWIDTH={si["AVERAGE-BANDWIDTH"]},'
        f'CODECS="{si["CODECS"]}",'
        f'RESOLUTION={si["RESOLUTION"]},'
        f'FRAME-RATE={si["FRAME-RATE"]},'
        f'VIDEO-RANGE={si["VIDEO-RANGE"]}'
    )


def profile_identity_lines(model: OrderedDict[str, Any]) -> list[str]:
    return [
        f'#EXT-X-APE-PROFILE:{model["id"]}',
        f'#EXT-X-APE-PROFILE-NAME:{sanitize_text(model["name"])}',
        f'#EXT-X-APE-ROLE:{sanitize_text(model["role"])}',
        f'#EXT-X-APE-QUALITY:{sanitize_text(model["quality"])}',
        f'#EXT-X-APE-RESOLUTION:{model["resolution"]}',
        f'#EXT-X-APE-SOURCE-TRUTH:unknown',
        f'#EXT-X-APE-EXECUTION:SIMULATED_EXECUTED',
    ]


def profile_buffer_lines(model: OrderedDict[str, Any]) -> list[str]:
    return [
        f'#EXT-X-APE-TARGETDURATION:{SEGMENT_DURATION_S}',
        f'#EXT-X-APE-BUFFER-TARGET:{model["effective"]["target_ms"]}',
        f'#EXT-X-APE-BUFFER-MIN:{model["effective"]["min_ms"]}',
        f'#EXT-X-APE-BUFFER-MAX:{model["effective"]["max_ms"]}',
        f'#EXT-X-APE-LOAD-CONTROL:minBufferMs={model["effective"]["exo_min_ms"]};maxBufferMs={model["effective"]["exo_max_ms"]};bufferForPlaybackMs={STARTUP_BUFFER_MS};bufferForPlaybackAfterRebufferMs={RESUME_BUFFER_MS}',
        '#EXT-X-APE-LIVE-SYNC:durationCount=2;maxLatencyCount=4;lowLatencyMode=false',
        f'#EXT-X-APE-PREFETCH:segments={model["effective"]["prefetch_segments"]};parallel={PARALLEL_DOWNLOADS};target_s={model["effective"]["target_s"]}',
    ]


def make_master(models: list[OrderedDict[str, Any]]) -> str:
    lines = [
        "#EXTM3U",
        "#EXT-X-VERSION:9",
        "#EXT-X-INDEPENDENT-SEGMENTS",
        "#EXT-X-START:TIME-OFFSET=-4.000,PRECISE=YES",
        "#EXT-X-APE-CATALOG:12P",
        "#EXT-X-APE-CATALOG-TYPE:HLS_MASTER",
        "#EXT-X-APE-PROFILE-COUNT:12",
        "#EXT-X-APE-CHANNEL:demo.12p",
        "#EXT-X-APE-SOURCE-TRUTH:unknown",
        "#EXT-X-APE-EXECUTION:SIMULATED_EXECUTED",
        "#EXT-X-APE-NOTICE:metadata-sidecar-not-in-this-file",
        "",
    ]
    for m in models:
        lines.extend(profile_identity_lines(m))
        lines.append(stream_inf_line(m))
        lines.append(f"playlists/{m['id']}.m3u8")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def make_single_master(model: OrderedDict[str, Any]) -> str:
    lines = [
        "#EXTM3U",
        "#EXT-X-VERSION:9",
        "#EXT-X-INDEPENDENT-SEGMENTS",
        "#EXT-X-START:TIME-OFFSET=-4.000,PRECISE=YES",
        *profile_identity_lines(model),
        stream_inf_line(model),
        f"playlists/{model['id']}.m3u8",
    ]
    return "\n".join(lines) + "\n"


def make_media_playlist(model: OrderedDict[str, Any]) -> str:
    lines = [
        "#EXTM3U",
        "#EXT-X-VERSION:9",
        f"#EXT-X-TARGETDURATION:{SEGMENT_DURATION_S}",
        "#EXT-X-MEDIA-SEQUENCE:1000",
        "#EXT-X-DISCONTINUITY-SEQUENCE:0",
        "#EXT-X-INDEPENDENT-SEGMENTS",
        *profile_identity_lines(model),
        *profile_buffer_lines(model),
        "#EXT-X-PROGRAM-DATE-TIME:2026-11-23T01:40:00.000Z",
    ]
    for i in range(SEGMENT_COUNT):
        lines.append(f"#EXTINF:{SEGMENT_DURATION_S}.000,")
        lines.append(f"../segments/{model['id']}/seg_{1000 + i:05d}.ts")
    return "\n".join(lines) + "\n"


def make_catalog(models: list[OrderedDict[str, Any]], raw_profiles: dict[str, Any]) -> str:
    lines = [
        "#EXTM3U",
        "#EXT-X-APE-CATALOG:12P",
        "#EXT-X-APE-CATALOG-TYPE:PLAYLIST",
        "#EXT-X-APE-NOT-HLS-MASTER:1",
        "#EXT-X-APE-PROFILE-COUNT:12",
        f"#EXT-X-APE-CHANNEL:{CHANNEL['id']}",
        "#EXT-X-APE-SOURCE-TRUTH:unknown",
        "#EXT-X-APE-EXECUTION:SIMULATED_EXECUTED",
        "#EXT-X-APE-NOTICE:use-masters-per-profile-for-hls",
        "",
    ]
    for m in models:
        raw = raw_profiles[m["id"]]
        title = f"{CHANNEL['name']} | {m['id']} | {m['role']}"
        lines.append(
            f'#EXTINF:-1 tvg-id="{CHANNEL["id"]}.{m["id"]}" '
            f'tvg-name="{sanitize_text(title)}" tvg-logo="" '
            f'group-title="{CHANNEL["group"]}",{sanitize_text(title)}'
        )
        for k, v in raw.get("vlcopt", {}).items():
            lines.append(f"#EXTVLCOPT:{sanitize_text(k)}={sanitize_text(v)}")
        for k, v in raw.get("kodiprop", {}).items():
            lines.append(f"#KODIPROP:{sanitize_text(k)}={sanitize_text(v)}")
        lines.append(f"masters/{m['id']}.m3u8")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def make_ape_blocks(models: list[OrderedDict[str, Any]], raw_profiles: dict[str, Any]) -> tuple[str, list[int]]:
    lines = [
        "#EXTM3U",
        "#EXT-X-APE-CATALOG:12P",
        "#EXT-X-APE-CATALOG-TYPE:METADATA_SIDECAR",
        "#EXT-X-APE-NOT-HLS-MASTER:1",
        "#EXT-X-APE-BLOCK-LINES-MIN:1000",
        "#EXT-X-APE-PROFILE-COUNT:12",
        "#EXT-X-APE-NOTICE:this-is-not-an-hls-master",
        "",
    ]
    counts: list[int] = []
    for m in models:
        raw = raw_profiles[m["id"]]
        title = f"{CHANNEL['name']} | {m['id']} | {m['role']}"
        block: list[str] = [
            f'#EXTINF:-1 tvg-id="{CHANNEL["id"]}.{m["id"]}" '
            f'tvg-name="{sanitize_text(title)}" tvg-logo="" '
            f'group-title="{CHANNEL["group"]}",{sanitize_text(title)}'
        ]
        block.extend(profile_identity_lines(m))
        block.extend(profile_buffer_lines(m))
        block.append(f'#EXT-X-APE-DECLARED-CODEC:{sanitize_text(m["declared"]["codec"])}')
        block.append(f'#EXT-X-APE-DECLARED-AUDIO:{sanitize_text(m["declared"]["audio_codec"])}')
        block.append(f'#EXT-X-APE-DECLARED-HDR:{sanitize_text(m["declared"]["hdr_mode"])}')
        block.append(f'#EXT-X-APE-DECLARED-BITRATE-MBPS:{m["declared"]["bitrate_mbps"]}')
        block.append(f'#EXT-X-APE-DECLARED-FPS:{m["declared"]["fps"]}')
        block.append(f'#EXT-X-APE-DECLARED-BUFFER-S:{m["declared"]["buffer_target_s"]}')
        block.append(f'#EXT-X-APE-EFFECTIVE-BUFFER-S:{m["effective"]["target_s"]}')
        block.append(f'#EXT-X-APE-POLICY-CAP-S:{m["effective"]["policy_cap_s"]}')
        block.append("#EXT-X-APE-CONTRADICTIONS:" + sanitize_text(" | ".join(m["contradictions"]) or "none"))
        for k, v in raw.get("headerOverrides", {}).items():
            key = sanitize_text(k)
            val = sanitize_obj(v)
            block.append(f"#EXTHTTP:{json.dumps({key: val}, ensure_ascii=False, separators=(',', ':'))}")
        for k, v in raw.get("headerOverrides", {}).items():
            key = sanitize_text(k)
            val = sanitize_obj(v)
            block.append(f"#EXT-X-APE-HTTP-HEADER:{key}={json.dumps(val, ensure_ascii=False, separators=(',', ':'))}")
        for k, v in raw.get("vlcopt", {}).items():
            block.append(f"#EXTVLCOPT:{sanitize_text(k)}={sanitize_text(v)}")
        for k, v in raw.get("kodiprop", {}).items():
            block.append(f"#KODIPROP:{sanitize_text(k)}={sanitize_text(v)}")
        for k, v in raw.get("hlsjs", {}).items():
            block.append(f"#EXT-X-APE-HLSJS:{sanitize_text(k)}={sanitize_text(v)}")
        for k, v in raw.get("prefetch_config", {}).items():
            block.append(f"#EXT-X-APE-PREFETCH-CONFIG:{sanitize_text(k)}={json.dumps(sanitize_obj(v), ensure_ascii=False, separators=(',', ':'))}")
        for k, v in raw.get("bounds", {}).items():
            block.append(f"#EXT-X-APE-BOUND:{sanitize_text(k)}={json.dumps(sanitize_obj(v), ensure_ascii=False, separators=(',', ':'))}")
        for k, v in raw.get("actor_injections", {}).items():
            block.append(f"#EXT-X-APE-ACTOR:{sanitize_text(k)}={json.dumps(sanitize_obj(v), ensure_ascii=False, separators=(',', ':'))}")
        for tag in raw.get("player_enslavement", {}).get("level_1_master_playlist", []):
            block.append(f"#EXT-X-APE-MASTER-TAG:{sanitize_text(tag)}")
        block.append(f"#EXT-X-APE-MASTER-URI:masters/{m['id']}.m3u8")
        block.append(f"#EXT-X-APE-MEDIA-URI:playlists/{m['id']}.m3u8")
        block.append("#EXT-X-APE-BLOCK-END")
        block.append(f"masters/{m['id']}.m3u8")
        counts.append(len(block))
        lines.extend(block)
        lines.append("")
    return "\n".join(lines).rstrip() + "\n", counts


def make_metadata(models: list[OrderedDict[str, Any]], raw_profiles: dict[str, Any], source_sha: str) -> OrderedDict[str, Any]:
    profiles: OrderedDict[str, Any] = OrderedDict()
    for m in models:
        raw = raw_profiles[m["id"]]
        settings = raw.get("settings", {}) or {}
        selected_settings = OrderedDict(
            (k, sanitize_obj(settings.get(k)))
            for k in [
                "resolution", "bitrate", "maxBitrateKbps", "avgBitrateKbps", "fps",
                "codec", "codec_string", "codec_priority", "codec_primary",
                "video_range", "hdr_mode", "audio_codec", "bit_depth",
                "color_space", "color_transfer", "color_primaries",
                "segment_duration_s", "buffer", "playerBuffer", "bufferSeconds",
                "bufferTargetSec", "bufferMaxSec", "networkCachingMs",
            ]
            if k in settings
        )
        profiles[m["id"]] = OrderedDict(
            [
                ("id", m["id"]),
                ("name", m["name"]),
                ("role", m["role"]),
                ("level", m["level"]),
                ("quality", m["quality"]),
                ("resolution", m["resolution"]),
                ("is_emulated", m["is_emulated"]),
                ("base_profile", m["base_profile"]),
                ("settings", selected_settings),
                ("hls", OrderedDict(
                    [
                        ("master_uri", f"masters/{m['id']}.m3u8"),
                        ("media_uri", f"playlists/{m['id']}.m3u8"),
                        ("stream_inf", m["stream_inf"]),
                        ("target_duration", SEGMENT_DURATION_S),
                        ("segment_duration_s", SEGMENT_DURATION_S),
                        ("segment_count", SEGMENT_COUNT),
                        ("buffer_target_ms", m["effective"]["target_ms"]),
                        ("buffer_min_ms", m["effective"]["min_ms"]),
                        ("buffer_max_ms", m["effective"]["max_ms"]),
                        ("load_control", OrderedDict(
                            [
                                ("minBufferMs", m["effective"]["exo_min_ms"]),
                                ("maxBufferMs", m["effective"]["exo_max_ms"]),
                                ("bufferForPlaybackMs", STARTUP_BUFFER_MS),
                                ("bufferForPlaybackAfterRebufferMs", RESUME_BUFFER_MS),
                            ]
                        )),
                        ("prefetch", OrderedDict(
                            [
                                ("segments", m["effective"]["prefetch_segments"]),
                                ("parallel", PARALLEL_DOWNLOADS),
                                ("target_s", m["effective"]["target_s"]),
                            ]
                        )),
                        ("live_sync", OrderedDict(
                            [
                                ("liveSyncDurationCount", 2),
                                ("liveMaxLatencyDurationCount", 4),
                                ("lowLatencyMode", False),
                            ]
                        )),
                    ]
                )),
                ("declared", m["declared"]),
                ("effective", m["effective"]),
                ("source_truth", OrderedDict(
                    [
                        ("status", "unknown"),
                        ("declared_resolution", m["resolution"]),
                        ("declared_bitrate_mbps", m["declared"]["bitrate_mbps"]),
                        ("declared_fps", m["declared"]["fps"]),
                        ("measured", False),
                    ]
                )),
                ("execution", OrderedDict(
                    [
                        ("status", "SIMULATED_EXECUTED"),
                        ("transcode", True),
                        ("upscale", True),
                        ("mechanism", "video_filters"),
                        ("doctrine", "UPSCALE_SIMULADO_VIDEO_FILTERS"),
                        ("evidence", "simulated_via_video_filters"),
                    ]
                )),
                ("contradictions", m["contradictions"]),
                ("headers", sanitize_obj(raw.get("headerOverrides", {}))),
                ("vlcopt", sanitize_obj(raw.get("vlcopt", {}))),
                ("kodiprop", sanitize_obj(raw.get("kodiprop", {}))),
                ("hlsjs", sanitize_obj(raw.get("hlsjs", {}))),
                ("prefetch_config", sanitize_obj(raw.get("prefetch_config", {}))),
                ("bounds", sanitize_obj(raw.get("bounds", {}))),
                ("compatibility", sanitize_obj(raw.get("compatibility", {}))),
                ("quality_levels", sanitize_obj(raw.get("quality_levels", {}))),
                ("player_enslavement", sanitize_obj(raw.get("player_enslavement", {}))),
            ]
        )
    return OrderedDict(
        [
            ("_meta", OrderedDict(
                [
                    ("schema", "ape.sample.12p.v1"),
                    ("generated_at", datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")),
                    ("source_config_sha256", source_sha),
                    ("profile_count", len(models)),
                    ("channel_count", 1),
                    ("layers", OrderedDict(
                        [
                            ("master", "MASTERLIST_12P.m3u8: 12 variantes, sin metadata pesada"),
                            ("media", "playlists/*.m3u8: 6 segmentos de 4 s, TARGETDURATION 4"),
                            ("metadata", "METADATA_12P.json: headers y perfiles completos"),
                            ("catalog", "CATALOGO_12P.m3u/.m3u8: 12 entradas de catalogo"),
                            ("sidecar", "APE_BLOCKS_12P.m3u8: 12 bloques de >=1000 lineas, no es HLS master"),
                        ]
                    )),
                    ("guarantees", [
                        "MASTERLIST_12P.m3u8 tiene 12 EXT-X-STREAM-INF, cada uno seguido inmediatamente por su URI.",
                        "MASTERLIST_12P.m3u8 no contiene EXTINF, TARGETDURATION, KEY ni DATERANGE.",
                        "Cada media playlist declara TARGETDURATION 4 y seis EXTINF de 4.000 s.",
                        "APE_BLOCKS_12P.m3u8 tiene 12 bloques de al menos 1000 lineas, marcado como sidecar.",
                        "No hay URLs reales: todo usa demo.example.invalid.",
                    ]),
                    ("limits", [
                        "Los segmentos son placeholders; no hay reproduccion real ni validacion ffprobe de video.",
                        "No se garantiza cero freeze, cero lag ni 4K/6K real: depende de fuente, CDN, red, equipo y player.",
                        "La metadata 8K/6K/4K es declarada; no es evidencia de transcodificacion ni de upscale ejecutado.",
                        "Los valores de buffer se normalizan por politica de RAM; los declarados quedan en el JSON.",
                    ]),
                ]
            )),
            ("channel", OrderedDict(CHANNEL)),
            ("profiles", profiles),
        ]
    )


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="\n")


def main() -> int:
    ap = argparse.ArgumentParser(description="Genera muestra 12P con capas HLS y metadata separadas.")
    ap.add_argument("--config", required=True, help="JSON de 12 perfiles")
    ap.add_argument("--out", required=True, help="Directorio de salida")
    args = ap.parse_args()

    config_path = Path(args.config).expanduser().resolve()
    out = Path(args.out).expanduser().resolve()
    out.mkdir(parents=True, exist_ok=True)

    raw = json.loads(config_path.read_text(encoding="utf-8"))
    raw_profiles = raw.get("profiles", {})
    missing = [pid for pid in PROFILE_ORDER if pid not in raw_profiles]
    if missing:
        raise SystemExit(f"Faltan perfiles: {missing}")
    models = [profile_model(pid, raw_profiles[pid]) for pid in PROFILE_ORDER]

    write_text(out / "MASTERLIST_12P.m3u8", make_master(models))
    for m in models:
        write_text(out / "masters" / f"{m['id']}.m3u8", make_single_master(m))
        write_text(out / "playlists" / f"{m['id']}.m3u8", make_media_playlist(m))

    metadata = make_metadata(models, raw_profiles, sha256_file(config_path))
    write_text(out / "METADATA_12P.json", json.dumps(metadata, ensure_ascii=False, indent=2) + "\n")

    catalog = make_catalog(models, raw_profiles)
    write_text(out / "CATALOGO_12P.m3u", catalog)
    write_text(out / "CATALOGO_12P.m3u8", catalog)

    ape_text, block_counts = make_ape_blocks(models, raw_profiles)
    write_text(out / "APE_BLOCKS_12P.m3u8", ape_text)

    with (out / "PROFILE_MATRIX_12P.csv").open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow([
            "id", "name", "resolution", "bitrate_mbps", "max_kbps", "avg_kbps", "fps",
            "codec_string", "video_range", "segment_s", "declared_target_s",
            "effective_target_s", "min_ms", "max_ms", "exo_min_ms", "exo_max_ms",
            "startup_ms", "resume_ms",
        ])
        for m in models:
            w.writerow([
                m["id"], m["name"], m["resolution"], m["declared"]["bitrate_mbps"],
                m["declared"]["max_kbps"], m["declared"]["avg_kbps"], m["declared"]["fps"],
                m["declared"]["codec_string"], m["declared"]["video_range"], SEGMENT_DURATION_S,
                m["declared"]["buffer_target_s"], m["effective"]["target_s"],
                m["effective"]["min_ms"], m["effective"]["max_ms"],
                m["effective"]["exo_min_ms"], m["effective"]["exo_max_ms"],
                STARTUP_BUFFER_MS, RESUME_BUFFER_MS,
            ])

    master_text = (out / "MASTERLIST_12P.m3u8").read_text(encoding="utf-8")
    master_lines = [ln for ln in master_text.splitlines() if ln.strip()]
    stream_inf_indices = [i for i, ln in enumerate(master_lines) if ln.startswith("#EXT-X-STREAM-INF:")]
    followed = sum(
        1 for i in stream_inf_indices
        if i + 1 < len(master_lines) and not master_lines[i + 1].startswith("#")
    )
    forbidden = {
        tag: sum(1 for ln in master_lines if ln.startswith(tag))
        for tag in ["#EXTINF", "#EXT-X-TARGETDURATION", "#EXT-X-KEY", "#EXT-X-DATERANGE"]
    }

    media_checks = []
    for m in models:
        text = (out / "playlists" / f"{m['id']}.m3u8").read_text(encoding="utf-8")
        lines = text.splitlines()
        target = [ln for ln in lines if ln.startswith("#EXT-X-TARGETDURATION:")]
        extinf = [ln for ln in lines if ln.startswith("#EXTINF:")]
        durations = [float(ln.split(":", 1)[1].split(",", 1)[0]) for ln in extinf]
        media_checks.append({
            "profile": m["id"],
            "targetduration": int(target[0].split(":", 1)[1]) if target else None,
            "segments": len(extinf),
            "max_extinf_s": max(durations) if durations else None,
            "valid": bool(target) and len(extinf) == SEGMENT_COUNT and max(durations) <= SEGMENT_DURATION_S,
        })

    metadata_text = (out / "METADATA_12P.json").read_text(encoding="utf-8")
    private_markers = ["duckdns", "iptv-ape"]
    other_urls = [u for u in URL_RE.findall(metadata_text) if not u.startswith(PLACEHOLDER_HOST)]
    validation = OrderedDict(
        [
            ("generated_at", datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")),
            ("master", OrderedDict(
                [
                    ("file", "MASTERLIST_12P.m3u8"),
                    ("variants", len(models)),
                    ("stream_inf", len(stream_inf_indices)),
                    ("stream_inf_followed_by_uri", followed),
                    ("forbidden_tags", forbidden),
                    ("valid", len(stream_inf_indices) == 12 and followed == 12 and all(v == 0 for v in forbidden.values())),
                ]
            )),
            ("media", OrderedDict(
                [
                    ("count", len(media_checks)),
                    ("targetduration_all_4", all(x["targetduration"] == 4 for x in media_checks)),
                    ("segments_all_6", all(x["segments"] == 6 for x in media_checks)),
                    ("max_extinf_all_le_4", all(x["max_extinf_s"] is not None and x["max_extinf_s"] <= 4.0 for x in media_checks)),
                    ("valid", all(x["valid"] for x in media_checks)),
                    ("per_profile", media_checks),
                ]
            )),
            ("catalog", OrderedDict(
                [
                    ("entries", len(models)),
                    ("m3u", "CATALOGO_12P.m3u"),
                    ("m3u8", "CATALOGO_12P.m3u8"),
                ]
            )),
            ("sidecar", OrderedDict(
                [
                    ("file", "APE_BLOCKS_12P.m3u8"),
                    ("blocks", len(block_counts)),
                    ("min_lines_per_block", min(block_counts)),
                    ("max_lines_per_block", max(block_counts)),
                    ("all_blocks_ge_1000", all(n >= 1000 for n in block_counts)),
                    ("line_counts", block_counts),
                    ("is_hls_master", False),
                ]
            )),
            ("metadata", OrderedDict(
                [
                    ("file", "METADATA_12P.json"),
                    ("profiles", len(metadata["profiles"])),
                    ("headers_total", sum(len(p.get("headers", {})) for p in metadata["profiles"].values())),
                    ("json_lines", len(metadata_text.splitlines())),
                ]
            )),
            ("sanitization", OrderedDict(
                [
                    ("private_marker_hits", sum(metadata_text.count(p) for p in private_markers)),
                    ("placeholder_urls", metadata_text.count(PLACEHOLDER_HOST)),
                    ("other_urls", len(other_urls)),
                    ("synthetic_tvg_name_entries", metadata_text.count('tvg-name="')),
                    ("synthetic_tvg_logo_entries", metadata_text.count('tvg-logo="')),
                ]
            )),
            ("limits", [
                "Validacion estructural, no reproduccion real.",
                "No hay segmentos reales; las URIs son placeholders.",
                "No se garantiza cero freeze, cero lag ni 4K/6K real.",
                "No se ejecuto ffprobe sobre video real.",
            ]),
        ]
    )
    write_text(out / "VALIDACION_12P.json", json.dumps(validation, ensure_ascii=False, indent=2) + "\n")

    readme = make_readme(models, block_counts, validation)
    write_text(out / "README_MUESTRA_12P.md", readme)

    # Manifiesto de integridad de todos los archivos generados.
    manifest_lines = []
    for path in sorted(out.rglob("*")):
        if path.is_file() and path.name != "MANIFEST_SHA256.txt":
            manifest_lines.append(f"{sha256_file(path)}  {path.relative_to(out).as_posix()}")
    write_text(out / "MANIFEST_SHA256.txt", "\n".join(manifest_lines) + "\n")

    print(json.dumps({
        "out": str(out),
        "profiles": len(models),
        "master_variants": len(stream_inf_indices),
        "master_followed_by_uri": followed,
        "media_playlists": len(media_checks),
        "sidecar_min_lines": min(block_counts),
        "sidecar_max_lines": max(block_counts),
        "metadata_lines": len(metadata_text.splitlines()),
        "validation_valid": validation["master"]["valid"] and validation["media"]["valid"] and validation["sidecar"]["all_blocks_ge_1000"],
    }, ensure_ascii=False, indent=2))
    return 0


def make_readme(models: list[OrderedDict[str, Any]], block_counts: list[int], validation: OrderedDict[str, Any]) -> str:
    rows = []
    for m in models:
        rows.append(
            f"| {m['id']} | {m['name']} | {m['resolution']} | {m['declared']['bitrate_mbps']} | "
            f"{m['declared']['fps']} | {m['declared']['codec_string']} | {m['declared']['video_range']} | "
            f"{m['declared']['buffer_target_s']} s | {m['effective']['target_s']} s |"
        )
    table = "\n".join(rows)
    return f"""# Muestra 12P: master, playlists, metadata y catálogo

Esta muestra usa los 12 perfiles del JSON adjunto y separa las capas que la lista anterior mezclaba. La master HLS queda limpia; los más de 1.000 líneas por perfil van a un sidecar APE, no a la master.

## Archivos

| Archivo | Rol | Validez |
|---|---|---|
| `MASTERLIST_12P.m3u8` | Master HLS con 12 variantes | 12 `STREAM-INF`, cada uno seguido de URI; sin `EXTINF`, `TARGETDURATION`, `KEY` ni `DATERANGE`. |
| `masters/<perfil>.m3u8` | Master de una variante por perfil | Una variante, URI inmediata. |
| `playlists/<perfil>.m3u8` | Media playlist live | 6 segmentos de 4,000 s; `TARGETDURATION:4`. |
| `METADATA_12P.json` | Metadata rica de los 12 perfiles | Headers, VLC, Kodi, HLS.js, bounds y valores normalizados. |
| `CATALOGO_12P.m3u` | Catálogo M3U extendido | 12 entradas, una por perfil. |
| `CATALOGO_12P.m3u8` | Igual, extensión `.m3u8` | No es una master HLS; está marcado como catálogo. |
| `APE_BLOCKS_12P.m3u8` | Sidecar APE con bloques de >=1.000 líneas | 12 bloques; no es una master HLS. |
| `PROFILE_MATRIX_12P.csv` | Matriz legible | 12 filas. |
| `VALIDACION_12P.json` | Evidencia estructural | Conteos y límites. |

## Los 12 perfiles

| ID | Nombre | Resolución | Mbps | fps | Códec HLS | Rango | Buffer declarado | Buffer efectivo |
|---|---|---|---:|---:|---|---|---:|---:|
{table}

El buffer efectivo se normaliza por política de RAM: si el declarado excede el techo del bitrate, se recorta. El valor declarado queda en `METADATA_12P.json` y en `APE_BLOCKS_12P.m3u8`. Esto evita un `X-Buffer-Max` menor que `X-Buffer-Target`, que es un defecto real del JSON de entrada.

## Por qué la master no lleva 1.000 líneas por canal

Una Master Playlist RFC 8216 es un índice: cada `#EXT-X-STREAM-INF` debe ir seguido inmediatamente por la URI de su variante. Si se meten cientos de etiquetas entre la declaración y la URI, el parser no asocia la variante y rechaza la lista, como ocurrió con la lista auditada. Por eso esta muestra usa tres capas:

1. **Master limpia** para el player y el parser HLS.
2. **Media playlists** para timing, segmentos y `TARGETDURATION`.
3. **Sidecar APE** para los headers, VLC, Kodi, HLS.js y los más de 1.000 líneas por perfil.

El sidecar se puede consumir como metadata, pero no se debe renombrar a `MASTERLIST` ni entregar a un parser HLS como si fuera una master.

## Buffer y arranque

La muestra usa `TARGETDURATION:4`, segmentos de 4 s, `bufferForPlaybackMs=1500` y `bufferForPlaybackAfterRebufferMs=3000`. El `X-Buffer-Target` es el objetivo de trabajo, no el buffer de arranque. El arranque es bajo para reducir la espera; el buffer crece después. `lowLatencyMode=false` para priorizar estabilidad sobre latencia.

## Lo que esta muestra sí garantiza

- 12 perfiles presentes, sin inventar canales ni duplicar entradas.
- 12 `STREAM-INF` con URI inmediata en la master.
- 12 media playlists con `TARGETDURATION:4` y seis segmentos de 4,000 s.
- 12 bloques sidecar de al menos {min(block_counts)} líneas; máximo {max(block_counts)}.
- Sin URLs reales: todo apunta a `demo.example.invalid`.

## Lo que no garantiza

- No hay video real: los segmentos son placeholders; no se ejecutó `ffprobe` sobre video.
- No se garantiza cero freeze, cero lag, ni 4K/6K real. Eso depende de la fuente, CDN, red, equipo, decodificador y player.
- La metadata 8K/6K/4K es declarada; no es evidencia de transcodificación ni de upscale ejecutado.
- No se probó en VLC, Kodi, TiviMate, ExoPlayer ni Apple TV.

## Uso

Reemplazar `demo.example.invalid` por el CDN real y generar los segmentos en las rutas `segments/<perfil>/seg_*.ts`. Después validar con `ffprobe` y con los players objetivo. Si se quiere el sidecar dentro de la app, consumirlo como metadata; no pegarlo dentro de la master.

## Validación de esta muestra

- Master: {validation['master']['stream_inf']} `STREAM-INF`, {validation['master']['stream_inf_followed_by_uri']} seguidos de URI, válida={validation['master']['valid']}.
- Media: {validation['media']['count']} playlists, `TARGETDURATION` 4 en todas={validation['media']['targetduration_all_4']}, 6 segmentos en todas={validation['media']['segments_all_6']}.
- Sidecar: {validation['sidecar']['blocks']} bloques, mínimo {validation['sidecar']['min_lines_per_block']} líneas, todos >=1000={validation['sidecar']['all_blocks_ge_1000']}.
- Metadata: {validation['metadata']['profiles']} perfiles, {validation['metadata']['headers_total']} headers, {validation['metadata']['json_lines']} líneas JSON.
"""


if __name__ == "__main__":
    raise SystemExit(main())
