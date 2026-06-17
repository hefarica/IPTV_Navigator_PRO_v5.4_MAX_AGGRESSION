<?php
// ══════════════════════════════════════════════════════════════════════════
// APE — MATCH endpoint (iData JWT loop · NAT-friendly outbound · NO WG)
//
// El DAEMON on-device, en cada zap, arma un iData con DOS insumos:
//   • esperado : config del canal EN LA LISTA  (codec/tier/profile/res/fps que el generador puso)
//   • real     : REALIDAD del canal en tiempo real (codec/res/fps/hdr leídos del decoder por logcat)
// y lo manda OUTBOUND (GET ?idata=<b64url(json)> o POST json) con Authorization: Bearer <token>.
// Este endpoint hace el MATCH "esperado vs real" (ladder F0–F5) y RESPONDE la CARGA China Box
// que el daemon aplicará al player. NO proxea vídeo (la URL del proveedor va verbatim aparte).
//
// Por qué funciona tras NAT: es la RESPUESTA a la conexión saliente del daemon → el VPS SÍ puede.
//
// SEGURIDAD (reusa el patrón adversarial de ape-pull.php):
//   • token por HEADER Bearer (no query → no se loguea); constant-time (hash_equals) vs sha256 guardado.
//   • 403 unificado (sin oráculo unknown-device vs bad-token). 400 si falta device/token.
//   • guard de tamaño de entrada (anti memory-spike) + set_time_limit (anti FPM-exhaustion).
//   • DEBE ir tras `limit_req` nginx → snippets/prisma-ape-match-location.conf.
//
// TRUTH-GUARDS (doctrina MAX IMAGE FIRST, no player-breaking lies):
//   • VIDEO-RANGE=PQ/HLG SOLO si el `real` (logcat) lo probó. Nunca por hint.
//   • fake-4K guard: si real.res < esperado.res → manda la REAL (no mentir resolución).
//   • GOLDEN RULE: codec `hvc1.*` en el manifest/STREAM-INF · `hev1.*` en KODIPROP/EXTVLCOPT.
//   • Level↔Resolution per cascada (resolveCascadeTier): nunca L153 (4K@60) sobre 8K@120.
// ══════════════════════════════════════════════════════════════════════════
declare(strict_types=1);
@set_time_limit(8);                              // SLO <3000ms; cap duro anti-FPM
header('Cache-Control: no-store');
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$BASE             = '/var/www/html/prisma';
$TOKDIR           = $BASE . '/db/ape_agent_tokens';         // <device> => sha256(token) hex
$QUALITY_MANIFEST = '/var/www/html/prisma/quality-manifest.json';
$REALCFG_DIR      = '/dev/shm/ape_realcfg';                 // caché por-canal de la verdad aprendida (opcional)
$MAXIN            = 16384;                                  // guard de entrada (anti memory-spike)

function ape_clean_id($v) { return preg_replace('/[^A-Za-z0-9_.\-]/', '', (string)$v); }
function ape_forbidden()  { http_response_code(403); echo '{"error":"forbidden"}'; exit; }
function ape_b64url_decode($s) {
    $s = strtr((string)$s, '-_', '+/');
    $pad = strlen($s) % 4;
    if ($pad) { $s .= str_repeat('=', 4 - $pad); }
    return base64_decode($s, true);
}

// ── AUTH: Bearer token (idéntico a ape-pull.php) ──────────────────────────────
$auth = $_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['HTTP_X_APE_TOKEN'] ?? '');
$tok  = '';
if (preg_match('/Bearer\s+([A-Za-z0-9]+)/', $auth, $m))        { $tok = $m[1]; }
elseif ($auth !== '' && preg_match('/^[A-Za-z0-9]+$/', $auth)) { $tok = $auth; }

$dev = ape_clean_id($_GET['device'] ?? '');
if ($dev === '' || $tok === '') { http_response_code(400); echo '{"error":"missing device/token"}'; exit; }

$tokfile = "$TOKDIR/$dev";
if (!is_file($tokfile)) { ape_forbidden(); }
$stored = trim((string)@file_get_contents($tokfile));
if ($stored === '' || !hash_equals($stored, hash('sha256', $tok))) { ape_forbidden(); }

// ── INPUT iData: GET ?idata=<b64url(json)> o POST body json ───────────────────
$raw = '';
if (isset($_GET['idata'])) {
    $d = ape_b64url_decode((string)$_GET['idata']);
    if ($d !== false) { $raw = $d; }
}
if ($raw === '') {
    $body = (string)@file_get_contents('php://input', false, null, 0, $MAXIN + 1);
    if ($body !== '') { $raw = $body; }
}
if (strlen($raw) > $MAXIN) { http_response_code(413); echo '{"error":"idata_too_large"}'; exit; }
$in = json_decode($raw, true);
if (!is_array($in)) { http_response_code(400); echo '{"error":"bad_idata"}'; exit; }

$esperado = is_array($in['esperado'] ?? null) ? $in['esperado'] : [];
$real     = is_array($in['real'] ?? null)     ? $in['real']     : [];
$ch       = ape_clean_id($in['ch'] ?? ($esperado['ch'] ?? ''));

// ── Cascada (lean, self-contained — NO toca resolve_quality_unified.php) ──────
function ape_load_cascade(string $path): array {
    if (!is_file($path)) { return []; }
    $raw = @file_get_contents($path);
    if ($raw === false) { return []; }
    $d = json_decode($raw, true);
    return (is_array($d) && !empty($d['codec_cascade'])) ? $d['codec_cascade'] : [];
}
/**
 * LEY CARDINAL Level↔Resolution (CLAUDE.md / ape-vps-hevc-crystal-integrator):
 * el level del codec SIEMPRE debe alcanzar lo que la resolución+fps exigen — declarar un level
 * por DEBAJO (p.ej. L120/FHD sobre 4K) es la causa del freeze del 2026-06-08.
 * Mapa DETERMINISTA res+fps → level (no depende de data de manifest que pueda venir invertida).
 * GOLDEN RULE: devuelve hvc1.* (manifest/STREAM-INF) + hev1.* (KODIPROP/EXTVLCOPT runtime).
 *   L90=SD · L93=720p · L120=1080p@30 · L123=1080p@60 · L150=4K@30 · L153=4K@60 · L156=4K@120
 *   L180=8K@30 · L183=8K@60 · L186=8K@120
 * ($profile y $cascade se conservan por compat de firma; el level se deriva de la resolución real.)
 */
function ape_resolve_tier(string $profile, string $resolution, float $fps, array $cascade): array {
    $w = 0; $h = 0;
    if (preg_match('/^(\d+)x(\d+)$/', $resolution, $mm)) { $w = (int)$mm[1]; $h = (int)$mm[2]; }
    $hi = ($fps >= 100.0); $p60 = ($fps >= 50.0);
    if     ($h >= 4320 || $w >= 7680) { $lvl = $hi ? 'L186' : ($p60 ? 'L183' : 'L180'); $tier = $hi ? 13 : 12; } // 8K
    elseif ($h >= 2160 || $w >= 3840) { $lvl = $hi ? 'L156' : ($p60 ? 'L153' : 'L150'); $tier = $hi ? 10 : 9;  } // 4K
    elseif ($h >= 1440 || $w >= 2560) { $lvl = $p60 ? 'L153' : 'L150';                  $tier = 8;             } // QHD
    elseif ($h >= 1080 || $w >= 1920) { $lvl = $p60 ? 'L123' : 'L120';                  $tier = 6;             } // FHD
    elseif ($h >= 720)                { $lvl = 'L93';                                   $tier = 4;             } // HD
    else                              { $lvl = 'L90';                                   $tier = 3;             } // SD/low
    return ['codec' => "hvc1.2.4.$lvl.B0", 'codec_hev1' => "hev1.2.4.$lvl.B0", 'tier' => $tier];
}

/**
 * ENRIQUECIMIENTO China Box / HUAWEI-Hisilicon (distilado accionable de visual_profiles.json SSOT,
 * perfil "stable_1080p_premium_light_china_box_cleanup" y familia 4K/SD).
 * DOCTRINA (no player-breaking lies): NO miente la FUENTE — resolución/HDR PÚBLICOS siguen honestos.
 * Enriquece el PROCESAMIENTO de DISPLAY: AI-SR upscale al panel, MEMC, floor-lock, color, antiartefactos.
 * → un 1080p llega "1080p, pero ENRIQUECIDO HUAWEI" (el engine del device sube+mejora; el HLS no miente).
 * virtual_4k = HINT de upscale del device (nunca RESOLUTION=3840x2160 público sin fuente/transcode real).
 */
function ape_china_box_enrichment(int $tier, string $res): array {
    if     ($tier >= 12) { $intensity = 0.15; $name = 'P_8K_NATIVE_LIGHT_CLEANUP'; }
    elseif ($tier >= 9)  { $intensity = 0.25; $name = 'P_4K_PREMIUM_CHINA_BOX'; }
    elseif ($tier >= 6)  { $intensity = 0.30; $name = 'P_1080P_PREMIUM_LIGHT_CHINA_BOX'; } // ← el que pediste
    elseif ($tier >= 4)  { $intensity = 0.55; $name = 'P_720P_CHINA_BOX_UPSCALE'; }
    else                 { $intensity = 0.75; $name = 'P_SD_RESCUE_CHINA_BOX'; }
    return [
        'profile'   => $name,
        'intensity' => $intensity,
        'style'     => 'China Box / Huawei-Hisilicon 4K-8K visual appearance pipeline',
        'virtual_4k' => [
            'public_resolution'      => $res,            // HONESTO: no se anuncia 4K/8K sin fuente real
            'device_upscale_hint'    => true,
            'presentation_target'    => '1080p_clean_or_device_upscale_to_panel_4k',
            'prefer_device_upscaler' => ['huawei_hisilicon_ai_sr', 'amlogic_vendor_scaler', 'realtek_mstar_tv_scaler', 'android_tv_overlay_scaler'],
            'edge_policy'            => 'edge_aware_medium_no_halo_no_ringing',
            'texture_policy'         => 'preserve_texture_reduce_compression_noise_only',
            'sports_motion'          => 'ball_player_logo_text_locked_no_geometry_warp',
        ],
        'floor_lock' => [
            'black' => 'clean_black_floor_with_shadow_detail',
            'white' => 'premium_white_no_clipping',
            'gamma' => '2.2_to_2.3_scene_safe',
            'chroma'=> 'oled_vivid_guarded',
            'anti_washout' => true, 'anti_crush' => true,
            'guards' => ['histogram_luma', 'clipping', 'skin_tone', 'logo_text'],
        ],
        'artifact_suppression' => [
            'deblock' => 'light_adaptive', 'deband' => 'low_gradients', 'mosquito' => 'light_edges',
            'ringing' => 'block', 'halo' => 'block', 'plastic_texture' => 'block', 'geometry' => 'locked',
        ],
        'color'        => 'vivid_oled_sports_reference_guarded',
        'sharpness'    => 'edge_aware_medium_safe',
        'denoise'      => 'light_deblock_mosquito_guard',
        'codec_policy' => 'hevc_first_else_h264_stable',
        // pistas por SoC — el daemon aplica el subset del SoC que detecte en el device
        'vendor_hints' => [
            'huawei_hisilicon' => ['ai_super_resolution' => 'low_intensity_if_supported', 'color_engine' => 'vivid_oled_sports_guarded', 'motion_estimation' => 'only_if_no_judder_no_soap'],
            'mediatek'         => ['sr' => 'persist.vendor.tv.sr.enable=1', 'memc' => 'persist.vendor.mtk.memc.enable=1_off_if_judder', 'aipq' => 'aipq_enable=1'],
            'amlogic'          => ['aisr' => 'aisr_enable=1', 'memc' => 'memc_enable=1', 'hdr_policy' => 'source_if_root_validated'],
            'realtek_mstar'    => ['tv_scaler' => 'first', 'noise_reduction' => 'low_for_sports', 'dynamic_contrast' => 'guarded_no_clip'],
        ],
        // tags privados APE (RFC 8216 §6.3.1: inertes para el player; intent/routing/telemetría APE)
        'private_tags' => [
            '#EXT-X-APE-FLOOR-LOCK:BLACK=CLEAN,WHITE=SAFE',
            "#EXT-X-APE-CHINA-BOX:STYLE=HUAWEI_HISILICON,INTENSITY=$intensity,PROFILE=$name",
            "#EXT-X-APE-VIRTUAL-4K:MODE=DEVICE_UPSCALE_HINT,PUBLIC_RES=$res",
        ],
    ];
}

// ── MATCH: "lo real" (probado) gana sobre "lo esperado" (hint de lista) ───────
$esp_res = (string)($esperado['res'] ?? $esperado['resolution'] ?? '1920x1080');
$esp_fps = (float)($esperado['fps'] ?? 30.0);
$profile = strtoupper((string)($esperado['p'] ?? $esperado['profile'] ?? 'AUTO'));

$has_real = !empty($real);
$real_res = (string)($real['res'] ?? $real['resolution'] ?? '');
$real_fps = (float)($real['fps'] ?? 0.0);
$real_hdr = strtoupper((string)($real['hdr'] ?? $real['video_range'] ?? ''));

// resolución/fps efectivos: real si lo probó; si no, esperado.
$eff_res = ($real_res !== '' && preg_match('/^\d+x\d+$/', $real_res)) ? $real_res : $esp_res;
$eff_fps = ($real_fps > 0) ? $real_fps : $esp_fps;

// fake-4K guard: si la real es MENOR que la esperada declarada → manda la REAL (no mentir).
$dim = function (string $r): int { return preg_match('/^(\d+)x(\d+)$/', $r, $m) ? ((int)$m[1] * (int)$m[2]) : 0; };
if ($real_res !== '' && $dim($real_res) > 0 && $dim($real_res) < $dim($esp_res)) {
    $eff_res = $real_res;   // la verdad gana — antifake
}

// VIDEO-RANGE: SOLO si el real (logcat) probó PQ/HLG. Nunca por hint. (truth-guard)
$video_range = in_array($real_hdr, ['PQ', 'HLG'], true) ? $real_hdr : '';

$cascade = ape_load_cascade($QUALITY_MANIFEST);
$tier    = ape_resolve_tier($profile, $eff_res, $eff_fps, $cascade);

// ── CARGA: lo que el daemon aplica al player (settings + KODIPROP/EXTVLCOPT) ──
$kodiprop = [
    'inputstream.adaptive.preferred_codec=hevc',
    'inputstream.adaptive.video_codec_override=hevc',          // familia, hev1 in-band runtime
];
$extvlcopt = [
    'codec=hevc,dvhe,av1,h264',
];
$adb_settings = [
    'global match_content_frame_rate 1',
];

$carga = [
    'ok'          => true,
    'ch'          => $ch,
    'source'      => $has_real ? 'real_match' : 'esperado_only',  // honesto: de dónde salió
    'profile'     => $profile,
    'tier'        => $tier['tier'],
    'codec'       => $tier['codec'],        // hvc1.*  → STREAM-INF / manifest (GOLDEN RULE)
    'codec_hev1'  => $tier['codec_hev1'],   // hev1.*  → KODIPROP/EXTVLCOPT (GOLDEN RULE)
    'resolution'  => $eff_res,
    'fps'         => $eff_fps,
    'video_range' => $video_range,          // '' = SIN HDR (no fake). 'PQ'/'HLG' solo si real probado.
    'kodiprop'    => $kodiprop,
    'extvlcopt'   => $extvlcopt,
    'adb_settings'=> $adb_settings,
];

// caché por-canal (opcional, best-effort): aprende la verdad real para reusarla.
if ($has_real && $ch !== '' && is_dir($REALCFG_DIR) && is_writable($REALCFG_DIR)) {
    @file_put_contents("$REALCFG_DIR/$ch.json",
        json_encode(['res' => $real_res, 'fps' => $real_fps, 'hdr' => $real_hdr, 'ts' => time()]),
        LOCK_EX);
}

echo json_encode($carga, JSON_UNESCAPED_SLASHES);
