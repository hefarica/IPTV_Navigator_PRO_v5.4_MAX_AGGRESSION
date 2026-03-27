import os
import re
import json

skills_dir = r"C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\IPTV_v5.4_MAX_AGGRESSION\skills_extracted"
js_file = r"C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\IPTV_v5.4_MAX_AGGRESSION\frontend\js\ape-v9\m3u8-typed-arrays-ultimate.js"

# 1. Get all skill names
skills = [d for d in os.listdir(skills_dir) if os.path.isdir(os.path.join(skills_dir, d))]

# 2. Read JS file
with open(js_file, 'r', encoding='utf-8') as f:
    js_content = f.read().lower()

# 3. Analyze
integrated = []
orphaned = []

# Map skill folder names to likely keywords they inject
keyword_map = {
    "aceleracion_hw_y_proxy_tcp": ["hw-dec-accelerator", "proxy", "tcp"],
    "annex_b_avcc_bridge": ["annex b", "avcc", "bsf"],
    "anti_405_method_not_allowed_strict_get": ["405", "strict get", "method_not_allowed"],
    "anti_407_stealth_fingerprint": ["407", "stealth", "fingerprint"],
    "anti_deadlock_servidor_local": ["deadlock", "timeout"],
    "antigravity_f1_telemetry_radar": ["telemetry", "radar"],
    "antigravity_god_mode_zero_drop_v9": ["zero drop", "god mode"],
    "antigravity_immortality_network_stealth_v10": ["network stealth", "immortality"],
    "antigravity_quantum_biomimetic_medula_v16": ["biomimetic", "medula"],
    "antigravity_quantum_immortality_v10": ["quantum immortality"],
    "ape_v18_2_perfection_list_120_120": ["120_120", "v18.2"],
    "arquitectura_anatomica_m3u8_ultimate": ["anatomica", "ultimate"],
    "arquitectura_cuantica_2026": ["cuantica_2026"],
    "arquitectura_payload_ape_jwt": ["jwt", "ape_jwt", "generatejwt"],
    "arquitectura_puente_doble_protocolo": ["doble protocolo", "dual protocol"],
    "backup_master_v86_god_tier": ["backup master", "v86"],
    "binary_output_purity_v162": ["binary_output", "purity"],
    "cmaf_http200_direct_fix": ["http200", "direct_fix", "cmaf_http"],
    "cmaf_proxy_ramdisk_server": ["ramdisk", "dev/shm"],
    "cmaf_worker_ffmpeg_pipeline": ["worker_cmaf", "ffmpeg"],
    "content_aware_hevc_multichannel": ["content-aware", "nvenc-hevc"],
    "cortex_omega_4bug_megafix": ["cortex omega", "omega_state"],
    "cybernetic_abr_dual_vector": ["abr dual vector", "cybernetic", "cortex-abr"],
    "dash_timeline_epoch_sync": ["epoch sync", "timeline", "availabilitystarttime"],
    "fusion_infinita_bwdif": ["bwdif", "fusion infinita"],
    "generacion_listas_y_mapa": ["mapa", "channels_map", "global_caching"],
    "generacion_m3u8_bulletproof_1_to_1": ["strict 1:1", "bulletproof", "pevce_fallback_chain"],
    "god_tier_perceptual_quality": ["perceptual quality", "vmaf", "psnr", "tvqm"],
    "http-error-nuclear-evasion": ["nuclear evasion", "evasion_3xx", "evasion_5xx"],
    "http_guard_curl_pipe_protection": ["curl pipe", "http_guard"],
    "hydra_stream_evasion_engine": ["hydra stream", "evasion"],
    "inyeccion_inline_anti_cache": ["anti_cache", "inline", "cache_buster"],
    "iptv-ape-spinal-cord": ["spinal cord", "ape_spinal_cord"],
    "iptv-content-brain": ["content brain", "content_brain"],
    "iptv-revenue-engine": ["revenue engine", "revenue_engine"],
    "iptv-sentinel-os": ["sentinel os", "iptv_sentinel_os"],
    "iptv-support-cortex": ["iptv_support_cortex", "iptv_support_cortex_v"],
    "iptv_support_cortex_omega": ["iptv_support_cortex_v_omega", "cortex-omega"],
    "jerarquia_base_lcevc_dinamica": ["lcevc", "base codec"],
    "jerarquia_codec_hevc_suprema": ["codec-priority", "hevc"],
    "jerarquia_deinterlace_bwdif": ["bwdif", "deinterlace-mode"],
    "jerarquia_resolucion_infinita": ["preferred-resolution", "adaptive-maxwidth", "resolucion infinita"],
    "latencia_rayo_qos": ["latencia rayo", "qos"],
    "lcevc_100_percent_compliance_master": ["lcevc", "compliance"],
    "m3u8_120_120_perfection_invariant": ["120_120", "invariant"],
    "m3u8_async_structure_python_audited": ["async structure", "python audited"],
    "orquestacion_suprema_rfc8216_vlc_strict": ["rfc8216", "vlc_strict"],
    "orquestador_guardian_3_rutas": ["3 rutas", "guardian 3 rutas"],
    "pevce_harmonic_fallback_strict_1_to_1": ["harmonic fallback", "pevce_fallback", "pevce"],
    "pipeline_dual_subtitulos_ia": ["subtitulos", "subtitle-track-selection"],
    "premium_quality_selector": ["premium quality", "highest-quality-extreme", "prio_quality"],
    "protocolo_herencia_estricta": ["herencia estricta"],
    "protocolo_json_string_casting_exoplayer": ["json string", "exoplayer", "casting"],
    "protocolo_persistencia_absoluta": ["persistencia absoluta", "indexeddb"],
    "protocolo_slug_sid_mismatch_prevention": ["slug_sid_mismatch", "mismatch"],
    "protocolo_ssot_pm9_resolution": ["pm9", "ssot", "resolution"],
    "puente_matematico_frontend_backend": ["puente matematico", "ratio"],
    "qoe_driven_ll_dash": ["ll_dash", "qoe"],
    "quality_upgrade_packages": ["upgrade packages", "quality engine"],
    "quantum_pixel_overdrive": ["quantum pixel overdrive", "hqdn3d"],
    "resolucion_driven_anti_downgrade": ["anti-downgrade", "resolution"],
    "rotacion_user_agents_dinamica": ["rotacion user agents", "ua rotacion"],
    "sincronizador_hibrido_supremo": ["sincronizador hibrido", "hybrid"],
    "sincronizador_netflix_max": ["netflix max", "sincronizador netflix"],
    "vps_cors_proxy_bypass": ["cors", "proxy bypass"],
    "vps_upload_gateway": ["upload_gateway"],
}

for skill in skills:
    # Basic check: is the exact folder name mentioned anywhere?
    # Or are its keywords mentioned?
    skill_clean = skill.replace('_', ' ')
    
    found = False
    if skill in js_content or skill_clean in js_content:
        found = True
    elif skill in keyword_map:
        for kw in keyword_map[skill]:
            if kw.lower() in js_content:
                found = True
                break
                
    if found:
        integrated.append(skill)
    else:
        orphaned.append(skill)

print(json.dumps({
    "total_skills": len(skills),
    "integrated_count": len(integrated),
    "orphaned_count": len(orphaned),
    "orphaned_list": orphaned
}, indent=4))
