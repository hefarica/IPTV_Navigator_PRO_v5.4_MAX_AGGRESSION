//! CLI: lee JSON de los 4 planos en stdin → emite la decisión visual JSON en stdout.
//! NO toca video. Determinista. Uso:  echo '{...}' | visual-profile-engine

use std::io::Read;
use visual_profile_engine::{decide, json_get, to_json, VisualInput};

fn b(src: &str, k: &str) -> bool {
    matches!(json_get(src, k).as_deref(), Some("true") | Some("1"))
}
fn u(src: &str, k: &str) -> u32 {
    json_get(src, k).and_then(|v| v.parse::<u32>().ok()).unwrap_or(0)
}
fn s(src: &str, k: &str, def: &str) -> String {
    json_get(src, k).unwrap_or_else(|| def.to_string())
}
/// "3840x2160" | "2160p" | "2160" → alto en px
fn height(src: &str, k: &str) -> u32 {
    let v = json_get(src, k).unwrap_or_default();
    if let Some(idx) = v.find('x') {
        v[idx + 1..].trim_end_matches('p').parse().unwrap_or(0)
    } else {
        v.trim_end_matches('p').parse().unwrap_or(0)
    }
}

fn main() {
    let mut input = String::new();
    let _ = std::io::stdin().read_to_string(&mut input);

    let vi = VisualInput {
        platform_family: s(&input, "platform_family", "unknown"),
        soc_family: s(&input, "soc_family", "unknown"),
        tv_max_h: { let h = height(&input, "tv_resolution_max"); if h > 0 { h } else { height(&input, "tv_max_h") } },
        hdr_support: s(&input, "hdr_support", "unknown"),
        memc_available: b(&input, "memc_available"),
        sr_available: b(&input, "super_resolution_available"),
        player_family: s(&input, "family", "unknown"),
        codec_video: s(&input, "codec_video", "unknown"),
        hardware_decode: b(&input, "hardware_decode"),
        buffer_state: s(&input, "buffer_state", "unknown"),
        dropped_frames: u(&input, "dropped_frames"),
        judder: b(&input, "judder"),
        fg_present: !matches!(json_get(&input, "fg_present").as_deref(), Some("false") | Some("0"))
            && json_get(&input, "family").map(|f| f != "unknown").unwrap_or(false),
        manifest_ok: !matches!(json_get(&input, "manifest_ok").as_deref(), Some("false") | Some("0"))
            && !matches!(json_get(&input, "manifest_status").as_deref(), Some("FAILED")),
        has_4k: b(&input, "has_4k"),
        has_hevc: b(&input, "has_hevc"),
        has_hdr: b(&input, "has_hdr"),
        net_score: s(&input, "score", "unknown"),
        zapping: b(&input, "zapping"),
        provider_unstable: matches!(json_get(&input, "provider").as_deref(), Some("unstable")),
    };

    println!("{}", to_json(&decide(&vi)));
}
