/* ═══════════════════════════════════════════════════════════════════════════
 * APE PROFILES 12K — GENERADO. NO EDITAR A MANO.
 * Fuente: artifacts/LAB_CALIBRATED_FINAL_v24.0.0-6K.json
 * sha256 LAB: 71307d9a6ce49cf4d384c6c894093e15011891306107b970de6768efff953e30
 * Generado: 2026-11-19T03:28:51.427Z con tools/gen-profiles-12k.js
 * 12 perfiles = 6 base (P0..P5) + 6 SIMULATE 6K (P0.5..P5.5).
 * flt = receta de detalle del tier; valores del LAB, derivados declarados
 * cuando el .5 no superaba a su base, siempre dentro de la allowlist del
 * controlador (nlmeans_s 0.05..2.0, p 1..15, r 3..30, downscale 0..1).
 * VERDAD: 6K es SIMULATE (objetivo de display). Los filtros NO inventan
 * detalle: el VPS no transcodifica píxeles; el realce lo hace el VPP del
 * device / pipeline del APK, o un player tipo VLC por #EXTVLCOPT.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.APE_PROFILES_12K = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    return {
      "lab": {
        "path": "artifacts/LAB_CALIBRATED_FINAL_v24.0.0-6K.json",
        "sha256": "71307d9a6ce49cf4d384c6c894093e15011891306107b970de6768efff953e30"
      },
      "generated_at": "2026-11-19T03:28:51.427Z",
      "generator": "tools/gen-profiles-12k.js",
      "truth": {
        "mode": "SIMULATE",
        "executor": "display",
        "executed": 0,
        "note": "6K declarado como objetivo de display; sin transcode en el VPS"
      },
      "ranges": {
        "nlmeans_s": [
          0.05,
          2
        ],
        "nlmeans_p": [
          1,
          15
        ],
        "nlmeans_r": [
          3,
          30
        ],
        "downscale": [
          0,
          1
        ],
        "unsharp_amount": [
          0,
          2
        ]
      },
      "detail_rule": "unsharp.amount del .5 > amount de su base; si el LAB no lo cumple se DERIVA base x1.5",
      "profiles": {
        "P0": {
          "id": "P0",
          "name": "8K Master",
          "resolution": "7680x4320",
          "codec": "DVH1",
          "codec_full": "dvh1.08.06",
          "codec_chain_video": "dvh1.08.06,hvc1.2.4.L183.B0,hvc1.2.4.L180.B0,hvc1.2.4.L156.B0,hvc1.2.4.L153.B0,hvc1.2.4.L150.B0,hvc1.2.4.L123.B0,hvc1.2.4.L120.B0,hvc1.1.6.L153.B0,hvc1.1.6.L120.B0,avc1.640028",
          "bitrate": 200,
          "fps": 30,
          "segment_duration_s": 4,
          "playerBuffer": 20000,
          "strategy": "ultra-aggressive",
          "is6k": false,
          "tier": 0,
          "filter_chain_lab": "nlmeans=s=3.0:p=7:r=15,atadenoise,bwdif=mode=1:parity=-1:deint=0,gradfun=radius=16:strength=1.0,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.4:chroma_msize_x=0:chroma_msize_y=0:chroma_amount=0.0,zscale=transfer=st2084:primaries=bt2020:matrix=2020ncl:dither=error_diffusion:range=full,minterpolate=fps=120:mi_mode=mci:mc_mode=aobmc:vsbmc=1:me=epzs:scd=5",
          "flt": {
            "nlmeans_s": 2,
            "nlmeans_p": 7,
            "nlmeans_r": 15,
            "lab_amount": 0.4,
            "unsharp": "3:3:0.4:0:0",
            "unsharp_amount": 0.4,
            "unsharp_src": "lab",
            "gradfun": "1:16",
            "zscale": "st2084:2020ncl:full",
            "downscale": 0,
            "notes": [
              "nlmeans_s 3 -> 2 (allowlist 0.05..2.0)"
            ]
          }
        },
        "P0.5": {
          "id": "P0.5",
          "name": "6K Emulated (P0)",
          "resolution": "5760x3240",
          "codec": "H265",
          "codec_full": "hvc1.2.4.L183.B0",
          "codec_chain_video": "hvc1.2.4.L183.B0,dvh1.08.06,hvc1.2.4.L183.B0,hvc1.2.4.L180.B0,hvc1.2.4.L156.B0,hvc1.2.4.L153.B0,hvc1.2.4.L150.B0,hvc1.2.4.L123.B0,hvc1.2.4.L120.B0,hvc1.1.6.L153.B0,hvc1.1.6.L120.B0,avc1.640028",
          "bitrate": 80,
          "fps": 60,
          "segment_duration_s": 4,
          "playerBuffer": 20000,
          "strategy": "ultra-aggressive",
          "is6k": true,
          "tier": 6,
          "filter_chain_lab": "zscale=w=5760:h=3240:filter=lanczos,gradfun=radius=16:strength=1.0,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.4:chroma_msize_x=3:chroma_msize_y=3:chroma_amount=0.0,zscale=transfer=smpte2084:primaries=bt2020:matrix=bt2020nc:dither=error_diffusion:range=full",
          "flt": {
            "lab_amount": 0.4,
            "unsharp": "3:3:0.6:3:0",
            "unsharp_amount": 0.6,
            "unsharp_src": "derived:detail_tier_x1.5",
            "gradfun": "1:16",
            "downscale": 0,
            "upscale_to": "5760x3240",
            "notes": [
              "amount del LAB (0.4) no supera al de su base (0.4): DERIVADO 0.6 = base x1.5"
            ]
          }
        },
        "P1": {
          "id": "P1",
          "name": "4K UHD Pro",
          "resolution": "3840x2160",
          "codec": "HVC1",
          "codec_full": "hvc1.2.4.L153.B0",
          "codec_chain_video": "hvc1.2.4.L153.B0,hvc1.2.4.L150.B0,hvc1.2.4.L123.B0,hvc1.2.4.L120.B0,hvc1.2.4.L93.B0,avc1.640028",
          "bitrate": 40,
          "fps": 60,
          "segment_duration_s": 4,
          "playerBuffer": 16000,
          "strategy": "ultra-aggressive",
          "is6k": false,
          "tier": 0,
          "filter_chain_lab": "nlmeans=s=3.0:p=7:r=15,atadenoise,bwdif=mode=1:parity=-1:deint=0,gradfun=radius=16:strength=1.0,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.4:chroma_msize_x=0:chroma_msize_y=0:chroma_amount=0.0,zscale=transfer=st2084:primaries=bt2020:matrix=2020ncl:dither=error_diffusion:range=full,minterpolate=fps=120:mi_mode=mci:mc_mode=aobmc:vsbmc=1:me=epzs:scd=5",
          "flt": {
            "nlmeans_s": 2,
            "nlmeans_p": 7,
            "nlmeans_r": 15,
            "lab_amount": 0.4,
            "unsharp": "3:3:0.4:0:0",
            "unsharp_amount": 0.4,
            "unsharp_src": "lab",
            "gradfun": "1:16",
            "zscale": "st2084:2020ncl:full",
            "downscale": 0,
            "notes": [
              "nlmeans_s 3 -> 2 (allowlist 0.05..2.0)"
            ]
          }
        },
        "P1.5": {
          "id": "P1.5",
          "name": "6K Emulated (P1)",
          "resolution": "5760x3240",
          "codec": "H265",
          "codec_full": "hvc1.2.4.L183.B0",
          "codec_chain_video": "hvc1.2.4.L183.B0,hvc1.2.4.L153.B0,hvc1.2.4.L150.B0,hvc1.2.4.L123.B0,hvc1.2.4.L120.B0,hvc1.2.4.L93.B0,avc1.640028",
          "bitrate": 60,
          "fps": 60,
          "segment_duration_s": 4,
          "playerBuffer": 16000,
          "strategy": "ultra-aggressive",
          "is6k": true,
          "tier": 6,
          "filter_chain_lab": "deblock=filter=strong,scale=w=5760:h=3240:flags=lanczos,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.6:chroma_msize_x=3:chroma_msize_y=3:chroma_amount=0.3,zscale=transfer=smpte2084:primaries=bt2020:matrix=bt2020nc:dither=error_diffusion:range=full",
          "flt": {
            "lab_amount": 0.6,
            "unsharp": "3:3:0.6:3:0.3",
            "unsharp_amount": 0.6,
            "unsharp_src": "lab",
            "zscale": "smpte2084:bt2020nc:full",
            "downscale": 0,
            "upscale_to": "5760x3240",
            "notes": []
          }
        },
        "P2": {
          "id": "P2",
          "name": "4K Balanced",
          "resolution": "3840x2160",
          "codec": "HVC1",
          "codec_full": "hvc1.2.4.L150.B0",
          "codec_chain_video": "hvc1.2.4.L150.B0,hvc1.2.4.L123.B0,hvc1.2.4.L120.B0,hvc1.2.4.L93.B0,avc1.640028",
          "bitrate": 25,
          "fps": 30,
          "segment_duration_s": 4,
          "playerBuffer": 13000,
          "strategy": "aggressive",
          "is6k": false,
          "tier": 0,
          "filter_chain_lab": "minterpolate=fps=120:mi_mode=mci:mc_mode=aobmc:vsbmc=1:me=epzs:scd=5,atadenoise",
          "flt": {
            "downscale": 0,
            "notes": []
          }
        },
        "P2.5": {
          "id": "P2.5",
          "name": "6K Emulated (P2)",
          "resolution": "5760x3240",
          "codec": "H265",
          "codec_full": "hvc1.2.4.L183.B0",
          "codec_chain_video": "hvc1.2.4.L183.B0,hvc1.2.4.L150.B0,hvc1.2.4.L123.B0,hvc1.2.4.L120.B0,hvc1.2.4.L93.B0,avc1.640028",
          "bitrate": 45,
          "fps": 60,
          "segment_duration_s": 4,
          "playerBuffer": 13000,
          "strategy": "aggressive",
          "is6k": true,
          "tier": 6,
          "filter_chain_lab": "zscale=w=5760:h=3240:filter=lanczos,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.8:chroma_msize_x=3:chroma_msize_y=3:chroma_amount=0.3,hqdn3d=1.5:1.0:2.0:1.5,zscale=transfer=smpte2084:primaries=bt2020:matrix=bt2020nc:dither=error_diffusion:range=full",
          "flt": {
            "lab_amount": 0.8,
            "unsharp": "3:3:0.8:3:0.3",
            "unsharp_amount": 0.8,
            "unsharp_src": "lab",
            "downscale": 0,
            "upscale_to": "5760x3240",
            "notes": [
              "base P2 sin unsharp en el LAB: el .5 (0.8) es más exigente por definición"
            ]
          }
        },
        "P3": {
          "id": "P3",
          "name": "FHD 1080p",
          "resolution": "1920x1080",
          "codec": "HVC1",
          "codec_full": "hvc1.2.4.L123.B0",
          "codec_chain_video": "hvc1.2.4.L123.B0,hvc1.2.4.L120.B0,hvc1.2.4.L93.B0,avc1.640028",
          "bitrate": 15,
          "fps": 60,
          "segment_duration_s": 4,
          "playerBuffer": 11000,
          "strategy": "adaptive",
          "is6k": false,
          "tier": 0,
          "filter_chain_lab": "nlmeans=s=2.5:p=5:r=11,atadenoise,bwdif=mode=1:parity=-1:deint=0,gradfun=radius=12:strength=0.8,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.3:chroma_msize_x=0:chroma_msize_y=0:chroma_amount=0.0,zscale=transfer=bt709:primaries=bt709:matrix=bt709:dither=error_diffusion:range=full,minterpolate=fps=120:mi_mode=mci:mc_mode=aobmc:vsbmc=1:me=epzs:scd=0",
          "flt": {
            "nlmeans_s": 2,
            "nlmeans_p": 5,
            "nlmeans_r": 11,
            "lab_amount": 0.3,
            "unsharp": "3:3:0.3:0:0",
            "unsharp_amount": 0.3,
            "unsharp_src": "lab",
            "gradfun": "0.8:12",
            "zscale": "bt709:bt709:full",
            "downscale": 0,
            "notes": [
              "nlmeans_s 2.5 -> 2 (allowlist 0.05..2.0)"
            ]
          }
        },
        "P3.5": {
          "id": "P3.5",
          "name": "6K Emulated (P3)",
          "resolution": "5760x3240",
          "codec": "H265",
          "codec_full": "hvc1.2.4.L183.B0",
          "codec_chain_video": "hvc1.2.4.L183.B0,hvc1.2.4.L123.B0,hvc1.2.4.L120.B0,hvc1.2.4.L93.B0,avc1.640028",
          "bitrate": 35,
          "fps": 60,
          "segment_duration_s": 4,
          "playerBuffer": 11000,
          "strategy": "adaptive",
          "is6k": true,
          "tier": 6,
          "filter_chain_lab": "deblock=filter=strong,scale=w=5760:h=3240:flags=lanczos,nlmeans=s=2.5:p=5:r=11,atadenoise,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=1.0:chroma_msize_x=3:chroma_msize_y=3:chroma_amount=0.3,minterpolate=fps=120:mi_mode=mci:mc_mode=aobmc:vsbmc=1:me=epzs:scd=0,zscale=transfer=smpte2084:primaries=bt2020:matrix=bt2020nc:dither=error_diffusion:range=full",
          "flt": {
            "nlmeans_s": 2,
            "nlmeans_p": 5,
            "nlmeans_r": 11,
            "lab_amount": 1,
            "unsharp": "3:3:1:3:0.3",
            "unsharp_amount": 1,
            "unsharp_src": "lab",
            "zscale": "smpte2084:bt2020nc:full",
            "downscale": 0,
            "upscale_to": "5760x3240",
            "notes": [
              "nlmeans_s 2.5 -> 2 (allowlist 0.05..2.0)"
            ]
          }
        },
        "P4": {
          "id": "P4",
          "name": "HD 720p",
          "resolution": "1280x720",
          "codec": "HVC1",
          "codec_full": "hvc1.2.4.L93.B0",
          "codec_chain_video": "hvc1.2.4.L93.B0,avc1.640028,avc1.4d401f",
          "bitrate": 10,
          "fps": 30,
          "segment_duration_s": 4,
          "playerBuffer": 8000,
          "strategy": "balanced",
          "is6k": false,
          "tier": 0,
          "filter_chain_lab": "hqdn3d=luma_spatial=2.0:chroma_spatial=1.5:luma_tmp=3.0:chroma_tmp=2.5,atadenoise,yadif=mode=1:parity=-1:deint=0,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.25:chroma_msize_x=0:chroma_msize_y=0:chroma_amount=0.0,minterpolate=fps=120:mi_mode=mci:mc_mode=aobmc:vsbmc=1:me=epzs:scd=0",
          "flt": {
            "lab_amount": 0.25,
            "unsharp": "3:3:0.25:0:0",
            "unsharp_amount": 0.25,
            "unsharp_src": "lab",
            "downscale": 0,
            "notes": []
          }
        },
        "P4.5": {
          "id": "P4.5",
          "name": "6K Emulated (P4)",
          "resolution": "5760x3240",
          "codec": "H265",
          "codec_full": "hvc1.2.4.L183.B0",
          "codec_chain_video": "hvc1.2.4.L183.B0,hvc1.2.4.L93.B0,avc1.640028,avc1.4d401f",
          "bitrate": 30,
          "fps": 60,
          "segment_duration_s": 4,
          "playerBuffer": 8000,
          "strategy": "balanced",
          "is6k": true,
          "tier": 6,
          "filter_chain_lab": "deblock=filter=strong,scale=w=5760:h=3240:flags=lanczos,nlmeans=s=3.0:p=7:r=15,atadenoise,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=1.1:chroma_msize_x=3:chroma_msize_y=3:chroma_amount=0.3,minterpolate=fps=120:mi_mode=mci:mc_mode=aobmc:vsbmc=1:me=epzs:scd=0,zscale=transfer=smpte2084:primaries=bt2020:matrix=bt2020nc:dither=error_diffusion:range=full",
          "flt": {
            "nlmeans_s": 2,
            "nlmeans_p": 7,
            "nlmeans_r": 15,
            "lab_amount": 1.1,
            "unsharp": "3:3:1.1:3:0.3",
            "unsharp_amount": 1.1,
            "unsharp_src": "lab",
            "zscale": "smpte2084:bt2020nc:full",
            "downscale": 0,
            "upscale_to": "5760x3240",
            "notes": [
              "nlmeans_s 3 -> 2 (allowlist 0.05..2.0)"
            ]
          }
        },
        "P5": {
          "id": "P5",
          "name": "SD 480p",
          "resolution": "854x480",
          "codec": "AVC1",
          "codec_full": "avc1.42c01e",
          "codec_chain_video": "avc1.42c01e,avc1.640028",
          "bitrate": 2,
          "fps": 30,
          "segment_duration_s": 4,
          "playerBuffer": 7000,
          "strategy": "conservative",
          "is6k": false,
          "tier": 0,
          "filter_chain_lab": "minterpolate=fps=120:mi_mode=mci:mc_mode=aobmc:vsbmc=1:me=epzs:scd=0,atadenoise",
          "flt": {
            "downscale": 0,
            "notes": []
          }
        },
        "P5.5": {
          "id": "P5.5",
          "name": "6K Emulated (P5)",
          "resolution": "5760x3240",
          "codec": "H265",
          "codec_full": "hvc1.2.4.L183.B0",
          "codec_chain_video": "hvc1.2.4.L183.B0,avc1.42c01e,avc1.640028",
          "bitrate": 25,
          "fps": 60,
          "segment_duration_s": 4,
          "playerBuffer": 7000,
          "strategy": "conservative",
          "is6k": true,
          "tier": 6,
          "filter_chain_lab": "deblock=filter=strong,scale=w=5760:h=3240:flags=lanczos,nlmeans=s=3.2:p=7:r=17,atadenoise,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=1.2:chroma_msize_x=3:chroma_msize_y=3:chroma_amount=0.3,minterpolate=fps=120:mi_mode=mci:mc_mode=aobmc:vsbmc=1:me=epzs:scd=0,zscale=transfer=smpte2084:primaries=bt2020:matrix=bt2020nc:dither=error_diffusion:range=full",
          "flt": {
            "nlmeans_s": 2,
            "nlmeans_p": 7,
            "nlmeans_r": 17,
            "lab_amount": 1.2,
            "unsharp": "3:3:1.2:3:0.3",
            "unsharp_amount": 1.2,
            "unsharp_src": "lab",
            "zscale": "smpte2084:bt2020nc:full",
            "downscale": 0,
            "upscale_to": "5760x3240",
            "notes": [
              "nlmeans_s 3.2 -> 2 (allowlist 0.05..2.0)",
              "base P5 sin unsharp en el LAB: el .5 (1.2) es más exigente por definición"
            ]
          }
        }
      }
    };
});
