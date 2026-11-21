<?php
declare(strict_types=1);
/**
 * IPTV Navigator PRO — Universal Compatibility Layer
 * Module: ApeOmniOrchestrator v1.0.0
 *
 * FUNCIÓN: Reordena las líneas de un manifiesto M3U8 en 8 capas lógicas
 * para garantizar compatibilidad universal con cualquier player del mundo.
 *
 * ORDEN RFC 8216 ESTRICTO (por entrada de canal):
 *   Capa 1: #EXTINF         — Duración y metadatos del canal
 *   Capa 2: #EXTVLCOPT      — Directivas VLC (proxy, user-agent, etc.)
 *   Capa 3: #EXTHTTP        — Headers HTTP en JSON (TiviMate, ExoPlayer)
 *   Capa 4: #EXT-X-APE-*   — Headers APE (calidad, LCEVC, HDR, etc.)
 *   Capa 5: #KODIPROP       — Propiedades Kodi (inputstream, DRM)
 *   Capa 6: #EXTATTRFROMURL — Atributos desde URL (OTT Navigator)
 *   Capa 7: #EXT-X-STREAM-INF — Variante de stream (ABR, resolución)
 *   Capa 8: URL             — URL del stream (SIEMPRE la última línea)
 *
 * HYDRA STEALTH: Si está activo, ofusca #EXT-X-APE-* → #EXT-X-SYS-*
 * para evadir DPI de ISP y reproductores que rechazan tags desconocidos.
 *
 * PLAYER-AWARE: Omite tags incompatibles según el perfil del player.
 *   - LEGACY players (MAG old, Roku, MPC-HC): solo URL + EXTINF
 *   - STANDARD players: EXTINF + EXTHTTP + URL
 *   - HIGH/PREMIUM players: todas las capas
 */

class ApeOmniOrchestrator
{
    const ORCHESTRATOR_VERSION = '1.0.0';

    // Player profile constants (from PlayerCapabilityResolver)
    const PROFILE_PREMIUM  = 'PREMIUM';
    const PROFILE_HIGH     = 'HIGH';
    const PROFILE_STANDARD = 'STANDARD';
    const PROFILE_DASH_ONLY = 'DASH_ONLY';
    const PROFILE_LEGACY   = 'LEGACY';

    /**
     * Process and reorder M3U8 lines for a single channel entry.
     *
     * @param array  $rawLines     Array of raw M3U8 lines for one channel.
     * @param string $playerProfile Player profile (PREMIUM/HIGH/STANDARD/LEGACY).
     * @param bool   $hydraMode    If true, obfuscate #EXT-X-APE- tags.
     * @return string              Reordered M3U8 block for this channel.
     */
    public static function processChannel(
        array  $rawLines,
        string $playerProfile = self::PROFILE_STANDARD,
        bool   $hydraMode = false
    ): string {
        // ── Layer buckets ──────────────────────────────────────────────────────
        $extInf      = [];  // Layer 1: #EXTINF
        $vlcLayer    = [];  // Layer 2: #EXTVLCOPT
        $jsonLayer   = [];  // Layer 3: #EXTHTTP
        $apeLayer    = [];  // Layer 4: #EXT-X-APE-*
        $kodiLayer   = [];  // Layer 5: #KODIPROP
        $attrLayer   = [];  // Layer 6: #EXTATTRFROMURL
        $streamInf   = [];  // Layer 7: #EXT-X-STREAM-INF
        $urls        = [];  // Layer 8: URLs
        $othersLayer = [];  // Other tags (preserved but appended after APE)

        // ── Classify each line into its layer ─────────────────────────────────
        foreach ($rawLines as $line) {
            $line = rtrim($line);
            if (empty($line)) continue;

            if (str_starts_with($line, '#EXTINF'))           $extInf[]    = $line;
            elseif (str_starts_with($line, '#EXTVLCOPT'))    $vlcLayer[]  = $line;
            elseif (str_starts_with($line, '#EXTHTTP'))      $jsonLayer[] = $line;
            elseif (str_starts_with($line, '#EXT-X-APE') ||
                    str_starts_with($line, '#EXT-X-SYS'))    $apeLayer[]  = $line;
            elseif (str_starts_with($line, '#KODIPROP'))     $kodiLayer[] = $line;
            elseif (str_starts_with($line, '#EXTATTRFROMURL')) $attrLayer[] = $line;
            elseif (str_starts_with($line, '#EXT-X-STREAM-INF')) $streamInf[] = $line;
            elseif (str_starts_with($line, 'http') ||
                    str_starts_with($line, 'rtmp') ||
                    str_starts_with($line, 'rtsp') ||
                    str_starts_with($line, 'udp')  ||
                    str_starts_with($line, 'rtp'))            $urls[]      = $line;
            elseif (str_starts_with($line, '#'))              $othersLayer[] = $line;
            // Non-# non-URL lines are silently dropped (malformed)
        }

        // ── Apply Hydra Stealth obfuscation ───────────────────────────────────
        if ($hydraMode) {
            $apeLayer = array_map(
                fn($l) => str_replace('#EXT-X-APE-', '#EXT-X-SYS-', $l),
                $apeLayer
            );
        }

        // ── Filter layers based on player profile ─────────────────────────────
        $filteredVlc   = $vlcLayer;
        $filteredJson  = $jsonLayer;
        $filteredApe   = $apeLayer;
        $filteredKodi  = $kodiLayer;
        $filteredAttr  = $attrLayer;
        $filteredStream = $streamInf;

        switch ($playerProfile) {
            case self::PROFILE_LEGACY:
                // Legacy players (MAG old, Roku, MPC-HC): minimal tags only
                // Keep EXTINF + EXTHTTP (basic UA) + URL
                // Drop: EXTVLCOPT, APE, KODIPROP, EXTATTRFROMURL, STREAM-INF
                $filteredVlc    = [];
                $filteredApe    = [];
                $filteredKodi   = [];
                $filteredAttr   = [];
                $filteredStream = [];
                // Keep only User-Agent from EXTHTTP
                $filteredJson = self::filterExtHttpForLegacy($jsonLayer);
                break;

            case self::PROFILE_STANDARD:
                // Standard players: EXTINF + EXTVLCOPT + EXTHTTP + URL
                // Drop: APE (unknown tags crash some players), STREAM-INF
                $filteredApe    = [];
                $filteredStream = [];
                break;

            case self::PROFILE_DASH_ONLY:
                // DASH-only players: minimal HLS wrapper
                $filteredVlc    = [];
                $filteredApe    = [];
                $filteredKodi   = [];
                $filteredStream = [];
                break;

            case self::PROFILE_HIGH:
            case self::PROFILE_PREMIUM:
            default:
                // Full output: all layers
                break;
        }

        // ── Assemble in strict RFC 8216 order ─────────────────────────────────
        $assembled = array_merge(
            $extInf,         // Layer 1: #EXTINF (MUST be first)
            $filteredVlc,    // Layer 2: #EXTVLCOPT
            $filteredJson,   // Layer 3: #EXTHTTP
            $filteredApe,    // Layer 4: #EXT-X-APE-* / #EXT-X-SYS-*
            $filteredKodi,   // Layer 5: #KODIPROP
            $filteredAttr,   // Layer 6: #EXTATTRFROMURL
            $othersLayer,    // Other tags
            $filteredStream, // Layer 7: #EXT-X-STREAM-INF (MUST be just before URL)
            $urls            // Layer 8: URL (MUST be last)
        );

        return implode("\n", $assembled);
    }

    /**
     * Process a full M3U8 playlist string.
     * Splits into channel blocks, processes each, and reassembles.
     *
     * @param string $m3u8Content    Full M3U8 playlist content.
     * @param string $playerProfile  Player profile.
     * @param bool   $hydraMode      Hydra Stealth mode.
     * @return string                Processed M3U8 playlist.
     */
    public static function processPlaylist(
        string $m3u8Content,
        string $playerProfile = self::PROFILE_STANDARD,
        bool   $hydraMode = false
    ): string {
        $lines = explode("\n", $m3u8Content);
        $output = [];
        $channelBuffer = [];
        $headerLines = [];
        $inHeader = true;

        foreach ($lines as $line) {
            $line = rtrim($line);

            // Collect global header lines (before first #EXTINF)
            if ($inHeader) {
                if (str_starts_with($line, '#EXTINF')) {
                    $inHeader = false;
                    $channelBuffer[] = $line;
                } else {
                    $headerLines[] = $line;
                }
                continue;
            }

            // When we hit a new #EXTINF, flush the previous channel buffer
            if (str_starts_with($line, '#EXTINF') && !empty($channelBuffer)) {
                $output[] = self::processChannel($channelBuffer, $playerProfile, $hydraMode);
                $output[] = ''; // blank line between channels
                $channelBuffer = [];
            }

            $channelBuffer[] = $line;
        }

        // Flush last channel buffer
        if (!empty($channelBuffer)) {
            $output[] = self::processChannel($channelBuffer, $playerProfile, $hydraMode);
        }

        // Apply Hydra Stealth to global header if needed
        $headerContent = implode("\n", $headerLines);
        if ($hydraMode) {
            $headerContent = str_replace('#EXT-X-APE-', '#EXT-X-SYS-', $headerContent);
        }

        return $headerContent . "\n\n" . implode("\n", $output);
    }

    /**
     * Filter #EXTHTTP for legacy players: keep only User-Agent header.
     */
    private static function filterExtHttpForLegacy(array $jsonLines): array
    {
        $result = [];
        foreach ($jsonLines as $line) {
            // Extract JSON from #EXTHTTP:{...}
            if (preg_match('/^#EXTHTTP:(\{.+\})$/', $line, $m)) {
                $headers = json_decode($m[1], true);
                if (is_array($headers)) {
                    // Keep only User-Agent for legacy players
                    $filtered = [];
                    if (!empty($headers['User-Agent'])) {
                        $filtered['User-Agent'] = $headers['User-Agent'];
                    }
                    if (!empty($filtered)) {
                        $result[] = '#EXTHTTP:' . json_encode($filtered, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
                    }
                }
            }
        }
        return $result;
    }

    /**
     * Validate a processed M3U8 block for RFC 8216 compliance.
     * Returns an array of validation errors (empty = valid).
     */
    public static function validateBlock(string $block): array
    {
        $errors = [];
        $lines = array_filter(explode("\n", $block), fn($l) => !empty(trim($l)));
        $lineArr = array_values($lines);

        if (empty($lineArr)) {
            $errors[] = 'Empty block';
            return $errors;
        }

        // Rule 1: First line must be #EXTINF
        if (!str_starts_with($lineArr[0], '#EXTINF')) {
            $errors[] = "First line must be #EXTINF, got: {$lineArr[0]}";
        }

        // Rule 2: Last line must be a URL
        $lastLine = end($lineArr);
        if (!preg_match('/^(https?|rtmp|rtsp|udp|rtp):\/\//', $lastLine)) {
            $errors[] = "Last line must be a URL, got: {$lastLine}";
        }

        // Rule 3: #EXT-X-STREAM-INF must be immediately before URL
        $streamInfIdx = null;
        foreach ($lineArr as $idx => $l) {
            if (str_starts_with($l, '#EXT-X-STREAM-INF')) {
                $streamInfIdx = $idx;
            }
        }
        if ($streamInfIdx !== null) {
            $urlIdx = count($lineArr) - 1;
            if ($streamInfIdx !== $urlIdx - 1) {
                $errors[] = "#EXT-X-STREAM-INF must be immediately before URL (found at position {$streamInfIdx}, URL at {$urlIdx})";
            }
        }

        // Rule 4: No duplicate #EXTINF
        $extinf_count = count(array_filter($lineArr, fn($l) => str_starts_with($l, '#EXTINF')));
        if ($extinf_count > 1) {
            $errors[] = "Multiple #EXTINF tags found ({$extinf_count})";
        }

        return $errors;
    }
}
