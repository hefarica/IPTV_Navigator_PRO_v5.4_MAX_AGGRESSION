<?php
declare(strict_types=1);

/**
 * PERFILES DE TV/PANTALLA — Definiciones Dinámicas
 * ================================================
 * Define los perfiles de capacidades de cada tipo de pantalla/TV
 * compatible con el middleware. Estos perfiles son usados por
 * CapabilityNegotiationLayer y GuardianPolicyEngine para limitar
 * las directivas inyectadas a lo que la pantalla puede mostrar.
 *
 * Cada perfil define:
 * - Tipo de HDR soportado
 * - Nits máximos (brillo pico)
 * - Resolución máxima
 * - Profundidad de color
 * - Espacio de color
 * - Cabeceras X-Display-* necesarias para detección
 *
 * Si no se envían cabeceras X-Display-*, se usa el perfil SDR por defecto.
 *
 * @package ResolveQuality v2.5 ULTRA
 * @profile tv_profiles
 */

// ============================================================================
// DEFINICIÓN DE PERFILES DE TV/PANTALLA
// ============================================================================

/**
 * Perfiles completos de TV/pantalla.
 * Cada perfil describe las capacidades de visualización del dispositivo.
 *
 * Claves del perfil:
 * - type: Identificador de tipo (sdr, hdr10, hdr10_plus, dolby_vision, hlg)
 * - name: Nombre legible del perfil
 * - max_nits: Brillo pico máximo en nits
 * - max_resolution: [ancho, alto] máximo soportado
 * - color_depth: Bits de profundidad de color (8, 10, 12)
 * - color_space: Espacio de color principal (BT709, BT2020)
 * - hdr_support: Lista de modos HDR soportados
 * - detection_headers: Cabeceras X-Display-* esperadas para detección
 */
return [
    // -------------------------------------------------------------------------
    // SDR Estándar — Perfil por defecto (si no hay cabeceras)
    // La mayoría de TVs y monitores que no declaran HDR
    // -------------------------------------------------------------------------
    'sdr' => [
        'type'           => 'sdr',
        'name'           => 'SDR Estándar',
        'max_nits'       => 350,
        'max_resolution' => [1920, 1080],
        'color_depth'    => 8,
        'color_space'    => 'BT709',
        'hdr_support'    => [],
        'detection_headers' => [
            // Sin cabeceras → se usa este perfil por defecto
        ],
        'notes'          => 'Perfil por defecto. Se usa cuando no hay cabeceras X-Display-* o cuando la TV no declara HDR.',
    ],

    // -------------------------------------------------------------------------
    // HDR10 — El estándar más común de HDR
    // Soporta metadatos estáticos. Compatible con la mayoría de TVs 4K.
    // -------------------------------------------------------------------------
    'hdr10' => [
        'type'           => 'hdr10',
        'name'           => 'HDR10',
        'max_nits'       => 1000,
        'max_resolution' => [3840, 2160],
        'color_depth'    => 10,
        'color_space'    => 'BT2020',
        'hdr_support'    => ['hdr10'],
        'detection_headers' => [
            'X-Display-HDR: hdr10',
            'X-Display-Max-Nits: 1000',
            'X-Display-Resolution: 3840x2160',
            'X-Display-Color-Depth: 10',
            'X-Display-Color-Space: BT2020',
        ],
        'notes'          => 'HDR estático con metadatos por escena. Requiere 10-bit y BT2020.',
    ],

    // -------------------------------------------------------------------------
    // HDR10+ — HDR dinámico (mejora de HDR10)
    // Metadatos dinámicos escena por escena. Desarrollado por Samsung.
    // -------------------------------------------------------------------------
    'hdr10_plus' => [
        'type'           => 'hdr10_plus',
        'name'           => 'HDR10+',
        'max_nits'       => 4000,
        'max_resolution' => [3840, 2160],
        'color_depth'    => 10,
        'color_space'    => 'BT2020',
        'hdr_support'    => ['hdr10', 'hdr10_plus'],
        'detection_headers' => [
            'X-Display-HDR: hdr10,hdr10_plus',
            'X-Display-Max-Nits: 4000',
            'X-Display-Resolution: 3840x2160',
            'X-Display-Color-Depth: 10',
            'X-Display-Color-Space: BT2020',
        ],
        'notes'          => 'HDR dinámico Samsung. Compatible con HDR10. Metadatos escena-a-escena.',
    ],

    // -------------------------------------------------------------------------
    // Dolby Vision — HDR dinámico premium
    // Usa metadatos dinámicos de 12 bits. Soporta profiles 5, 7, 8.
    // -------------------------------------------------------------------------
    'dolby_vision' => [
        'type'           => 'dolby_vision',
        'name'           => 'Dolby Vision',
        'max_nits'       => 4000,
        'max_resolution' => [3840, 2160],
        'color_depth'    => 12,
        'color_space'    => 'BT2020',
        'hdr_support'    => ['hdr10', 'dolby_vision', 'hlg'],
        'detection_headers' => [
            'X-Display-HDR: hdr10,dolby_vision,hlg',
            'X-Display-Max-Nits: 4000',
            'X-Display-Resolution: 3840x2160',
            'X-Display-Color-Depth: 12',
            'X-Display-Color-Space: BT2020',
        ],
        'notes'          => 'HDR dinámico Dolby. 12-bit. Compatible con HDR10 y HLG como fallback.',
    ],

    // -------------------------------------------------------------------------
    // HLG — Hybrid Log-Gamma
    // Diseñado para broadcasts HDR (TV en vivo). Compatible con SDR.
    // -------------------------------------------------------------------------
    'hlg' => [
        'type'           => 'hlg',
        'name'           => 'HLG (Hybrid Log-Gamma)',
        'max_nits'       => 1000,
        'max_resolution' => [3840, 2160],
        'color_depth'    => 10,
        'color_space'    => 'BT2020',
        'hdr_support'    => ['hlg', 'hdr10'],
        'detection_headers' => [
            'X-Display-HDR: hlg',
            'X-Display-Max-Nits: 1000',
            'X-Display-Resolution: 3840x2160',
            'X-Display-Color-Depth: 10',
            'X-Display-Color-Space: BT2020',
        ],
        'notes'          => 'Diseñado para broadcasting. Compatible con SDR (no requiere metadatos). Ideal para TV en vivo.',
    ],

    // -------------------------------------------------------------------------
    // TV 8K — Pantalla de ultra alta resolución
    // Resolución 7680x4320 con HDR completo
    // -------------------------------------------------------------------------
    '8k' => [
        'type'           => 'dolby_vision',
        'name'           => 'TV 8K HDR',
        'max_nits'       => 4000,
        'max_resolution' => [7680, 4320],
        'color_depth'    => 12,
        'color_space'    => 'BT2020',
        'hdr_support'    => ['hdr10', 'hdr10_plus', 'dolby_vision', 'hlg'],
        'detection_headers' => [
            'X-Display-HDR: hdr10,hdr10_plus,dolby_vision,hlg',
            'X-Display-Max-Nits: 4000',
            'X-Display-Resolution: 7680x4320',
            'X-Display-Color-Depth: 12',
            'X-Display-Color-Space: BT2020',
        ],
        'notes'          => 'TV 8K premium. Soporta todos los modos HDR. Resolución máxima absoluta.',
    ],
];
