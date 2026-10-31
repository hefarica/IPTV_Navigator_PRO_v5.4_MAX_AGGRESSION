package com.ape.fluid;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.MediaCodecInfo;
import android.media.MediaCodecList;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.WindowManager;
import android.widget.Toast;
import com.ape.fluid.core.FluidPolicy;
import com.ape.fluid.core.PlaybackGuard;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Integration hooks invoked from the original player's DEX. Media3 1.3.1 remains packaged. */
public final class FluidBridge {
    private static final String EXO = "androidx.media3.exoplayer.ExoPlayer";
    private static final String PLAYER = "androidx.media3.common.Player";
    private static final String DATASOURCE = "androidx.media3.datasource.DataSource$Factory";
    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static final Map<Object, Session> SESSIONS = new HashMap<Object, Session>();
    private static volatile Object diskCache;
    private static volatile boolean cacheStarting;
    private static volatile String cacheStatus = "pendiente";

    private FluidBridge() { }

    private static Class<?> type(String name) throws Exception { return Class.forName(name); }
    private static Object create(String name, Class<?>[] parameters, Object... values) throws Exception {
        return type(name).getConstructor(parameters).newInstance(values);
    }
    private static Object call(String api, Object target, String method, Class<?>[] parameters, Object... values) throws Exception {
        return type(api).getMethod(method, parameters).invoke(target, values);
    }
    private static Object get(Object target, String api, String method) throws Exception {
        return call(api, target, method, new Class<?>[0]);
    }
    private static long number(Object value) { return value instanceof Number ? ((Number) value).longValue() : 0L; }
    private static Object defaultValue(Class<?> value) {
        if (value == boolean.class) return false;
        if (value == int.class) return 0;
        if (value == long.class) return 0L;
        if (value == float.class) return 0f;
        if (value == double.class) return 0d;
        if (value == byte.class) return (byte) 0;
        if (value == short.class) return (short) 0;
        if (value == char.class) return (char) 0;
        return null;
    }

    public static void warmup(final Context context) {
        if (!FluidStore.prefs(context).getBoolean("cache_enabled", true) || diskCache != null || cacheStarting) return;
        synchronized (FluidBridge.class) {
            if (diskCache != null || cacheStarting) return;
            cacheStarting = true;
        }
        final Context app = context.getApplicationContext();
        new Thread(new Runnable() { public void run() {
            try {
                long cap = Math.max(16, Math.min(256, FluidStore.prefs(app).getInt("cache_mib", 64))) * 1024L * 1024L;
                Object evictor = create("androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor", new Class<?>[]{long.class}, cap);
                Object database = create("androidx.media3.database.StandaloneDatabaseProvider", new Class<?>[]{Context.class}, app);
                diskCache = create("androidx.media3.datasource.cache.SimpleCache",
                        new Class<?>[]{File.class, type("androidx.media3.datasource.cache.CacheEvictor"), type("androidx.media3.database.DatabaseProvider")},
                        new File(app.getCacheDir(), "fluid_segments"), evictor, database);
                cacheStatus = "disponible (" + (cap / 1024 / 1024) + " MiB)";
            } catch (Exception ex) {
                cacheStatus = "desactivada por error; fuente directa";
                FluidStore.event(app, "CACHE_UNAVAILABLE", ex.getClass().getSimpleName());
            } finally { cacheStarting = false; }
        }}, "ape-cache-init").start();
    }

    public static Object configureBuilder(Context context, Object builder) {
        warmup(context);
        SharedPreferences preferences = FluidStore.prefs(context);
        String profile = preferences.getString("buffer_profile", "balanced");
        int min = 10000, max = 30000, start = 1000, resume = 2500, bytes = 32 * 1024 * 1024;
        if ("max".equals(profile)) { min = 30000; max = 120000; start = 2000; resume = 5000; bytes = 256 * 1024 * 1024; }
        else if ("reserve".equals(profile)) { min = 15000; max = 45000; start = 1500; resume = 3000; bytes = 48 * 1024 * 1024; }
        else if ("low_latency".equals(profile)) { min = 3000; max = 10000; start = 700; resume = 1500; bytes = 24 * 1024 * 1024; }
        try {
            String name = "androidx.media3.exoplayer.DefaultLoadControl$Builder";
            Object load = create(name, new Class<?>[0]);
            call(name, load, "setBufferDurationsMs", new Class<?>[]{int.class,int.class,int.class,int.class}, min,max,start,resume);
            call(name, load, "setTargetBufferBytes", new Class<?>[]{int.class}, bytes);
            call(name, load, "setPrioritizeTimeOverSizeThresholds", new Class<?>[]{boolean.class}, false);
            Object control = get(load, name, "build");
            call(EXO + "$Builder", builder, "setLoadControl", new Class<?>[]{type("androidx.media3.exoplayer.LoadControl")}, control);
            FluidStore.event(context, "BUFFER_CONFIGURED", profile);
        } catch (Exception ex) { FluidStore.event(context, "BUFFER_CONFIG_FAILED", ex.getClass().getSimpleName()); }
        try {
            String name = "androidx.media3.exoplayer.DefaultRenderersFactory";
            Object factory = create(name, new Class<?>[]{Context.class}, context);
            call(name, factory, "setEnableDecoderFallback", new Class<?>[]{boolean.class}, true);
            call(EXO + "$Builder", builder, "setRenderersFactory", new Class<?>[]{type("androidx.media3.exoplayer.RenderersFactory")}, factory);
        } catch (Exception ex) { FluidStore.event(context, "DECODER_FALLBACK_UNAVAILABLE", ex.getClass().getSimpleName()); }
        return builder;
    }

    public static List<Object> effects(Context context) {
        return effectsFor(context, FluidStore.prefs(context).getString("image_profile", "crystal_uhd"));
    }

    private static List<Object> effectsFor(Context context, String profile) {
        if (!FluidStore.prefs(context).getBoolean("enhance_enabled", true)) return Collections.emptyList();
        if ("natural".equals(profile)) return Collections.emptyList();
        try {
            SharedPreferences p = FluidStore.prefs(context);
            float sharpen = Math.max(0, Math.min(100, p.getInt("sharpen_percent", 35))) / 100f;
            float denoise = Math.max(0, Math.min(100, p.getInt("denoise_percent", 20))) / 100f;
            if (!"lite".equals(profile)) {
                float vibrance = Math.max(0, Math.min(15, p.getInt("vibrance_percent", 5))) / 100f;
                float contrast = Math.max(0, Math.min(20, p.getInt("microcontrast_percent", 6))) / 100f;
                int[] output = "crystal_uhd".equals(profile) ? outputLimit(context) : new int[]{0, 0};
                return Collections.<Object>singletonList(new CrystalGlEffect(sharpen, denoise, vibrance, contrast, output[0], output[1]));
            }
            if (sharpen == 0f && denoise == 0f) return Collections.emptyList();
            return Collections.singletonList(create("com.ape.crystalagent.ApeUltraEnhanceGlEffect",
                    new Class<?>[]{float.class, float.class}, sharpen, denoise));
        } catch (Exception ex) {
            FluidStore.event(context, "EFFECT_UNAVAILABLE", ex.getClass().getSimpleName());
            return Collections.emptyList();
        }
    }

    private static int[] outputLimit(Context context) {
        int width = context.getResources().getDisplayMetrics().widthPixels;
        int height = context.getResources().getDisplayMetrics().heightPixels;
        try {
            Object display = ((WindowManager) context.getSystemService(Context.WINDOW_SERVICE)).getDefaultDisplay();
            Object mode = display.getClass().getMethod("getMode").invoke(display);
            width = ((Number) mode.getClass().getMethod("getPhysicalWidth").invoke(mode)).intValue();
            height = ((Number) mode.getClass().getMethod("getPhysicalHeight").invoke(mode)).intValue();
        } catch (Exception ignored) { }
        int cap = FluidStore.prefs(context).getInt("max_height", 2160) <= 1080 ? 1080 : 2160;
        return new int[]{Math.min(cap == 1080 ? 1920 : 3840, Math.max(1, width)), Math.min(cap, Math.max(1, height))};
    }

    /** Identity RGB matrix uses Media3's HDR-aware implementation, not the custom SDR shader. */
    public static Object hdrPassThrough(Context context) {
        try {
            Object builder = create("androidx.media3.effect.RgbAdjustment$Builder", new Class<?>[0]);
            Object effect = get(builder, "androidx.media3.effect.RgbAdjustment$Builder", "build");
            return call("androidx.media3.effect.RgbAdjustment", effect, "toGlShaderProgram",
                    new Class<?>[]{Context.class, boolean.class}, context, true);
        } catch (Exception ex) { throw new IllegalStateException("HDR identity shader unavailable", ex); }
    }

    public static Object dataSource(Context context, Object upstream) {
        try {
            String api = "androidx.media3.datasource.DefaultHttpDataSource$Factory";
            call(api, upstream, "setConnectTimeoutMs", new Class<?>[]{int.class}, 15000);
            call(api, upstream, "setReadTimeoutMs", new Class<?>[]{int.class}, 30000);
        } catch (Exception ignored) { }
        if (!FluidStore.prefs(context).getBoolean("cache_enabled", true)) return upstream;
        if (diskCache == null) { warmup(context); return upstream; }
        try {
            String api = "androidx.media3.datasource.cache.CacheDataSource$Factory";
            Object factory = create(api, new Class<?>[0]);
            call(api, factory, "setCache", new Class<?>[]{type("androidx.media3.datasource.cache.Cache")}, diskCache);
            call(api, factory, "setUpstreamDataSourceFactory", new Class<?>[]{type(DATASOURCE)}, upstream);
            call(api, factory, "setFlags", new Class<?>[]{int.class}, 2); // FLAG_IGNORE_CACHE_ON_ERROR
            return factory;
        } catch (Exception ex) {
            FluidStore.event(context, "CACHE_FACTORY_FAILED", ex.getClass().getSimpleName()); return upstream;
        }
    }

    /** HLS manifests and encryption keys must always bypass the media-segment cache. */
    public static Object hlsFactory(Context context, final Object upstream) throws Exception {
        final Object cached = dataSource(context, upstream);
        final Class<?> hlsApi = type("androidx.media3.exoplayer.hls.HlsDataSourceFactory");
        Object routing = Proxy.newProxyInstance(hlsApi.getClassLoader(), new Class<?>[]{hlsApi}, new InvocationHandler() {
            @Override public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
                if (method.getName().equals("equals")) return args != null && proxy == args[0];
                if (method.getName().equals("hashCode")) return System.identityHashCode(proxy);
                if (method.getName().equals("toString")) return "APEFluidHlsDataSources";
                if (method.getName().equals("createDataSource")) {
                    int dataType = ((Number) args[0]).intValue();
                    Object source = dataType == 1 || dataType == 2 ? cached : upstream;
                    return get(source, DATASOURCE, "createDataSource");
                }
                return defaultValue(method.getReturnType());
            }
        });
        return create("androidx.media3.exoplayer.hls.HlsMediaSource$Factory", new Class<?>[]{hlsApi}, routing);
    }

    public static void attach(Context context, Object player, String url, String ua) {
        detach(player);
        try {
            FluidStore.validateMediaUrl(url);
            Session session = new Session(context, player, url, ua);
            synchronized (SESSIONS) { SESSIONS.put(player, session); }
            session.start();
        } catch (Exception ex) {
            detach(player);
            FluidStore.event(context, "SUPERVISOR_UNAVAILABLE", ex.getClass().getSimpleName());
        }
    }

    public static void detach(Object player) {
        Session session;
        synchronized (SESSIONS) { session = SESSIONS.remove(player); }
        if (session != null) session.close();
    }

    public static void onNewIntent(Activity activity, Intent intent) {
        try {
            String url = intent.getStringExtra("url");
            if (url == null && intent.getData() != null) url = intent.getData().toString();
            url = FluidStore.validateMediaUrl(url);
            String ua = intent.getStringExtra("ua");
            if (ua == null || ua.isEmpty()) ua = (String) type("com.ape.crystalagent.ApePlayer").getField("DEFAULT_UA").get(null);
            if (ua.length() > 512 || ua.indexOf('\r') >= 0 || ua.indexOf('\n') >= 0) return;
            java.lang.reflect.Field apeField = activity.getClass().getDeclaredField("ape");
            java.lang.reflect.Field playerField = activity.getClass().getDeclaredField("player");
            apeField.setAccessible(true); playerField.setAccessible(true);
            Object ape = apeField.get(activity), player = playerField.get(activity);
            if (ape == null || player == null) return;
            activity.setIntent(intent);
            call("com.ape.crystalagent.ApePlayer", ape, "playChannel", new Class<?>[]{type(EXO),String.class,String.class}, player,url,ua);
        } catch (Exception ex) { FluidStore.event(activity, "EXTERNAL_PLAYBACK_REJECTED", ex.getClass().getSimpleName()); }
    }

    public static void onBackground(Activity activity) {
        try {
            java.lang.reflect.Field field = activity.getClass().getDeclaredField("player"); field.setAccessible(true);
            Object player = field.get(activity);
            if (player != null) call(PLAYER, player, "setPlayWhenReady", new Class<?>[]{boolean.class}, false);
        } catch (Exception ex) { FluidStore.event(activity, "BACKGROUND_PAUSE_FAILED", ex.getClass().getSimpleName()); }
    }

    public static String diagnostics(Context context) {
        return "APE Fluid 2.4.0 integrada\nPaquete: " + context.getPackageName()
                + "\nCaché local: " + cacheStatus + "\n\n"
                + FluidStore.prefs(context).getString("last_report", "Todavía no hay una sesión de reproducción medida.")
                + "\n\nEl detector observa progreso y fotogramas programados por Media3; no inspecciona los píxeles del televisor."
                + "\nLos filtros son espaciales SDR. No se anuncia RIFE ni superresolución neuronal."
                + "\nLas URLs y el token de control se excluyen de estos diagnósticos.";
    }

    private static Set<String> codecCapabilities() {
        Set<String> values = new LinkedHashSet<String>();
        try {
            for (int i = 0; i < MediaCodecList.getCodecCount(); i++) {
                MediaCodecInfo info = MediaCodecList.getCodecInfoAt(i);
                if (info.isEncoder()) continue;
                for (String value : info.getSupportedTypes()) if (value.startsWith("video/")) values.add(value);
            }
        } catch (Exception ignored) { }
        return values;
    }

    private static boolean hdrSupported(Context context) {
        try {
            Object display = ((WindowManager) context.getSystemService(Context.WINDOW_SERVICE)).getDefaultDisplay();
            Object caps = display.getClass().getMethod("getHdrCapabilities").invoke(display);
            return ((int[]) caps.getClass().getMethod("getSupportedHdrTypes").invoke(caps)).length > 0;
        } catch (Exception ignored) { return false; }
    }

    private static final class Session implements Runnable, InvocationHandler, FluidControlClient.Callback {
        private final Context context;
        private final Object player;
        private final Handler handler;
        private final PlaybackGuard guard = new PlaybackGuard();
        private final FluidPolicy policy = new FluidPolicy();
        private final List<FluidStore.Variant> variants;
        private final Set<String> failed = new HashSet<String>();
        private final FluidPolicy.Capabilities capabilities;
        private final boolean automaticRecovery;
        private volatile FluidStore.Variant current;
        private FluidControlClient control;
        private Object playerListener, frameListener, analyticsListener;
        private volatile boolean closed;
        private volatile long frameCount, measuredBandwidthBps;
        private volatile int width, height, droppedFrames;
        private volatile String videoCodec = "desconocido";
        private volatile long startedAt, firstFrameDelayMs = -1;
        private long lastReport, lastDirectiveSwitch, qualityWindowAt, qualityFrameCount;
        private int qualityDroppedAt;
        private boolean imageReduced;
        private long seekUntil;
        private boolean errorState, stopped, frameListenerAttached;

        Session(Context context, Object player, String url, String ua) throws Exception {
            this.context = context.getApplicationContext(); this.player = player;
            Object looper = get(player, PLAYER, "getApplicationLooper");
            handler = new Handler((Looper) looper);
            variants = FluidStore.variantsFor(context, url, ua);
            current = variants.get(0);
            for (FluidStore.Variant value : variants) if (value.url.equals(url)) current = value;
            // Preserve UA supplied by the launcher, even when the profile used the default.
            if (current.ua == null || current.ua.isEmpty()) current.ua = ua;
            SharedPreferences prefs = FluidStore.prefs(context);
            int maxHeight = prefs.getInt("max_height", 2160) <= 1080 ? 1080 : 2160;
            capabilities = new FluidPolicy.Capabilities(codecCapabilities(), maxHeight == 1080 ? 1920 : 3840,
                    maxHeight, 0L, hdrSupported(context), true, true);
            automaticRecovery = prefs.getBoolean("recovery_enabled", true);
            if (context instanceof Activity) ((Activity) context).getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        }

        void start() throws Exception {
            startedAt = SystemClock.elapsedRealtime();
            guard.onStreamChanged(current.channelId, current.id, startedAt);
            playerListener = listener("androidx.media3.common.Player$Listener");
            call(PLAYER, player, "addListener", new Class<?>[]{type("androidx.media3.common.Player$Listener")}, playerListener);
            try {
                frameListener = listener("androidx.media3.exoplayer.video.VideoFrameMetadataListener");
                call(EXO, player, "setVideoFrameMetadataListener", new Class<?>[]{type("androidx.media3.exoplayer.video.VideoFrameMetadataListener")}, frameListener);
                frameListenerAttached = true;
            } catch (Exception ex) {
                guard.setExpectVideo(false, startedAt);
                FluidStore.event(context, "VIDEO_MONITOR_UNAVAILABLE", ex.getClass().getSimpleName());
            }
            try {
                analyticsListener = listener("androidx.media3.exoplayer.analytics.AnalyticsListener");
                call(EXO, player, "addAnalyticsListener", new Class<?>[]{type("androidx.media3.exoplayer.analytics.AnalyticsListener")}, analyticsListener);
            } catch (Exception ex) { FluidStore.event(context, "ANALYTICS_UNAVAILABLE", ex.getClass().getSimpleName()); }
            applyTrackLimit();
            if (FluidStore.prefs(context).getBoolean("vps_enabled", false)) {
                try { control = new FluidControlClient(context, this); }
                catch (Exception ex) { FluidStore.event(context, "CONTROL_CONFIG_INVALID", ex.getClass().getSimpleName()); }
            }
            FluidStore.event(context, "SESSION_STARTED", current.channelId + "/" + current.id);
            handler.post(this);
        }

        private Object listener(String name) throws Exception {
            Class<?> api = type(name); return Proxy.newProxyInstance(api.getClassLoader(), new Class<?>[]{api}, this);
        }

        @Override public Object invoke(Object proxy, Method method, Object[] args) {
            String name = method.getName();
            if (name.equals("equals")) return args != null && args.length == 1 && proxy == args[0];
            if (name.equals("hashCode")) return System.identityHashCode(proxy);
            if (name.equals("toString")) return "APEFluidObserver";
            if (closed) return defaultValue(method.getReturnType());
            long now = SystemClock.elapsedRealtime();
            try {
                if (name.equals("onVideoFrameAboutToBeRendered")) {
                    frameCount++; guard.onFrame(now);
                    if (firstFrameDelayMs < 0) firstFrameDelayMs = now - startedAt;
                } else if (name.equals("onPlayerError")) {
                    errorState = true; guard.setPlaybackState(PlaybackGuard.State.ERROR, now);
                    FluidStore.event(context, "PLAYER_ERROR", "error_de_reproduccion");
                } else if (name.equals("onPlaybackStateChanged")) {
                    if (args != null && number(args[0]) == 3L) errorState = false;
                } else if (name.equals("onPositionDiscontinuity")) {
                    if (args != null && args.length > 0 && args[args.length - 1] instanceof Integer
                            && ((Integer) args[args.length - 1]).intValue() == 1) seekUntil = now + 2500;
                } else if (name.equals("onBandwidthEstimate") && args != null && args.length >= 4) {
                    long sample = number(args[3]); if (sample > 0) measuredBandwidthBps = sample;
                } else if (name.equals("onDroppedVideoFrames") && args != null && args.length >= 2) {
                    droppedFrames += Math.max(0, ((Number) args[1]).intValue());
                }
            } catch (Exception ignored) { }
            return defaultValue(method.getReturnType());
        }

        private void updateFormat(Object format) {
            try {
                Class<?> api = type("androidx.media3.common.Format");
                width = Math.max(0, api.getField("width").getInt(format));
                height = Math.max(0, api.getField("height").getInt(format));
                Object mime = api.getField("sampleMimeType").get(format);
                videoCodec = mime == null ? "desconocido" : mime.toString();
                current.width = width; current.height = height; current.codec = videoCodec;
                long bitrate = api.getField("bitrate").getInt(format);
                if (bitrate > 0) current.bitrateBps = bitrate;
                Object color = api.getField("colorInfo").get(format);
                current.hdr = false;
                if (color != null) {
                    int transfer = color.getClass().getField("colorTransfer").getInt(color);
                    current.hdr = transfer == 6 || transfer == 7;
                }
            } catch (Exception ignored) { }
        }

        private void applyTrackLimit() {
            try {
                Object parameters = get(player, PLAYER, "getTrackSelectionParameters");
                Object builder = get(parameters, "androidx.media3.common.TrackSelectionParameters", "buildUpon");
                String api = "androidx.media3.common.TrackSelectionParameters$Builder";
                call(api, builder, "setMaxVideoSize", new Class<?>[]{int.class, int.class}, capabilities.maxWidth, capabilities.maxHeight);
                Object updated = get(builder, api, "build");
                call(PLAYER, player, "setTrackSelectionParameters", new Class<?>[]{type("androidx.media3.common.TrackSelectionParameters")}, updated);
            } catch (Exception ex) { FluidStore.event(context, "TRACK_LIMIT_UNAVAILABLE", ex.getClass().getSimpleName()); }
        }

        @Override public void run() {
            if (closed) return;
            try {
                long now = SystemClock.elapsedRealtime();
                int state = ((Number) get(player, PLAYER, "getPlaybackState")).intValue();
                boolean wantsPlay = (Boolean) get(player, PLAYER, "getPlayWhenReady");
                int suppression = ((Number) get(player, PLAYER, "getPlaybackSuppressionReason")).intValue();
                long position = number(get(player, PLAYER, "getCurrentPosition"));
                long buffer = Math.max(0L, number(get(player, PLAYER, "getTotalBufferedDuration")));
                PlaybackGuard.State next;
                if (!wantsPlay || stopped || suppression != 0) next = PlaybackGuard.State.PAUSED;
                else if (errorState) next = PlaybackGuard.State.ERROR;
                else if (state == 4) next = PlaybackGuard.State.ENDED;
                else if (seekUntil > now) next = PlaybackGuard.State.SEEKING;
                else if (state == 2) next = PlaybackGuard.State.BUFFERING;
                else if (state == 3) next = PlaybackGuard.State.PLAYING;
                else next = PlaybackGuard.State.STARTING;
                guard.setPlaybackState(next, now);
                guard.onProgress(position, buffer, now);
                if (state == 3 && frameListenerAttached) {
                    Object format = get(player, EXO, "getVideoFormat");
                    guard.setExpectVideo(format != null, now);
                    if (format != null) updateFormat(format);
                }
                PlaybackGuard.Action action = automaticRecovery ? guard.evaluate(now) : null;
                if (action != null && action.kind != PlaybackGuard.Kind.NONE) recover(action);
                if (!stopped && next == PlaybackGuard.State.PLAYING) checkImageLoad(now);
                if (now - lastReport >= 10000L || lastReport == 0) {
                    lastReport = now; report(now, position, buffer, next);
                }
            } catch (Exception ex) {
                FluidStore.event(context, "MONITOR_ERROR", ex.getClass().getSimpleName());
            } finally { if (!closed) handler.postDelayed(this, 500L); }
        }

        private void recover(PlaybackGuard.Action action) {
            FluidStore.event(context, "RECOVERY", action.kind.name() + ":" + action.cause.name() + ":" + action.attempt);
            if (action.kind == PlaybackGuard.Kind.STOP_RETRYING) {
                stopped = true;
                try { call(PLAYER, player, "setPlayWhenReady", new Class<?>[]{boolean.class}, false); } catch (Exception ignored) { }
                notice("Se agotaron los reintentos. Vuelve al panel para revisar la fuente o reintentar.");
                return;
            }
            if (action.cause == PlaybackGuard.Cause.VIDEO_STALL) reduceImage();
            FluidStore.Variant next = current;
            if (action.kind == PlaybackGuard.Kind.TRY_SAME_CHANNEL) {
                failed.add(current.id);
                FluidPolicy.Decision choice = choose(null, "");
                if (choice.selected != null) next = variant(choice.selected.id);
                // With no safe alternative, bounded reprepare of the same source remains allowed.
            }
            try {
                boolean alternative = next != current;
                prepare(next, alternative);
                notice(alternative ? "Recuperación: respaldo del mismo canal" : "Recuperación: reintentando la fuente actual");
            } catch (Exception ex) {
                errorState = true; guard.setPlaybackState(PlaybackGuard.State.ERROR, SystemClock.elapsedRealtime());
                FluidStore.event(context, "RECOVERY_FAILED", ex.getClass().getSimpleName());
            }
        }

        private void checkImageLoad(long now) {
            if (qualityWindowAt == 0) { qualityWindowAt = now; qualityFrameCount = frameCount; qualityDroppedAt = droppedFrames; return; }
            if (now - qualityWindowAt < 5000L) return;
            long frames = frameCount - qualityFrameCount;
            int dropped = droppedFrames - qualityDroppedAt;
            if (frames >= 30 && dropped >= 12 && dropped > frames / 10L) reduceImage();
            qualityWindowAt = now; qualityFrameCount = frameCount; qualityDroppedAt = droppedFrames;
        }

        private void reduceImage() {
            if (imageReduced || !"crystal_uhd".equals(FluidStore.prefs(context).getString("image_profile", "crystal_uhd"))) return;
            try {
                call(EXO, player, "setVideoEffects", new Class<?>[]{List.class}, effectsFor(context, "lite"));
                imageReduced = true;
                FluidStore.event(context, "IMAGE_PROFILE_REDUCED", "crystal_uhd_to_lite_after_render_pressure");
                notice("Se redujo el filtro de imagen para priorizar la fluidez de esta sesión.");
            } catch (Exception ex) { FluidStore.event(context, "IMAGE_REDUCTION_FAILED", ex.getClass().getSimpleName()); }
        }

        private FluidPolicy.Decision choose(FluidPolicy.Directive directive, String keepId) {
            List<FluidPolicy.Stream> input = new ArrayList<FluidPolicy.Stream>();
            for (FluidStore.Variant value : variants) input.add(new FluidPolicy.Stream(value.id, value.channelId,
                    value.codec, value.width, value.height, value.bitrateBps, value.hdr, false, failed.contains(value.id)));
            return policy.select(input, current.channelId, keepId, capabilities, measuredBandwidthBps, directive, SystemClock.elapsedRealtime());
        }

        private FluidStore.Variant variant(String id) {
            for (FluidStore.Variant value : variants) if (value.id.equals(id) && value.channelId.equals(current.channelId)) return value;
            return current;
        }

        private void prepare(FluidStore.Variant next, boolean alternative) throws Exception {
            long oldPosition = number(get(player, PLAYER, "getCurrentPosition"));
            boolean isLive = false;
            try { isLive = (Boolean) get(player, PLAYER, "isCurrentMediaItemLive"); } catch (Exception ignored) { }
            call(PLAYER, player, "stop", new Class<?>[0]);
            String api = "androidx.media3.datasource.DefaultHttpDataSource$Factory";
            Object upstream = create(api, new Class<?>[0]);
            call(api, upstream, "setUserAgent", new Class<?>[]{String.class}, next.ua == null || next.ua.isEmpty() ? "APE-Fluid/2.4.0" : next.ua);
            call(api, upstream, "setAllowCrossProtocolRedirects", new Class<?>[]{boolean.class}, true);
            Object factory = hlsFactory(context, upstream);
            Object item = call("androidx.media3.common.MediaItem", null, "fromUri", new Class<?>[]{String.class}, next.url);
            Object source = call("androidx.media3.exoplayer.hls.HlsMediaSource$Factory", factory, "createMediaSource", new Class<?>[]{type("androidx.media3.common.MediaItem")}, item);
            call(EXO, player, "setMediaSource", new Class<?>[]{type("androidx.media3.exoplayer.source.MediaSource")}, source);
            current = next; errorState = false;
            guard.onStreamChanged(current.channelId, current.id, SystemClock.elapsedRealtime());
            startedAt = SystemClock.elapsedRealtime(); firstFrameDelayMs = -1;
            if (!isLive && !alternative && oldPosition > 0) call(PLAYER, player, "seekTo", new Class<?>[]{long.class}, oldPosition);
            call(PLAYER, player, "prepare", new Class<?>[0]);
            call(PLAYER, player, "setPlayWhenReady", new Class<?>[]{boolean.class}, true);
        }

        @Override public void onDirective(final JSONObject directive) {
            final long received = SystemClock.elapsedRealtime();
            handler.post(new Runnable() { public void run() {
                if (closed || stopped) return;
                try {
                    if (directive.optInt("schema", 0) != 1) return;
                    if (!(Boolean) get(player, PLAYER, "getPlayWhenReady")) return;
                    if (number(get(player, PLAYER, "getPlaybackSuppressionReason")) != 0) return;
                    int liveState = ((Number) get(player, PLAYER, "getPlaybackState")).intValue();
                    if (!errorState && liveState != 2) return;
                    String channel = directive.optString("channel_id", "");
                    String preferred = directive.optString("preferred_stream_id", "");
                    long ttl = directive.optLong("ttl_ms", 0);
                    FluidPolicy.Directive request = new FluidPolicy.Directive(preferred, channel, received, ttl);
                    FluidPolicy.Decision choice = choose(request, current.id);
                    if (!choice.directiveApplied || choice.selected == null || choice.selected.id.equals(current.id)) return;
                    long now = SystemClock.elapsedRealtime();
                    // Remote preferences do not interrupt healthy playback or cause channel oscillation.
                    if (now - lastDirectiveSwitch < 30000L || !(errorState || guard.getState() == PlaybackGuard.State.BUFFERING)) return;
                    lastDirectiveSwitch = now;
                    prepare(variant(choice.selected.id), true);
                    FluidStore.event(context, "DIRECTIVE_APPLIED", channel + "/" + preferred);
                } catch (Exception ex) { FluidStore.event(context, "DIRECTIVE_REJECTED", ex.getClass().getSimpleName()); }
            }});
        }

        private void report(long now, long position, long buffer, PlaybackGuard.State state) {
            try {
                JSONObject data = new JSONObject().put("schema", 1).put("channel_id", current.channelId).put("stream_id", current.id)
                        .put("position_ms", Math.max(0, position)).put("buffer_ms", buffer)
                        .put("state", state.name().equals("STARTING") || state.name().equals("SEEKING") ? "RECOVERING" : state.name())
                        .put("frame_callbacks", frameCount).put("dropped_frames", droppedFrames)
                        .put("first_frame_ms", firstFrameDelayMs).put("recovery_attempts", guard.getRecoveryAttempts());
                if (measuredBandwidthBps > 0) data.put("bandwidth_bps", measuredBandwidthBps);
                JSONArray codecs = new JSONArray(); for (String codec : capabilities.codecs) codecs.put(codec);
                data.put("capabilities", new JSONObject().put("codecs", codecs).put("max_width", capabilities.maxWidth)
                        .put("max_height", capabilities.maxHeight).put("supports_hdr", capabilities.hdrSupported));
                SharedPreferences settings = FluidStore.prefs(context);
                String imageInfo = !settings.getBoolean("enhance_enabled", true) ? "desactivado"
                        : imageReduced ? "ligero por carga" : settings.getString("image_profile", "crystal_uhd");
                if (!imageReduced && settings.getBoolean("enhance_enabled", true) && imageInfo.startsWith("crystal_")) {
                    if (settings.getBoolean("crystal_hdr_passthrough", false)) imageInfo += " · HDR sin filtro SDR";
                    else if (settings.getInt("crystal_input_width", 0) == width && settings.getInt("crystal_input_height", 0) == height)
                        imageInfo += " · textura " + settings.getInt("crystal_output_width", 0) + " × " + settings.getInt("crystal_output_height", 0);
                }
                String text = "Canal: " + current.channelId + " · variante: " + current.id
                        + "\nEstado: " + state.name() + "\nBuffer medido: " + buffer + " ms"
                        + "\nFormato observado: " + width + " × " + height + " · " + videoCodec
                        + "\nPrimer frame programado: " + (firstFrameDelayMs < 0 ? "pendiente" : firstFrameDelayMs + " ms")
                        + "\nCallbacks de video: " + frameCount + " · descartados: " + droppedFrames
                        + "\nReintentos del incidente: " + guard.getRecoveryAttempts() + "/3"
                        + "\nAncho de banda estimado: " + (measuredBandwidthBps > 0 ? measuredBandwidthBps + " bps" : "sin muestra")
                        + "\nControl remoto: " + (control == null ? "apagado" : "configurado")
                        + "\nPerfil de imagen: " + imageInfo
                        + "\nÚltima actualización: " + new java.util.Date().toString();
                FluidStore.prefs(context).edit().putString("last_report", text).apply();
                if (control != null) control.exchange(data);
            } catch (Exception ignored) { }
        }

        private void notice(final String message) {
            MAIN.post(new Runnable() { public void run() { Toast.makeText(context, message, Toast.LENGTH_LONG).show(); }});
        }

        void close() {
            closed = true; handler.removeCallbacks(this);
            if (control != null) control.close();
            try { if (playerListener != null) call(PLAYER, player, "removeListener", new Class<?>[]{type("androidx.media3.common.Player$Listener")}, playerListener); } catch (Exception ignored) { }
            try { if (frameListener != null) call(EXO, player, "clearVideoFrameMetadataListener", new Class<?>[]{type("androidx.media3.exoplayer.video.VideoFrameMetadataListener")}, frameListener); } catch (Exception ignored) { }
            try { if (analyticsListener != null) call(EXO, player, "removeAnalyticsListener", new Class<?>[]{type("androidx.media3.exoplayer.analytics.AnalyticsListener")}, analyticsListener); } catch (Exception ignored) { }
            FluidStore.event(context, "SESSION_CLOSED", current.channelId + "/" + current.id);
        }
    }
}
