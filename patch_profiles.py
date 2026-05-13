import sys

target_file = r'C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\IPTV_v5.4_MAX_AGGRESSION\frontend\js\ape-v9\m3u8-typed-arrays-ultimate.js'
with open(target_file, 'r', encoding='utf-8') as f:
    code = f.read()

profiles_omega = '''
// --- OMEGA CRYSTAL 796 PROFILES ---
const PROFILES_OMEGA = {
    P0: { id: "P0", label: "8K_ULTRA_SPORTS", resolution: "7680x4320", fps: 120, fps_interp: 240, bitrate_mbps: 80, buffer_s: 60, buffer_ms: 60000, codec_primary: "hevc", codec_fallback: "av1", ct: "sports", hdr_nits: 5000, codecs_str: "hev1.1.6.L180.B0,mp4a.40.2", bandwidth: 80000000 },
    P1: { id: "P1", label: "8K_CINEMA_HDR", resolution: "7680x4320", fps: 60, fps_interp: 120, bitrate_mbps: 80, buffer_s: 60, buffer_ms: 60000, codec_primary: "hevc", codec_fallback: "av1", ct: "cinema", hdr_nits: 5000, codecs_str: "hev1.1.6.L180.B0,mp4a.40.2", bandwidth: 80000000 },
    P2: { id: "P2", label: "4K_NEWS_HDR", resolution: "3840x2160", fps: 60, fps_interp: 120, bitrate_mbps: 40, buffer_s: 30, buffer_ms: 30000, codec_primary: "hevc", codec_fallback: "h264", ct: "news", hdr_nits: 1000, codecs_str: "hev1.1.6.L150.B0,mp4a.40.2", bandwidth: 40000000 },
    P3: { id: "P3", label: "FHD_ADVANCED_60FPS", resolution: "1920x1080", fps: 60, fps_interp: 120, bitrate_mbps: 16.7, buffer_s: 120, buffer_ms: 120000, codec_primary: "hevc", codec_fallback: "h264", ct: "general", hdr_nits: 1000, codecs_str: "hev1.1.6.L93.B0,mp4a.40.2", bandwidth: 16700000 },
    P4: { id: "P4", label: "HD_STABLE", resolution: "1280x720", fps: 30, fps_interp: 60, bitrate_mbps: 5, buffer_s: 30, buffer_ms: 30000, codec_primary: "h264", codec_fallback: "hevc", ct: "general", hdr_nits: 400, codecs_str: "avc1.640028,mp4a.40.2", bandwidth: 5000000 },
    P5: { id: "P5", label: "SD_FAILSAFE", resolution: "854x480", fps: 25, fps_interp: 50, bitrate_mbps: 1.5, buffer_s: 30, buffer_ms: 30000, codec_primary: "h264", codec_fallback: "h264", ct: "general", hdr_nits: 200, codecs_str: "avc1.42E01E,mp4a.40.2", bandwidth: 1500000 }
};
'''

# Replace PROFILES with PROFILES_OMEGA in the new generateChannelEntry
code = code.replace("let p_cfg = PROFILES[profile] || PROFILES['P3'];", profiles_omega + "\\n        let p_cfg = PROFILES_OMEGA[profile] || PROFILES_OMEGA['P3'];")

with open(target_file, 'w', encoding='utf-8') as f:
    f.write(code)
