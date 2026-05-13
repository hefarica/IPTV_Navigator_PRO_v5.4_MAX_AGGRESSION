<?php
declare(strict_types=1);
/**
 * IPTV Navigator PRO — Universal Compatibility Layer
 * Module: Universal Headers Engine v1.0.0
 *
 * FUNCIÓN: Genera los headers HTTP correctos para cada player del mundo.
 * Cada player tiene requisitos específicos de headers para reproducir
 * correctamente. Este módulo centraliza esa lógica.
 *
 * CAPAS DE HEADERS:
 *   #EXTHTTP:{...}    — Headers HTTP en JSON (TiviMate, ExoPlayer, OTT Nav)
 *   #EXTVLCOPT:...    — Directivas VLC (http-user-agent, http-referrer, etc.)
 *   #KODIPROP:...     — Propiedades Kodi (inputstream, DRM, mimetype)
 *
 * HEADERS HTTP CRÍTICOS POR PLAYER:
 *   TiviMate/ExoPlayer: User-Agent, Referer, Origin, Connection
 *   VLC:                http-user-agent, http-referrer, network-caching
 *   Kodi:               inputstream.adaptive.manifest_type, mimetype
 *   Safari/Apple TV:    User-Agent (iOS Safari UA obligatorio)
 *   MAG STB:            User-Agent (STB firmware UA)
 *   Samsung/LG:         User-Agent (SmartTV UA)
 */

class UniversalHeadersEngine
{
    const ENGINE_VERSION = '1.0.0';

    // ─── Standard User-Agent strings ──────────────────────────────────────────
    const UA_EXOPLAYER   = 'ExoPlayer/2.18.1 (Linux; Android 11; Player) AppleWebKit/537.36';
    const UA_TIVIMATE    = 'TiviMate/4.7.0 (Android 11; ExoPlayer/2.18.1)';
    const UA_VLC         = 'VLC/3.0.18 LibVLC/3.0.18';
    const UA_KODI        = 'Kodi/20.2 (X11; Linux x86_64) App_Bitness/64 Version/20.2-Git:20230726-300';
    const UA_SAFARI_IOS  = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';
    const UA_SAFARI_MAC  = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15';
    const UA_CHROME      = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    const UA_FIREFOX     = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0';
    const UA_PLEX        = 'PlexMediaPlayer/4.63.4 (Windows; x86_64)';
    const UA_EMBY        = 'Emby/4.8.0.0 (Windows NT 10.0; Win64; x64)';
    const UA_JELLYFIN    = 'Jellyfin-Media-Player/1.9.1 (Windows NT 10.0; Win64; x64)';
    const UA_MAG         = 'Mozilla/5.0 (SMART-TV; Linux; Tizen 5.0) AppleWebKit/538.1 (KHTML, like Gecko) Version/5.0 TV Safari/538.1';
    const UA_SAMSUNG     = 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) AppleWebKit/538.1 (KHTML, like Gecko) Version/6.0 TV Safari/538.1';
    const UA_LG          = 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Safari/537.36 WebAppManager';
    const UA_FIRETV      = 'Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7233; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/88.0.4324.152 Mobile Safari/537.36';
    const UA_SHIELD      = 'Dalvik/2.1.0 (Linux; U; Android 11; SHIELD Android TV Build/PPR1.180610.011)';
    const UA_ROKU        = 'Roku/DVP-9.10 (519.10E04111A)';
    const UA_APPLE_TV    = 'AppleTV6,2/11.1';
    const UA_MPV         = 'mpv/0.35.1';
    const UA_GENERIC     = 'Mozilla/5.0 (compatible; IPTV-Player/1.0)';

    /**
     * Generate all headers (EXTHTTP + EXTVLCOPT + KODIPROP) for a player.
     *
     * @param string $playerId     Player ID from PlayerCapabilityResolver.
     * @param array  $channelDna   Channel DNA for context-aware headers.
     * @param string $streamUrl    Stream URL (for Referer/Origin extraction).
     * @return array               ['exthttp' => string[], 'extvlcopt' => string[], 'kodiprop' => string[]]
     */
    public static function generateForPlayer(
        string $playerId,
        array  $channelDna = [],
        string $streamUrl = ''
    ): array {
        $engine = new self();
        return $engine->build($playerId, $channelDna, $streamUrl);
    }

    private function build(string $playerId, array $dna, string $url): array
    {
        $ua      = $this->getUserAgent($playerId, $dna);
        $origin  = $this->extractOrigin($url);
        $referer = $url;

        $exthttp   = $this->buildExtHttp($playerId, $ua, $origin, $referer, $dna);
        $extvlcopt = $this->buildExtVlcOpt($playerId, $ua, $referer, $dna);
        $kodiprop  = $this->buildKodiProp($playerId, $dna);

        return [
            'exthttp'   => $exthttp,
            'extvlcopt' => $extvlcopt,
            'kodiprop'  => $kodiprop,
        ];
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // USER-AGENT RESOLUTION
    // ═══════════════════════════════════════════════════════════════════════════

    private function getUserAgent(string $playerId, array $dna): string
    {
        // Channel DNA can override the UA
        if (!empty($dna['user_agent'])) {
            return $dna['user_agent'];
        }

        return match($playerId) {
            'TiviMate'        => self::UA_TIVIMATE,
            'ExoPlayer'       => self::UA_EXOPLAYER,
            'OTT_Navigator'   => self::UA_EXOPLAYER,
            'IPTV_Smarters'   => self::UA_EXOPLAYER,
            'GSE_Smart_IPTV'  => self::UA_EXOPLAYER,
            'Perfect_Player'  => self::UA_EXOPLAYER,
            'MX_Player'       => self::UA_EXOPLAYER,
            'IPTV_Extreme'    => self::UA_EXOPLAYER,
            'Sparkle_TV'      => self::UA_EXOPLAYER,
            'Televizo'        => self::UA_EXOPLAYER,
            'Stremio'         => self::UA_CHROME,
            'Kodi_19'         => self::UA_KODI,
            'Kodi_18'         => self::UA_KODI,
            'Plex'            => self::UA_PLEX,
            'Emby'            => self::UA_EMBY,
            'Jellyfin'        => self::UA_JELLYFIN,
            'Infuse'          => self::UA_SAFARI_IOS,
            'Channels_DVR'    => self::UA_SAFARI_MAC,
            'Safari_iOS'      => self::UA_SAFARI_IOS,
            'Safari_macOS'    => self::UA_SAFARI_MAC,
            'Chrome'          => self::UA_CHROME,
            'Firefox'         => self::UA_FIREFOX,
            'ShakaPlayer'     => self::UA_CHROME,
            'HLS_js'          => self::UA_CHROME,
            'Video_js'        => self::UA_CHROME,
            'VLC_3'           => self::UA_VLC,
            'VLC_2'           => self::UA_VLC,
            'MPV'             => self::UA_MPV,
            'MPC_HC'          => self::UA_GENERIC,
            'MAG_Old'         => self::UA_MAG,
            'MAG_New'         => self::UA_MAG,
            'Formuler'        => self::UA_MAG,
            'Dreamlink'       => self::UA_MAG,
            'Samsung_Tizen'   => self::UA_SAMSUNG,
            'LG_webOS'        => self::UA_LG,
            'Fire_TV'         => self::UA_FIRETV,
            'NVIDIA_SHIELD'   => self::UA_SHIELD,
            'Roku'            => self::UA_ROKU,
            'Apple_TV'        => self::UA_APPLE_TV,
            default           => self::UA_GENERIC,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // #EXTHTTP GENERATION — JSON headers for ExoPlayer-based players
    // ═══════════════════════════════════════════════════════════════════════════

    private function buildExtHttp(
        string $playerId,
        string $ua,
        string $origin,
        string $referer,
        array  $dna
    ): array {
        $lines = [];

        // Players that use #EXTHTTP (ExoPlayer-based + web players)
        $exthttpPlayers = [
            'TiviMate', 'ExoPlayer', 'OTT_Navigator', 'IPTV_Smarters',
            'GSE_Smart_IPTV', 'Perfect_Player', 'MX_Player', 'IPTV_Extreme',
            'Sparkle_TV', 'Televizo', 'Stremio', 'Kodi_19', 'Plex', 'Emby',
            'Jellyfin', 'Chrome', 'Firefox', 'ShakaPlayer', 'HLS_js',
            'Video_js', 'Fire_TV', 'NVIDIA_SHIELD', 'Formuler', 'Dreamlink',
            'Samsung_Tizen', 'LG_webOS',
        ];

        if (!in_array($playerId, $exthttpPlayers)) {
            return $lines;
        }

        $headers = [
            'User-Agent'      => $ua,
            'Accept'          => '*/*',
            'Accept-Language' => 'en-US,en;q=0.9',
            'Connection'      => 'keep-alive',
        ];

        // Add Origin + Referer for players that need them
        $needsOrigin = ['TiviMate', 'ExoPlayer', 'OTT_Navigator', 'IPTV_Smarters',
                        'Chrome', 'Firefox', 'ShakaPlayer'];
        if (in_array($playerId, $needsOrigin) && !empty($origin)) {
            $headers['Origin']  = $origin;
            $headers['Referer'] = $referer;
        }

        // Add X-Forwarded-For for players behind proxy
        if (!empty($dna['proxy_ip'])) {
            $headers['X-Forwarded-For'] = $dna['proxy_ip'];
        }

        // Add custom headers from channel DNA
        if (!empty($dna['custom_headers']) && is_array($dna['custom_headers'])) {
            foreach ($dna['custom_headers'] as $k => $v) {
                $headers[$k] = $v;
            }
        }

        $lines[] = '#EXTHTTP:' . json_encode($headers, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

        return $lines;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // #EXTVLCOPT GENERATION — VLC-specific directives
    // ═══════════════════════════════════════════════════════════════════════════

    private function buildExtVlcOpt(
        string $playerId,
        string $ua,
        string $referer,
        array  $dna
    ): array {
        $lines = [];

        // VLC players and VLC-based players
        $vlcPlayers = ['VLC_3', 'VLC_2', 'Kodi_19', 'Kodi_18', 'MPV'];

        if (!in_array($playerId, $vlcPlayers)) {
            return $lines;
        }

        // http-user-agent: MUST match the UA in EXTHTTP
        $lines[] = "#EXTVLCOPT:http-user-agent={$ua}";

        // http-referrer: helps with anti-hotlink protection
        if (!empty($referer)) {
            $lines[] = "#EXTVLCOPT:http-referrer={$referer}";
        }

        // network-caching: optimize for live IPTV (low latency)
        $cachingMs = $dna['vlc_network_caching'] ?? 1000;
        $lines[] = "#EXTVLCOPT:network-caching={$cachingMs}";

        // live-caching: for live streams
        $liveCachingMs = $dna['vlc_live_caching'] ?? 1000;
        $lines[] = "#EXTVLCOPT:live-caching={$liveCachingMs}";

        // sout-mux-caching: output mux caching
        $lines[] = "#EXTVLCOPT:sout-mux-caching=100";

        // http-forward-cookies: needed for some providers
        $lines[] = "#EXTVLCOPT:http-forward-cookies=1";

        // Custom VLC options from channel DNA
        if (!empty($dna['vlc_options']) && is_array($dna['vlc_options'])) {
            foreach ($dna['vlc_options'] as $opt) {
                $lines[] = "#EXTVLCOPT:{$opt}";
            }
        }

        return $lines;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // #KODIPROP GENERATION — Kodi inputstream properties
    // ═══════════════════════════════════════════════════════════════════════════

    private function buildKodiProp(string $playerId, array $dna): array
    {
        $lines = [];

        $kodiPlayers = ['Kodi_19', 'Kodi_18'];
        if (!in_array($playerId, $kodiPlayers)) {
            return $lines;
        }

        // Determine the inputstream based on format
        $format = $dna['preferred_format'] ?? 'hls_fmp4';
        $isDash = ($format === 'dash');
        $isFmp4 = ($format === 'hls_fmp4' || $format === 'cmaf');

        if ($isDash) {
            // DASH/MPD via inputstream.adaptive
            $lines[] = '#KODIPROP:inputstream=inputstream.adaptive';
            $lines[] = '#KODIPROP:inputstream.adaptive.manifest_type=mpd';
            $lines[] = '#KODIPROP:mimetype=application/dash+xml';
        } elseif ($isFmp4) {
            // HLS/fMP4 via inputstream.adaptive (Kodi 19+)
            if ($playerId === 'Kodi_19') {
                $lines[] = '#KODIPROP:inputstream=inputstream.adaptive';
                $lines[] = '#KODIPROP:inputstream.adaptive.manifest_type=hls';
                $lines[] = '#KODIPROP:mimetype=application/x-mpegURL';
            } else {
                // Kodi 18: use inputstream.ffmpegdirect for HLS
                $lines[] = '#KODIPROP:inputstream=inputstream.ffmpegdirect';
                $lines[] = '#KODIPROP:inputstream.ffmpegdirect.mime_type=video/mp2t';
                $lines[] = '#KODIPROP:mimetype=application/x-mpegURL';
            }
        } else {
            // TS Direct
            $lines[] = '#KODIPROP:inputstream=inputstream.ffmpegdirect';
            $lines[] = '#KODIPROP:inputstream.ffmpegdirect.mime_type=video/mp2t';
            $lines[] = '#KODIPROP:mimetype=video/mp2t';
        }

        // HEVC/H.265 hint for Kodi
        if (!empty($dna['codec']) && in_array($dna['codec'], ['hevc', 'h265'])) {
            $lines[] = '#KODIPROP:inputstream.adaptive.stream_selection_type=fixed';
        }

        // Custom Kodi properties from channel DNA
        if (!empty($dna['kodi_props']) && is_array($dna['kodi_props'])) {
            foreach ($dna['kodi_props'] as $k => $v) {
                $lines[] = "#KODIPROP:{$k}={$v}";
            }
        }

        return $lines;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    private function extractOrigin(string $url): string
    {
        if (empty($url)) return '';
        $parts = parse_url($url);
        if (!$parts) return '';
        $scheme = $parts['scheme'] ?? 'https';
        $host   = $parts['host'] ?? '';
        $port   = isset($parts['port']) ? ":{$parts['port']}" : '';
        return "{$scheme}://{$host}{$port}";
    }

    /**
     * Generate a complete M3U8 header block for a channel entry.
     * Returns all header lines in the correct order.
     *
     * @param string $playerId     Player ID.
     * @param array  $channelDna   Channel DNA.
     * @param string $streamUrl    Stream URL.
     * @return string[]            Array of header lines.
     */
    public static function generateHeaderLines(
        string $playerId,
        array  $channelDna = [],
        string $streamUrl = ''
    ): array {
        $engine = new self();
        $headers = $engine->build($playerId, $channelDna, $streamUrl);

        return array_merge(
            $headers['extvlcopt'],  // VLC first (before EXTHTTP)
            $headers['exthttp'],    // JSON headers
            $headers['kodiprop']    // Kodi props last
        );
    }
}
