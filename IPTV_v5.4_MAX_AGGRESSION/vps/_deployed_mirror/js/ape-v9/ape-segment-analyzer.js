/**
 * ═══════════════════════════════════════════════════════════════════════════
 * APE SEGMENT ANALYZER v1.0 — Binary Ground Truth Codec Extraction
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Analiza el primer segmento binario (MPEG-TS o fMP4) de un stream
 * para extraer el codec REAL byte-a-byte. No confía en el manifest —
 * lee los NAL units (HEVC/AVC) o los átomos MP4 (avcC/hvcC/av1C).
 *
 * ESTRATEGIA:
 *   1. El QualityProber ya parseó el manifest y tiene las segment URLs
 *   2. Este módulo descarga los primeros 8-32 KB del primer segmento
 *   3. Detecta si es MPEG-TS o fMP4
 *   4. Usa mux.js (TS) o codem-isoboxer (fMP4) para extraer codec real
 *   5. Compara con lo que dice el manifest → detecta fake 4K, codec mismatch
 *
 * ANTI-509: Solo 1 segmento por (host, profile) — misma agrupación que el prober.
 * BANDWIDTH: Usa HTTP Range: bytes=0-32767 (32KB) — suficiente para init+primer frame.
 *
 * @requires window.muxjs (from mux.vendor.js)
 * @requires window.ISOBoxer (from isoboxer.vendor.js)
 * @license Apache-2.0
 * @version 1.0.0
 */
(function (global) {
    'use strict';

    const VERSION = '1.0.0';
    const SEGMENT_FETCH_BYTES = 32768; // 32 KB — enough for init + first frame
    const SEGMENT_TIMEOUT_MS = 6000;   // 6s timeout

    // ─────────────────────────────────────────────────────────────
    // MPEG-TS MAGIC BYTES: 0x47 sync byte
    // fMP4 MAGIC: starts with 'ftyp' or 'moov' or 'styp' box
    // ─────────────────────────────────────────────────────────────

    const TS_SYNC_BYTE = 0x47;
    const TS_PACKET_SIZE = 188;

    function isTransportStream(data) {
        if (!data || data.length < TS_PACKET_SIZE) return false;
        // Check sync bytes at position 0, 188, 376
        return data[0] === TS_SYNC_BYTE &&
            (data.length < TS_PACKET_SIZE * 2 || data[TS_PACKET_SIZE] === TS_SYNC_BYTE);
    }

    function isFMP4(data) {
        if (!data || data.length < 8) return false;
        // Check for 'ftyp', 'moov', 'styp', or 'moof' box
        const boxType = String.fromCharCode(data[4], data[5], data[6], data[7]);
        return ['ftyp', 'moov', 'styp', 'moof', 'sidx'].includes(boxType);
    }

    // ─────────────────────────────────────────────────────────────
    // MPEG-TS ANALYSIS via mux.js
    // ─────────────────────────────────────────────────────────────

    function analyzeTSWithMux(data) {
        const result = {
            container: 'MPEG-TS',
            videoCodec: '',
            audioCodec: '',
            videoCodecFull: '',
            width: 0,
            height: 0,
            hasVideo: false,
            hasAudio: false,
            pids: [],
            source: 'SEGMENT_TS'
        };

        try {
            const muxjs = global.muxjs;
            if (!muxjs) {
                result.error = 'mux.js not loaded';
                return result;
            }

            // Use the TransportPacketStream + TransportParseStream to inspect PIDs and PMT
            const packetStream = new muxjs.mp2t.TransportPacketStream();
            const parseStream = new muxjs.mp2t.TransportParseStream();
            packetStream.pipe(parseStream);

            const tracks = { video: null, audio: null };
            let pmtParsed = false;

            parseStream.on('data', function (packet) {
                if (packet.type === 'pmt') {
                    pmtParsed = true;
                    // PMT gives us the stream types
                    if (packet.tracks) {
                        for (const track of packet.tracks) {
                            if (track.type === 'video') {
                                tracks.video = track;
                                result.hasVideo = true;
                                // Stream type mapping
                                switch (track.codec) {
                                    case 'avc':
                                        result.videoCodec = 'avc1';
                                        break;
                                    case 'hevc':
                                        result.videoCodec = 'hvc1';
                                        break;
                                    default:
                                        result.videoCodec = track.codec || 'unknown';
                                }
                            } else if (track.type === 'audio') {
                                tracks.audio = track;
                                result.hasAudio = true;
                                switch (track.codec) {
                                    case 'aac':
                                        result.audioCodec = 'mp4a.40.2';
                                        break;
                                    case 'ac3':
                                        result.audioCodec = 'ac-3';
                                        break;
                                    case 'ec3':
                                        result.audioCodec = 'ec-3';
                                        break;
                                    default:
                                        result.audioCodec = track.codec || 'mp4a.40.2';
                                }
                            }
                            result.pids.push({
                                pid: track.id,
                                type: track.type,
                                codec: track.codec
                            });
                        }
                    }
                }
            });

            // Push data through the packet parser
            packetStream.push(new Uint8Array(data));
            packetStream.flush();

            // If PMT wasn't found, try basic stream type detection
            if (!pmtParsed) {
                result.videoCodec = detectCodecFromTSBytes(data);
                result.hasVideo = !!result.videoCodec;
            }
        } catch (e) {
            result.error = e.message;
            // Fallback to manual byte detection
            result.videoCodec = detectCodecFromTSBytes(data);
            result.hasVideo = !!result.videoCodec;
        }

        return result;
    }

    /**
     * Fallback: detect codec from raw TS bytes by looking for NAL unit start codes
     */
    function detectCodecFromTSBytes(data) {
        // Look for H.264 NAL start code (0x00 0x00 0x01) + NAL type
        // H.264 SPS NAL type = 0x67 (0x07 masked)
        // H.265 VPS NAL type = 0x40, SPS = 0x42
        for (let i = 0; i < data.length - 4; i++) {
            if (data[i] === 0x00 && data[i + 1] === 0x00 && data[i + 2] === 0x01) {
                const nalType264 = data[i + 3] & 0x1F;
                if (nalType264 === 7) return 'avc1'; // SPS = H.264

                const nalType265 = (data[i + 3] >> 1) & 0x3F;
                if (nalType265 === 32 || nalType265 === 33) return 'hvc1'; // VPS/SPS = H.265
            }
        }
        return '';
    }

    // ─────────────────────────────────────────────────────────────
    // fMP4 / CMAF ANALYSIS via codem-isoboxer
    // ─────────────────────────────────────────────────────────────

    function analyzeFMP4WithIsoboxer(data) {
        const result = {
            container: 'fMP4',
            videoCodec: '',
            audioCodec: '',
            videoCodecFull: '',
            width: 0,
            height: 0,
            hasVideo: false,
            hasAudio: false,
            brands: [],
            source: 'SEGMENT_FMP4'
        };

        try {
            const ISOBoxer = global.ISOBoxer;
            if (!ISOBoxer) {
                result.error = 'codem-isoboxer not loaded';
                return result;
            }

            const arrayBuffer = data.buffer
                ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
                : data;

            const parsedFile = ISOBoxer.parseBuffer(arrayBuffer);

            // Extract brands from ftyp
            const ftyp = parsedFile.fetch('ftyp');
            if (ftyp) {
                result.brands.push(ftyp.major_brand);
                if (ftyp.compatible_brands) {
                    result.brands.push(...ftyp.compatible_brands);
                }
            }

            // Look for codec-specific boxes in moov/trak/stbl/stsd
            // avcC → H.264, hvcC → H.265, av1C → AV1
            const stsd = parsedFile.fetch('stsd');
            if (stsd && stsd.entries) {
                for (const entry of stsd.entries) {
                    const entryType = entry.type || entry._type || '';

                    // Video codec boxes
                    if (['avc1', 'avc3', 'hvc1', 'hev1', 'av01', 'vp09'].includes(entryType)) {
                        result.hasVideo = true;
                        result.videoCodec = entryType;
                        result.width = entry.width || 0;
                        result.height = entry.height || 0;

                        // Try to get the full codec string from sub-boxes
                        if (entry.avcC) {
                            const c = entry.avcC;
                            result.videoCodecFull = `avc1.${toHex(c.AVCProfileIndication)}${toHex(c.profile_compatibility)}${toHex(c.AVCLevelIndication)}`;
                        } else if (entry.hvcC) {
                            const c = entry.hvcC;
                            const profileSpace = ['', 'A', 'B', 'C'][c.general_profile_space || 0];
                            const tier = c.general_tier_flag ? 'H' : 'L';
                            result.videoCodecFull = `hvc1.${profileSpace}${c.general_profile_idc || 1}.4.${tier}${c.general_level_idc || 153}.B0`;
                        }
                    }

                    // Audio codec boxes
                    if (['mp4a', 'ec-3', 'ac-3', 'Opus', 'fLaC'].includes(entryType)) {
                        result.hasAudio = true;
                        result.audioCodec = entryType === 'mp4a' ? 'mp4a.40.2' : entryType;
                    }
                }
            }
        } catch (e) {
            result.error = e.message;
        }

        return result;
    }

    function toHex(n) {
        return (n || 0).toString(16).padStart(2, '0');
    }

    // ─────────────────────────────────────────────────────────────
    // SINGLE SEGMENT FETCH + ANALYZE
    // ─────────────────────────────────────────────────────────────

    /**
     * Fetch the first segment of a stream and analyze its binary content.
     * Uses HTTP Range to download only the first 32KB.
     *
     * @param {string} segmentUrl - URL of the first segment
     * @returns {Promise<Object>} Analysis result
     */
    async function analyzeSegment(segmentUrl) {
        if (!segmentUrl) return { error: 'NO_URL' };

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), SEGMENT_TIMEOUT_MS);

        try {
            const resp = await fetch(segmentUrl, {
                signal: controller.signal,
                headers: {
                    'Range': `bytes=0-${SEGMENT_FETCH_BYTES - 1}`,
                    'User-Agent': 'Mozilla/5.0 (Linux; Android 12; SHIELD Android TV) AppleWebKit/537.36'
                },
                redirect: 'follow',
                mode: 'cors'
            });

            clearTimeout(timer);

            if (!resp.ok && resp.status !== 206) {
                return { error: `HTTP ${resp.status}` };
            }

            const buffer = await resp.arrayBuffer();
            const data = new Uint8Array(buffer);

            if (data.length < 8) {
                return { error: 'SEGMENT_TOO_SMALL' };
            }

            // Detect container type and analyze
            if (isTransportStream(data)) {
                return analyzeTSWithMux(data);
            } else if (isFMP4(data)) {
                return analyzeFMP4WithIsoboxer(data);
            } else {
                return {
                    error: 'UNKNOWN_CONTAINER',
                    firstBytes: Array.from(data.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(' ')
                };
            }
        } catch (e) {
            clearTimeout(timer);
            if (e.name === 'AbortError') return { error: 'TIMEOUT' };
            return { error: e.message || 'FETCH_FAILED' };
        }
    }

    // ─────────────────────────────────────────────────────────────
    // MANIFEST → SEGMENT URL RESOLVER
    // ─────────────────────────────────────────────────────────────

    /**
     * Given a manifest URL and its parsed playlists (from m3u8-parser),
     * resolve the first segment URL for analysis.
     */
    function resolveFirstSegmentUrl(manifestUrl, parsedManifest) {
        // If it's a media playlist with segments
        if (parsedManifest.segments && parsedManifest.segments.length > 0) {
            const seg = parsedManifest.segments[0];
            return resolveUrl(manifestUrl, seg.uri || seg.url || '');
        }

        // If it's a master playlist, get the first variant's URI
        if (parsedManifest.playlists && parsedManifest.playlists.length > 0) {
            const bestVariant = parsedManifest.playlists[0];
            return resolveUrl(manifestUrl, bestVariant.uri || '');
        }

        // Check for map (init segment)
        if (parsedManifest.segments?.[0]?.map?.uri) {
            return resolveUrl(manifestUrl, parsedManifest.segments[0].map.uri);
        }

        return '';
    }

    function resolveUrl(base, relative) {
        if (!relative) return '';
        if (relative.startsWith('http://') || relative.startsWith('https://')) return relative;
        try {
            return new URL(relative, base).href;
        } catch (e) {
            // Manual resolution for relative paths
            const baseDir = base.substring(0, base.lastIndexOf('/') + 1);
            return baseDir + relative;
        }
    }

    // ─────────────────────────────────────────────────────────────
    // CROSS-VALIDATION: Manifest vs Binary
    // ─────────────────────────────────────────────────────────────

    /**
     * Compare manifest-declared codec with binary-detected codec.
     * Returns corrections if there's a mismatch.
     */
    function crossValidate(manifestData, segmentData) {
        const corrections = {
            codecMismatch: false,
            manifestCodec: manifestData?.videoCodec || '',
            binaryCodec: segmentData?.videoCodec || '',
            correctedCodec: '',
            fake4K: false,
            details: []
        };

        if (!segmentData || segmentData.error || !segmentData.videoCodec) {
            corrections.details.push('Segment analysis unavailable — using manifest data');
            return corrections;
        }

        // Codec family comparison (normalize to family)
        const manifestFamily = (manifestData?.videoCodec || '').split('.')[0].toLowerCase();
        const binaryFamily = segmentData.videoCodec.toLowerCase();

        if (manifestFamily && binaryFamily && manifestFamily !== binaryFamily) {
            corrections.codecMismatch = true;
            corrections.correctedCodec = segmentData.videoCodecFull || segmentData.videoCodec;
            corrections.details.push(
                `CODEC MISMATCH: Manifest says "${manifestFamily}" but binary is "${binaryFamily}"`
            );
        }

        // Use the more specific codec string from binary if available
        if (segmentData.videoCodecFull && !corrections.codecMismatch) {
            corrections.correctedCodec = segmentData.videoCodecFull;
            corrections.details.push(
                `Codec refined: "${manifestData?.videoCodec}" → "${segmentData.videoCodecFull}"`
            );
        }

        // Fake 4K detection: manifest says 3840x2160 but binary shows smaller
        if (segmentData.width > 0 && segmentData.height > 0) {
            const manifestRes = manifestData?.resolution || '';
            const [mW, mH] = manifestRes.split('x').map(Number);
            if (mW >= 3840 && segmentData.width < 3840) {
                corrections.fake4K = true;
                corrections.details.push(
                    `FAKE 4K DETECTED: Manifest claims ${mW}x${mH} but binary is ${segmentData.width}x${segmentData.height}`
                );
            }
        }

        // Audio codec from binary
        if (segmentData.audioCodec) {
            corrections.binaryAudioCodec = segmentData.audioCodec;
        }

        return corrections;
    }

    // ─────────────────────────────────────────────────────────────
    // GLOBAL EXPORT
    // ─────────────────────────────────────────────────────────────

    const ApeSegmentAnalyzer = {
        version: VERSION,
        analyzeSegment: analyzeSegment,
        resolveFirstSegmentUrl: resolveFirstSegmentUrl,
        crossValidate: crossValidate,
        isTransportStream: isTransportStream,
        isFMP4: isFMP4
    };

    if (typeof global !== 'undefined') {
        global.ApeSegmentAnalyzer = ApeSegmentAnalyzer;
    }

})(typeof window !== 'undefined' ? window : globalThis);
