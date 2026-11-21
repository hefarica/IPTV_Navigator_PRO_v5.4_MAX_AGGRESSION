<?php
declare(strict_types=1);

/**
 * MÓDULO 3: CapabilityNegotiationLayer — Capa de Negociación de Capacidades
 * ==========================================================================
 * Detecta el tipo de reproductor, la pantalla/TV y la calidad de red
 * a partir de cabeceras HTTP y parámetros de consulta.
 *
 * Detección de reproductor (User-Agent):
 * - VLC, Kodi, OTT Navigator, ExoPlayer/Smarters, TiviMate, Smart TV, Genérico
 *
 * Detección de TV (X-Display-*):
 * - HDR, nits máximos, resolución, profundidad de color, espacio de color
 *
 * Detección de red (X-Throughput-*, X-Latency-*):
 * - Throughput, latencia, jitter, tipo de conexión
 *
 * Sin información explícita, se usan valores seguros por defecto.
 *
 * @package ResolveQuality v2.5 ULTRA
 * @module  CapabilityNegotiationLayer
 */

class CapabilityNegotiationLayer
{
    /**
     * Negocia las capacidades completas del entorno del cliente.
     *
     * @param  array $serverHeaders Cabeceras HTTP del servidor ($_SERVER)
     * @param  array $getParams     Parámetros GET de la solicitud
     * @return array{player: array, tv: array, network: array}
     */
    public function negotiate(array $serverHeaders = [], array $getParams = []): array
    {
        $player = $this->detectPlayer(serverHeaders: $serverHeaders);
        $tv = $this->detectTv(serverHeaders: $serverHeaders, getParams: $getParams);
        $network = $this->detectNetwork(serverHeaders: $serverHeaders);

        return [
            'player'  => $player,
            'tv'      => $tv,
            'network' => $network,
        ];
    }

    /**
     * Detecta el tipo de reproductor desde User-Agent.
     *
     * Cada tipo de reproductor tiene un perfil de capacidades diferente
     * que determina qué directivas se pueden inyectar.
     *
     * @param  array $serverHeaders Cabeceras HTTP del servidor
     * @return array Perfil completo del reproductor detectado
     */
    private function detectPlayer(array $serverHeaders): array
    {
        $ua = $serverHeaders['HTTP_USER_AGENT']
            ?? $serverHeaders['USER_AGENT']
            ?? $_SERVER['HTTP_USER_AGENT']
            ?? 'Generic/1.0';

        $uaLower = strtolower($ua);

        // Clasificación por patrones en User-Agent
        $playerType = match (true) {
            str_contains($uaLower, 'vlc')          => PlayerType::VLC->value,
            str_contains($uaLower, 'kodi')         => PlayerType::KODI->value,
            str_contains($uaLower, 'ott') ||
            str_contains($uaLower, 'navigator')    => PlayerType::OTT->value,
            str_contains($uaLower, 'exoplayer') ||
            str_contains($uaLower, 'smarters')     => PlayerType::EXO->value,
            str_contains($uaLower, 'tivimate')     => PlayerType::TIVIMATE->value,
            str_contains($uaLower, 'tv') ||
            str_contains($uaLower, 'aftt') ||
            str_contains($uaLower, 'aftm') ||
            str_contains($uaLower, 'web0s') ||
            str_contains($uaLower, 'tizen') ||
            str_contains($uaLower, 'netcast')      => PlayerType::SMART_TV->value,
            default                                                  => PlayerType::GENERIC->value,
        };

        // Extraer versión del User-Agent si es posible
        $version = '';
        if (preg_match('/[\d]+(?:\.[\d]+){1,3}/', $ua, $matches)) {
            $version = $matches[0];
        }

        // Perfil de capacidades según tipo de reproductor
        return match ($playerType) {
            PlayerType::VLC->value => [
                'type'              => PlayerType::VLC->value,
                'name'              => 'VLC Media Player',
                'version'           => $version,
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
            ],
            PlayerType::KODI->value => [
                'type'              => PlayerType::KODI->value,
                'name'              => 'Kodi',
                'version'           => $version,
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
            ],
            PlayerType::OTT->value => [
                'type'              => PlayerType::OTT->value,
                'name'              => 'OTT Navigator',
                'version'           => $version,
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
            ],
            PlayerType::EXO->value => [
                'type'              => PlayerType::EXO->value,
                'name'              => 'ExoPlayer / IPTV Smarters',
                'version'           => $version,
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
            ],
            PlayerType::TIVIMATE->value => [
                'type'              => PlayerType::TIVIMATE->value,
                'name'              => 'TiviMate',
                'version'           => $version,
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
            ],
            PlayerType::SMART_TV->value => [
                'type'              => PlayerType::SMART_TV->value,
                'name'              => 'Smart TV',
                'version'           => $version,
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
            ],
            default => [
                'type'              => PlayerType::GENERIC->value,
                'name'              => 'Generic Player',
                'version'           => $version,
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
            ],
        };
    }

    /**
     * Detecta las capacidades de la pantalla/TV desde cabeceras X-Display-*.
     *
     * Valores por defecto (si no hay cabeceras): SDR, 1080p, 350nits, 8-bit, BT709
     *
     * @param  array $serverHeaders Cabeceras HTTP
     * @param  array $getParams     Parámetros GET (puede incluir max_res override)
     * @return array Perfil de TV detectado
     */
    private function detectTv(array $serverHeaders, array $getParams): array
    {
        // Valores por defecto: TV SDR 1080p estándar
        $tv = [
            'type'           => 'sdr',
            'max_nits'       => 350,
            'max_resolution' => [1920, 1080],
            'color_depth'    => 8,
            'color_space'    => 'BT709',
            'hdr_support'    => [],
        ];

        // Leer X-Display-HDR para soporte HDR
        $hdr = rq_header(name: 'X-Display-HDR', serverHeaders: $serverHeaders);
        if ($hdr !== null) {
            $tv['hdr_support'] = array_map('trim', explode(',', strtolower($hdr))
            );
            $tv['type'] = match (true) {
                in_array('dolby_vision', $tv['hdr_support'], true) ||
                in_array('dolby-vision', $tv['hdr_support'], true) => 'dolby_vision',
                in_array('hdr10_plus', $tv['hdr_support'], true) ||
                in_array('hdr10-plus', $tv['hdr_support'], true) => 'hdr10_plus',
                in_array('hdr10', $tv['hdr_support'], true) => 'hdr10',
                in_array('hlg', $tv['hdr_support'], true) => 'hlg',
                default => 'hdr',
            };
        }

        // Nits máximos (brillo pico)
        $nits = rq_header(name: 'X-Display-Max-Nits', serverHeaders: $serverHeaders);
        if ($nits !== null && is_numeric($nits)) {
            $tv['max_nits'] = (int) $nits;
        }

        // Resolución máxima (formato: WxH)
        $res = rq_header(name: 'X-Display-Resolution', serverHeaders: $serverHeaders);
        if ($res !== null) {
            $parts = array_map('intval', explode('x', strtolower($res)));
            if (count($parts) === 2) {
                $tv['max_resolution'] = [$parts[0], $parts[1]];
            }
        }

        // Profundidad de color (8, 10, 12 bits)
        $depth = rq_header(name: 'X-Display-Color-Depth', serverHeaders: $serverHeaders);
        if ($depth !== null && is_numeric($depth)) {
            $tv['color_depth'] = (int) $depth;
        }

        // Espacio de color (BT709, BT2020)
        $space = rq_header(name: 'X-Display-Color-Space', serverHeaders: $serverHeaders);
        if ($space !== null) {
            $tv['color_space'] = strtoupper(trim($space));
        }

        // Permitir override por parámetro GET (?max_res=3840x2160)
        if (isset($getParams['max_res']) && str_contains($getParams['max_res'], 'x')) {
            $parts = array_map('intval', explode('x', $getParams['max_res']));
            if (count($parts) === 2 && $parts[0] > 0 && $parts[1] > 0) {
                $tv['max_resolution'] = [$parts[0], $parts[1]];
            }
        }

        return $tv;
    }

    /**
     * Detecta la calidad de red desde cabeceras HTTP.
     *
     * Cabeceras soportadas:
     * - X-Throughput-Kbps / HTTP_X_THROUGHPUT
     * - X-Latency-Ms / HTTP_X_LATENCY
     * - X-Jitter-Ms
     * - X-Connection-Type (ethernet, wifi, mobile)
     *
     * Valores por defecto: 5000kbps, 50ms latencia, 10ms jitter
     */
    private function detectNetwork(array $serverHeaders): array
    {
        $network = [
            'throughput_kbps' => 5000,
            'latency_ms'      => 50,
            'jitter_ms'       => 10,
            'packet_loss'     => 0.0,
            'connection_type' => ConnectionType::UNKNOWN->value,
        ];

        // Throughput (ancho de banda disponible)
        $throughput = rq_header(name: 'X-Throughput-Kbps', serverHeaders: $serverHeaders)
            ?? rq_header(name: 'HTTP_X_THROUGHPUT', serverHeaders: $serverHeaders);
        if ($throughput !== null && is_numeric($throughput)) {
            $network['throughput_kbps'] = max(100, (int) $throughput);
        }

        // Latencia en milisegundos
        $latency = rq_header(name: 'X-Latency-Ms', serverHeaders: $serverHeaders)
            ?? rq_header(name: 'HTTP_X_LATENCY', serverHeaders: $serverHeaders);
        if ($latency !== null && is_numeric($latency)) {
            $network['latency_ms'] = max(1, (int) $latency);
        }

        // Jitter en milisegundos
        $jitter = rq_header(name: 'X-Jitter-Ms', serverHeaders: $serverHeaders);
        if ($jitter !== null && is_numeric($jitter)) {
            $network['jitter_ms'] = max(0, (int) $jitter);
        }

        // Tipo de conexión
        $connType = rq_header(name: 'X-Connection-Type', serverHeaders: $serverHeaders);
        if ($connType !== null) {
            $normalized = strtolower(trim($connType));
            if (in_array($normalized, ['ethernet', 'wifi', 'mobile'], true)) {
                $network['connection_type'] = $normalized;
            }
        }

        // Estimar pérdida de paquetes basada en jitter alto
        if ($network['jitter_ms'] > 50) {
            $network['packet_loss'] = min(0.1, $network['jitter_ms'] / 1000.0);
        }

        return $network;
    }
}
