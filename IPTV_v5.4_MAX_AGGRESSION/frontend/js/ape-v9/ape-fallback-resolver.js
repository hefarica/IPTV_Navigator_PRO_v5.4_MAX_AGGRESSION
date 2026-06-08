/**
 * APE MAX QUALITY FALLBACK RESOLVER
 * DOCTRINA CENTRAL: MAX IMAGE FIRST. COVERAGE ALWAYS. NO CHANNEL LOSS.
 * 
 * Implementa 6 Tiers de Fallback (F0-F5)
 * El probe entrega evidencia. El resolver decide la salida final con prioridad de imagen.
 */
(function (global) {
    'use strict';

    const auditSummary = {
        totalChannels: 0,
        F0_REAL_VERIFIED_MAX: 0,
        F1_REAL_PARTIAL_MAX: 0,
        F2_HEVC_PREMIUM_HINT: 0,
        F3_HEVC_SAFE_1080P: 0,
        F4_AVC_HIGH_SAFE: 0,
        F5_ORIGINAL_DIRECT_SAFE: 0,
        probeFailed: 0,
        contradictions: 0,
        channelsRemoved: 0
    };

    function resetAuditSummary() {
        for (let key in auditSummary) {
            auditSummary[key] = 0;
        }
    }

    function getAuditSummary() {
        return { ...auditSummary };
    }

    const APE_BITRATE_FALLBACKS = {
        '7680x4320': { bandwidth: 80000000, averageBandwidth: 60000000 },
        '3840x2160': { bandwidth: 28000000, averageBandwidth: 22000000 },
        '2560x1440': { bandwidth: 16000000, averageBandwidth: 12000000 },
        '1920x1080_60': { bandwidth: 12000000, averageBandwidth: 9000000 },
        '1920x1080_30': { bandwidth: 9000000, averageBandwidth: 6500000 },
        '1280x720': { bandwidth: 5500000, averageBandwidth: 4000000 },
        '854x480': { bandwidth: 2500000, averageBandwidth: 1800000 }
    };

    function classifyHevcCodec(codec) {
        const c = String(codec || '').toLowerCase();
        if (c.includes('dvh1') || c.includes('dvhe')) return { family: 'DOLBY_VISION_HEVC', bitDepth: 10, score: 100 };
        if (c.includes('hvc1.4') || c.includes('hev1.4')) return { family: 'HEVC_MAIN12', bitDepth: 12, score: 96 };
        if (c.includes('hvc1.2') || c.includes('hev1.2')) return { family: 'HEVC_MAIN10', bitDepth: 10, score: 94 };
        if (c.includes('hvc1.1') || c.includes('hev1.1')) return { family: 'HEVC_MAIN_8BIT', bitDepth: 8, score: 82 };
        if (c.includes('av01')) {
            if (c.includes('.12.')) return { family: 'AV1_12BIT', bitDepth: 12, score: 92 };
            if (c.includes('.10.')) return { family: 'AV1_10BIT', bitDepth: 10, score: 90 };
            return { family: 'AV1_8BIT', bitDepth: 8, score: 80 };
        }
        if (c.includes('avc1')) return { family: 'AVC_H264', bitDepth: 8, score: 55 };
        return { family: 'UNKNOWN', bitDepth: null, score: 0 };
    }

    function scoreVariant(variant) {
        let score = 0;
        const c = classifyHevcCodec(variant.codecs || '');
        score += c.score;

        const supCodecs = String(variant.supplementalCodecs || '').toLowerCase();
        if (supCodecs.includes('dvh1') || supCodecs.includes('dvhe')) score += 18;

        const vr = String(variant.videoRange || '').toUpperCase();
        if (vr === 'PQ') score += 14;
        if (vr === 'HLG') score += 12;

        const res = String(variant.res || variant.resolution || '');
        if (res.includes('3840') || res.includes('2160')) score += 14;
        if (res.includes('7680') || res.includes('4320')) score += 18;
        if (res.includes('2560') || res.includes('1440')) score += 10;

        const fps = Number(variant.fps || variant.frameRate || 0);
        if (fps >= 50) score += 8;

        const avgBw = Number(variant.avgBandwidth || variant.averageBandwidth || 0);
        if (avgBw >= 22000000) score += 10;
        else if (avgBw >= 15000000) score += 8;
        else if (avgBw >= 9000000) score += 6;

        const container = String(variant.container || '');
        if (container === 'fmp4-cmaf') score += 12;

        const codecRaw = String(variant.codecs || '').toLowerCase();
        if (codecRaw.includes('hvc1')) score += 8;

        return score;
    }

    function computeProbeConfidence(probeData) {
        if (!probeData || probeData.bandwidth === 0) return 0;
        let c = 0;
        if (probeData.videoCodec) c += 35;
        if (probeData.resolution) c += 25;
        if (probeData.bandwidth > 0) c += 20;
        if (probeData.frameRate > 0) c += 10;
        if (probeData.audioCodec) c += 10;
        return c;
    }

    function detectProbeContradictions(probeData) {
        const contra = [];
        if (!probeData) return contra;

        const cFamily = classifyHevcCodec(probeData.videoCodec || '').family;
        const isHDR = probeData.videoRange === 'PQ' || probeData.videoRange === 'HLG';
        
        if (isHDR && (cFamily === 'AVC_H264' || cFamily === 'UNKNOWN')) {
            contra.push('HDR_WITHOUT_HEVC');
        }

        const res = probeData.resolution || '';
        const bw = probeData.bandwidth || 0;
        if ((res.includes('3840') || res.includes('2160')) && bw > 0 && bw < 2000000) {
            contra.push('4K_ABSURDLY_LOW_BITRATE');
        }

        if (cFamily === 'AVC_H264' && (probeData.codecsFull || '').includes('10-bit')) {
            contra.push('AVC_10BIT_CLAIM');
        }

        // CMAF claim requiere evidence: EXT-X-MAP + (.m4s o init.mp4)
        const ev = probeData.evidence || {};
        const hasMap = !!(ev.hasExtXMap || probeData.hasMap);
        const hasM4sOrInit = !!(ev.hasM4s || ev.hasInitMp4 || probeData.hasM4sInit);
        if (probeData.container === 'fmp4-cmaf' && !hasMap) {
            contra.push('CMAF_WITHOUT_MAP');
        }
        if (probeData.container === 'fmp4-cmaf' && !hasM4sOrInit) {
            contra.push('CMAF_WITHOUT_M4S_INIT');
        }

        if (probeData.supplementalCodecs && !/dvh1|dvhe/i.test(probeData.supplementalCodecs) && !/dvh1|dvhe/i.test(probeData.videoCodec || '')) {
             contra.push('SUPPLEMENTAL_WITHOUT_DV');
        }

        if (probeData.videoRange && !['PQ', 'HLG', 'SDR'].includes(probeData.videoRange)) {
             contra.push('UNKNOWN_VIDEO_RANGE');
        }

        return contra;
    }

    function isPremiumChannel(channel, profileStr) {
        const name = (channel.name || '').toLowerCase();
        const group = (channel.group || '').toLowerCase();
        const p = (profileStr || '').toLowerCase();

        const PREMIUM_RE = /4k|uhd|fhd|hevc|h265|h\.265|hdr|dolby|premium|dazn|espn|sport|sports|event|evento|movie|cine|ppv|liga|champions|nba|f1|ufc|hbo|max|netflix|disney|fox|sky|bein/i;
        if (PREMIUM_RE.test(name)) return true;
        if (PREMIUM_RE.test(group)) return true;
        if (p.includes('premium') || p.includes('4k') || p.includes('uhd')) return true;

        return false;
    }

    function isLikelyFhdOrSports(channel, profileStr) {
        const name = (channel.name || '').toLowerCase();
        const group = (channel.group || '').toLowerCase();
        if (name.match(/fhd|hd|1080|sport|deporte|live/i)) return true;
        if (group.match(/fhd|hd|1080|sport|deporte|live/i)) return true;
        return false;
    }

    function resolveAudioFallback(probeData) {
        const codecs = String(probeData?.codecsFull || probeData?.audioCodec || '').toLowerCase();
        // [FIX-AUDIO 2026-05-20 · HFRC] ec-3 (E-AC3/DD+/Atmos) causa problemas de passthrough.
        // Si el probe detecta E-AC3, declarar 'ac-3': E-AC3 tiene core AC-3 retrocompatible →
        // el player decodifica el core Dolby Digital normal e ignora extensiones JOC/Atmos.
        if (codecs.includes('ec-3') || codecs.includes('eac3')) return 'ac-3';
        if (codecs.includes('ac-3')) return 'ac-3';
        if (codecs.includes('mp4a.40.2')) return 'mp4a.40.2';
        return 'mp4a.40.2';
    }

    function getBitrateFallback(resKey) {
        return APE_BITRATE_FALLBACKS[resKey] || APE_BITRATE_FALLBACKS['1920x1080_30'];
    }

    function buildF0VerifiedMax(channel, profile, probeData, confidence) {
        auditSummary.F0_REAL_VERIFIED_MAX++;
        const audioCodec = resolveAudioFallback(probeData);
        return {
            tier: 'F0_REAL_VERIFIED_MAX',
            confidence,
            reason: 'PROBE_TRUSTED',
            qualityMode: 'MAX_IMAGE_VERIFIED',
            canEmitStreamInf: true,

            codec: probeData.videoCodec,
            codecVerified: true,
            codecSource: 'PROBE_REAL',
            audioCodec: audioCodec,
            codecsFull: `${probeData.videoCodec},${audioCodec}`,

            container: probeData.container || 'unknown',
            containerVerified: !!probeData.container,

            hdr: probeData.videoRange === 'PQ' ? 'HDR10_PQ' : (probeData.videoRange === 'HLG' ? 'HLG' : (/dvh1|dvhe/i.test(probeData.videoCodec || probeData.supplementalCodecs || '') ? 'DOLBY_VISION' : 'SDR_OR_UNKNOWN')),
            hdrVerified: !!probeData.videoRange,
            videoRange: probeData.videoRange || null,
            supplementalCodecs: probeData.supplementalCodecs || null,
            supplementalCodecsVerified: !!probeData.supplementalCodecs,

            // [G-1 FIX 2026-05-19] CICP trifecta from probe (RFC 8216bis §4.4.6.2).
            // ARTIFACT_HDR10_METADATA_TRIFECTA.md: BT.2020(9) / PQ(16) or HLG(18) / BT.2020-NCL(9).
            // emitStreamInfFromTruth() reads these and emits COLOR-PRIMARIES /
            // TRANSFER-CHARACTERISTICS / MATRIX-COEFFICIENTS when hdrVerified.
            colorPrimaries:          probeData.colorPrimaries || null,
            transferCharacteristics: probeData.transferCharacteristics || null,
            matrixCoefficients:      probeData.matrixCoefficients || null,
            cicpVerified:            !!(probeData.colorPrimaries || probeData.transferCharacteristics),

            // [G-2 FIX 2026-05-19] HDCP-LEVEL from probe (gate strict — only emit
            // when upstream verifiably enforces it). If probe doesn't detect HDCP,
            // the attribute is omitted from STREAM-INF (honest-rules-strict).
            hdcpLevel:         probeData.hdcpLevel || null,
            hdcpLevelVerified: !!probeData.hdcpLevel,

            resolution: probeData.resolution,
            resolutionVerified: true,

            bandwidth: probeData.bandwidth,
            averageBandwidth: probeData.avgBandwidth || Math.round(probeData.bandwidth * 0.8),
            bandwidthVerified: true,
            frameRate: probeData.frameRate || 30
        };
    }

    function buildF1PartialMax(channel, profile, probeData, confidence, contradictions) {
        auditSummary.F1_REAL_PARTIAL_MAX++;
        const res = probeData.resolution || '1920x1080';
        const bwObj = probeData.bandwidth > 0 ? { bandwidth: probeData.bandwidth, averageBandwidth: probeData.avgBandwidth } : getBitrateFallback(res);
        const audioCodec = resolveAudioFallback(probeData);
        const codec = probeData.videoCodec || 'hvc1.2.4.L150.B0';

        return {
            tier: 'F1_REAL_PARTIAL_MAX',
            confidence,
            reason: contradictions.length > 0 ? 'PROBE_PARTIAL_CONTRADICTIONS' : 'PROBE_PARTIAL',
            qualityMode: 'MAX_IMAGE_PARTIAL',
            canEmitStreamInf: true,

            codec: codec,
            codecVerified: !!probeData.videoCodec,
            codecSource: probeData.videoCodec ? 'PROBE_PARTIAL' : 'PROFILE_PREMIUM_HINT',
            audioCodec: audioCodec,
            codecsFull: `${codec},${audioCodec}`,

            container: 'unknown',
            containerVerified: false,

            hdr: probeData.videoRange === 'PQ' ? 'HDR10_PQ' : (probeData.videoRange === 'HLG' ? 'HLG' : 'SDR_OR_UNKNOWN'),
            hdrVerified: !!probeData.videoRange,
            videoRange: probeData.videoRange || null,
            supplementalCodecs: null,
            supplementalCodecsVerified: false,

            // [G-1 FIX 2026-05-19] CICP trifecta from partial probe (when available).
            // F1 is partial-trust; if probe provided CICP attrs explicitly, propagate;
            // otherwise emitStreamInfFromTruth() will fall back to defaults (9/16-or-18/9).
            colorPrimaries:          probeData.colorPrimaries || null,
            transferCharacteristics: probeData.transferCharacteristics || null,
            matrixCoefficients:      probeData.matrixCoefficients || null,
            cicpVerified:            !!(probeData.colorPrimaries || probeData.transferCharacteristics),

            // [G-2 FIX 2026-05-19] HDCP-LEVEL from probe (omitted if probe didn't detect).
            hdcpLevel:         probeData.hdcpLevel || null,
            hdcpLevelVerified: !!probeData.hdcpLevel,

            resolution: res,
            resolutionVerified: !!probeData.resolution,

            bandwidth: bwObj.bandwidth,
            averageBandwidth: bwObj.averageBandwidth || Math.round(bwObj.bandwidth * 0.8),
            bandwidthVerified: !!probeData.bandwidth,
            frameRate: probeData.frameRate || 30
        };
    }

    function buildF2HevcPremiumHint(channel, profile, probeData, confidence, contradictions) {
        auditSummary.F2_HEVC_PREMIUM_HINT++;
        const nameRaw = (channel.name || '');
        const groupRaw = (channel.group || '');
        const _profUp2 = String(profile || '').toUpperCase();
        const _is4kProfile2 = (_profUp2 === 'P0' || _profUp2 === 'P1');
        const is4k = _is4kProfile2 || nameRaw.match(/4k|uhd/i) || groupRaw.match(/4k|uhd/i);
        const isHdrSignal = nameRaw.match(/hdr|dolby|hlg|hdr10/i) || groupRaw.match(/hdr|dolby|hlg|hdr10/i);
        const res = is4k ? '3840x2160' : '1920x1080';
        const isSports = nameRaw.match(/sport|dazn|espn|f1|ufc|liga|champions|nba/i);
        const fps = isSports ? 60 : 30;
        const bwObj = getBitrateFallback(is4k ? '3840x2160' : (isSports ? '1920x1080_60' : '1920x1080_30'));

        // [HEVC-CASCADE-CSV FIX 2026-05-20 · HFRC mandato] Premium canal → T1 CORONA
        // (hvc1.2.4.L153.B0 4K@60) si el nombre dice 4K, sino T3/T4 según fps.
        // Antes hardcoded L153 universal — ahora respeta resolución inferida.
        const _cascade = (typeof window !== 'undefined' && window.APE_HEVC_CASCADE) || null;
        let _premiumCodec = 'hvc1.2.4.L153.B0';
        if (_cascade && typeof _cascade.resolveTierByResolution === 'function') {
            const [_w, _h] = res.split('x').map(Number);
            const _tier = _cascade.resolveTierByResolution(_w, _h, fps, {});
            _premiumCodec = _tier.codec;
        }

        return {
            tier: 'F2_HEVC_PREMIUM_HINT',
            confidence,
            reason: probeData ? 'PROBE_FAILED_PREMIUM_CHANNEL' : 'NO_PROBE_PREMIUM_CHANNEL',
            qualityMode: 'MAX_IMAGE_AGGRESSIVE_HINT',
            canEmitStreamInf: true,

            codec: _premiumCodec, // PREFERRED — HEVC Main10 per cascade CSV (T1 4K@60 / T2 4K@30 / T3 1080p@60 / T4 1080p@30)
            codecVerified: false,
            codecSource: 'CASCADE_CSV_PREMIUM_HINT',
            audioCodec: 'mp4a.40.2',
            codecsFull: `${_premiumCodec},mp4a.40.2`,

            container: 'unknown',
            containerVerified: false,
            containerPreferred: 'fmp4-cmaf',

            hdr: 'SDR_OR_UNKNOWN',
            hdrVerified: false,
            hdrPreferred: (is4k || isHdrSignal) ? 'HDR10' : null,
            videoRange: null,
            supplementalCodecs: null,
            supplementalCodecsVerified: false,

            resolution: res,
            resolutionVerified: false,

            bandwidth: bwObj.bandwidth,
            averageBandwidth: bwObj.averageBandwidth,
            bandwidthVerified: false,
            frameRate: fps
        };
    }

    function buildF3HevcSafe1080p(channel, profile, probeData, confidence, contradictions) {
        auditSummary.F3_HEVC_SAFE_1080P++;
        const _profUp3 = String(profile || '').toUpperCase();
        const _is4kProfile3 = (_profUp3 === 'P0' || _profUp3 === 'P1');
        const isSports = (channel.name || '').match(/sport|deporte|live/i);
        const fps = (_is4kProfile3 || isSports) ? 60 : 30;
        const bwObj = _is4kProfile3
            ? getBitrateFallback('3840x2160')
            : getBitrateFallback(isSports ? '1920x1080_60' : '1920x1080_30');

        // [HEVC-CASCADE-CSV FIX 2026-05-20 · HFRC mandato] Sports/live → T3 (L123 1080p@60),
        // generalista → T4 (L120 1080p@30). Antes hardcoded L120 universal.
        const _cascade = (typeof window !== 'undefined' && window.APE_HEVC_CASCADE) || null;
        let _safeCodec = _is4kProfile3 ? 'hvc1.2.4.L153.B0' : 'hvc1.2.4.L120.B0';
        if (_cascade && typeof _cascade.resolveTierByResolution === 'function') {
            const [_sw, _sh] = _is4kProfile3 ? [3840, 2160] : [1920, 1080];
            const _tier = _cascade.resolveTierByResolution(_sw, _sh, fps, {});
            _safeCodec = _tier.codec;
        }

        return {
            tier: 'F3_HEVC_SAFE_1080P',
            confidence,
            reason: 'HD_FHD_PROBABLE',
            qualityMode: 'HEVC_SAFE_HINT',
            canEmitStreamInf: true,

            codec: _safeCodec, // PREFERRED — HEVC Main10 1080p (T7 @60 / T6 @30 per cascade CSV)
            fallbackCodec: 'hvc1.2.4.L93.B0',
            codecVerified: false,
            codecSource: 'CASCADE_CSV_SAFE_1080P_HINT',
            audioCodec: 'mp4a.40.2',
            codecsFull: `${_safeCodec},mp4a.40.2`,
            
            container: 'unknown',
            containerVerified: false,
            
            hdr: 'SDR_OR_UNKNOWN',
            hdrVerified: false,
            videoRange: null,
            supplementalCodecs: null,
            supplementalCodecsVerified: false,
            
            resolution: _is4kProfile3 ? '3840x2160' : '1920x1080',
            resolutionVerified: false,

            bandwidth: bwObj.bandwidth,
            averageBandwidth: bwObj.averageBandwidth,
            bandwidthVerified: false,
            frameRate: fps
        };
    }

    function buildF4AvcHighSafe(channel, profile, probeData, confidence, contradictions) {
        auditSummary.F4_AVC_HIGH_SAFE++;
        const res = probeData?.resolution || '1280x720';
        const bwObj = probeData?.bandwidth > 0 ? { bandwidth: probeData.bandwidth, averageBandwidth: probeData.avgBandwidth } : getBitrateFallback(res);

        // [2026-05-22 mandato HFRC] F4 usa hvc1.2.4.*** mínimo — sin AVC.
        // Cascade resuelve por resolución; fallback a L93 (720p Main 10).
        const _cascadeF4 = (typeof window !== 'undefined' && window.APE_HEVC_CASCADE) || null;
        let _f4Codec = 'hvc1.2.4.L93.B0';
        if (_cascadeF4 && typeof _cascadeF4.resolveTierByResolution === 'function') {
            try {
                const [_fw, _fh] = (res || '1280x720').split('x').map(Number);
                _f4Codec = _cascadeF4.resolveTierByResolution(_fw || 1280, _fh || 720, probeData?.frameRate || 30, {}).codec;
            } catch (_) {}
        }

        return {
            tier: 'F4_AVC_HIGH_SAFE',
            confidence,
            reason: 'NO_HEVC_EVIDENCE',
            qualityMode: 'HEVC_MAIN10_FALLBACK',
            canEmitStreamInf: true,

            codec: _f4Codec,
            codecVerified: false,
            codecSource: 'CASCADE_HEVC_MAIN10_F4',
            audioCodec: 'mp4a.40.2',
            codecsFull: `${_f4Codec},mp4a.40.2`,
            
            container: 'unknown',
            containerVerified: false,
            
            hdr: 'SDR_OR_UNKNOWN',
            hdrVerified: false,
            videoRange: null,
            supplementalCodecs: null,
            supplementalCodecsVerified: false,
            
            resolution: res,
            resolutionVerified: !!probeData?.resolution,
            
            bandwidth: bwObj.bandwidth,
            averageBandwidth: bwObj.averageBandwidth,
            bandwidthVerified: !!probeData?.bandwidth,
            frameRate: probeData?.frameRate || 30
        };
    }

    function buildF5OriginalDirectSafe(channel, profile, probeData, confidence, contradictions) {
        auditSummary.F5_ORIGINAL_DIRECT_SAFE++;
        return {
            tier: 'F5_ORIGINAL_DIRECT_SAFE',
            confidence,
            reason: 'FALLBACK_FINAL_DEFENSE',
            qualityMode: 'ORIGINAL_SAFE_DIRECT',
            canEmitStreamInf: false, // BLOQUEO STRICTO

            codec: null,
            codecVerified: false,
            codecSource: 'NO_CODEC_DECLARED',
            
            container: 'unknown',
            containerVerified: false,
            
            hdr: 'SDR_OR_UNKNOWN',
            hdrVerified: false,
            videoRange: null,
            supplementalCodecs: null,
            supplementalCodecsVerified: false,
            
            resolution: null,
            resolutionVerified: false,
            
            bandwidth: 0,
            averageBandwidth: 0,
            bandwidthVerified: false,
            frameRate: 0
        };
    }

    function resolveMaxQualityFallback(channel, profile, probeData) {
        if (probeData && probeData.error === 'TIMEOUT') auditSummary.probeFailed++;

        const confidence = computeProbeConfidence(probeData);
        const contradictions = detectProbeContradictions(probeData);
        if (contradictions.length > 0) auditSummary.contradictions++;

        const isProbeTrusted = confidence >= 85 && contradictions.length === 0;
        const isProbePartial = confidence >= 60 && contradictions.length <= 1;

        if (isProbeTrusted) {
            return buildF0VerifiedMax(channel, profile, probeData, confidence);
        }

        if (isProbePartial) {
            return buildF1PartialMax(channel, profile, probeData, confidence, contradictions);
        }

        if (isPremiumChannel(channel, profile)) {
            return buildF2HevcPremiumHint(channel, profile, probeData, confidence, contradictions);
        }

        if (isLikelyFhdOrSports(channel, profile)) {
            return buildF3HevcSafe1080p(channel, profile, probeData, confidence, contradictions);
        }

        // [HEVC-CASCADE-CSV 2026-05-20 · REVISED 2026-06-07 Council audit · S1+S5+S9+S12]
        // Doctrina CLAUDE.md §F0–F5: F4 AVC HIGH SAFE corre cuando NO hay evidencia HEVC
        // ni hint premium. La revisión de 2026-05-20 forzaba F3 HEVC PREFERRED para TODO
        // canal con .m3u8 — pero los Explore agents 2026-06-07 confirmaron que ExoPlayer/
        // OTT Navigator/TiviMate NO degradan codec dentro de variant (RFC 8216 §4.4.4.2),
        // y la mayoría de upstream IPTV FHD/HD sirve H.264. F3 HEVC declarado sobre H.264
        // = init decoder failure = freeze.
        //
        // Fix: F4 para P3/P4/P5 sin probe-HEVC y sin anti-freeze premium. P0/P1/P2 conservan
        // F3 HEVC por default (alta probabilidad upstream HEVC en 4K).
        // Anti-freeze premium usa ANTI_FREEZE_PREMIUM_RE (sin 'fhd|hevc|h265' tokens cosméticos),
        // garantizando que canales como "BEIN SPORTS FHD" siguen siendo premium pero
        // "MyChannel FHD" genérico cae a F4.
        const _probeSaysAvc = probeData && /^avc1/i.test(String(probeData.videoCodec || ''));
        if (channel.url && channel.url.includes('.m3u8')) {
            if (_probeSaysAvc) {
                return buildF4AvcHighSafe(channel, profile, probeData, confidence, contradictions);
            }
            // F4 demotion para FHD/HD/SD sin evidencia ni premium real
            const _profUp = String(profile || '').toUpperCase();
            const _isFhdHdSd = (_profUp === 'P3' || _profUp === 'P4' || _profUp === 'P5');
            if (_isFhdHdSd) {
                const _afp = (typeof window !== 'undefined' && window.APE_HEVC_CASCADE && window.APE_HEVC_CASCADE.isAntiFreezePremium)
                    ? window.APE_HEVC_CASCADE.isAntiFreezePremium
                    : isPremiumChannel; // fallback: usa el isPremiumChannel local del resolver
                let _isAntiFreezePremium = false;
                try { _isAntiFreezePremium = _afp(channel, profile); } catch (_e) { _isAntiFreezePremium = false; }
                if (!_isAntiFreezePremium) {
                    return buildF4AvcHighSafe(channel, profile, probeData, confidence, contradictions);
                }
            }
            return buildF3HevcSafe1080p(channel, profile, probeData, confidence, contradictions);
        }

        return buildF5OriginalDirectSafe(channel, profile, probeData, confidence, contradictions);
    }

    // ═══════════════════════════════════════════════════════════════════
    // EMISSION HELPERS — STREAM-INF + APE tags (truth-driven, honest)
    // ═══════════════════════════════════════════════════════════════════

    function emitStreamInfFromTruth(truth) {
        if (!truth) return null;
        if (!truth.canEmitStreamInf) return null;
        if (!truth.codec || !truth.bandwidth || !truth.resolution) return null;

        const parts = [];
        parts.push(`BANDWIDTH=${truth.bandwidth}`);
        parts.push(`AVERAGE-BANDWIDTH=${truth.averageBandwidth || Math.round(truth.bandwidth * 0.8)}`);
        parts.push(`RESOLUTION=${truth.resolution}`);
        parts.push(`FRAME-RATE=${Number(truth.frameRate || 30).toFixed(3)}`);
        parts.push(`CODECS="${truth.codec},${truth.audioCodec || 'mp4a.40.2'}"`);

        // VIDEO-RANGE solo si verificado por probe (no inventar HDR)
        if (truth.hdrVerified && (truth.videoRange === 'PQ' || truth.videoRange === 'HLG')) {
            parts.push(`VIDEO-RANGE=${truth.videoRange}`);

            // [G-1 FIX 2026-05-19] HDR10 metadata trifecta (CICP) — RFC 8216bis §4.4.6.2.
            // Emitted ONLY when VIDEO-RANGE is verified PQ or HLG. Probe-provided values
            // take precedence; spec-safe defaults otherwise (BT.2020 / PQ-or-HLG / BT.2020-NCL).
            // Per ARTIFACT_HDR10_METADATA_TRIFECTA.md + closes G-1 of
            // ARTIFACT_FASE1_PROFUNDO_B_RESOLVER_AUDIT.md.
            const cp = truth.colorPrimaries          || 9;                                       // BT.2020
            const tc = truth.transferCharacteristics || (truth.videoRange === 'HLG' ? 18 : 16);  // HLG=18 / PQ=16
            const mc = truth.matrixCoefficients      || 9;                                       // BT.2020 non-constant
            parts.push(`COLOR-PRIMARIES=${cp}`);
            parts.push(`TRANSFER-CHARACTERISTICS=${tc}`);
            parts.push(`MATRIX-COEFFICIENTS=${mc}`);
        }

        // SUPPLEMENTAL-CODECS solo si verificado (no inventar DV/LCEVC)
        if (truth.supplementalCodecsVerified && truth.supplementalCodecs) {
            parts.push(`SUPPLEMENTAL-CODECS="${truth.supplementalCodecs}"`);
        }

        // HDCP-LEVEL emission strategy (2026-05-19 — HDCP-Adaptive Engine):
        //   1. If probe verified HDCP upstream → use that (highest priority, honest)
        //   2. Else if HDCP-Adaptive Engine has a per-channel decision (window.APE_HDCP_PROFILE
        //      pre-loaded from /prisma/api/channel-hdcp-bulk.php) → use it
        //   3. Else → default 'TYPE-1' (aggressive, forces hardware decoder path)
        // Conviva engine (frontend/js/conviva-qoe-engine.js) flips decision to 'NONE'
        // via POST /prisma/api/channel-hdcp-incident.php if VST > 3000ms on TYPE-1 attempt.
        let _hdcpLevelEmitted = null;
        if (truth.hdcpLevelVerified && truth.hdcpLevel) {
            _hdcpLevelEmitted = truth.hdcpLevel;
        } else if (truth.channelId) {
            const _hdcpMap = (typeof window !== 'undefined' && window.APE_HDCP_PROFILE) ? window.APE_HDCP_PROFILE : {};
            _hdcpLevelEmitted = _hdcpMap[truth.channelId] || 'TYPE-1';
        }
        if (_hdcpLevelEmitted) {
            parts.push(`HDCP-LEVEL=${_hdcpLevelEmitted}`);
        }

        // [G-3 FIX 2026-05-19] STABLE-VARIANT-ID — RFC 8216bis §4.4.6.2.
        // Prevents ExoPlayer ABR yoyo across manifest reloads. Uses channelId + profile
        // when available (best uniqueness); falls back to resolution + codec family if not.
        const _codecFamily = String(truth.codec || '').split('.')[0];   // hvc1 / av01 / avc1 / etc.
        if (truth.channelId && truth.profile) {
            parts.push(`STABLE-VARIANT-ID="${truth.channelId}_${truth.profile}"`);
        } else if (truth.resolution && _codecFamily) {
            parts.push(`STABLE-VARIANT-ID="${truth.resolution}-${_codecFamily}"`);
        }

        return `#EXT-X-STREAM-INF:${parts.join(',')}`;
    }

    function emitApeFallbackTags(truth) {
        if (!truth) return [];
        const tags = [];

        tags.push(`#EXT-X-APE-FALLBACK-TIER:${truth.tier}`);
        tags.push(`#EXT-X-APE-CONFIDENCE:${truth.confidence}`);
        tags.push(`#EXT-X-APE-FALLBACK-REASON:${truth.reason}`);
        tags.push(`#EXT-X-APE-QUALITY-MODE:${truth.qualityMode}`);

        // CODEC: REAL vs PREFERRED segun verified
        if (truth.codec) {
            if (truth.codecVerified) {
                tags.push(`#EXT-X-APE-CODEC-REAL:${truth.codec}`);
                tags.push(`#EXT-X-APE-CODEC-VERIFIED:true`);
            } else {
                tags.push(`#EXT-X-APE-CODEC-PREFERRED:${truth.codec}`);
                tags.push(`#EXT-X-APE-CODEC-VERIFIED:false`);
            }
        }
        if (truth.codecSource) {
            tags.push(`#EXT-X-APE-CODEC-SOURCE:${truth.codecSource}`);
        }

        // CONTAINER
        tags.push(`#EXT-X-APE-CONTAINER:${truth.container || 'unknown'}`);
        tags.push(`#EXT-X-APE-CONTAINER-VERIFIED:${truth.containerVerified ? 'true' : 'false'}`);
        if (truth.containerPreferred && !truth.containerVerified) {
            tags.push(`#EXT-X-APE-CONTAINER-PREFERRED:${truth.containerPreferred}`);
        }

        // HDR
        if (truth.hdr) {
            tags.push(`#EXT-X-APE-HDR:${truth.hdr}`);
            tags.push(`#EXT-X-APE-HDR-VERIFIED:${truth.hdrVerified ? 'true' : 'false'}`);
        }
        if (truth.hdrPreferred && !truth.hdrVerified) {
            tags.push(`#EXT-X-APE-HDR-PREFERRED:${truth.hdrPreferred}`);
        }

        // RESOLUTION
        if (truth.resolution) {
            tags.push(`#EXT-X-APE-RESOLUTION:${truth.resolution}`);
            tags.push(`#EXT-X-APE-RESOLUTION-VERIFIED:${truth.resolutionVerified ? 'true' : 'false'}`);
        }

        // BANDWIDTH
        if (truth.bandwidth && truth.bandwidth > 0) {
            tags.push(`#EXT-X-APE-BANDWIDTH:${truth.bandwidth}`);
            tags.push(`#EXT-X-APE-BANDWIDTH-VERIFIED:${truth.bandwidthVerified ? 'true' : 'false'}`);
        }

        return tags;
    }

    const APEFallbackResolver = {
        resolveMaxQualityFallback,
        emitStreamInfFromTruth,
        emitApeFallbackTags,
        getAuditSummary,
        resetAuditSummary,
        classifyHevcCodec,
        scoreVariant,
        computeProbeConfidence,
        detectProbeContradictions,
        isPremiumChannel,
        isLikelyFhdOrSports
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = APEFallbackResolver;
    } else {
        global.APEFallbackResolver = APEFallbackResolver;
    }

})(typeof window !== 'undefined' ? window : globalThis);
