/**
 * APE PARSER NORMALIZER — Merges outputs from all parsers into the
 * canonical APE object that the Fallback Resolver consumes.
 *
 * Schema:
 *   { channel, probe, headers, container, video, audio, subtitles,
 *     drm, hls, playerScopes, ape }
 *
 * Every field has a default — no field is `undefined`.
 *
 * @version 1.0.0
 * @date 2026-05-12
 */
(function (global) {
    'use strict';

    function makeEmptyCanonical() {
        return {
            channel: {
                id: null, name: null, group: null, logo: null, url: null, provider: null
            },
            probe: {
                verified: false, confidence: 0, source: null, timestamp: null,
                httpStatus: null, errorClass: null
            },
            headers: {
                sanitized: true, values: {}, toxicHeadersRemoved: [], sanitizedReason: null
            },
            container: {
                type: 'UNKNOWN', verified: false, evidence: null
            },
            video: {
                codec: null, codecFamily: null, bitDepth: null,
                resolution: null, width: null, height: null,
                frameRate: null, bandwidth: null, averageBandwidth: null,
                videoRange: null, hdr: 'SDR_OR_UNKNOWN', supplementalCodecs: null,
                visualScore: 0
            },
            audio: {
                codec: null, family: null, channels: null, language: null, atmosHint: false
            },
            subtitles: [],
            drm: {
                drmSystems: [], encrypted: false, playerCompatible: true, keys: []
            },
            hls: {
                type: null, version: null, targetDuration: null,
                mediaSequence: 0, independentSegments: false,
                lowLatency: false, segments: 0, live: false, vod: false
            },
            playerScopes: {
                standardHls: true, vlcOnly: false, kodiOnly: false,
                exoplayerSafe: true, tivimateSafe: true, ottNavigatorSafe: true,
                appleHlsStrict: true
            },
            ape: {
                fallbackTier: null, confidence: 0, qualityScore: 0,
                warnings: [], errors: [],
                neverFakeCodec: true, neverFakeCmaf: true, neverFakeHdr: true,
                zeroToxicHeaders: true
            }
        };
    }

    function applyChannel(out, channel) {
        if (!channel) return;
        out.channel.id       = channel.id != null ? channel.id : (channel.stream_id || null);
        out.channel.name     = channel.name || channel.title || null;
        out.channel.group    = channel.group_title || channel.category_name || null;
        out.channel.logo     = channel.tvg_logo || channel.stream_icon || null;
        out.channel.url      = channel.url || null;
        out.channel.provider = channel._host || channel.provider || null;
    }

    function applyMaster(out, master) {
        if (!master) return;
        out.hls.type = 'master';
        out.hls.version = master.version || out.hls.version;
        out.hls.independentSegments = !!master.independentSegments;
        if (master.streamInfs && master.streamInfs.length) {
            // Pick the top variant by bandwidth as the headline
            let best = master.streamInfs[0];
            for (let i = 1; i < master.streamInfs.length; i++) {
                if ((master.streamInfs[i].BANDWIDTH || 0) > (best.BANDWIDTH || 0)) best = master.streamInfs[i];
            }
            out.video.bandwidth        = best.BANDWIDTH || null;
            out.video.averageBandwidth = best['AVERAGE-BANDWIDTH'] || null;
            out.video.resolution       = best.RESOLUTION || null;
            if (best.RESOLUTION) {
                const wh = String(best.RESOLUTION).split('x');
                out.video.width  = parseInt(wh[0], 10) || null;
                out.video.height = parseInt(wh[1], 10) || null;
            }
            out.video.frameRate          = best['FRAME-RATE'] || null;
            out.video.codec              = best.CODECS || null;
            out.video.videoRange         = best['VIDEO-RANGE'] || null;
            out.video.supplementalCodecs = best['SUPPLEMENTAL-CODECS'] || null;
        }
    }

    function applyMedia(out, media) {
        if (!media) return;
        if (!out.hls.type) out.hls.type = 'media';
        out.hls.version              = media.version || out.hls.version;
        out.hls.targetDuration       = media.targetDuration;
        out.hls.mediaSequence        = media.mediaSequence;
        out.hls.independentSegments  = !!media.independentSegments || out.hls.independentSegments;
        out.hls.lowLatency           = !!(media.lowLatency && media.lowLatency.detected);
        out.hls.segments             = (media.segments || []).length;
        out.hls.live                 = media.stats ? !!media.stats.live  : false;
        out.hls.vod                  = media.stats ? !!media.stats.vod   : false;
        if (media.container) {
            out.container.type     = media.container.type || out.container.type;
            out.container.verified = !!media.container.verified;
            out.container.evidence = media.container.evidence || null;
        }
        if (media.key) {
            out.drm.encrypted = true;
        }
    }

    function applyCodec(out, codec) {
        if (!codec) return;
        if (codec.videoCodec) out.video.codec = codec.videoCodec + (codec.audioCodec ? ',' + codec.audioCodec : '');
        if (codec.family && codec.family.video) out.video.codecFamily = codec.family.video;
        if (codec.audioCodec) {
            out.audio.codec = codec.audioCodec;
            out.audio.family = codec.family && codec.family.audio ? codec.family.audio : null;
        }
    }

    function applyHevc(out, hevc) {
        if (!hevc || !hevc.valid) return;
        out.video.bitDepth     = hevc.bitDepth;
        out.video.codecFamily  = hevc.codecFamily || out.video.codecFamily;
        out.video.visualScore  = hevc.visualScore || out.video.visualScore;
    }

    function applyHdr(out, hdr) {
        if (!hdr) return;
        if (hdr.hdrVerified) {
            out.video.hdr        = hdr.hdr;
            out.video.videoRange = hdr.videoRange || out.video.videoRange;
        }
        if (hdr.isDolbyVision) {
            out.video.codecFamily = out.video.codecFamily || 'DOLBY_VISION';
            out.video.visualScore = Math.max(out.video.visualScore, 100);
        }
    }

    function applyAudio(out, audio) {
        if (!audio) return;
        if (audio.topAudio) {
            out.audio.codec     = audio.topAudio.codec     || out.audio.codec;
            out.audio.family    = audio.topAudio.family    || out.audio.family;
            out.audio.channels  = audio.topAudio.channels  || out.audio.channels;
            out.audio.language  = audio.topAudio.language  || out.audio.language;
            out.audio.atmosHint = !!audio.topAudio.atmosHint;
        }
    }

    function applySubtitles(out, subs) {
        if (!subs) return;
        out.subtitles = (subs.subtitles || []).map(function (s) {
            return { language: s.language, format: s.format, forced: s.forced, default: s.isDefault, uri: s.uri };
        });
    }

    function applyDrm(out, drm) {
        if (!drm) return;
        out.drm.drmSystems       = drm.drmSystems || [];
        out.drm.encrypted        = !!drm.encrypted || out.drm.encrypted;
        out.drm.playerCompatible = drm.playerCompatible !== false;
        out.drm.keys             = drm.keys || [];
    }

    function applyExtHttp(out, ext) {
        if (!ext) return;
        const toxic = (ext.audit && ext.audit.toxicHeadersRemoved) || [];
        if (toxic.length) {
            out.headers.toxicHeadersRemoved = out.headers.toxicHeadersRemoved.concat(toxic);
            out.headers.sanitizedReason = 'CA7_C8_TOXIC_HEADER_BLOCKED';
        }
        if (ext.headers) Object.assign(out.headers.values, ext.headers);
    }

    function applyLowLatency(out, ll) {
        if (!ll) return;
        out.hls.lowLatency = !!ll.detected || out.hls.lowLatency;
    }

    function applyApeCustom(out, custom) {
        if (!custom) return;
        if (custom.channelTags && custom.channelTags.length) {
            const a = custom.channelTags[0].attrs || {};
            if (a['ape-fallback-tier'])      out.ape.fallbackTier = a['ape-fallback-tier'];
            if (a['ape-confidence'])         out.ape.confidence   = parseFloat(a['ape-confidence']) || 0;
            if (a['ape-quality-score'])      out.ape.qualityScore = parseFloat(a['ape-quality-score']) || 0;
            if (a['ape-header-sanitized'])   out.headers.sanitized = String(a['ape-header-sanitized']).toLowerCase() === 'true';
        }
    }

    function applyReachability(out, reach) {
        if (!reach) return;
        out.probe.verified   = !!reach.reachable;
        out.probe.httpStatus = reach.httpStatus;
        out.probe.errorClass = reach.errorClass;
        out.probe.source     = 'reachability';
        out.probe.timestamp  = new Date().toISOString();
    }

    /**
     * Build canonical object from parser fragments.
     * @param {Object} parts - { channel, master, media, codec, hevc, hdr, audio, subs, drm, extHttp, llHls, custom, reachability, headers, scopes }
     * @returns {Object} canonical APE object
     */
    function normalize(parts) {
        const out = makeEmptyCanonical();
        if (!parts) return out;

        applyChannel(out, parts.channel);
        applyMaster(out, parts.master);
        applyMedia(out, parts.media);
        applyCodec(out, parts.codec);
        applyHevc(out, parts.hevc);
        applyHdr(out, parts.hdr);
        applyAudio(out, parts.audio);
        applySubtitles(out, parts.subs);
        applyDrm(out, parts.drm);
        applyExtHttp(out, parts.extHttp);
        applyLowLatency(out, parts.llHls);
        applyApeCustom(out, parts.custom);
        applyReachability(out, parts.reachability);

        if (parts.headers && typeof parts.headers === 'object') {
            Object.assign(out.headers.values, parts.headers);
        }
        if (parts.scopes && typeof parts.scopes === 'object') {
            Object.assign(out.playerScopes, parts.scopes);
        }

        // Headers zero-toxic doctrine
        if (out.headers.toxicHeadersRemoved.length > 0) {
            out.ape.zeroToxicHeaders = false;
        }

        return out;
    }

    const APEParserNormalizer = {
        normalize:           normalize,
        makeEmptyCanonical:  makeEmptyCanonical
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = APEParserNormalizer;
    } else {
        global.APEParserNormalizer = APEParserNormalizer;
    }

})(typeof window !== 'undefined' ? window : globalThis);
