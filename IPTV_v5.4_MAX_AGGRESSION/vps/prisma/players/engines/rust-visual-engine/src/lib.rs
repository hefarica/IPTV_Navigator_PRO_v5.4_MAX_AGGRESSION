//! APE Rust Visual Decision Engine (std-only, deterministic).
//!
//! REGLA MADRE: el VPS NO reprocesa píxeles. Este motor SOLO decide un perfil
//! visual + políticas a partir de telemetría/capabilities/manifest/red, y emite
//! metadata. La mejora real la ejecuta el device/player/TV. Sin fake 4K/HDR/codec.

/// Entrada cruzada de los 4 planos (device + player + stream + network).
#[derive(Debug, Clone, Default)]
pub struct VisualInput {
    // device / tv
    pub platform_family: String, // androidtv|firetv|roku|appletv|web|unknown
    pub soc_family: String,      // amlogic|mediatek|realtek|rockchip|qualcomm|generic|unknown
    pub tv_max_h: u32,           // alto máximo del display (px), 0 = unknown
    pub hdr_support: String,     // hdr10|hlg|dolby_vision|sdr|unknown
    pub memc_available: bool,
    pub sr_available: bool,
    // player playback
    pub player_family: String,
    pub codec_video: String,     // hevc|h264|av1|vp9|unknown
    pub hardware_decode: bool,
    pub buffer_state: String,    // ok|low|rebuffer|unknown
    pub dropped_frames: u32,
    pub judder: bool,
    pub fg_present: bool,
    // stream / manifest
    pub manifest_ok: bool,
    pub has_4k: bool,
    pub has_hevc: bool,
    pub has_hdr: bool,
    // network
    pub net_score: String,       // high|medium|low|unknown
    pub zapping: bool,
    pub provider_unstable: bool,
}

/// Decisión visual (carga que se traduce a metadata).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VisualDecision {
    pub visual_profile: String,
    pub variant_policy: String,
    pub preferred_codec: String,
    pub preferred_resolution: String,
    pub fps_policy: String,
    pub hdr_policy: String,
    pub memc_policy: String,
    pub super_resolution_policy: String,
    pub sharpness_policy: String,
    pub color_policy: String,
    pub artifact_policy: String,
    pub reason: String,
    pub confidence_x100: u32, // confianza * 100 (entero, determinista)
}

impl VisualDecision {
    fn truthful() -> Self {
        VisualDecision {
            visual_profile: "TRUTHFUL_SOURCE_SAFE".into(),
            variant_policy: "safe_visual".into(),
            preferred_codec: "source".into(),
            preferred_resolution: "source".into(),
            fps_policy: "source".into(),
            hdr_policy: "disable_fake_hdr".into(),
            memc_policy: "not_supported".into(),
            super_resolution_policy: "not_supported".into(),
            sharpness_policy: "adaptive_safe".into(),
            color_policy: "source_safe".into(),
            artifact_policy: "balanced".into(),
            reason: String::new(),
            confidence_x100: 50,
        }
    }
}

pub const DROPPED_THRESHOLD: u32 = 30;
pub const ENGINE_VERSION: &str = "2026.06-crystal-metadata-1";

/// Núcleo determinista de decisión (mismas reglas que el decider shell).
pub fn decide(i: &VisualInput) -> VisualDecision {
    let mut d = VisualDecision::truthful();

    // HDR base: solo si fuente + device/tv lo prueban
    let dev_hdr = matches!(i.hdr_support.as_str(), "hdr10" | "hlg" | "dolby_vision");
    d.hdr_policy = if i.has_hdr && dev_hdr {
        "hdr_if_proven".into()
    } else {
        "disable_fake_hdr".into()
    };
    // MEMC base por capacidad del SoC/TV
    if i.memc_available {
        d.memc_policy = "enable".into();
    }
    if i.sr_available {
        d.super_resolution_policy = "enable".into();
    }

    // R7/R10: capabilities/manifest/codec/foreground desconocidos → TRUTHFUL (no fake)
    if i.codec_video == "unknown" || !i.fg_present || !i.manifest_ok {
        d.reason = "codec/foreground/manifest desconocido → source-safe (no fake)".into();
        d.memc_policy = "disable".into();
        return d;
    }

    // R6: red baja / zapping / provider inestable → LOW_LATENCY anti-rebuffer
    if i.net_score == "low" || i.zapping || i.provider_unstable {
        d.visual_profile = "LOW_LATENCY_SAFE".into();
        d.variant_policy = "anti_rebuffer".into();
        d.preferred_codec = "source".into();
        d.memc_policy = "disable".into();
        d.artifact_policy = "balanced".into();
        d.reason = "zapping/provider inestable/red baja → baja latencia anti-rebuffer".into();
        d.confidence_x100 = 70;
        return d;
    }

    // R1: judder → MEMC avoid, sin fps fake
    if i.judder {
        d.memc_policy = "avoid_due_to_judder".into();
        d.fps_policy = "source".into();
    }

    // R3+dropped: dropped altos → STABLE + MEMC off
    if i.dropped_frames > DROPPED_THRESHOLD {
        d.visual_profile = "STABLE_1080P_PREMIUM".into();
        d.variant_policy = "anti_rebuffer".into();
        d.preferred_codec = if i.has_hevc { "hevc".into() } else { "h264".into() };
        d.preferred_resolution = "1080p".into();
        d.memc_policy = "disable".into();
        d.artifact_policy = "avoid_blur".into();
        d.reason = "dropped_frames > umbral → 1080p estable + MEMC off".into();
        d.confidence_x100 = 75;
        return d;
    }

    // R2+R3: HEVC software-decode / rebuffer / buffer bajo → STABLE
    if (i.codec_video == "hevc" && !i.hardware_decode)
        || i.buffer_state == "rebuffer"
        || i.buffer_state == "low"
    {
        d.visual_profile = "STABLE_1080P_PREMIUM".into();
        d.variant_policy = "anti_rebuffer".into();
        d.preferred_codec = "h264".into();
        d.preferred_resolution = "1080p".into();
        d.artifact_policy = "avoid_blur".into();
        d.reason = "HEVC sw-decode / rebuffer / buffer bajo → H264 1080p estable".into();
        d.confidence_x100 = 75;
        return d;
    }

    // R9: CRYSTAL_UHD_EXTREME — todo probado al máximo
    let buf_ok = i.buffer_state == "ok";
    if i.has_4k
        && i.hardware_decode
        && buf_ok
        && i.dropped_frames == 0
        && !i.judder
        && i.net_score == "high"
        && i.tv_max_h >= 2160
    {
        d.visual_profile = "CRYSTAL_UHD_EXTREME".into();
        d.variant_policy = "best_visual".into();
        d.preferred_codec = if i.has_hevc { "hevc".into() } else { i.codec_video.clone() };
        d.preferred_resolution = "2160p".into();
        d.fps_policy = "match_display".into();
        if i.memc_available && !i.judder {
            d.memc_policy = "enable".into();
        }
        d.color_policy = "oled_vivid_safe".into();
        d.sharpness_policy = "adaptive_safe".into();
        d.artifact_policy = "avoid_ringing".into();
        d.reason = "4K real + HW decode + buffer OK + 0 dropped + sin judder + red alta + TV>=2160".into();
        d.confidence_x100 = 90;
        return d;
    }

    // R8: CRYSTAL_UHD_SAFE — HEVC/AV1 HW estable
    if (i.codec_video == "hevc" || i.codec_video == "av1")
        && i.hardware_decode
        && (buf_ok || i.buffer_state == "unknown")
    {
        d.visual_profile = "CRYSTAL_UHD_SAFE".into();
        d.variant_policy = "best_visual".into();
        d.preferred_codec = i.codec_video.clone();
        d.preferred_resolution = if i.has_4k && i.tv_max_h >= 2160 {
            "2160p".into()
        } else {
            "source".into()
        };
        d.color_policy = "oled_vivid_safe".into();
        d.reason = "HEVC/AV1 HW decode estable → CRYSTAL UHD SAFE".into();
        d.confidence_x100 = 80;
        return d;
    }

    // PERCEPTUAL_4K_BALANCED — upscaler/SR del TV + estable
    if (i.sr_available || i.tv_max_h >= 2160)
        && i.buffer_state != "rebuffer"
        && i.net_score != "low"
    {
        d.visual_profile = "PERCEPTUAL_4K_BALANCED".into();
        d.variant_policy = "best_visual".into();
        d.preferred_codec = i.codec_video.clone();
        d.preferred_resolution = "source".into();
        if i.sr_available {
            d.super_resolution_policy = "enable".into();
        }
        d.color_policy = "oled_vivid_safe".into();
        d.reason = "fuente HD/FHD + upscaler/SR del TV estable → perceptual 4K balanced".into();
        d.confidence_x100 = 70;
        return d;
    }

    d.reason = "condiciones no concluyentes → source-safe".into();
    d
}

/// Serializa la decisión a JSON (sin deps; escape mínimo de comillas).
pub fn to_json(d: &VisualDecision) -> String {
    fn esc(s: &str) -> String {
        s.replace('\\', "\\\\").replace('"', "\\\"")
    }
    format!(
        concat!(
            "{{\"engine_version\":\"{}\",",
            "\"visual_profile\":\"{}\",\"variant_policy\":\"{}\",",
            "\"preferred_codec\":\"{}\",\"preferred_resolution\":\"{}\",",
            "\"fps_policy\":\"{}\",\"hdr_policy\":\"{}\",\"memc_policy\":\"{}\",",
            "\"super_resolution_policy\":\"{}\",\"sharpness_policy\":\"{}\",",
            "\"color_policy\":\"{}\",\"artifact_policy\":\"{}\",",
            "\"reason\":\"{}\",\"confidence\":{}}}"
        ),
        ENGINE_VERSION,
        esc(&d.visual_profile), esc(&d.variant_policy),
        esc(&d.preferred_codec), esc(&d.preferred_resolution),
        esc(&d.fps_policy), esc(&d.hdr_policy), esc(&d.memc_policy),
        esc(&d.super_resolution_policy), esc(&d.sharpness_policy),
        esc(&d.color_policy), esc(&d.artifact_policy),
        esc(&d.reason),
        (d.confidence_x100 as f64) / 100.0
    )
}

/// Extractor JSON mínimo (flat) para main.rs — busca "key":"value" o "key":num/bool.
/// No es un parser completo; suficiente para la entrada controlada del orquestador.
pub fn json_get(src: &str, key: &str) -> Option<String> {
    let pat = format!("\"{}\"", key);
    let start = src.find(&pat)? + pat.len();
    let rest = &src[start..];
    let colon = rest.find(':')? + 1;
    let mut v = rest[colon..].trim_start();
    if let Some(stripped) = v.strip_prefix('"') {
        let end = stripped.find('"')?;
        Some(stripped[..end].to_string())
    } else {
        // num/bool/null hasta , } ] o whitespace
        let end = v
            .find(|c: char| c == ',' || c == '}' || c == ']' || c.is_whitespace())
            .unwrap_or(v.len());
        v = &v[..end];
        if v.is_empty() { None } else { Some(v.to_string()) }
    }
}
