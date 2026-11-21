<?php
declare(strict_types=1);

/**
 * PERFILES DE REPRODUCTOR — Definiciones Dinámicas
 * ================================================
 * Define los perfiles de capacidades de cada tipo de reproductor
 * compatible con el middleware. Estos perfiles son usados por
 * CapabilityNegotiationLayer para determinar qué directivas se
 * pueden inyectar y qué valores son seguros para cada reproductor.
 *
 * Cada perfil define:
 * - Directivas soportadas (vlcopt, kodiprop, exthttp, extx)
 * - Capacidades de hardware (decodificación, resolución, FPS)
 * - Capacidades de calidad (HDR, codecs, canales de audio)
 * - Límites de buffer
 *
 * Estos perfiles son dinámicos y pueden extenderse sin modificar
 * el código principal del pipeline.
 *
 * @package ResolveQuality v2.5 ULTRA
 * @profile player_profiles
 */

// ============================================================================
// DEFINICIÓN DE PERFILES DE REPRODUCTOR
// ============================================================================

/**
 * Perfiles completos de reproductor.
 * Cada perfil es un array asociativo con todas las capacidades del dispositivo.
 *
 * Claves del perfil:
 * - type: Identificador único del reproductor
 * - name: Nombre legible
 * - supports_*: Qué tipo de directivas soporta
 * - hw_decode: Si soporta decodificación por hardware
 * - max_resolution: [ancho, alto] máximo
 * - max_fps: FPS máximo soportado
 * - hdr_support: Lista de modos HDR soportados
 * - codec_support: Lista de codecs de video soportados
 * - audio_channels: Canales de audio máximos
 * - buffer_max_ms: Buffer máximo en milisegundos
 * - ua_patterns: Patrones para detección en User-Agent
 */
return [
    // -------------------------------------------------------------------------
    // VLC Media Player — El reproductor más versátil
    // Soporta EXTVLCOPT completo, EXTHTTP, EXT-X-* HLS
    // -------------------------------------------------------------------------
    'vlc' => [
        'type'              => 'vlc',
        'name'              => 'VLC Media Player',
        'supports_vlcopt'   => true,
        'supports_kodiprop' => false,
        'supports_exthttp'  => true,
        'supports_extx'     => true,
        'hw_decode'         => true,
        'max_resolution'    => [3840, 2160],
        'max_fps'           => 60,
        'hdr_support'       => ['hdr10', 'hlg'],
        'codec_support'     => ['h264', 'hevc', 'vp9', 'av1'],
        'audio_channels'    => 8,
        'buffer_max_ms'     => 120000,
        'ua_patterns'       => ['vlc', 'videolan'],
        'notes'             => 'Soporta las directivas más completas. Buffer configurable vía network-caching, live-caching, file-caching.',
    ],

    // -------------------------------------------------------------------------
    // Kodi (con InputStream Adaptive)
    // Soporta KODIPROP para InputStream Adaptive, EXTHTTP para headers
    // -------------------------------------------------------------------------
    'kodi' => [
        'type'              => 'kodi',
        'name'              => 'Kodi',
        'supports_vlcopt'   => false,
        'supports_kodiprop' => true,
        'supports_exthttp'  => true,
        'supports_extx'     => true,
        'hw_decode'         => true,
        'max_resolution'    => [3840, 2160],
        'max_fps'           => 60,
        'hdr_support'       => ['hdr10', 'hlg'],
        'codec_support'     => ['h264', 'hevc', 'vp9', 'av1'],
        'audio_channels'    => 8,
        'buffer_max_ms'     => 120000,
        'ua_patterns'       => ['kodi'],
        'notes'             => 'Usa KODIPROP para control de InputStream Adaptive. Buffer vía buffer_for_playback y live_buffer.',
    ],

    // -------------------------------------------------------------------------
    // OTT Navigator — Cliente IPTV popular para Android
    // Soporta EXTHTTP para headers personalizados
    // -------------------------------------------------------------------------
    'ott' => [
        'type'              => 'ott',
        'name'              => 'OTT Navigator',
        'supports_vlcopt'   => false,
        'supports_kodiprop' => false,
        'supports_exthttp'  => true,
        'supports_extx'     => false,
        'hw_decode'         => true,
        'max_resolution'    => [3840, 2160],
        'max_fps'           => 60,
        'hdr_support'       => ['hdr10', 'hlg', 'dolby_vision'],
        'codec_support'     => ['h264', 'hevc'],
        'audio_channels'    => 6,
        'buffer_max_ms'     => 60000,
        'ua_patterns'       => ['ott', 'navigator'],
        'notes'             => 'Solo soporta EXTHTTP para headers. No acepta EXTVLCOPT ni KODIPROP. Soporta Dolby Vision.',
    ],

    // -------------------------------------------------------------------------
    // ExoPlayer / IPTV Smarters
    // Soporta headers HTTP personalizados
    // -------------------------------------------------------------------------
    'exo' => [
        'type'              => 'exo',
        'name'              => 'ExoPlayer / IPTV Smarters',
        'supports_vlcopt'   => false,
        'supports_kodiprop' => false,
        'supports_exthttp'  => true,
        'supports_extx'     => false,
        'hw_decode'         => true,
        'max_resolution'    => [3840, 2160],
        'max_fps'           => 60,
        'hdr_support'       => ['hdr10'],
        'codec_support'     => ['h264', 'hevc', 'vp9'],
        'audio_channels'    => 6,
        'buffer_max_ms'     => 60000,
        'ua_patterns'       => ['exoplayer', 'smarters'],
        'notes'             => 'Header-based. No soporta directivas propietarias. Solo EXTHTTP.',
    ],

    // -------------------------------------------------------------------------
    // TiviMate — Cliente IPTV premium para Android TV
    // Soporta EXTVLCOPT limitado + EXTHTTP
    // -------------------------------------------------------------------------
    'tivimate' => [
        'type'              => 'tivimate',
        'name'              => 'TiviMate',
        'supports_vlcopt'   => true,
        'supports_kodiprop' => false,
        'supports_exthttp'  => true,
        'supports_extx'     => false,
        'hw_decode'         => true,
        'max_resolution'    => [3840, 2160],
        'max_fps'           => 60,
        'hdr_support'       => ['hdr10'],
        'codec_support'     => ['h264', 'hevc'],
        'audio_channels'    => 6,
        'buffer_max_ms'     => 60000,
        'ua_patterns'       => ['tivimate'],
        'notes'             => 'EXTVLCOPT limitado (solo network-caching). También soporta EXTHTTP.',
    ],

    // -------------------------------------------------------------------------
    // Smart TV (WebOS, Tizen, NetCast, Fire TV)
    // Soporte mínimo — no acepta directivas propietarias
    // -------------------------------------------------------------------------
    'smart_tv' => [
        'type'              => 'smart_tv',
        'name'              => 'Smart TV',
        'supports_vlcopt'   => false,
        'supports_kodiprop' => false,
        'supports_exthttp'  => false,
        'supports_extx'     => false,
        'hw_decode'         => true,
        'max_resolution'    => [1920, 1080],
        'max_fps'           => 60,
        'hdr_support'       => [],
        'codec_support'     => ['h264', 'hevc'],
        'audio_channels'    => 2,
        'buffer_max_ms'     => 30000,
        'ua_patterns'       => ['web0s', 'tizen', 'netcast', 'aftt', 'aftm'],
        'notes'             => 'Smart TVs no soportan directivas propietarias. Se pasa la lista sin modificaciones.',
    ],

    // -------------------------------------------------------------------------
    // Reproductor Genérico / Desconocido
    // Perfil más seguro — no asume ningún soporte
    // -------------------------------------------------------------------------
    'generic' => [
        'type'              => 'generic',
        'name'              => 'Generic Player',
        'supports_vlcopt'   => false,
        'supports_kodiprop' => false,
        'supports_exthttp'  => false,
        'supports_extx'     => false,
        'hw_decode'         => false,
        'max_resolution'    => [1920, 1080],
        'max_fps'           => 30,
        'hdr_support'       => [],
        'codec_support'     => ['h264'],
        'audio_channels'    => 2,
        'buffer_max_ms'     => 30000,
        'ua_patterns'       => [],
        'notes'             => 'Perfil de seguridad para reproductores desconocidos. No se inyectan directivas.',
    ],
];
