<?php
declare(strict_types=1);
/**
 * IPTV Navigator PRO — Universal Compatibility Layer
 * Module: Player Capability Resolver (PCR) v3.3.0-UNIVERSAL
 *
 * DETECTS: 35+ players by User-Agent, header, query param
 * FORMATS: HLS/fMP4, HLS/TS, DASH/MPD, TS Direct, CMAF
 * CODECS:  H.264, H.265/HEVC, AV1, VP9, MPEG2-TS
 * SPECIAL: LCEVC, HDR10+, Dolby Vision, DRM-free
 *
 * ═══════════════════════════════════════════════════════════════════════
 * UNIVERSAL PLAYER MATRIX v3.3 — 35 Players
 * ─────────────────────────────────────────────────────────────────────
 * Columns: [fMP4, DASH, HEVC, LCEVC, AV1, HDR10, preferred_format]
 * ─────────────────────────────────────────────────────────────────────
 * ANDROID IPTV PLAYERS:
 *   ExoPlayer 2.x+    YES  YES  YES  YES* YES  YES  hls_fmp4
 *   TiviMate 4.x+     YES  YES  YES  YES* YES  YES  hls_fmp4
 *   OTT Navigator     YES  YES  YES  NO   NO   YES  hls_fmp4
 *   IPTV Smarters     YES  YES  YES  NO   NO   YES  hls_fmp4
 *   GSE Smart IPTV    YES  YES  YES  NO   NO   NO   hls_fmp4
 *   Perfect Player    YES  NO   YES  NO   NO   NO   hls_ts
 *   MX Player         YES  YES  YES  NO   YES  YES  hls_fmp4
 *   IPTV Extreme      YES  YES  YES  NO   NO   NO   hls_fmp4
 *   Sparkle TV        YES  YES  YES  NO   NO   NO   hls_fmp4
 *   Televizo          YES  YES  YES  NO   NO   NO   hls_fmp4
 *   Stremio           YES  YES  NO   NO   YES  NO   hls_fmp4
 *
 * KODI / MEDIA CENTER:
 *   Kodi 19+ (Matrix) YES  YES  YES  NO   YES  YES  hls_fmp4
 *   Kodi 18 (Leia)    YES  YES  YES  NO   NO   NO   hls_ts
 *   Plex Media Player YES  YES  YES  NO   YES  YES  hls_fmp4
 *   Emby Player       YES  YES  YES  NO   NO   YES  hls_fmp4
 *   Jellyfin Player   YES  YES  YES  NO   NO   YES  hls_fmp4
 *   Infuse 7+ (iOS)   YES  NO   YES  NO   NO   YES  hls_fmp4
 *   Channels DVR      YES  NO   YES  NO   NO   YES  hls_fmp4
 *
 * BROWSERS / WEB:
 *   Safari 14+ (iOS)  YES  NO   YES  NO   NO   YES  hls_fmp4
 *   Safari 14+ (macOS)YES  NO   YES  NO   NO   YES  hls_fmp4
 *   Chrome 80+        YES  YES  NO   NO   YES  NO   hls_fmp4
 *   Firefox 75+       YES  YES  NO   NO   YES  NO   hls_fmp4
 *   Shaka Player      YES  YES  YES  YES* YES  YES  dash
 *   HLS.js            YES  NO   NO   NO   NO   NO   hls_fmp4
 *   Video.js          YES  YES  NO   NO   NO   NO   hls_fmp4
 *
 * DESKTOP:
 *   VLC 3.x+          YES  YES  YES  NO   YES  YES  hls_fmp4
 *   VLC 2.x           NO   YES  NO   NO   NO   NO   hls_ts
 *   MPV Player        YES  YES  YES  NO   YES  YES  hls_fmp4
 *   MPC-HC            NO   NO   NO   NO   NO   NO   ts_direct
 *
 * STB / SMART TV:
 *   MAG 250/254/256   NO   NO   NO   NO   NO   NO   hls_ts
 *   MAG 322/324/349   YES  NO   YES  NO   NO   NO   hls_fmp4
 *   Formuler Z8/Z10   YES  YES  YES  NO   NO   YES  hls_fmp4
 *   Dreamlink T2/T3   YES  YES  YES  NO   NO   NO   hls_fmp4
 *   Samsung Tizen 4+  YES  YES  YES  NO   NO   YES  hls_fmp4
 *   LG webOS 4+       YES  YES  YES  NO   NO   YES  hls_fmp4
 *   Fire TV Stick 4K  YES  YES  YES  NO   YES  YES  hls_fmp4
 *   NVIDIA SHIELD     YES  YES  YES  NO   YES  YES  hls_fmp4
 *   Roku Ultra        YES  NO   NO   NO   NO   NO   hls_ts
 *   Apple TV 4K       YES  NO   YES  NO   NO   YES  hls_fmp4
 *
 * * LCEVC requires V-Nova SDK integration in the player
 * ═══════════════════════════════════════════════════════════════════════
 */

class PlayerCapabilityResolver
{
    const RESOLVER_VERSION = '3.3.0-UNIVERSAL';

    // ─── Player IDs ───────────────────────────────────────────────────────────
    const PLAYER_EXOPLAYER      = 'ExoPlayer';
    const PLAYER_TIVIMATE       = 'TiviMate';
    const PLAYER_OTT_NAV        = 'OTT_Navigator';
    const PLAYER_SMARTERS       = 'IPTV_Smarters';
    const PLAYER_GSE            = 'GSE_Smart_IPTV';
    const PLAYER_PERFECT        = 'Perfect_Player';
    const PLAYER_MX_PLAYER      = 'MX_Player';
    const PLAYER_IPTV_EXTREME   = 'IPTV_Extreme';
    const PLAYER_SPARKLE        = 'Sparkle_TV';
    const PLAYER_TELEVIZO       = 'Televizo';
    const PLAYER_STREMIO        = 'Stremio';
    const PLAYER_KODI_19        = 'Kodi_19';
    const PLAYER_KODI_18        = 'Kodi_18';
    const PLAYER_PLEX           = 'Plex';
    const PLAYER_EMBY           = 'Emby';
    const PLAYER_JELLYFIN       = 'Jellyfin';
    const PLAYER_INFUSE         = 'Infuse';
    const PLAYER_CHANNELS_DVR   = 'Channels_DVR';
    const PLAYER_SAFARI_IOS     = 'Safari_iOS';
    const PLAYER_SAFARI_MACOS   = 'Safari_macOS';
    const PLAYER_CHROME         = 'Chrome';
    const PLAYER_FIREFOX        = 'Firefox';
    const PLAYER_SHAKA          = 'ShakaPlayer';
    const PLAYER_HLSJS          = 'HLS_js';
    const PLAYER_VIDEOJS        = 'Video_js';
    const PLAYER_VLC_3          = 'VLC_3';
    const PLAYER_VLC_2          = 'VLC_2';
    const PLAYER_MPV            = 'MPV';
    const PLAYER_MPCHC          = 'MPC_HC';
    const PLAYER_MAG_OLD        = 'MAG_Old';
    const PLAYER_MAG_NEW        = 'MAG_New';
    const PLAYER_FORMULER       = 'Formuler';
    const PLAYER_DREAMLINK      = 'Dreamlink';
    const PLAYER_SAMSUNG        = 'Samsung_Tizen';
    const PLAYER_LG             = 'LG_webOS';
    const PLAYER_FIRETV         = 'Fire_TV';
    const PLAYER_SHIELD         = 'NVIDIA_SHIELD';
    const PLAYER_ROKU           = 'Roku';
    const PLAYER_APPLE_TV       = 'Apple_TV';
    const PLAYER_UNKNOWN        = 'Unknown';

    // ─── Format IDs ───────────────────────────────────────────────────────────
    const FORMAT_HLS_FMP4       = 'hls_fmp4';
    const FORMAT_HLS_TS         = 'hls_ts';
    const FORMAT_DASH           = 'dash';
    const FORMAT_TS_DIRECT      = 'ts_direct';
    const FORMAT_CMAF           = 'cmaf';

    /**
     * UNIVERSAL PLAYER CAPABILITY MATRIX
     * Format: [fMP4, DASH, HEVC, LCEVC, AV1, HDR10, preferred_format]
     */
    private static array $PLAYER_MATRIX = [
        // ── Android IPTV Players ──────────────────────────────────────────────
        'ExoPlayer'       => [true,  true,  true,  true,  true,  true,  self::FORMAT_HLS_FMP4],
        'TiviMate'        => [true,  true,  true,  true,  true,  true,  self::FORMAT_HLS_FMP4],
        'OTT_Navigator'   => [true,  true,  true,  false, false, true,  self::FORMAT_HLS_FMP4],
        'IPTV_Smarters'   => [true,  true,  true,  false, false, true,  self::FORMAT_HLS_FMP4],
        'GSE_Smart_IPTV'  => [true,  true,  true,  false, false, false, self::FORMAT_HLS_FMP4],
        'Perfect_Player'  => [true,  false, true,  false, false, false, self::FORMAT_HLS_TS],
        'MX_Player'       => [true,  true,  true,  false, true,  true,  self::FORMAT_HLS_FMP4],
        'IPTV_Extreme'    => [true,  true,  true,  false, false, false, self::FORMAT_HLS_FMP4],
        'Sparkle_TV'      => [true,  true,  true,  false, false, false, self::FORMAT_HLS_FMP4],
        'Televizo'        => [true,  true,  true,  false, false, false, self::FORMAT_HLS_FMP4],
        'Stremio'         => [true,  true,  false, false, true,  false, self::FORMAT_HLS_FMP4],

        // ── Kodi / Media Center ───────────────────────────────────────────────
        'Kodi_19'         => [true,  true,  true,  false, true,  true,  self::FORMAT_HLS_FMP4],
        'Kodi_18'         => [true,  true,  true,  false, false, false, self::FORMAT_HLS_TS],
        'Plex'            => [true,  true,  true,  false, true,  true,  self::FORMAT_HLS_FMP4],
        'Emby'            => [true,  true,  true,  false, false, true,  self::FORMAT_HLS_FMP4],
        'Jellyfin'        => [true,  true,  true,  false, false, true,  self::FORMAT_HLS_FMP4],
        'Infuse'          => [true,  false, true,  false, false, true,  self::FORMAT_HLS_FMP4],
        'Channels_DVR'    => [true,  false, true,  false, false, true,  self::FORMAT_HLS_FMP4],

        // ── Browsers / Web ────────────────────────────────────────────────────
        'Safari_iOS'      => [true,  false, true,  false, false, true,  self::FORMAT_HLS_FMP4],
        'Safari_macOS'    => [true,  false, true,  false, false, true,  self::FORMAT_HLS_FMP4],
        'Chrome'          => [true,  true,  false, false, true,  false, self::FORMAT_HLS_FMP4],
        'Firefox'         => [true,  true,  false, false, true,  false, self::FORMAT_HLS_FMP4],
        'ShakaPlayer'     => [true,  true,  true,  true,  true,  true,  self::FORMAT_DASH],
        'HLS_js'          => [true,  false, false, false, false, false, self::FORMAT_HLS_FMP4],
        'Video_js'        => [true,  true,  false, false, false, false, self::FORMAT_HLS_FMP4],

        // ── Desktop Players ───────────────────────────────────────────────────
        'VLC_3'           => [true,  true,  true,  false, true,  true,  self::FORMAT_HLS_FMP4],
        'VLC_2'           => [false, true,  false, false, false, false, self::FORMAT_HLS_TS],
        'MPV'             => [true,  true,  true,  false, true,  true,  self::FORMAT_HLS_FMP4],
        'MPC_HC'          => [false, false, false, false, false, false, self::FORMAT_TS_DIRECT],

        // ── STB / Smart TV ────────────────────────────────────────────────────
        'MAG_Old'         => [false, false, false, false, false, false, self::FORMAT_HLS_TS],
        'MAG_New'         => [true,  false, true,  false, false, false, self::FORMAT_HLS_FMP4],
        'Formuler'        => [true,  true,  true,  false, false, true,  self::FORMAT_HLS_FMP4],
        'Dreamlink'       => [true,  true,  true,  false, false, false, self::FORMAT_HLS_FMP4],
        'Samsung_Tizen'   => [true,  true,  true,  false, false, true,  self::FORMAT_HLS_FMP4],
        'LG_webOS'        => [true,  true,  true,  false, false, true,  self::FORMAT_HLS_FMP4],
        'Fire_TV'         => [true,  true,  true,  false, true,  true,  self::FORMAT_HLS_FMP4],
        'NVIDIA_SHIELD'   => [true,  true,  true,  false, true,  true,  self::FORMAT_HLS_FMP4],
        'Roku'            => [true,  false, false, false, false, false, self::FORMAT_HLS_TS],
        'Apple_TV'        => [true,  false, true,  false, false, true,  self::FORMAT_HLS_FMP4],

        // ── Fallback ──────────────────────────────────────────────────────────
        'Unknown'         => [false, false, false, false, false, false, self::FORMAT_HLS_TS],
    ];

    /**
     * Main entry point: resolve player capabilities from request context.
     */
    public static function detect($userAgent, $queryParams = []) { return self::resolve($userAgent, $queryParams); }
    public static function resolve(
        ?string $userAgent   = null,
        ?string $formatParam = null,
        array   $channelDna  = []
    ): array {
        $resolver = new self();
        return $resolver->runResolution($userAgent, $formatParam, $channelDna);
    }

    private function runResolution(?string $ua, ?string $formatParam, array $dna): array
    {
        // ── Step 1: Detect player from User-Agent ─────────────────────────────
        $playerId = $this->detectPlayerFromUserAgent($ua);

        // ── Step 2: Override player from X-APE-Player header ─────────────────
        $headerPlayer = $_SERVER['HTTP_X_APE_PLAYER'] ?? null;
        if ($headerPlayer && isset(self::$PLAYER_MATRIX[$headerPlayer])) {
            $playerId = $headerPlayer;
        }

        // ── Step 3: Get base capabilities from matrix ─────────────────────────
        $matrix = self::$PLAYER_MATRIX[$playerId] ?? self::$PLAYER_MATRIX[self::PLAYER_UNKNOWN];
        [$supportsFmp4, $supportsDash, $supportsHevc, $supportsLcevc, $supportsAv1, $supportsHdr10, $preferredFormat] = $matrix;

        // ── Step 4: LCEVC detection (3-source priority) ───────────────────────
        $lcevcHeader = $_SERVER['HTTP_X_APE_LCEVC_SUPPORT'] ?? null;
        $lcevcQuery  = $_GET['lcevc'] ?? null;
        if ($lcevcHeader === '1' || $lcevcHeader === 'true') {
            $supportsLcevc = true;
        } elseif ($lcevcQuery === '1' || $lcevcQuery === 'true') {
            $supportsLcevc = true;
        }

        // ── Step 5: Override format from ?format= query param ─────────────────
        if ($formatParam) {
            $preferredFormat = $this->resolveFormatFromParam($formatParam, $supportsFmp4, $supportsDash);
        }

        // ── Step 6: Codec override from ?codec= query param ──────────────────
        $codecParam = $_GET['codec'] ?? null;
        if ($codecParam === 'hevc' || $codecParam === 'h265') {
            $supportsHevc = true;
        } elseif ($codecParam === 'h264' || $codecParam === 'avc') {
            $supportsHevc = false;
        } elseif ($codecParam === 'av1') {
            $supportsAv1 = true;
        }

        // ── Step 7: Channel DNA overrides ─────────────────────────────────────
        // If channel requires LCEVC and player doesn't support it → TS fallback
        if (!empty($dna['lcevc_player_required']) && !$supportsLcevc) {
            $supportsFmp4    = false;
            $supportsDash    = false;
            $preferredFormat = self::FORMAT_TS_DIRECT;
        }

        // ── Step 8: Hydra Stealth mode ────────────────────────────────────────
        $hydraHeader = $_SERVER['HTTP_X_APE_HYDRA'] ?? null;
        $hydraMode   = ($hydraHeader === '1' || $hydraHeader === 'true');

        // ── Step 9: Build player profile for manifest generation ──────────────
        $playerProfile = $this->buildPlayerProfile($playerId, $supportsFmp4, $supportsDash, $supportsHevc);

        return [
            'player_id'        => $playerId,
            'supports_fmp4'    => $supportsFmp4,
            'supports_dash'    => $supportsDash,
            'supports_hevc'    => $supportsHevc,
            'supports_lcevc'   => $supportsLcevc,
            'supports_av1'     => $supportsAv1,
            'supports_hdr10'   => $supportsHdr10,
            'preferred_format' => $preferredFormat,
            'hydra_mode'       => $hydraMode,
            'player_profile'   => $playerProfile,
            'lcevc_source'     => $this->detectLcevcSource($lcevcHeader, $lcevcQuery, $supportsLcevc),
            'user_agent'       => $ua,
            'resolver_version' => self::RESOLVER_VERSION,
        ];
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // UNIVERSAL PLAYER DETECTION FROM USER-AGENT (35+ Players)
    // ═══════════════════════════════════════════════════════════════════════════

    private function detectPlayerFromUserAgent(?string $ua): string
    {
        if (empty($ua)) return self::PLAYER_UNKNOWN;
        $ua_lower = strtolower($ua);

        // ── Android IPTV Players ──────────────────────────────────────────────

        // TiviMate — must check before ExoPlayer (TiviMate uses ExoPlayer internally)
        if (str_contains($ua_lower, 'tivimate') || str_contains($ua_lower, 'tivi-mate') || str_contains($ua_lower, 'tivi_mate')) {
            return self::PLAYER_TIVIMATE;
        }

        // OTT Navigator
        if (str_contains($ua_lower, 'ott navigator') || str_contains($ua_lower, 'ott_navigator') ||
            str_contains($ua_lower, 'ottnavigator') || str_contains($ua_lower, 'ott-navigator')) {
            return self::PLAYER_OTT_NAV;
        }

        // IPTV Smarters (various versions: Pro, Lite, Plus)
        if (str_contains($ua_lower, 'iptv smarters') || str_contains($ua_lower, 'smarters') ||
            str_contains($ua_lower, 'iptv_smarters')) {
            return self::PLAYER_SMARTERS;
        }

        // GSE Smart IPTV
        if (str_contains($ua_lower, 'gse') || str_contains($ua_lower, 'gse smart')) {
            return self::PLAYER_GSE;
        }

        // Perfect Player
        if (str_contains($ua_lower, 'perfect player') || str_contains($ua_lower, 'perfectplayer') ||
            str_contains($ua_lower, 'perfect_player')) {
            return self::PLAYER_PERFECT;
        }

        // MX Player
        if (str_contains($ua_lower, 'mxplayer') || str_contains($ua_lower, 'mx player') ||
            str_contains($ua_lower, 'mx_player')) {
            return self::PLAYER_MX_PLAYER;
        }

        // IPTV Extreme
        if (str_contains($ua_lower, 'iptv extreme') || str_contains($ua_lower, 'iptvextreme')) {
            return self::PLAYER_IPTV_EXTREME;
        }

        // Sparkle TV
        if (str_contains($ua_lower, 'sparkle') || str_contains($ua_lower, 'sparkletv')) {
            return self::PLAYER_SPARKLE;
        }

        // Televizo
        if (str_contains($ua_lower, 'televizo')) {
            return self::PLAYER_TELEVIZO;
        }

        // Stremio
        if (str_contains($ua_lower, 'stremio')) {
            return self::PLAYER_STREMIO;
        }

        // ExoPlayer (generic — used by many Android apps)
        if (str_contains($ua_lower, 'exoplayer') || str_contains($ua_lower, 'exo-player')) {
            return self::PLAYER_EXOPLAYER;
        }

        // ── Kodi / Media Center ───────────────────────────────────────────────

        // Kodi — detect version to differentiate 18 vs 19+
        if (str_contains($ua_lower, 'kodi') || str_contains($ua_lower, 'xbmc')) {
            // Kodi 19+ (Matrix) UA contains "Kodi/19" or "Kodi/20" or "Kodi/21"
            if (preg_match('/kodi\/(1[9-9]|[2-9]\d)/i', $ua)) {
                return self::PLAYER_KODI_19;
            }
            return self::PLAYER_KODI_18;
        }

        // Plex
        if (str_contains($ua_lower, 'plex') || str_contains($ua_lower, 'plexmediaplayer')) {
            return self::PLAYER_PLEX;
        }

        // Emby
        if (str_contains($ua_lower, 'emby') || str_contains($ua_lower, 'emby theater')) {
            return self::PLAYER_EMBY;
        }

        // Jellyfin
        if (str_contains($ua_lower, 'jellyfin') || str_contains($ua_lower, 'jellyfin-media-player')) {
            return self::PLAYER_JELLYFIN;
        }

        // Infuse (iOS/tvOS)
        if (str_contains($ua_lower, 'infuse') || str_contains($ua_lower, 'firecore')) {
            return self::PLAYER_INFUSE;
        }

        // Channels DVR
        if (str_contains($ua_lower, 'channels') || str_contains($ua_lower, 'channels dvr')) {
            return self::PLAYER_CHANNELS_DVR;
        }

        // ── STB / Smart TV ────────────────────────────────────────────────────

        // MAG STB (Infomir) — old vs new
        if (str_contains($ua_lower, 'mag') || str_contains($ua_lower, 'stb')) {
            // MAG 322+ have newer firmware with fMP4 support
            if (preg_match('/mag\s*(32[2-9]|3[3-9]\d|[4-9]\d\d)/i', $ua)) {
                return self::PLAYER_MAG_NEW;
            }
            return self::PLAYER_MAG_OLD;
        }

        // Formuler
        if (str_contains($ua_lower, 'formuler') || str_contains($ua_lower, 'mytvonline')) {
            return self::PLAYER_FORMULER;
        }

        // Dreamlink
        if (str_contains($ua_lower, 'dreamlink') || str_contains($ua_lower, 'dream link')) {
            return self::PLAYER_DREAMLINK;
        }

        // Samsung Tizen (Smart TV)
        if (str_contains($ua_lower, 'tizen') || str_contains($ua_lower, 'samsung') ||
            str_contains($ua_lower, 'smarttv')) {
            return self::PLAYER_SAMSUNG;
        }

        // LG webOS (Smart TV)
        if (str_contains($ua_lower, 'webos') || str_contains($ua_lower, 'netcast') ||
            str_contains($ua_lower, 'lge')) {
            return self::PLAYER_LG;
        }

        // Fire TV / FireOS
        if (str_contains($ua_lower, 'fire tv') || str_contains($ua_lower, 'firetv') ||
            str_contains($ua_lower, 'afts') || str_contains($ua_lower, 'fireos') ||
            str_contains($ua_lower, 'silk')) {
            return self::PLAYER_FIRETV;
        }

        // NVIDIA SHIELD
        if (str_contains($ua_lower, 'shield') || str_contains($ua_lower, 'nvidia shield')) {
            return self::PLAYER_SHIELD;
        }

        // Roku
        if (str_contains($ua_lower, 'roku') || str_contains($ua_lower, 'rokuexpress')) {
            return self::PLAYER_ROKU;
        }

        // Apple TV (tvOS)
        if (str_contains($ua_lower, 'appletv') || str_contains($ua_lower, 'apple tv') ||
            str_contains($ua_lower, 'tvos')) {
            return self::PLAYER_APPLE_TV;
        }

        // ── Desktop Players ───────────────────────────────────────────────────

        // MPV
        if (str_contains($ua_lower, 'mpv') || str_contains($ua_lower, 'mpv-player')) {
            return self::PLAYER_MPV;
        }

        // MPC-HC / MPC-BE
        if (str_contains($ua_lower, 'mpc-hc') || str_contains($ua_lower, 'mpc-be') ||
            str_contains($ua_lower, 'media player classic')) {
            return self::PLAYER_MPCHC;
        }

        // VLC — detect version
        if (str_contains($ua_lower, 'vlc') || str_contains($ua_lower, 'libvlc')) {
            // VLC 3.x UA: "VLC/3.x.x" — fMP4 supported
            if (preg_match('/vlc\/(3|4)\./i', $ua)) {
                return self::PLAYER_VLC_3;
            }
            return self::PLAYER_VLC_2;
        }

        // ── Web Players ───────────────────────────────────────────────────────

        // Shaka Player (Google)
        if (str_contains($ua_lower, 'shaka') || str_contains($ua_lower, 'shaka-player')) {
            return self::PLAYER_SHAKA;
        }

        // HLS.js
        if (str_contains($ua_lower, 'hls.js') || str_contains($ua_lower, 'hlsjs')) {
            return self::PLAYER_HLSJS;
        }

        // Video.js
        if (str_contains($ua_lower, 'video.js') || str_contains($ua_lower, 'videojs')) {
            return self::PLAYER_VIDEOJS;
        }

        // Safari — must check before Chrome (Chrome UA contains "Safari")
        if (str_contains($ua_lower, 'safari') && !str_contains($ua_lower, 'chrome') &&
            !str_contains($ua_lower, 'chromium')) {
            // iOS Safari
            if (str_contains($ua_lower, 'iphone') || str_contains($ua_lower, 'ipad') ||
                str_contains($ua_lower, 'ipod')) {
                return self::PLAYER_SAFARI_IOS;
            }
            return self::PLAYER_SAFARI_MACOS;
        }

        // Chrome / Chromium
        if (str_contains($ua_lower, 'chrome') || str_contains($ua_lower, 'chromium') ||
            str_contains($ua_lower, 'crios')) {
            return self::PLAYER_CHROME;
        }

        // Firefox
        if (str_contains($ua_lower, 'firefox') || str_contains($ua_lower, 'gecko') ||
            str_contains($ua_lower, 'fxios')) {
            return self::PLAYER_FIREFOX;
        }

        // Android generic (likely ExoPlayer-based app)
        if (str_contains($ua_lower, 'android') && str_contains($ua_lower, 'okhttp')) {
            return self::PLAYER_EXOPLAYER;
        }

        return self::PLAYER_UNKNOWN;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FORMAT RESOLUTION WITH UNIVERSAL FALLBACK CHAIN
    // ═══════════════════════════════════════════════════════════════════════════

    private function resolveFormatFromParam(string $param, bool $supportsFmp4, bool $supportsDash): string
    {
        return match(strtolower($param)) {
            'cmaf', 'fmp4'      => $supportsFmp4   ? self::FORMAT_HLS_FMP4  : self::FORMAT_HLS_TS,
            'dash', 'mpd'       => $supportsDash   ? self::FORMAT_DASH      : ($supportsFmp4 ? self::FORMAT_HLS_FMP4 : self::FORMAT_HLS_TS),
            'hls', 'hls_fmp4'   => $supportsFmp4   ? self::FORMAT_HLS_FMP4  : self::FORMAT_HLS_TS,
            'hls_ts', 'ts'      => self::FORMAT_HLS_TS,
            'direct', 'raw'     => self::FORMAT_TS_DIRECT,
            default             => $supportsDash ? self::FORMAT_DASH : ($supportsFmp4 ? self::FORMAT_HLS_FMP4 : self::FORMAT_HLS_TS),
        };
    }

    /**
     * Build a player profile string for manifest generation decisions.
     * Used by the ApeOmniOrchestrator to decide which tags to include.
     */
    private function buildPlayerProfile(string $playerId, bool $fmp4, bool $dash, bool $hevc): string
    {
        if ($fmp4 && $dash && $hevc) return 'PREMIUM';   // Full CMAF + HEVC
        if ($fmp4 && $hevc)          return 'HIGH';      // fMP4 + HEVC, no DASH
        if ($fmp4)                   return 'STANDARD';  // fMP4 only
        if ($dash)                   return 'DASH_ONLY'; // DASH but no fMP4
        return 'MINIMAL';                                 // TS only (MINIMAL = LEGACY)
    }

    private function detectLcevcSource(?string $header, ?string $query, bool $matrixValue): string
    {
        if ($header === '1' || $header === 'true') return 'header';
        if ($query  === '1' || $query  === 'true') return 'query_param';
        if ($matrixValue) return 'player_matrix';
        return 'none';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // UNIVERSAL MANIFEST URL SELECTOR — 5-step fallback chain
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Selects the best manifest URL from available manifests based on player capability.
     * Implements a 5-step graceful degradation chain.
     *
     * @param array $playerCapability  Result from resolve().
     * @param array $manifests         Map of format => URL.
     * @return string                  Best manifest URL.
     */
    public static function selectManifestUrl(array $playerCapability, array $manifests): string
    {
        $preferred = $playerCapability['preferred_format'];

        // Step 1: Try preferred format
        if (!empty($manifests[$preferred])) {
            return $manifests[$preferred];
        }

        // Step 2: DASH fallback (if player supports it)
        if ($playerCapability['supports_dash'] && !empty($manifests[self::FORMAT_DASH])) {
            return $manifests[self::FORMAT_DASH];
        }

        // Step 3: HLS fMP4 fallback (if player supports it)
        if ($playerCapability['supports_fmp4'] && !empty($manifests[self::FORMAT_HLS_FMP4])) {
            return $manifests[self::FORMAT_HLS_FMP4];
        }

        // Step 4: HLS TS fallback (universal compatibility)
        if (!empty($manifests[self::FORMAT_HLS_TS])) {
            return $manifests[self::FORMAT_HLS_TS];
        }
        if (!empty($manifests['hls'])) {
            return $manifests['hls'];
        }

        // Step 5: TS Direct (last resort — works on any STB/player)
        if (!empty($manifests[self::FORMAT_TS_DIRECT])) {
            return $manifests[self::FORMAT_TS_DIRECT];
        }

        // Absolute last resort: return first available URL
        return reset($manifests) ?: '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STATIC HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Returns the full player matrix for inspection/debugging.
     */
    public static function getPlayerMatrix(): array
    {
        $result = [];
        foreach (self::$PLAYER_MATRIX as $playerId => $caps) {
            $result[$playerId] = [
                'supports_fmp4'    => $caps[0],
                'supports_dash'    => $caps[1],
                'supports_hevc'    => $caps[2],
                'supports_lcevc'   => $caps[3],
                'supports_av1'     => $caps[4],
                'supports_hdr10'   => $caps[5],
                'preferred_format' => $caps[6],
            ];
        }
        return $result;
    }

    /**
     * Returns the total number of players in the matrix.
     */
    public static function getPlayerCount(): int
    {
        return count(self::$PLAYER_MATRIX);
    }

    /**
     * Returns whether a given player ID supports LCEVC per the formal matrix.
     */
    public static function playerSupportsLcevc(string $playerId): bool
    {
        return self::$PLAYER_MATRIX[$playerId][3] ?? false;
    }

    /**
     * Returns whether a given player ID supports HEVC per the formal matrix.
     */
    public static function playerSupportsHevc(string $playerId): bool
    {
        return self::$PLAYER_MATRIX[$playerId][2] ?? false;
    }

    /**
     * Returns the preferred format for a given player ID.
     */
    public static function getPreferredFormat(string $playerId): string
    {
        return self::$PLAYER_MATRIX[$playerId][6] ?? self::FORMAT_HLS_TS;
    }
}
