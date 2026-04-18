<?php

/**
 * 🧠🛡️ CMAF DOMINANCE ENGINE v1
 * Integrado con Sentinel v2 — Zero-Transcode, Client-Side Aware
 */

if (!enum_exists('CmafPlayerType')) {
    enum CmafPlayerType: string
    {
        case KODI = 'KODI';
        case VLC = 'VLC';
        case EXO = 'EXO';
        case APPLE = 'APPLE';
        case GENERIC = 'GENERIC';

        public static function detect(string $ua): self
        {
            $uaLower = strtolower($ua);
            if (str_contains($uaLower, 'kodi')) return self::KODI;
            if (str_contains($uaLower, 'vlc')) return self::VLC;
            if (str_contains($uaLower, 'exoplayer') || str_contains($uaLower, 'ott navigator') || str_contains($uaLower, 'tivimate')) return self::EXO;
            if (str_contains($uaLower, 'apple') || str_contains($uaLower, 'ios') || str_contains($uaLower, 'mac')) return self::APPLE;
            return self::GENERIC;
        }
    }
}

// -----------------------------------------------------
// 1. STUBS DE SENTINEL V2 (Telemetría viva inyectada)
// -----------------------------------------------------
function sentinel_capture_signals(array $runtimeCtx): array
{
    return [
        'download_speed' => $runtimeCtx['speed'] ?? 50, // Mbps
        'latency_ms'     => $runtimeCtx['latency'] ?? 15,
        'jitter'         => $runtimeCtx['jitter'] ?? 20
    ];
}

function sentinel_build_features(array $signals): array
{
    return [
        'risk_score' => ($signals['latency_ms'] / 1000) + ($signals['jitter'] / 100) + (50 / max(1, $signals['download_speed']))
    ];
}

function sentinel_predict_risk(array $features): float
{
    return min(1.0, max(0.0, $features['risk_score'] / 3.0));
}

// -----------------------------------------------------
// 2. PROBE + CACHE (ligero y seguro)
// -----------------------------------------------------

function cache_get_set(string $key, callable $fn, int $ttl = 15)
{
    $f = sys_get_temp_dir() . "/cmaf_" . md5($key);
    if (file_exists($f) && (time() - filemtime($f) < $ttl)) {
        return json_decode(file_get_contents($f), true);
    }
    $val = $fn();
    if ($val) file_put_contents($f, json_encode($val));
    return $val;
}

function cmaf_parse_target_duration(string $m3u): ?float
{
    if (preg_match('/#EXT-X-TARGETDURATION:(\d+)/', $m3u, $m)) {
        return (float)$m[1];
    }
    return null;
}

function cmaf_probe_manifest(string $url): ?array
{
    $ctx = stream_context_create([
        'http' => ['timeout' => 2, 'follow_location' => 1, 'max_redirects' => 2]
    ]);

    $raw = @file_get_contents($url, false, $ctx, 0, 20000); // solo primeros KB
    if (!$raw) return null;

    return [
        'is_mpd'   => str_contains($url, '.mpd') || str_contains($raw, '<MPD'),
        'has_part' => str_contains($raw, '#EXT-X-PART') || str_contains($raw, '#EXT-X-SERVER-CONTROL'),
        'has_m4s'  => str_contains($raw, '.m4s'),
        'target'   => cmaf_parse_target_duration($raw),
        'delta'    => str_contains($raw, 'EXT-X-SKIP'),
        'len'      => strlen($raw)
    ];
}

// -----------------------------------------------------
// 3. FEATURE BUILDER & SCORING
// -----------------------------------------------------

function cmaf_build_features(array $probe, array $net): array
{
    return [
        'cmaf_capable' => $probe['has_m4s'] || $probe['is_mpd'],
        'll_capable'   => $probe['has_part'] || $probe['delta'],
        'target_sec'   => $probe['target'] ?? 6,
        'latency_ms'   => $net['latency_ms'],
        'bandwidth'    => $net['mbps'],
        'stability'    => $net['jitter'] < 50 ? 1 : 0
    ];
}

function cmaf_score(array $f): float
{
    $score = 0;
    if ($f['cmaf_capable']) $score += 0.4;
    if ($f['ll_capable'])   $score += 0.2;

    $score += max(0, 0.2 - ($f['target_sec'] / 50));
    $score += max(0, 0.1 - ($f['latency_ms'] / 5000));
    $score += min(0.1, $f['bandwidth'] / 1000);
    $score += $f['stability'] ? 0.1 : 0;

    return max(0, min(1, $score));
}

function cmaf_rank_streams(array $streams, array $net): array
{
    $ranked = [];

    foreach ($streams as $url) {
        $probe = cache_get_set($url, fn() => cmaf_probe_manifest($url), 15);
        if (!$probe) {
            // Fallback ranking if probing fails
            $ranked[] = ['url' => $url, 'score' => 0.0, 'features' => []];
            continue;
        }

        $features = cmaf_build_features($probe, $net);
        $score    = cmaf_score($features);

        $ranked[] = [
            'url' => $url,
            'score' => $score,
            'features' => $features
        ];
    }

    usort($ranked, fn($a, $b) => $b['score'] <=> $a['score']);
    return $ranked;
}

// -----------------------------------------------------
// 4. INTEGRACIÓN FINAL CON SENTINEL v2
// -----------------------------------------------------

function cmaf_select_with_sentinel(array $streams, array $signals, CmafPlayerType $player): array
{
    $net = [
        'mbps' => $signals['download_speed'],
        'latency_ms' => $signals['latency_ms'],
        'jitter' => $signals['jitter'] ?? 20
    ];

    $ranked = cmaf_rank_streams($streams, $net);
    $features = sentinel_build_features($signals);
    $risk     = sentinel_predict_risk($features);

    if (function_exists('rq_pipeline_trace')) {
        rq_pipeline_trace(['cmaf_dominance_engine' => [
            'risk' => $risk,
            'top_score' => $ranked[0]['score'] ?? 0,
            'top_url' => $ranked[0]['url'] ?? 'none'
        ]]);
    }

    $primary = $streams[0];
    $fallbacks = [];

    // 🏆 Riesgo Bajo: Selecciona el origen Dominante (CMAF/DASH o LL-HLS con mayor Score)
    if ($risk < 0.5) {
        $primary = $ranked[0]['url'] ?? $streams[0];
        foreach ($ranked as $i => $r) {
            if ($i > 0 && $r['url'] !== $primary) $fallbacks[] = $r['url'];
        }
    } else {
        // 🛡️ Riesgo Alto: Cascada de Fallback Estricta (LL-HLS -> HLS -> TS)
        $ll_hls = null;
        $normal_hls = null;
        $ts_fallback = null;
        $mpd_fallback = null;

        foreach ($ranked as $r) {
            $url = $r['url'];
            $f = $r['features'];
            $path = parse_url($url, PHP_URL_PATH) ?? '';

            if (str_ends_with($path, '.ts')) {
                if (!$ts_fallback) $ts_fallback = $url;
            } elseif (str_ends_with($path, '.m3u8')) {
                if (!empty($f['ll_capable'])) {
                    if (!$ll_hls) $ll_hls = $url;
                } else {
                    if (!$normal_hls) $normal_hls = $url;
                }
            } elseif (str_ends_with($path, '.mpd')) {
                if (!$mpd_fallback) $mpd_fallback = $url;
            }
        }

        $priority_list = array_values(array_filter([$ll_hls, $normal_hls, $ts_fallback, $mpd_fallback]));
        $primary = array_shift($priority_list) ?? $streams[0];
        $fallbacks = $priority_list;
    }

    return [
        'primary' => $primary,
        'fallbacks' => array_values(array_unique($fallbacks))
    ];
}

function cmaf_apply_player_hints(string $url, CmafPlayerType $player): array
{
    $hints = [];

    // Fallbacks and Hints go completely INSIDE EXTHTTP json payload
    if ($player === CmafPlayerType::KODI && str_contains($url, '.mpd')) {
        $hints['KODIPROP'] = "inputstream.adaptive.manifest_type=mpd";
    }

    if ($player === CmafPlayerType::VLC) {
        $hints['VLC-network-caching'] = "1200";
        $hints['VLC-http-reconnect'] = "true";
    }

    return $hints;
}
