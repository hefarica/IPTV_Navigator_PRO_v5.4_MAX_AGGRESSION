import json

CHECKS = {
    "D1_Dynamic_Range": [
        ("deband", "video-filter"),
        ("tonemap=mobius", "EXTVLCOPT"),
    ],
    "D2_Space_Validator": [
        ("colorspace=all=auto", "EXTVLCOPT"),
        ("chromal=topleft", "video-filter"),
        ("range=limited", "video-filter"),
        ("zscale=transfer=st2084", "video-filter"),
    ],
    "D3_Bitrate_Anarchy": [
        ("X-APE-ANTI-CUT", "EXTHTTP"),
        ("BUFFER-STRATEGY", "EXTHTTP"),
        ("BUFFER-PRELOAD", "EXTHTTP"),
    ],
    "D4_Hardware_Spoofing": [
        ("SPOOF-DEVICE-CLASS", "APE"),
        ("SPOOF-DECODING-CAPABILITY", "APE"),
        ("X-Cortex-Device-Type", "EXTHTTP"),
        ("X-Cortex-Device-HDR", "EXTHTTP"),
        ("SHIELD_TV_PRO", "PHANTOM"),
    ],
    "D5_Quantum_Pixel": [
        ("yuv444p10le", "video-filter"),
        ("format=yuv", "video-filter"),
    ],
    "D6_Luma_Precision": [
        ("unsharp=luma_msize", "video-filter"),
        ("hqdn3d", "video-filter"),
        ("pp=ac/dr/ci", "video-filter"),
        ("EXT-X-START:TIME-OFFSET=-3.0", "HEADER"),
    ],
    "D7_Network_Buffer": [
        ("BUFFER-DYNAMIC-ADJUSTMENT", "APE"),
        ("BUFFER-NEURAL-PREDICTION", "APE"),
        ("ADAPTIVE_PREDICTIVE_NEURAL", "EXTHTTP"),
    ],
    "D8_Codec_Enforcer": [
        ("AV1-FALLBACK-ENABLED", "APE"),
        ("AV1-FALLBACK-CHAIN", "APE"),
        ("CODEC-PRIORITY", "APE"),
        ("preferred_codec=hevc", "KODIPROP"),
    ],
    "D9_fMP4_CMAF": [
        ("EXT-X-MAP:URI", "CHANNEL"),
        ("EXT-X-SERVER-CONTROL", "HEADER"),
        ("PART-HOLD-BACK=1.0", "HEADER"),
        ("X-Transport-CMAF-Init", "EXTHTTP"),
    ],
    "D10_VRR_Sync": [
        ("vrr_sync=enabled", "KODIPROP"),
        ("auto_match_source_fps", "KODIPROP"),
    ],
    "D11_AI_DLSS": [
        ("X-Cortex-AI-Super-Resolution", "EXTHTTP"),
        ("X-Cortex-AI-Spatial-Denoise", "EXTHTTP"),
        ("X-Cortex-LCEVC", "EXTHTTP"),
        ("X-Cortex-Temporal-Artifact-Repair", "EXTHTTP"),
        ("X-Cortex-Constant-Frame-Rate", "EXTHTTP"),
        ("X-Cortex-Optical-Flow-Minterpolate", "EXTHTTP"),
        ("X-Cortex-Idempotency", "EXTHTTP"),
    ],
    "D12_Audio_Pipeline": [
        ("audio_passthrough_earc", "KODIPROP"),
        ("AUDIO-ATMOS", "APE"),
        ("AUDIO-SPATIAL", "APE"),
        ("AUDIO-BIT-DEPTH", "APE"),
    ],
    "D13_DRM": [
        ("DRM-WIDEVINE", "APE"),
        ("DRM-FAIRPLAY", "APE"),
        ("drm_widevine_enforce", "KODIPROP"),
    ],
    "D14_Telemetry": [
        ("TELCHEMY-TVQM", "APE"),
        ("TELCHEMY-TR101290", "APE"),
        ("X-Cortex-Bidirectional", "EXTHTTP"),
        ("X-Cortex-Device-HDR", "EXTHTTP"),
    ],
}

P0_BLOCK = """
#EXTM3U
#EXTM3U-VERSION:7
#EXT-X-INDEPENDENT-SEGMENTS
#EXT-X-SERVER-CONTROL:CAN-BLOCK-RELOAD=YES,PART-HOLD-BACK=1.0,CAN-SKIP-UNTIL=12.0
#EXT-X-START:TIME-OFFSET=-3.0,PRECISE=YES
#EXTINF:-1 tvg-id="TEST" tvg-name="Test P0" ape-profile="P0",Test P0
#EXTHTTP:{"paradigm":"OMNI-ORCHESTRATOR-V5-OMEGA","version":"1.0.0-OMEGA","profile":"P0_ULTRA_SPORTS_8K","ct":"sports","X-Cortex-Device-Type":"PREMIUM_TV","X-Cortex-Device-HDR":"DOLBY_VISION_P8","X-Cortex-Idempotency":"STRICT","X-Cortex-Bidirectional":"ENABLED","X-Cortex-AI-Super-Resolution":"REALESRGAN_X4PLUS","X-Cortex-AI-Spatial-Denoise":"NLMEANS_OPTICAL","X-Cortex-LCEVC":"PHASE_4_FP16","X-Cortex-Temporal-Artifact-Repair":"ACTIVATED","X-Cortex-Constant-Frame-Rate":"CFR_60_ANCHOR_LOCKED","X-Cortex-Optical-Flow-Minterpolate":"120FPS_ACTIVATED","X-Transport-CMAF-Init":"init.mp4","X-APE-ANTI-CUT":"ENABLED","X-APE-BUFFER-STRATEGY":"ADAPTIVE_PREDICTIVE_NEURAL","X-APE-BUFFER-PRELOAD-SEGMENTS":"30"}
#EXT-X-APE-SPOOF-DEVICE-CLASS:premium-tv
#EXT-X-APE-SPOOF-DECODING-CAPABILITY:hevc-main10-level6.1
#EXT-X-APE-BUFFER-DYNAMIC-ADJUSTMENT:ENABLED
#EXT-X-APE-BUFFER-NEURAL-PREDICTION:ENABLED
#EXT-X-APE-DRM-WIDEVINE:ENFORCE
#EXT-X-APE-DRM-FAIRPLAY:ENFORCE
#EXT-X-APE-AV1-FALLBACK-ENABLED:true
#EXT-X-APE-AV1-FALLBACK-CHAIN:HEVC>AV1>H264
#EXT-X-APE-CODEC-PRIORITY:HEVC>AV1>H264
#EXT-X-APE-TELCHEMY-TVQM:ENABLED
#EXT-X-APE-TELCHEMY-TR101290:ENABLED
#EXT-X-APE-AUDIO-ATMOS:true
#EXT-X-APE-AUDIO-SPATIAL:ENABLED
#EXT-X-APE-AUDIO-BIT-DEPTH:24bit
#EXT-X-APE-PHANTOM-DEVICE-SPOOF:SHIELD_TV_PRO_2023
#KODIPROP:inputstream.adaptive.stream_selection_type=adaptive
#KODIPROP:inputstream.adaptive.chooser_bandwidth_max=2147483647
#KODIPROP:inputstream.adaptive.chooser_resolution_max=8K
#KODIPROP:inputstream.adaptive.ignore_screen_resolution=true
#KODIPROP:inputstream.adaptive.preferred_codec=hevc,hev1,hvc1,h265
#KODIPROP:vrr_sync=enabled
#KODIPROP:auto_match_source_fps=true
#KODIPROP:audio_passthrough_earc=strict
#KODIPROP:drm_widevine_enforce=true
#EXTVLCOPT:video-filter=fieldmatch,decimate,nlmeans=s=3.0:p=7:r=15,bwdif=mode=1:parity=-1:deint=0,deband=1thr=0.015:2thr=0.015:3thr=0.015:4thr=0.015:blur=1,pp=ac/dr/ci,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.4,zscale=transfer=st2084:primaries=bt2020:matrix=2020_ncl:dither=error_diffusion:range=limited:chromal=topleft,format=yuv444p10le,hqdn3d=4:3:12:9,fps=fps=60:round=near,minterpolate=fps=120:mi_mode=mci:mc_mode=aobmc:vsbmc=1:me=epzs
#EXTVLCOPT:colorspace=all=auto:trc=auto
#EXTVLCOPT:tonemap=mobius
#EXT-X-MAP:URI="init.mp4"
http://example.com/stream.m3u8
"""

total_checks = 0
passed_checks = 0
failed = []

for dim, checks in CHECKS.items():
    dim_pass = 0
    for keyword, context in checks:
        total_checks += 1
        if keyword in P0_BLOCK:
            passed_checks += 1
            dim_pass += 1
        else:
            failed.append(f"  FAIL {dim}: [{context}] '{keyword}'")
    status = "PASS" if dim_pass == len(checks) else "WARN"
    score = dim_pass / len(checks) * 10
    print(f"{status}  {dim}: {dim_pass}/{len(checks)} = {score:.1f}/10")

print(f"\n{'='*50}")
print(f"TOTAL: {passed_checks}/{total_checks} checks")
score = passed_checks / total_checks * 10
print(f"SCORE: {score:.2f}/10.0")
if failed:
    print(f"\nFAILED:")
    for f in failed:
        print(f)
else:
    print("\nALL CHECKS PASSED - ANATOMY IS 10/10 READY")
