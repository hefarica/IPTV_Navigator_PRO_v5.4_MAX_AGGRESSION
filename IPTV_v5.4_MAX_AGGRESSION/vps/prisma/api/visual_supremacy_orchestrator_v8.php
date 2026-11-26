<?php
/**
 * visual_supremacy_orchestrator_v8.php — APE CRYSTAL 8K EXTREME v8.0.1
 * Orquestador de supremacía visual: integra misiones 8K, LCEVC, CMAF,
 * SDR→HDR, anti-arena y OLED para todos los perfiles.
 *
 * DOCTRINA FREEZELESS:
 *   - Sin Range/If-Range headers (causan EOF en players)
 *   - Sin SUPPLEMENTAL-CODECS falso
 *   - Sin EXT-X-MAP falso
 *   - Niveles HEVC correctos: 8K=L183, 4K@120=L156, 4K@60=L153
 */

header('Content-Type: application/json');
header('Cache-Control: no-store');

$profile = $_GET['profile'] ?? 'P3';
$bw_bps  = (int)($_GET['bw'] ?? 0);
$sports  = (bool)($_GET['sports'] ?? false);

// Leer spool de misiones del orquestador Lua
$missions_file = '/dev/shm/ape_cartridge_missions.json';
$missions = [];
if (file_exists($missions_file)) {
    $raw = @file_get_contents($missions_file);
    if ($raw) {
        $all = json_decode($raw, true);
        $missions = $all[$profile] ?? $all['P3'] ?? [];
    }
}

// Leer spool de valores live
$values_file = '/dev/shm/ape_header_values.json';
$live_values = [];
if (file_exists($values_file)) {
    $raw = @file_get_contents($values_file);
    if ($raw) {
        $data = json_decode($raw, true);
        $live_values = $data['profiles'][$profile] ?? [];
    }
}

// Tabla de perfiles 8K (Cardinal-correct)
$profiles_8k = [
    'P0' => ['codec'=>'hvc1.2.4.L183.B0', 'res'=>'7680x4320', 'fps'=>60,  'ai_sr'=>4, 'lcevc'=>3, 'max_cll'=>4000],
    'P1' => ['codec'=>'hvc1.2.4.L156.B0', 'res'=>'3840x2160', 'fps'=>120, 'ai_sr'=>4, 'lcevc'=>3, 'max_cll'=>4000],
    'P2' => ['codec'=>'hvc1.2.4.L153.B0', 'res'=>'3840x2160', 'fps'=>60,  'ai_sr'=>2, 'lcevc'=>2, 'max_cll'=>1500],
    'P3' => ['codec'=>'hvc1.2.4.L153.B0', 'res'=>'3840x2160', 'fps'=>60,  'ai_sr'=>2, 'lcevc'=>2, 'max_cll'=>1500],
    'P4' => ['codec'=>'hvc1.2.4.L123.B0', 'res'=>'1920x1080', 'fps'=>60,  'ai_sr'=>1, 'lcevc'=>1, 'max_cll'=>1000],
    'P5' => ['codec'=>'hvc1.2.4.L120.B0', 'res'=>'1920x1080', 'fps'=>30,  'ai_sr'=>1, 'lcevc'=>1, 'max_cll'=>600],
];

$p8k = $profiles_8k[$profile] ?? $profiles_8k['P3'];

// Respuesta completa
echo json_encode([
    'version'    => 'v8.0.1_FREEZELESS',
    'profile'    => $profile,
    'timestamp'  => time(),
    'bw_state'   => $live_values['X-APE-Bw-State'] ?? 'UNKNOWN',
    'bw_bps'     => $bw_bps,
    'codec_8k'   => $p8k,
    'missions'   => $missions,
    'live_values'=> $live_values,
    'anti_sand'  => [
        'enabled'   => true,
        'method'    => 'hqdn3d_dynamic_k_scaled',
        'unsharp'   => 'ELIMINATED',
        'sharpening'=> 'realesrgan_only',
    ],
    'sdr_to_hdr' => [
        'enabled'   => true,
        'method'    => 'inverse_tone_mapping_pq',
        'all_profiles' => true,
    ],
    'lcevc'      => ['enabled'=>true, 'strength'=>$p8k['lcevc'], 'standard'=>'ISO-23094-2'],
    'cmaf'       => ['enabled'=>true, 'note'=>'signal_only'],
    'llhls'      => ['enabled'=>true, 'part_target_ms'=>200],
    'oled'       => ['local_dimming'=>true, 'pq_tone_curve'=>true],
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
