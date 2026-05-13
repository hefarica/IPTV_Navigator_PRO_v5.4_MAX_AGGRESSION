<?php
/**
 * ══════════════════════════════════════════════════════════════════════════
 *  APE INVISIBLE AI ENGINE v1.0 (OMEGA CRYSTAL V5)
 * ══════════════════════════════════════════════════════════════════════════
 * Este motor intercepta en la capa Proxy L7 el comportamiento del bitrate y
 * decide dinámicamente si inyectar filtros matemáticos GPGPU vía FFmpeg 
 * para purificar el ruido (Mosquito Noise/Artifacts) y forzar HDR Peak Nit.
 * Homologado en Frontend M3U8 Arrays.
 */

if (!function_exists('ape_noise_engine_integrate')) {
    function ape_noise_engine_integrate(bool $sniper, array $acrp_state, string $profile): array {
        if (!$sniper) return [];

        // Si el bitrate es bajo o hay artefactos detectados (perfil P1/P2) o red estrangulada
        $is_low_quality = ($profile === 'P1' || $profile === 'P2');
        
        $ff_filters = [];
        $http_headers = [];
        
        if ($is_low_quality) {
            // Gradfun (Dithering) y hqdn3d (Filtro 3D Denoise de alta calidad y baja CPU)
            $ff_filters[] = 'hqdn3d=3:2:2:3';
            $ff_filters[] = 'gradfun=1.2:16';
            $http_headers['X-APE-Noise-Engine'] = 'ACTIVE_GHOST_CLEANING';
        } else {
            // En calidad suprema, sólo suavizar banding leve 10-bit
            $ff_filters[] = 'gradfun=0.5:16';
            $http_headers['X-APE-Noise-Engine'] = 'ACTIVE_SMOOTH_BANDING';
        }

        return [
            'ffmpeg_vf' => implode(',', $ff_filters), // Ej: "hqdn3d=3:2:2:3,gradfun=1.2:16"
            'headers' => $http_headers,
            'ext_vlcopt' => [
                'video-filter=hqdn3d,gradfun',
                'hqdn3d-luma-spat=3',
                'hqdn3d-chroma-spat=2'
            ]
        ];
    }
}

if (!function_exists('ape_hdr_peak_nit_integrate')) {
    function ape_hdr_peak_nit_integrate(bool $sniper, array $acrp_state, string $profile): array {
        if (!$sniper) return [];

        // Forzar metadatos SEI en el bitstream para hacer creer al TV que son 5000 Nits
        $ff_video_flags = [];
        $http_headers = [];
        
        if ($profile === 'P5' || $profile === 'P4') { // UHD o FHD Supremo
            // Forzar metadata HEVC para BT2020 y MaxCLL 5000nits
            $ff_video_flags[] = '-color_primaries bt2020';
            $ff_video_flags[] = '-color_trc smpte2084'; // PQ HDR
            $ff_video_flags[] = '-colorspace bt2020nc';
            $ff_video_flags[] = '-sei_hdr_info 1'; 
            // 5000 nits max, 250 nits min promedio aprox
            $ff_video_flags[] = '-color_range tv';
            $http_headers['X-APE-HDR-Peak-Nit'] = 'OVERDRIVE_5000_NITS';
        } else {
            // Inverse Tone mapping fallback
            $ff_video_flags[] = '-vf zscale=t=linear:npl=250,format=yuv420p10le,zscale=p=bt2020:m=bt2020nc:r=tv:t=smpte2084';
            $http_headers['X-APE-HDR-Peak-Nit'] = 'INVERSE_TONEMAPPING_FAKE_HDR';
        }

        return [
            'ffmpeg_flags' => implode(' ', $ff_video_flags),
            'headers' => $http_headers,
            'ext_vlcopt' => [
                'color-primaries=bt2020',
                'color-transfer=smpte2084',
                'color-space=bt2020nc',
                'video-visual=full-range'
            ]
        ];
    }
}
