import re

file_path = r"C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\IPTV_v5.4_MAX_AGGRESSION\frontend\js\ape-v9\ape-profiles-config.js"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Fix the syntax error in HEADER_CATEGORIES
broken_pattern = r'"X-APE-EVASION-TLS-FINGERPRINT-RANDO\s*P0:\s*\{'
# We also have to be careful with any trailing whitespaces in the original string.
# In the original we have "X-APE-EVASION-TLS-FINGERPRINT-RANDO        P0: {"
broken_pattern_2 = r'"X-APE-EVASION-TLS-FINGERPRINT-RANDO\s+P0: \{'

fixed_replacement = """"X-APE-EVASION-TLS-FINGERPRINT-RANDOMIZE",
                "X-APE-EVASION-GEO-PHANTOM", "X-APE-EVASION-DEEP-PACKET-INSPECTION-BYPASS", "X-APE-IP-ROTATION-ENABLED",
                "X-APE-IP-ROTATION-STRATEGY", "X-APE-STEALTH-UA", "X-APE-STEALTH-XFF", 
                "X-APE-STEALTH-FINGERPRINT", "X-APE-SWARM-ENABLED", "X-APE-SWARM-PEERS"
            ]
        },
        omega_transport: {
            name: "🚀 OMEGA: Transport & Cache Core",
            description: "CMAF universal, chunking sub-milisegundo, neural cache",
            headers: [
                "X-APE-TRANSPORT-PROTOCOL", "X-APE-TRANSPORT-CHUNK-SIZE", "X-APE-TRANSPORT-FALLBACK-1", 
                "X-APE-CACHE-STRATEGY", "X-APE-CACHE-SIZE", "X-APE-CACHE-PREFETCH", 
                "X-APE-BUFFER-STRATEGY", "X-APE-BUFFER-PRELOAD-SEGMENTS", "X-APE-BUFFER-DYNAMIC-ADJUSTMENT",
                "X-APE-BUFFER-NEURAL-PREDICTION"
            ]
        },
        omega_qos: {
            name: "📈 OMEGA: QoS & Telchemy TVQM",
            description: "Calidad de Servicio L7, DSCP Forzado e inspección visual pasiva TR-101290",
            headers: [
                "X-APE-QOS-ENABLED", "X-APE-QOS-DSCP", "X-APE-QOS-PRIORITY", "X-APE-POLYMORPHIC-ENABLED", 
                "X-APE-POLYMORPHIC-IDEMPOTENT", "X-TELCHEMY-TVQM", "X-TELCHEMY-TR101290", 
                "X-TELCHEMY-IMPAIRMENT-GUARD", "X-TELCHEMY-BUFFER-POLICY", "X-TELCHEMY-GOP-POLICY"
            ]
        },
        omega_predictive: {
            name: "🧠 OMEGA: Perceptual Q-Engine",
            description: "Carga predictiva, QoS Scorecard y Latency-Quality Matrix",
            headers: [
                "X-APE-CODEC", "X-APE-RESOLUTION", "X-APE-FPS", "X-APE-BITRATE", "X-APE-TARGET-BITRATE", 
                "X-APE-THROUGHPUT-T1", "X-APE-THROUGHPUT-T2", "X-ExoPlayer-Buffer-Min", "X-Manifest-Refresh",
                "X-KODI-LIVE-DELAY", "X-APE-STRATEGY", "X-APE-Prefetch-Segments", "X-APE-Quality-Threshold"
            ]
        },
        omega_atomic: {
            name: "⚛️ OMEGA: Atomic Execution",
            description: "Tone-Mapping L7 y Output Mode Determinista",
            headers: [
                "X-Tone-Mapping", "X-HDR-Output-Mode", "X-Codec-Support"
            ]
        }
    };

    const DEFAULT_PROFILES = {
        P0: {"""

if "X-APE-EVASION-TLS-FINGERPRINT-RANDO" in content:
    content = re.sub(broken_pattern_2, fixed_replacement, content)
    print("Fixed HEADER_CATEGORIES syntax error.")

categories_string = '["identity", "connection", "cache", "cors", "ape_core", "playback", "codecs", "cdn", "metadata", "extra", "ott_navigator", "streaming_control", "security", "hdr_color", "resolution_advanced", "audio_premium", "parallel_download", "anti_freeze", "abr_control", "omega_ai_cortex", "omega_lcevc", "omega_hardware", "omega_resilience", "omega_stealth", "omega_transport", "omega_qos", "omega_predictive", "omega_atomic"]'

for p_idx in range(1, 6):
    # Fix headersCount
    pattern_headers = r'(P' + str(p_idx) + r': \{[\s\S]*?headersCount:\s*)(\d+)(,)'
    content = re.sub(pattern_headers, r'\g<1>242\g<3>', content)
    
    # Fix enabledCategories
    pattern_cats = r'(P' + str(p_idx) + r': \{[\s\S]*?enabledCategories:\s*)\[([^\]]+)\](,)'
    content = re.sub(pattern_cats, r'\g<1>' + categories_string + r'\g<3>', content)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
print("Updated P1-P5 categories and headers count!")
