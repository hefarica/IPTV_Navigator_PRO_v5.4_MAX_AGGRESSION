package com.ape.fluid.core;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/** Pure selection logic. All times supplied to this class use one monotonic clock. */
public final class FluidPolicy {
    public enum Reason { SELECTED, KEEP_CURRENT, NO_SAFE_CANDIDATE }

    public static final class Stream {
        public final String id;
        public final String channelId;
        public final String codec;
        /** Zero means unknown; dimensions describe the encoded stream, not the display. */
        public final int width;
        public final int height;
        /** Bits per second, never Mbps. Zero means unknown. */
        public final long bitrateBps;
        public final boolean hdr;
        public final boolean codecMismatch;
        public final boolean knownBad;

        public Stream(String id, String channelId, String codec, int width, int height,
                      long bitrateBps, boolean hdr, boolean codecMismatch, boolean knownBad) {
            this.id = clean(id);
            this.channelId = clean(channelId);
            this.codec = normalizeCodec(codec);
            this.width = Math.max(0, width);
            this.height = Math.max(0, height);
            this.bitrateBps = Math.max(0L, bitrateBps);
            this.hdr = hdr;
            this.codecMismatch = codecMismatch;
            this.knownBad = knownBad;
        }
    }

    public static final class Capabilities {
        public final Set<String> codecs;
        public final int maxWidth;
        public final int maxHeight;
        /** Zero disables this additional application limit. */
        public final long maxBitrateBps;
        public final boolean hdrSupported;
        public final boolean allowUnknownCodec;
        public final boolean allowUnknownResolution;

        public Capabilities(Set<String> codecs, int maxWidth, int maxHeight,
                            long maxBitrateBps, boolean hdrSupported,
                            boolean allowUnknownCodec, boolean allowUnknownResolution) {
            if (maxWidth <= 0 || maxHeight <= 0 || maxBitrateBps < 0) {
                throw new IllegalArgumentException("Invalid playback limits");
            }
            LinkedHashSet<String> normalized = new LinkedHashSet<String>();
            if (codecs != null) {
                for (String codec : codecs) {
                    String value = normalizeCodec(codec);
                    if (!value.isEmpty()) normalized.add(value);
                }
            }
            this.codecs = Collections.unmodifiableSet(normalized);
            this.maxWidth = maxWidth;
            this.maxHeight = maxHeight;
            this.maxBitrateBps = maxBitrateBps;
            this.hdrSupported = hdrSupported;
            this.allowUnknownCodec = allowUnknownCodec;
            this.allowUnknownResolution = allowUnknownResolution;
        }
    }

    public static final class Directive {
        public final String streamId;
        public final String channelId;
        public final long receivedAtMs;
        public final long ttlMs;

        /** Record receipt locally. Do not pass a server wall-clock timestamp here. */
        public Directive(String streamId, String channelId, long receivedAtMs, long ttlMs) {
            this.streamId = clean(streamId);
            this.channelId = clean(channelId);
            this.receivedAtMs = receivedAtMs;
            this.ttlMs = ttlMs;
        }
    }

    public static final class Decision {
        /** Null means there is no admissible candidate; do not play a rejected stream. */
        public final Stream selected;
        public final Reason reason;
        public final boolean directiveApplied;
        public final String directiveStatus;
        public final Map<String, String> rejected;

        private Decision(Stream selected, Reason reason, boolean directiveApplied,
                         String directiveStatus, Map<String, String> rejected) {
            this.selected = selected;
            this.reason = reason;
            this.directiveApplied = directiveApplied;
            this.directiveStatus = directiveStatus;
            this.rejected = Collections.unmodifiableMap(new LinkedHashMap<String, String>(rejected));
        }
    }

    private final double bandwidthHeadroom;
    private final long maxDirectiveTtlMs;

    /** Reserve 30% throughput headroom. A server directive may live at most 30 seconds. */
    public FluidPolicy() { this(1.30, 30_000L); }

    public FluidPolicy(double bandwidthHeadroom, long maxDirectiveTtlMs) {
        if (Double.isNaN(bandwidthHeadroom) || Double.isInfinite(bandwidthHeadroom)
                || bandwidthHeadroom < 1.0 || maxDirectiveTtlMs <= 0L) {
            throw new IllegalArgumentException("Invalid policy configuration");
        }
        this.bandwidthHeadroom = bandwidthHeadroom;
        this.maxDirectiveTtlMs = maxDirectiveTtlMs;
    }

    /**
     * Select only variants of channelId. A viable current stream is retained to avoid
     * unnecessary oscillation, unless a valid, safe directive requests another variant.
     * availableBandwidthBps <= 0 means that no reliable throughput estimate is available.
     */
    public Decision select(List<Stream> input, String channelId, String currentStreamId,
                           Capabilities capabilities, long availableBandwidthBps,
                           Directive directive, long nowMonotonicMs) {
        if (capabilities == null) throw new IllegalArgumentException("Capabilities required");
        if (nowMonotonicMs < 0L) throw new IllegalArgumentException("Monotonic time must be nonnegative");
        String channel = clean(channelId);
        String current = clean(currentStreamId);
        Map<String, String> rejected = new LinkedHashMap<String, String>();
        List<Stream> safe = new ArrayList<Stream>();
        Map<String, Integer> ids = new HashMap<String, Integer>();
        List<Stream> candidates = input == null ? Collections.<Stream>emptyList() : input;
        for (Stream stream : candidates) {
            if (stream != null && channel.equals(stream.channelId)) {
                Integer count = ids.get(stream.id);
                ids.put(stream.id, count == null ? 1 : count + 1);
            }
        }
        int index = 0;
        for (Stream stream : candidates) {
            String key = stream == null || stream.id.isEmpty() ? "[invalid-" + index + "]" : stream.id;
            if (stream != null && !channel.equals(stream.channelId) && !stream.id.isEmpty()) {
                // A playlist may reuse variant ids across channels. Do not label a
                // selected local id as rejected because an unrelated channel reused it.
                key = stream.channelId + "/" + stream.id;
            }
            index++;
            String failure;
            if (stream == null) failure = "null_candidate";
            else if (channel.isEmpty() || stream.id.isEmpty() || stream.channelId.isEmpty()) failure = "missing_identity";
            else if (!channel.equals(stream.channelId)) failure = "different_channel";
            else if (ids.get(stream.id).intValue() != 1) failure = "duplicate_stream_id";
            else failure = rejection(stream, capabilities, availableBandwidthBps);
            if (failure == null) safe.add(stream);
            else rejected.put(key, failure);
        }

        String directiveStatus = directiveStatus(directive, channel, nowMonotonicMs);
        if ("valid".equals(directiveStatus)) {
            for (Stream stream : safe) {
                if (stream.id.equals(directive.streamId)) {
                    return new Decision(stream, stream.id.equals(current) ? Reason.KEEP_CURRENT : Reason.SELECTED,
                            true, "applied", rejected);
                }
            }
            directiveStatus = "candidate_unavailable_or_rejected";
        }
        for (Stream stream : safe) {
            if (stream.id.equals(current)) {
                return new Decision(stream, Reason.KEEP_CURRENT, false, directiveStatus, rejected);
            }
        }
        Stream best = null;
        for (Stream stream : safe) {
            if (best == null || preferable(stream, best)) best = stream;
        }
        return new Decision(best, best == null ? Reason.NO_SAFE_CANDIDATE : Reason.SELECTED,
                false, directiveStatus, rejected);
    }

    private String rejection(Stream stream, Capabilities capabilities, long bandwidthBps) {
        if (stream.knownBad) return "known_bad";
        if (stream.codecMismatch) return "codec_mismatch";
        if (stream.codec.isEmpty()) {
            if (!capabilities.allowUnknownCodec) return "unknown_codec";
        } else if (!capabilities.codecs.contains(stream.codec)) return "unsupported_codec";
        if (stream.width == 0 || stream.height == 0) {
            if (!capabilities.allowUnknownResolution) return "unknown_resolution";
        }
        if (stream.width > capabilities.maxWidth || stream.height > capabilities.maxHeight) return "resolution_limit";
        if (stream.hdr && !capabilities.hdrSupported) return "hdr_not_supported";
        if (capabilities.maxBitrateBps > 0L && stream.bitrateBps > capabilities.maxBitrateBps) return "bitrate_limit";
        if (bandwidthBps > 0L && stream.bitrateBps > 0L
                && (double) stream.bitrateBps * bandwidthHeadroom > (double) bandwidthBps) return "insufficient_bandwidth";
        return null;
    }

    private String directiveStatus(Directive directive, String channel, long nowMs) {
        if (directive == null) return "none";
        if (!channel.equals(directive.channelId) || channel.isEmpty()) return "different_channel";
        if (directive.streamId.isEmpty() || directive.ttlMs <= 0L || directive.receivedAtMs < 0L) return "invalid";
        if (nowMs < directive.receivedAtMs) return "future_receipt";
        long ttl = Math.min(directive.ttlMs, maxDirectiveTtlMs);
        if (nowMs - directive.receivedAtMs >= ttl) return "expired";
        return "valid";
    }

    private static boolean preferable(Stream candidate, Stream current) {
        // Prefer known formats; among admissible formats prefer greater encoded resolution.
        boolean candidateKnown = !candidate.codec.isEmpty() && candidate.width > 0 && candidate.height > 0;
        boolean currentKnown = !current.codec.isEmpty() && current.width > 0 && current.height > 0;
        if (candidateKnown != currentKnown) return candidateKnown;
        long candidatePixels = (long) candidate.width * candidate.height;
        long currentPixels = (long) current.width * current.height;
        if (candidatePixels != currentPixels) return candidatePixels > currentPixels;
        if (candidate.bitrateBps > 0L && current.bitrateBps > 0L && candidate.bitrateBps != current.bitrateBps) {
            return candidate.bitrateBps < current.bitrateBps;
        }
        return candidate.id.compareTo(current.id) < 0;
    }

    public static String normalizeCodec(String codec) {
        String value = clean(codec).toLowerCase(Locale.ROOT);
        if (value.equals("avc") || value.equals("h264") || value.equals("h.264") || value.equals("avc1")) return "video/avc";
        if (value.equals("hevc") || value.equals("h265") || value.equals("h.265") || value.equals("hvc1") || value.equals("hev1")) return "video/hevc";
        if (value.equals("vp9") || value.equals("vp09")) return "video/x-vnd.on2.vp9";
        if (value.equals("av1") || value.equals("av01")) return "video/av01";
        if (value.equals("mpeg2") || value.equals("mpeg-2")) return "video/mpeg2";
        if (value.equals("unknown")) return "";
        return value;
    }

    private static String clean(String value) { return value == null ? "" : value.trim(); }
}
