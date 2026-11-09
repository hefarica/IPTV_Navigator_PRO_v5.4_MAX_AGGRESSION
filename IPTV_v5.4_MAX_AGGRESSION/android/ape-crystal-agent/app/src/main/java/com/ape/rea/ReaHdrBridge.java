package com.ape.rea;

import android.content.Context;
import android.content.SharedPreferences;
import android.opengl.EGL14;
import android.opengl.EGLDisplay;
import android.os.Build;
import android.view.Display;
import android.view.WindowManager;
import androidx.media3.common.C;
import androidx.media3.common.ColorInfo;
import androidx.media3.common.VideoFrameProcessingException;
import androidx.media3.common.VideoFrameProcessor;
import androidx.media3.common.util.GlProgram;
import java.lang.ref.WeakReference;
import java.lang.reflect.Method;

/** Media3 1.3.1 SDR surface input -> FP16 linear BT.2020 -> native final PQ OETF.
 * The request is conditional. Display output and frame rate require a real Android device.
 */
public final class ReaHdrBridge {
    private static final String PREFS = "ape_fluid";
    private static final String PQ_EXTENSION = "EGL_EXT_gl_colorspace_bt2020_pq";
    private static volatile WeakReference<Context> playbackContext = new WeakReference<Context>(null);
    public static volatile String lastDecision = "not_initialized";

    private ReaHdrBridge() {}

    public static void setPlaybackContext(Context context) {
        playbackContext = new WeakReference<Context>(context);
    }

    public static ColorInfo chooseOutput(Context context, ColorInfo source, ColorInfo originalOutput) {
        if (context == null || originalOutput == null) return originalOutput;
        try {
            SharedPreferences p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            if (ColorInfo.isTransferHdr(source)) {
                record(p, "native_hdr", "original_hdr_route_preserved");
                return originalOutput;
            }
            if (ReaBridge.isBypassed(context) || p.getBoolean("rea_session_bypass", false)
                    || !p.getBoolean("enhance_enabled", true)
                    || "natural".equals(p.getString("image_profile", "balanced"))) {
                record(p, "sdr", "enhancement_disabled_or_recovery");
                return originalOutput;
            }
            if (!p.getBoolean("hdr_expand_enabled", true)) {
                record(p, "sdr", "expansion_disabled");
                return originalOutput;
            }
            // Deliberately use the original Format.colorInfo, before Media3 SDR canonicalization.
            if (!isRecognizedSdr(source)) {
                record(p, "sdr", "source_color_not_bt709_smpte170m");
                return originalOutput;
            }
            // Media3 1.3.1's own PQ surface gate remains intact.
            if (Build.VERSION.SDK_INT < 33) {
                record(p, "sdr", "media3_pq_gl_requires_api33");
                return originalOutput;
            }
            if (!displaySupportsPq(context)) {
                record(p, "sdr", "current_display_mode_has_no_hdr10");
                return originalOutput;
            }
            if (!hasPqEglExtension()) {
                record(p, "sdr", "egl_bt2020_pq_unavailable");
                return originalOutput;
            }
            ColorInfo result = new ColorInfo.Builder()
                    .setColorSpace(C.COLOR_SPACE_BT2020)
                    .setColorRange(C.COLOR_RANGE_FULL)
                    .setColorTransfer(C.COLOR_TRANSFER_ST2084)
                    .setHdrStaticInfo(null)
                    .setLumaBitdepth(10).setChromaBitdepth(10).build();
            record(p, "sdr_to_pq_requested", "qualified_api33_display_and_egl");
            return result;
        } catch (Exception error) {
            lastDecision = "sdr:capability_check_failed:" + error.getClass().getSimpleName();
            return originalOutput;
        } catch (LinkageError error) {
            lastDecision = "sdr:capability_api_unavailable";
            return originalOutput;
        }
    }

    public static boolean isRecognizedSdr(ColorInfo input) {
        return input != null && input.colorSpace == C.COLOR_SPACE_BT709
                && input.colorTransfer == C.COLOR_TRANSFER_SDR
                && (input.colorRange == C.COLOR_RANGE_FULL || input.colorRange == C.COLOR_RANGE_LIMITED);
    }

    public static boolean isSdrToPq(ColorInfo input, ColorInfo output, boolean transfers) {
        return transfers && isRecognizedSdr(input) && output != null
                && output.colorSpace == C.COLOR_SPACE_BT2020
                && output.colorTransfer == C.COLOR_TRANSFER_ST2084
                && output.colorRange == C.COLOR_RANGE_FULL;
    }

    public static boolean isSdrToHdrLinear(ColorInfo input, ColorInfo output, boolean transfers) {
        return transfers && isRecognizedSdr(input) && output != null
                && output.colorSpace == C.COLOR_SPACE_BT2020
                && output.colorTransfer == C.COLOR_TRANSFER_LINEAR
                && output.colorRange == C.COLOR_RANGE_FULL;
    }

    public static void assertInputType(int inputType, ColorInfo input, ColorInfo output)
            throws VideoFrameProcessingException {
        // Original Media3 HLG sampler supplies scene-linear values, not PQ absolute luminance.
        // Escalate to the app's complete native-player recovery instead of misinterpreting them.
        if (input != null && output != null && input.colorTransfer == C.COLOR_TRANSFER_HLG
                && output.colorTransfer == C.COLOR_TRANSFER_ST2084) {
            throw new VideoFrameProcessingException("REA HLG requires direct native playback.");
        }
        if (isSdrToPq(input, output, true) && inputType != VideoFrameProcessor.INPUT_TYPE_SURFACE) {
            throw new VideoFrameProcessingException("REA SDR to PQ requires decoder Surface input.");
        }
    }

    public static void configureSampler(GlProgram program, Context context) {
        SharedPreferences p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        float white = finitePreference(p, "hdr_reference_white_nits", 203f, 80f, 400f);
        float peak = finitePreference(p, "hdr_peak_nits", 600f, white, 4000f);
        float strength = finitePreference(p, "hdr_expand_strength", 0.65f, 0f, 1f);
        program.setFloatUniform("uPaperWhiteNits", white);
        program.setFloatUniform("uPeakNits", peak);
        program.setFloatUniform("uExpansion", strength);
        p.edit().putString("rea_hdr_stage", "linear_bt2020_sampler_configured")
                .putString("rea_hdr_status", "Conversión SDR a BT.2020 lineal configurada; salida PQ prevista. HDR físico por verificar.")
                .putFloat("rea_hdr_reference_white_nits", white)
                .putFloat("rea_hdr_peak_setting_nits", peak)
                .putFloat("rea_hdr_strength", strength).apply();
    }

    private static float finitePreference(SharedPreferences p, String key, float fallback, float min, float max) {
        Object value = p.getAll().get(key);
        float v = value instanceof Number ? ((Number) value).floatValue() : fallback;
        if (Float.isNaN(v) || Float.isInfinite(v)) v = fallback;
        return Math.max(min, Math.min(max, v));
    }

    private static boolean displaySupportsPq(Context context) throws Exception {
        Context active = playbackContext.get();
        if (active == null) active = context;
        Display display = null;
        if (Build.VERSION.SDK_INT >= 30) {
            try { display = active.getDisplay(); } catch (UnsupportedOperationException ignored) {}
        }
        if (display == null) {
            WindowManager manager = (WindowManager) active.getSystemService(Context.WINDOW_SERVICE);
            if (manager != null) display = manager.getDefaultDisplay();
        }
        if (display == null || !display.isValid()) return false;
        int[] types;
        if (Build.VERSION.SDK_INT >= 34) {
            // SDK34 mode-specific list prevents advertising an unsupported current HDMI mode.
            Method method = Display.Mode.class.getMethod("getSupportedHdrTypes");
            Object result = method.invoke(display.getMode());
            if (!(result instanceof int[])) return false;
            types = (int[]) result;
        } else {
            Display.HdrCapabilities caps = display.getHdrCapabilities();
            if (caps == null) return false;
            types = caps.getSupportedHdrTypes();
        }
        for (int type : types) {
            if (type == Display.HdrCapabilities.HDR_TYPE_HDR10 || type == 4 /* HDR10+ */) return true;
        }
        return false;
    }

    private static boolean hasPqEglExtension() {
        EGLDisplay display = EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY);
        if (display == null || display == EGL14.EGL_NO_DISPLAY) return false;
        String extensions = EGL14.eglQueryString(display, EGL14.EGL_EXTENSIONS);
        if (extensions == null) {
            EGL14.eglGetError();
            int[] version = new int[2];
            if (!EGL14.eglInitialize(display, version, 0, version, 1)) return false;
            extensions = EGL14.eglQueryString(display, EGL14.EGL_EXTENSIONS);
        }
        // Do not terminate this shared display: the active player may already own it.
        return extensions != null && (" " + extensions + " ").contains(" " + PQ_EXTENSION + " ");
    }

    private static void record(SharedPreferences p, String mode, String reason) {
        lastDecision = mode + ":" + reason;
        p.edit().putString("rea_hdr_mode", mode).putString("rea_hdr_reason", reason)
                .putString("rea_hdr_status", statusText(mode, reason))
                .putString("rea_hdr_stage", "output_contract_selected")
                .putBoolean("rea_hdr_output_observed", false).apply();
    }

    private static String statusText(String mode, String reason) {
        if ("native_hdr".equals(mode)) return "Fuente HDR: ruta original conservada; salida física por verificar.";
        if ("sdr_to_pq_requested".equals(mode)) return "Expansión SDR a HDR PQ solicitada; pantalla y EGL compatibles. Salida física por verificar.";
        if ("media3_pq_gl_requires_api33".equals(reason)) return "SDR: esta ruta PQ requiere Android 13 o posterior.";
        if ("source_color_not_bt709_smpte170m".equals(reason)) return "SDR: metadatos de color no aptos para esta conversión HDR.";
        if ("current_display_mode_has_no_hdr10".equals(reason)) return "SDR: el modo actual de pantalla no declara HDR10 compatible.";
        if ("egl_bt2020_pq_unavailable".equals(reason)) return "SDR: salida OpenGL BT.2020 PQ no disponible.";
        return "SDR: expansión HDR desactivada o en recuperación.";
    }
}
