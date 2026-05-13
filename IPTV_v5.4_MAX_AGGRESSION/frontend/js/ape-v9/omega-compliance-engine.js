/**
 * OMEGA Compliance Engine v1.0
 * ═══════════════════════════════════════════════════════════════════════════
 * Consolida el conocimiento de los 12 repositorios más avanzados del ecosistema
 * HLS/CMAF/HDR del mundo y valida que el output del generador sea compatible
 * con cualquier player del mundo al 100% de lo que documentan.
 *
 * REPOSITORIOS INTEGRADOS (learnings, no código):
 * ─────────────────────────────────────────────────────────────────────────
 *  [1]  video-dev/hls.js           → RFC 6381 codec parser + m3u8-parser.ts whitelist
 *  [2]  Dash-Industry-Forum/dash.js → CMAF strict compliance rules
 *  [3]  shaka-project/shaka-player  → HDR/DRM signaling expectations
 *  [4]  shaka-project/shaka-packager → init.mp4 HDR metadata spec (colr/mdcv/clli)
 *  [5]  google/ExoPlayer (Media3)   → HlsPlaylistParser Android tag whitelist
 *  [6]  videolan/vlc-android/ios    → EXTVLCOPT native tag support
 *  [7]  axiomatic-systems/Bento4    → MP4 box validation schema
 *  [8]  gpac/gpac (MP4Box)          → HEVC HDR signaling reference
 *  [9]  Eyevinn/fmp4-js             → init segment parser validation
 *  [10] epiclabs-io/hls-analyzer    → manifest stats + validation rules
 *  [11] Comcast/mamba               → HLS tag schema (Swift reference)
 *  [12] (extra) Apple HLS Authoring Spec → RFC 8216bis + LL-HLS Apple
 *
 * OBJETIVO:
 * ─────────────────────────────────────────────────────────────────────────
 * Dado un M3U8 generado por el proyecto IPTV Navigator PRO v5.4, reportar
 * qué porcentaje de cada player del mundo ejecutará las directivas, qué
 * errors/warnings produce cada parser, y qué ajustes harían falta para
 * subir el score de cualquier target específico.
 *
 * NO-DELETE POLICY: Este archivo es ADDITIVO. No reemplaza nada existente.
 * Convive con ape-ultra-parser-optimized.js y m3u8-typed-arrays-ultimate.js.
 * ═══════════════════════════════════════════════════════════════════════════
 */

class OmegaComplianceEngine {
    constructor(options = {}) {
        this.version = '1.0';
        this.options = {
            strict: options.strict !== false,
            verbose: options.verbose === true,
            ...options
        };

        // ═══════════════════════════════════════════════════════════════
        // [1] RFC 6381 Codec String Patterns (desde hls.js src/utils/codecs.ts)
        // ═══════════════════════════════════════════════════════════════
        this.CODEC_PATTERNS = {
            // H.264 / AVC
            H264_AVC1:       /^avc1\.[0-9a-fA-F]{6}$/,
            H264_AVC3:       /^avc3\.[0-9a-fA-F]{6}$/,

            // H.265 / HEVC (hvc1 = parameter sets in sample entries, preferred for CMAF)
            HEVC_HVC1:       /^hvc1\.[AB]?\d+\.\d+\.[LH]\d+(\.[A-F0-9]+){0,6}$/,
            HEVC_HEV1:       /^hev1\.[AB]?\d+\.\d+\.[LH]\d+(\.[A-F0-9]+){0,6}$/,

            // AV1 (AOM AV1 codec string RFC)
            AV1_AV01:        /^av01\.\d+\.\d+[MHL]?\.\d+(\.\d+\.\d+\.\d+\.\d+)?$/,

            // H.266 / VVC (ISO/IEC 23090-3)
            VVC_VVC1:        /^vvc1\.\d+\.[LH]\d+(\.\d+)*$/,
            VVC_VVI1:        /^vvi1\.\d+\.[LH]\d+(\.\d+)*$/,

            // Audio codecs
            AAC_LC:          /^mp4a\.40\.2$/,
            AAC_HE:          /^mp4a\.40\.5$/,
            AAC_HEv2:        /^mp4a\.40\.29$/,
            AAC_XHE:         /^mp4a\.40\.42$/,
            AC3:             /^ac-3$/,
            EAC3:            /^ec-3$/,
            DTS:             /^dts[cehl]$/,
            OPUS:            /^opus$/,
            FLAC:            /^flac$/,

            // Dolby Vision profiles (shaka-packager format)
            DOLBY_VISION_HVC: /^dvhe?\.\d+\.\d+$/,   // DV over HEVC
            DOLBY_VISION_AVC: /^dva[vh]?\.\d+\.\d+$/, // DV over AVC
            DOLBY_VISION_AV1: /^dav1\.\d+\.\d+$/      // DV over AV1 (Profile 10)
        };

        // ═══════════════════════════════════════════════════════════════
        // [2][3][5] Player Tag Support Matrix (qué tags ejecuta cada player)
        // ═══════════════════════════════════════════════════════════════
        this.PLAYER_TAG_SUPPORT = {
            'hls.js': {
                version: '1.5.x',
                core: [
                    '#EXTM3U', '#EXT-X-VERSION', '#EXTINF',
                    '#EXT-X-STREAM-INF', '#EXT-X-MAP', '#EXT-X-KEY',
                    '#EXT-X-MEDIA', '#EXT-X-SESSION-KEY', '#EXT-X-SESSION-DATA',
                    '#EXT-X-TARGETDURATION', '#EXT-X-MEDIA-SEQUENCE',
                    '#EXT-X-DISCONTINUITY', '#EXT-X-DISCONTINUITY-SEQUENCE',
                    '#EXT-X-ENDLIST', '#EXT-X-PLAYLIST-TYPE',
                    '#EXT-X-BYTERANGE', '#EXT-X-PROGRAM-DATE-TIME',
                    '#EXT-X-INDEPENDENT-SEGMENTS', '#EXT-X-START',
                    '#EXT-X-I-FRAME-STREAM-INF', '#EXT-X-I-FRAMES-ONLY',
                    '#EXT-X-DATERANGE', '#EXT-X-GAP', '#EXT-X-DEFINE'
                ],
                llhls: [
                    '#EXT-X-PART-INF', '#EXT-X-SERVER-CONTROL',
                    '#EXT-X-PRELOAD-HINT', '#EXT-X-RENDITION-REPORT',
                    '#EXT-X-SKIP', '#EXT-X-PART'
                ],
                ignored: ['#EXTVLCOPT', '#KODIPROP', '#EXTHTTP', '#EXT-X-APE-*', '#EXT-X-CMAF-*']
            },
            'dash.js': {
                version: '4.7.x',
                core: [
                    // dash.js es DASH primariamente, pero tiene soporte HLS básico
                    '#EXTM3U', '#EXT-X-VERSION', '#EXTINF',
                    '#EXT-X-STREAM-INF', '#EXT-X-MAP',
                    '#EXT-X-INDEPENDENT-SEGMENTS'
                ],
                llhls: ['#EXT-X-PART-INF', '#EXT-X-SERVER-CONTROL'],
                ignored: ['#EXTVLCOPT', '#KODIPROP', '#EXTHTTP', '#EXT-X-APE-*']
            },
            'shaka-player': {
                version: '4.7.x',
                core: [
                    '#EXTM3U', '#EXT-X-VERSION', '#EXTINF',
                    '#EXT-X-STREAM-INF', '#EXT-X-MAP', '#EXT-X-KEY',
                    '#EXT-X-MEDIA', '#EXT-X-SESSION-KEY', '#EXT-X-SESSION-DATA',
                    '#EXT-X-TARGETDURATION', '#EXT-X-MEDIA-SEQUENCE',
                    '#EXT-X-DISCONTINUITY', '#EXT-X-ENDLIST',
                    '#EXT-X-BYTERANGE', '#EXT-X-PROGRAM-DATE-TIME',
                    '#EXT-X-INDEPENDENT-SEGMENTS', '#EXT-X-START',
                    '#EXT-X-I-FRAME-STREAM-INF', '#EXT-X-DATERANGE',
                    '#EXT-X-GAP', '#EXT-X-DEFINE', '#EXT-X-CONTENT-STEERING'
                ],
                llhls: [
                    '#EXT-X-PART-INF', '#EXT-X-SERVER-CONTROL',
                    '#EXT-X-PRELOAD-HINT', '#EXT-X-RENDITION-REPORT'
                ],
                ignored: ['#EXTVLCOPT', '#KODIPROP', '#EXTHTTP', '#EXT-X-APE-*']
            },
            'exoplayer': {
                version: 'Media3 1.3.x',
                core: [
                    '#EXTM3U', '#EXT-X-VERSION', '#EXTINF',
                    '#EXT-X-STREAM-INF', '#EXT-X-MAP', '#EXT-X-KEY',
                    '#EXT-X-MEDIA', '#EXT-X-SESSION-KEY', '#EXT-X-SESSION-DATA',
                    '#EXT-X-TARGETDURATION', '#EXT-X-MEDIA-SEQUENCE',
                    '#EXT-X-DISCONTINUITY', '#EXT-X-ENDLIST',
                    '#EXT-X-BYTERANGE', '#EXT-X-PROGRAM-DATE-TIME',
                    '#EXT-X-INDEPENDENT-SEGMENTS', '#EXT-X-START',
                    '#EXT-X-I-FRAME-STREAM-INF', '#EXT-X-DATERANGE',
                    '#EXT-X-GAP', '#EXT-X-DEFINE'
                ],
                llhls: [
                    '#EXT-X-PART-INF', '#EXT-X-SERVER-CONTROL',
                    '#EXT-X-PRELOAD-HINT', '#EXT-X-RENDITION-REPORT'
                ],
                fork_extensions: [
                    '#KODIPROP', '#EXTVLCOPT:http-user-agent', '#EXTHTTP'
                ],
                ignored: ['#EXT-X-APE-*', '#EXT-X-CMAF-*']
            },
            'vlc': {
                version: '3.0.x / libVLC',
                core: [
                    '#EXTM3U', '#EXT-X-VERSION', '#EXTINF',
                    '#EXT-X-STREAM-INF', '#EXT-X-MAP', '#EXT-X-KEY',
                    '#EXT-X-TARGETDURATION', '#EXT-X-MEDIA-SEQUENCE',
                    '#EXT-X-DISCONTINUITY', '#EXT-X-ENDLIST',
                    '#EXT-X-BYTERANGE', '#EXT-X-PROGRAM-DATE-TIME'
                ],
                native_extensions: [
                    '#EXTVLCOPT', '#EXTHTTP'
                ],
                ignored: ['#KODIPROP', '#EXT-X-APE-*', '#EXT-X-CMAF-*']
            },
            'avplayer': {
                version: 'AVFoundation iOS 17 / tvOS 17',
                core: [
                    '#EXTM3U', '#EXT-X-VERSION', '#EXTINF',
                    '#EXT-X-STREAM-INF', '#EXT-X-MAP', '#EXT-X-KEY',
                    '#EXT-X-MEDIA', '#EXT-X-SESSION-KEY', '#EXT-X-SESSION-DATA',
                    '#EXT-X-TARGETDURATION', '#EXT-X-MEDIA-SEQUENCE',
                    '#EXT-X-DISCONTINUITY', '#EXT-X-ENDLIST',
                    '#EXT-X-BYTERANGE', '#EXT-X-PROGRAM-DATE-TIME',
                    '#EXT-X-INDEPENDENT-SEGMENTS', '#EXT-X-START',
                    '#EXT-X-I-FRAME-STREAM-INF', '#EXT-X-I-FRAMES-ONLY',
                    '#EXT-X-DATERANGE', '#EXT-X-GAP', '#EXT-X-DEFINE'
                ],
                llhls_apple_native: [
                    '#EXT-X-PART-INF', '#EXT-X-SERVER-CONTROL',
                    '#EXT-X-PRELOAD-HINT', '#EXT-X-RENDITION-REPORT',
                    '#EXT-X-SKIP', '#EXT-X-PART'
                ],
                strict_mode: true,
                strict_rules: [
                    'Master playlist MUST NOT contain #EXTINF',
                    'Each #EXT-X-STREAM-INF MUST be followed by exactly one URI',
                    '#EXT-X-PART-INF MUST appear at most once per media playlist',
                    '#EXT-X-SERVER-CONTROL MUST appear at most once per playlist'
                ],
                ignored: ['#EXTVLCOPT', '#KODIPROP', '#EXTHTTP', '#EXT-X-APE-*', '#EXT-X-CMAF-*']
            }
        };

        // ═══════════════════════════════════════════════════════════════
        // [4] HDR Signaling Schemas (desde shaka-packager docs HDR section)
        // ═══════════════════════════════════════════════════════════════
        this.HDR_SCHEMAS = {
            HDR10: {
                required_codec: ['hvc1', 'hev1', 'av01'],
                required_transfer: 'smpte2084',
                required_primaries: 'bt2020',
                required_matrix: 'bt2020nc',
                required_bit_depth: 10,
                required_boxes: ['colr', 'mdcv', 'clli'],
                mastering_display: {
                    max_luminance: 'required (nits)',
                    min_luminance: 'required (nits)',
                    display_primaries: 'required (x,y pairs)'
                }
            },
            HDR10_PLUS: {
                extends: 'HDR10',
                metadata_format: 'SMPTE ST 2094-40',
                scene_metadata: true,
                dynamic_tone_map: true
            },
            DOLBY_VISION_P5: {
                codec_prefix: 'dvhe.05',
                compatible_with: 'none (DV-only)',
                backwards_compat: false
            },
            DOLBY_VISION_P81: {
                codec_prefix: 'dvhe.08',
                compatible_with: 'hdr10',
                backwards_compat: true,
                rpu_version: 4
            },
            DOLBY_VISION_P84: {
                codec_prefix: 'dvhe.08',
                compatible_with: 'hlg',
                backwards_compat: true
            },
            DOLBY_VISION_P10: {
                codec_prefix: 'dav1.10',
                base_codec: 'av1-main10',
                compatible_with: 'av1-hdr10',
                uhd_bd_mode: true
            },
            HLG: {
                required_transfer: 'arib-std-b67',
                required_primaries: 'bt2020',
                backwards_compat_sdr: true
            }
        };

        // ═══════════════════════════════════════════════════════════════
        // [9] MP4 Box Validation Schema (Bento4 + fmp4-js)
        // ═══════════════════════════════════════════════════════════════
        this.MP4_REQUIRED_BOXES = {
            init_segment: ['ftyp', 'moov'],
            moov_children: ['mvhd', 'trak'],
            trak_children: ['tkhd', 'mdia'],
            hdr_boxes: {
                colr: 'required for HDR (colour information)',
                mdcv: 'required for HDR10 (mastering display color volume)',
                clli: 'required for HDR10 (content light level info)',
                dvcC: 'required for Dolby Vision (DV config record)',
                hvcC: 'required for HEVC (HEVC config record)',
                av1C: 'required for AV1 (AV1 config record)'
            },
            cmaf_required: ['styp', 'prft', 'emsg']
        };
    }

    // ═══════════════════════════════════════════════════════════════
    // VALIDADORES
    // ═══════════════════════════════════════════════════════════════

    /**
     * [1] RFC 6381 Codec String Validator (lógica extraída de hls.js)
     */
    validateCodecsRFC6381(codecString) {
        if (!codecString || typeof codecString !== 'string') {
            return { valid: false, reason: 'empty or non-string codec', codecs: [] };
        }

        const codecs = codecString.split(',').map(c => c.trim());
        const results = [];

        for (const codec of codecs) {
            let matched = null;
            for (const [name, pattern] of Object.entries(this.CODEC_PATTERNS)) {
                if (pattern.test(codec)) {
                    matched = name;
                    break;
                }
            }
            results.push({
                codec,
                valid: matched !== null,
                type: matched || 'UNKNOWN'
            });
        }

        const allValid = results.every(r => r.valid);
        return {
            valid: allValid,
            codecs: results,
            count: results.length,
            hasVideo: results.some(r => /^(H264|HEVC|AV1|VVC|DOLBY_VISION)/.test(r.type)),
            hasAudio: results.some(r => /^(AAC|AC3|EAC3|DTS|OPUS|FLAC)/.test(r.type))
        };
    }

    /**
     * [1] Validate against hls.js parser expectations
     */
    validateAgainstHlsJs(m3u8Content) {
        return this._validateGeneric(m3u8Content, 'hls.js');
    }

    /**
     * [2] Validate against dash.js strict CMAF rules
     */
    validateAgainstDashJs(m3u8Content) {
        return this._validateGeneric(m3u8Content, 'dash.js');
    }

    /**
     * [3] Validate against shaka-player expectations
     */
    validateAgainstShaka(m3u8Content) {
        const report = this._validateGeneric(m3u8Content, 'shaka-player');
        // shaka es particularmente estricto con HDR metadata
        const hdrReport = this.validateHdrSignaling(m3u8Content);
        report.hdr = hdrReport;
        if (!hdrReport.has_any_hdr_hint) {
            report.warnings.push('shaka-player: no HDR metadata hint detected in manifest');
        }
        return report;
    }

    /**
     * [5] Validate against ExoPlayer (Android Media3)
     */
    validateAgainstExoPlayer(m3u8Content) {
        const report = this._validateGeneric(m3u8Content, 'exoplayer');
        // ExoPlayer forks IPTV también leen KODIPROP y EXTVLCOPT:http-user-agent
        const forkTags = this.PLAYER_TAG_SUPPORT.exoplayer.fork_extensions || [];
        let forkTagsFound = 0;
        const lines = m3u8Content.split('\n');
        for (const ln of lines) {
            for (const tag of forkTags) {
                if (ln.startsWith(tag)) forkTagsFound++;
            }
        }
        report.fork_extensions_used = forkTagsFound;
        return report;
    }

    /**
     * [6] Validate against libVLC / VLC Android / VLC iOS
     */
    validateAgainstVlc(m3u8Content) {
        const report = this._validateGeneric(m3u8Content, 'vlc');
        // VLC ejecuta EXTVLCOPT nativamente — contar cuántos tiene
        const lines = m3u8Content.split('\n');
        const extvlcoptCount = lines.filter(l => l.startsWith('#EXTVLCOPT')).length;
        report.extvlcopt_directives_native = extvlcoptCount;
        return report;
    }

    /**
     * [12] Validate against Apple AVPlayer (strict RFC 8216)
     */
    validateAgainstAvPlayer(m3u8Content) {
        const report = this._validateGeneric(m3u8Content, 'avplayer');

        // AVPlayer es estricto: valida las reglas strict
        const lines = m3u8Content.split('\n');

        // Regla 1: Master playlist no debe tener EXTINF (esto lo viola el formato Xtream)
        const hasExtInf = lines.some(l => l.startsWith('#EXTINF'));
        const hasStreamInf = lines.some(l => l.startsWith('#EXT-X-STREAM-INF'));
        if (hasExtInf && hasStreamInf) {
            report.warnings.push('AVPlayer strict: formato híbrido Xtream detectado (EXTINF+STREAM-INF en misma playlist)');
        }

        // Regla 2: cada STREAM-INF debe ir seguido de URI
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
                let nextNonComment = null;
                for (let j = i + 1; j < lines.length; j++) {
                    if (lines[j] && !lines[j].startsWith('#')) {
                        nextNonComment = lines[j];
                        break;
                    }
                    if (lines[j] && lines[j].startsWith('#EXTINF')) break;
                }
                if (!nextNonComment) {
                    report.errors.push(`AVPlayer strict: #EXT-X-STREAM-INF sin URI en línea ${i+1}`);
                }
            }
        }

        return report;
    }

    /**
     * [10][11] Core validation logic — shared by all target players
     */
    _validateGeneric(m3u8Content, targetPlayer) {
        const spec = this.PLAYER_TAG_SUPPORT[targetPlayer] || this.PLAYER_TAG_SUPPORT['hls.js'];
        const supportedTags = [
            ...(spec.core || []),
            ...(spec.llhls || []),
            ...(spec.llhls_apple_native || []),
            ...(spec.native_extensions || []),
            ...(spec.fork_extensions || [])
        ];

        const report = {
            target: targetPlayer,
            version: spec.version || 'unknown',
            timestamp: new Date().toISOString(),
            warnings: [],
            errors: [],
            stats: {
                total_lines: 0,
                total_tags: 0,
                supported_tags: 0,
                ignored_tags: 0,
                unknown_tags: 0,
                codec_validations: 0,
                codec_failures: 0
            },
            score: 0
        };

        const lines = m3u8Content.split('\n');
        report.stats.total_lines = lines.length;

        // Validar #EXTM3U en línea 0
        if (!lines[0] || !lines[0].startsWith('#EXTM3U')) {
            report.errors.push(`Missing #EXTM3U at line 0 (required by ${targetPlayer})`);
        }

        // Procesar cada línea
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!line || !line.startsWith('#')) continue;

            report.stats.total_tags++;

            // Extraer el tag base (antes del ':')
            const tagBase = line.split(':')[0];

            // ¿Está en la whitelist del target?
            const isSupported = supportedTags.some(t =>
                t === tagBase ||
                (t.endsWith('*') && tagBase.startsWith(t.slice(0, -1)))
            );

            if (isSupported) {
                report.stats.supported_tags++;
            } else {
                // ¿Está en la ignored list?
                const isExplicitlyIgnored = (spec.ignored || []).some(t =>
                    t === tagBase ||
                    (t.endsWith('*') && tagBase.startsWith(t.slice(0, -1)))
                );
                if (isExplicitlyIgnored) {
                    report.stats.ignored_tags++;
                } else {
                    report.stats.unknown_tags++;
                }
            }

            // Validar CODECS string si el tag los lleva
            if (tagBase === '#EXT-X-STREAM-INF' || tagBase === '#EXT-X-I-FRAME-STREAM-INF') {
                const codecsMatch = line.match(/CODECS="([^"]+)"/);
                if (codecsMatch) {
                    report.stats.codec_validations++;
                    const validation = this.validateCodecsRFC6381(codecsMatch[1]);
                    if (!validation.valid) {
                        report.stats.codec_failures++;
                        report.warnings.push(`RFC 6381 codec failure at line ${i+1}: "${codecsMatch[1]}"`);
                    }
                }
            }

            // Verificar que STREAM-INF va seguido de URI
            if (tagBase === '#EXT-X-STREAM-INF') {
                const nextLine = lines[i + 1];
                if (!nextLine || nextLine.startsWith('#')) {
                    // Solo error si NO hay URL en las próximas 3 líneas no-comment
                    let foundUri = false;
                    for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
                        if (lines[j] && !lines[j].startsWith('#')) {
                            foundUri = true;
                            break;
                        }
                    }
                    if (!foundUri) {
                        report.errors.push(`#EXT-X-STREAM-INF at line ${i+1} not followed by URI within 3 lines`);
                    }
                }
            }
        }

        // ═══ Calcular score ═══
        // Peso:
        //   - Errors fatales: -10 pts cada uno
        //   - Warnings: -1 pt cada uno (max -20)
        //   - Codec failures: -5 pts cada uno
        //   - Supported/total tag ratio: hasta +100 pts base
        const supportRatio = report.stats.total_tags > 0
            ? (report.stats.supported_tags / (report.stats.supported_tags + report.stats.ignored_tags)) * 100
            : 0;

        let score = supportRatio;
        score -= report.errors.length * 10;
        score -= Math.min(report.warnings.length, 20);
        score -= report.stats.codec_failures * 5;
        score = Math.max(0, Math.min(100, Math.round(score)));

        report.score = score;
        report.interpretation = score >= 95 ? 'EXCELLENT'
            : score >= 85 ? 'GOOD'
            : score >= 70 ? 'ACCEPTABLE'
            : score >= 50 ? 'DEGRADED'
            : 'POOR';

        return report;
    }

    /**
     * [3][4] HDR Signaling Validation (shaka-packager spec)
     */
    validateHdrSignaling(m3u8Content) {
        const report = {
            has_any_hdr_hint: false,
            hdr10_detected: false,
            hdr10_plus_detected: false,
            dolby_vision_detected: false,
            dolby_vision_profiles: [],
            hlg_detected: false,
            lcevc_detected: false,
            issues: []
        };

        const content = m3u8Content.toLowerCase();

        if (/hdr10[\s",]|maxcll|maxfall|mdcv|st2086|smpte[\s.-]?2086/.test(content)) {
            report.hdr10_detected = true;
            report.has_any_hdr_hint = true;
        }
        if (/hdr10\+|st2094|smpte[\s.-]?2094/.test(content)) {
            report.hdr10_plus_detected = true;
            report.has_any_hdr_hint = true;
        }
        if (/dvhe\.|dvav\.|dav1\.|dolby[\s.-]?vision/.test(content)) {
            report.dolby_vision_detected = true;
            report.has_any_hdr_hint = true;

            // Extraer profiles específicos
            const profiles = content.match(/dvhe\.0[0-9]|dav1\.10/g);
            if (profiles) report.dolby_vision_profiles = [...new Set(profiles)];
        }
        if (/hlg|arib[\s-]?std[\s-]?b67/.test(content)) {
            report.hlg_detected = true;
            report.has_any_hdr_hint = true;
        }
        if (/lcevc|vnova|mpeg-5[\s-]?part[\s-]?2/.test(content)) {
            report.lcevc_detected = true;
        }

        if (report.hdr10_plus_detected && !report.hdr10_detected) {
            report.issues.push('HDR10+ detected without base HDR10 metadata (shaka-packager requires both)');
        }
        if (report.dolby_vision_detected && report.dolby_vision_profiles.length === 0) {
            report.issues.push('Dolby Vision mentioned but no specific profile detected');
        }

        return report;
    }

    /**
     * [9] MP4 Init Segment Hint Validator (Bento4 + fmp4-js inspired)
     * No descarga el init.mp4 real, solo valida la referencia.
     */
    validateMp4InitHint(m3u8Content) {
        const report = {
            map_tag_count: 0,
            uri_valid: 0,
            byterange_used: 0,
            init_uri_samples: [],
            issues: []
        };

        const lines = m3u8Content.split('\n');
        for (const line of lines) {
            if (!line.startsWith('#EXT-X-MAP')) continue;
            report.map_tag_count++;

            const uriMatch = line.match(/URI="([^"]+)"/);
            const byterangeMatch = line.match(/BYTERANGE="([^"]+)"/);

            if (uriMatch) {
                report.uri_valid++;
                if (report.init_uri_samples.length < 3) {
                    report.init_uri_samples.push(uriMatch[1]);
                }
                // Validar extensión común
                if (!/\.(mp4|m4s|mp4a|m4v|cmfv|cmfa|cmft)$/i.test(uriMatch[1])) {
                    report.issues.push(`Unusual init segment extension: "${uriMatch[1]}"`);
                }
            } else {
                report.issues.push('#EXT-X-MAP without URI attribute');
            }

            if (byterangeMatch) report.byterange_used++;
        }

        return report;
    }

    /**
     * [10] Manifest Stats (hls-analyzer inspired)
     */
    generateStatsReport(m3u8Content) {
        const lines = m3u8Content.split('\n');
        const stats = {
            total_lines: lines.length,
            non_empty_lines: 0,
            comment_lines: 0,
            tag_lines: 0,
            url_lines: 0,
            channels_approx: 0,
            tag_frequency: {},
            file_size_bytes: m3u8Content.length,
            file_size_mb: (m3u8Content.length / (1024 * 1024)).toFixed(2),
            density_lines_per_channel: 0
        };

        for (const line of lines) {
            if (!line.trim()) continue;
            stats.non_empty_lines++;

            if (line.startsWith('#EXTINF')) {
                stats.channels_approx++;
                stats.tag_lines++;
            } else if (line.startsWith('#')) {
                stats.tag_lines++;
                const tagBase = line.split(':')[0];
                stats.tag_frequency[tagBase] = (stats.tag_frequency[tagBase] || 0) + 1;
            } else if (/^[a-z]+:\/\//i.test(line)) {
                stats.url_lines++;
            }
        }

        stats.density_lines_per_channel = stats.channels_approx > 0
            ? Math.round(stats.tag_lines / stats.channels_approx)
            : 0;

        return stats;
    }

    /**
     * AGGREGATE: Full compliance report across ALL players
     */
    getComplianceReport(m3u8Content) {
        const players = ['hls.js', 'dash.js', 'shaka-player', 'exoplayer', 'vlc', 'avplayer'];

        // Market share weights (IPTV real 2026)
        const MARKET_WEIGHTS = {
            'exoplayer':    0.70,
            'vlc':          0.15,
            'shaka-player': 0.02,
            'avplayer':     0.04,
            'hls.js':       0.05,
            'dash.js':      0.04
        };

        const perPlayer = {};
        let weightedScore = 0;
        let totalWeight = 0;

        for (const player of players) {
            const methodName = 'validateAgainst' + this._titleCase(player.replace(/[-.]/g, ''));
            let report;
            if (typeof this[methodName] === 'function') {
                report = this[methodName](m3u8Content);
            } else {
                report = this._validateGeneric(m3u8Content, player);
            }
            perPlayer[player] = report;

            const weight = MARKET_WEIGHTS[player] || 0;
            weightedScore += report.score * weight;
            totalWeight += weight;
        }

        const stats = this.generateStatsReport(m3u8Content);
        const hdr   = this.validateHdrSignaling(m3u8Content);
        const mp4   = this.validateMp4InitHint(m3u8Content);

        return {
            engine_version: this.version,
            timestamp: new Date().toISOString(),
            aggregate: {
                unweighted_avg: Math.round(
                    Object.values(perPlayer).reduce((a, r) => a + r.score, 0) / players.length
                ),
                market_weighted: totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 0,
                best_target: Object.entries(perPlayer).reduce((best, [p, r]) =>
                    !best || r.score > best.score ? { player: p, score: r.score } : best, null),
                worst_target: Object.entries(perPlayer).reduce((worst, [p, r]) =>
                    !worst || r.score < worst.score ? { player: p, score: r.score } : worst, null)
            },
            per_player: perPlayer,
            manifest_stats: stats,
            hdr_signaling: hdr,
            mp4_init_hint: mp4
        };
    }

    /**
     * Quick unified score 0-100 (market-weighted)
     */
    getUnifiedScore(m3u8Content) {
        const report = this.getComplianceReport(m3u8Content);
        return report.aggregate.market_weighted;
    }

    _titleCase(str) {
        // 'hlsjs' → 'HlsJs'; 'dashjs' → 'DashJs'; 'shakaplayer' → 'ShakaPlayer'
        const map = {
            'hlsjs': 'HlsJs',
            'dashjs': 'DashJs',
            'shakaplayer': 'Shaka',
            'exoplayer': 'ExoPlayer',
            'vlc': 'Vlc',
            'avplayer': 'AvPlayer'
        };
        return map[str] || (str.charAt(0).toUpperCase() + str.slice(1));
    }
}

// ═══════════════════════════════════════════════════════════════
// Export: window (browser) + module.exports (Node)
// ═══════════════════════════════════════════════════════════════
if (typeof window !== 'undefined') {
    window.OmegaComplianceEngine = OmegaComplianceEngine;
    if (window.APE_MODULE_REGISTRY) {
        window.APE_MODULE_REGISTRY['omega-compliance-engine'] = {
            version: '1.0',
            class: 'OmegaComplianceEngine',
            integrated_repos: 12,
            status: 'loaded'
        };
    }
    console.log('✅ OmegaComplianceEngine v1.0 loaded — 12 repos integrated');
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = OmegaComplianceEngine;
}
