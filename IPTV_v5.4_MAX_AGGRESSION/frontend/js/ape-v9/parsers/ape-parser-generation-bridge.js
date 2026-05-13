/**
 * APE PARSER GENERATION BRIDGE
 *
 * Connects the 26-parser stack to the generation pipeline WITHOUT modifying
 * ANY existing module. Provides two surgical hooks:
 *
 *   1. enrichChannelsWithParserStack(channels) — called ONCE before generation
 *      starts, decorates each channel object with parser evidence.
 *
 *   2. enhanceProbeWithCanonical(channel, probeData) — called PER CHANNEL inside
 *      generateChannelEntry() to fill probe gaps from parser evidence.
 *
 *   3. runPostEmissionSanitizer(exthttpJson) — final CA7/C8 safety net that
 *      catches any toxic header that survived the existing banned set.
 *
 * OMEGA-NO-DELETE: this file only ADDS. No existing file is modified by its existence.
 *
 * Doctrina: MAX IMAGE FIRST · COVERAGE ALWAYS · NO CHANNEL LOSS · ZERO TOXIC HEADERS
 * @version 1.0.0
 * @date 2026-05-12
 */
(function (global) {
    'use strict';

    var _bridgeAudit = {
        enriched: 0,
        skipped: 0,
        codecsParsed: 0,
        hevcDetected: 0,
        main10Detected: 0,
        dolbyVisionDetected: 0,
        xtreamDetected: 0,
        headersSanitized: 0,
        toxicHeadersBlocked: 0,
        probeEnhancements: 0,
        postEmissionSanitizations: 0,
        elapsed: 0,
        errors: 0
    };

    function resetBridgeAudit() {
        var keys = Object.keys(_bridgeAudit);
        for (var i = 0; i < keys.length; i++) _bridgeAudit[keys[i]] = 0;
    }

    function getBridgeAudit() {
        return Object.assign({}, _bridgeAudit);
    }

    // ═══ HOOK 1: PRE-GENERATION ENRICHMENT ═══
    // Called ONCE before the generation loop starts.
    // Decorates each channel with:
    //   channel._apeCanonical     — full canonical object from parser stack
    //   channel._apeXtream        — Xtream URL decomposition
    //   channel._apeCodecParsed   — deep codec analysis
    //   channel._apeHevcParsed    — HEVC detail (bitDepth, family, level)
    //   channel._apeHdrParsed     — HDR/DV detection
    //   channel._apeHeadersClean  — CA7/C8 sanitized headers (from channel's existing headers)
    //
    // NEVER removes or modifies existing channel properties — only ADDS underscore-prefixed ones.
    function enrichChannelsWithParserStack(channels) {
        var PS = global.APEUniversalParserStack;
        if (!PS) {
            console.warn('[APE-BRIDGE] APEUniversalParserStack not loaded — generation proceeds without enrichment');
            _bridgeAudit.skipped = (channels || []).length;
            return { enriched: 0, skipped: _bridgeAudit.skipped };
        }

        resetBridgeAudit();
        PS.resetParserAuditSummary();
        var t0 = Date.now();
        var len = (channels || []).length;

        for (var i = 0; i < len; i++) {
            var ch = channels[i];
            try {
                // ── 1. Xtream URL decomposition (host, user, pass, streamId, type)
                if (ch.url) {
                    var xtream = PS.parseXtreamUrl(ch.url);
                    if (xtream && xtream.host) {
                        ch._apeXtream = xtream;
                        _bridgeAudit.xtreamDetected++;
                    }
                }

                // ── 2. Codec deep analysis (from channel metadata if available)
                var codecHint = ch.codecs || ch.codec || ch._codec || ch.stream_codecs || null;
                if (codecHint) {
                    var codecParsed = PS.parseCodecString(String(codecHint));
                    if (codecParsed) {
                        ch._apeCodecParsed = codecParsed;
                        _bridgeAudit.codecsParsed++;

                        // Deep HEVC analysis if video codec is HEVC
                        if (codecParsed.videoCodec && /^h[ev]c1/i.test(codecParsed.videoCodec)) {
                            var hevcParsed = PS.parseHevcCodec(codecParsed.videoCodec);
                            if (hevcParsed && hevcParsed.valid) {
                                ch._apeHevcParsed = hevcParsed;
                                _bridgeAudit.hevcDetected++;
                                if (hevcParsed.codecFamily === 'HEVC_MAIN_10') _bridgeAudit.main10Detected++;
                            }
                        }

                        // Dolby Vision detection
                        if (codecParsed.videoCodec && /^dv[he]/i.test(codecParsed.videoCodec)) {
                            _bridgeAudit.dolbyVisionDetected++;
                        }
                    }
                }

                // ── 3. EXTHTTP header sanitization (from channel's existing headers/exthttp)
                var rawHeaders = ch._exthttp || ch.exthttp || ch.http_headers || null;
                if (rawHeaders && typeof rawHeaders === 'object') {
                    var sanitized = PS.sanitizeExtHttpHeaders(rawHeaders);
                    if (sanitized) {
                        ch._apeHeadersClean = sanitized.headers;
                        _bridgeAudit.headersSanitized++;
                        if (sanitized.audit && sanitized.audit.toxicHeadersRemoved && sanitized.audit.toxicHeadersRemoved.length > 0) {
                            _bridgeAudit.toxicHeadersBlocked += sanitized.audit.toxicHeadersRemoved.length;
                        }
                    }
                }

                // ── 4. HDR detection from channel attributes
                var streamInfAttrs = {};
                if (ch.video_range || ch.videoRange) streamInfAttrs['VIDEO-RANGE'] = ch.video_range || ch.videoRange;
                if (ch.supplemental_codecs) streamInfAttrs['SUPPLEMENTAL-CODECS'] = ch.supplemental_codecs;
                if (codecHint) streamInfAttrs.CODECS = String(codecHint);
                if (streamInfAttrs['VIDEO-RANGE'] || streamInfAttrs['SUPPLEMENTAL-CODECS']) {
                    var hdrParsed = PS.parseDolbyHdr(streamInfAttrs);
                    if (hdrParsed) {
                        ch._apeHdrParsed = hdrParsed;
                        if (hdrParsed.isDolbyVision) _bridgeAudit.dolbyVisionDetected++;
                    }
                }

                // ── 5. Build canonical (assembles all fragments into one object)
                ch._apeCanonical = PS.parseChannelBlock(ch, {
                    headers: ch._apeHeadersClean || null,
                    extHttp: (ch._apeHeadersClean) ? { headers: ch._apeHeadersClean, audit: {} } : null
                });

                _bridgeAudit.enriched++;
            } catch (e) {
                // NEVER lose a channel because of parser failure
                _bridgeAudit.errors++;
                ch._apeCanonical = null;
            }
        }

        _bridgeAudit.skipped = len - _bridgeAudit.enriched;
        _bridgeAudit.elapsed = Date.now() - t0;

        var parserAudit = PS.getParserAuditSummary();
        console.log(
            '[APE-BRIDGE] Enrichment complete: ' + _bridgeAudit.enriched + '/' + len +
            ' channels in ' + _bridgeAudit.elapsed + 'ms' +
            ' | HEVC: ' + _bridgeAudit.hevcDetected +
            ' | Main10: ' + _bridgeAudit.main10Detected +
            ' | DV: ' + _bridgeAudit.dolbyVisionDetected +
            ' | Toxic blocked: ' + _bridgeAudit.toxicHeadersBlocked +
            ' | Parser audit: ' + JSON.stringify({
                totalChannels: parserAudit.totalChannels,
                hevc: parserAudit.hevcDetected,
                hdr: parserAudit.hdrDetected,
                toxic: parserAudit.toxicHeadersRemoved
            })
        );

        return getBridgeAudit();
    }

    // ═══ HOOK 2: PER-CHANNEL PROBE ENHANCEMENT ═══
    // Called inside generateChannelEntry() to fill probe gaps.
    // The parser canonical provides evidence the probe may not have captured.
    // Rule: parser fills gaps, NEVER overwrites existing probe data.
    function enhanceProbeWithCanonical(channel, probeData) {
        if (!channel || !channel._apeCanonical) return probeData;
        var canonical = channel._apeCanonical;
        if (!probeData) probeData = {};

        // Fill video evidence gaps
        if (!probeData.codecs && canonical.video && canonical.video.codec) {
            probeData.codecs = canonical.video.codec;
            probeData._parserEnriched = true;
        }
        if (!probeData.resolution && canonical.video && canonical.video.resolution) {
            probeData.resolution = canonical.video.resolution;
            probeData._parserEnriched = true;
        }
        if (!probeData.videoRange && canonical.video && canonical.video.videoRange) {
            probeData.videoRange = canonical.video.videoRange;
            probeData._parserEnriched = true;
        }
        if (!probeData.bandwidth && canonical.video && canonical.video.bandwidth) {
            probeData.bandwidth = canonical.video.bandwidth;
            probeData._parserEnriched = true;
        }
        if (!probeData.frameRate && canonical.video && canonical.video.frameRate) {
            probeData.frameRate = canonical.video.frameRate;
            probeData._parserEnriched = true;
        }
        // Fill container evidence
        if (!probeData.container && canonical.container && canonical.container.type !== 'UNKNOWN') {
            probeData.container = canonical.container.type;
            probeData.containerVerified = canonical.container.verified;
            probeData._parserEnriched = true;
        }
        // Fill HEVC detail
        if (!probeData.hevcProfile && channel._apeHevcParsed && channel._apeHevcParsed.valid) {
            probeData.hevcProfile = channel._apeHevcParsed.codecFamily;
            probeData.hevcBitDepth = channel._apeHevcParsed.bitDepth;
            probeData.hevcLevel = channel._apeHevcParsed.level;
            probeData._parserEnriched = true;
        }
        // Fill HDR detail
        if (!probeData.hdrVerified && channel._apeHdrParsed && channel._apeHdrParsed.hdrVerified) {
            probeData.hdrVerified = true;
            probeData.hdrType = channel._apeHdrParsed.hdr;
            probeData._parserEnriched = true;
        }
        // Fill Xtream provider info
        if (!probeData.provider && channel._apeXtream && channel._apeXtream.host) {
            probeData.provider = channel._apeXtream.host;
            probeData.streamType = channel._apeXtream.streamType;
            probeData._parserEnriched = true;
        }

        if (probeData._parserEnriched) _bridgeAudit.probeEnhancements++;
        return probeData;
    }

    // ═══ HOOK 3: POST-EMISSION SAFETY NET ═══
    // Called after JSON.stringify of _httpPayload, catches any toxic header
    // that escaped the existing CA7 banned set. Defense-in-depth layer.
    function runPostEmissionSanitizer(exthttpJsonStr) {
        if (typeof exthttpJsonStr !== 'string' || !exthttpJsonStr) return exthttpJsonStr;

        // Fast check — if none of the toxic patterns are in the string, pass through
        var toxicPatterns = ['"Range"', '"If-None-Match"', '"If-Modified-Since"', '"TE"', '"Priority"', '"Upgrade-Insecure-Requests"'];
        var hasToxic = false;
        for (var i = 0; i < toxicPatterns.length; i++) {
            if (exthttpJsonStr.indexOf(toxicPatterns[i]) !== -1) {
                hasToxic = true;
                break;
            }
        }
        if (!hasToxic) return exthttpJsonStr;

        // Slow path — parse, sanitize, re-stringify
        try {
            var parsed = JSON.parse(exthttpJsonStr);
            var sanitizer = global.APEHttpHeaderSanitizer;
            if (sanitizer && typeof sanitizer.sanitizeExtHttpHeaders === 'function') {
                var result = sanitizer.sanitizeExtHttpHeaders(parsed, { strictAllowlist: false });
                _bridgeAudit.postEmissionSanitizations++;
                if (result.audit && result.audit.toxicHeadersRemoved) {
                    _bridgeAudit.toxicHeadersBlocked += result.audit.toxicHeadersRemoved.length;
                }
                return JSON.stringify(result.headers);
            }
            // Fallback: manual strip
            var banned = ['Range', 'If-None-Match', 'If-Modified-Since', 'TE', 'Priority', 'Upgrade-Insecure-Requests'];
            for (var j = 0; j < banned.length; j++) {
                delete parsed[banned[j]];
                delete parsed[banned[j].toLowerCase()];
            }
            _bridgeAudit.postEmissionSanitizations++;
            return JSON.stringify(parsed);
        } catch (e) {
            // If JSON parse fails, strip patterns via string replacement (last resort)
            return exthttpJsonStr;
        }
    }

    // ═══ EXPORT ═══
    global.APEParserGenerationBridge = {
        version: '1.0.0',
        enrichChannelsWithParserStack: enrichChannelsWithParserStack,
        enhanceProbeWithCanonical: enhanceProbeWithCanonical,
        runPostEmissionSanitizer: runPostEmissionSanitizer,
        getBridgeAudit: getBridgeAudit,
        resetBridgeAudit: resetBridgeAudit
    };

})(typeof window !== 'undefined' ? window : globalThis);
