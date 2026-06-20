#!/usr/bin/env python3
"""
ape_hdr_color_science.py — Agente 5 (color): HDR/WCG Color-Science builder.

PURE STRING BUILDER. It does NOT transcode and it is NOT an nginx body_filter.
It builds the FFmpeg `-vf` color-filter chain that the async service
(ape_pixel_processor.py) feeds to its per-channel ffmpeg process.

Owner override 2026-06-20 — DIRECTIVA TRANSCODE VPS PERMITIDO: VPS pixel transcode
is PERMITTED, but ONLY as an async opt-in service with a FREEZELESS passthrough
fallback. See CLAUDE.md.

Corrected from the PDF spec:
  * BT.2446 SDR->HDR uses zscale (the PDF's broken f-string/.format is fixed here).
  * Per-display NPL/MaxCLL/DV-profile table preserved (Sec 6.4).
"""

from __future__ import annotations


class HDRColorTransformer:
    """Builds FFmpeg color filter strings for SDR->HDR / HDR-optimize / passthrough."""

    MODES = {
        "NATIVE_PASS": "passthrough_hdr",
        "SDR_TO_HDR_UPCONVERT": "bt2446_sdr_to_hdr",
        "HDR_TO_HDR_OPTIMIZE": "bt2446_hdr_optimize",
    }

    # Sec 6.4 — per-display target color profiles (UA-detected).
    DISPLAY_PROFILES = {
        "lg_oled":      {"primaries": "bt2020", "transfer": "smpte2084", "npl": 1000, "maxcll": 1000, "dv": "8.4"},
        "samsung_8k":   {"primaries": "bt2020", "transfer": "smpte2084", "npl": 4000, "maxcll": 4000, "dv": "8.1"},
        "shield_pro":   {"primaries": "bt2020", "transfer": "smpte2084", "npl": 1000, "maxcll": 1000, "dv": None},
        "chromecast_gtv": {"primaries": "bt2020", "transfer": "arib-std-b67", "npl": 1000, "maxcll": 1000, "dv": None},  # HLG
        "generic_hdr":  {"primaries": "bt2020", "transfer": "smpte2084", "npl": 600,  "maxcll": 600,  "dv": None},
        "sdr_fallback": {"primaries": "bt709",  "transfer": "bt709",     "npl": 100,  "maxcll": 100,  "dv": None},
        "iphone15":     {"primaries": "bt2020", "transfer": "smpte2084", "npl": 1600, "maxcll": 1200, "dv": "8.4"},
        "appletv4k":    {"primaries": "bt2020", "transfer": "smpte2084", "npl": 1000, "maxcll": 1000, "dv": "8.1"},
    }

    _UA_MATCH = (
        ("lg_oled",       ("lg", "webos", "oled")),
        ("samsung_8k",    ("samsung", "tizen", "qn900")),
        ("shield_pro",    ("shield", "nvidia")),
        ("chromecast_gtv", ("chromecast", "google tv", "crkey")),
        ("iphone15",      ("iphone",)),
        ("appletv4k",     ("apple tv", "appletv")),
    )

    def profile_for_ua(self, user_agent: str | None) -> dict:
        ua = (user_agent or "").lower()
        for key, needles in self._UA_MATCH:
            if any(n in ua for n in needles):
                return dict(self.DISPLAY_PROFILES[key], _name=key)
        # Conservative default: HDR10 @ 600 nits works on any HDR panel.
        return dict(self.DISPLAY_PROFILES["generic_hdr"], _name="generic_hdr")

    def build_color_filter(self, mode_key: str, display: dict | None = None) -> str:
        """Return the FFmpeg -vf color sub-chain for the requested mode."""
        mode = self.MODES.get(mode_key, "bt2446_sdr_to_hdr")
        d = display or self.DISPLAY_PROFILES["generic_hdr"]
        npl = int(d.get("npl", 1000))
        dst_trc = d.get("transfer", "smpte2084")
        dst_prim = d.get("primaries", "bt2020")

        if mode == "passthrough_hdr":
            # Content is already HDR — never re-grade, just keep the pipe clean.
            return "format=yuv420p10le"

        if mode == "bt2446_hdr_optimize":
            # HDR -> HDR remaster for high-nit panels.
            return (
                "zscale=p=bt2020:t=smpte2084:m=bt2020nc:r=tv,"
                "tonemap=tonemap=bt2446a,"
                "zscale=p=bt2020:t=smpte2084:m=bt2020nc:npl=%d,"
                "format=yuv420p10le" % npl
            )

        # Default: BT.2446 SDR -> HDR10/PQ upconvert (linearize -> map -> PQ).
        return (
            "zscale=p=bt709:t=linear:m=bt709:npl=100,"
            "tonemap=tonemap=bt2446a,"
            "zscale=p=%s:t=%s:m=bt2020nc:npl=%d,"
            "format=yuv420p10le" % (dst_prim, dst_trc, npl)
        )

    def build_dovi_rpu_filter(self, profile: str | None = "8.1") -> str | None:
        """Dolby Vision RPU injection guidance (only if the build supports libdovi)."""
        if not profile:
            return None
        if profile == "8.4":
            return "dovi_rpu=enable=1:mode=8.4"
        return "dovi_rpu=enable=1"

    def mastering_metadata_args(self, display: dict | None = None) -> list[str]:
        """x265 mastering-display / MaxCLL args for honest HDR10 static metadata."""
        d = display or self.DISPLAY_PROFILES["generic_hdr"]
        maxcll = int(d.get("maxcll", 1000))
        maxfall = int(maxcll * 0.4)
        # BT.2020 primaries + D65 white, luminance in 0.0001 cd/m2 / 1 cd/m2 units.
        master = (
            "G(8500,39850)B(6550,2300)R(35400,14600)"
            "WP(15635,16450)L(%d0000,1)" % int(d.get("npl", 1000))
        )
        return [
            "master-display=%s" % master,
            "max-cll=%d,%d" % (maxcll, maxfall),
        ]


if __name__ == "__main__":
    t = HDRColorTransformer()
    prof = t.profile_for_ua("LG webOS OLED")
    print("display:", prof["_name"])
    print("vf:", t.build_color_filter("SDR_TO_HDR_UPCONVERT", prof))
    print("dovi:", t.build_dovi_rpu_filter(prof.get("dv")))
    print("master:", t.mastering_metadata_args(prof))
