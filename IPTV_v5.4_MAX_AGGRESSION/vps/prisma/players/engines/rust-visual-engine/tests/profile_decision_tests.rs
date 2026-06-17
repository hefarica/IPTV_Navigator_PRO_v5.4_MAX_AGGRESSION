//! Tests deterministas del Visual Decision Engine (cargo test).
use visual_profile_engine::{decide, json_get, to_json, VisualInput};

fn base_4k() -> VisualInput {
    VisualInput {
        platform_family: "androidtv".into(),
        soc_family: "amlogic".into(),
        tv_max_h: 2160,
        hdr_support: "hdr10".into(),
        memc_available: true,
        sr_available: true,
        player_family: "ottnavigator".into(),
        codec_video: "hevc".into(),
        hardware_decode: true,
        buffer_state: "ok".into(),
        dropped_frames: 0,
        judder: false,
        fg_present: true,
        manifest_ok: true,
        has_4k: true,
        has_hevc: true,
        has_hdr: true,
        net_score: "high".into(),
        zapping: false,
        provider_unstable: false,
    }
}

#[test]
fn case1_4k_hevc_hw_buffer_ok_extreme() {
    let d = decide(&base_4k());
    assert_eq!(d.visual_profile, "CRYSTAL_UHD_EXTREME");
    assert_eq!(d.variant_policy, "best_visual");
    assert_eq!(d.preferred_resolution, "2160p");
}

#[test]
fn case2_4k_rebuffer_stable() {
    let mut i = base_4k();
    i.buffer_state = "rebuffer".into();
    let d = decide(&i);
    assert_eq!(d.visual_profile, "STABLE_1080P_PREMIUM");
}

#[test]
fn case3_hevc_software_downgrade_h264() {
    let mut i = base_4k();
    i.hardware_decode = false;
    let d = decide(&i);
    assert_eq!(d.visual_profile, "STABLE_1080P_PREMIUM");
    assert_eq!(d.preferred_codec, "h264");
}

#[test]
fn case4_judder_memc_avoid() {
    let mut i = base_4k();
    i.judder = true;
    let d = decide(&i);
    assert_eq!(d.memc_policy, "avoid_due_to_judder");
}

#[test]
fn case5_hdr_unknown_disable_fake() {
    let mut i = base_4k();
    i.has_hdr = false;
    i.hdr_support = "sdr".into();
    let d = decide(&i);
    assert_eq!(d.hdr_policy, "disable_fake_hdr");
}

#[test]
fn case6_no_fake_4k_when_source_lacks_it() {
    let mut i = base_4k();
    i.has_4k = false;
    let d = decide(&i);
    assert_ne!(d.preferred_resolution, "2160p"); // no inventa 4K
}

#[test]
fn case7_unknown_device_truthful() {
    let mut i = base_4k();
    i.codec_video = "unknown".into();
    let d = decide(&i);
    assert_eq!(d.visual_profile, "TRUTHFUL_SOURCE_SAFE");
    assert_eq!(d.preferred_codec, "source");
}

#[test]
fn case8_dropped_high_stable_memc_off() {
    let mut i = base_4k();
    i.dropped_frames = 120;
    let d = decide(&i);
    assert_eq!(d.visual_profile, "STABLE_1080P_PREMIUM");
    assert_eq!(d.memc_policy, "disable");
}

#[test]
fn case9_net_low_low_latency() {
    let mut i = base_4k();
    i.net_score = "low".into();
    let d = decide(&i);
    assert_eq!(d.visual_profile, "LOW_LATENCY_SAFE");
}

#[test]
fn json_output_is_valid_and_truthful() {
    let mut i = base_4k();
    i.has_hdr = false;
    i.hdr_support = "sdr".into();
    let js = to_json(&decide(&i));
    assert!(js.starts_with('{') && js.ends_with('}'));
    assert!(js.contains("\"hdr_policy\":\"disable_fake_hdr\""));
    assert!(js.contains("\"visual_profile\""));
}

#[test]
fn json_get_extracts_string_and_bool() {
    let src = r#"{"a":{"codec_video":"hevc"},"hardware_decode":true,"dropped_frames":42}"#;
    assert_eq!(json_get(src, "codec_video").as_deref(), Some("hevc"));
    assert_eq!(json_get(src, "hardware_decode").as_deref(), Some("true"));
    assert_eq!(json_get(src, "dropped_frames").as_deref(), Some("42"));
}
