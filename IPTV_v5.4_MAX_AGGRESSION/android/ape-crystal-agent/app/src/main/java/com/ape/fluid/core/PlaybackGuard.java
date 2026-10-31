package com.ape.fluid.core;

/**
 * Player watchdog independent of render callbacks. Call evaluate() from a regular timer.
 * Methods are synchronized because video callbacks and the timer may use different threads.
 * This class never fetches a URL, changes a channel or executes an Android action itself.
 */
public final class PlaybackGuard {
    public enum State { IDLE, STARTING, PLAYING, BUFFERING, PAUSED, SEEKING, ENDED, ERROR }
    public enum Kind { NONE, REPREPARE_CURRENT, TRY_SAME_CHANNEL, STOP_RETRYING }
    public enum Cause { NONE, STARTUP_TIMEOUT, VIDEO_STALL, PROGRESS_STALL, BUFFERING_TIMEOUT, PLAYER_ERROR }

    public static final class Config {
        public long videoStallMs = 1_500L;
        public long progressStallMs = 3_000L;
        public long startupGraceMs = 10_000L;
        public long seekGraceMs = 2_500L;
        public long resumeGraceMs = 1_500L;
        public long bufferingGraceMs = 5_000L;
        public long cooldownMs = 3_000L;
        public long baseBackoffMs = 3_000L;
        public long maxBackoffMs = 30_000L;
        public long stableResetMs = 20_000L;
        public int maxRecoveryAttempts = 3;

        public Config() { }

        private Config(Config value) {
            videoStallMs = value.videoStallMs;
            progressStallMs = value.progressStallMs;
            startupGraceMs = value.startupGraceMs;
            seekGraceMs = value.seekGraceMs;
            resumeGraceMs = value.resumeGraceMs;
            bufferingGraceMs = value.bufferingGraceMs;
            cooldownMs = value.cooldownMs;
            baseBackoffMs = value.baseBackoffMs;
            maxBackoffMs = value.maxBackoffMs;
            stableResetMs = value.stableResetMs;
            maxRecoveryAttempts = value.maxRecoveryAttempts;
            if (videoStallMs <= 0 || progressStallMs <= 0 || startupGraceMs < 0
                    || seekGraceMs < 0 || resumeGraceMs < 0 || bufferingGraceMs <= 0
                    || cooldownMs < 0 || baseBackoffMs <= 0 || maxBackoffMs < baseBackoffMs
                    || stableResetMs <= 0 || maxRecoveryAttempts < 0 || maxRecoveryAttempts > 10) {
                throw new IllegalArgumentException("Invalid watchdog configuration");
            }
        }
    }

    public static final class Action {
        public final Kind kind;
        public final Cause cause;
        /** Every recovery must stay inside this channel. */
        public final String channelId;
        public final String streamId;
        public final int attempt;
        public final long nextRecoveryAtMs;
        public final long bufferedDurationMs;

        private Action(Kind kind, Cause cause, String channelId, String streamId,
                       int attempt, long nextRecoveryAtMs, long bufferedDurationMs) {
            this.kind = kind;
            this.cause = cause;
            this.channelId = channelId;
            this.streamId = streamId;
            this.attempt = attempt;
            this.nextRecoveryAtMs = nextRecoveryAtMs;
            this.bufferedDurationMs = bufferedDurationMs;
        }
    }

    private final Config config;
    private State state = State.IDLE;
    private String channelId = "";
    private String streamId = "";
    private long lastObservedNowMs;
    private long streamStartedAtMs;
    private long stateEnteredAtMs;
    private long graceUntilMs;
    private long lastFrameAtMs;
    private long lastProgressAtMs;
    private long lastPositionMs;
    private long bufferedDurationMs;
    private long nextRecoveryAtMs;
    private long healthySinceMs = -1L;
    private boolean frameSeen;
    private boolean positionSeen;
    private boolean expectVideo = true;
    private boolean stopReported;
    private int recoveryAttempts;

    public PlaybackGuard() { this(new Config()); }
    public PlaybackGuard(Config config) {
        if (config == null) throw new IllegalArgumentException("Configuration required");
        this.config = new Config(config);
    }

    /**
     * Call for an explicit new channel or when preparing a variant of the current channel.
     * A variant change preserves the retry budget; otherwise a failing playlist could loop forever.
     */
    public synchronized void onStreamChanged(String channelId, String streamId, long nowMs) {
        long now = monotonic(nowMs);
        String channel = clean(channelId);
        String stream = clean(streamId);
        if (channel.isEmpty() || stream.isEmpty()) throw new IllegalArgumentException("Stream identity required");
        if (!channel.equals(this.channelId)) resetBudget(now);
        this.channelId = channel;
        this.streamId = stream;
        this.state = State.STARTING;
        this.stateEnteredAtMs = now;
        this.streamStartedAtMs = now;
        this.graceUntilMs = add(now, config.startupGraceMs);
        this.lastFrameAtMs = now;
        this.lastProgressAtMs = now;
        this.bufferedDurationMs = 0L;
        this.frameSeen = false;
        this.positionSeen = false;
        this.healthySinceMs = -1L;
    }

    /** Audio-only playback must disable frame monitoring explicitly. */
    public synchronized void setExpectVideo(boolean expectVideo, long nowMs) {
        long now = monotonic(nowMs);
        if (this.expectVideo != expectVideo) {
            this.expectVideo = expectVideo;
            this.lastFrameAtMs = now;
            this.frameSeen = false;
            this.graceUntilMs = Math.max(graceUntilMs, add(now, config.resumeGraceMs));
            this.healthySinceMs = -1L;
        }
    }

    public synchronized void setPlaybackState(State next, long nowMs) {
        if (next == null) throw new IllegalArgumentException("Playback state required");
        long now = monotonic(nowMs);
        if (state == next) return;
        State previous = state;
        state = next;
        stateEnteredAtMs = now;
        healthySinceMs = -1L;
        if (next == State.SEEKING) {
            graceUntilMs = add(now, config.seekGraceMs);
        } else if (next == State.PLAYING && (previous == State.PAUSED || previous == State.SEEKING || previous == State.IDLE)) {
            lastFrameAtMs = now;
            lastProgressAtMs = now;
            graceUntilMs = add(now, previous == State.SEEKING ? config.seekGraceMs : config.resumeGraceMs);
        }
    }

    public synchronized void onFrame(long nowMs) {
        long now = monotonic(nowMs);
        // Once the first real frame arrives, startup has succeeded. Do not keep
        // hiding an immediately subsequent stall behind the startup allowance.
        if (!frameSeen && (state == State.STARTING || state == State.PLAYING || state == State.BUFFERING)) {
            graceUntilMs = Math.min(graceUntilMs, now);
        }
        lastFrameAtMs = now;
        frameSeen = true;
    }

    /** bufferedMs is duration ahead of the playhead, not the absolute buffered position. */
    public synchronized void onProgress(long positionMs, long bufferedMs, long nowMs) {
        long now = monotonic(nowMs);
        bufferedDurationMs = Math.max(0L, bufferedMs);
        if (positionMs >= 0L) {
            if (!positionSeen || positionMs != lastPositionMs) lastProgressAtMs = now;
            lastPositionMs = positionMs;
            positionSeen = true;
        }
    }

    /** Use only for an explicit user retry; automatic fallback must preserve the budget. */
    public synchronized void manualRetry(long nowMs) {
        long now = monotonic(nowMs);
        resetBudget(now);
        if (!channelId.isEmpty()) onStreamChanged(channelId, streamId, now);
    }

    public synchronized Action evaluate(long nowMs) {
        long now = monotonic(nowMs);
        if (channelId.isEmpty() || state == State.IDLE || state == State.PAUSED || state == State.ENDED) {
            healthySinceMs = -1L;
            return action(Kind.NONE, Cause.NONE);
        }
        Cause cause = detect(now);
        if (cause == Cause.NONE) {
            if (healthy(now)) {
                if (healthySinceMs < 0L) healthySinceMs = now;
                if (now - healthySinceMs >= config.stableResetMs) resetBudget(now);
            } else healthySinceMs = -1L;
            return action(Kind.NONE, Cause.NONE);
        }
        healthySinceMs = -1L;
        if (now < nextRecoveryAtMs) return action(Kind.NONE, cause);
        if (recoveryAttempts >= config.maxRecoveryAttempts) {
            if (stopReported) return action(Kind.NONE, cause);
            stopReported = true;
            return action(Kind.STOP_RETRYING, cause);
        }
        recoveryAttempts++;
        nextRecoveryAtMs = add(now, Math.max(config.cooldownMs, backoff(recoveryAttempts)));
        return action(recoveryAttempts == 1 ? Kind.REPREPARE_CURRENT : Kind.TRY_SAME_CHANNEL, cause);
    }

    public synchronized int getRecoveryAttempts() { return recoveryAttempts; }
    public synchronized State getState() { return state; }
    public synchronized boolean isRetryBudgetExhausted() { return recoveryAttempts >= config.maxRecoveryAttempts; }

    private Cause detect(long now) {
        // A player error is explicit evidence and does not need a frame-based startup timeout.
        if (state == State.ERROR) return Cause.PLAYER_ERROR;
        if (now < graceUntilMs) return Cause.NONE;
        if (state == State.SEEKING) return Cause.PROGRESS_STALL;
        if (state == State.BUFFERING) {
            return now - stateEnteredAtMs >= config.bufferingGraceMs ? Cause.BUFFERING_TIMEOUT : Cause.NONE;
        }
        if (state == State.STARTING) {
            return now - streamStartedAtMs >= config.startupGraceMs ? Cause.STARTUP_TIMEOUT : Cause.NONE;
        }
        if (state != State.PLAYING) return Cause.NONE;
        if (expectVideo) {
            if (!frameSeen) return now - streamStartedAtMs >= config.startupGraceMs ? Cause.STARTUP_TIMEOUT : Cause.NONE;
            if (now - lastFrameAtMs >= config.videoStallMs) return Cause.VIDEO_STALL;
        }
        if (now - lastProgressAtMs >= config.progressStallMs) return Cause.PROGRESS_STALL;
        return Cause.NONE;
    }

    private boolean healthy(long now) {
        return state == State.PLAYING && now >= graceUntilMs
                && (!expectVideo || (frameSeen && now - lastFrameAtMs < config.videoStallMs))
                && positionSeen && now - lastProgressAtMs < config.progressStallMs;
    }

    private void resetBudget(long now) {
        recoveryAttempts = 0;
        nextRecoveryAtMs = now;
        stopReported = false;
        healthySinceMs = -1L;
    }

    private long backoff(int attempt) {
        long delay = config.baseBackoffMs;
        for (int i = 1; i < attempt && delay < config.maxBackoffMs; i++) {
            if (delay > config.maxBackoffMs / 2L) return config.maxBackoffMs;
            delay *= 2L;
        }
        return Math.min(delay, config.maxBackoffMs);
    }

    private Action action(Kind kind, Cause cause) {
        return new Action(kind, cause, channelId, streamId, recoveryAttempts, nextRecoveryAtMs, bufferedDurationMs);
    }

    /** A regressing caller timestamp never creates a negative duration or resets the budget. */
    private long monotonic(long nowMs) {
        if (nowMs < 0L) throw new IllegalArgumentException("Monotonic time must be nonnegative");
        lastObservedNowMs = Math.max(lastObservedNowMs, nowMs);
        return lastObservedNowMs;
    }

    private static long add(long time, long duration) {
        return duration > Long.MAX_VALUE - time ? Long.MAX_VALUE : time + duration;
    }

    private static String clean(String value) { return value == null ? "" : value.trim(); }
}
